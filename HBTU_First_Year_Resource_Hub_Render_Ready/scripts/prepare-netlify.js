const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "resources.json");
const publicDataPath = path.join(root, "public", "resources.json");
const bankPath = path.join(root, "data", "pyq-bank.json");
const placementsPath = path.join(root, "data", "placements.json");
const fallbackNoticesPath = path.join(root, "data", "notices-fallback.json");
const indexPath = path.join(root, "public", "index.html");

const resources = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const placements = JSON.parse(fs.readFileSync(placementsPath, "utf8"));
const fallbackNotices = JSON.parse(fs.readFileSync(fallbackNoticesPath, "utf8"));
const index = fs.readFileSync(indexPath, "utf8");
const units = resources.unitCollections.flatMap((subject) => subject.units);
const pyqUrls = units.map((unit) => unit.pyqUrl).filter(Boolean);
const practiceKeys = units.map((unit) => unit.practiceKey || unit.pyqUrl).filter(Boolean);
const localPracticeSources = practiceKeys.filter((url) => String(url).startsWith("/"));
const noteUrls = units.flatMap((unit) => [unit.handwrittenNotesUrl, unit.masterNotesUrl])
  .filter((url) => url && String(url).startsWith("/"));
const workshopUrls = units.flatMap((unit) => [unit.workshopFileUrl, unit.classNotesUrl])
  .filter((url) => url && String(url).startsWith("/"));
const publicPath = (url) => path.join(root, "public", String(url).replace(/^\/+/, ""));
const missingBankEntries = practiceKeys.filter((url) => !bank[url]);
const missingPdfs = localPracticeSources.filter((url) => !fs.existsSync(publicPath(url)));
const missingNotes = noteUrls.filter((url) => !fs.existsSync(publicPath(url)));
const missingWorkshopFiles = workshopUrls.filter((url) => !fs.existsSync(publicPath(url)));

if (!index.includes("<title>HelpDesk · HBTU</title>")) {
  throw new Error("public/index.html is missing the HelpDesk page title.");
}
if (!Array.isArray(resources.branches) || !resources.branches.length) {
  throw new Error("data/resources.json has no branches.");
}
if (missingBankEntries.length) {
  throw new Error(`PYQ bank entries are missing for: ${missingBankEntries.join(", ")}`);
}
if (missingPdfs.length) {
  throw new Error(`PYQ PDF files are missing for: ${missingPdfs.join(", ")}`);
}
if (missingNotes.length) {
  throw new Error(`Notes files are missing for: ${missingNotes.join(", ")}`);
}
if (missingWorkshopFiles.length) {
  throw new Error(`Workshop files are missing for: ${missingWorkshopFiles.join(", ")}`);
}
if (!Array.isArray(placements.latest) || !placements.latest.length || !Array.isArray(placements.reports)) {
  throw new Error("data/placements.json is incomplete.");
}
if (!Array.isArray(fallbackNotices.notices) || !fallbackNotices.notices.length) {
  throw new Error("data/notices-fallback.json has no notices.");
}

fs.copyFileSync(dataPath, publicDataPath);
fs.copyFileSync(placementsPath, path.join(root, "public", "placements.json"));
fs.copyFileSync(fallbackNoticesPath, path.join(root, "public", "notices-fallback.json"));
const externalPyqCount = pyqUrls.filter((url) => /^https?:\/\//.test(url)).length;
console.log(
  `HelpDesk Netlify build ready: ${resources.branches.length} branches, ` +
  `${practiceKeys.length} practice units, ${externalPyqCount} external PYQ links.`
);
