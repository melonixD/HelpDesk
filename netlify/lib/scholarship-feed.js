const fallbackFeed = require("../../data/scholarships-fallback.json");
const { isFresh, readCachedFeed, writeCachedFeed } = require("./feed-cache");

const CACHE_KEY = "scholarships-daily-v1";
const CACHE_MAX_AGE_MS = 26 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;
const MAX_SCHOLARSHIPS = 30;
const SOURCES = [
  {
    id: "hbtu",
    name: "HBTU",
    organization: "Harcourt Butler Technical University",
    category: "University",
    url: "https://hbtu.ac.in/academic-circular/",
  },
  {
    id: "education-ministry",
    name: "Ministry of Education",
    organization: "Ministry of Education, Government of India",
    category: "Central Government",
    url: "https://www.education.gov.in/en/scholarships",
  },
  {
    id: "national-scholarship-portal",
    name: "National Scholarship Portal",
    organization: "Government of India",
    category: "Central Government",
    url: "https://scholarships.gov.in/",
  },
];

function decodeHtml(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"', ndash: "–", mdash: "—" };
  return String(value || "")
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function scholarshipId(sourceId, title) {
  const slug = String(title || "scholarship").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);
  return `${sourceId}-${slug || "scholarship"}`.slice(0, 80).replace(/-+$/g, "");
}

function officialScholarshipUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(decodeHtml(rawUrl), baseUrl);
    const host = url.hostname.toLowerCase();
    const allowed = host === "hbtu.ac.in" || host.endsWith(".hbtu.ac.in") ||
      host === "education.gov.in" || host.endsWith(".education.gov.in") ||
      host === "scholarships.gov.in" || host.endsWith(".scholarships.gov.in") ||
      host === "scholarship.up.gov.in" || host.endsWith(".scholarship.up.gov.in");
    if (!allowed || !["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch (error) {
    return null;
  }
}

function meaningfulTitle(title) {
  if (!title || title.length < 12 || title.length > 500) return false;
  if (!/(scholarship|fellowship|financial\s+(?:aid|assistance)|छात्रवृत्ति)/i.test(title)) return false;
  return !/^(scholarships?|fellowships?|scholarships?\s*(?:&|and)\s*education loan)$/i.test(title.trim());
}

function deadlineFromTitle(title) {
  const match = String(title || "").match(/(?:last date|deadline|apply by|upto|up to)\s*[:\-]?\s*([^|,;]{4,45})/i);
  return match ? match[0].trim() : "Check the official announcement for dates";
}

function parseScholarships(html, source) {
  const items = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || ""))) && items.length < MAX_SCHOLARSHIPS) {
    const title = cleanText(match[3]).replace(/(?:\s*\|?\s*)NEW\b/gi, "").trim();
    const url = officialScholarshipUrl(match[2], source.url);
    if (!url || !meaningfulTitle(title)) continue;
    const fingerprint = `${title.toLowerCase()}|${url}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    items.push({
      id: scholarshipId(source.id, title),
      title,
      organization: source.organization,
      category: source.category,
      description: `Latest official scholarship information published through ${source.name}.`,
      deadline: deadlineFromTitle(title),
      url,
      isNew: true,
    });
  }
  return items;
}

async function fetchSource(source, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(source.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "HelpDesk-HBTU/17.0 (+https://helpdeskhbtu.netlify.app/)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
    return parseScholarships(await response.text(), source);
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackResult() {
  return JSON.parse(JSON.stringify(fallbackFeed));
}

function mergeScholarships(liveItems) {
  const seenUrls = new Set();
  const merged = [];
  [...liveItems, ...fallbackFeed.scholarships].forEach((item) => {
    const fingerprint = String(item.url || "").replace(/\/$/, "").toLowerCase();
    if (!fingerprint || seenUrls.has(fingerprint)) return;
    seenUrls.add(fingerprint);
    merged.push({ ...item });
  });
  return merged.slice(0, MAX_SCHOLARSHIPS);
}

async function fetchLiveScholarshipFeed(fetchImpl) {
  const request = fetchImpl || global.fetch;
  if (typeof request !== "function") throw new Error("Fetch is unavailable");
  const results = await Promise.allSettled(SOURCES.map((source) => fetchSource(source, request)));
  const liveItems = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!liveItems.length) throw new Error("No current scholarship announcements could be identified");
  const scholarships = mergeScholarships(liveItems);
  return {
    source: "live",
    sourceUrl: fallbackFeed.sourceUrl,
    fetchedAt: new Date().toISOString(),
    newCount: liveItems.length,
    featured: { ...fallbackFeed.featured },
    scholarships,
    sources: SOURCES.map((source) => ({ name: source.name, url: source.url })),
  };
}

async function refreshScholarshipFeed(fetchImpl) {
  const cached = await readCachedFeed(CACHE_KEY);
  try {
    const feed = await fetchLiveScholarshipFeed(fetchImpl);
    await writeCachedFeed(CACHE_KEY, feed);
    return feed;
  } catch (error) {
    console.error("Scholarship refresh failed:", error && error.message ? error.message : error);
    return cached || fallbackResult();
  }
}

async function getScholarshipFeed(fetchImpl, options) {
  if (!(options && options.forceRefresh)) {
    const cached = await readCachedFeed(CACHE_KEY);
    if (cached && isFresh(cached, CACHE_MAX_AGE_MS)) return cached;
  }
  return refreshScholarshipFeed(fetchImpl);
}

module.exports = {
  SOURCES,
  fetchLiveScholarshipFeed,
  getScholarshipFeed,
  parseScholarships,
  refreshScholarshipFeed,
};
