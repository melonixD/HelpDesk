"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { isNetlifyRuntime } = require("./netlify-runtime");
const { loadDraft, saveMergedDraft } = require("./admin-drafts");
const { loadPublishedRecord, loadPublished } = require("./content-store");

const STORE_NAME = "helpdesk-admin-activity";
const LOCAL_PATH = process.env.ADMIN_ACTIVITY_PATH || path.resolve(__dirname, "../../data/admin-activity.local.json");
const URL_FIELDS = {
  lectureUrl: "Lecture", notesUrl: "Notes", handwrittenNotesUrl: "Handwritten notes", masterNotesUrl: "Master notes",
  pyqUrl: "PYQs", practiceKey: "Practice source", bookUrl: "Book", booksUrl: "Books",
  workshopFileUrl: "Workshop file", classNotesUrl: "Class notes", labManualUrl: "Lab manual",
  vivaQuestionsUrl: "Viva questions", endSemesterQuestionsUrl: "End-semester questions", experimentVideosUrl: "Experiment videos",
};
let localQueue = Promise.resolve();

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function eventId() { return String(Date.now()).padStart(13, "0") + "-" + crypto.randomBytes(8).toString("hex"); }
async function blobStore() { const { getStore } = require("@netlify/blobs"); return getStore(STORE_NAME); }

async function loadLocal() {
  try { const value = JSON.parse(await fs.readFile(LOCAL_PATH, "utf8")); return Array.isArray(value) ? value : []; }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function saveLocal(value) {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  const temporary = LOCAL_PATH + "." + process.pid + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await fs.rename(temporary, LOCAL_PATH);
}

async function appendActivity(input) {
  const record = {
    id: eventId(), actor: String(input.actor || "system").slice(0, 100),
    action: String(input.action || "updated").slice(0, 80), summary: String(input.summary || "Updated content").slice(0, 500),
    target: String(input.target || "resources").slice(0, 80), createdAt: new Date().toISOString(),
    changes: Array.isArray(input.changes) ? input.changes.slice(0, 500) : [],
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
  if (isNetlifyRuntime()) {
    const result = await (await blobStore()).setJSON("activity:" + record.id, record, {
      metadata: { actor: record.actor, action: record.action, createdAt: record.createdAt }, onlyIfNew: true,
    });
    if (!result.modified) throw new Error("Could not record admin activity.");
    return record;
  }
  const operation = localQueue.then(async () => {
    const list = await loadLocal(); list.unshift(record); await saveLocal(list.slice(0, 2000)); return record;
  });
  localQueue = operation.catch(() => {});
  return operation;
}

async function getActivity(id) {
  if (!/^\d{13}-[a-f0-9]{16}$/.test(String(id || ""))) return null;
  if (isNetlifyRuntime()) {
    const result = await (await blobStore()).getWithMetadata("activity:" + id, { type: "json" });
    return result && result.data ? result.data : null;
  }
  return (await loadLocal()).find((item) => item.id === id) || null;
}

async function listActivity(limit = 120) {
  const maximum = Math.max(1, Math.min(Number(limit) || 120, 500));
  let records;
  if (isNetlifyRuntime()) {
    const storage = await blobStore();
    const listing = await storage.list({ prefix: "activity:" });
    const keys = listing.blobs.map((item) => item.key).sort().reverse().slice(0, maximum);
    records = (await Promise.all(keys.map(async (key) => {
      const result = await storage.getWithMetadata(key, { type: "json" }); return result && result.data;
    }))).filter(Boolean);
  } else records = (await loadLocal()).slice(0, maximum);
  const restored = new Set(records.map((item) => item.metadata && item.metadata.restoredChangeId).filter(Boolean));
  return records.map((item) => ({ ...item, changes: (item.changes || []).map((change) => ({ ...change, restored: restored.has(change.id) })) }));
}

function unitToken(unit, index) { return String(unit.number ?? index + 1) + "::" + String(unit.title || ""); }
function resourceMap(data) {
  const result = new Map();
  const collections = data && Array.isArray(data.unitCollections) ? data.unitCollections : [];
  const addScalar = (subject, unit, field, value, unitIndex) => {
    if (!value) return;
    const token = unit ? unitToken(unit, unitIndex) : "subject";
    result.set(subject.id + "|" + token + "|" + field, {
      value, label: URL_FIELDS[field] || field, location: subject.name + (unit ? " · " + (unit.title || ("Unit " + unit.number)) : ""),
      restore: { subjectId: subject.id, unit: unit ? { number: unit.number, title: unit.title } : null, field, value },
    });
  };
  const addItems = (subject, unit, field, items, unitIndex) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || !item.url) return;
      const token = unit ? unitToken(unit, unitIndex) : "subject";
      result.set(subject.id + "|" + token + "|" + field + "|" + item.url, {
        value: clone(item), label: item.title || (field === "books" ? "Book" : "Lecture"),
        location: subject.name + (unit ? " · " + (unit.title || ("Unit " + unit.number)) : ""),
        restore: { subjectId: subject.id, unit: unit ? { number: unit.number, title: unit.title } : null, field, item: clone(item) },
      });
    });
  };
  collections.forEach((subject) => {
    (subject.yearWisePyqs || []).forEach(year => {
      require("../../public/year-wise-pyqs").papers.forEach(([field, label]) => {
        if (!year[field]) return;
        result.set(`${subject.id}|year:${year.id}|${field}`, {
          value: year[field], label, location: `${subject.name} · Year-Wise-PYQs · ${year.year}`,
          restore: { subjectId: subject.id, year: { id: year.id, year: year.year }, field, value: year[field] },
        });
      });
    });
    Object.keys(URL_FIELDS).forEach((field) => addScalar(subject, null, field, subject[field], 0));
    addItems(subject, null, "books", subject.books, 0); addItems(subject, null, "lectureItems", subject.lectureItems, 0);
    (subject.units || []).forEach((unit, unitIndex) => {
      Object.keys(URL_FIELDS).forEach((field) => addScalar(subject, unit, field, unit[field], unitIndex));
      addItems(subject, unit, "books", unit.books, unitIndex); addItems(subject, unit, "lectureItems", unit.lectureItems, unitIndex);
    });
  });
  return result;
}

function resourceChanges(before, after) {
  const oldItems = resourceMap(before); const newItems = resourceMap(after); const changes = [];
  const { placements } = require("./subject-recovery");
  const deleted = new Set();
  (before.unitCollections || []).forEach((subject, index) => {
    const exists = (after.unitCollections || []).some(item => item.id === subject.id);
    const remaining = new Set(placements(after, subject.id).map(item => item.branchId + "/" + item.semesterId));
    const removed = placements(before, subject.id).filter(item => !remaining.has(item.branchId + "/" + item.semesterId));
    if (exists && !removed.length) return;
    if (!exists) deleted.add(subject.id);
    const restore = { type: exists ? "placement" : "subject", subject: clone(subject), index, placements: removed };
    changes.push({ id: crypto.randomBytes(12).toString("hex"), kind: "removed", label: subject.name,
      location: exists ? "Removed semester links" : "Deleted whole subject",
      before: `${(subject.units || []).length} units/sections · ${removed.length} semester links`, after: null, restore });
  });
  for (const [key, previous] of oldItems) {
    if (deleted.has(previous.restore.subjectId)) continue;
    const next = newItems.get(key);
    if (next && JSON.stringify(previous.value) === JSON.stringify(next.value)) continue;
    if (next) {
      changes.push({ id: crypto.createHash("sha256").update("updated:" + key + ":" + JSON.stringify(next.value)).digest("hex").slice(0, 24),
        kind: "updated", label: next.label, location: next.location, before: previous.value, after: next.value, restore: null });
      continue;
    }
    changes.push({ id: crypto.createHash("sha256").update("removed:" + key + ":" + JSON.stringify(previous.value)).digest("hex").slice(0, 24),
      kind: "removed", label: previous.label, location: previous.location, before: previous.value, after: null, restore: previous.restore });
  }
  for (const [key, next] of newItems) {
    if (oldItems.has(key)) continue;
    changes.push({ id: crypto.createHash("sha256").update("added:" + key + ":" + JSON.stringify(next.value)).digest("hex").slice(0, 24),
      kind: "added", label: next.label, location: next.location, before: null, after: next.value, restore: null });
  }
  return changes;
}

async function logContentActivity(before, after, actor, context = {}) {
  const changes = resourceChanges(before, after);
  if (!changes.length && context.target === "resources") return null;
  return appendActivity({ actor, action: context.action || "content-updated",
    summary: context.summary || (changes.length + " resource change" + (changes.length === 1 ? "" : "s")),
    target: context.target || "resources", changes, metadata: context.metadata || {} });
}

function findUnit(subject, descriptor) {
  if (!descriptor) return subject;
  return (subject.units || []).find((unit) => String(unit.number) === String(descriptor.number) && String(unit.title || "") === String(descriptor.title || ""))
    || (subject.units || []).find((unit) => String(unit.number) === String(descriptor.number));
}
function restoreInto(data, change) {
  const next = clone(data); const descriptor = change && change.restore;
  if (!descriptor) throw Object.assign(new Error("This activity item cannot be restored."), { statusCode: 400 });
  if (descriptor.subject) return require("./subject-recovery").restoreSubject(data, descriptor);
  const subject = (next.unitCollections || []).find((item) => item.id === descriptor.subjectId);
  if (!subject) throw Object.assign(new Error("The original subject no longer exists."), { statusCode: 409 });
  let target;
  if (descriptor.year) {
    const yearPyqs = require("../../public/year-wise-pyqs");
    yearPyqs.ensureSubject(subject);
    target = subject.yearWisePyqs.find(year => year.id === descriptor.year.id)
      || subject.yearWisePyqs.find(year => String(year.year) === String(descriptor.year.year));
    if (!target) {
      target = yearPyqs.createYear(descriptor.year.year, descriptor.year.id);
      subject.yearWisePyqs.push(target);
    }
  } else target = findUnit(subject, descriptor.unit);
  if (!target) throw Object.assign(new Error("The original section no longer exists."), { statusCode: 409 });
  if (descriptor.item) {
    target[descriptor.field] = Array.isArray(target[descriptor.field]) ? target[descriptor.field] : [];
    if (!target[descriptor.field].some((item) => item && item.url === descriptor.item.url)) target[descriptor.field].push(clone(descriptor.item));
  } else if (!target[descriptor.field]) target[descriptor.field] = descriptor.value;
  return next;
}

async function restoreResourceChange(activityId, changeId, actor) {
  const event = await getActivity(activityId);
  const change = event && (event.changes || []).find((item) => item.id === changeId && item.kind === "removed");
  if (!change) throw Object.assign(new Error("The deleted resource could not be found in activity history."), { statusCode: 404 });
  const currentDraft = await loadDraft("resources");
  const published = currentDraft ? null : await loadPublishedRecord("resources");
  const current = currentDraft ? currentDraft.data : (published ? published.data : await loadPublished("resources"));
  const restored = restoreInto(current, change);
  const draft = await saveMergedDraft("resources", restored, actor, {
    baseDraftId: currentDraft && currentDraft.draftId, basePublishedVersion: published && published.version,
  });
  await appendActivity({ actor, action: "resource-restored", summary: "Restored " + change.label + " in " + change.location,
    target: "resources", changes: [{ ...change, kind: "restored", before: null, after: change.before, restore: null }],
    metadata: { restoredActivityId: activityId, restoredChangeId: changeId } });
  return draft;
}

module.exports = { STORE_NAME, appendActivity, getActivity, listActivity, logContentActivity, resourceChanges, restoreInto, restoreResourceChange };
