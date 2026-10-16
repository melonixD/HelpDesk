const crypto = require("node:crypto");
const {json,authorize,parseBody}=require("../lib/admin-auth");
const {loadPublished}=require("../lib/content-store");
const {loadState,mutateState}=require("../lib/admin-state");
const {connectNetlifyBlobs}=require("../lib/netlify-runtime");
const attempts=new Map();
exports.handler=async event=>{
  connectNetlifyBlobs(event);
  if(!["GET","POST"].includes(event.httpMethod))return json(405,{error:"Method not allowed."},{Allow:"GET, POST"});
  try {
    if(event.httpMethod==="GET") {
      const auth=authorize(event,{role:"main"});if(!auth.ok)return auth.response;
      return json(200,{reports:(await loadState()).practiceReports});
    }
    const body=parseBody(event);if(!body)return json(400,{error:"Invalid report."});
    if(body.action==="resolve") {
      const auth=authorize(event,{role:"main",csrf:true});if(!auth.ok)return auth.response;
      await mutateState(state=>{const report=state.practiceReports.find(r=>r.id===body.reportId);if(!report)throw Object.assign(new Error("Report not found."),{statusCode:404});report.resolvedAt=new Date().toISOString();report.resolvedBy=auth.session.sub;});
      return json(200,{resolved:true});
    }
    const headers=event.headers||{};const origin=headers.origin||headers.Origin;const host=headers["x-forwarded-host"]||headers.host||headers.Host;
    if(!origin||!host||new URL(origin).host!==host)return json(403,{error:"Open HelpDesk to submit a report."});
    if(typeof body.questionId!=="string"||body.questionId.length>80||typeof body.message!=="string"||!body.message.trim()||body.message.length>1000)return json(400,{error:"Describe the issue in 1–1000 characters."});
    const ip=String(headers["x-forwarded-for"]||"unknown").split(",")[0],now=Date.now();
    const entry=attempts.get(ip);const hits=entry&&now-entry.start<3600000?entry:{start:now,count:0};if(hits.count>=5)return json(429,{error:"Too many reports. Please try later."});
    const bank=await loadPublished("practice");if(!bank.questions.some(q=>q.id===body.questionId))return json(404,{error:"Question not found."});
    hits.count++;attempts.set(ip,hits);
    await mutateState(state=>{state.practiceReports.unshift({id:"report-"+crypto.randomBytes(12).toString("hex"),questionId:body.questionId,message:body.message.trim(),createdAt:new Date().toISOString(),resolvedAt:null});state.practiceReports=state.practiceReports.slice(0,500);});
    return json(201,{sent:true});
  }catch(error){return json(error.statusCode||500,{error:"The report could not be processed. Try again later."});}
};
