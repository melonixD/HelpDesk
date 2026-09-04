const resources = require("../../data/resources.json");
const pyqBank = require("../../data/pyq-bank.json");

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const practiceHits = new Map();
const PRACTICE_LIMIT = 20;
const PRACTICE_WINDOW_MS = 60 * 60 * 1000;

function json(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...(extraHeaders || {}) },
    body: JSON.stringify(payload),
  };
}

function methodNotAllowed(allowed) {
  return json(405, { error: "Method not allowed." }, { Allow: allowed });
}

function filterResources(params) {
  const query = String((params && params.q) || "").trim().toLowerCase();
  const type = String((params && params.type) || "all").toLowerCase();
  const subject = String((params && params.subject) || "all").toLowerCase();

  const subjects = resources.subjects
    .filter((item) => subject === "all" || item.id === subject)
    .map((item) => ({
      ...item,
      resources: item.resources.filter((resource) => {
        const matchesType = type === "all" || resource.type === type;
        const haystack = `${item.name} ${item.shortName} ${resource.title} ${resource.description}`.toLowerCase();
        return matchesType && (!query || haystack.includes(query));
      }),
    }))
    .filter((item) =>
      !query ||
      item.resources.length > 0 ||
      `${item.name} ${item.shortName}`.toLowerCase().includes(query)
    );

  return { ...resources, subjects };
}

function readRequestBody(event) {
  if (!event || !event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function getClientIp(event) {
  const headers = (event && event.headers) || {};
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  return String(forwarded || headers["client-ip"] || "unknown").split(",")[0].trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = practiceHits.get(ip);
  if (!entry || now - entry.start > PRACTICE_WINDOW_MS) {
    practiceHits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > PRACTICE_LIMIT;
}

function pickSample(items, limit) {
  const copy = [...items];
  const sample = [];
  while (copy.length && sample.length < limit) {
    const index = Math.floor(Math.random() * copy.length);
    sample.push(copy.splice(index, 1)[0]);
  }
  return sample;
}

function buildPracticePrompt(subject, unitTitle, examples) {
  const exampleText = examples.map((question, index) => `${index + 1}. ${question}`).join("\n");
  return `You are generating exam practice questions for an engineering first-year student.

Subject: ${subject}
Unit: ${unitTitle}

Here are real previous-year exam questions (PYQs) from this unit:
${exampleText}

Generate 5 NEW practice questions that test the same underlying concepts as the examples above, at a similar difficulty and style, but are NOT copies or trivial rewordings. Include conceptual and numerical or derivation questions whenever appropriate. Give a concise correct answer or worked solution for each question.

Return only a JSON array in this exact shape:
[{"question":"...","answer":"..."}]`;
}

function parseQuestions(rawText) {
  const cleaned = String(rawText || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  const list = Array.isArray(parsed) ? parsed : parsed && parsed.questions;
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.question === "string" && item.question.trim())
    .map((item) => ({
      question: item.question.trim(),
      answer: typeof item.answer === "string" && item.answer.trim()
        ? item.answer.trim()
        : "Solution not provided.",
    }))
    .slice(0, 5);
}

async function generatePractice(event) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  if (!apiKey) {
    return json(503, {
      error: "Practice mode is not configured yet. Add GEMINI_API_KEY in Netlify environment variables.",
    });
  }

  const body = readRequestBody(event);
  if (body === null) return json(400, { error: "Request body must be valid JSON." });

  const pyqUrl = String(body.pyqUrl || "").trim();
  if (!pyqUrl) return json(400, { error: "pyqUrl is required." });

  const unitData = pyqBank[pyqUrl];
  if (!unitData || !Array.isArray(unitData.questions) || !unitData.questions.length) {
    return json(404, { error: "No PYQ text is available for this unit yet." });
  }

  const ip = getClientIp(event);
  if (isRateLimited(ip)) {
    return json(429, { error: "Too many practice requests right now. Try again in a bit." });
  }

  const examples = pickSample(unitData.questions, Math.min(8, unitData.questions.length));
  const prompt = buildPracticePrompt(unitData.subject, unitData.unitTitle, examples);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini API error:", response.status, detail.slice(0, 800));
      if (response.status === 429) {
        return json(429, { error: "The Gemini quota is exhausted for now. Try again later." });
      }
      return json(502, { error: "Could not generate questions right now. Try again." });
    }

    const data = await response.json();
    const rawText = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) || "[]";
    const questions = parseQuestions(rawText);

    if (!questions.length) {
      console.error("Gemini returned no usable questions:", String(rawText).slice(0, 800));
      return json(502, { error: "The generator returned an invalid response. Try again." });
    }

    return json(200, {
      subject: unitData.subject,
      unitNumber: unitData.unitNumber,
      unitTitle: unitData.unitTitle,
      questions,
    });
  } catch (error) {
    console.error("Practice generation failed:", error);
    return json(500, { error: "Something went wrong generating questions." });
  }
}

module.exports = {
  filterResources,
  generatePractice,
  json,
  methodNotAllowed,
  parseQuestions,
};
