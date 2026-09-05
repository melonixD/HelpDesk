const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { filterResources, generatePractice } = require("./netlify/lib/helpdesk-api");
const { getNoticeFeed } = require("./netlify/lib/hbtu-feed");
const { getScholarshipFeed } = require("./netlify/lib/scholarship-feed");
const adminLogin = require("./netlify/functions/admin-login").handler;
const adminSession = require("./netlify/functions/admin-session").handler;
const adminLogout = require("./netlify/functions/admin-logout").handler;
const adminData = require("./netlify/functions/admin-data").handler;
const adminSave = require("./netlify/functions/admin-save").handler;
const adminUpload = require("./netlify/functions/admin-upload").handler;
const adminRegister = require("./netlify/functions/admin-register").handler;
const adminManagement = require("./netlify/functions/admin-management").handler;
const adminChangeRequest = require("./netlify/functions/admin-change-request").handler;
const adminScopedSave = require("./netlify/functions/admin-scoped-save").handler;
const adminProfile = require("./netlify/functions/admin-profile").handler;

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; script-src 'self'; connect-src 'self'; object-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
}

function sendJson(res, statusCode, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store, no-cache, must-revalidate",
    ...(extraHeaders || {}),
  });
  res.end(body);
}

function relayFunctionResponse(res, result) {
  res.writeHead(result.statusCode || 200, result.headers || {});
  res.end(result.body || "");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function cacheControl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".html", ".js", ".css", ".json"].includes(extension)) {
    return "no-store, no-cache, must-revalidate";
  }
  if (filePath.includes(`${path.sep}resources${path.sep}pyqs${path.sep}`)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

function sendFile(req, res, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": cacheControl(filePath),
      "Accept-Ranges": "bytes",
    };
    const range = req.headers.range;
    let start = 0;
    let end = stats.size - 1;
    let statusCode = 200;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
        res.end();
        return;
      }
      start = match[1] ? Number(match[1]) : 0;
      end = match[2] ? Number(match[2]) : stats.size - 1;
      if (start > end || start >= stats.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
        res.end();
        return;
      }
      end = Math.min(end, stats.size - 1);
      statusCode = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`;
    }

    headers["Content-Length"] = end - start + 1;
    if (extension === ".pdf") headers["Content-Disposition"] = "inline";
    res.writeHead(statusCode, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

async function handleRequest(req, res) {
  setSecurityHeaders(res);
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/health") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return sendJson(res, 200, { status: "ok", service: "HelpDesk" });
  }

  if (url.pathname === "/api/resources") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return sendJson(res, 200, filterResources(Object.fromEntries(url.searchParams)));
  }

  if (url.pathname === "/api/practice/generate") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
    const body = await readBody(req);
    const result = await generatePractice({
      httpMethod: req.method,
      body,
      headers: req.headers,
      isBase64Encoded: false,
    });
    return relayFunctionResponse(res, result);
  }

  if (url.pathname === "/api/notices") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
    const feed = await getNoticeFeed();
    return sendJson(res, 200, feed, {
      "Cache-Control": "public, max-age=60",
    });
  }

  if (url.pathname === "/api/scholarships") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
    const feed = await getScholarshipFeed();
    return sendJson(res, 200, feed, {
      "Cache-Control": "public, max-age=900",
    });
  }

  const adminRoutes = {
    "/api/admin/login": adminLogin,
    "/api/admin/session": adminSession,
    "/api/admin/logout": adminLogout,
    "/api/admin/data": adminData,
    "/api/admin/save": adminSave,
    "/api/admin/upload": adminUpload,
    "/api/admin/register": adminRegister,
    "/api/admin/management": adminManagement,
    "/api/admin/change-request": adminChangeRequest,
    "/api/admin/scoped-save": adminScopedSave,
    "/api/admin/profile": adminProfile,
  };
  if (adminRoutes[url.pathname]) {
    const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : "";
    const result = await adminRoutes[url.pathname]({
      httpMethod: req.method,
      body,
      headers: req.headers,
      isBase64Encoded: false,
      queryStringParameters: Object.fromEntries(url.searchParams),
    });
    return relayFunctionResponse(res, result);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    return sendJson(res, 400, { error: "Invalid URL." });
  }

  if (pathname === "/admin" || pathname === "/admin/login") pathname = "/admin/index.html";
  const requestedPath = path.resolve(publicDir, `.${pathname === "/" ? "/index.html" : pathname}`);
  const insidePublic = requestedPath === publicDir || requestedPath.startsWith(`${publicDir}${path.sep}`);
  if (!insidePublic) return sendJson(res, 403, { error: "Forbidden." });

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return sendFile(req, res, requestedPath);
  }
  return sendFile(req, res, path.join(publicDir, "index.html"));
}

const app = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode === 413 ? error.message : "Something went wrong. Please try again.",
      });
    } else {
      res.end();
    }
  });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HelpDesk running on port ${PORT}`);
  });
}

module.exports = app;
