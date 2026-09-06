const { authorize, clearCookie, configuredMainAdmins, json, parseBody } = require("../lib/admin-auth");
const { changeOwnPassword } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { role: "main", csrf: true });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body) return json(400, { error: "Request body must be valid JSON." });
  try {
    const result = await changeOwnPassword(auth.session, body, configuredMainAdmins());
    return json(200, result, { "Set-Cookie": clearCookie(event) });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Password could not be changed." });
  }
};
