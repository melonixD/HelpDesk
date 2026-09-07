const test = require("node:test");
const assert = require("node:assert/strict");
const { recoverMaths, restoreSubject, placements } = require("../netlify/lib/subject-recovery");
const { resourceChanges, restoreInto } = require("../netlify/lib/admin-activity");
const canonical = require("../data/resources.json");
const clone = value => JSON.parse(JSON.stringify(value));
function deletedMaths() {
  const data = clone(canonical);
  data.unitCollections = data.unitCollections.filter(item => item.id !== "maths-1");
  data.branches.forEach(branch => branch.semesters.forEach(semester => {
    semester.subjectIds = semester.subjectIds.filter(id => id !== "maths-1");
  }));
  return data;
}
test("incident recovery restores Mathematics in all fourteen expected semesters", () => {
  const restored = recoverMaths(deletedMaths(), "2026-09-06T00:00:00Z");
  assert.equal(placements(restored, "maths-1").length, 14);
  assert.deepEqual(restored.unitCollections.find(s => s.id === "maths-1"), canonical.unitCollections.find(s => s.id === "maths-1"));
  restored.branches.forEach(branch => {
    const id = branch.group === "engineering" ? "semester-1" : "semester-2";
    assert.ok(branch.semesters.find(s => s.id === id).subjectIds.includes("maths-1"));
  });
  assert.deepEqual(recoverMaths(restored), restored);
  assert.equal(recoverMaths(deletedMaths(), "2099-01-01").unitCollections.some(s => s.id === "maths-1"), false);
});
test("whole subject snapshots restore custom notes and all placements", () => {
  const before = clone(canonical);
  before.unitCollections.find(s => s.id === "maths-1").units[0].masterNotesUrl = "/uploads/custom.pdf";
  const after = deletedMaths();
  const change = resourceChanges(before, after).find(c => c.restore && c.restore.type === "subject");
  assert.ok(change);
  const restored = restoreInto(after, change);
  assert.deepEqual(restored, before);
  assert.deepEqual(restoreInto(restored, change), restored);
  restored.unitCollections.find(s => s.id === "maths-1").name = "Different subject";
  assert.throws(() => restoreInto(restored, change), /different subject/i);
});
test("unlink recovery preserves edits to the surviving subject", () => {
  const after = clone(canonical);
  after.branches[0].semesters[0].subjectIds = after.branches[0].semesters[0].subjectIds.filter(id => id !== "maths-1");
  const change = resourceChanges(canonical, after).find(c => c.restore && c.restore.type === "placement");
  after.unitCollections.find(s => s.id === "maths-1").description = "Latest description";
  const restored = restoreInto(after, change);
  assert.equal(placements(restored, "maths-1").length, 14);
  assert.equal(restored.unitCollections.find(s => s.id === "maths-1").description, "Latest description");
});
