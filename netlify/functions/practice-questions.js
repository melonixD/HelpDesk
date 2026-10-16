const crypto = require("node:crypto");
const { loadPublished } = require("../lib/content-store");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");
const { json, methodNotAllowed } = require("../lib/helpdesk-api");
const { select, practiceResources } = require("../../public/question-bank-model");

exports.handler = async event => {
  connectNetlifyBlobs(event);
  if (!["GET","POST"].includes(event.httpMethod)) return methodNotAllowed("GET, POST");
  try {
    let params = event.queryStringParameters || {};
    if (event.httpMethod === "POST") {
      if (!event.body || event.body.length > 1024 * 1024) return json(400,{error:"Invalid revision filter payload."});
      try { params=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,"base64").toString("utf8"):event.body); } catch { return json(400,{error:"Invalid JSON."}); }
      if (!params || Array.isArray(params) || typeof params!=="object" || !Array.isArray(params.ids) || params.ids.length>10000 || params.ids.some(id=>typeof id!=="string"||id.length>80)) return json(400,{error:"Invalid saved question IDs."});
    }
    const [bank, resources] = await Promise.all([loadPublished("practice"), loadPublished("resources")]);
    if(params.catalog==="1") {
      const catalog=practiceResources(bank,resources);
      return json(200,{catalog:{branches:catalog.branches,unitCollections:catalog.unitCollections.map(s=>({id:s.id,name:s.name,units:s.units}))}});
    }
    let questions = select(bank,resources,params);
    if (params.ids) { const ids = new Set(Array.isArray(params.ids)?params.ids:String(params.ids).slice(0,12000).split(",")); questions = questions.filter(q => ids.has(q.id)); }
    const facets = {};
    for (const [key,field] of [["chapters","chapter"],["years","year"],["exams","exam"],["marks","marks"]]) {
      facets[key] = [...new Set(select(bank,resources,{branch:params.branch,semester:params.semester,subject:params.subject,unit:params.unit}).flatMap(q => field==="chapter"?(q.topics||[{chapter:q.chapter}]).filter(t=>!params.unit||params.unit==="all"||t.unitNumber===params.unit).map(t=>t.chapter):[q[field]]).filter(v => v !== null && v !== "unknown"))].sort((a,b) => String(a).localeCompare(String(b),undefined,{numeric:true}));
    }
    if (params.sort === "shuffle") {
      const seed = String(params.seed || "session").slice(0,80);
      const score = q => crypto.createHash("sha256").update(seed + q.id).digest("hex");
      questions = questions.map(q=>({q,key:score(q)})).sort((a,b)=>a.key.localeCompare(b.key)).map(x=>x.q);
    } else questions = questions.slice().sort((a,b)=>(b.year||0)-(a.year||0)||a.id.localeCompare(b.id));
    const offset = Math.max(0,Math.min(10000,parseInt(params.offset,10)||0));
    const limit = Math.max(1,Math.min(50,parseInt(params.limit,10)||20));
    return json(200,{total:questions.length,offset,hasMore:offset+limit<questions.length,facets,questions:questions.slice(offset,offset+limit)}, {"Netlify-CDN-Cache-Control":"no-store"});
  } catch (error) { console.error("Question bank failed:",error.message); return json(503,{error:"The question bank could not load. Please try again."}); }
};
