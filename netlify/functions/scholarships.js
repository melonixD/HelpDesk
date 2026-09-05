const { json, methodNotAllowed } = require("../lib/helpdesk-api");
const { getScholarshipFeed } = require("../lib/scholarship-feed");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async function handler(event) {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "GET") return methodNotAllowed("GET");
  const feed = await getScholarshipFeed();
  return json(200, feed, {
    "Cache-Control": "public, max-age=900",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=86400, stale-while-revalidate=86400",
  });
};
