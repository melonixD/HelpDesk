const { isNetlifyRuntime } = require("./netlify-runtime");

async function feedStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore("helpdesk-public-feeds");
}

async function readCachedFeed(key) {
  if (!isNetlifyRuntime()) return null;
  try {
    const result = await (await feedStore()).getWithMetadata(key, { type: "json" });
    return result && result.data && typeof result.data === "object" ? result.data : null;
  } catch (error) {
    console.error("HelpDesk feed cache read failed:", error && error.message ? error.message : error);
    return null;
  }
}

async function writeCachedFeed(key, value) {
  if (!isNetlifyRuntime()) return false;
  try {
    await (await feedStore()).set(key, JSON.stringify(value), {
      metadata: { fetchedAt: value.fetchedAt || new Date().toISOString() },
    });
    return true;
  } catch (error) {
    console.error("HelpDesk feed cache write failed:", error && error.message ? error.message : error);
    return false;
  }
}

function isFresh(feed, maximumAgeMs) {
  const fetched = feed && Date.parse(feed.fetchedAt);
  return Number.isFinite(fetched) && Date.now() - fetched < maximumAgeMs;
}

module.exports = { isFresh, readCachedFeed, writeCachedFeed };
