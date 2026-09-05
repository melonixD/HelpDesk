const { json, parseBody } = require("../lib/admin-auth");
const { registration } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

const attempts = new Map();
function ip(event) { return String((event.headers && (event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"])) || "unknown").split(",")[0].trim(); }

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const key=ip(event);const now=Date.now();const entry=attempts.get(key)||{start:now,count:0};if(now-entry.start>60*60*1000){entry.start=now;entry.count=0;}entry.count+=1;attempts.set(key,entry);
  if(entry.count>3)return json(429,{error:"Too many applications from this connection. Try again later."},{"Retry-After":"3600"});
  const body = parseBody(event);
  if (!body || body.website) return json(400, { error: "Registration form is invalid." });
  try { return json(201, await registration(body)); }
  catch (error) { return json(error.statusCode || 500, { error: error.message || "Registration could not be submitted." }); }
};
