const resources = require("../../data/resources.json");
const pyqBank = require("../../data/pyq-bank.json");
const { readFinal } = require("./admin-uploads");

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const practiceHits = new Map();
const PRACTICE_LIMIT = 20;
const PRACTICE_WINDOW_MS = 60 * 60 * 1000;
const PRACTICE_BATCH_SIZE = 3;
const DEFAULT_GEMINI_TIMEOUT_MS = 22000;

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

function filterResources(params, sourceResources = resources) {
  const query = String((params && params.q) || "").trim().toLowerCase();
  const type = String((params && params.type) || "all").toLowerCase();
  const subject = String((params && params.subject) || "all").toLowerCase();
  const branchId = String((params && params.branch) || "all").toLowerCase();
  const semesterId = String((params && params.semester) || "all").toLowerCase();

  const branches = sourceResources.branches
    .filter((branch) => branchId === "all" || branch.id === branchId)
    .map((branch) => ({
      ...branch,
      semesters: branch.semesters.filter((semester) => semesterId === "all" || semester.id === semesterId),
    }));
  const restrictCollections = branchId !== "all" || semesterId !== "all";
  const referencedCollections = new Set(branches.flatMap((branch) =>
    branch.semesters.flatMap((semester) => semester.subjectIds)
  ));
  const collectionOrder = new Map(branches.flatMap((branch) =>
    branch.semesters.flatMap((semester) => semester.subjectIds)
  ).map((id, index) => [id, index]));
  const unitCollections = sourceResources.unitCollections.filter((collection) =>
    (!restrictCollections || referencedCollections.has(collection.id)) &&
    (subject === "all" || collection.id === subject) &&
    (!query || `${collection.name} ${collection.description} ${collection.units.map((unit) => unit.title).join(" ")}`.toLowerCase().includes(query))
  ).sort((left, right) => restrictCollections
    ? (collectionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (collectionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    : 0);

  const subjects = sourceResources.subjects
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

  return { ...sourceResources, branches, unitCollections, subjects };
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

Generate ${PRACTICE_BATCH_SIZE} NEW practice questions that test the same underlying concepts as the examples above, at a similar difficulty and style, but are NOT copies or trivial rewordings. Include conceptual and numerical or derivation questions whenever appropriate. Keep each answer concise so the full response is returned quickly. Give a correct answer or short worked solution for each question.

Return only a JSON array in this exact shape:
[{"question":"...","answer":"..."}]`;
}

function buildUploadedPracticePrompt(subject, unitTitle) {
  return `Read the attached previous-year-question PDF for this engineering course.

Subject: ${subject}
Unit: ${unitTitle}

Generate ${PRACTICE_BATCH_SIZE} NEW exam practice questions based only on concepts and difficulty represented in the PDF. Do not copy or trivially reword its questions. Include concise, correct worked answers and use equations or units where appropriate.

Return only a JSON array in this exact shape:
[{"question":"...","answer":"..."}]`;
}

function getGeminiTimeoutMs() {
  const configured = Number(process.env.PRACTICE_API_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 1000 && configured <= 25000) {
    return Math.round(configured);
  }
  return DEFAULT_GEMINI_TIMEOUT_MS;
}

function fallbackQuestions(unitData, examples) {
  return examples.slice(0, PRACTICE_BATCH_SIZE).map((question) => ({
    question,
    answer: `This is a real ${unitData.subject} PYQ from ${unitData.unitTitle}. Use the relevant definition or governing equation, show each step clearly, and include units wherever required. The AI-generated solution is temporarily unavailable; retry later for a generated variant and solution.`,
  }));
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
  const model = String(process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();

  if (!apiKey) {
    return json(503, {
      error: "Practice mode is not configured yet. Add GEMINI_API_KEY in Netlify environment variables.",
    });
  }

  const body = readRequestBody(event);
  if (body === null) return json(400, { error: "Request body must be valid JSON." });

  const pyqUrl = String(body.pyqUrl || "").trim();
  if (!pyqUrl) return json(400, { error: "pyqUrl is required." });

  let unitData = pyqBank[pyqUrl];
  let uploadedPdf = null;
  if ((!unitData || !Array.isArray(unitData.questions) || !unitData.questions.length) && pyqUrl.startsWith("/uploads/")) {
    uploadedPdf = await readFinal(pyqUrl.slice("/uploads/".length));
    if (uploadedPdf && uploadedPdf.metadata.contentType === "application/pdf") {
      unitData = {
        subject: String(body.subjectTitle || "Uploaded subject").slice(0, 160),
        unitNumber: String(body.unitNumber || ""),
        unitTitle: String(body.unitTitle || "Selected unit").slice(0, 250),
        questions: [],
      };
    }
  }
  if (!unitData || ((!unitData.questions || !unitData.questions.length) && !uploadedPdf)) {
    return json(404, { error: "No PYQ text is available for this unit yet." });
  }

  const ip = getClientIp(event);
  if (isRateLimited(ip)) {
    return json(429, { error: "Too many practice requests right now. Try again in a bit." });
  }

  const examples = uploadedPdf ? [] : pickSample(unitData.questions, Math.min(8, unitData.questions.length));
  const prompt = uploadedPdf
    ? buildUploadedPracticePrompt(unitData.subject, unitData.unitTitle)
    : buildPracticePrompt(unitData.subject, unitData.unitTitle, examples);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGeminiTimeoutMs());

  try {
    console.log(`Practice generation started: model=${model}, unit=${unitData.unitNumber}`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: uploadedPdf ? [
          { inlineData: { mimeType: "application/pdf", data: uploadedPdf.data.toString("base64") } },
          { text: prompt },
        ] : [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          candidateCount: 1,
          maxOutputTokens: 1600,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            minItems: PRACTICE_BATCH_SIZE,
            maxItems: PRACTICE_BATCH_SIZE,
            items: {
              type: "OBJECT",
              properties: {
                question: { type: "STRING" },
                answer: { type: "STRING" },
              },
              required: ["question", "answer"],
            },
          },
          thinkingConfig: { thinkingLevel: "minimal" },
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
      if (uploadedPdf) return json(502, { error: "Gemini could not read this uploaded PYQ yet. Try again." });
      return json(200, {
        subject: unitData.subject,
        unitNumber: unitData.unitNumber,
        unitTitle: unitData.unitTitle,
        questions: fallbackQuestions(unitData, examples),
        source: "pyq-fallback",
      });
    }

    console.log(`Practice generation completed in ${Date.now() - startedAt} ms.`);
    return json(200, {
      subject: unitData.subject,
      unitNumber: unitData.unitNumber,
      unitTitle: unitData.unitTitle,
      questions,
      source: "gemini-3.6",
    });
  } catch (error) {
    const timedOut = error && (error.name === "AbortError" || error.name === "TimeoutError");
    console.error(
      `Practice generation ${timedOut ? "timed out" : "failed"} after ${Date.now() - startedAt} ms:`,
      error && error.message ? error.message : error
    );
    if (uploadedPdf) return json(502, { error: "Could not generate from this uploaded PYQ right now. Try again." });
    return json(200, {
      subject: unitData.subject,
      unitNumber: unitData.unitNumber,
      unitTitle: unitData.unitTitle,
      questions: fallbackQuestions(unitData, examples),
      source: "pyq-fallback",
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  filterResources,
  generatePractice,
  json,
  methodNotAllowed,
  parseQuestions,
  fallbackQuestions,
};
