const { json } = require("../lib/helpdesk-api");
const { refreshScholarshipFeed } = require("../lib/scholarship-feed");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async function handler(event) {
  connectNetlifyBlobs(event);
  const feed = await refreshScholarshipFeed();
  console.log(`Scholarship refresh completed with ${feed.scholarships.length} entries at ${feed.fetchedAt}.`);
  return json(200, { refreshed: true, count: feed.scholarships.length, fetchedAt: feed.fetchedAt });
};
