const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
process.env.HELPDESK_LOCAL_STORAGE = "true";
process.env.ADMIN_DRAFT_PATH = path.join(os.tmpdir(), `maths-draft-${process.pid}.json`);
process.env.PUBLISHED_CONTENT_PATH = path.join(os.tmpdir(), `maths-published-${process.pid}.json`);
const { saveMergedDraft, publishDraft, loadDraft } = require("../netlify/lib/admin-drafts");
const { publishContent, loadPublishedRecord } = require("../netlify/lib/content-store");
const canonical = require("../data/resources.json");
const clone = value => JSON.parse(JSON.stringify(value));
const unlink = data => {
  data.branches.forEach(b => b.semesters.forEach(s => { s.subjectIds = s.subjectIds.filter(id => id !== "maths-1"); }));
  return data;
};
test.after(async () => {
  await Promise.all([process.env.ADMIN_DRAFT_PATH, process.env.PUBLISHED_CONTENT_PATH].map(p => fs.unlink(p).catch(() => {})));
});
test("save, publish, then stale publish persist Mathematics and keep admin notes", async () => {
  const initial = clone(canonical);
  initial.unitCollections.find(s => s.id === "maths-1").units[0].handwrittenNotesUrl = "https://example.com/priyanshu.pdf";
  await publishContent("resources", initial, "test");
  const incoming = unlink(clone(initial));
  incoming.meta.description = "Unrelated admin edit";
  const saved = await saveMergedDraft("resources", incoming, "test");
  assert.ok(saved.data.branches[0].semesters[0].subjectIds.includes("maths-1"));
  await publishDraft("resources", "test", "", saved.draftId);
  const raw = await loadPublishedRecord("resources");
  assert.equal(raw.data.meta.description, incoming.meta.description);
  assert.equal(raw.data.unitCollections.find(s => s.id === "maths-1").units[0].handwrittenNotesUrl, "https://example.com/priyanshu.pdf");
  assert.equal(await loadDraft("resources"), null);
  const stale = unlink(clone(raw.data));
  stale.unitCollections = stale.unitCollections.filter(s => s.id !== "maths-1");
  await publishContent("resources", stale, "test");
  const persisted = (await loadPublishedRecord("resources")).data;
  assert.equal(persisted.unitCollections.find(s => s.id === "maths-1").units[0].handwrittenNotesUrl, "https://example.com/priyanshu.pdf");
  for (const branch of persisted.branches) {
    const semester = branch.semesters.find(s => s.id === (branch.group === "engineering" ? "semester-1" : "semester-2"));
    assert.ok(semester.subjectIds.includes("maths-1"));
  }
});
