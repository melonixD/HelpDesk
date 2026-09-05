const fs = require("node:fs/promises");
const path = require("node:path");
const { commitJson, TARGETS, validateTarget } = require("./admin-content");
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

async function loadDraft(target) {
  if (!TARGETS[target]) return null;
  if (isNetlifyRuntime()) {
    const result = await (await blobStore()).getWithMetadata(`draft:${target}`, { type: "json" });
    return result && result.data && result.data.data ? result.data : null;
  }
  const drafts = await loadLocal();
  return drafts[target] || null;
}

async function saveDraft(target, data, author) {
  validateTarget(target, data);
  const draft = {
    target,
    data,
    updatedAt: new Date().toISOString(),
    updatedBy: String(author || "main-admin").slice(0, 100),
  };
  if (isNetlifyRuntime()) {
    await (await blobStore()).set(`draft:${target}`, JSON.stringify(draft), { metadata: { updatedAt: draft.updatedAt, updatedBy: draft.updatedBy } });
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

async function removeDraft(target) {
  if (!TARGETS[target]) return;
  if (isNetlifyRuntime()) return (await blobStore()).delete(`draft:${target}`);
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
  return Object.fromEntries(entries.filter(([, draft]) => draft).map(([target, draft]) => [target, { updatedAt: draft.updatedAt, updatedBy: draft.updatedBy }]));
}

async function publishDraft(target, author, message) {
  const draft = await loadDraft(target);
  if (!draft) {
    const error = new Error("No saved draft exists for this section. Save the draft first.");
    error.statusCode = 409;
    throw error;
  }
  const result = await commitJson(target, draft.data, message || `Publish ${target} from HelpDesk admin`);
  await removeDraft(target);
  return { ...result, publishedAt: new Date().toISOString(), publishedBy: author };
}

module.exports = { draftDirectory, loadDraft, publishDraft, removeDraft, saveDraft };
