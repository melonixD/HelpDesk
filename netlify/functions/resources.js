const { filterResources, json, methodNotAllowed } = require("../lib/helpdesk-api");
const { loadPublished } = require("../lib/content-store");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async function handler(event) {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "GET") return methodNotAllowed("GET");
  const resources = await loadPublished("resources");
  return json(200, filterResources(event.queryStringParameters || {}, resources), {
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=60, stale-while-revalidate=300",
  });
};
