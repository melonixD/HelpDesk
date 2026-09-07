const { authorize, json, mainAdminDirectory, parseBody } = require("../lib/admin-auth");
const { managementSnapshot, manage } = require("../lib/admin-control");
const { loadPublished } = require("../lib/content-store");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");
const { appendActivity } = require("../lib/admin-activity");

function activitySummary(action, result) {
  const admin = result && (result.regularAdmin || result.mainAdmin);
  const name = admin && (admin.name || admin.username);
  if (action === "approve-registration") return "Approved " + (name || "an applicant") + " as a regular admin";
  if (action === "reject-registration") return "Rejected the admin application from " + (result.applicationName || "an applicant");
  if (action === "approve-change") return "Approved " + (result.requestedBy || "a contributor") + "'s change: " + (result.changeSummary || "resource update");
  if (action === "reject-change") return "Rejected " + (result.requestedBy || "a contributor") + "'s change: " + (result.changeSummary || "resource update");
  if (action === "promote-main-admin") return "Promoted " + (name || "an admin") + " to main admin";
  if (action === "set-contributor-role") return "Changed " + (name || "an admin") + "'s role";
  if (action === "update-permissions") return "Updated section access for " + (name || "an admin");
  if (action === "set-regular-status") return "Changed account access for " + (name || "an admin");
  if (action === "reset-password") return "Reset the password for " + (name || "an admin");
  return "Completed admin action: " + action;
}

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (!['GET','POST'].includes(event.httpMethod)) return json(405,{error:"Method not allowed."},{Allow:"GET, POST"});
  const auth=authorize(event,{csrf:event.httpMethod==='POST',role:'main'});if(!auth.ok)return auth.response;
  try {
    const mains=mainAdminDirectory();
    const resources=await loadPublished("resources");
    if(event.httpMethod==='GET')return json(200,await managementSnapshot(mains,resources));
    const body=parseBody(event);if(!body||typeof body.action!=="string")return json(400,{error:"Management action is required."});
    const result=await manage(body.action,body,auth.session.sub,mains,resources);
    try {
      await appendActivity({ actor: auth.session.sub, action: "admin-" + body.action,
        summary: activitySummary(body.action, result), target: "administration",
        metadata: { adminId: body.adminId || null, requestId: body.requestId || null, registrationId: body.registrationId || null } });
    } catch (activityError) { console.warn("Admin action completed, but activity logging failed:", activityError.message); }
    return json(200,result);
  } catch(error){return json(error.statusCode||500,{error:error.message||"Admin management failed."});}
};
