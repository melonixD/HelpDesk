const { json, methodNotAllowed } = require("../lib/helpdesk-api");
const { loadPublished } = require("../lib/content-store");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async function handler(event) {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "GET") return methodNotAllowed("GET");
  const placements = await loadPublished("placements");
  return json(200, placements, {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=900",
  });
};
