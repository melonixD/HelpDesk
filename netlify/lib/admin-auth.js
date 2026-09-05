const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { findRegularAdmin } = require("./admin-state");

const COOKIE_NAME = "helpdesk_admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;
const loginAttempts = new Map();

function header(event, name) {
  const headers = (event && event.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function clientIp(event) {
  return String(header(event, "x-forwarded-for") || header(event, "client-ip") || "unknown")
    .split(",")[0]
    .trim();
}

function parseBody(event) {
  if (!event || !event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function json(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(payload),
  };
}

function secret() {
  const value = String(process.env.SESSION_SECRET || "");
  return value.length >= 32 ? value : null;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(encoded, value) {
  return crypto.createHmac("sha256", value).update(encoded).digest("base64url");
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueSession(identity) {
  const signingSecret = secret();
  if (!signingSecret) throw new Error("Admin session is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: identity.username,
    name: identity.name || identity.username,
    role: identity.role,
    adminId: identity.id || null,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    csrf: crypto.randomBytes(24).toString("base64url"),
  };
  const encoded = encode(payload);
  return { token: `${encoded}.${sign(encoded, signingSecret)}`, payload };
}

function cookies(event) {
  return String(header(event, "cookie"))
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((result, part) => {
      const index = part.indexOf("=");
      if (index > 0) result[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return result;
    }, {});
}

function verifySession(event) {
  const signingSecret = secret();
  const token = cookies(event)[COOKIE_NAME];
  if (!signingSecret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!constantTimeEqual(signature, sign(encoded, signingSecret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || payload.exp <= Math.floor(Date.now() / 1000) || !payload.sub || !payload.csrf || !["main", "regular", "branch"].includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isSecureRequest(event) {
  const host = String(header(event, "x-forwarded-host") || header(event, "host"));
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  return !local;
}

function sessionCookie(token, event) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    isSecureRequest(event) ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function clearCookie(event) {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    isSecureRequest(event) ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function sameOrigin(event) {
  const origin = String(header(event, "origin") || "");
  if (!origin) return true;
  const host = String(header(event, "x-forwarded-host") || header(event, "host") || "");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function authorize(event, options) {
  const session = verifySession(event);
  if (!session) return { ok: false, response: json(401, { error: "Authentication required." }) };
  if (options && options.role && session.role !== options.role) {
    return { ok: false, response: json(403, { error: "Main admin permission is required." }) };
  }
  if (options && options.csrf) {
    if (!sameOrigin(event)) return { ok: false, response: json(403, { error: "Origin check failed." }) };
    const csrf = header(event, "x-helpdesk-csrf");
    if (!constantTimeEqual(csrf, session.csrf)) {
      return { ok: false, response: json(403, { error: "CSRF validation failed." }) };
    }
  }
  return { ok: true, session };
}

function limited(ip) {
  const now = Date.now();
  const item = loginAttempts.get(ip);
  if (!item || now - item.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { startedAt: now, failures: 0 });
    return false;
  }
  return item.failures >= LOGIN_LIMIT;
}

function recordFailure(ip) {
  const now = Date.now();
  const item = loginAttempts.get(ip);
  if (!item || now - item.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { startedAt: now, failures: 1 });
  } else {
    item.failures += 1;
  }
}

async function authenticate(event) {
  const ip = clientIp(event);
  if (limited(ip)) {
    return json(429, { error: "Too many login attempts. Try again in 15 minutes." }, { "Retry-After": "900" });
  }
  let mainAdmins;
  try { mainAdmins = configuredMainAdmins(); }
  catch (error) { return json(503, { error: error.message }); }
  if (!mainAdmins.length || !secret()) {
    return json(503, { error: "Admin access is not configured yet." });
  }
  const body = parseBody(event);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return json(400, { error: "Username and password are required." });
  }
  const requestedUsername = body.username.trim();
  const mainAdmin = mainAdmins.find((admin) => constantTimeEqual(requestedUsername.toLowerCase(), admin.username.toLowerCase()));
  let identity = null;
  if (mainAdmin && await bcrypt.compare(body.password, mainAdmin.passwordHash).catch(() => false)) {
    identity = { id: `main:${mainAdmin.username}`, username: mainAdmin.username, name: mainAdmin.name, role: "main" };
  } else {
    const regular = await findRegularAdmin(requestedUsername);
    if (regular && await bcrypt.compare(body.password, regular.passwordHash).catch(() => false)) {
      identity = {
        id: regular.id,
        username: regular.username,
        name: regular.name,
        role: regular.role === "main" ? "main" : (regular.role === "branch" ? "branch" : "regular"),
      };
    } else if (!mainAdmin && mainAdmins[0]) {
      await bcrypt.compare(body.password, mainAdmins[0].passwordHash).catch(() => false);
    }
  }
  if (!identity) {
    recordFailure(ip);
    return json(401, { error: "Invalid username or password." });
  }
  loginAttempts.delete(ip);
  const session = issueSession(identity);
  return json(200, {
    authenticated: true,
    username: identity.username,
    name: identity.name,
    role: identity.role,
    csrfToken: session.payload.csrf,
    expiresAt: session.payload.exp,
  }, { "Set-Cookie": sessionCookie(session.token, event) });
}

function configuredMainAdmins() {
  const admins = [];
  const raw = String(process.env.MAIN_ADMINS_JSON || "").trim();
  if (raw) {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error("MAIN_ADMINS_JSON is not valid JSON."); }
    if (!Array.isArray(parsed)) throw new Error("MAIN_ADMINS_JSON must be an array.");
    parsed.forEach((admin) => {
      if (!admin || typeof admin.username !== "string" || typeof admin.passwordHash !== "string" || !admin.username.trim() || !admin.passwordHash.startsWith("$2")) {
        throw new Error("Every main admin needs a username and bcrypt passwordHash.");
      }
      admins.push({
        username: admin.username.trim(),
        name: String(admin.name || admin.username).trim(),
        passwordHash: admin.passwordHash,
        photoUrl: typeof admin.photoUrl === "string" ? admin.photoUrl.trim() : "",
      });
    });
    if (new Set(admins.map((admin) => admin.username.toLowerCase())).size !== admins.length) {
      throw new Error("MAIN_ADMINS_JSON contains a duplicate username.");
    }
  }
  const legacyUsername = String(process.env.ADMIN_USERNAME || "").trim();
  const legacyHash = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (legacyUsername && legacyHash && !admins.some((admin) => admin.username.toLowerCase() === legacyUsername.toLowerCase())) {
    admins.push({ username: legacyUsername, name: legacyUsername, passwordHash: legacyHash });
  }
  return admins;
}

function mainAdminDirectory() {
  return configuredMainAdmins().map((admin) => ({ username: admin.username, name: admin.name, role: "main", photoUrl: admin.photoUrl || "" }));
}

module.exports = {
  COOKIE_NAME,
  authenticate,
  authorize,
  clearCookie,
  configuredMainAdmins,
  json,
  mainAdminDirectory,
  parseBody,
  sessionCookie,
  verifySession,
};
