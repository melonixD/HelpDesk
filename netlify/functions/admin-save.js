const { authorize, json, parseBody } = require("../lib/admin-auth");
const { ValidationError } = require("../lib/admin-content");
const { saveDraft } = require("../lib/admin-drafts");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true, role: "main" });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body || typeof body.target !== "string" || !body.data) {
    return json(400, { error: "A content target and data are required." });
  }
  try {
    const result = await saveDraft(body.target, body.data, auth.session.sub);
    return json(200, { saved: true, draft: true, deploying: false, updatedAt: result.updatedAt, updatedBy: result.updatedBy });
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : (error.statusCode || 500);
    return json(status, { error: error.message || "Could not save this change." });
  }
};
