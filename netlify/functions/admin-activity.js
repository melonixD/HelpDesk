const { authorize, json, parseBody } = require("../lib/admin-auth");
const { listActivity, restoreResourceChange } = require("../lib/admin-activity");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed." }, { Allow: "GET, POST" });
  const auth = authorize(event, { csrf: event.httpMethod === "POST", role: "main" });
  if (!auth.ok) return auth.response;
  try {
    if (event.httpMethod === "GET") {
      return json(200, { activity: await listActivity(event.queryStringParameters && event.queryStringParameters.limit) });
    }
    const body = parseBody(event);
    if (!body || body.action !== "restore-resource") return json(400, { error: "Activity action is invalid." });
    const draft = await restoreResourceChange(body.activityId, body.changeId, auth.session.sub);
    return json(200, { restored: true, draft: true, deploying: false, draftId: draft.draftId,
      updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, data: draft.data });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Admin activity failed." });
  }
};
