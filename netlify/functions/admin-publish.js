const { authorize, json, parseBody } = require("../lib/admin-auth");
const { publishDraft } = require("../lib/admin-drafts");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true, role: "main" });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body || typeof body.target !== "string") return json(400, { error: "A content target is required." });
  try {
    const result = await publishDraft(body.target, auth.session.sub, body.message);
    return json(200, { saved: true, deploying: true, published: true, ...result });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not publish this draft." });
  }
};

