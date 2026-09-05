const { json } = require("../lib/helpdesk-api");
const { refreshNoticeFeed } = require("../lib/hbtu-feed");

exports.handler = async function handler() {
  const feed = await refreshNoticeFeed();
  console.log(`Notice refresh completed with ${feed.notices.length} entries at ${feed.fetchedAt}.`);
  return json(200, { refreshed: true, count: feed.notices.length, fetchedAt: feed.fetchedAt });
};
