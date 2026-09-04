const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

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

function issueSession(username) {
  const signingSecret = secret();
  if (!signingSecret) throw new Error("Admin session is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: username,
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
    if (!payload || payload.exp <= Math.floor(Date.now() / 1000) || !payload.sub || !payload.csrf) return null;
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
  const username = String(process.env.ADMIN_USERNAME || "");
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || "");
  if (!username || !passwordHash || !secret()) {
    return json(503, { error: "Admin access is not configured yet." });
  }
  const body = parseBody(event);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return json(400, { error: "Username and password are required." });
  }
  const usernameMatches = constantTimeEqual(body.username, username);
  const passwordMatches = await bcrypt.compare(body.password, passwordHash).catch(() => false);
  if (!usernameMatches || !passwordMatches) {
    recordFailure(ip);
    return json(401, { error: "Invalid username or password." });
  }
  loginAttempts.delete(ip);
  const session = issueSession(username);
  return json(200, {
    authenticated: true,
    username,
    csrfToken: session.payload.csrf,
    expiresAt: session.payload.exp,
  }, { "Set-Cookie": sessionCookie(session.token, event) });
}

module.exports = {
  COOKIE_NAME,
  authenticate,
  authorize,
  clearCookie,
  json,
  parseBody,
  sessionCookie,
  verifySession,
};
