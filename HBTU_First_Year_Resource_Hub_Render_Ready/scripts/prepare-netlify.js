const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "resources.json");
const publicDataPath = path.join(root, "public", "resources.json");
const bankPath = path.join(root, "data", "pyq-bank.json");
const indexPath = path.join(root, "public", "index.html");

const resources = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const index = fs.readFileSync(indexPath, "utf8");
const pyqUrls = resources.unitCollections.flatMap((subject) =>
  subject.units.map((unit) => unit.pyqUrl).filter(Boolean)
);
const missingBankEntries = pyqUrls.filter((url) => !bank[url]);
const missingPdfs = pyqUrls.filter((url) => !fs.existsSync(path.join(root, "public", url)));

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

fs.copyFileSync(dataPath, publicDataPath);
console.log(`HelpDesk Netlify build ready: ${resources.branches.length} branches, ${pyqUrls.length} PYQ PDFs.`);
