const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const TARGETS = {
  resources: "data/resources.json",
  placements: "data/placements.json",
  notices: "data/notices-fallback.json",
  scholarships: "data/scholarships-fallback.json",
};
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object.`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array.`);
  return value;
}

function text(value, label, options) {
  const allowEmpty = options && options.allowEmpty;
  const maximum = (options && options.maximum) || 500;
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maximum) {
    throw new ValidationError(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string under ${maximum} characters.`);
  }
  return value;
}

function optionalText(value, label, maximum) {
  if (value === null || typeof value === "undefined") return;
  text(value, label, { allowEmpty: true, maximum: maximum || 2000 });
}

function uniqueIds(items, label) {
  const ids = new Set();
  items.forEach((item, index) => {
    const id = text(item.id, `${label}[${index}].id`, { maximum: 80 });
    if (!ID_PATTERN.test(id)) throw new ValidationError(`${label}[${index}].id contains unsupported characters.`);
    if (ids.has(id)) throw new ValidationError(`${label} contains the duplicate id "${id}".`);
    ids.add(id);
  });
  return ids;
}

function validateResources(value) {
  const data = object(value, "resources");
  const meta = object(data.meta, "resources.meta");
  text(meta.title, "resources.meta.title", { maximum: 100 });
  text(meta.institution, "resources.meta.institution", { maximum: 100 });
  text(meta.description, "resources.meta.description", { maximum: 500 });
  array(meta.creators, "resources.meta.creators").forEach((name, index) =>
    text(name, `resources.meta.creators[${index}]`, { maximum: 100 })
  );

  const creators = array(data.creators, "resources.creators");
  uniqueIds(creators, "resources.creators");
  creators.forEach((creator, index) => {
    text(creator.name, `resources.creators[${index}].name`, { maximum: 100 });
    text(creator.role, `resources.creators[${index}].role`, { maximum: 100 });
    if (!/^\d{8,15}$/.test(String(creator.whatsapp || ""))) {
      throw new ValidationError(`resources.creators[${index}].whatsapp must contain 8 to 15 digits.`);
    }
    text(creator.photoUrl, `resources.creators[${index}].photoUrl`, { maximum: 2000 });
  });

  const collections = array(data.unitCollections, "resources.unitCollections");
  const collectionIds = uniqueIds(collections, "resources.unitCollections");
  collections.forEach((collection, collectionIndex) => {
    text(collection.name, `resources.unitCollections[${collectionIndex}].name`, { maximum: 160 });
    text(collection.description, `resources.unitCollections[${collectionIndex}].description`, { maximum: 1000 });
    optionalText(collection.accent, `resources.unitCollections[${collectionIndex}].accent`, 40);
    optionalText(collection.sourceSubjectId, `resources.unitCollections[${collectionIndex}].sourceSubjectId`, 80);
    optionalText(collection.providedBy, `resources.unitCollections[${collectionIndex}].providedBy`, 120);
    optionalText(collection.providedByRole, `resources.unitCollections[${collectionIndex}].providedByRole`, 30);
    optionalText(collection.providedAt, `resources.unitCollections[${collectionIndex}].providedAt`, 100);
    if (collection.books !== undefined) {
      array(collection.books, `resources.unitCollections[${collectionIndex}].books`).forEach((book, bookIndex) => {
        object(book, `${collection.id}.books[${bookIndex}]`);
        text(book.title, `${collection.id}.books[${bookIndex}].title`, { maximum: 250 });
        optionalText(book.description, `${collection.id}.books[${bookIndex}].description`, 500);
        text(book.url, `${collection.id}.books[${bookIndex}].url`, { maximum: 4000 });
      });
    }
    const units = array(collection.units, `resources.unitCollections[${collectionIndex}].units`);
    units.forEach((unit, unitIndex) => {
      object(unit, `resources.unitCollections[${collectionIndex}].units[${unitIndex}]`);
      if (!["string", "number"].includes(typeof unit.number)) {
        throw new ValidationError(`Unit number at ${collection.id}[${unitIndex}] is invalid.`);
      }
      text(unit.title, `Unit title at ${collection.id}[${unitIndex}]`, { maximum: 250 });
      optionalText(unit.providedBy, `${collection.id}.providedBy`, 120);
      optionalText(unit.providedByRole, `${collection.id}.providedByRole`, 30);
      optionalText(unit.providedAt, `${collection.id}.providedAt`, 100);
      ["lectureUrl", "handwrittenNotesUrl", "masterNotesUrl", "pyqUrl", "practiceKey", "bookUrl",
        "workshopFileUrl", "classNotesUrl", "labManualUrl", "vivaQuestionsUrl", "endSemesterQuestionsUrl",
        "experimentVideosUrl", "lectureMessage", "notesUrl", "sectionTitle"]
        .forEach((key) => optionalText(unit[key], `${collection.id}.${key}`, 4000));
      optionalText(unit.kind, `${collection.id}.kind`, 40);
      if (unit.books !== undefined) {
        array(unit.books, `${collection.id}.books`).forEach((book, bookIndex) => {
          object(book, `${collection.id}.books[${bookIndex}]`);
          text(book.title, `${collection.id}.books[${bookIndex}].title`, { maximum: 250 });
          optionalText(book.description, `${collection.id}.books[${bookIndex}].description`, 500);
          text(book.url, `${collection.id}.books[${bookIndex}].url`, { maximum: 4000 });
        });
      }
      if (unit.lectureItems !== undefined) {
        array(unit.lectureItems, `${collection.id}.lectureItems`).forEach((lecture, lectureIndex) => {
          object(lecture, `${collection.id}.lectureItems[${lectureIndex}]`);
          text(lecture.title, `${collection.id}.lectureItems[${lectureIndex}].title`, { maximum: 250 });
          optionalText(lecture.description, `${collection.id}.lectureItems[${lectureIndex}].description`, 500);
          text(lecture.url, `${collection.id}.lectureItems[${lectureIndex}].url`, { maximum: 4000 });
        });
      }
    });
  });

  const branches = array(data.branches, "resources.branches");
  uniqueIds(branches, "resources.branches");
  branches.forEach((branch, branchIndex) => {
    text(branch.code, `resources.branches[${branchIndex}].code`, { maximum: 15 });
    text(branch.name, `resources.branches[${branchIndex}].name`, { maximum: 160 });
    if (!["engineering", "technology"].includes(branch.group)) {
      throw new ValidationError(`resources.branches[${branchIndex}].group must be engineering or technology.`);
    }
    const semesters = array(branch.semesters, `resources.branches[${branchIndex}].semesters`);
    uniqueIds(semesters, `resources.branches[${branchIndex}].semesters`);
    semesters.forEach((semester, semesterIndex) => {
      text(semester.name, `Semester name at ${branch.id}[${semesterIndex}]`, { maximum: 100 });
      if (!Number.isFinite(Number(semester.order))) throw new ValidationError(`Semester order at ${branch.id}[${semesterIndex}] is invalid.`);
      array(semester.subjectIds, `Subject ids at ${branch.id}[${semesterIndex}]`).forEach((subjectId) => {
        if (!collectionIds.has(subjectId)) {
          throw new ValidationError(`Branch ${branch.id} references missing subject "${subjectId}".`);
        }
      });
      if (new Set(semester.subjectIds).size !== semester.subjectIds.length) {
        throw new ValidationError(`Semester ${branch.id}/${semester.id} contains a duplicate subject.`);
      }
    });
  });

  const subjects = array(data.subjects, "resources.subjects");
  uniqueIds(subjects, "resources.subjects");
  subjects.forEach((subject, index) => {
    text(subject.name, `resources.subjects[${index}].name`, { maximum: 160 });
    text(subject.shortName, `resources.subjects[${index}].shortName`, { maximum: 100 });
    array(subject.resources, `resources.subjects[${index}].resources`).forEach((resource, resourceIndex) => {
      object(resource, `resources.subjects[${index}].resources[${resourceIndex}]`);
      text(resource.id, `Legacy resource id at ${subject.id}[${resourceIndex}]`, { maximum: 100 });
      text(resource.title, `Legacy resource title at ${subject.id}[${resourceIndex}]`, { maximum: 250 });
      optionalText(resource.url, `Legacy resource URL at ${subject.id}[${resourceIndex}]`, 4000);
      if (typeof resource.available !== "boolean") throw new ValidationError(`Legacy resource availability at ${subject.id}[${resourceIndex}] is invalid.`);
    });
  });

  const syllabi = array(data.syllabi, "resources.syllabi");
  const syllabusIds = uniqueIds(syllabi, "resources.syllabi");
  syllabi.forEach((syllabus, index) => {
    text(syllabus.title, `resources.syllabi[${index}].title`, { maximum: 200 });
    if (typeof syllabus.available !== "boolean") throw new ValidationError(`resources.syllabi[${index}].available must be true or false.`);
    optionalText(syllabus.url, `resources.syllabi[${index}].url`, 4000);
  });

  const groups = array(data.syllabusGroups, "resources.syllabusGroups");
  uniqueIds(groups, "resources.syllabusGroups");
  groups.forEach((group, groupIndex) => {
    text(group.title, `resources.syllabusGroups[${groupIndex}].title`, { maximum: 120 });
    optionalText(group.subtitle, `resources.syllabusGroups[${groupIndex}].subtitle`, 200);
    const folders = array(group.semesters, `resources.syllabusGroups[${groupIndex}].semesters`);
    uniqueIds(folders, `resources.syllabusGroups[${groupIndex}].semesters`);
    folders.forEach((folder, folderIndex) => {
      text(folder.title, `Syllabus semester title at ${group.id}[${folderIndex}]`, { maximum: 100 });
      array(folder.syllabusIds, `Syllabus ids at ${group.id}[${folderIndex}]`).forEach((id) => {
        if (!syllabusIds.has(id)) throw new ValidationError(`Syllabus folder ${folder.id} references missing file "${id}".`);
      });
    });
  });
  return data;
}

function validatePlacements(value) {
  const data = object(value, "placements");
  const source = object(data.source, "placements.source");
  text(source.title, "placements.source.title", { maximum: 200 });
  text(source.url, "placements.source.url", { maximum: 2000 });
  optionalText(source.verifiedAt, "placements.source.verifiedAt", 50);
  ["latest", "history", "reports"].forEach((key) => {
    array(data[key], `placements.${key}`).forEach((entry, index) => {
      object(entry, `placements.${key}[${index}]`);
      Object.entries(entry).forEach(([field, item]) => {
        if (!["string", "number", "boolean"].includes(typeof item) && item !== null) {
          throw new ValidationError(`placements.${key}[${index}].${field} has an unsupported value.`);
        }
        if (typeof item === "string" && item.length > 2000) {
          throw new ValidationError(`placements.${key}[${index}].${field} is too long.`);
        }
      });
    });
  });
  return data;
}

function validateNotices(value) {
  const data = object(value, "notices");
  optionalText(data.source, "notices.source", 100);
  text(data.sourceUrl, "notices.sourceUrl", { maximum: 2000 });
  optionalText(data.fetchedAt, "notices.fetchedAt", 100);
  const notices = array(data.notices, "notices.notices");
  uniqueIds(notices, "notices.notices");
  notices.forEach((notice, index) => {
    text(notice.title, `notices.notices[${index}].title`, { maximum: 500 });
    text(notice.url, `notices.notices[${index}].url`, { maximum: 2000 });
    text(notice.category, `notices.notices[${index}].category`, { maximum: 100 });
    if (typeof notice.isNew !== "boolean") throw new ValidationError(`notices.notices[${index}].isNew must be true or false.`);
  });
  return data;
}

function validateScholarshipItem(item, label) {
  object(item, label);
  text(item.id, `${label}.id`, { maximum: 80 });
  if (!ID_PATTERN.test(item.id)) throw new ValidationError(`${label}.id contains unsupported characters.`);
  text(item.title, `${label}.title`, { maximum: 500 });
  text(item.organization, `${label}.organization`, { maximum: 200 });
  text(item.category, `${label}.category`, { maximum: 100 });
  text(item.description, `${label}.description`, { maximum: 1000 });
  text(item.deadline, `${label}.deadline`, { maximum: 200 });
  text(item.url, `${label}.url`, { maximum: 2000 });
  if (typeof item.isNew !== "boolean") throw new ValidationError(`${label}.isNew must be true or false.`);
  if (item.pinned !== undefined && typeof item.pinned !== "boolean") throw new ValidationError(`${label}.pinned must be true or false.`);
}

function validateScholarships(value) {
  const data = object(value, "scholarships");
  optionalText(data.source, "scholarships.source", 100);
  text(data.sourceUrl, "scholarships.sourceUrl", { maximum: 2000 });
  optionalText(data.fetchedAt, "scholarships.fetchedAt", 100);
  validateScholarshipItem(data.featured, "scholarships.featured");
  const scholarships = array(data.scholarships, "scholarships.scholarships");
  uniqueIds(scholarships, "scholarships.scholarships");
  scholarships.forEach((item, index) => validateScholarshipItem(item, `scholarships.scholarships[${index}]`));
  if (scholarships.some((item) => item.id === data.featured.id)) {
    throw new ValidationError("The featured scholarship must not be duplicated in the scholarship list.");
  }
  return data;
}

function validateTarget(target, value) {
  if (!TARGETS[target]) throw new ValidationError("Unknown content target.");
  if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) throw new ValidationError("JSON document is too large.");
  if (target === "resources") return validateResources(value);
  if (target === "placements") return validatePlacements(value);
  if (target === "notices") return validateNotices(value);
  return validateScholarships(value);
}

function readJson(target) {
  const file = TARGETS[target];
  if (!file) throw new ValidationError("Unknown content target.");
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function githubConfig() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.GITHUB_REPO || "").trim();
  const branch = String(process.env.GITHUB_BRANCH || "main").trim();
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !branch) {
    const error = new Error("GitHub saving is not configured.");
    error.statusCode = 503;
    throw error;
  }
  return { token, repo, branch };
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "HelpDesk-Admin",
  };
}

async function commitJson(target, value, message) {
  const data = validateTarget(target, value);
  const filePath = TARGETS[target];
  const config = githubConfig();
  const endpoint = `https://api.github.com/repos/${config.repo}/contents/${filePath}`;
  const current = await fetch(`${endpoint}?ref=${encodeURIComponent(config.branch)}`, {
    headers: githubHeaders(config.token),
  });
  if (!current.ok) {
    const error = new Error(current.status === 404 ? `GitHub file ${filePath} was not found.` : "GitHub could not read the current file.");
    error.statusCode = current.status === 404 ? 404 : 502;
    throw error;
  }
  const currentFile = await current.json();
  const commitMessage = String(message || `Update ${filePath} from HelpDesk admin`).slice(0, 120);
  const saved = await fetch(endpoint, {
    method: "PUT",
    headers: githubHeaders(config.token),
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64"),
      sha: currentFile.sha,
      branch: config.branch,
    }),
  });
  if (!saved.ok) {
    const error = new Error(saved.status === 409
      ? "The file changed on GitHub. Reload the admin dashboard and try again."
      : "GitHub could not save this change.");
    error.statusCode = saved.status === 409 ? 409 : 502;
    throw error;
  }
  const result = await saved.json();
  return {
    target,
    path: filePath,
    commitUrl: result.commit && result.commit.html_url,
    historyUrl: `https://github.com/${config.repo}/commits/${encodeURIComponent(config.branch)}/${filePath}`,
  };
}

function historyUrls() {
  try {
    const config = githubConfig();
    return Object.fromEntries(Object.entries(TARGETS).map(([target, filePath]) => [
      target,
      `https://github.com/${config.repo}/commits/${encodeURIComponent(config.branch)}/${filePath}`,
    ]));
  } catch {
    return {};
  }
}

module.exports = {
  TARGETS,
  ValidationError,
  commitJson,
  historyUrls,
  readJson,
  validateNotices,
  validatePlacements,
  validateResources,
  validateScholarships,
  validateTarget,
};
