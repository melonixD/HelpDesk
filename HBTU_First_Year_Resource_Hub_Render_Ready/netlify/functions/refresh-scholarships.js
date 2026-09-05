const { json } = require("../lib/helpdesk-api");
const { refreshScholarshipFeed } = require("../lib/scholarship-feed");

exports.handler = async function handler() {
  const feed = await refreshScholarshipFeed();
  console.log(`Scholarship refresh completed with ${feed.scholarships.length} entries at ${feed.fetchedAt}.`);
  return json(200, { refreshed: true, count: feed.scholarships.length, fetchedAt: feed.fetchedAt });
};
