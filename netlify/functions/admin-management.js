const { authorize, json, mainAdminDirectory, parseBody } = require("../lib/admin-auth");
const { managementSnapshot, manage } = require("../lib/admin-control");
const { loadPublished } = require("../lib/content-store");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (!['GET','POST'].includes(event.httpMethod)) return json(405,{error:"Method not allowed."},{Allow:"GET, POST"});
  const auth=authorize(event,{csrf:event.httpMethod==='POST',role:'main'});if(!auth.ok)return auth.response;
  try {
    const mains=mainAdminDirectory();
    const resources=await loadPublished("resources");
    if(event.httpMethod==='GET')return json(200,await managementSnapshot(mains,resources));
    const body=parseBody(event);if(!body||typeof body.action!=="string")return json(400,{error:"Management action is required."});
    return json(200,await manage(body.action,body,auth.session.sub,mains,resources));
  } catch(error){return json(error.statusCode||500,{error:error.message||"Admin management failed."});}
};
