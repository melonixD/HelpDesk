(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HelpDeskBankModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
  const exams = ["mid-sem", "mid-sem-1", "mid-sem-2", "end-sem", "unknown"];
  const difficulties = ["easy", "medium", "hard", "unknown"];
  function validate(bank) {
    if (!bank || bank.schemaVersion !== 1 || !Array.isArray(bank.questions)) throw new Error("Use a schemaVersion: 1 question-bank JSON with a questions array.");
    if (bank.questions.length > 10000) throw new Error("A bank may contain at most 10,000 questions.");
    const ids = new Set();
    if(bank.extraBranches!==undefined){if(!Array.isArray(bank.extraBranches)||bank.extraBranches.length>30)throw new Error("Invalid practice branches.");const branchIds=new Set();for(const b of bank.extraBranches){if(!b||!ID.test(b.id)||!ID.test(b.templateBranchId)||branchIds.has(b.id)||typeof b.name!=="string"||b.name.length>200)throw new Error("Invalid practice branch.");branchIds.add(b.id);}}
    if(bank.extraSubjects!==undefined){
      if(!Array.isArray(bank.extraSubjects)||bank.extraSubjects.length>50)throw new Error("Invalid practice-only subject catalogue.");
      const extraIds=new Set();for(const s of bank.extraSubjects){if(!s||!ID.test(s.id)||extraIds.has(s.id)||typeof s.name!=="string"||s.name.length>200||!Array.isArray(s.units))throw new Error("Invalid practice-only subject.");extraIds.add(s.id);for(const group of ["engineering","technology"])if(!Array.isArray(s.groupSemesters?.[group])||s.groupSemesters[group].some(id=>!ID.test(id)))throw new Error("Invalid practice subject semesters.");for(const u of s.units)if(typeof u.number!=="string"||typeof u.title!=="string"||u.title.length>200)throw new Error("Invalid practice subject unit.");}
    }
    for (const q of bank.questions) {
      if (!q || !ID.test(q.id || "") || ids.has(q.id)) throw new Error("Every question needs a unique lowercase id.");
      ids.add(q.id);
      if (!ID.test(q.subjectId || "")) throw new Error(q.id + ": choose a valid HelpDesk subjectId.");
      for (const [key, limit, required] of [["question",12000,true],["answer",30000,false],["chapter",200,true],["unitNumber",40,true],["sourceTitle",200,false],["sourceUrl",2000,false]]) {
        if (typeof q[key] !== "string" || q[key].length > limit || (required && !q[key].trim())) throw new Error(q.id + ": invalid " + key + ".");
      }
      if (q.year !== null && (!Number.isInteger(q.year) || q.year < 1900 || q.year > 9999)) throw new Error(q.id + ": year must be null or a four-digit year.");
      if (q.marks !== null && (!Number.isFinite(q.marks) || q.marks < 0 || q.marks > 200)) throw new Error(q.id + ": marks must be null or 0–200.");
      if (!exams.includes(q.exam)) throw new Error(q.id + ": invalid exam.");
      // Older published banks may retain difficulty metadata; new questions do not need it.
      if (q.difficulty !== undefined && !difficulties.includes(q.difficulty)) throw new Error(q.id + ": invalid legacy metadata.");
      if (!Array.isArray(q.branchIds) || q.branchIds.some(id => !ID.test(id))) throw new Error(q.id + ": invalid branchIds.");
      if(q.academicYear!==undefined&&(typeof q.academicYear!=="string"||q.academicYear.length>40))throw new Error(q.id+": invalid academicYear.");
      if(q.answerUrl!==undefined&&(typeof q.answerUrl!=="string"||!/^\/practice-answers\/[a-z0-9-]+\.json$/.test(q.answerUrl)))throw new Error(q.id+": invalid answer path.");
      if(q.figureUnavailable!==undefined&&typeof q.figureUnavailable!=="boolean")throw new Error(q.id+": invalid figure status.");
      if(q.unitNumbers!==undefined&&(!Array.isArray(q.unitNumbers)||q.unitNumbers.some(v=>typeof v!=="string"||v.length>40)))throw new Error(q.id+": invalid unitNumbers.");
      if(q.topics!==undefined&&(!Array.isArray(q.topics)||q.topics.some(t=>!t||typeof t.chapter!=="string"||t.chapter.length>200||typeof t.unitNumber!=="string"||t.unitNumber.length>40)))throw new Error(q.id+": invalid topics.");
      if(q.proTip!==undefined&&(typeof q.proTip!=="string"||q.proTip.length>5000))throw new Error(q.id+": invalid proTip.");
      if(q.imageUrl) {
        if(typeof q.imageUrl!=="string"||!/^\/practice-assets\/[a-z0-9-]+\.(png|jpg|jpeg|webp)$/.test(q.imageUrl))throw new Error(q.id+": invalid local figure path.");
      }
      if(q.videoLinks!==undefined&&(!Array.isArray(q.videoLinks)||q.videoLinks.length>12||q.videoLinks.some(v=>{try{const u=new URL(v.url);return typeof v.title!=="string"||v.title.length>250||u.protocol!=="https:"||!["www.youtube.com","youtube.com","youtu.be"].includes(u.hostname)||u.username||u.password;}catch{return true;}})))throw new Error(q.id+": invalid video links.");
      if (q.sourceUrl && !/^\/(resources|uploads)\/[a-zA-Z0-9_./-]+$/.test(q.sourceUrl)) {
        let url; try { url = new URL(q.sourceUrl); } catch { throw new Error(q.id + ": invalid source URL."); }
        if (url.protocol !== "https:" || url.username || url.password) throw new Error(q.id + ": source URL must use HTTPS.");
      }
    }
    return bank;
  }
  function fingerprint(q) {
    return [q.subjectId, q.unitNumber, q.question.trim().toLowerCase().replace(/\s+/g," "), q.year ?? "", q.exam].join("|");
  }
  function mergeImport(current, incoming) {
    validate(current); validate(incoming);
    const result = JSON.parse(JSON.stringify(current));
    for(const field of ["extraSubjects","extraBranches"]){const known=new Set((result[field]||[]).map(item=>item.id));for(const item of incoming[field]||[])if(!known.has(item.id)){result[field] ||= [];result[field].push(JSON.parse(JSON.stringify(item)));known.add(item.id);}}
    const byId = new Map(result.questions.map(q => [q.id,q]));
    const byText = new Map(result.questions.map(q => [fingerprint(q),q]));
    let added = 0, skipped = 0;
    for (const q of incoming.questions) {
      const sameId = byId.get(q.id);
      if (sameId && fingerprint(sameId) !== fingerprint(q)) throw new Error("ID conflict: " + q.id + ". Change this ID before importing.");
      if (sameId || byText.has(fingerprint(q))) { skipped++; continue; }
      const copy = JSON.parse(JSON.stringify(q)); result.questions.push(copy); byId.set(q.id,copy); byText.set(fingerprint(q),copy); added++;
    }
    validate(result); return { bank: result, added, skipped };
  }
  function select(bank, resources, params) {
    resources=practiceResources(bank,resources);
    const subjects = resources.unitCollections || [];
    const branch = params.branch && params.branch !== "all" ? (resources.branches || []).find(b => b.id === params.branch) : null;
    if (params.branch && params.branch !== "all" && !branch) return [];
    const branches = branch ? [branch] : resources.branches || [];
    const allowed = new Set(branches.flatMap(b => (b.semesters || []).filter(s => !params.semester || params.semester === "all" || s.id === params.semester).flatMap(s => s.subjectIds || [])));
    const names = new Map(subjects.map(s => [s.id, s.name]));
    const search = String(params.q || "").trim().toLowerCase();
    const exact = key => !params[key] || params[key] === "all";
    return bank.questions.filter(q => names.has(q.subjectId) && allowed.has(q.subjectId)
      && (!q.branchIds.length || (branch ? q.branchIds.includes(branch.id) : branches.some(b => q.branchIds.includes(b.id) && (b.semesters||[]).some(s => (!params.semester||params.semester==="all"||s.id===params.semester)&&(s.subjectIds||[]).includes(q.subjectId)))))
      && (exact("subject") || q.subjectId === params.subject)
      && (exact("unit") || (q.unitNumbers||[q.unitNumber]).includes(String(params.unit)))
      && (exact("chapter") || (q.topics||[{chapter:q.chapter}]).some(t=>t.chapter===params.chapter))
      && (exact("year") || String(q.year) === params.year)
      && (exact("exam") || q.exam === params.exam)
      && (exact("marks") || String(q.marks) === params.marks)
      && (!search || (q.question + " " + q.chapter + " " + names.get(q.subjectId)).toLowerCase().includes(search)));
  }
  function practiceResources(bank,resources) {
    if(!bank.extraSubjects?.length&&!bank.extraBranches?.length)return resources;
    const extra=(bank.extraSubjects||[]).filter(s=>!(resources.unitCollections||[]).some(item=>item.id===s.id));
    const branches=[...(resources.branches||[])];
    for(const b of bank.extraBranches||[]){if(branches.some(item=>item.id===b.id))continue;const template=branches.find(item=>item.id===b.templateBranchId);if(template)branches.push({...template,id:b.id,name:b.name,code:b.code||template.code});}
    return {...resources,unitCollections:[...(resources.unitCollections||[]),...extra],branches:branches.map(b=>({...b,semesters:(b.semesters||[]).map(s=>({...s,subjectIds:[...s.subjectIds,...extra.filter(subject=>subject.groupSemesters[b.group]?.includes(s.id)).map(subject=>subject.id)]}))}))};
  }
  function sourceDetails(q) {
    // Keep provenance in the import report while using neutral paper labels in the UI.
    if (q.sourceQuestionId || /backpaper/i.test(q.sourceTitle || "") || /(?:^|\.)backpaper\.in$/i.test(safeHostname(q.sourceUrl))) {
      return { title: "Previous-year question paper", url: "" };
    }
    return { title: q.sourceTitle || "Source not recorded", url: q.sourceUrl || "" };
  }
  function safeHostname(value) { try { return new URL(value).hostname; } catch { return ""; } }
  return { validate, mergeImport, fingerprint, select, practiceResources, sourceDetails, exams };
});
