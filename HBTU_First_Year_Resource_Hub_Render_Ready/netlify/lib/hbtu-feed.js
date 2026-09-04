const fallbackFeed = require("../../data/notices-fallback.json");

const HBTU_HOME = "https://hbtu.ac.in/";
const FETCH_TIMEOUT_MS = 8000;
const MAX_NOTICES = 20;

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function categorizeNotice(title, url) {
  const text = `${title} ${url}`.toLowerCase();
  if (/hostel|allotment|dsw/.test(text)) return "Hostel";
  if (/placement|training|internship/.test(text)) return "Placement";
  if (/exam|result|academic|class|calendar|branch transfer|course/.test(text)) return "Academic";
  if (/fee|account|bank/.test(text)) return "Fees";
  if (/admission|counselling|registration/.test(text)) return "Admission";
  if (/policy|ordinance|regulation/.test(text)) return "Policy";
  return "General";
}

function noticeId(title, index) {
  const slug = String(title || "notice")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
  return `${slug || "notice"}-${index + 1}`;
}

function validNoticeTitle(title) {
  if (!title || title.length < 8) return false;
  return !/^(home|read more|click here|image|view all|download|notice|new)$/i.test(title);
}

function officialUrl(rawUrl) {
  try {
    const url = new URL(decodeHtml(rawUrl), HBTU_HOME);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (hostname !== "hbtu.ac.in" && !hostname.endsWith(".hbtu.ac.in")) return null;
    return url.href;
  } catch (error) {
    return null;
  }
}

function parseNotices(html) {
  const documentHtml = String(html || "");
  const marker = documentHtml.search(/Circulars\s*(?:&amp;|&)\s*Announcements/i);
  let section = marker >= 0 ? documentHtml.slice(marker) : documentHtml;
  const end = section.search(/Useful\s*Links/i);
  if (end > 0) section = section.slice(0, end);
  section = section.slice(0, 250000);

  const notices = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(section)) && notices.length < MAX_NOTICES) {
    const url = officialUrl(match[2]);
    const rawTitle = cleanText(match[3]);
    const isNew = /(?:\||\s)NEW\b/i.test(rawTitle);
    const title = rawTitle.replace(/(?:\s*\|?\s*)NEW\b/gi, "").trim();
    if (!url || !validNoticeTitle(title)) continue;

    const fingerprint = `${title.toLowerCase()}|${url}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    notices.push({
      id: noticeId(title, notices.length),
      title,
      url,
      category: categorizeNotice(title, url),
      isNew,
    });
  }

  return notices;
}

function fallbackResult() {
  const notices = fallbackFeed.notices.map((notice) => ({ ...notice }));
  return {
    source: "fallback",
    sourceUrl: fallbackFeed.sourceUrl,
    fetchedAt: fallbackFeed.fetchedAt,
    newCount: notices.filter((notice) => notice.isNew).length,
    notices,
  };
}

async function getNoticeFeed(fetchImpl) {
  const request = fetchImpl || global.fetch;
  if (typeof request !== "function") return fallbackResult();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await request(HBTU_HOME, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "HelpDesk-HBTU/13.4 (+https://helpdeskhbtu.netlify.app/)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HBTU returned ${response.status}`);
    const notices = parseNotices(await response.text());
    if (notices.length < 3) throw new Error("HBTU notice list could not be identified");
    return {
      source: "live",
      sourceUrl: HBTU_HOME,
      fetchedAt: new Date().toISOString(),
      newCount: notices.filter((notice) => notice.isNew).length,
      notices,
    };
  } catch (error) {
    console.error("HBTU notice refresh failed:", error && error.message ? error.message : error);
    return fallbackResult();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  HBTU_HOME,
  categorizeNotice,
  getNoticeFeed,
  parseNotices,
};
