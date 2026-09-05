function netlifyRuntime() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.DEPLOY_ID);
}

async function feedStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore("helpdesk-public-feeds");
}

async function readCachedFeed(key) {
  if (!netlifyRuntime()) return null;
  try {
    const result = await (await feedStore()).getWithMetadata(key, { type: "json", consistency: "strong" });
    return result && result.data && typeof result.data === "object" ? result.data : null;
  } catch (error) {
    console.error("HelpDesk feed cache read failed:", error && error.message ? error.message : error);
    return null;
  }
}

async function writeCachedFeed(key, value) {
  if (!netlifyRuntime()) return false;
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
