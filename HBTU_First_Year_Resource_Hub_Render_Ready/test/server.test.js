const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../server");

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("health endpoint reports ok", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.status, "ok");
  assert.equal(health.service, "HelpDesk");
});

test("resource endpoint returns seven subjects", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.subjects.length, 7);
});

test("resource filters narrow results", async () => {
  const response = await fetch(`${baseUrl}/api/resources?subject=chemistry&type=lecture&q=spectroscopy`);
  const data = await response.json();
  assert.equal(data.subjects.length, 1);
  assert.equal(data.subjects[0].resources.length, 1);
  assert.equal(data.subjects[0].resources[0].id, "chem-spectroscopy");
});

test("every subject includes a recommended books section", async () => {
  const response = await fetch(`${baseUrl}/api/resources?type=book`);
  const data = await response.json();
  assert.equal(data.subjects.length, 7);
  assert.ok(data.subjects.every((subject) => subject.resources.length === 1));
  assert.ok(data.subjects.every((subject) => subject.resources[0].type === "book"));
});

test("library exposes fourteen branches including Biotechnology", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  assert.equal(data.branches.length, 14);
  assert.equal(data.unitCollections.length, 21);
  const allSections = data.unitCollections.flatMap((subject) => subject.units);
  assert.equal(allSections.filter((section) => section.kind !== "lab").length, 105);
  assert.equal(allSections.filter((section) => section.kind === "lab").length, 1);
  assert.ok(data.branches.some((branch) => branch.name === "Mechanical Engineering"));
  assert.ok(data.branches.some((branch) => branch.name === "Electrical Engineering"));
  assert.ok(data.branches.some((branch) => branch.name === "Biotechnology" && branch.group === "technology"));
  assert.equal(data.branches.filter((branch) => branch.group === "engineering").length, 6);
  assert.equal(data.branches.filter((branch) => branch.group === "technology").length, 8);
});

test("resource hierarchy is branch, semester, subject and unit", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  const technologyBranches = data.branches.filter((branch) => branch.group === "technology");
  const engineeringBranches = data.branches.filter((branch) => branch.group === "engineering");
  const technologySubjects = ["chemistry", "bem", "bet", "pc", "ees", "workshop"];
  const engineeringSubjects = ["maths-1", "bee", "engineering-graphics", "engineering-physics", "uhv", "pps", "etw"];

  assert.ok(technologyBranches.every((branch) => branch.semesterSubjectIds["1"].length === 7));
  assert.ok(technologyBranches.every((branch) => technologySubjects.every((id) => branch.semesterSubjectIds["1"].includes(id))));
  assert.ok(technologyBranches.every((branch) => branch.semesterSubjectIds["2"].length === 7));
  assert.ok(technologyBranches.every((branch) => engineeringSubjects.every((id) => branch.semesterSubjectIds["2"].includes(id))));
  assert.ok(engineeringBranches.every((branch) => branch.semesterSubjectIds["1"].length === 7));
  assert.ok(engineeringBranches.every((branch) => engineeringSubjects.every((id) => branch.semesterSubjectIds["1"].includes(id))));
  assert.ok(engineeringBranches.every((branch) => branch.semesterSubjectIds["2"].length === 6));
  assert.ok(engineeringBranches.every((branch) => technologySubjects.every((id) => branch.semesterSubjectIds["2"].includes(id))));

  const engineeringNames = engineeringSubjects.map((id) => data.unitCollections.find((subject) => subject.id === id).name);
  assert.deepEqual(engineeringNames, [
    "Engineering Mathematics 1",
    "Basic Electrical Engineering (BEE)",
    "Engineering Graphics",
    "Engineering Physics",
    "Universal Human Value",
    "Programming and Problem Solving",
    "English and Technical Writing",
  ]);

  const coreIds = technologyBranches.map((branch) => branch.semesterSubjectIds["1"][6]);
  assert.equal(new Set(coreIds).size, 8);
  assert.ok(coreIds.every((id) => data.unitCollections.some((subject) => subject.id === id)));
});

test("syllabus is grouped into Engineering and Technology with nested semesters", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  assert.equal(data.syllabusGroups.length, 2);
  assert.deepEqual(data.syllabusGroups.map((group) => group.id), ["engineering", "technology"]);
  assert.ok(data.syllabusGroups.every((group) => group.semesters.length === 2));

  const engineering = data.syllabusGroups.find((group) => group.id === "engineering");
  const technology = data.syllabusGroups.find((group) => group.id === "technology");
  assert.equal(engineering.semesters[0].syllabusIds.length, 7);
  assert.deepEqual(engineering.semesters[1].syllabusIds, technology.semesters[0].syllabusIds);
  assert.equal(technology.semesters[0].id, "semester-1-technology");
  assert.equal(technology.semesters[0].syllabusIds.length, 7);
  assert.deepEqual(technology.semesters[1].syllabusIds, engineering.semesters[0].syllabusIds);

  const engineeringSemesterOne = engineering.semesters[0].syllabusIds
    .map((id) => data.syllabi.find((syllabus) => syllabus.id === id));
  assert.equal(engineeringSemesterOne.filter((syllabus) => syllabus.available).length, 4);
  assert.equal(engineeringSemesterOne.filter((syllabus) => !syllabus.available).length, 3);
  assert.equal(
    data.syllabi.find((syllabus) => syllabus.id === "bet").url,
    "https://drive.google.com/file/d/1Cog5QS-KKcT9hmxf1f79HJw_VZNjlbk5/view?usp=drivesdk"
  );
});

test("all PYQ sets remain linked and Chemistry uses the five replacement files", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  const pyqUrls = data.unitCollections.flatMap((subject) =>
    subject.units.map((unit) => unit.pyqUrl).filter(Boolean)
  );
  assert.equal(pyqUrls.length, 20);
  const chemistry = data.unitCollections.find((subject) => subject.id === "chemistry");
  assert.deepEqual(
    chemistry.units.filter((unit) => unit.kind !== "lab").map((unit) => unit.pyqUrl),
    [
      "https://drive.google.com/file/d/1Sxj3QgQ3aq53YWYkXhQcl2qzjrMe46Sg/view?usp=drivesdk",
      "https://drive.google.com/file/d/1QUbzAI54IugzF3WsbCGUBxjpQtMEDdH4/view",
      "https://drive.google.com/file/d/1ka_oF1TesvR9c2bgdPUgxhpk8z4a1ZNR/view",
      "https://drive.google.com/file/d/1kqVpRXgZZc7KFfGKSpOSJ9EeOvh8tlRK/view",
      "https://drive.google.com/file/d/1NxFkltxL0VLzoF52aSuzQ1JasCuJozpt/view",
    ]
  );
  assert.ok(chemistry.units.slice(0, 5).every((unit) => unit.practiceKey.startsWith("/resources/pyqs/")));
});

test("Chemistry Units 1–5 Master Notes open inline from the website", async () => {
  for (const unit of [1, 2, 3, 4, 5]) {
    const response = await fetch(`${baseUrl}/resources/notes/engineering-chemistry/Engineering_Chemistry_Unit_${unit}_Master_Notes.pdf`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
});

test("Engineering Chemistry includes split notes folders and Chemistry Lab", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  const chemistry = data.unitCollections.find((subject) => subject.id === "chemistry");
  assert.equal(chemistry.splitNotes, true);
  assert.equal(chemistry.units[0].masterNotesUrl, "/resources/notes/engineering-chemistry/Engineering_Chemistry_Unit_1_Master_Notes.pdf");
  assert.equal(chemistry.units[0].handwrittenNotesUrl, null);
  assert.ok(chemistry.units.slice(0, 5).every((unit, index) =>
    unit.masterNotesUrl === `/resources/notes/engineering-chemistry/Engineering_Chemistry_Unit_${index + 1}_Master_Notes.pdf`
  ));
  assert.equal(chemistry.units.at(-1).kind, "lab");
  assert.equal(
    chemistry.units.at(-1).labManualUrl,
    "https://drive.google.com/file/d/1ovxq8fHzhGVIYnYwS3L3hYRnqpjCYTqa/view?usp=drivesdk"
  );
  assert.equal(
    chemistry.units.at(-1).vivaQuestionsUrl,
    "https://drive.google.com/file/d/1pDN8Id0uViXtk5GeV6DRP52NnOB_zGfn/view?usp=drivesdk"
  );
  assert.equal(
    chemistry.units.at(-1).endSemesterQuestionsUrl,
    "https://drive.google.com/file/d/1spOjaCJT5v2S8kgO0A8_8jOBx6inLC6L/view"
  );
  assert.deepEqual(
    chemistry.units[4].lectureItems.map((lecture) => lecture.title),
    ["Water Analysis", "Polymers", "Solid Waste Management"]
  );
});

test("Engineering Mechanics includes five Master Notes and topic lecture folders", async () => {
  const response = await fetch(`${baseUrl}/api/resources`);
  const data = await response.json();
  const mechanics = data.unitCollections.find((subject) => subject.id === "bem");
  assert.equal(mechanics.splitNotes, true);
  assert.equal(mechanics.units[0].disableSubjectLecture, true);
  assert.equal(mechanics.units[0].lectureMessage, "Study from notes");
  assert.ok(mechanics.units.every((unit, index) =>
    unit.masterNotesUrl === `/resources/notes/engineering-mechanics/Engineering_Mechanics_Unit_${index + 1}_Master_Notes.pdf`
  ));
  assert.deepEqual(mechanics.units[2].lectureItems.map((lecture) => lecture.title), ["Trusses", "Beams"]);
  assert.deepEqual(mechanics.units[3].lectureItems.map((lecture) => lecture.title), ["Centroid", "Moment of Inertia"]);
  assert.deepEqual(mechanics.units[4].lectureItems.map((lecture) => lecture.title), ["Strength of Materials"]);

  for (const unit of [1, 2, 3, 4, 5]) {
    const notes = await fetch(`${baseUrl}/resources/notes/engineering-mechanics/Engineering_Mechanics_Unit_${unit}_Master_Notes.pdf`);
    assert.equal(notes.status, 200);
    assert.equal(notes.headers.get("content-type"), "application/pdf");
    assert.ok((await notes.arrayBuffer()).byteLength > 1000);
  }
});

test("spa fallback serves the website", async () => {
  const response = await fetch(`${baseUrl}/any-page`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<title>HelpDesk · HBTU<\/title>/);
  assert.match(html, /class="resource-browser"/);
  assert.match(html, /id="branch-list"/);
  assert.match(html, /id="semester-list"/);
  assert.match(html, /id="subject-list"/);
  assert.match(html, /id="subject-syllabus"/);
  assert.ok(html.indexOf('id="syllabus"') < html.indexOf('id="resources"'));
  assert.doesNotMatch(html, /resource-grid|30 resources across all subjects/);
});

test("hamburger menu has separate Placements and Notice Board entries", async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.match(html, /id="placements-open"/);
  assert.match(html, /id="notices-open"/);
  assert.match(html, /id="placements-open"[^>]*>Placements /);
  assert.match(html, /id="notices-open"[^>]*>Notice Board /);
  assert.doesNotMatch(html, /id="placements-open"[^>]*>Placements &amp; Notices/);
  assert.match(html, /id="placement-hub"/);
  assert.match(html, /id="placement-tab-stats"/);
  assert.match(html, /id="placement-tab-notices"/);

  const placementResponse = await fetch(`${baseUrl}/placements.json`);
  const placementData = await placementResponse.json();
  assert.equal(placementData.latest[0].session, "2025–26");
  assert.equal(placementData.latest[0].offers, 715);
  assert.equal(placementData.latest[0].studentsPlaced, 600);
  assert.equal(placementData.latest[1].offers, 708);
  assert.ok(placementData.reports.length >= 8);
});

test("mobile navigation keeps branch and subject lists available", async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.match(html, /id="branch-list"[\s\S]*Loading branches/);
  assert.match(html, /id="semester-list"[\s\S]*Loading semesters/);
  assert.match(html, /id="subject-list"[\s\S]*Loading subjects/);
  assert.doesNotMatch(html, /id="branch-select"|id="subject-select"/);
  assert.match(html, /<aside class="mobile-menu"[\s\S]*id="timer-ring"[\s\S]*id="task-form"[\s\S]*<\/aside>/);
  assert.doesNotMatch(html, /class="study-section/);
});

test("static resource fallback works and application assets cannot go stale", async () => {
  const fallback = await fetch(`${baseUrl}/resources.json`);
  const data = await fallback.json();
  assert.equal(fallback.status, 200);
  assert.equal(data.branches.length, 14);
  assert.match(fallback.headers.get("cache-control"), /no-store/);

  const script = await fetch(`${baseUrl}/app.js`);
  assert.match(script.headers.get("cache-control"), /no-store/);
  const scriptText = await script.text();
  assert.match(scriptText, /"\/resources\.json"/);
  assert.doesNotMatch(scriptText, /replaceAll|padStart|\?\?|\?\./);

  const styles = await fetch(`${baseUrl}/premium.css`);
  const styleText = await styles.text();
  assert.match(styleText, /touch-action: pan-y/);
  assert.match(styleText, /-webkit-overflow-scrolling: touch/);
  assert.match(styleText, /@keyframes subject-item-enter/);
  assert.match(styleText, /@keyframes semester-item-enter/);
  assert.match(styleText, /@keyframes unit-row-enter/);
  assert.match(scriptText, /animateBrowser\(changeType\)/);
  assert.match(scriptText, /renderSemesters\(branch\)/);
  assert.match(scriptText, /prefersReducedMotion\(\)/);
  assert.match(scriptText, /renderSubjectSyllabus\(branch, subject\)/);
  assert.match(scriptText, /renderMaterialFolder\(material\)/);
  assert.match(scriptText, /lectureChildren/);
  assert.match(scriptText, /End-Semester Lab Questions/);
  assert.match(scriptText, /practiceKeyForUnit\(unit\)/);
  assert.match(styleText, /\.material-folder-list/);
  assert.match(styleText, /\.unit-row > summary/);
  assert.match(scriptText, /syllabusGroups/);
  assert.match(scriptText, /syllabus-group/);
  assert.match(styleText, /\.syllabus-section \.overline[\s\S]*font-size: 16px/);
  assert.match(scriptText, /loadNoticeData\(\)/);
  assert.match(scriptText, /renderPlacementStats\(data\)/);
  assert.match(styleText, /\.placement-feature-grid/);
  assert.match(styleText, /\.notice-list/);
});

test("help section includes both supplied profiles and revealable WhatsApp contacts", async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.match(html, /id="help"/);
  assert.match(html, /images\/akshat-shukla\.png/);
  assert.match(html, /images\/priyanshu-dixit\.png/);
  assert.match(html, /87870 16664/);
  assert.match(html, /wa\.me\/919305819589/);
  assert.match(html, /93058 19589/);

  const image = await fetch(`${baseUrl}/images/akshat-shukla.png`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
});
