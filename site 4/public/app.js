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
  semester: "1",
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
    "course-name", "course-description", "course-status", "subject-syllabus",
    "unit-list", "syllabus-list", "today-label", "task-form", "task-input", "task-list",
    "task-empty", "timer-status", "timer-ring", "timer-value", "timer-toggle", "timer-reset",
    "practice-open", "practice-hub", "practice-hub-close", "practice-back", "practice-hub-heading",
    "practice-hub-body",
    "calc-open", "calc-hub", "calc-hub-close", "calc-hub-body", "calc-tab-semester", "calc-tab-cgpa",
  ].forEach((id) => { elements[id] = document.getElementById(id); });
}

async function initialise() {
  cacheElements();
  initialiseTheme();
  initialiseNavigation();
  initialiseContacts();
  initialisePlanner();
  initialiseTimer();
  initialisePractice();
  initialiseCalculator();
  bindBrowserControls();

  try {
    state.data = await loadResourceData();
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

async function loadResourceData() {
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

function initialiseContacts() {
  document.querySelectorAll("[data-contact-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      button.querySelector("small").textContent = open ? "Tap to show WhatsApp" : "WhatsApp contact";
      button.querySelector(".profile-arrow").textContent = open ? "＋" : "−";
      panel.hidden = open;
    });
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
    const subjectIds = branch.semesterSubjectIds[state.semester] || [];
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
  state.semester = "1";
  const branch = state.data.branches.find((item) => item.id === state.branch);
  const subjectIds = branch.semesterSubjectIds[state.semester] || [];
  state.subject = subjectIds.length ? subjectIds[0] : null;
  renderBrowser("branch");
}

function visibleBranches() {
  const branches = state.data && state.data.branches ? state.data.branches : [];
  if (!state.query) return branches;
  return branches.filter((branch) =>
    (branch.name + " " + branch.code).toLowerCase().includes(state.query)
  );
}

function countPdfs(collection) {
  return collection.units.filter((unit) => Boolean(unit.pyqUrl)).length;
}

function renderBrowser(changeType) {
  renderBranches();
  const branches = state.data.branches;
  const collections = state.data.unitCollections;
  const branch = branches.find((item) => item.id === state.branch) || branches[0];
  state.branch = branch.id;
  const semesterName = "Semester " + state.semester;
  const subjectIds = branch.semesterSubjectIds[state.semester] || [];
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
    elements["subject-code"].textContent = "S" + state.semester;
    elements["course-name"].textContent = "Resources coming soon";
    elements["course-description"].textContent = branch.group === "engineering"
      ? "Engineering branch subjects will be added after their structure is provided."
      : "Semester 2 subjects will be added when they are provided.";
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
      '<span><strong>' + escapeHtml(item.name) + '</strong><small>' + item.units.length + ' units</small></span>' +
      '<i aria-hidden="true">›</i></button>';
  }).join("");

  elements["path-subject"].textContent = subject.name;
  elements["subject-code"].textContent = subjectCodes[subject.id] || subject.name.slice(0, 2).toUpperCase();
  elements["course-name"].textContent = subject.name;
  elements["course-description"].textContent = subject.description;
  const pdfCount = countPdfs(subject);
  elements["course-status"].textContent = subject.units.length + " units" + (pdfCount ? " · " + pdfCount + " PDFs" : "");
  renderSubjectSyllabus(branch, subject);
  elements["unit-list"].innerHTML = subject.units.map((unit, index) => renderUnit(subject, unit, index)).join("");

  elements["unit-list"].querySelectorAll("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      elements["unit-list"].querySelectorAll("details[open]").forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });

  animateBrowser(changeType);
}

function renderSemesters(branch) {
  elements["semester-list"].innerHTML = ["1", "2"].map((semester) => {
    const subjectIds = branch.semesterSubjectIds[semester] || [];
    const count = subjectIds.length;
    return '<button class="semester-item ' + (semester === state.semester ? "active" : "") +
      '" data-semester="' + semester + '" type="button">' +
      '<span class="semester-code">S' + semester + '</span><span><strong>Semester ' + semester +
      '</strong><small>' + (count ? count + " subjects" : "Coming soon") + '</small></span>' +
      '<i aria-hidden="true">›</i></button>';
  }).join("");
}

function renderSubjectSyllabus(branch, subject) {
  const syllabus = subject
    ? state.data.syllabi.find((item) => item.id === subject.id && item.available && item.url)
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
  const materials = [
    {
      type: "lecture",
      title: "Lectures",
      description: unit.lectureUrl || subject.lectureUrl ? "Video playlist" : "Not added yet",
      url: unit.lectureUrl || subject.lectureUrl,
    },
    {
      type: "notes",
      title: "Notes",
      description: unit.notesUrl || subject.notesUrl ? "Study notes" : "Not added yet",
      url: unit.notesUrl || subject.notesUrl,
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
      description: unit.bookUrl || subject.booksUrl ? "Recommended reading" : "Not added yet",
      url: unit.bookUrl || subject.booksUrl,
    },
    {
      type: "practice",
      title: "Practice Mode",
      description: unit.pyqUrl ? "AI-generated questions from this unit's PYQs" : "Needs PYQs first",
      url: unit.pyqUrl,
      subject: subject.name,
      unitTitle: unit.title,
    },
  ];
  const ready = materials.filter((material) => material.url).length;
  return '<details class="unit-row" ' + (index === 0 ? "open" : "") + '>' +
    '<summary><span class="unit-index">' + twoDigits(unit.number) + '</span>' +
    '<span class="unit-title"><strong>Unit ' + unit.number + '</strong><small>' + escapeHtml(unit.title) + '</small></span>' +
    '<span class="unit-count">' + ready + ' available</span><span class="chevron" aria-hidden="true"></span></summary>' +
    '<div class="material-list">' + materials.map(renderMaterial).join("") + '</div></details>';
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
    ? '<a class="material-item" href="' + escapeHtml(material.url) +
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
  elements["subject-count"].textContent = String(state.data.unitCollections.length);
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
  document.title = timerInterval
    ? elements["timer-value"].textContent + " · HelpDesk"
    : "HelpDesk · HBTU";
}

/* ---------- Unlimited Practice Hub ---------- */
/* A full-screen, four-step flow: semester -> subject -> unit -> quiz.
   "quiz" streams one AI-generated question at a time (Next fetches more
   from the server once the current batch runs out), so it feels infinite. */

let practiceHub = {
  step: "semester", // "semester" | "subject" | "unit" | "quiz"
  semester: null,
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
  const branches = state.data.branches || [];
  const ids = new Set();
  branches.forEach((branch) => {
    (branch.semesterSubjectIds[semester] || []).forEach((id) => ids.add(id));
  });
  return (state.data.unitCollections || [])
    .filter((subject) => ids.has(subject.id) && subject.units.some((unit) => unit.pyqUrl))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function unitsForSubject(subjectId) {
  const subject = (state.data.unitCollections || []).find((item) => item.id === subjectId);
  if (!subject) return [];
  return subject.units.filter((unit) => unit.pyqUrl);
}

function renderPracticeStep() {
  const heading = elements["practice-hub-heading"];
  const back = elements["practice-back"];
  const body = elements["practice-hub-body"];
  back.hidden = practiceHub.step === "semester";

  if (practiceHub.step === "semester") {
    heading.textContent = "Choose a semester";
    body.innerHTML = ["1", "2"].map((sem) =>
      '<button class="practice-option" type="button" data-semester="' + sem + '">' +
        '<strong>Semester ' + sem + '</strong><span>→</span></button>'
    ).join("");
    body.querySelectorAll("[data-semester]").forEach((button) => {
      button.addEventListener("click", () => {
        practiceHub.semester = button.dataset.semester;
        practiceHub.step = "subject";
        renderPracticeStep();
      });
    });
    return;
  }

  if (practiceHub.step === "subject") {
    heading.textContent = "Semester " + practiceHub.semester + " · choose a subject";
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
          '<button class="practice-option" type="button" data-pyq-url="' + escapeHtml(unit.pyqUrl) +
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
      body: JSON.stringify({ pyqUrl: practiceHub.unit.pyqUrl }),
    });
    const data = await response.json();
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
