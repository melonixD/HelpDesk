const { authorize, json, mainAdminDirectory, parseBody } = require("../lib/admin-auth");
const { updateProfile } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body) return json(400, { error: "Request body must be valid JSON." });
  try { return json(200, await updateProfile(auth.session, body, mainAdminDirectory())); }
  catch (error) { return json(error.statusCode || 500, { error: error.message || "Profile could not be updated." }); }
};
