const { authorize, json, parseBody } = require("../lib/admin-auth");
const { saveScopedDraft } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true });
  if (!auth.ok) return auth.response;
  if (auth.session.role === "main") return json(403, { error: "Main admins use the full save endpoint." });
  const body = parseBody(event);
  if (!body) return json(400, { error: "Request body must be valid JSON." });
  try { return json(200, await saveScopedDraft(auth.session, body)); }
  catch (error) { return json(error.statusCode || 500, { error: error.message || "Scoped update could not be saved as a draft." }); }
};
