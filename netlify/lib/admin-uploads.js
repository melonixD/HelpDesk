const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { isNetlifyRuntime } = require("./netlify-runtime");

const CHUNK_BYTES = 1536 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LOCAL_DIR = path.join(os.tmpdir(), "helpdesk-admin-uploads");
const PUBLIC_UPLOADS = path.resolve(__dirname, "../../public/uploads");
const TEMP_STORE_NAME = "helpdesk-admin-uploads";
const ASSET_STORE_NAME = "helpdesk-public-assets";
const TYPES = {
  "application/pdf": { extension: ".pdf", kind: "pdf", maximum: MAX_PDF_BYTES },
  "image/jpeg": { extension: ".jpg", kind: "image", maximum: MAX_IMAGE_BYTES },
  "image/png": { extension: ".png", kind: "image", maximum: MAX_IMAGE_BYTES },
  "image/webp": { extension: ".webp", kind: "image", maximum: MAX_IMAGE_BYTES },
};

function safeId(value, label) {
  const result = String(value || "");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(result)) throw Object.assign(new Error(`${label} is invalid.`), { statusCode: 400 });
  return result;
}

function uploadType(contentType) {
  const value = TYPES[String(contentType || "").toLowerCase()];
  if (!value) throw Object.assign(new Error("Only PDF, PNG, JPEG, and WebP files are supported."), { statusCode: 400 });
  return value;
}

function ensureSize(size, type) {
  const bytes = Number(size);
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > type.maximum) {
    const limit = Math.round(type.maximum / 1024 / 1024);
    throw Object.assign(new Error(`This ${type.kind} must be smaller than ${limit} MB.`), { statusCode: 400 });
  }
  return bytes;
}

function verifyMagic(buffer, contentType) {
  if (contentType === "application/pdf" && buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return false;
  if (contentType === "image/png" && buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
  if (contentType === "image/jpeg" && buffer.subarray(0, 3).toString("hex") !== "ffd8ff") return false;
  if (contentType === "image/webp" && !(buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")) return false;
  return true;
}

async function blobStore(name = TEMP_STORE_NAME) {
  const { getStore } = require("@netlify/blobs");
  return getStore(name);
}

function arrayBufferFrom(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function putTemporary(key, data, metadata) {
  if (isNetlifyRuntime()) return (await blobStore()).set(key, data, { metadata });
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, encodeURIComponent(key)), data);
  if (metadata) await fs.writeFile(path.join(LOCAL_DIR, `${encodeURIComponent(key)}.json`), JSON.stringify(metadata));
}

async function getTemporary(key) {
  if (isNetlifyRuntime()) {
    const result = await (await blobStore()).getWithMetadata(key, { type: "arrayBuffer" });
    return result ? { data: Buffer.from(result.data), metadata: result.metadata || {} } : null;
  }
  try {
    const data = await fs.readFile(path.join(LOCAL_DIR, encodeURIComponent(key)));
    let metadata = {};
    try { metadata = JSON.parse(await fs.readFile(path.join(LOCAL_DIR, `${encodeURIComponent(key)}.json`), "utf8")); } catch {}
    return { data, metadata };
  } catch { return null; }
}

async function removeTemporary(key) {
  if (isNetlifyRuntime()) return (await blobStore()).delete(key);
  await Promise.allSettled([
    fs.unlink(path.join(LOCAL_DIR, encodeURIComponent(key))),
    fs.unlink(path.join(LOCAL_DIR, `${encodeURIComponent(key)}.json`)),
  ]);
}

async function saveFinal(key, data, metadata) {
  if (isNetlifyRuntime()) {
    const assets = await blobStore(ASSET_STORE_NAME);
    const result = await assets.set(key, arrayBufferFrom(data), { metadata });
    const saved = await assets.getMetadata(key);
    if (!result.modified || !saved) {
      throw Object.assign(new Error("The file could not be verified in permanent storage. Please upload it again."), { statusCode: 503 });
    }
    return result;
  }
  await fs.mkdir(PUBLIC_UPLOADS, { recursive: true });
  await fs.writeFile(path.join(PUBLIC_UPLOADS, key), data);
}

async function removeFinal(key) {
  if (!/^[a-z0-9-]{10,100}\.(pdf|png|jpg|webp)$/.test(String(key || ""))) return;
  if (isNetlifyRuntime()) return;
  await fs.unlink(path.join(PUBLIC_UPLOADS, key)).catch(() => {});
}

async function readStoredAsset(key) {
  const locations = [
    [ASSET_STORE_NAME, key],
    [TEMP_STORE_NAME, `asset:${key}`],
    [TEMP_STORE_NAME, key],
    [TEMP_STORE_NAME, `uploads/${key}`],
  ];
  const results = await Promise.all(locations.map(async ([storeName, storedKey]) =>
    (await blobStore(storeName)).getWithMetadata(storedKey, { type: "arrayBuffer" })));
  const result = results.find(Boolean);
  return result ? { data: Buffer.from(result.data), metadata: result.metadata || {} } : null;
}

async function readFinal(key) {
  if (!/^[a-z0-9-]{10,100}\.(pdf|png|jpg|webp)$/.test(String(key || ""))) return null;
  if (isNetlifyRuntime()) {
    return readStoredAsset(key);
  }
  try {
    const data = await fs.readFile(path.join(PUBLIC_UPLOADS, key));
    const extension = path.extname(key).slice(1);
    const contentType = extension === "pdf" ? "application/pdf" : extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return { data, metadata: { contentType, name: key } };
  } catch { return null; }
}

async function acceptChunk(body) {
  const uploadId = safeId(body.uploadId, "Upload id");
  const contentType = String(body.contentType || "").toLowerCase();
  const type = uploadType(contentType);
  const size = ensureSize(body.size, type);
  const totalChunks = Number(body.totalChunks);
  const index = Number(body.index);
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > Math.ceil(type.maximum / CHUNK_BYTES) + 1 || !Number.isInteger(index) || index < 0 || index >= totalChunks) {
    throw Object.assign(new Error("Chunk information is invalid."), { statusCode: 400 });
  }
  const data = Buffer.from(String(body.data || ""), "base64");
  if (!data.length || data.length > CHUNK_BYTES + 32) throw Object.assign(new Error("Upload chunk is invalid."), { statusCode: 400 });
  const metadata = { uploadId, contentType, size, totalChunks, name: String(body.name || "upload").slice(0, 180), createdAt: Date.now() };
  await putTemporary(`chunk:${uploadId}:${index}`, data, metadata);
  return { received: true, index };
}

async function completeUpload(body) {
  const uploadId = safeId(body.uploadId, "Upload id");
  const contentType = String(body.contentType || "").toLowerCase();
  const type = uploadType(contentType);
  const size = ensureSize(body.size, type);
  const totalChunks = Number(body.totalChunks);
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > Math.ceil(type.maximum / CHUNK_BYTES) + 1) {
    throw Object.assign(new Error("Upload is incomplete."), { statusCode: 400 });
  }
  const chunks = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const item = await getTemporary(`chunk:${uploadId}:${index}`);
    if (!item || item.metadata.contentType !== contentType || Number(item.metadata.size) !== size || Number(item.metadata.totalChunks) !== totalChunks) {
      throw Object.assign(new Error("One or more upload chunks are missing."), { statusCode: 400 });
    }
    chunks.push(item.data);
  }
  const data = Buffer.concat(chunks);
  if (data.length !== size || !verifyMagic(data, contentType)) throw Object.assign(new Error("The uploaded file failed validation."), { statusCode: 400 });
  const digest = crypto.createHash("sha256").update(data).digest("hex").slice(0, 24);
  const key = `${type.kind}-v2-${digest}${type.extension}`;
  const metadata = { contentType, name: String(body.name || "upload").slice(0, 180), size, uploadedAt: new Date().toISOString() };
  await saveFinal(key, data, metadata);
  // Uploaded URLs may be reused in several branches or sections. Never delete
  // the previous object here; removing it would break every other reference.
  await Promise.all(chunks.map((_, index) => removeTemporary(`chunk:${uploadId}:${index}`)));
  return { uploaded: true, url: `/uploads/${key}`, name: metadata.name, size, contentType };
}

module.exports = { CHUNK_BYTES, acceptChunk, completeUpload, readFinal };
