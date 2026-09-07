const { authorize, json, parseBody } = require("../lib/admin-auth");
const { ValidationError } = require("../lib/admin-content");
const { saveMergedDraft } = require("../lib/admin-drafts");
const { logContentActivity } = require("../lib/admin-activity");
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
    const result = await saveMergedDraft(body.target, body.data, auth.session.sub, {
      baseDraftId: body.baseDraftId || null,
      basePublishedVersion: body.basePublishedVersion,
    });
    let activity = null;
    try {
      activity = await logContentActivity(result.previousData, result.data, auth.session.sub, {
        target: body.target, action: "content-updated", summary: "Saved " + body.target + " changes to a private draft",
      });
    } catch (activityError) { console.warn("Draft saved, but activity logging failed:", activityError.message); }
    return json(200, { saved: true, draft: true, deploying: false, draftId: result.draftId || null,
      updatedAt: result.updatedAt, updatedBy: result.updatedBy, data: result.data, merged: result.merged,
      activityId: activity && activity.id });
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : (error.statusCode || 500);
    return json(status, { error: error.message || "Could not save this change." });
  }
};
