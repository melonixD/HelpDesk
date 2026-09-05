const { json, methodNotAllowed } = require("../lib/helpdesk-api");
const { getNoticeFeed } = require("../lib/hbtu-feed");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return methodNotAllowed("GET");
  const feed = await getNoticeFeed();
  return json(200, feed, {
    "Cache-Control": "public, max-age=300",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=14400, stale-while-revalidate=7200",
  });
};
