const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { TARGETS, validateTarget } = require("./admin-content");
const { publishContent } = require("./content-store");
const { isNetlifyRuntime } = require("./netlify-runtime");

const STORE_NAME = "helpdesk-admin-drafts";
const LOCAL_PATH = process.env.ADMIN_DRAFT_PATH || path.resolve(__dirname, "../../data/admin-drafts.local.json");
let localQueue = Promise.resolve();

function normalize(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function blobStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore(STORE_NAME);
}

function draftPrefix(target) {
  return `draft:${target}:v2:`;
}

function createDraftId() {
  return `${String(Date.now()).padStart(13, "0")}-${crypto.randomBytes(8).toString("hex")}`;
}

function validDraftId(value) {
  return /^\d{13}-[a-f0-9]{16}$/.test(String(value || ""));
}

async function readVersionedDraft(target, draftId) {
  const storage = await blobStore();
  let keys;
  if (draftId) {
    if (!validDraftId(draftId)) return null;
    keys = [`${draftPrefix(target)}${draftId}`];
  } else {
    const listing = await storage.list({ prefix: draftPrefix(target) });
    keys = listing.blobs.map((item) => item.key).sort().reverse();
  }
  for (const key of keys) {
    const result = await storage.getWithMetadata(key, { type: "json" });
    const draft = result && result.data;
    if (draft && draft.target === target && (draft.deleted || draft.data)) return draft;
  }
  return null;
}

async function loadLocal() {
  try { return normalize(JSON.parse(await fs.readFile(LOCAL_PATH, "utf8"))); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

async function saveLocal(value) {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  const temporary = `${LOCAL_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, LOCAL_PATH);
}

async function loadDraft(target, draftId) {
  if (!TARGETS[target]) return null;
  if (isNetlifyRuntime()) {
    const versioned = await readVersionedDraft(target, draftId);
    if (versioned || draftId) return versioned && !versioned.deleted ? versioned : null;
    const result = await (await blobStore()).getWithMetadata(`draft:${target}`, { type: "json" });
    return result && result.data && result.data.data ? result.data : null;
  }
  const drafts = await loadLocal();
  return drafts[target] || null;
}

async function saveDraft(target, data, author) {
  const validated = validateTarget(target, data);
  const draft = {
    draftId: createDraftId(),
    target,
    data: validated,
    updatedAt: new Date().toISOString(),
    updatedBy: String(author || "main-admin").slice(0, 100),
  };
  if (isNetlifyRuntime()) {
    const result = await (await blobStore()).setJSON(`${draftPrefix(target)}${draft.draftId}`, draft, {
      metadata: { target, draftId: draft.draftId, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy },
      onlyIfNew: true,
    });
    if (!result.modified) throw new Error("Could not create a unique draft version. Please save again.");
    return draft;
  }
  const operation = localQueue.then(async () => {
    const drafts = await loadLocal();
    drafts[target] = draft;
    await saveLocal(drafts);
    return draft;
  });
  localQueue = operation.catch(() => {});
  return operation;
}

async function removeDraft(target, author, publishedDraftId) {
  if (!TARGETS[target]) return;
  if (isNetlifyRuntime()) {
    const latest = await readVersionedDraft(target);
    if (publishedDraftId && latest && latest.draftId !== publishedDraftId) return;
    const tombstone = {
      draftId: createDraftId(),
      target,
      deleted: true,
      deletedDraftId: publishedDraftId || (latest && latest.draftId) || null,
      updatedAt: new Date().toISOString(),
      updatedBy: String(author || "main-admin").slice(0, 100),
    };
    await (await blobStore()).setJSON(`${draftPrefix(target)}${tombstone.draftId}`, tombstone, {
      metadata: { target, draftId: tombstone.draftId, deleted: true, updatedAt: tombstone.updatedAt },
      onlyIfNew: true,
    });
    return;
  }
  const operation = localQueue.then(async () => {
    const drafts = await loadLocal();
    delete drafts[target];
    await saveLocal(drafts);
  });
  localQueue = operation.catch(() => {});
  return operation;
}

async function draftDirectory() {
  const entries = await Promise.all(Object.keys(TARGETS).map(async (target) => [target, await loadDraft(target)]));
  return Object.fromEntries(entries.filter(([, draft]) => draft).map(([target, draft]) => [target, {
    draftId: draft.draftId || null,
    updatedAt: draft.updatedAt,
    updatedBy: draft.updatedBy,
  }]));
}

async function publishDraft(target, author, message, draftId) {
  const draft = await loadDraft(target, draftId);
  if (!draft) {
    const error = new Error("No saved draft exists for this section. Save the draft first.");
    error.statusCode = 409;
    throw error;
  }
  const result = await publishContent(target, draft.data, author);
  await removeDraft(target, author, draft.draftId);
  return {
    target,
    publishedAt: result.publishedAt,
    publishedBy: result.publishedBy,
    version: result.version,
    delivery: "netlify-blobs",
    deploying: false,
    message: String(message || "").slice(0, 120),
  };
}

module.exports = { draftDirectory, loadDraft, publishDraft, removeDraft, saveDraft };
