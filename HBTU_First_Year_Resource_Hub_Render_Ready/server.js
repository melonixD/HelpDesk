const express = require("express");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const resourcesPath = path.join(__dirname, "data", "resources.json");
const pyqBankPath = path.join(__dirname, "data", "pyq-bank.json");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Very small in-memory rate limiter so one visitor can't burn the whole
// free Gemini quota. Resets on redeploy — fine for a small student site.
const practiceHits = new Map();
const PRACTICE_LIMIT = 20; // requests
const PRACTICE_WINDOW_MS = 60 * 60 * 1000; // per hour, per IP

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

function loadPyqBank() {
  if (!fs.existsSync(pyqBankPath)) return {};
  return JSON.parse(fs.readFileSync(pyqBankPath, "utf8"));
}

function pickSample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function buildPracticePrompt(subject, unitTitle, examples) {
  const exampleText = examples.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `You are generating exam practice questions for an engineering first-year student.

Subject: ${subject}
Unit: ${unitTitle}

Here are real previous-year exam questions (PYQs) from this unit:
${exampleText}

Generate 5 NEW practice questions that test the same underlying concepts as the examples above, at a similar difficulty and style, but are NOT copies or trivial rewordings of them. Include a mix of conceptual and numerical/derivation questions where the examples suggest that's appropriate. For each question, give a concise correct answer or worked solution.

Respond with ONLY valid JSON (no markdown fences, no commentary), in exactly this shape:
[{"question": "...", "answer": "..."}]`;
}

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(publicDir, {
  maxAge: "1h",
  etag: true,
  setHeaders(res, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if ([".html", ".js", ".css", ".json"].includes(extension)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  },
}));

function loadResources() {
  return JSON.parse(fs.readFileSync(resourcesPath, "utf8"));
}

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok", service: "HelpDesk" });
});

app.get("/api/resources", (req, res) => {
  res.set("Cache-Control", "no-store");
  const data = loadResources();
  const query = String(req.query.q || "").trim().toLowerCase();
  const type = String(req.query.type || "all").toLowerCase();
  const subject = String(req.query.subject || "all").toLowerCase();

  const subjects = data.subjects
    .filter((item) => subject === "all" || item.id === subject)
    .map((item) => ({
      ...item,
      resources: item.resources.filter((resource) => {
        const matchesType = type === "all" || resource.type === type;
        const haystack = `${item.name} ${item.shortName} ${resource.title} ${resource.description}`.toLowerCase();
        return matchesType && (!query || haystack.includes(query));
      }),
    }))
    .filter((item) => !query || item.resources.length > 0 || `${item.name} ${item.shortName}`.toLowerCase().includes(query));

  res.json({ ...data, subjects });
});

app.post("/api/practice/generate", async (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Practice mode isn't configured yet. Set GEMINI_API_KEY in the environment to enable it.",
    });
  }

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many practice requests right now. Try again in a bit." });
  }

  const pyqUrl = String(req.body?.pyqUrl || "");
  if (!pyqUrl) {
    return res.status(400).json({ error: "pyqUrl is required" });
  }

  const bank = loadPyqBank();
  const unitData = bank[pyqUrl];
  if (!unitData || !unitData.questions?.length) {
    return res.status(404).json({ error: "No PYQ text is available for this unit yet." });
  }

  const examples = pickSample(unitData.questions, Math.min(8, unitData.questions.length));
  const prompt = buildPracticePrompt(unitData.subject, unitData.unitTitle, examples);

  try {
    const response = await fetch(GEMINI_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini API error:", response.status, detail);
      const status = response.status === 429 ? 429 : 502;
      const message =
        status === 429
          ? "The free Gemini quota is exhausted for now. Try again later."
          : "Couldn't generate questions right now. Try again.";
      return res.status(status).json({ error: message });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let questions;
    try {
      questions = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse Gemini output:", cleaned);
      return res.status(502).json({ error: "Got a malformed response. Try generating again." });
    }

    res.json({
      subject: unitData.subject,
      unitNumber: unitData.unitNumber,
      unitTitle: unitData.unitTitle,
      questions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong generating questions." });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HelpDesk running on port ${PORT}`);
  });
}

module.exports = app;
