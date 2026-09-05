const { authorize, json, parseBody } = require("../lib/admin-auth");
const { createChangeRequest } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed."},{Allow:"POST"});
  const auth=authorize(event,{csrf:true});if(!auth.ok)return auth.response;
  if(auth.session.role==="main")return json(403,{error:"Contributor accounts submit change requests. Main admins can save directly."});
  const body=parseBody(event);if(!body)return json(400,{error:"Request body must be valid JSON."});
  try{return json(201,await createChangeRequest(auth.session,body));}
  catch(error){return json(error.statusCode||500,{error:error.message||"Change request could not be submitted."});}
};
