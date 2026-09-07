"use strict";
const clone = (value) => JSON.parse(JSON.stringify(value));
// Recover the reported incident only; later intentional deletions remain possible.
const INCIDENT_CUTOFF = 1788776329757;
function placements(data, id) {
  return (data.branches || []).flatMap(branch => (branch.semesters || []).flatMap(semester => {
    const index = (semester.subjectIds || []).indexOf(id);
    return index < 0 ? [] : [{ branchId: branch.id, semesterId: semester.id, index }];
  }));
}
function restoreSubject(data, descriptor) {
  const next = clone(data);
  const subject = descriptor.subject;
  next.unitCollections ||= [];
  const existing = next.unitCollections.find(item => item.id === subject.id);
  if (existing && descriptor.type === "subject" && JSON.stringify(existing) !== JSON.stringify(subject)) {
    throw Object.assign(new Error("A different subject already uses this ID. Review it before restoring."), { statusCode: 409 });
  }
  if (!existing) next.unitCollections.splice(Math.min(descriptor.index ?? next.unitCollections.length, next.unitCollections.length), 0, clone(subject));
  for (const location of descriptor.placements || []) {
    const branch = (next.branches || []).find(item => item.id === location.branchId);
    const semester = branch && (branch.semesters || []).find(item => item.id === location.semesterId);
    if (!semester) throw Object.assign(new Error("An original branch or semester is missing. Recreate it before restoring this subject."), { statusCode: 409 });
    if (!semester.subjectIds.includes(subject.id)) semester.subjectIds.splice(Math.min(location.index, semester.subjectIds.length), 0, subject.id);
  }
  return next;
}
function recoverMaths(data, timestamp) {
  if (timestamp && Number(new Date(timestamp)) > INCIDENT_CUTOFF) return data;
  const canonical = require("../../data/resources.json");
  const subject = canonical.unitCollections.find(item => item.id === "maths-1");
  if (!subject) return data;
  const locations = placements(canonical, subject.id).filter(location => (data.branches || []).some(branch =>
    branch.id === location.branchId && branch.semesters.some(semester => semester.id === location.semesterId)));
  return restoreSubject(data, { type: "placement", subject, index: canonical.unitCollections.indexOf(subject), placements: locations });
}
module.exports = { placements, restoreSubject, recoverMaths };
