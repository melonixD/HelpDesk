const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const STORE_NAME = "helpdesk-admin-control";
const STORE_KEY = "admin-state-v1";
const LOCAL_PATH = process.env.ADMIN_STATE_PATH || path.resolve(__dirname, "../../data/admin-state.local.json");
let localQueue = Promise.resolve();

function emptyState() {
  return { version: 2, registrations: [], regularAdmins: [], changeRequests: [], profiles: [] };
}

function normalize(value) {
  const state = value && typeof value === "object" ? value : emptyState();
  return {
    version: 2,
    registrations: Array.isArray(state.registrations) ? state.registrations : [],
    regularAdmins: Array.isArray(state.regularAdmins) ? state.regularAdmins : [],
    changeRequests: Array.isArray(state.changeRequests) ? state.changeRequests : [],
    profiles: Array.isArray(state.profiles) ? state.profiles : [],
  };
}

function netlifyRuntime() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.DEPLOY_ID);
}

async function store() {
  const { getStore } = require("@netlify/blobs");
  return getStore(STORE_NAME);
}

async function loadLocal() {
  try { return normalize(JSON.parse(await fs.readFile(LOCAL_PATH, "utf8"))); }
  catch (error) { if (error.code === "ENOENT") return emptyState(); throw error; }
}

async function saveLocal(state) {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  const temporary = `${LOCAL_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, LOCAL_PATH);
}

async function loadState() {
  if (!netlifyRuntime()) return loadLocal();
  const result = await (await store()).getWithMetadata(STORE_KEY, { type: "json", consistency: "strong" });
  return normalize(result && result.data);
}

async function mutateNetlify(mutator) {
  const blobs = await store();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await blobs.getWithMetadata(STORE_KEY, { type: "json", consistency: "strong" });
    const state = normalize(current && current.data);
    const result = await mutator(state);
    const write = await blobs.set(STORE_KEY, JSON.stringify(state), current
      ? { onlyIfMatch: current.etag, metadata: { updatedAt: new Date().toISOString() } }
      : { onlyIfNew: true, metadata: { updatedAt: new Date().toISOString() } });
    if (write.modified) return result;
  }
  const error = new Error("The admin queue changed at the same time. Please try again.");
  error.statusCode = 409;
  throw error;
}

async function mutateState(mutator) {
  if (netlifyRuntime()) return mutateNetlify(mutator);
  const operation = localQueue.then(async () => {
    const state = await loadLocal();
    const result = await mutator(state);
    await saveLocal(state);
    return result;
  });
  localQueue = operation.catch(() => {});
  return operation;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function cleanRegularAdmin(admin) {
  if (!admin) return null;
  const { passwordHash, ...safe } = admin;
  return {
    ...safe,
    role: admin.role === "branch" ? "branch" : "regular",
    coins: Number.isFinite(Number(admin.coins)) ? Number(admin.coins) : 0,
    contributions: Number.isFinite(Number(admin.contributions)) ? Number(admin.contributions) : 0,
  };
}

async function findRegularAdmin(username) {
  const wanted = String(username || "").toLowerCase();
  const state = await loadState();
  return state.regularAdmins.find((admin) => admin.active !== false && String(admin.username).toLowerCase() === wanted) || null;
}

module.exports = {
  cleanRegularAdmin,
  emptyState,
  findRegularAdmin,
  id,
  loadState,
  mutateState,
};
