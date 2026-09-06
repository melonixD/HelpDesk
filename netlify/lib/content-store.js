const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { TARGETS, readJson, validateTarget } = require("./admin-content");
const { isNetlifyRuntime } = require("./netlify-runtime");

const STORE_NAME = "helpdesk-published-content";
const LOCAL_PATH = process.env.PUBLISHED_CONTENT_PATH || path.resolve(__dirname, "../../data/published-content.local.json");
let localQueue = Promise.resolve();

function normalize(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function recordKey(target) {
  return `published:${target}:v1`;
}

function recordPrefix(target) {
  return `published:${target}:v2:`;
}

function createRecordId() {
  return `${String(Date.now()).padStart(13, "0")}-${crypto.randomBytes(8).toString("hex")}`;
}

async function store() {
  const { getStore } = require("@netlify/blobs");
  return getStore(STORE_NAME);
}

async function loadLocalDirectory() {
  try {
    return normalize(JSON.parse(await fs.readFile(LOCAL_PATH, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveLocalDirectory(directory) {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  const temporary = `${LOCAL_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(directory, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, LOCAL_PATH);
}

async function loadLatestVersionedRecord(target) {
  const storage = await store();
  const listing = await storage.list({ prefix: recordPrefix(target) });
  const keys = listing.blobs.map((item) => item.key).sort().reverse();
  for (const key of keys) {
    const result = await storage.getWithMetadata(key, { type: "json" });
    const record = result && result.data;
    if (record && record.target === target && record.data) return record;
  }
  return null;
}

async function loadPublishedRecord(target) {
  if (!TARGETS[target]) return null;
  if (isNetlifyRuntime()) {
    const versioned = await loadLatestVersionedRecord(target);
    const result = versioned ? null : await (await store()).getWithMetadata(recordKey(target), { type: "json" });
    const record = versioned || (result && result.data);
    if (!record || !record.data) return null;
    try {
      validateTarget(target, record.data);
      return record;
    } catch (error) {
      console.error(`Ignoring invalid published ${target} Blob:`, error.message);
      return null;
    }
  }
  const directory = await loadLocalDirectory();
  const record = directory[target];
  if (!record || !record.data) return null;
  validateTarget(target, record.data);
  return record;
}

async function loadPublished(target) {
  const record = await loadPublishedRecord(target);
  return record ? record.data : readJson(target);
}

async function publishContent(target, data, author) {
  const validated = validateTarget(target, data);
  const record = {
    recordId: createRecordId(),
    target,
    data: validated,
    publishedAt: new Date().toISOString(),
    publishedBy: String(author || "main-admin").slice(0, 100),
    version: Date.now(),
  };

  if (isNetlifyRuntime()) {
    const result = await (await store()).setJSON(`${recordPrefix(target)}${record.recordId}`, record, {
      metadata: {
        target,
        recordId: record.recordId,
        publishedAt: record.publishedAt,
        publishedBy: record.publishedBy,
        version: record.version,
      },
      onlyIfNew: true,
    });
    if (!result.modified) throw new Error("Could not create a unique published version. Please publish again.");
    return record;
  }

  const operation = localQueue.then(async () => {
    const directory = await loadLocalDirectory();
    directory[target] = record;
    await saveLocalDirectory(directory);
    return record;
  });
  localQueue = operation.catch(() => {});
  return operation;
}

async function publishedDirectory() {
  const entries = await Promise.all(Object.keys(TARGETS).map(async (target) => [target, await loadPublishedRecord(target)]));
  return Object.fromEntries(entries.filter(([, record]) => record).map(([target, record]) => [target, {
    publishedAt: record.publishedAt,
    publishedBy: record.publishedBy,
    version: record.version,
    delivery: "netlify-blobs",
  }]));
}

module.exports = {
  STORE_NAME,
  loadPublished,
  loadPublishedRecord,
  publishContent,
  publishedDirectory,
};
