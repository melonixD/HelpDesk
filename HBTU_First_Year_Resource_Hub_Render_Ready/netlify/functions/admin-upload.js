const { authorize, json, parseBody } = require("../lib/admin-auth");
const { acceptChunk, completeUpload } = require("../lib/admin-uploads");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = parseBody(event);
  if (!body || !["chunk", "complete"].includes(body.action)) return json(400, { error: "Upload action is invalid." });
  try {
    const result = body.action === "chunk" ? await acceptChunk(body) : await completeUpload(body);
    return json(200, result);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Upload failed." });
  }
};
