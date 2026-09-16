(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HelpDeskYearPyqs = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const papers = [
    ["midSem1Url", "Mid-sem 1"],
    ["midSem2Url", "Mid-sem 2"],
    ["endSemUrl", "End-sem"],
  ];
  const paperFields = papers.map(([field]) => field);
  function ensureYear(entry) {
    if (!entry || typeof entry !== "object") return entry;
    if (!Array.isArray(entry.enabledPapers)) entry.enabledPapers = [...paperFields];
    return entry;
  }
  function activePapers(entry) {
    ensureYear(entry);
    return papers.filter(([field]) => entry.enabledPapers.includes(field));
  }
  function createYear(year, id) {
    return { id: id || "year-" + year, year: Number(year), enabledPapers: [...paperFields], midSem1Url: "", midSem2Url: "", endSemUrl: "" };
  }
  function ensureSubject(subject) {
    if (subject && subject.yearWisePyqs === undefined) {
      subject.yearWisePyqs = [2025, 2024, 2023, 2022].map(year => createYear(year));
    }
    if (subject && Array.isArray(subject.yearWisePyqs)) subject.yearWisePyqs.forEach(ensureYear);
    return subject;
  }
  function normalize(resources) {
    if (resources && Array.isArray(resources.unitCollections)) resources.unitCollections.forEach(ensureSubject);
    return resources;
  }
  function paperUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" && ["drive.google.com", "docs.google.com"].includes(url.hostname)
        && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }
  return { papers, paperFields, ensureYear, activePapers, createYear, ensureSubject, normalize, paperUrl };
});
