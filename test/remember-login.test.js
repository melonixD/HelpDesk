const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "bcryptjs") return { compare: async () => true };
  if (request === "./admin-state") return { findMainPasswordOverride: async () => null, findRegularAdmin: async () => null };
  return originalLoad.call(this, request, parent, isMain);
};
process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough-123456";
process.env.MAIN_ADMINS_JSON = JSON.stringify([{ username: "admin", name: "Admin", passwordHash: "$2b$12$test" }]);
const { authenticate } = require("../netlify/lib/admin-auth");
Module._load = originalLoad;

function event(rememberMe) {
  return { headers: { host: "helpdeskhbtu.netlify.app" }, body: JSON.stringify({ username: "admin", password: "secret", rememberMe }) };
}
function payload(response) {
  const token = decodeURIComponent(response.headers["Set-Cookie"].match(/helpdesk_admin=([^;]+)/)[1]);
  return JSON.parse(Buffer.from(token.slice(0, token.lastIndexOf(".")), "base64url").toString("utf8"));
}

test("Remember me creates a secure 30-day HttpOnly session", async () => {
  const response = await authenticate(event(true));
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Set-Cookie"], /HttpOnly/);
  assert.match(response.headers["Set-Cookie"], /SameSite=Strict/);
  assert.match(response.headers["Set-Cookie"], /Secure/);
  assert.match(response.headers["Set-Cookie"], /Max-Age=2592000/);
  const session = payload(response);
  assert.equal(session.exp - session.iat, 30 * 24 * 60 * 60);
});

test("normal sign-in remains an eight-hour browser session", async () => {
  const response = await authenticate(event(false));
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(response.headers["Set-Cookie"], /Max-Age=/);
  const session = payload(response);
  assert.equal(session.exp - session.iat, 8 * 60 * 60);
});
