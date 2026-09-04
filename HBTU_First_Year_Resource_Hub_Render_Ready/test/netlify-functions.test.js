const test = require("node:test");
const assert = require("node:assert/strict");

const health = require("../netlify/functions/health").handler;
const resources = require("../netlify/functions/resources").handler;
const practice = require("../netlify/functions/practice-generate").handler;
const notices = require("../netlify/functions/notices").handler;
const { parseNotices } = require("../netlify/lib/hbtu-feed");

test("Netlify health function is ready", async () => {
  const result = await health({ httpMethod: "GET" });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), {
    status: "ok",
    service: "HelpDesk",
    platform: "Netlify",
  });
});

test("Netlify resources function preserves API filtering", async () => {
  const result = await resources({
    httpMethod: "GET",
    queryStringParameters: { subject: "chemistry", type: "lecture", q: "spectroscopy" },
  });
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.subjects.length, 1);
  assert.equal(body.subjects[0].resources.length, 1);
  assert.equal(body.subjects[0].resources[0].id, "chem-spectroscopy");
  assert.equal(body.branches.length, 14);
});

test("HBTU notice parser keeps official announcement links", () => {
  const html = '<main><h2>Circulars &amp; Announcements</h2>' +
    '<a href="/academics-notice/new-calendar.pdf">Updated Academic Calendar | NEW</a>' +
    '<a href="https://hbtu.ac.in/DSW-Circular/hostel.pdf"><span>Hostel allotment schedule</span></a>' +
    '<a href="https://example.com/not-a-notice.pdf">External item</a>' +
    '<h2>Useful Links</h2></main>';
  const result = parseNotices(html);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, "Updated Academic Calendar");
  assert.equal(result[0].category, "Academic");
  assert.equal(result[0].isNew, true);
  assert.match(result[1].url, /^https:\/\/hbtu\.ac\.in\//);
});

test("Netlify notices function returns a durable cached live feed", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(
    '<h2>Circulars &amp; Announcements</h2>' +
    '<a href="/academics-notice/a.pdf">Academic Calendar 2026–27 | NEW</a>' +
    '<a href="/DSW-Circular/b.pdf">Hostel Allotment Process</a>' +
    '<a href="/notice/c.pdf">University Faculty Seniority List</a>' +
    '<h2>Useful Links</h2>',
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
  try {
    const result = await notices({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.source, "live");
    assert.equal(body.notices.length, 3);
    assert.match(result.headers["Netlify-CDN-Cache-Control"], /durable/);
    assert.match(result.headers["Netlify-CDN-Cache-Control"], /max-age=1800/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Netlify notices function falls back safely when HBTU is unavailable", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => { throw new Error("offline"); };
  try {
    const result = await notices({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.source, "fallback");
    assert.ok(body.notices.length >= 5);
    assert.ok(body.notices.every((notice) => notice.url.startsWith("https://hbtu.ac.in/")));
  } finally {
    global.fetch = previousFetch;
  }
});

test("Netlify practice function reports missing configuration clearly", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const result = await practice({
    httpMethod: "POST",
    body: JSON.stringify({
      pyqUrl: "/resources/pyqs/engineering-chemistry/Engineering_Chemistry_Unit_1_PYQs.pdf",
    }),
    headers: {},
  });
  if (previous) process.env.GEMINI_API_KEY = previous;
  assert.equal(result.statusCode, 503);
  assert.match(JSON.parse(result.body).error, /GEMINI_API_KEY/);
});

test("Netlify practice function verifies the PYQ bank before calling Gemini", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  const result = await practice({
    httpMethod: "POST",
    body: JSON.stringify({ pyqUrl: "/resources/pyqs/not-present.pdf" }),
    headers: {},
  });
  if (previous) process.env.GEMINI_API_KEY = previous;
  else delete process.env.GEMINI_API_KEY;
  assert.equal(result.statusCode, 404);
  assert.match(JSON.parse(result.body).error, /No PYQ text/);
});

test("Netlify practice function returns usable Gemini questions", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const previousFetch = global.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  delete process.env.GEMINI_MODEL;
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify([
            { question: "Practice question 1", answer: "Answer 1" },
            { question: "Practice question 2", answer: "Answer 2" },
            { question: "Practice question 3", answer: "Answer 3" },
            { question: "Practice question 4", answer: "Answer 4" },
            { question: "Practice question 5", answer: "Answer 5" },
          ]),
        }],
      },
    }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await practice({
      httpMethod: "POST",
      body: JSON.stringify({
        pyqUrl: "/resources/pyqs/engineering-chemistry/Engineering_Chemistry_Unit_1_PYQs.pdf",
      }),
      headers: { "x-forwarded-for": "192.0.2.10" },
    });
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.questions.length, 5);
    assert.equal(body.questions[0].question, "Practice question 1");
    assert.match(requestedUrl, /models\/gemini-3\.6-flash:generateContent/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.GEMINI_API_KEY = previousKey;
    else delete process.env.GEMINI_API_KEY;
    if (previousModel) process.env.GEMINI_MODEL = previousModel;
    else delete process.env.GEMINI_MODEL;
  }
});

test("Netlify practice function falls back instead of failing when Gemini is unavailable", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = global.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };

  try {
    const result = await practice({
      httpMethod: "POST",
      body: JSON.stringify({
        pyqUrl: "/resources/pyqs/engineering-chemistry/Engineering_Chemistry_Unit_1_PYQs.pdf",
      }),
      headers: { "x-forwarded-for": "192.0.2.11" },
    });
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.source, "pyq-fallback");
    assert.equal(body.questions.length, 3);
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.GEMINI_API_KEY = previousKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("replacement Electronics PYQs remain available to Practice Mode", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = global.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  global.fetch = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };
  try {
    for (const unit of [1, 2, 3, 4, 5]) {
      const result = await practice({
        httpMethod: "POST",
        body: JSON.stringify({
          pyqUrl: `/resources/pyqs/basic-electronics/Basic_Electronics_Unit_${unit}_PYQs.pdf`,
        }),
        headers: { "x-forwarded-for": `192.0.2.${20 + unit}` },
      });
      const body = JSON.parse(result.body);
      assert.equal(result.statusCode, 200);
      assert.equal(body.subject, "Basic Electronics Engineering");
      assert.equal(body.unitNumber, unit);
      assert.equal(body.questions.length, 3);
    }
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.GEMINI_API_KEY = previousKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("both semesters expose PYQ-backed Practice subjects", async () => {
  const result = await resources({ httpMethod: "GET", queryStringParameters: {} });
  const body = JSON.parse(result.body);
  for (const semester of ["1", "2"]) {
    const subjectIds = new Set(body.branches.flatMap((branch) => branch.semesterSubjectIds[semester] || []));
    const practiceSubjects = body.unitCollections.filter((subject) =>
      subjectIds.has(subject.id) && subject.units.some((unit) => unit.pyqUrl)
    );
    assert.deepEqual(
      practiceSubjects.map((subject) => subject.id).sort(),
      ["bem", "bet", "chemistry", "pc"]
    );
  }
});

test("Netlify functions reject unsupported methods", async () => {
  const result = await resources({ httpMethod: "POST", queryStringParameters: {} });
  assert.equal(result.statusCode, 405);
  assert.equal(result.headers.Allow, "GET");
});
