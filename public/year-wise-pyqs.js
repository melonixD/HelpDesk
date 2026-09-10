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
  function createYear(year, id) {
    return { id: id || "year-" + year, year: Number(year), midSem1Url: "", midSem2Url: "", endSemUrl: "" };
  }
  function ensureSubject(subject) {
    if (subject && subject.yearWisePyqs === undefined) {
      subject.yearWisePyqs = [2025, 2024, 2023, 2022].map(year => createYear(year));
    }
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
  return { papers, createYear, ensureSubject, normalize, paperUrl };
});
