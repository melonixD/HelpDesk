const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
process.env.HELPDESK_LOCAL_STORAGE = "true";
process.env.ADMIN_DRAFT_PATH = path.join(os.tmpdir(), `years-draft-${process.pid}.json`);
process.env.PUBLISHED_CONTENT_PATH = path.join(os.tmpdir(), `years-live-${process.pid}.json`);
const years = require("../public/year-wise-pyqs");
const { validateResources } = require("../netlify/lib/admin-content");
const { mergeContent } = require("../netlify/lib/content-merge");
const { resourceChanges, restoreInto } = require("../netlify/lib/admin-activity");
const { saveMergedDraft, publishDraft } = require("../netlify/lib/admin-drafts");
const { loadPublished, publishContent } = require("../netlify/lib/content-store");
const original = require("../data/resources.json");
const fresh = () => structuredClone(original);
const url = "https://drive.google.com/file/d/test-paper/view";
test.after(() => [process.env.ADMIN_DRAFT_PATH, process.env.PUBLISHED_CONTENT_PATH].forEach(p => { try { fs.unlinkSync(p); } catch {} }));

test("legacy subjects in every branch get independent empty years without losing content", () => {
  const data = fresh();
  data.unitCollections.forEach(subject => { delete subject.yearWisePyqs; });
  const units = JSON.stringify(data.unitCollections.map(subject => subject.units));
  validateResources(data);
  for (const branch of data.branches) for (const semester of branch.semesters) for (const id of semester.subjectIds) {
    const subject = data.unitCollections.find(item => item.id === id);
    assert.deepEqual(subject.yearWisePyqs.map(item => item.year), [2025, 2024, 2023, 2022]);
    assert.ok(subject.yearWisePyqs.every(item => years.papers.every(([field]) => !item[field])));
  }
  assert.equal(JSON.stringify(data.unitCollections.map(subject => subject.units)), units);
  data.unitCollections[0].yearWisePyqs = [];
  years.normalize(data);
  assert.deepEqual(data.unitCollections[0].yearWisePyqs, []);
  assert.equal(data.unitCollections[1].yearWisePyqs.length, 4);
});

test("new years validate and duplicate years or unsafe links are rejected", () => {
  const data = years.normalize(fresh());
  const rows = data.unitCollections[0].yearWisePyqs;
  rows.push(years.createYear(2026)); rows[0].midSem1Url = url;
  validateResources(data);
  rows[0].enabledPapers = ["midSem1Url", "endSemUrl"];
  validateResources(data);
  assert.deepEqual(years.activePapers(rows[0]).map(([field]) => field), ["midSem1Url", "endSemUrl"]);
  rows[0].enabledPapers.push("unknownPaper");
  assert.throws(() => validateResources(data), /unsupported paper section/);
  rows[0].enabledPapers.pop();
  rows[0].midSem1Url = "javascript:alert(1)";
  assert.throws(() => validateResources(data), /HTTPS Google Drive/);
  rows[0].midSem1Url = url; rows.push(years.createYear(2026, "another-id"));
  assert.throws(() => validateResources(data), /Duplicate PYQ year/);
});

test("concurrent changes merge different papers and reject a conflicting edit", () => {
  const base = fresh(); base.unitCollections.forEach(subject => delete subject.yearWisePyqs);
  const incoming = years.normalize(structuredClone(base)); const current = years.normalize(structuredClone(base));
  incoming.unitCollections[0].yearWisePyqs[0].midSem1Url = url;
  current.unitCollections[0].yearWisePyqs[1].endSemUrl = url + "?other=1";
  const merged = mergeContent(base, incoming, current);
  assert.equal(merged.unitCollections[0].yearWisePyqs[0].midSem1Url, url);
  assert.equal(merged.unitCollections[0].yearWisePyqs[1].endSemUrl, url + "?other=1");
  current.unitCollections[0].yearWisePyqs[0].midSem1Url = url + "?conflict=1";
  assert.throws(() => mergeContent(base, incoming, current), { statusCode: 409 });
});

test("deleting a year's papers records activity and restores the missing year", () => {
  const before = years.normalize(fresh()); before.unitCollections[0].yearWisePyqs[0].midSem1Url = url;
  const after = structuredClone(before); after.unitCollections[0].yearWisePyqs.shift();
  const removed = resourceChanges(before, after).find(change => change.restore && change.restore.year);
  assert.equal(removed.kind, "removed");
  assert.match(removed.location, /Year-Wise-PYQs/);
  const restored = restoreInto(after, removed);
  assert.equal(restored.unitCollections[0].yearWisePyqs.find(year => year.year === 2025).midSem1Url, url);
});

test("restoring a removed paper link also restores its exam section", () => {
  const before = years.normalize(fresh());
  const year = before.unitCollections[0].yearWisePyqs[0];
  year.midSem2Url = url;
  const after = structuredClone(before);
  const changedYear = after.unitCollections[0].yearWisePyqs[0];
  changedYear.enabledPapers = changedYear.enabledPapers.filter(field => field !== "midSem2Url");
  changedYear.midSem2Url = "";
  const removed = resourceChanges(before, after).find(change => change.restore && change.restore.field === "midSem2Url");
  const restored = restoreInto(after, removed);
  const restoredYear = restored.unitCollections[0].yearWisePyqs[0];
  assert.equal(restoredYear.midSem2Url, url);
  assert.ok(restoredYear.enabledPapers.includes("midSem2Url"));
});

test("saved paper links stay private until publish, then survive a later publication", async () => {
  await publishContent("resources", fresh(), "test");
  const data = await loadPublished("resources");
  data.unitCollections[0].yearWisePyqs.push(years.createYear(2027));
  data.unitCollections[0].yearWisePyqs.at(-1).endSemUrl = url;
  const draft = await saveMergedDraft("resources", data, "test");
  assert.ok(!(await loadPublished("resources")).unitCollections[0].yearWisePyqs.some(year => year.year === 2027));
  const result = await publishDraft("resources", "test", draft.draftId);
  assert.equal(result.deploying, false);
  const live = await loadPublished("resources");
  assert.equal(live.unitCollections[0].yearWisePyqs.at(-1).endSemUrl, url);
  live.unitCollections[0].description += " Updated.";
  await publishContent("resources", live, "another-admin");
  assert.equal((await loadPublished("resources")).unitCollections[0].yearWisePyqs.at(-1).endSemUrl, url);
});

test("public renderer shows nested years and Coming soon for all layouts", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const context = vm.createContext({ HelpDeskYearPyqs: years, HelpDeskAssets: {assetUrl: value => value}, window: {location:{origin:"https://example.com"}},
    materialIcons: {pyq:""}, escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;") });
  vm.runInContext(source.slice(source.indexOf("function renderYearWisePyqs("), source.indexOf("function renderSyllabi(")), context);
  for (const layout of [undefined, "shops", "core-resources"]) {
    const subject = {layout};
    const html = context.renderYearWisePyqs(subject);
    assert.match(html, /Year-Wise-PYQs/);
    assert.equal((html.match(/class="material-folder"/g) || []).length, 4);
    assert.equal((html.match(/class="unit-row/g) || []).length, 1);
    for (const label of ["Mid-sem 1", "Mid-sem 2", "End-sem", "Coming soon"]) assert.ok(html.includes(label));
    assert.ok(!html.includes("<a "));
    subject.yearWisePyqs[0].midSem1Url = url;
    assert.ok(context.renderYearWisePyqs(subject).includes(`href="${url}"`));
    subject.yearWisePyqs.forEach(year => { year.enabledPapers = ["midSem1Url", "endSemUrl"]; });
    const withoutMid2 = context.renderYearWisePyqs(subject);
    assert.ok(!withoutMid2.includes("Mid-sem 2"));
    assert.ok(withoutMid2.includes("Mid-sem 1"));
  }
});

test("admin offers per-paper removal and re-adding controls", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/admin/admin.js"), "utf8");
  const login = fs.readFileSync(path.join(__dirname, "../public/admin/index.html"), "utf8");
  assert.match(source, /data-remove-pyq-paper/);
  assert.match(source, /data-add-pyq-paper/);
  assert.match(source, /year\.enabledPapers = year\.enabledPapers\.filter/);
  assert.match(login, /id="login-remember"/);
  assert.match(source, /rememberMe: \$\("#login-remember"\)\.checked/);
});
