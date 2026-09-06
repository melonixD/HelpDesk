const { authorize, json, parseBody } = require("../lib/admin-auth");
const { publishDraft } = require("../lib/admin-drafts");
const { markResourcesDraftPublished } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true, role: "main" });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body || typeof body.target !== "string") return json(400, { error: "A content target is required." });
  try {
    const result = await publishDraft(body.target, auth.session.sub, body.message, body.draftId);
    let queuedRequestsPublished = 0;
    if (body.target === "resources") {
      try { queuedRequestsPublished = await markResourcesDraftPublished(result.version, auth.session.sub); }
      catch (error) { console.warn("Resources were published, but contribution statuses could not be refreshed:", error.message); }
    }
    return json(200, { saved: true, deploying: false, published: true, queuedRequestsPublished, ...result });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not publish this draft." });
  }
};
