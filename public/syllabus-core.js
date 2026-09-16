(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HelpDeskSyllabus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const CORE_FOLDER_ID = "technology-core";
  const coreSyllabi = [
    { id: "biochemical-core", title: "Biochemical Engineering Core" },
    { id: "biotechnology-core", title: "Biotechnology Core" },
    { id: "chemical-core", title: "Chemical Engineering Core" },
    { id: "food-tech", title: "Food Technology Core" },
    { id: "leather-core", title: "Leather Technology Core" },
    { id: "oil-core", title: "Oil Technology Core" },
    { id: "paint-core", title: "Paint Technology Core" },
    { id: "plastic-core", title: "Plastic Technology Core" },
  ];

  function ensure(resources) {
    if (!resources || typeof resources !== "object") return resources;
    resources.meta = resources.meta && typeof resources.meta === "object" ? resources.meta : {};
    if (Number(resources.meta.syllabusSchemaVersion || 0) >= SCHEMA_VERSION) return resources;

    resources.syllabi = Array.isArray(resources.syllabi) ? resources.syllabi : [];
    resources.syllabusGroups = Array.isArray(resources.syllabusGroups) ? resources.syllabusGroups : [];
    const filesById = new Map(resources.syllabi.map((item) => [item && item.id, item]));
    coreSyllabi.forEach((definition) => {
      if (!filesById.has(definition.id)) {
        const item = { ...definition, available: false, url: null };
        resources.syllabi.push(item);
        filesById.set(item.id, item);
      }
    });

    let technology = resources.syllabusGroups.find((group) => group && group.id === "technology");
    if (!technology) {
      technology = { id: "technology", title: "Technology", subtitle: "Technology branches", semesters: [] };
      resources.syllabusGroups.push(technology);
    }
    technology.semesters = Array.isArray(technology.semesters) ? technology.semesters : [];

    const coreIds = new Set(coreSyllabi.map((item) => item.id));
    resources.syllabusGroups.forEach((group) => {
      (Array.isArray(group.semesters) ? group.semesters : []).forEach((folder) => {
        if (!folder || folder.id === CORE_FOLDER_ID || !Array.isArray(folder.syllabusIds)) return;
        folder.syllabusIds = folder.syllabusIds.filter((id) => !coreIds.has(id));
      });
    });

    let coreFolder = technology.semesters.find((folder) => folder && folder.id === CORE_FOLDER_ID);
    if (!coreFolder) {
      coreFolder = {
        id: CORE_FOLDER_ID,
        title: "Core",
        subtitle: "Branch-specific technology core syllabi",
        syllabusIds: [],
      };
      technology.semesters.push(coreFolder);
    }
    coreFolder.syllabusIds = Array.isArray(coreFolder.syllabusIds) ? coreFolder.syllabusIds : [];
    coreSyllabi.forEach(({ id }) => {
      if (!coreFolder.syllabusIds.includes(id)) coreFolder.syllabusIds.push(id);
    });
    resources.meta.syllabusSchemaVersion = SCHEMA_VERSION;
    return resources;
  }

  return { SCHEMA_VERSION, CORE_FOLDER_ID, coreSyllabi, ensure };
});
