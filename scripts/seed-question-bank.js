// Converts only the PYQ text already included in this HelpDesk repository.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const resources = require("../data/resources.json");
const bank = require("../data/pyq-bank.json");
const model = require("../public/question-bank-model");
const questions = [];
const seen = new Set();
for (const [url, entry] of Object.entries(bank)) {
  const subject = resources.unitCollections.find(s => s.units.some(u => (u.practiceKey || u.pyqUrl) === url));
  if (!subject) continue;
  for (const text of entry.questions || []) {
    const question = { id: "q-" + crypto.createHash("sha256").update(subject.id + "|" + entry.unitNumber + "|" + text).digest("hex").slice(0,24),
      subjectId: subject.id, unitNumber: String(entry.unitNumber), chapter: entry.unitTitle,
      question: text, answer: "", year: null, exam: "unknown", marks: null, difficulty: "unknown", branchIds: [],
      sourceTitle: "Existing HelpDesk PYQ collection · source grouping not yet reviewed", sourceUrl: url };
    const key = model.fingerprint(question); if (seen.has(key)) continue; seen.add(key); questions.push(question);
  }
}
const value = model.validate({ schemaVersion: 1, questions });
fs.writeFileSync(path.resolve(__dirname,"../data/practice.json"), JSON.stringify(value,null,2)+"\n");
console.log("Prepared " + questions.length + " existing questions; no Backpaper questions or answers imported.");
