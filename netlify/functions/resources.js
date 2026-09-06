const { filterResources, json, methodNotAllowed } = require("../lib/helpdesk-api");
const { loadPublished } = require("../lib/content-store");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async function handler(event) {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "GET") return methodNotAllowed("GET");
  const resources = await loadPublished("resources");
  return json(200, filterResources(event.queryStringParameters || {}, resources), {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Netlify-CDN-Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0",
  });
};
