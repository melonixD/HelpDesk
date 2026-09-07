"use strict";
const clone = (value) => JSON.parse(JSON.stringify(value));
// Mathematics is required in Engineering S1 and Technology S2.
// Repair both persisted content and reads; publishing must never disable recovery.
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
function recoverMaths(data, timestamp, previous) {
  const canonical = require("../../data/resources.json");
  const subject = (previous && previous.unitCollections || []).find(item => item.id === "maths-1")
    || canonical.unitCollections.find(item => item.id === "maths-1");
  if (!subject) return data;
  const locations = (data.branches || []).flatMap(branch => {
    const semesterId = branch.group === "engineering" ? "semester-1" : branch.group === "technology" ? "semester-2" : null;
    return (branch.semesters || []).filter(semester => semester.id === semesterId).map(semester => ({
      branchId: branch.id, semesterId: semester.id, index: 0,
    }));
  });
  return restoreSubject(data, { type: "placement", subject, index: 0, placements: locations });
}
module.exports = { placements, restoreSubject, recoverMaths };
