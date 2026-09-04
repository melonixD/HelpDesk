const { authorize, json, parseBody } = require("../lib/admin-auth");
const { commitJson, ValidationError } = require("../lib/admin-content");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true, role: "main" });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body || typeof body.target !== "string" || !body.data) {
    return json(400, { error: "A content target and data are required." });
  }
  try {
    const result = await commitJson(body.target, body.data, body.message);
    return json(200, { saved: true, deploying: true, ...result });
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : (error.statusCode || 500);
    return json(status, { error: error.message || "Could not save this change." });
  }
};
