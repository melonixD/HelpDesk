const STORAGE = {
  theme: "helpdesk-theme",
  tasks: "helpdesk-tasks",
  calcScale: "helpdesk-calc-scale",
  calcSemesters: "helpdesk-calc-semesters",
  calcDraft: "helpdesk-calc-draft",
};

const state = {
  data: null,
  branch: "food-technology",
  semester: "semester-1",
  subject: "chemistry",
  query: "",
  tasks: readStorage(STORAGE.tasks, []),
};

const subjectCodes = {
  chemistry: "CH",
  pc: "PC",
  bem: "BEM",
  ees: "EES",
  bet: "BET",
  workshop: "CWP",
  "biochemical-core": "BE",
  "biotechnology-core": "BT",
  "chemical-core": "CHE",
  "food-tech": "FT",
  "leather-core": "LT",
  "oil-core": "OT",
  "paint-core": "PT",
  "plastic-core": "PL",
  "maths-1": "M1",
  bee: "BEE",
  "engineering-graphics": "EG",
  "engineering-physics": "EP",
  uhv: "UHV",
  pps: "PPS",
  etw: "ETW",
};

const materialIcons = {
  lecture: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5Z" /></svg>',
  notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" /></svg>',
  pyq: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7zM15 3v5h4M10 12h6M10 16h5" /></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z" /></svg>',
  practice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>',
};

const elements = {};
let timerSeconds = 25 * 60;
let timerInterval = null;
let resourceDataPromise = null;
let placementDataPromise = null;
let noticeDataPromise = null;
let scholarshipDataPromise = null;
const placementHubState = { tab: "stats" };

function readStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed === null || typeof parsed === "undefined" ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value === null || typeof value === "undefined" ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function twoDigits(value) {
  return value < 10 ? "0" + value : String(value);
}

function cacheElements() {
  [
    "theme-toggle", "menu-toggle", "mobile-menu", "menu-backdrop", "available-count", "subject-count", "branch-count",
    "branch-search", "branch-list", "semester-pane", "semester-pane-branch", "semester-list", "subject-pane", "subject-pane-semester",
    "subject-list", "content-pane", "path-branch", "path-semester", "path-subject", "subject-header", "subject-code",
    "course-name", "course-description", "course-contributor", "course-status", "subject-syllabus",
    "unit-list", "syllabus-list", "today-label", "task-form", "task-input", "task-list",
    "task-empty", "timer-status", "timer-ring", "timer-value", "timer-toggle", "timer-reset",
    "practice-open", "practice-hub", "practice-hub-close", "practice-back", "practice-hub-heading",
    "practice-hub-body",
    "calc-open", "calc-hub", "calc-hub-close", "calc-hub-body", "calc-tab-semester", "calc-tab-cgpa",
    "placements-open", "notices-open", "placement-hub", "placement-hub-close", "placement-hub-heading", "placement-hub-body",
    "placement-tab-stats", "placement-tab-notices", "notice-tab-count",
    "scholarships-open", "scholarship-hub", "scholarship-hub-close", "scholarship-hub-heading", "scholarship-hub-body",
    "contact-grid", "hero-copy", "hero-credit", "hero-institution", "brand-name",
    "admin-reveal-trigger", "admin-menu-link", "admin-logout",
  ].forEach((id) => { elements[id] = document.getElementById(id); });
}

async function initialise() {
  cacheElements();
  initialiseTheme();
  initialiseNavigation();
  initialiseAdminDiscovery();
  initialisePlanner();
  initialiseTimer();
  initialisePractice();
  initialiseCalculator();
  initialisePlacements();
  initialiseScholarships();
  bindBrowserControls();

  try {
    state.data = await ensureResourceData();
    applySiteMeta();
    initialiseContacts();
    renderBrowser();
    renderSyllabi();
    updateStats();
  } catch (error) {
    console.error(error);
    elements["branch-list"].innerHTML = '<p class="no-results">Branches could not load. Please refresh.</p>';
    elements["semester-list"].innerHTML = '<p class="no-results">Semesters could not load.</p>';
    elements["subject-list"].innerHTML = '<p class="no-results">Subjects could not load.</p>';
    elements["unit-list"].innerHTML =
      '<div class="empty-state"><h3>Resources unavailable</h3><p>Please refresh the page.</p></div>';
  }
}

function ensureResourceData() {
  if (state.data) return Promise.resolve(state.data);
  if (!resourceDataPromise) {
    resourceDataPromise = loadResourceData()
      .then((data) => {
        state.data = data;
        return data;
      })
      .finally(() => {
        resourceDataPromise = null;
      });
  }
  return resourceDataPromise;
}

async function loadResourceData() {
  // Published admin content lives in Netlify Blobs. The bundled JSON remains
  // an outage-safe fallback for the first deploy and local static previews.
  const sources = ["/api/resources", "/resources.json"];
  let lastError;

  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) throw new Error(source + " returned " + response.status);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error(source + " did not return JSON");
      const data = await response.json();
      if (!Array.isArray(data.branches) || !Array.isArray(data.unitCollections)) {
        throw new Error(source + " returned incomplete data");
      }
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Resources could not be loaded");
}

function initialiseTheme() {
  const stored = localStorage.getItem(STORAGE.theme);
  const prefersDark = typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(stored || (prefersDark ? "dark" : "light"));
  elements["theme-toggle"].addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE.theme, next);
  });
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#000000" : "#f5f5f7";
  elements["theme-toggle"].setAttribute(
    "aria-label",
    "Switch to " + (theme === "dark" ? "light" : "dark") + " theme"
  );
}

function initialiseNavigation() {
  elements["menu-toggle"].addEventListener("click", () => {
    const open = elements["menu-toggle"].getAttribute("aria-expanded") !== "true";
    setMenu(open);
  });
  elements["menu-backdrop"].addEventListener("click", closeMenu);
  elements["mobile-menu"].querySelectorAll(".drawer-nav a").forEach((link) => link.addEventListener("click", closeMenu));
}

function setMenu(open) {
  elements["menu-toggle"].setAttribute("aria-expanded", String(open));
  elements["menu-toggle"].setAttribute("aria-label", open ? "Close menu" : "Open menu");
  elements["mobile-menu"].classList.toggle("open", open);
  elements["mobile-menu"].setAttribute("aria-hidden", String(!open));
  elements["menu-backdrop"].classList.toggle("open", open);
  elements["menu-backdrop"].setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("menu-open", open);
}

function closeMenu() {
  setMenu(false);
}

function applySiteMeta() {
  const meta = state.data.meta || {};
  const title = meta.title || "HelpDesk";
  const institution = meta.institution || "HBTU";
  const creatorNames = Array.isArray(meta.creators) && meta.creators.length
    ? meta.creators
    : (state.data.creators || []).map((creator) => creator.name);
  document.title = title + " · " + institution;
  if (elements["brand-name"]) elements["brand-name"].textContent = title;
  if (elements["hero-institution"]) elements["hero-institution"].textContent = institution + " KANPUR";
  if (elements["hero-copy"] && meta.description) elements["hero-copy"].textContent = meta.description;
  if (elements["hero-credit"] && creatorNames.length) {
    elements["hero-credit"].innerHTML = "Made with love by " + creatorNames
      .map((name) => "<strong>" + escapeHtml(name) + "</strong>")
      .join(" and ") + ".";
  }
  const description = document.querySelector('meta[name="description"]');
  if (description && meta.description) description.content = meta.description;
}

function formatWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return "+91 " + digits.slice(2, 7) + " " + digits.slice(7);
  }
  return digits ? "+" + digits : "Not added";
}

function initialiseContacts() {
  const creators = Array.isArray(state.data.creators) ? state.data.creators : [];
  if (elements["contact-grid"] && creators.length) {
    elements["contact-grid"].innerHTML = creators.map((creator) => {
      const id = String(creator.id || creator.name).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      const digits = String(creator.whatsapp || "").replace(/\D/g, "");
      return '<article class="contact-card"><button class="profile-trigger" type="button" ' +
        'data-contact-trigger="' + escapeHtml(id) + '" aria-expanded="false" aria-controls="contact-' + escapeHtml(id) + '">' +
        '<img src="' + escapeHtml(creator.photoUrl || "/favicon.svg") + '" alt="' + escapeHtml(creator.name) +
        '" width="92" height="108" loading="lazy" decoding="async" />' +
        '<span class="profile-copy"><strong>' + escapeHtml(creator.name) + '</strong><small>' +
        escapeHtml(creator.role || "Creator") + ' · tap for WhatsApp</small></span>' +
        '<span class="profile-arrow" aria-hidden="true">＋</span></button>' +
        '<div class="contact-reveal" id="contact-' + escapeHtml(id) + '" hidden><span>WhatsApp</span>' +
        (digits ? '<a href="https://wa.me/' + escapeHtml(digits) + '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(formatWhatsapp(digits)) + ' <i>↗</i></a>' : '<span>Not added</span>') + '</div></article>';
    }).join("");
  }

  document.querySelectorAll("[data-contact-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      const role = (state.data.creators || []).find((creator) =>
        String(creator.id || creator.name).replace(/[^a-z0-9-]/gi, "-").toLowerCase() === button.dataset.contactTrigger
      );
      button.querySelector("small").textContent = open
        ? ((role && role.role) || "Creator") + " · tap for WhatsApp"
        : "WhatsApp contact";
      button.querySelector(".profile-arrow").textContent = open ? "＋" : "−";
      panel.hidden = open;
    });
  });
}

let adminSessionCsrf = "";

function revealAdminMenu(authenticated) {
  if (!elements["admin-menu-link"]) return;
  elements["admin-menu-link"].hidden = false;
  elements["admin-logout"].hidden = !authenticated;
}

function initialiseAdminDiscovery() {
  const trigger = elements["admin-reveal-trigger"];
  if (!trigger) return;
  let taps = [];
  let longPressTimer = null;
  const reveal = () => revealAdminMenu(false);

  trigger.addEventListener("click", () => {
    const now = Date.now();
    taps = taps.filter((time) => now - time < 3000);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      reveal();
    }
  });
  trigger.addEventListener("pointerdown", () => {
    longPressTimer = window.setTimeout(reveal, 650);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
    trigger.addEventListener(name, () => window.clearTimeout(longPressTimer));
  });

  fetch("/api/admin/session", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((session) => {
      if (!session || !session.authenticated) return;
      adminSessionCsrf = session.csrfToken || "";
      revealAdminMenu(true);
    })
    .catch(() => {});

  elements["admin-logout"].addEventListener("click", async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "X-HelpDesk-CSRF": adminSessionCsrf },
      });
    } finally {
      adminSessionCsrf = "";
      elements["admin-menu-link"].hidden = true;
      elements["admin-logout"].hidden = true;
      closeMenu();
    }
  });
}

function bindBrowserControls() {
  elements["branch-search"].addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderBranches();
  });

  elements["branch-list"].addEventListener("click", (event) => {
    const button = event.target.closest("[data-branch]");
    if (!button) return;
    chooseBranch(button.dataset.branch);
  });

  elements["semester-list"].addEventListener("click", (event) => {
    const button = event.target.closest("[data-semester]");
    if (!button) return;
    state.semester = button.dataset.semester;
    const branch = state.data.branches.find((item) => item.id === state.branch);
    const semester = orderedSemesters(branch).find((item) => item.id === state.semester);
    const subjectIds = semester ? semester.subjectIds : [];
    state.subject = subjectIds.length ? subjectIds[0] : null;
    renderBrowser("semester");
  });

  elements["subject-list"].addEventListener("click", (event) => {
    const button = event.target.closest("[data-subject]");
    if (!button) return;
    state.subject = button.dataset.subject;
    renderBrowser("subject");
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.getElementById("resources").scrollIntoView({ behavior: "smooth" });
      elements["branch-search"].focus();
    }
    if (event.key === "Escape") {
      elements["branch-search"].blur();
      closeMenu();
    }
  });
}

function chooseBranch(branchId) {
  state.branch = branchId;
  const branch = state.data.branches.find((item) => item.id === state.branch);
  const semester = orderedSemesters(branch)[0];
  state.semester = semester ? semester.id : null;
  const subjectIds = semester ? semester.subjectIds : [];
  state.subject = subjectIds.length ? subjectIds[0] : null;
  renderBrowser("branch");
}

function orderedSemesters(branch) {
  return [...((branch && branch.semesters) || [])].sort((a, b) =>
    Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name))
  );
}

function visibleBranches() {
  const branches = state.data && state.data.branches ? state.data.branches : [];
  if (!state.query) return branches;
  return branches.filter((branch) =>
    (branch.name + " " + branch.code).toLowerCase().includes(state.query)
  );
}

function countPdfs(collection) {
  return (collection.units || []).filter((unit) =>
    Boolean(unit.pyqUrl || unit.workshopFileUrl || unit.classNotesUrl)
  ).length;
}

function practiceKeyForUnit(unit) {
  return unit.practiceKey || unit.pyqUrl;
}

function collectionCountLabel(collection) {
  if (collection.layout === "core-resources") return "3 sections";
  if (collection.layout === "shops") {
    const shops = collection.units.filter((item) => item.kind === "shop").length;
    const hasClassNotes = collection.units.some((item) => item.kind === "class-notes");
    return shops + " shops" + (hasClassNotes ? " · class notes" : "");
  }
  const units = collection.units.filter((item) => item.kind !== "lab").length;
  const labs = collection.units.filter((item) => item.kind === "lab").length;
  return units + " units" + (labs ? " · " + labs + " lab" : "");
}

function renderBrowser(changeType) {
  renderBranches();
  const branches = state.data.branches;
  const collections = state.data.unitCollections;
  const branch = branches.find((item) => item.id === state.branch) || branches[0];
  state.branch = branch.id;
  const semesters = orderedSemesters(branch);
  let semester = semesters.find((item) => item.id === state.semester) || semesters[0] || null;
  state.semester = semester ? semester.id : null;
  const semesterName = semester ? semester.name : "No semester";
  const subjectIds = semester ? semester.subjectIds : [];
  const subjects = subjectIds
    .map((id) => collections.find((collection) => collection.id === id))
    .filter(Boolean);

  elements["semester-pane-branch"].textContent = branch.name;
  renderSemesters(branch);
  elements["subject-pane-semester"].textContent = semesterName;
  elements["path-branch"].textContent = branch.name;
  elements["path-semester"].textContent = semesterName;

  if (!subjects.length) {
    state.subject = null;
    elements["subject-list"].innerHTML = '<p class="no-results">No subjects added yet</p>';
    elements["path-subject"].textContent = "Coming soon";
    elements["subject-code"].textContent = semester ? "S" + (semester.order || "") : "—";
    elements["course-name"].textContent = "Resources coming soon";
    elements["course-description"].textContent = semester
      ? "Subjects can be added to this semester from the admin dashboard."
      : "No semester has been added to this branch yet.";
    elements["course-contributor"].hidden = true;
    elements["course-status"].textContent = "Empty";
    renderSubjectSyllabus(branch, null);
    elements["unit-list"].innerHTML = '<div class="empty-state"><h3>Nothing here yet</h3><p>This semester is ready for future subjects.</p></div>';
    animateBrowser(changeType);
    return;
  }

  if (!subjects.some((subject) => subject.id === state.subject)) state.subject = subjects[0].id;
  const subject = subjects.find((item) => item.id === state.subject);

  elements["subject-list"].innerHTML = subjects.map((item) => {
    return '<button class="subject-item ' + (item.id === subject.id ? "active" : "") +
      '" data-subject="' + item.id + '" type="button">' +
      '<span class="subject-monogram">' + escapeHtml(subjectCodes[item.id] || item.name.slice(0, 2)) + '</span>' +
      '<span><strong>' + escapeHtml(item.name) + '</strong><small>' + collectionCountLabel(item) + '</small></span>' +
      '<i aria-hidden="true">›</i></button>';
  }).join("");

  elements["path-subject"].textContent = subject.name;
  elements["subject-code"].textContent = subjectCodes[subject.id] || subject.name.slice(0, 2).toUpperCase();
  elements["course-name"].textContent = subject.name;
  elements["course-description"].textContent = subject.description;
  elements["course-contributor"].textContent = subject.providedBy ? "Provided by " + subject.providedBy : "";
  elements["course-contributor"].hidden = !subject.providedBy;
  const pdfCount = countPdfs(subject);
  elements["course-status"].textContent = collectionCountLabel(subject) + (pdfCount ? " · " + pdfCount + " PYQ sets" : "");
  renderSubjectSyllabus(branch, subject);
  elements["unit-list"].innerHTML = subject.layout === "core-resources"
    ? renderCoreResources()
    : subject.units.map((unit, index) => renderUnit(subject, unit, index)).join("");

  elements["unit-list"].querySelectorAll(".unit-row").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      elements["unit-list"].querySelectorAll(".unit-row[open]").forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });

  animateBrowser(changeType);
}

function renderSemesters(branch) {
  const semesters = orderedSemesters(branch);
  elements["semester-list"].innerHTML = semesters.map((semester, index) => {
    const subjectIds = semester.subjectIds || [];
    const count = subjectIds.length;
    return '<button class="semester-item ' + (semester.id === state.semester ? "active" : "") +
      '" data-semester="' + escapeHtml(semester.id) + '" type="button">' +
      '<span class="semester-code">S' + (index + 1) + '</span><span><strong>' + escapeHtml(semester.name) +
      '</strong><small>' + (count ? count + " subjects" : "Coming soon") + '</small></span>' +
      '<i aria-hidden="true">›</i></button>';
  }).join("") || '<p class="no-results">No semesters added yet</p>';
}

function renderSubjectSyllabus(branch, subject) {
  const syllabus = subject
    ? state.data.syllabi.find((item) => item.id === (subject.sourceSubjectId || subject.id) && item.available && item.url)
    : null;
  const link = elements["subject-syllabus"];

  if (syllabus) {
    link.href = syllabus.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View syllabus ↗";
    link.classList.remove("unavailable");
    link.setAttribute("aria-disabled", "false");
    return;
  }

  link.removeAttribute("href");
  link.removeAttribute("target");
  link.removeAttribute("rel");
  link.textContent = "Syllabus coming soon";
  link.classList.add("unavailable");
  link.setAttribute("aria-disabled", "true");
}

function animateBrowser(changeType) {
  if (!changeType || prefersReducedMotion()) return;

  if (changeType === "branch") {
    setStagger(elements["semester-list"], ".semester-item", 48);
    restartAnimation(elements["semester-list"], "semesters-entering");
  }

  if (changeType === "branch" || changeType === "semester") {
    setStagger(elements["subject-list"], ".subject-item", 34);
    restartAnimation(elements["subject-list"], "subjects-entering");
  }

  setStagger(elements["unit-list"], ".unit-row", 42);
  restartAnimation(elements["subject-header"], "subject-entering");
  restartAnimation(elements["unit-list"], "units-entering");

  if (window.innerWidth <= 850) {
    let target = elements["content-pane"];
    if (changeType === "branch") target = elements["semester-pane"];
    if (changeType === "semester") target = elements["subject-pane"];
    window.setTimeout(() => {
      try {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        target.scrollIntoView(true);
      }
    }, 140);
  }
}

function setStagger(container, selector, interval) {
  container.querySelectorAll(selector).forEach((item, index) => {
    item.style.animationDelay = String(index * interval) + "ms";
  });
}

function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function renderBranches() {
  const branches = visibleBranches();
  elements["branch-count"].textContent = String(branches.length);
  if (!branches.length) {
    elements["branch-list"].innerHTML = '<p class="no-results">No branch found</p>';
    return;
  }
  elements["branch-list"].innerHTML = branches.map((branch) => {
    return '<button class="branch-item ' + (branch.id === state.branch ? "active" : "") +
      '" data-branch="' + branch.id + '" type="button">' +
      '<span class="branch-code">' + escapeHtml(branch.code) + '</span>' +
      '<span>' + escapeHtml(branch.name) + '</span><i aria-hidden="true">›</i></button>';
  }).join("");
}

function renderUnit(subject, unit, index) {
  if (subject.layout === "shops") return renderWorkshopSection(unit, index);

  const isLab = unit.kind === "lab";
  const practiceKey = practiceKeyForUnit(unit);
  const handwrittenNotesUrl = unit.handwrittenNotesUrl || subject.handwrittenNotesUrl || subject.notesUrl;
  const lectureUrl = unit.disableSubjectLecture ? unit.lectureUrl : (unit.lectureUrl || subject.lectureUrl);
  const lectureChildren = Array.isArray(unit.lectureItems) && unit.lectureItems.length
    ? unit.lectureItems.map((item) => ({
        type: "lecture",
        title: item.title,
        description: item.description || "Video lesson",
        url: item.url,
      }))
    : null;
  const hasSplitNotes = subject.splitNotes || unit.handwrittenNotesUrl || unit.masterNotesUrl;
  const notesChildren = hasSplitNotes && !isLab ? [
    {
      type: "notes",
      title: "Handwritten Notes",
      description: handwrittenNotesUrl ? "Student-friendly study notes" : "Coming soon",
      url: handwrittenNotesUrl,
    },
    {
      type: "notes",
      title: "Master Notes",
      description: unit.masterNotesUrl ? "Complete exam-ready unit notes" : "Coming soon",
      url: unit.masterNotesUrl,
    },
  ] : null;
  const bookItems = [...(Array.isArray(subject.books) ? subject.books : []), ...(Array.isArray(unit.books) ? unit.books : [])]
    .filter((item) => item && item.url)
    .filter((item, itemIndex, items) => items.findIndex((candidate) => candidate.url === item.url) === itemIndex)
    .map((item) => ({
      type: "book",
      title: item.title || "Recommended Book",
      description: item.description || "Recommended reading",
      url: item.url,
    }));
  const legacyBookUrl = unit.bookUrl || subject.booksUrl;
  if (legacyBookUrl && !bookItems.some((item) => item.url === legacyBookUrl)) {
    bookItems.push({ type: "book", title: "Recommended Book", description: "Recommended reading", url: legacyBookUrl });
  }

  if (isLab) {
    const labName = unit.sectionTitle || subject.name.replace(/^Engineering\s+/i, "") + " Lab";
    const labMaterials = [
      {
        type: "notes",
        title: "Lab Manual",
        description: unit.labManualUrl ? subject.name + " practical manual" : "Coming soon",
        url: unit.labManualUrl,
      },
      {
        type: "lecture",
        title: "Experiment Videos",
        description: unit.experimentVideosUrl ? "Practical demonstrations" : "Coming soon",
        url: unit.experimentVideosUrl,
      },
      {
        type: "pyq",
        title: "Viva Questions",
        description: unit.vivaQuestionsUrl ? "Experiment-wise viva preparation" : "Coming soon",
        url: unit.vivaQuestionsUrl,
      },
      {
        type: "pyq",
        title: "End-Semester Lab Questions",
        description: unit.endSemesterQuestionsUrl ? "Lab-related end-semester questions" : "Coming soon",
        url: unit.endSemesterQuestionsUrl,
      },
      bookItems.length > 1 ? {
        type: "book",
        title: "Reference Books",
        description: bookItems.length + " books available",
        url: null,
        children: bookItems,
      } : (bookItems[0] || { type: "book", title: "Reference Books", description: "Coming soon", url: null }),
    ];
    const ready = labMaterials.filter((material) => material.url || (material.children && material.children.length)).length;
    return '<details class="unit-row lab-row">' +
      '<summary><span class="unit-index">LAB</span>' +
      '<span class="unit-title"><strong>' + escapeHtml(labName) + '</strong><small>' + escapeHtml(unit.title) + '</small>' + contributorCredit(unit) + '</span>' +
      '<span class="unit-count">' + (ready ? ready + ' available' : 'Coming soon') + '</span>' +
      '<span class="chevron" aria-hidden="true"></span></summary>' +
      '<div class="material-list">' + labMaterials.map((material) => material.children ? renderMaterialFolder(material) : renderMaterial(material)).join("") + '</div></details>';
  }

  const materials = [
    {
      type: "lecture",
      title: "Lectures",
      description: lectureChildren
        ? lectureChildren.filter((lecture) => lecture.url).length + " topics available"
        : (lectureUrl ? "Video playlist" : (unit.lectureMessage || "Not added yet")),
      url: lectureUrl,
      children: lectureChildren,
    },
    {
      type: "notes",
      title: "Notes",
      description: notesChildren
        ? notesChildren.filter((note) => note.url).length + " of 2 folders available"
        : (unit.notesUrl || subject.notesUrl ? "Study notes" : "Not added yet"),
      url: unit.notesUrl || subject.notesUrl,
      children: notesChildren,
    },
    {
      type: "pyq",
      title: "PYQs",
      description: unit.pyqUrl ? "Unit " + unit.number + " question paper" : "Not added yet",
      url: unit.pyqUrl,
    },
    {
      type: "book",
      title: "Books",
      description: bookItems.length ? (bookItems.length === 1 ? "Recommended reading" : bookItems.length + " books available") : "Not added yet",
      url: bookItems.length === 1 ? bookItems[0].url : null,
      children: bookItems.length > 1 ? bookItems : null,
    },
    {
      type: "practice",
      title: "Practice Mode",
      description: practiceKey ? "AI-generated questions from this unit's PYQs" : "Needs PYQs first",
      url: practiceKey,
      subject: subject.name,
      unitTitle: unit.title,
    },
  ];
  const ready = materials.filter((material) =>
    material.url || (material.children && material.children.some((child) => child.url))
  ).length;
  return '<details class="unit-row" ' + (index === 0 ? "open" : "") + '>' +
    '<summary><span class="unit-index">' + twoDigits(unit.number) + '</span>' +
    '<span class="unit-title"><strong>Unit ' + unit.number + '</strong><small>' + escapeHtml(unit.title) + '</small>' + contributorCredit(unit) + '</span>' +
    '<span class="unit-count">' + ready + ' available</span><span class="chevron" aria-hidden="true"></span></summary>' +
    '<div class="material-list">' + materials.map((material) =>
      material.children ? renderMaterialFolder(material) : renderMaterial(material)
    ).join("") + '</div></details>';
}

function renderCoreResources() {
  const resources = [
    { type: "notes", title: "Notes", description: "Coming soon", url: null },
    { type: "pyq", title: "PYQs", description: "Coming soon", url: null },
    { type: "book", title: "Books", description: "Coming soon", url: null },
  ];
  return '<div class="material-list core-resource-list" aria-label="Technology core resources">' +
    resources.map(renderMaterial).join("") + '</div>';
}

function renderWorkshopSection(unit, index) {
  const isClassNotes = unit.kind === "class-notes";
  const url = isClassNotes ? unit.classNotesUrl : unit.workshopFileUrl;
  const material = {
    type: "notes",
    title: isClassNotes ? "Class Notes PDF" : "Workshop File",
    description: url
      ? (isClassNotes ? (unit.credit || "Central Workshop class notes") : unit.title + " practical file")
      : "Coming soon",
    url,
  };
  const indexLabel = isClassNotes ? "CN" : twoDigits(index + 1);
  const subtitle = isClassNotes ? "Central Workshop notes" : "Workshop shop";

  return '<details class="unit-row workshop-row">' +
    '<summary><span class="unit-index">' + indexLabel + '</span>' +
    '<span class="unit-title"><strong>' + escapeHtml(unit.title) + '</strong><small>' +
    subtitle + '</small>' + contributorCredit(unit) + '</span>' +
    '<span class="unit-count">' + (url ? "1 file" : "Coming soon") + '</span>' +
    '<span class="chevron" aria-hidden="true"></span></summary>' +
    '<div class="material-list workshop-material-list">' + renderMaterial(material) + '</div></details>';
}

function contributorCredit(item) {
  return item && item.providedBy
    ? '<span class="unit-contributor">Provided by ' + escapeHtml(item.providedBy) + '</span>'
    : '';
}

function renderMaterialFolder(material) {
  const available = material.children.filter((item) => item.url).length;
  const content = '<span class="material-icon">' + materialIcons[material.type] + '</span>' +
    '<span class="material-copy"><strong>' + escapeHtml(material.title) + '</strong><small>' +
    escapeHtml(material.description) + '</small></span>' +
    '<span class="material-action">Browse <i class="material-folder-chevron" aria-hidden="true">⌄</i></span>';

  return '<details class="material-folder">' +
    '<summary class="material-item">' + content + '</summary>' +
    '<div class="material-folder-list" aria-label="' + escapeHtml(material.title) + '">' +
    material.children.map(renderMaterial).join("") +
    '</div><span class="sr-only">' + available + ' folders available</span></details>';
}

function openableResourceUrl(value) {
  const url = String(value || "");
  if (!url.startsWith("/uploads/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}asset=20260906`;
}

function renderMaterial(material) {
  const isPractice = material.type === "practice";
  const actionLabel = material.url ? (isPractice ? "Generate" : "Open") : "Soon";
  const content = '<span class="material-icon">' + materialIcons[material.type] + '</span>' +
    '<span class="material-copy"><strong>' + escapeHtml(material.title) + '</strong><small>' +
    escapeHtml(material.description) + '</small></span>' +
    '<span class="material-action">' + actionLabel +
    (material.url ? '<i aria-hidden="true">' + (isPractice ? "✨" : "↗") + '</i>' : "") + '</span>';

  if (isPractice && material.url) {
    return '<button class="material-item practice-trigger" type="button" data-pyq-url="' +
      escapeHtml(material.url) + '" data-subject="' + escapeHtml(material.subject) +
      '" data-unit-title="' + escapeHtml(material.unitTitle) + '">' + content + '</button>';
  }

  return material.url
    ? '<a class="material-item" href="' + escapeHtml(openableResourceUrl(material.url)) +
      '" target="_blank" rel="noopener noreferrer">' + content + '</a>'
    : '<div class="material-item unavailable" aria-disabled="true">' + content + '</div>';
}

function renderSyllabi() {
  const groups = state.data.syllabusGroups || [];
  elements["syllabus-list"].innerHTML = groups.map((group, groupIndex) => {
    const availableCount = group.semesters.reduce((total, semester) => {
      return total + semester.syllabusIds.reduce((count, id) => {
        const item = state.data.syllabi.find((syllabus) => syllabus.id === id);
        return count + (item && item.available && item.url ? 1 : 0);
      }, 0);
    }, 0);
    const countLabel = availableCount ? availableCount + (availableCount === 1 ? " file" : " files") : "Empty";
    const semesters = group.semesters.map((semester, semesterIndex) => {
      return renderSyllabusSemester(semester, group.title, semesterIndex);
    }).join("");

    return '<details class="syllabus-group">' +
      '<summary class="group-summary"><span class="group-index">' + twoDigits(groupIndex + 1) + '</span>' +
      '<span class="group-copy"><strong>' + escapeHtml(group.title) + '</strong><small>' +
      escapeHtml(group.subtitle) + ' · 2 semester folders</small></span><span class="group-count">' +
      countLabel + '</span><span class="group-chevron" aria-hidden="true"></span></summary>' +
      '<div class="group-contents">' + semesters + '</div></details>';
  }).join("");

  // Always start with both groups and their semester folders closed. This
  // also defeats browser form-state restoration that can reopen <details>.
  elements["syllabus-list"].querySelectorAll("details").forEach((details) => {
    details.open = false;
  });
}

function renderSyllabusSemester(folder, groupTitle, folderIndex) {
  const items = folder.syllabusIds
    .map((id) => state.data.syllabi.find((item) => item.id === id))
    .filter(Boolean);
  const availableCount = items.filter((item) => item.available && item.url).length;
  const countLabel = availableCount ? availableCount + (availableCount === 1 ? " file" : " files") : "Empty";
  const contents = items.length
    ? items.map((item, itemIndex) => renderSyllabusItem(item, itemIndex)).join("")
    : '<div class="folder-empty"><strong>Nothing added yet</strong><span>This semester is ready for future syllabus files.</span></div>';

  return '<details class="syllabus-folder">' +
    '<summary><span class="folder-index">' + twoDigits(folderIndex + 1) + '</span>' +
    '<span class="folder-copy"><strong>' + escapeHtml(folder.title) + '</strong><small>' +
    escapeHtml(groupTitle) + ' branches</small></span><span class="folder-count">' + countLabel +
    '</span><span class="folder-chevron" aria-hidden="true"></span></summary>' +
    '<div class="folder-contents">' + contents + '</div></details>';
}

function renderSyllabusItem(item, index) {
  const content = '<span class="syllabus-index">' + twoDigits(index + 1) + '</span>' +
    '<span><strong>' + escapeHtml(item.title) + '</strong><small>' +
    (item.available ? "Official syllabus" : "Coming soon") + '</small></span>' +
    '<i aria-hidden="true">' + (item.available ? "↗" : "—") + '</i>';
  return item.available
    ? '<a class="syllabus-item" href="' + escapeHtml(item.url) +
      '" target="_blank" rel="noopener noreferrer">' + content + '</a>'
    : '<div class="syllabus-item unavailable">' + content + '</div>';
}

function updateStats() {
  const pdfCount = state.data.unitCollections.reduce((total, subject) => total + countPdfs(subject), 0);
  elements["available-count"].textContent = String(pdfCount);
  elements["subject-count"].textContent = String(new Set(state.data.unitCollections.map((subject) => subject.sourceSubjectId || subject.id)).size);
}

function initialisePlanner() {
  elements["today-label"].textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());
  renderTasks();

  elements["task-form"].addEventListener("submit", (event) => {
    event.preventDefault();
    const title = elements["task-input"].value.trim();
    if (!title) return;
    state.tasks.unshift({
      id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
      title,
      done: false,
    });
    elements["task-input"].value = "";
    persistTasks();
    renderTasks();
  });

  elements["task-list"].addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-task-toggle]");
    if (!checkbox) return;
    const task = state.tasks.find((item) => item.id === checkbox.dataset.taskToggle);
    if (task) task.done = checkbox.checked;
    persistTasks();
    renderTasks();
  });

  elements["task-list"].addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-delete]");
    if (!button) return;
    state.tasks = state.tasks.filter((item) => item.id !== button.dataset.taskDelete);
    persistTasks();
    renderTasks();
  });
}

function persistTasks() {
  saveStorage(STORAGE.tasks, state.tasks);
}

function renderTasks() {
  elements["task-empty"].hidden = state.tasks.length > 0;
  elements["task-list"].innerHTML = state.tasks.map((task) => {
    return '<label class="task-item ' + (task.done ? "done" : "") + '">' +
      '<input type="checkbox" data-task-toggle="' + task.id + '" ' + (task.done ? "checked" : "") + ' />' +
      '<span>' + escapeHtml(task.title) + '</span>' +
      '<button type="button" data-task-delete="' + task.id + '" aria-label="Delete task">×</button></label>';
  }).join("");
}

function initialiseTimer() {
  updateTimer();
  elements["timer-toggle"].addEventListener("click", () => {
    if (timerInterval) pauseTimer();
    else startTimer();
  });
  elements["timer-reset"].addEventListener("click", resetTimer);
}

function startTimer() {
  if (timerSeconds <= 0) timerSeconds = 25 * 60;
  timerInterval = window.setInterval(() => {
    timerSeconds -= 1;
    updateTimer();
    if (timerSeconds <= 0) pauseTimer(true);
  }, 1000);
  elements["timer-toggle"].textContent = "Pause";
  elements["timer-status"].textContent = "Focusing";
}

function pauseTimer(complete = false) {
  window.clearInterval(timerInterval);
  timerInterval = null;
  elements["timer-toggle"].textContent = complete ? "Start again" : "Resume";
  elements["timer-status"].textContent = complete ? "Complete" : "Paused";
}

function resetTimer() {
  window.clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 25 * 60;
  elements["timer-toggle"].textContent = "Start";
  elements["timer-status"].textContent = "Ready";
  updateTimer();
}

function updateTimer() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  elements["timer-value"].textContent =
    twoDigits(minutes) + ":" + twoDigits(seconds);
  const elapsed = 25 * 60 - timerSeconds;
  elements["timer-ring"].style.setProperty("--progress", ((elapsed / (25 * 60)) * 100) + "%");
  const title = state.data && state.data.meta ? state.data.meta.title || "HelpDesk" : "HelpDesk";
  const institution = state.data && state.data.meta ? state.data.meta.institution || "HBTU" : "HBTU";
  document.title = timerInterval
    ? elements["timer-value"].textContent + " · " + title
    : title + " · " + institution;
}

/* ---------- Unlimited Practice Hub ---------- */
/* A full-screen, four-step flow: semester -> subject -> unit -> quiz.
   "quiz" streams one AI-generated question at a time (Next fetches more
   from the server once the current batch runs out), so it feels infinite. */

let practiceHub = {
  step: "semester", // "semester" | "subject" | "unit" | "quiz"
  semester: null,
  semesterName: "",
  subjectId: null,
  subjectName: "",
  unit: null, // { number, title, pyqUrl }
  questions: [],
  index: 0,
  loadingMore: false,
};

function initialisePractice() {
  elements["practice-open"].addEventListener("click", () => {
    closeMenu();
    openPracticeHub("semester");
  });

  elements["unit-list"].addEventListener("click", (event) => {
    const trigger = event.target.closest(".practice-trigger");
    if (!trigger) return;
    openPracticeHub("quiz", {
      subjectName: trigger.dataset.subject,
      unit: { title: trigger.dataset.unitTitle, pyqUrl: trigger.dataset.pyqUrl },
    });
  });

  elements["practice-hub-close"].addEventListener("click", closePracticeHub);
  elements["practice-back"].addEventListener("click", practiceGoBack);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements["practice-hub"].classList.contains("open")) {
      closePracticeHub();
    }
  });
}

function openPracticeHub(step, seed) {
  practiceHub = {
    step,
    semester: null,
    semesterName: "",
    subjectId: null,
    subjectName: (seed && seed.subjectName) || "",
    unit: (seed && seed.unit) || null,
    questions: [],
    index: 0,
    loadingMore: false,
  };
  elements["practice-hub"].classList.add("open");
  document.body.classList.add("no-scroll");
  if (step === "quiz") {
    startQuiz();
  } else {
    renderPracticeStep();
  }
}

function closePracticeHub() {
  elements["practice-hub"].classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function practiceGoBack() {
  if (practiceHub.step === "quiz") {
    practiceHub.step = practiceHub.subjectId ? "unit" : "semester";
  } else if (practiceHub.step === "unit") {
    practiceHub.step = "subject";
  } else if (practiceHub.step === "subject") {
    practiceHub.step = "semester";
  } else {
    closePracticeHub();
    return;
  }
  renderPracticeStep();
}

function subjectsForSemester(semester) {
  const data = state.data || {};
  const branches = data.branches || [];
  const ids = new Set();
  branches.forEach((branch) => {
    const match = (branch.semesters || []).find((item) => item.id === semester);
    ((match && match.subjectIds) || []).forEach((id) => ids.add(id));
  });
  return (data.unitCollections || [])
    .filter((subject) => ids.has(subject.id) && (subject.units || []).some((unit) => practiceKeyForUnit(unit)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function practiceSemesters() {
  const found = new Map();
  (state.data.branches || []).forEach((branch) => {
    orderedSemesters(branch).forEach((semester) => {
      if (!found.has(semester.id)) found.set(semester.id, semester);
    });
  });
  return [...found.values()].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function unitsForSubject(subjectId) {
  const data = state.data || {};
  const subject = (data.unitCollections || []).find((item) => item.id === subjectId);
  if (!subject) return [];
  return (subject.units || []).filter((unit) => practiceKeyForUnit(unit));
}

function renderPracticeStep() {
  const heading = elements["practice-hub-heading"];
  const back = elements["practice-back"];
  const body = elements["practice-hub-body"];
  back.hidden = practiceHub.step === "semester";

  if (!state.data) {
    heading.textContent = "Loading practice library";
    body.innerHTML = '<div class="practice-loading"><div class="skeleton"></div>' +
      '<div class="skeleton"></div><div class="skeleton"></div></div>';
    ensureResourceData()
      .then(() => {
        if (elements["practice-hub"].classList.contains("open")) renderPracticeStep();
      })
      .catch((error) => {
        console.error(error);
        renderQuizError("The practice library could not load. Refresh the page and try again.");
      });
    return;
  }

  if (practiceHub.step === "semester") {
    heading.textContent = "Choose a semester";
    const semesters = practiceSemesters();
    body.innerHTML = semesters.map((semester) =>
      '<button class="practice-option" type="button" data-semester="' + escapeHtml(semester.id) + '">' +
        '<strong>' + escapeHtml(semester.name) + '</strong><span>→</span></button>'
    ).join("");
    body.querySelectorAll("[data-semester]").forEach((button) => {
      button.addEventListener("click", () => {
        practiceHub.semester = button.dataset.semester;
        const semester = semesters.find((item) => item.id === practiceHub.semester);
        practiceHub.semesterName = semester ? semester.name : "Semester";
        practiceHub.step = "subject";
        renderPracticeStep();
      });
    });
    return;
  }

  if (practiceHub.step === "subject") {
    heading.textContent = practiceHub.semesterName + " · choose a subject";
    const subjects = subjectsForSemester(practiceHub.semester);
    body.innerHTML = subjects.length
      ? subjects.map((subject) =>
          '<button class="practice-option" type="button" data-subject="' + escapeHtml(subject.id) + '">' +
            '<strong>' + escapeHtml(subject.name) + '</strong><span>→</span></button>'
        ).join("")
      : '<div class="empty-state"><h3>No PYQ-backed subjects yet</h3><p>This semester doesn\'t have practice-ready units yet.</p></div>';
    body.querySelectorAll("[data-subject]").forEach((button) => {
      button.addEventListener("click", () => {
        const subject = subjects.find((item) => item.id === button.dataset.subject);
        practiceHub.subjectId = subject.id;
        practiceHub.subjectName = subject.name;
        practiceHub.step = "unit";
        renderPracticeStep();
      });
    });
    return;
  }

  if (practiceHub.step === "unit") {
    heading.textContent = practiceHub.subjectName + " · choose a unit";
    const units = unitsForSubject(practiceHub.subjectId);
    body.innerHTML = units.length
      ? units.map((unit) =>
          '<button class="practice-option" type="button" data-pyq-url="' + escapeHtml(practiceKeyForUnit(unit)) +
            '" data-unit-title="' + escapeHtml(unit.title) + '">' +
            '<strong>Unit ' + unit.number + '</strong><span class="practice-option-sub">' + escapeHtml(unit.title) + '</span></button>'
        ).join("")
      : '<div class="empty-state"><h3>No units yet</h3><p>PYQs for this subject aren\'t added yet.</p></div>';
    body.querySelectorAll("[data-pyq-url]").forEach((button) => {
      button.addEventListener("click", () => {
        practiceHub.unit = { title: button.dataset.unitTitle, pyqUrl: button.dataset.pyqUrl };
        practiceHub.step = "quiz";
        startQuiz();
      });
    });
  }
}

function startQuiz() {
  const heading = elements["practice-hub-heading"];
  const back = elements["practice-back"];
  back.hidden = false;
  heading.textContent = practiceHub.subjectName ? practiceHub.subjectName + " · " + practiceHub.unit.title : practiceHub.unit.title;
  practiceHub.questions = [];
  practiceHub.index = 0;
  renderQuizLoading();
  fetchMoreQuestions().then(() => renderQuizQuestion());
}

function renderQuizLoading() {
  elements["practice-hub-body"].innerHTML = '<div class="practice-loading">' +
    '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
}

async function fetchMoreQuestions() {
  try {
    const response = await fetch("/api/practice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pyqUrl: practiceHub.unit.pyqUrl,
        subjectTitle: practiceHub.subjectName,
        unitTitle: practiceHub.unit.title,
      }),
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseError) {
      console.error("Practice API returned non-JSON:", raw.slice(0, 300));
      renderQuizError("Practice API is not available on this deployment yet.");
      return false;
    }
    if (!response.ok) {
      renderQuizError(data.error || "Something went wrong.");
      return false;
    }
    if (!Array.isArray(data.questions) || !data.questions.length) {
      renderQuizError("No questions came back. Try again.");
      return false;
    }
    if (!practiceHub.subjectName && data.subject) practiceHub.subjectName = data.subject;
    practiceHub.questions.push(...data.questions);
    return true;
  } catch (error) {
    console.error(error);
    renderQuizError("Could not reach the server. Check your connection and try again.");
    return false;
  }
}

function renderQuizError(message) {
  elements["practice-hub-body"].innerHTML = '<div class="practice-error"><p>' + escapeHtml(message) + '</p>' +
    '<button class="secondary-button" id="practice-retry" type="button">Try again</button></div>';
  const retry = document.getElementById("practice-retry");
  if (retry) retry.addEventListener("click", () => { renderQuizLoading(); fetchMoreQuestions().then(() => renderQuizQuestion()); });
}

function renderQuizQuestion() {
  const item = practiceHub.questions[practiceHub.index];
  if (!item) return;
  const isLast = practiceHub.index === practiceHub.questions.length - 1;
  elements["practice-hub-body"].innerHTML =
    '<article class="practice-card">' +
      '<p class="practice-progress">Question ' + (practiceHub.index + 1) + '</p>' +
      '<p class="practice-question">' + escapeHtml(item.question) + '</p>' +
      '<button class="practice-toggle" id="practice-toggle" type="button">Show solution</button>' +
      '<div class="practice-answer" id="practice-answer">' + escapeHtml(item.answer || "No solution provided.") + '</div>' +
    '</article>' +
    '<div class="practice-quiz-actions">' +
      '<button class="primary-button" id="practice-next" type="button">' +
        (isLast ? "Generate & continue →" : "Next question →") +
      '</button>' +
    '</div>';

  document.getElementById("practice-toggle").addEventListener("click", (event) => {
    const answer = document.getElementById("practice-answer");
    const showing = answer.classList.toggle("show");
    event.target.textContent = showing ? "Hide solution" : "Show solution";
  });

  document.getElementById("practice-next").addEventListener("click", practiceNext);
}

async function practiceNext() {
  if (practiceHub.loadingMore) return;
  const nextIndex = practiceHub.index + 1;
  if (nextIndex < practiceHub.questions.length) {
    practiceHub.index = nextIndex;
    renderQuizQuestion();
    return;
  }
  practiceHub.loadingMore = true;
  const button = document.getElementById("practice-next");
  if (button) { button.disabled = true; button.textContent = "Generating…"; }
  const ok = await fetchMoreQuestions();
  practiceHub.loadingMore = false;
  if (ok) {
    practiceHub.index = nextIndex;
    renderQuizQuestion();
  }
}

/* ---------- Placements & official HBTU notices ---------- */

function initialisePlacements() {
  elements["placements-open"].addEventListener("click", () => {
    closeMenu();
    openPlacementHub("stats");
  });
  elements["notices-open"].addEventListener("click", () => {
    closeMenu();
    openPlacementHub("notices");
  });
  elements["placement-hub-close"].addEventListener("click", closePlacementHub);
  elements["placement-tab-stats"].addEventListener("click", () => switchPlacementTab("stats"));
  elements["placement-tab-notices"].addEventListener("click", () => switchPlacementTab("notices"));
  elements["placement-hub-body"].addEventListener("click", (event) => {
    const refresh = event.target.closest("[data-refresh-notices]");
    if (!refresh) return;
    noticeDataPromise = null;
    renderPlacementHub();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements["placement-hub"].classList.contains("open")) {
      closePlacementHub();
    }
  });
}

function openPlacementHub(tab) {
  elements["placement-hub"].classList.add("open");
  document.body.classList.add("no-scroll");
  switchPlacementTab(tab || "stats");
}

function closePlacementHub() {
  elements["placement-hub"].classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function switchPlacementTab(tab) {
  placementHubState.tab = tab;
  const statsActive = tab === "stats";
  elements["placement-tab-stats"].classList.toggle("active", statsActive);
  elements["placement-tab-notices"].classList.toggle("active", !statsActive);
  elements["placement-tab-stats"].setAttribute("aria-selected", statsActive ? "true" : "false");
  elements["placement-tab-notices"].setAttribute("aria-selected", statsActive ? "false" : "true");
  elements["placement-hub-heading"].textContent = statsActive ? "Placement intelligence" : "Campus notices";
  renderPlacementHub();
}

function placementLoadingHtml() {
  return '<div class="placement-loading" aria-label="Loading">' +
    '<div class="placement-loading-block"></div><div class="placement-loading-block"></div>' +
    '<div class="placement-loading-line"></div><div class="placement-loading-line"></div></div>';
}

async function loadPlacementData() {
  if (!placementDataPromise) {
    placementDataPromise = (async () => {
      let lastError;
      for (const source of ["/api/placements", "/placements.json"]) {
        try {
          const response = await fetch(source, { cache: "no-store" });
          if (!response.ok) throw new Error("Placement data returned " + response.status);
          const data = await response.json();
          if (!Array.isArray(data.latest) || !Array.isArray(data.history) || !Array.isArray(data.reports)) throw new Error("Placement data is incomplete");
          return data;
        } catch (error) { lastError = error; }
      }
      throw lastError || new Error("Placement data could not load");
    })().catch((error) => { placementDataPromise = null; throw error; });
  }
  return placementDataPromise;
}

async function loadNoticeData() {
  if (!noticeDataPromise) {
    noticeDataPromise = (async () => {
      const sources = ["/api/notices", "/notices-fallback.json"];
      let lastError;
      for (const source of sources) {
        try {
          const response = await fetch(source, { cache: "no-store" });
          if (!response.ok) throw new Error(source + " returned " + response.status);
          const data = await response.json();
          if (!Array.isArray(data.notices) || !data.notices.length) throw new Error("Notice feed is empty");
          return data;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Notices could not load");
    })().catch((error) => {
      noticeDataPromise = null;
      throw error;
    });
  }
  return noticeDataPromise;
}

function metricHtml(value, label) {
  return '<div class="placement-metric"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label) + '</span></div>';
}

function formatLpa(value) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " LPA";
}

function renderLatestPlacement(year) {
  const rate = typeof year.placementRate === "number"
    ? metricHtml(year.placementRate.toFixed(2) + "%", "Students placed")
    : metricHtml(year.studentsPlaced, "Students placed");
  return '<article class="placement-year-card">' +
    '<div class="placement-year-heading"><div><p>' + escapeHtml(year.status) + '</p><h4>' + escapeHtml(year.session) + '</h4></div>' +
      '<a href="' + escapeHtml(year.reportUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Open ' + escapeHtml(year.session) + ' official placement report">Report ↗</a></div>' +
    '<div class="placement-metrics">' +
      metricHtml(formatLpa(year.highestLpa), year.highestLabel || "Highest package") +
      metricHtml(formatLpa(year.averageLpa), year.averageLabel || "Average package") +
      metricHtml(year.offers, "Job offers") + rate +
    '</div></article>';
}

function renderHistoryRow(year) {
  const extra = [];
  if (typeof year.companies === "number") extra.push(year.companies + " companies");
  if (typeof year.internships === "number") extra.push(year.internships + " paid internships");
  const label = extra.length ? extra.join(" · ") : "Official historical statistic";
  const tag = year.reportUrl ? "a" : "div";
  const linkAttributes = year.reportUrl
    ? ' href="' + escapeHtml(year.reportUrl) + '" target="_blank" rel="noopener noreferrer"'
    : "";
  return '<' + tag + ' class="placement-history-row"' + linkAttributes + '>' +
    '<div><strong>' + escapeHtml(year.session) + '</strong><span>' + escapeHtml(label) + '</span></div>' +
    '<div class="placement-history-values"><span><b>' + escapeHtml(formatLpa(year.highestLpa)) + '</b> highest</span>' +
      '<span><b>' + escapeHtml(formatLpa(year.averageLpa)) + '</b> average</span>' +
      (year.reportUrl ? '<i aria-hidden="true">↗</i>' : "") + '</div></' + tag + '>';
}

function renderReportLink(report) {
  return '<a class="placement-report" href="' + escapeHtml(report.url) + '" target="_blank" rel="noopener noreferrer">' +
    '<span><strong>' + escapeHtml(report.title) + '</strong><small>' + escapeHtml(report.meta) + '</small></span><i aria-hidden="true">↗</i></a>';
}

function renderPlacementStats(data) {
  const source = data.source || {};
  elements["placement-hub-body"].innerHTML =
    '<section class="placement-intro"><div><p class="placement-kicker">OFFICIAL NUMBERS</p>' +
      '<h3>A clearer view of campus placements.</h3><p>Recent totals and historical package trends, collected from published HBTU reports.</p></div>' +
      '<a class="placement-source-link" href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">HBTU source ↗</a></section>' +
    '<div class="placement-feature-grid">' + data.latest.map(renderLatestPlacement).join("") + '</div>' +
    '<section class="placement-section"><div class="placement-section-heading"><div><p>HISTORY</p><h3>Five-year snapshot</h3></div><span>Packages in LPA</span></div>' +
      '<div class="placement-history">' + data.history.map(renderHistoryRow).join("") + '</div></section>' +
    '<section class="placement-section"><div class="placement-section-heading"><div><p>REPORTS</p><h3>Open the source documents</h3></div><span>Published by HBTU</span></div>' +
      '<div class="placement-report-grid">' + data.reports.map(renderReportLink).join("") + '</div></section>' +
    '<p class="placement-footnote">Package figures vary by programme and report scope. Use the linked official PDFs for branch-wise details.</p>';
}

function noticeTimeLabel(value) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (error) {
    return "recently";
  }
}

function renderNoticeItem(notice) {
  return '<a class="notice-item" href="' + escapeHtml(notice.url) + '" target="_blank" rel="noopener noreferrer">' +
    '<span class="notice-number" aria-hidden="true">' + escapeHtml(notice.category || "Notice").slice(0, 2).toUpperCase() + '</span>' +
    '<span class="notice-copy"><span class="notice-meta">' + escapeHtml(notice.category || "General") +
      (notice.isNew ? '<b>NEW</b>' : "") + '</span><strong>' + escapeHtml(notice.title) + '</strong></span>' +
    '<span class="notice-arrow" aria-hidden="true">↗</span></a>';
}

function renderNotices(data) {
  const live = data.source === "live";
  const count = Number(data.newCount) || data.notices.filter((notice) => notice.isNew).length;
  elements["notice-tab-count"].textContent = count ? String(count) : "";
  elements["notice-tab-count"].hidden = !count;
  elements["placement-hub-body"].innerHTML =
    '<section class="notice-status"><div class="notice-status-copy"><span class="notice-live-dot ' + (live ? "live" : "") + '"></span><div>' +
      '<strong>' + (live ? "Live from HBTU" : "Latest saved copy") + '</strong><small>Checked ' + escapeHtml(noticeTimeLabel(data.fetchedAt)) + '</small></div></div>' +
      '<div class="notice-status-actions"><button type="button" data-refresh-notices>Refresh</button>' +
      '<a href="' + escapeHtml(data.sourceUrl || "https://hbtu.ac.in/") + '" target="_blank" rel="noopener noreferrer">Official page ↗</a></div></section>' +
    '<section class="notice-list" aria-label="Latest HBTU notices">' + data.notices.map(renderNoticeItem).join("") + '</section>' +
    '<p class="placement-footnote">Links open the original HBTU notice or PDF. Always verify deadlines on the official university website.</p>';
}

function renderPlacementError(message) {
  elements["placement-hub-body"].innerHTML = '<div class="placement-error"><p>' + escapeHtml(message) + '</p>' +
    '<button class="secondary-button" type="button" data-refresh-notices>Try again</button></div>';
}

function renderPlacementHub() {
  const tab = placementHubState.tab;
  elements["placement-hub-body"].innerHTML = placementLoadingHtml();
  if (tab === "stats") {
    loadPlacementData()
      .then((data) => {
        if (placementHubState.tab === "stats" && elements["placement-hub"].classList.contains("open")) renderPlacementStats(data);
      })
      .catch((error) => {
        console.error(error);
        if (placementHubState.tab === "stats") renderPlacementError("Placement statistics could not load. Please try again.");
      });
    return;
  }
  loadNoticeData()
    .then((data) => {
      if (placementHubState.tab === "notices" && elements["placement-hub"].classList.contains("open")) renderNotices(data);
    })
    .catch((error) => {
      console.error(error);
      if (placementHubState.tab === "notices") renderPlacementError("HBTU notices could not load. Check your connection and try again.");
    });
}

/* ---------- Daily official scholarship feed ---------- */

function initialiseScholarships() {
  elements["scholarships-open"].addEventListener("click", () => {
    closeMenu();
    elements["scholarship-hub"].classList.add("open");
    document.body.classList.add("no-scroll");
    renderScholarshipHub();
  });
  elements["scholarship-hub-close"].addEventListener("click", closeScholarshipHub);
  elements["scholarship-hub-body"].addEventListener("click", (event) => {
    if (!event.target.closest("[data-refresh-scholarships]")) return;
    scholarshipDataPromise = null;
    renderScholarshipHub();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements["scholarship-hub"].classList.contains("open")) closeScholarshipHub();
  });
}

function closeScholarshipHub() {
  elements["scholarship-hub"].classList.remove("open");
  document.body.classList.remove("no-scroll");
}

async function loadScholarshipData() {
  if (!scholarshipDataPromise) {
    scholarshipDataPromise = (async () => {
      const sources = ["/api/scholarships", "/scholarships-fallback.json"];
      let lastError;
      for (const source of sources) {
        try {
          const response = await fetch(source, { cache: "no-store" });
          if (!response.ok) throw new Error(source + " returned " + response.status);
          const data = await response.json();
          if (!data.featured || !Array.isArray(data.scholarships)) throw new Error("Scholarship feed is incomplete");
          return data;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Scholarships could not load");
    })().catch((error) => {
      scholarshipDataPromise = null;
      throw error;
    });
  }
  return scholarshipDataPromise;
}

function scholarshipMeta(item) {
  return '<span>' + escapeHtml(item.organization || "Official source") + '</span><i>·</i><span>' + escapeHtml(item.category || "Scholarship") + '</span>';
}

function renderFeaturedScholarship(item) {
  return '<a class="scholarship-feature" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">' +
    '<div><p>PINNED · UTTAR PRADESH GOVERNMENT</p><h3>' + escapeHtml(item.title) + '</h3><span>' + escapeHtml(item.description) + '</span></div>' +
    '<div class="scholarship-feature-foot"><small>' + escapeHtml(item.deadline || "Check the current application window") + '</small><b>Open official portal ↗</b></div></a>';
}

function renderScholarshipCard(item) {
  return '<a class="scholarship-card" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">' +
    '<div class="scholarship-card-meta">' + scholarshipMeta(item) + (item.isNew ? '<b>NEW</b>' : '') + '</div>' +
    '<h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.description || "Open the official source for complete details.") + '</p>' +
    '<div class="scholarship-card-foot"><span>' + escapeHtml(item.deadline || "Verify dates on the official portal") + '</span><i>↗</i></div></a>';
}

function renderScholarships(data) {
  const live = data.source === "live";
  elements["scholarship-hub-body"].innerHTML =
    '<section class="notice-status"><div class="notice-status-copy"><span class="notice-live-dot ' + (live ? "live" : "") + '"></span><div>' +
      '<strong>' + (live ? "Daily official feed" : "Saved official directory") + '</strong><small>Checked ' + escapeHtml(noticeTimeLabel(data.fetchedAt)) + '</small></div></div>' +
      '<div class="notice-status-actions"><button type="button" data-refresh-scholarships>Refresh</button><a href="https://scholarships.gov.in/" target="_blank" rel="noopener noreferrer">NSP ↗</a></div></section>' +
    renderFeaturedScholarship(data.featured) +
    '<section class="scholarship-section"><div class="placement-section-heading"><div><p>MORE OPPORTUNITIES</p><h3>Official scholarships and updates</h3></div><span>Refreshed daily</span></div>' +
      '<div class="scholarship-grid">' + data.scholarships.map(renderScholarshipCard).join("") + '</div></section>' +
    '<p class="placement-footnote">HelpDesk never asks for scholarship payments or documents. Apply only through the linked official portal.</p>';
}

function renderScholarshipHub() {
  elements["scholarship-hub-body"].innerHTML = placementLoadingHtml();
  loadScholarshipData().then(renderScholarships).catch((error) => {
    console.error(error);
    elements["scholarship-hub-body"].innerHTML = '<div class="placement-error"><p>Scholarships could not load. Check your connection and try again.</p><button class="secondary-button" type="button" data-refresh-scholarships>Try again</button></div>';
  });
}

/* ---------- SGPA / CGPA Calculator ---------- */

const DEFAULT_GRADE_SCALE = [
  { id: "g10", label: "A+", points: 10 },
  { id: "g9", label: "A", points: 9 },
  { id: "g8", label: "B+", points: 8 },
  { id: "g7", label: "B", points: 7 },
  { id: "g6", label: "C+", points: 6 },
  { id: "g5", label: "C", points: 5 },
  { id: "g4", label: "D", points: 4 },
  { id: "g0", label: "F", points: 0 },
];

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

let calcState = {
  tab: "semester",
  scale: readStorage(STORAGE.calcScale, DEFAULT_GRADE_SCALE),
  semesters: readStorage(STORAGE.calcSemesters, []),
  courses: readStorage(STORAGE.calcDraft, []),
  scaleOpen: false,
  addSemesterOpen: false,
};

if (!calcState.courses.length) {
  calcState.courses = [{ id: uid("c"), name: "", credits: 4, gradeId: calcState.scale[0].id }];
}

function initialiseCalculator() {
  elements["calc-open"].addEventListener("click", () => {
    closeMenu();
    openCalcHub();
  });
  elements["calc-hub-close"].addEventListener("click", closeCalcHub);
  elements["calc-tab-semester"].addEventListener("click", () => switchCalcTab("semester"));
  elements["calc-tab-cgpa"].addEventListener("click", () => switchCalcTab("cgpa"));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements["calc-hub"].classList.contains("open")) {
      closeCalcHub();
    }
  });

  elements["calc-hub-body"].addEventListener("input", handleCalcInput);
  elements["calc-hub-body"].addEventListener("click", handleCalcClick);
  elements["calc-hub-body"].addEventListener("submit", handleCalcSubmit);
}

function openCalcHub() {
  elements["calc-hub"].classList.add("open");
  document.body.classList.add("no-scroll");
  renderCalcBody();
}

function closeCalcHub() {
  elements["calc-hub"].classList.remove("open");
  document.body.classList.remove("no-scroll");
}

function switchCalcTab(tab) {
  calcState.tab = tab;
  elements["calc-tab-semester"].classList.toggle("active", tab === "semester");
  elements["calc-tab-cgpa"].classList.toggle("active", tab === "cgpa");
  elements["calc-tab-semester"].setAttribute("aria-selected", tab === "semester" ? "true" : "false");
  elements["calc-tab-cgpa"].setAttribute("aria-selected", tab === "cgpa" ? "true" : "false");
  renderCalcBody();
}

function renderCalcBody() {
  elements["calc-hub-body"].innerHTML = calcState.tab === "semester" ? renderSemesterTabHtml() : renderCgpaTabHtml();
}

function gradeOptionsHtml(selectedId) {
  return calcState.scale.map((grade) =>
    '<option value="' + grade.id + '"' + (grade.id === selectedId ? " selected" : "") + '>' +
      escapeHtml(grade.label) + " (" + grade.points + ")</option>"
  ).join("");
}

function computeSgpa(courses, scale) {
  let totalCredits = 0;
  let totalPoints = 0;
  courses.forEach((course) => {
    const credits = Number(course.credits) || 0;
    const grade = scale.find((item) => item.id === course.gradeId);
    const points = grade ? grade.points : 0;
    totalCredits += credits;
    totalPoints += credits * points;
  });
  const sgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  return { totalCredits, totalPoints, sgpa };
}

function renderCourseRowHtml(course) {
  return '<div class="calc-row" data-course-row="' + course.id + '">' +
    '<input class="calc-input" type="text" data-field="name" data-id="' + course.id +
      '" placeholder="Subject (optional)" value="' + escapeHtml(course.name) + '" />' +
    '<input class="calc-input" type="number" min="0" max="20" step="1" data-field="credits" data-id="' +
      course.id + '" value="' + escapeHtml(course.credits) + '" aria-label="Credits" />' +
    '<select class="calc-input" data-field="gradeId" data-id="' + course.id + '" aria-label="Grade">' +
      gradeOptionsHtml(course.gradeId) + '</select>' +
    '<button class="calc-remove" type="button" data-action="remove-course" data-id="' + course.id +
      '" aria-label="Remove subject">×</button></div>';
}

function renderSemesterTabHtml() {
  const { totalCredits, sgpa } = computeSgpa(calcState.courses, calcState.scale);
  const rows = calcState.courses.map(renderCourseRowHtml).join("");
  return (
    '<p class="calc-section-label">Subjects this semester</p>' +
    rows +
    '<button class="calc-add-button" type="button" data-action="add-course">+ Add subject</button>' +
    '<div class="calc-result-card"><div><span>SGPA</span><br /><span class="calc-result-sub">' +
      totalCredits + (totalCredits === 1 ? " credit" : " credits") + '</span></div>' +
      '<span class="calc-result-value">' + sgpa.toFixed(2) + '</span></div>' +
    '<div class="calc-save-row">' +
      '<input class="calc-input" type="text" id="calc-semester-label" placeholder="Label, e.g. Semester 3" />' +
      '<button class="primary-button" type="button" data-action="save-semester">Save to CGPA</button></div>' +
    '<button class="calc-link-button" type="button" data-action="toggle-scale">' +
      (calcState.scaleOpen ? "Hide grading scale" : "Customize grading scale") + '</button>' +
    (calcState.scaleOpen ? renderScalePanelHtml() : "")
  );
}

function renderScalePanelHtml() {
  const rows = calcState.scale.map((grade) =>
    '<div class="calc-scale-row">' +
      '<input class="calc-input" type="text" data-scale-field="label" data-scale-id="' + grade.id +
        '" value="' + escapeHtml(grade.label) + '" />' +
      '<input class="calc-input" type="number" min="0" max="10" step="0.1" data-scale-field="points" data-scale-id="' +
        grade.id + '" value="' + grade.points + '" />' +
      '<button class="calc-remove" type="button" data-action="remove-grade" data-id="' + grade.id +
        '" aria-label="Remove grade">×</button></div>'
  ).join("");
  return '<div class="calc-scale-panel">' + rows +
    '<button class="calc-add-button" type="button" data-action="add-grade">+ Add grade</button></div>';
}

function renderCgpaTabHtml() {
  const semesters = calcState.semesters;
  const totalCredits = semesters.reduce((sum, item) => sum + item.credits, 0);
  const totalPoints = semesters.reduce((sum, item) => sum + item.points, 0);
  const cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;

  const list = semesters.length
    ? semesters.map((item) =>
        '<div class="calc-semester-item"><div><strong>' + escapeHtml(item.label) + '</strong>' +
          '<small>' + item.credits + (item.credits === 1 ? " credit" : " credits") + '</small></div>' +
          '<div><span class="calc-semester-sgpa">' + item.sgpa.toFixed(2) + '</span>' +
          '<button class="calc-remove" type="button" data-action="remove-semester" data-id="' + item.id +
          '" aria-label="Remove semester">×</button></div></div>'
      ).join("")
    : '<div class="empty-state"><h3>No semesters saved yet</h3><p>Compute an SGPA in the "This semester" tab and save it here, or add one manually below.</p></div>';

  return (
    '<p class="calc-section-label">Saved semesters</p>' +
    list +
    '<div class="calc-result-card"><div><span>CGPA</span><br /><span class="calc-result-sub">' +
      totalCredits + (totalCredits === 1 ? " credit" : " credits") + ' across ' + semesters.length +
      (semesters.length === 1 ? " semester" : " semesters") + '</span></div>' +
      '<span class="calc-result-value">' + cgpa.toFixed(2) + '</span></div>' +
    '<button class="calc-link-button" type="button" data-action="toggle-add-semester">' +
      (calcState.addSemesterOpen ? "Cancel" : "+ Add a semester manually") + '</button>' +
    (calcState.addSemesterOpen ? renderAddSemesterFormHtml() : "")
  );
}

function renderAddSemesterFormHtml() {
  return '<form class="calc-scale-panel" id="calc-add-semester-form">' +
    '<input class="calc-input" type="text" id="calc-manual-label" placeholder="Label, e.g. Semester 2" required />' +
    '<input class="calc-input" type="number" id="calc-manual-credits" placeholder="Total credits" min="1" max="60" step="1" required />' +
    '<input class="calc-input" type="number" id="calc-manual-sgpa" placeholder="SGPA" min="0" max="10" step="0.01" required />' +
    '<button class="primary-button" type="submit">Add semester</button></form>';
}

function handleCalcInput(event) {
  const target = event.target;
  const courseId = target.dataset.id;
  const scaleId = target.dataset.scaleId;

  if (courseId && target.dataset.field) {
    const course = calcState.courses.find((item) => item.id === courseId);
    if (!course) return;
    course[target.dataset.field] = target.dataset.field === "credits" ? target.value : target.value;
    saveStorage(STORAGE.calcDraft, calcState.courses);
    if (target.dataset.field !== "name") {
      const cursorEl = document.activeElement;
      renderCalcBody();
      const same = elements["calc-hub-body"].querySelector('[data-id="' + courseId + '"][data-field="' + target.dataset.field + '"]');
      if (same && cursorEl === target) same.focus();
    } else {
      updateResultCardOnly();
    }
    return;
  }

  if (scaleId && target.dataset.scaleField) {
    const grade = calcState.scale.find((item) => item.id === scaleId);
    if (!grade) return;
    grade[target.dataset.scaleField] = target.dataset.scaleField === "points" ? Number(target.value) : target.value;
    saveStorage(STORAGE.calcScale, calcState.scale);
  }
}

function updateResultCardOnly() {
  const { totalCredits, sgpa } = computeSgpa(calcState.courses, calcState.scale);
  const card = elements["calc-hub-body"].querySelector(".calc-result-value");
  const sub = elements["calc-hub-body"].querySelector(".calc-result-sub");
  if (card) card.textContent = sgpa.toFixed(2);
  if (sub) sub.textContent = totalCredits + (totalCredits === 1 ? " credit" : " credits");
}

function handleCalcClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "add-course") {
    calcState.courses.push({ id: uid("c"), name: "", credits: 4, gradeId: calcState.scale[0].id });
    saveStorage(STORAGE.calcDraft, calcState.courses);
    renderCalcBody();
  } else if (action === "remove-course") {
    calcState.courses = calcState.courses.filter((item) => item.id !== button.dataset.id);
    if (!calcState.courses.length) {
      calcState.courses.push({ id: uid("c"), name: "", credits: 4, gradeId: calcState.scale[0].id });
    }
    saveStorage(STORAGE.calcDraft, calcState.courses);
    renderCalcBody();
  } else if (action === "toggle-scale") {
    calcState.scaleOpen = !calcState.scaleOpen;
    renderCalcBody();
  } else if (action === "add-grade") {
    calcState.scale.push({ id: uid("g"), label: "New", points: 5 });
    saveStorage(STORAGE.calcScale, calcState.scale);
    renderCalcBody();
  } else if (action === "remove-grade") {
    if (calcState.scale.length <= 1) return;
    calcState.scale = calcState.scale.filter((item) => item.id !== button.dataset.id);
    saveStorage(STORAGE.calcScale, calcState.scale);
    renderCalcBody();
  } else if (action === "save-semester") {
    const { totalCredits, totalPoints, sgpa } = computeSgpa(calcState.courses, calcState.scale);
    if (totalCredits <= 0) return;
    const labelInput = document.getElementById("calc-semester-label");
    const label = (labelInput && labelInput.value.trim()) || "Semester " + (calcState.semesters.length + 1);
    calcState.semesters.push({ id: uid("s"), label, credits: totalCredits, points: totalPoints, sgpa });
    saveStorage(STORAGE.calcSemesters, calcState.semesters);
    switchCalcTab("cgpa");
  } else if (action === "remove-semester") {
    calcState.semesters = calcState.semesters.filter((item) => item.id !== button.dataset.id);
    saveStorage(STORAGE.calcSemesters, calcState.semesters);
    renderCalcBody();
  } else if (action === "toggle-add-semester") {
    calcState.addSemesterOpen = !calcState.addSemesterOpen;
    renderCalcBody();
  }
}

function handleCalcSubmit(event) {
  if (event.target.id !== "calc-add-semester-form") return;
  event.preventDefault();
  const label = document.getElementById("calc-manual-label").value.trim();
  const credits = Number(document.getElementById("calc-manual-credits").value);
  const sgpa = Number(document.getElementById("calc-manual-sgpa").value);
  if (!label || !credits || Number.isNaN(sgpa)) return;
  calcState.semesters.push({ id: uid("s"), label, credits, points: credits * sgpa, sgpa });
  saveStorage(STORAGE.calcSemesters, calcState.semesters);
  calcState.addSemesterOpen = false;
  renderCalcBody();
}

document.addEventListener("DOMContentLoaded", initialise);
