const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const adminStatePath = path.join(os.tmpdir(), `helpdesk-admin-state-${process.pid}-${Date.now()}.json`);
const adminDraftPath = path.join(os.tmpdir(), `helpdesk-admin-drafts-${process.pid}-${Date.now()}.json`);
const publishedContentPath = path.join(os.tmpdir(), `helpdesk-published-content-${process.pid}-${Date.now()}.json`);
process.env.ADMIN_STATE_PATH = adminStatePath;
process.env.ADMIN_DRAFT_PATH = adminDraftPath;
process.env.PUBLISHED_CONTENT_PATH = publishedContentPath;
process.env.HELPDESK_LOCAL_STORAGE = "true";
test.after(async () => { await Promise.all([fs.unlink(adminStatePath).catch(() => {}), fs.unlink(adminDraftPath).catch(() => {}), fs.unlink(publishedContentPath).catch(() => {})]); });

const health = require("../netlify/functions/health").handler;
const resources = require("../netlify/functions/resources").handler;
const practice = require("../netlify/functions/practice-generate").handler;
const notices = require("../netlify/functions/notices").handler;
const scholarships = require("../netlify/functions/scholarships").handler;
const { parseNotices } = require("../netlify/lib/hbtu-feed");
const { parseScholarships, SOURCES } = require("../netlify/lib/scholarship-feed");
const { connectNetlifyBlobs, isNetlifyRuntime } = require("../netlify/lib/netlify-runtime");

test("Netlify runtime detection recognizes the deployed Lambda file system", () => {
  const previousLocal = process.env.HELPDESK_LOCAL_STORAGE;
  const previousRoot = process.env.LAMBDA_TASK_ROOT;
  delete process.env.HELPDESK_LOCAL_STORAGE;
  process.env.LAMBDA_TASK_ROOT = "/var/task";
  assert.equal(isNetlifyRuntime(), true);
  if (previousRoot === undefined) delete process.env.LAMBDA_TASK_ROOT;
  else process.env.LAMBDA_TASK_ROOT = previousRoot;
  process.env.HELPDESK_LOCAL_STORAGE = previousLocal;
});

test("local tests do not require a Netlify Blobs connection", () => {
  assert.equal(connectNetlifyBlobs({ httpMethod: "GET" }), false);
});

test("Lambda-compatible Blob reads do not request an unavailable uncached endpoint", async () => {
  const files = ["admin-state.js", "admin-drafts.js", "feed-cache.js"];
  const sources = await Promise.all(files.map((file) => fs.readFile(path.resolve(__dirname, "../netlify/lib", file), "utf8")));
  sources.forEach((source) => assert.doesNotMatch(source, /consistency\s*:\s*["']strong["']/));
});

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
    assert.match(result.headers["Netlify-CDN-Cache-Control"], /max-age=14400/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("scholarship parser keeps only official scholarship announcements", () => {
  const source = SOURCES.find((item) => item.id === "hbtu");
  const html = '<a href="/academics-notice/up-scholarship.pdf">UP Scholarship correction window | NEW</a>' +
    '<a href="https://example.com/fake-scholarship">Fake Scholarship Offer</a>' +
    '<a href="/academic-calendar.pdf">Academic Calendar</a>';
  const result = parseScholarships(html, source);
  assert.equal(result.length, 1);
  assert.equal(result[0].organization, "Harcourt Butler Technical University");
  assert.match(result[0].url, /^https:\/\/hbtu\.ac\.in\//);
});

test("Netlify scholarship function pins UP Government and merges daily official updates", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.includes("hbtu.ac.in")) return new Response('<a href="/academics-notice/scholarship.pdf">HBTU Scholarship Verification Notice</a>', { status: 200 });
    if (address.includes("education.gov.in")) return new Response('<a href="/en/engineering-scholarship-2026">Engineering Scholarship Announcement 2026</a>', { status: 200 });
    return new Response('<a href="/student/schemes">National Scholarship Portal Student Schemes</a>', { status: 200 });
  };
  try {
    const result = await scholarships({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.source, "live");
    assert.equal(body.featured.id, "up-government-scholarship");
    assert.equal(body.featured.pinned, true);
    assert.match(body.featured.url, /^https:\/\/scholarship\.up\.gov\.in\//);
    assert.ok(body.scholarships.length >= 6);
    assert.match(result.headers["Netlify-CDN-Cache-Control"], /max-age=86400/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Netlify schedules notices every four hours and scholarships daily", async () => {
  const config = await fs.readFile(path.resolve(__dirname, "../netlify.toml"), "utf8");
  assert.match(config, /\[functions\."refresh-notices"\][\s\S]*schedule = "0 \*\/4 \* \* \*"/);
  assert.match(config, /\[functions\."refresh-scholarships"\][\s\S]*schedule = "30 18 \* \* \*"/);
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

test("both dynamic semesters expose PYQ-backed Practice subjects", async () => {
  const result = await resources({ httpMethod: "GET", queryStringParameters: {} });
  const body = JSON.parse(result.body);
  for (const semester of ["semester-1", "semester-2"]) {
    const subjectIds = new Set(body.branches.flatMap((branch) =>
      (branch.semesters.find((item) => item.id === semester) || { subjectIds: [] }).subjectIds
    ));
    const practiceSubjects = body.unitCollections.filter((subject) =>
      subjectIds.has(subject.id) && subject.units.some((unit) => unit.pyqUrl)
    );
    assert.deepEqual(
      practiceSubjects.map((subject) => subject.id).sort(),
      ["bem", "bet", "chemistry", "pc"]
    );
  }
});

test("resource filters support dynamic branch and semester ids", async () => {
  const result = await resources({
    httpMethod: "GET",
    queryStringParameters: { branch: "mechanical", semester: "semester-2" },
  });
  const body = JSON.parse(result.body);
  assert.equal(body.branches.length, 1);
  assert.equal(body.branches[0].semesters.length, 1);
  assert.equal(body.branches[0].semesters[0].id, "semester-2");
  assert.deepEqual(body.unitCollections.map((item) => item.id), body.branches[0].semesters[0].subjectIds);
});

test("admin endpoints reject unauthenticated writes", async () => {
  const save = require("../netlify/functions/admin-save").handler;
  const result = await save({ httpMethod: "POST", headers: {}, body: "{}" });
  assert.equal(result.statusCode, 401);
});

test("admin login rejects bad credentials", async () => {
  const bcrypt = require("bcryptjs");
  const login = require("../netlify/functions/admin-login").handler;
  const previous = [process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD_HASH, process.env.SESSION_SECRET];
  process.env.ADMIN_USERNAME = "test-admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct-test-password", 4);
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    const result = await login({
      httpMethod: "POST",
      body: JSON.stringify({ username: "test-admin", password: "incorrect" }),
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.91" },
    });
    assert.equal(result.statusCode, 401);
    assert.match(JSON.parse(result.body).error, /Invalid/);
  } finally {
    ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "SESSION_SECRET"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    });
  }
});

test("main admins can change their own password without a deployment", async () => {
  const bcrypt = require("bcryptjs");
  const login = require("../netlify/functions/admin-login").handler;
  const changePassword = require("../netlify/functions/admin-password").handler;
  const prior = Object.fromEntries([
    "MAIN_ADMINS_JSON", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "SESSION_SECRET",
  ].map((key) => [key, process.env[key]]));
  const restore = (key) => prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key];
  await fs.unlink(adminStatePath).catch(() => {});
  process.env.MAIN_ADMINS_JSON = JSON.stringify([{
    username: "password-test",
    name: "Password Test",
    passwordHash: bcrypt.hashSync("original-main-password", 4),
  }]);
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD_HASH;
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    const loginResult = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.201" },
      body: JSON.stringify({ username: "password-test", password: "original-main-password" }),
    });
    assert.equal(loginResult.statusCode, 200);
    const session = JSON.parse(loginResult.body);
    const cookie = loginResult.headers["Set-Cookie"].split(";")[0];
    const changed = await changePassword({
      httpMethod: "POST",
      headers: {
        cookie,
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "x-helpdesk-csrf": session.csrfToken,
      },
      body: JSON.stringify({
        currentPassword: "original-main-password",
        newPassword: "replacement-main-password",
        confirmPassword: "replacement-main-password",
      }),
    });
    assert.equal(changed.statusCode, 200);
    assert.equal(JSON.parse(changed.body).changed, true);
    assert.match(changed.headers["Set-Cookie"], /Max-Age=0/);
    const stored = await fs.readFile(adminStatePath, "utf8");
    assert.doesNotMatch(stored, /replacement-main-password/);
    assert.match(stored, /passwordHash/);

    const oldLogin = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.202" },
      body: JSON.stringify({ username: "password-test", password: "original-main-password" }),
    });
    assert.equal(oldLogin.statusCode, 401);
    const newLogin = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.203" },
      body: JSON.stringify({ username: "password-test", password: "replacement-main-password" }),
    });
    assert.equal(newLogin.statusCode, 200);
  } finally {
    Object.keys(prior).forEach(restore);
    await fs.unlink(adminStatePath).catch(() => {});
  }
});

test("main-admin drafts publish through Blobs without a GitHub commit or deployment", async () => {
  const bcrypt = require("bcryptjs");
  const login = require("../netlify/functions/admin-login").handler;
  const save = require("../netlify/functions/admin-save").handler;
  const publish = require("../netlify/functions/admin-publish").handler;
  const prior = { username: process.env.ADMIN_USERNAME, hash: process.env.ADMIN_PASSWORD_HASH, secret: process.env.SESSION_SECRET };
  process.env.ADMIN_USERNAME = "test-admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("test-password", 4);
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  await fs.unlink(publishedContentPath).catch(() => {});
  const loginResult = await login({
    httpMethod: "POST", body: JSON.stringify({ username: "test-admin", password: "test-password" }),
    headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.90" },
  });
  assert.equal(loginResult.statusCode, 200);
  const session = JSON.parse(loginResult.body);
  const cookie = loginResult.headers["Set-Cookie"].split(";")[0];
  try {
    const draftData = JSON.parse(JSON.stringify(require("../data/resources.json")));
    draftData.meta.description = "Published from the Blob-backed admin test.";
    const result = await save({
      httpMethod: "POST",
      body: JSON.stringify({ target: "resources", data: draftData }),
      headers: { cookie, host: "localhost:3000", origin: "http://localhost:3000", "x-helpdesk-csrf": session.csrfToken },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).deploying, false);
    assert.equal(JSON.parse(result.body).draft, true);
    const beforePublish = JSON.parse((await resources({ httpMethod: "GET", queryStringParameters: {} })).body);
    assert.notEqual(beforePublish.meta.description, draftData.meta.description);
    const published = await publish({
      httpMethod: "POST",
      body: JSON.stringify({ target: "resources", message: "Publish saved resources draft" }),
      headers: { cookie, host: "localhost:3000", origin: "http://localhost:3000", "x-helpdesk-csrf": session.csrfToken },
    });
    assert.equal(published.statusCode, 200);
    assert.equal(JSON.parse(published.body).deploying, false);
    assert.equal(JSON.parse(published.body).delivery, "netlify-blobs");
    const afterPublish = JSON.parse((await resources({ httpMethod: "GET", queryStringParameters: {} })).body);
    assert.equal(afterPublish.meta.description, draftData.meta.description);
  } finally {
    const restore = (key, value) => value === undefined ? delete process.env[key] : process.env[key] = value;
    restore("ADMIN_USERNAME", prior.username); restore("ADMIN_PASSWORD_HASH", prior.hash); restore("SESSION_SECRET", prior.secret);
    await fs.unlink(publishedContentPath).catch(() => {});
  }
});

test("all contributor changes stay drafted until a main admin explicitly publishes", async () => {
  const bcrypt = require("bcryptjs");
  const register = require("../netlify/functions/admin-register").handler;
  const login = require("../netlify/functions/admin-login").handler;
  const dataEndpoint = require("../netlify/functions/admin-data").handler;
  const management = require("../netlify/functions/admin-management").handler;
  const changeRequest = require("../netlify/functions/admin-change-request").handler;
  const scopedSave = require("../netlify/functions/admin-scoped-save").handler;
  const profile = require("../netlify/functions/admin-profile").handler;
  const changePassword = require("../netlify/functions/admin-password").handler;
  const directSave = require("../netlify/functions/admin-save").handler;
  const publish = require("../netlify/functions/admin-publish").handler;
  const prior = Object.fromEntries([
    "MAIN_ADMINS_JSON", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "SESSION_SECRET",
  ].map((key) => [key, process.env[key]]));
  const restore = (key) => prior[key] === undefined ? delete process.env[key] : process.env[key] = prior[key];
  await fs.unlink(adminStatePath).catch(() => {});
  await fs.unlink(adminDraftPath).catch(() => {});
  await fs.unlink(publishedContentPath).catch(() => {});
  process.env.MAIN_ADMINS_JSON = JSON.stringify([{
    username: "main-test",
    name: "Main Test",
    passwordHash: bcrypt.hashSync("main-test-password", 4),
  }]);
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD_HASH;
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";

  const authHeaders = (cookie, csrf) => ({
    cookie,
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "x-helpdesk-csrf": csrf,
  });

  try {
    const applicationResult = await register({
      httpMethod: "POST",
      headers: { "x-forwarded-for": "192.0.2.120" },
      body: JSON.stringify({
        name: "Regular Student",
        branch: "Mechanical Engineering",
        rollNumber: "240001",
        email: "regular.student@example.com",
      }),
    });
    assert.equal(applicationResult.statusCode, 201);
    const applicationId = JSON.parse(applicationResult.body).applicationId;

    const mainLoginResult = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.121" },
      body: JSON.stringify({ username: "main-test", password: "main-test-password" }),
    });
    assert.equal(mainLoginResult.statusCode, 200);
    const mainSession = JSON.parse(mainLoginResult.body);
    assert.equal(mainSession.role, "main");
    const mainCookie = mainLoginResult.headers["Set-Cookie"].split(";")[0];

    const approvalResult = await management({
      httpMethod: "POST",
      headers: authHeaders(mainCookie, mainSession.csrfToken),
      body: JSON.stringify({
        action: "approve-registration",
        registrationId: applicationId,
        username: "regular-test",
        password: "temporary-password",
        permissions: [{ branchId: "mechanical", semesterId: "semester-2" }],
      }),
    });
    assert.equal(approvalResult.statusCode, 200);

    const regularLoginResult = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.122" },
      body: JSON.stringify({ username: "regular-test", password: "temporary-password" }),
    });
    assert.equal(regularLoginResult.statusCode, 200);
    const regularSession = JSON.parse(regularLoginResult.body);
    assert.equal(regularSession.role, "regular");
    const regularCookie = regularLoginResult.headers["Set-Cookie"].split(";")[0];

    const scopedResult = await dataEndpoint({ httpMethod: "GET", headers: { cookie: regularCookie } });
    assert.equal(scopedResult.statusCode, 200);
    const scoped = JSON.parse(scopedResult.body);
    assert.equal(scoped.resources.branches.length, 1);
    assert.equal(scoped.resources.branches[0].id, "mechanical");
    assert.deepEqual(scoped.resources.branches[0].semesters.map((item) => item.id), ["semester-2"]);
    assert.equal(scoped.placements, null);
    assert.equal(scoped.notices, null);

    const forbiddenSave = await directSave({
      httpMethod: "POST",
      headers: authHeaders(regularCookie, regularSession.csrfToken),
      body: JSON.stringify({ target: "resources", data: scoped.resources }),
    });
    assert.equal(forbiddenSave.statusCode, 403);

    const branch = scoped.resources.branches[0];
    const semester = branch.semesters[0];
    const collections = scoped.resources.unitCollections.filter((item) => semester.subjectIds.includes(item.id));
    collections[0].description = `${collections[0].description} (reviewed test draft)`;
    const requestResult = await changeRequest({
      httpMethod: "POST",
      headers: authHeaders(regularCookie, regularSession.csrfToken),
      body: JSON.stringify({
        scope: { branchId: branch.id, semesterId: semester.id },
        summary: "Update one assigned subject description",
        proposal: { semester, unitCollections: collections },
      }),
    });
    assert.equal(requestResult.statusCode, 201);
    const requestId = JSON.parse(requestResult.body).requestId;

    const forbiddenScope = await changeRequest({
      httpMethod: "POST",
      headers: authHeaders(regularCookie, regularSession.csrfToken),
      body: JSON.stringify({
        scope: { branchId: "food-technology", semesterId: "semester-1" },
        summary: "Try an unassigned scope",
        proposal: { semester, unitCollections: collections },
      }),
    });
    assert.equal(forbiddenScope.statusCode, 403);

    const approvalDraftResult = await management({
      httpMethod: "POST",
      headers: authHeaders(mainCookie, mainSession.csrfToken),
      body: JSON.stringify({ action: "approve-change", requestId }),
    });
    assert.equal(approvalDraftResult.statusCode, 200);
    assert.equal(JSON.parse(approvalDraftResult.body).draft, true);
    assert.equal(JSON.parse(approvalDraftResult.body).deploying, false);

    const snapshotResult = await management({ httpMethod: "GET", headers: { cookie: mainCookie } });
    assert.equal(snapshotResult.statusCode, 200);
    const snapshot = JSON.parse(snapshotResult.body);
    assert.equal(snapshot.regularAdmins[0].passwordHash, undefined);
    assert.equal(snapshot.regularAdmins[0].coins, 1);
    assert.equal(snapshot.regularAdmins[0].contributions, 1);
    assert.equal(snapshot.changeRequests.find((item) => item.id === requestId).status, "approved-draft");
    const stagedDataResult = await dataEndpoint({ httpMethod: "GET", headers: { cookie: mainCookie } });
    const approvedResources = JSON.parse(stagedDataResult.body).resources;
    const approvedSemester = approvedResources.branches.find((item) => item.id === "mechanical").semesters.find((item) => item.id === "semester-2");
    const originalSubjectId = semester.subjectIds[0];
    assert.notEqual(approvedSemester.subjectIds[0], originalSubjectId);
    assert.ok(approvedResources.unitCollections.some((item) => item.id === originalSubjectId));
    assert.equal(approvedResources.unitCollections.find((item) => item.id === approvedSemester.subjectIds[0]).providedBy, "Regular Student");

    const profileResult = await profile({
      httpMethod: "POST",
      headers: authHeaders(regularCookie, regularSession.csrfToken),
      body: JSON.stringify({ photoUrl: "https://example.com/regular-student.webp" }),
    });
    assert.equal(profileResult.statusCode, 200);
    const community = JSON.parse(profileResult.body).community;
    assert.equal(community[0].photoUrl, "https://example.com/regular-student.webp");
    assert.equal(community[0].email, undefined);
    assert.equal(community[0].rollNumber, undefined);

    const promotionResult = await management({
      httpMethod: "POST",
      headers: authHeaders(mainCookie, mainSession.csrfToken),
      body: JSON.stringify({ action: "set-contributor-role", adminId: snapshot.regularAdmins[0].id, role: "branch" }),
    });
    assert.equal(promotionResult.statusCode, 200);

    const branchDataResult = await dataEndpoint({ httpMethod: "GET", headers: { cookie: regularCookie } });
    const branchData = JSON.parse(branchDataResult.body);
    assert.equal(branchData.role, "branch");
    const governedBranch = branchData.resources.branches[0];
    const governedSemester = governedBranch.semesters[0];
    const governedCollections = branchData.resources.unitCollections.filter((item) => governedSemester.subjectIds.includes(item.id));
    governedCollections[0].description = `${governedCollections[0].description} (branch admin draft)`;
    const branchDraftResult = await scopedSave({
      httpMethod: "POST",
      headers: authHeaders(regularCookie, regularSession.csrfToken),
      body: JSON.stringify({
        scope: { branchId: governedBranch.id, semesterId: governedSemester.id },
        summary: "Save an assigned attribute for deployment",
        proposal: { semester: governedSemester, unitCollections: governedCollections },
      }),
    });
    assert.equal(branchDraftResult.statusCode, 200);
    assert.equal(JSON.parse(branchDraftResult.body).draft, true);
    assert.equal(JSON.parse(branchDraftResult.body).deploying, false);

    const structuralSemester = { ...governedSemester, subjectIds: governedSemester.subjectIds.slice(1) };
    const structuralResult = await scopedSave({
      httpMethod: "POST",
      headers: authHeaders(regularCookie, regularSession.csrfToken),
      body: JSON.stringify({
        scope: { branchId: governedBranch.id, semesterId: governedSemester.id },
        summary: "Attempt a structural direct change",
        proposal: {
          semester: structuralSemester,
          unitCollections: governedCollections.filter((item) => structuralSemester.subjectIds.includes(item.id)),
        },
      }),
    });
    assert.equal(structuralResult.statusCode, 403);

    const finalSnapshotResult = await management({ httpMethod: "GET", headers: { cookie: mainCookie } });
    const finalSnapshot = JSON.parse(finalSnapshotResult.body);
    assert.equal(finalSnapshot.regularAdmins[0].role, "branch");
    assert.equal(finalSnapshot.regularAdmins[0].coins, 2);
    assert.equal(finalSnapshot.leaderboard[0].topContributor, true);
    assert.ok(finalSnapshot.changeRequests.some((item) => item.status === "drafted"));

    const explicitPublishResult = await publish({
      httpMethod: "POST",
      headers: authHeaders(mainCookie, mainSession.csrfToken),
      body: JSON.stringify({ target: "resources", message: "Publish reviewed resource draft" }),
    });
    assert.equal(explicitPublishResult.statusCode, 200);
    assert.equal(JSON.parse(explicitPublishResult.body).deploying, false);
    assert.equal(JSON.parse(explicitPublishResult.body).delivery, "netlify-blobs");
    const publishedSnapshotResult = await management({ httpMethod: "GET", headers: { cookie: mainCookie } });
    const publishedSnapshot = JSON.parse(publishedSnapshotResult.body);
    assert.ok(publishedSnapshot.changeRequests.filter((item) => [requestId, finalSnapshot.changeRequests.find((item) => item.status === "drafted").id].includes(item.id)).every((item) => item.status === "published"));

    const mainPromotionResult = await management({
      httpMethod: "POST",
      headers: authHeaders(mainCookie, mainSession.csrfToken),
      body: JSON.stringify({
        action: "promote-main-admin",
        adminId: finalSnapshot.regularAdmins[0].id,
      }),
    });
    assert.equal(mainPromotionResult.statusCode, 200);
    assert.equal(JSON.parse(mainPromotionResult.body).promoted, true);

    const promotedLoginResult = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.123" },
      body: JSON.stringify({ username: "regular-test", password: "temporary-password" }),
    });
    assert.equal(promotedLoginResult.statusCode, 200);
    const promotedSession = JSON.parse(promotedLoginResult.body);
    assert.equal(promotedSession.role, "main");
    const promotedCookie = promotedLoginResult.headers["Set-Cookie"].split(";")[0];

    const promotedDataResult = await dataEndpoint({ httpMethod: "GET", headers: { cookie: promotedCookie } });
    assert.equal(promotedDataResult.statusCode, 200);
    const promotedData = JSON.parse(promotedDataResult.body);
    assert.equal(promotedData.role, "main");
    assert.equal(promotedData.permissions, "all");
    assert.ok(promotedData.placements);

    const promotedManagementResult = await management({ httpMethod: "GET", headers: { cookie: promotedCookie } });
    assert.equal(promotedManagementResult.statusCode, 200);
    const promotedManagement = JSON.parse(promotedManagementResult.body);
    assert.ok(promotedManagement.mainAdmins.some((admin) => admin.username === "regular-test"));
    assert.ok(!promotedManagement.regularAdmins.some((admin) => admin.username === "regular-test"));
    assert.ok(promotedManagement.mainAdmins.every((admin) => admin.passwordHash === undefined));

    const promotedPasswordResult = await changePassword({
      httpMethod: "POST",
      headers: authHeaders(promotedCookie, promotedSession.csrfToken),
      body: JSON.stringify({
        currentPassword: "temporary-password",
        newPassword: "promoted-main-password",
        confirmPassword: "promoted-main-password",
      }),
    });
    assert.equal(promotedPasswordResult.statusCode, 200);
    const promotedNewLogin = await login({
      httpMethod: "POST",
      headers: { host: "localhost:3000", "x-forwarded-for": "192.0.2.124" },
      body: JSON.stringify({ username: "regular-test", password: "promoted-main-password" }),
    });
    assert.equal(promotedNewLogin.statusCode, 200);
    assert.equal(JSON.parse(promotedNewLogin.body).role, "main");
  } finally {
    Object.keys(prior).forEach(restore);
    await fs.unlink(adminStatePath).catch(() => {});
    await fs.unlink(adminDraftPath).catch(() => {});
    await fs.unlink(publishedContentPath).catch(() => {});
  }
});

test("admin UI and server enforce explicit draft/publish controls", async () => {
  const [html, script, control] = await Promise.all([
    fs.readFile(path.resolve(__dirname, "../public/admin/index.html"), "utf8"),
    fs.readFile(path.resolve(__dirname, "../public/admin/admin.js"), "utf8"),
    fs.readFile(path.resolve(__dirname, "../netlify/lib/admin-control.js"), "utf8"),
  ]);
  assert.match(html, /id="save-button"[^>]*>Save draft</);
  assert.match(html, /id="publish-button"[^>]*>Publish changes</);
  assert.match(script, /Fill in selected/);
  assert.match(script, /data-fill-target/);
  assert.match(script, /Remove one resource everywhere/);
  assert.match(script, /id="remove-resource-everywhere"/);
  assert.match(script, /findResourceMatches/);
  assert.match(script, /removeResourceMatches/);
  assert.match(script, /This will not publish automatically/);
  assert.match(script, /if \(state\.role !== "main"\) return/);
  assert.match(script, /public link could not be verified/);
  assert.match(script, /method: "HEAD"/);
  assert.match(script, /id="branch-picker"/);
  assert.match(script, /id="semester-picker"/);
  assert.match(script, /id="subject-picker"/);
  assert.match(script, /Upload PDFs/);
  assert.match(script, /multiple data-upload-books/);
  assert.match(script, /Quick add resource/);
  assert.match(script, /Netlify Blobs without starting a production deployment/);
  assert.match(script, /Add a unit or section/);
  assert.match(script, /Lab section/);
  assert.match(script, /Make main admin/);
  assert.match(script, /Change password/);
  assert.match(script, /\/api\/admin\/password/);
  assert.match(script, /Approve to draft/);
  assert.match(script, /Save contribution draft/);
  assert.doesNotMatch(script, /setTimeout\(saveChanges,\s*1200\)/);
  assert.doesNotMatch(control, /commitJson/);
});

test("Netlify builds accept private Blob-backed upload URLs", async () => {
  const buildScript = await fs.readFile(path.resolve(__dirname, "../scripts/prepare-netlify.js"), "utf8");
  assert.match(buildScript, /isBundledAsset/);
  assert.match(buildScript, /!String\(url\)\.startsWith\("\/uploads\/"\)/);
});

test("admin PDF uploads are validated, assembled and publicly readable", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const { acceptChunk, completeUpload, readFinal } = require("../netlify/lib/admin-uploads");
  const data = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const uploadId = `testupload${Date.now()}`;
  const common = { uploadId, name: "test.pdf", contentType: "application/pdf", size: data.length, totalChunks: 1 };
  await acceptChunk({ ...common, index: 0, data: data.toString("base64") });
  const completed = await completeUpload(common);
  const key = completed.url.slice("/uploads/".length);
  try {
    const stored = await readFinal(key);
    assert.ok(stored);
    assert.equal(stored.metadata.contentType, "application/pdf");
    assert.deepEqual(stored.data, data);
  } finally {
    await fs.unlink(path.join(__dirname, "../public/uploads", key)).catch(() => {});
  }
});

test("uploaded assets use permanent versioned keys and are not deleted when a field is replaced", async () => {
  const uploads = await fs.readFile(path.resolve(__dirname, "../netlify/lib/admin-uploads.js"), "utf8");
  assert.match(uploads, /ASSET_STORE_NAME = "helpdesk-public-assets"/);
  assert.match(uploads, /arrayBufferFrom\(data\)/);
  assert.match(uploads, /getWithMetadata\(key, \{ type: "arrayBuffer" \}\)/);
  assert.match(uploads, /saved\.data\.byteLength !== data\.length/);
  assert.match(uploads, /`\$\{type\.kind\}-v2-\$\{digest\}\$\{type\.extension\}`/);
  assert.doesNotMatch(uploads, /previous && previous\[1\] !== key/);
  assert.match(uploads, /\[TEMP_STORE_NAME, `asset:\$\{key\}`\]/);
});

test("Netlify functions reject unsupported methods", async () => {
  const result = await resources({ httpMethod: "POST", queryStringParameters: {} });
  assert.equal(result.statusCode, 405);
  assert.equal(result.headers.Allow, "GET");
});

test("published resources bypass browser and Netlify CDN caches", async () => {
  const result = await resources({ httpMethod: "GET", queryStringParameters: {} });
  assert.equal(result.statusCode, 200);
  assert.match(result.headers["Cache-Control"], /no-store/);
  assert.equal(result.headers["Netlify-CDN-Cache-Control"], "no-store");
});

test("Blob content uses immutable version keys instead of stale mutable reads", async () => {
  const [drafts, published] = await Promise.all([
    fs.readFile(path.resolve(__dirname, "../netlify/lib/admin-drafts.js"), "utf8"),
    fs.readFile(path.resolve(__dirname, "../netlify/lib/content-store.js"), "utf8"),
  ]);
  assert.match(drafts, /draft:\$\{target\}:v2:/);
  assert.match(drafts, /onlyIfNew:\s*true/);
  assert.match(published, /published:\$\{target\}:v2:/);
  assert.match(published, /onlyIfNew:\s*true/);
});

test("main site renders note fields added by admins without a legacy subject flag", async () => {
  const script = await fs.readFile(path.resolve(__dirname, "../public/app.js"), "utf8");
  assert.match(script, /subject\.splitNotes \|\| unit\.handwrittenNotesUrl \|\| unit\.masterNotesUrl/);
});

test("uploaded resource links bypass cached missing responses", async () => {
  const [assetFunction, app] = await Promise.all([
    fs.readFile(path.resolve(__dirname, "../netlify/functions/admin-asset.js"), "utf8"),
    fs.readFile(path.resolve(__dirname, "../public/app.js"), "utf8"),
  ]);
  assert.match(assetFunction, /"Cache-Control": "no-store, no-cache, must-revalidate"/);
  assert.match(assetFunction, /"Netlify-CDN-Cache-Control": "no-store"/);
  assert.match(app, /function openableResourceUrl/);
  assert.match(app, /startsWith\("\/uploads\/"\)/);
  assert.match(app, /asset=20260906/);
  assert.match(app, /data-pyq-url="' \+\s*escapeHtml\(material\.url\)/);
  assert.match(app, /href="' \+ escapeHtml\(openableResourceUrl\(material\.url\)\)/);
});
