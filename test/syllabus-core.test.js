const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const syllabus = require("../public/syllabus-core");
const { validateResources } = require("../netlify/lib/admin-content");
const bundled = require("../data/resources.json");
const fresh = () => structuredClone(bundled);

test("legacy content receives Technology Core once without duplicating core files", () => {
  const data = fresh();
  delete data.meta.syllabusSchemaVersion;
  const coreIds = new Set(syllabus.coreSyllabi.map((item) => item.id));
  data.syllabi = data.syllabi.filter((item) => !coreIds.has(item.id) || item.id === "food-tech");
  data.syllabusGroups.forEach((group) => {
    group.semesters = group.semesters.filter((folder) => folder.id !== syllabus.CORE_FOLDER_ID);
  });
  data.syllabusGroups.find((group) => group.id === "technology").semesters[0].syllabusIds.push("food-tech");

  syllabus.ensure(data);
  const technology = data.syllabusGroups.find((group) => group.id === "technology");
  const core = technology.semesters.find((folder) => folder.id === syllabus.CORE_FOLDER_ID);
  assert.deepEqual(core.syllabusIds, syllabus.coreSyllabi.map((item) => item.id));
  assert.equal(new Set(data.syllabi.map((item) => item.id)).size, data.syllabi.length);
  assert.ok(data.syllabusGroups.flatMap((group) => group.semesters)
    .filter((folder) => folder.id !== syllabus.CORE_FOLDER_ID)
    .every((folder) => folder.syllabusIds.every((id) => !coreIds.has(id))));
});

test("admin removals stay removed after the one-time migration", () => {
  const data = syllabus.ensure(fresh());
  const technology = data.syllabusGroups.find((group) => group.id === "technology");
  technology.semesters = technology.semesters.filter((folder) => folder.id !== syllabus.CORE_FOLDER_ID);
  syllabus.ensure(data);
  assert.ok(!technology.semesters.some((folder) => folder.id === syllabus.CORE_FOLDER_ID));
});

test("custom syllabus sections and core Google Drive links validate", () => {
  const data = fresh();
  const paint = data.syllabi.find((item) => item.id === "paint-core");
  paint.url = "https://drive.google.com/file/d/paint-core/view";
  paint.available = true;
  data.syllabusGroups.find((group) => group.id === "technology").semesters.push({
    id: "extra-core-section", title: "Additional Core", subtitle: "Added by an admin", syllabusIds: ["paint-core"],
  });
  assert.doesNotThrow(() => validateResources(data));
});

test("public syllabus renders Technology Core and all eight core branches", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const target = { innerHTML: "", querySelectorAll: () => [] };
  const context = vm.createContext({
    state: { data: fresh() }, elements: { "syllabus-list": target },
    twoDigits: (value) => String(value).padStart(2, "0"), escapeHtml: (value) => String(value),
    openableResourceUrl: (value) => value,
  });
  vm.runInContext(source.slice(source.indexOf("function renderSyllabi()"), source.indexOf("function updateStats()")), context);
  context.renderSyllabi();
  assert.match(target.innerHTML, /Technology branches · 3 sections/);
  assert.match(target.innerHTML, />Core</);
  syllabus.coreSyllabi.forEach((item) => assert.ok(target.innerHTML.includes(item.title), item.title));
});

test("admin offers add, remove, link and URL controls for syllabus sections", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/admin/admin.js"), "utf8");
  for (const marker of ["data-syl-add-section", "data-syl-delete-section", "data-syl-file-add", "data-syl-unlink", "Google Drive or PDF URL"]) {
    assert.ok(source.includes(marker), marker);
  }
});

