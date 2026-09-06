(function () {
  "use strict";

  try {
    const savedTheme = JSON.parse(localStorage.getItem("helpdesk-theme"));
    if (savedTheme === "dark") document.documentElement.dataset.theme = "dark";
  } catch {}

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const loginView = $("#login-view");
  const adminView = $("#admin-view");
  const editor = $("#editor");
  const saveButton = $("#save-button");
  const publishButton = $("#publish-button");
  const status = $("#save-status");
  const historyLink = $("#history-link");
  const state = { csrf: "", data: null, drafts: {}, published: {}, history: {}, section: "resources", dirty: false, saving: false, publishing: false, selection: {}, role: null, user: null, permissions: [], management: null, profile: null, community: [], coins: 0 };
  const titles = {
    resources: ["Content", "Resources"], syllabus: ["Academics", "Syllabus Citadel"], meta: ["Website", "Site details"], creators: ["People", "Creators"],
    placements: ["Outcomes", "Placements"], notices: ["Updates", "Notices"], scholarships: ["Funding", "Scholarships"], management: ["Security", "Access & approvals"],
    community: ["Community", "Contributor leaderboard"], profile: ["Account", "My profile"],
  };

  function roleLabel(role) {
    if (role === "main") return "Main admin";
    if (role === "branch") return "Branch admin";
    return "Regular admin";
  }

  function editableSection() {
    return !["community", "profile", "management"].includes(state.section);
  }

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  }

  function slug(value) {
    return String(value || "item").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 68) || "item";
  }

  function uniqueId(base, items) {
    const ids = new Set(items.map((item) => item.id));
    let value = slug(base); let index = 2;
    while (ids.has(value)) value = `${slug(base)}-${index++}`;
    return value;
  }

  function toast(message) {
    const node = $("#toast"); node.textContent = message; node.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.hidden = true; }, 3600);
  }

  async function request(url, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.csrf && options.method && options.method !== "GET") headers["X-HelpDesk-CSRF"] = state.csrf;
    const response = await fetch(url, { credentials: "same-origin", ...options, headers });
    let result = {}; try { result = await response.json(); } catch {}
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }

  function showLogin(message, success = false) {
    adminView.hidden = true; loginView.hidden = false;
    const notice = $("#login-error");
    notice.classList.toggle("registration-success", success);
    if (message) { notice.textContent = message; notice.hidden = false; }
    else { notice.textContent = ""; notice.hidden = true; }
  }

  async function boot() {
    try {
      const session = await request("/api/admin/session", { method: "GET" });
      if (!session.authenticated) return showLogin();
      state.csrf = session.csrfToken;
      await loadDashboard();
    } catch (error) { showLogin(error.message); }
  }

  async function loadDashboard() {
    const payload = await request("/api/admin/data", { method: "GET" });
    state.data = { resources: payload.resources, placements: payload.placements, notices: payload.notices, scholarships: payload.scholarships };
    state.role = payload.role; state.user = payload.user; state.permissions = payload.permissions || [];
    state.profile = payload.profile || { photoUrl: "" }; state.community = payload.community || []; state.coins = payload.coins || 0;
    state.history = payload.history || {}; state.drafts = payload.drafts || {}; state.published = payload.published || {}; state.csrf = payload.csrfToken || state.csrf;
    const contributorSections = new Set(["resources", "community", "profile"]);
    $$('[data-section]').forEach((button) => { button.hidden = state.role !== "main" && !contributorSections.has(button.dataset.section); });
    $("#management-nav").hidden = state.role !== "main";
    if (state.role !== "main" && !contributorSections.has(state.section)) state.section = "resources";
    $("#admin-identity").textContent = `${state.user.name || state.user.username} · ${roleLabel(state.role)}`;
    $("#admin-avatar").src = state.profile.photoUrl || "/favicon.svg";
    saveButton.textContent = state.role === "main" ? "Save draft" : (state.role === "branch" ? "Save contribution draft" : "Submit request");
    loginView.hidden = true; adminView.hidden = false;
    ensureSelection(); render();
  }

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const error = $("#login-error"); error.hidden = true; error.classList.remove("registration-success");
    const submit = event.submitter; submit.disabled = true; submit.textContent = "Signing in…";
    try {
      const result = await request("/api/admin/login", { method: "POST", body: JSON.stringify({ username: $("#login-username").value, password: $("#login-password").value }) });
      state.csrf = result.csrfToken; $("#login-password").value = ""; await loadDashboard();
      history.replaceState(null, "", "/admin");
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { submit.disabled = false; submit.textContent = "Continue"; }
  });

  function selectLoginTab(tab) {
    const registering = tab === "register";
    $("#login-form").hidden = registering; $("#registration-form").hidden = !registering;
    $("#login-tab-signin").classList.toggle("active", !registering); $("#login-tab-register").classList.toggle("active", registering);
  }
  $("#login-tab-signin").addEventListener("click", () => selectLoginTab("signin"));
  $("#login-tab-register").addEventListener("click", () => selectLoginTab("register"));
  $("#registration-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form=event.currentTarget;const button=event.submitter;const message=$("#registration-message");message.hidden=true;message.classList.remove("registration-success");button.disabled=true;button.textContent="Submitting…";
    try {
      const body=Object.fromEntries(new FormData(form).entries());const result=await request("/api/admin/register",{method:"POST",body:JSON.stringify(body)});
      form.reset();message.textContent=`Application sent. Reference: ${result.applicationId}. A main admin must approve it and give you login credentials.`;message.classList.add("registration-success");message.hidden=false;
    } catch(error){message.textContent=error.message;message.hidden=false;}
    finally{button.disabled=false;button.textContent="Submit application";}
  });

  $("#logout-button").addEventListener("click", async () => {
    try { await request("/api/admin/logout", { method: "POST", body: "{}" }); } catch {}
    state.csrf = ""; state.data = null; state.role=null; state.profile=null; state.community=[]; selectLoginTab("signin"); showLogin();
  });

  $$("#admin-nav button").forEach((button) => button.addEventListener("click", async () => {
    if (state.dirty) return toast(state.role === "main" ? "Save this draft before leaving the section." : "Save the current section before leaving it.");
    state.section = button.dataset.section; render(); closeSidebar();
  }));

  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebar-scrim").hidden = true; }
  $("#open-sidebar").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#sidebar-scrim").hidden = false; });
  $("#close-sidebar").addEventListener("click", closeSidebar); $("#sidebar-scrim").addEventListener("click", closeSidebar);

  function markDirty() {
    state.dirty = true; state.revision = (state.revision || 0) + 1;
    saveButton.disabled = false;
    publishButton.disabled = true;
    status.textContent = state.role === "regular" ? "Draft only" : "Unsaved";
  }
  function target() { return ["meta", "creators", "syllabus"].includes(state.section) ? "resources" : state.section; }

  async function saveChanges() {
    if (!state.dirty) return;
    if (state.role === "regular") return submitRegularChange();
    if (state.role === "branch") return saveBranchDraft();
    if (state.saving) { state.saveQueued = true; return; }
    state.saving = true; saveButton.disabled = true; saveButton.textContent = "Saving…"; status.textContent = "Validating";
    const key = target(); const revision = state.revision;
    if (key === "resources") state.data.resources.meta.creators = state.data.resources.creators.map((creator) => creator.name);
    try {
      const result = await request("/api/admin/save", { method: "POST", body: JSON.stringify({ target: key, data: state.data[key] }) });
      if (!result.draft || result.deploying) throw new Error("Safety check failed: the server did not confirm a private draft-only save.");
      state.dirty = state.revision !== revision;
      if (!state.dirty) state.drafts[key] = { draftId: result.draftId || null, updatedAt: result.updatedAt, updatedBy: result.updatedBy };
      status.textContent = state.dirty ? "Unsaved" : "Draft saved"; state.history[key] = result.historyUrl || state.history[key]; renderHistory();
      $$('.field[data-dirty="true"]').forEach((field) => {
        field.dataset.dirty = "false"; field.dataset.saved = "true";
        const note = $(".field-state", field); if (note) note.textContent = "Saved ✓";
        setTimeout(() => { field.dataset.saved = "false"; }, 2200);
      });
      toast("Draft saved privately. Nothing was deployed and no deploy credit was used.");
    } catch (error) {
      status.textContent = "Save failed"; saveButton.disabled = false;
      $$('.field[data-dirty="true"]').forEach((field) => { field.dataset.error = "true"; const note = $(".field-state", field); if (note) note.textContent = "Save failed"; });
      toast(error.message);
    } finally {
      state.saving = false; saveButton.textContent = state.role === "main" ? "Save draft" : (state.role === "branch" ? "Save contribution draft" : "Submit request"); saveButton.disabled = !state.dirty;
      publishButton.disabled = state.role !== "main" || state.dirty || !state.drafts[target()];
      state.saveQueued = false;
    }
  }
  saveButton.addEventListener("click", saveChanges);

  async function publishSavedDraft(key, label) {
    if (state.role !== "main" || state.publishing) return false;
    if (!state.drafts[key]) { toast("There is no saved draft to publish."); return false; }
    if (!confirm(`Publish the saved ${label} draft now? It will update the live website through Netlify Blobs without starting a production deployment.`)) return false;
    state.publishing = true; publishButton.disabled = true; publishButton.textContent = "Publishing…"; status.textContent = "Publishing";
    try {
      const result = await request("/api/admin/publish", { method: "POST", body: JSON.stringify({ target: key, draftId: state.drafts[key].draftId || null, message: `Publish saved ${label} content from HelpDesk admin` }) });
      if (result.deploying) throw new Error("Safety check failed: content attempted to start a deployment.");
      delete state.drafts[key];
      state.published[key] = { publishedAt: result.publishedAt, publishedBy: result.publishedBy, version: result.version, delivery: result.delivery };
      status.textContent = "Live via Blobs";
      renderHistory();
      toast("Published instantly through Netlify Blobs. No production deployment was started.");
      return true;
    } catch (error) {
      status.textContent = "Publish failed";
      toast(error.message);
      return false;
    } finally {
      state.publishing = false; publishButton.textContent = "Publish changes";
      publishButton.disabled = state.dirty || !state.drafts[key];
    }
  }

  async function publishChanges() {
    if (state.role !== "main" || state.publishing) return;
    const key = target();
    if (state.dirty) return toast("Save the draft first, then publish it.");
    await publishSavedDraft(key, titles[state.section][1]);
  }
  publishButton.addEventListener("click", publishChanges);

  function askChangeSummary(branchDraft = false) {
    return new Promise((resolve) => {
      const modal=document.createElement("div");modal.className="request-modal";
      modal.innerHTML=`<form class="request-modal-card"><p class="eyebrow">${branchDraft?"Branch contribution":"Approval required"}</p><h2>Describe your ${branchDraft?"draft":"requested change"}</h2><p class="muted">${branchDraft?"This saves privately for a main admin to publish later through Blobs. It does not use a deployment credit.":"A main admin will review this draft before anything reaches the website."}</p><textarea required maxlength="500" placeholder="Example: Replace Unit 2 master notes and add a lecture link."></textarea><div class="management-actions"><button class="primary" type="submit">${branchDraft?"Save contribution draft":"Send for approval"}</button><button class="quiet-button" type="button" data-cancel>Keep editing</button></div></form>`;
      document.body.appendChild(modal);const finish=(value)=>{modal.remove();resolve(value);};
      $("[data-cancel]",modal).addEventListener("click",()=>finish(null));
      $("form",modal).addEventListener("submit",(event)=>{event.preventDefault();finish($("textarea",modal).value.trim());});
    });
  }

  function scopedProposal() {
    const branch=selectedBranch();const semester=selectedSemester();
    if(!branch||!semester)return null;
    const subjectIds=new Set(semester.subjectIds);
    return {
      branch,
      semester,
      proposal:{semester:{id:semester.id,name:semester.name,order:semester.order,subjectIds:[...semester.subjectIds]},unitCollections:state.data.resources.unitCollections.filter(item=>subjectIds.has(item.id))},
    };
  }

  async function submitRegularChange() {
    if (state.saving) return; const scoped=scopedProposal();
    if(!scoped)return toast("Choose an assigned branch and semester first.");
    const {branch,semester,proposal}=scoped;
    const summary=await askChangeSummary();if(!summary)return;
    state.saving=true;saveButton.disabled=true;saveButton.textContent="Submitting…";status.textContent="Sending for approval";
    try{
      await request("/api/admin/change-request",{method:"POST",body:JSON.stringify({scope:{branchId:branch.id,semesterId:semester.id},summary,proposal})});
      state.dirty=false;status.textContent="Pending approval";toast("Change request sent to the main admins.");await loadDashboard();
    }catch(error){status.textContent="Request failed";toast(error.message);}
    finally{state.saving=false;saveButton.textContent="Submit request";saveButton.disabled=!state.dirty;}
  }

  async function saveBranchDraft() {
    if(state.saving)return;const scoped=scopedProposal();if(!scoped)return toast("Choose a governed branch and semester first.");
    const summary=await askChangeSummary(true);if(!summary)return;
    state.saving=true;saveButton.disabled=true;saveButton.textContent="Saving…";status.textContent="Validating scope";
    try{
      const result=await request("/api/admin/scoped-save",{method:"POST",body:JSON.stringify({scope:{branchId:scoped.branch.id,semesterId:scoped.semester.id},summary,proposal:scoped.proposal})});
      if(!result.draft||result.deploying)throw new Error("Safety check failed: contribution was not stored as a private draft.");
      state.dirty=false;status.textContent="Draft saved · awaiting main admin";toast("Contribution saved as a draft. Nothing was deployed. You earned 1 coin.");await loadDashboard();
    }catch(error){status.textContent="Save failed";toast(error.message);}
    finally{state.saving=false;saveButton.textContent="Save contribution draft";saveButton.disabled=!state.dirty;}
  }

  function renderHistory() {
    const url = state.history[target()]; historyLink.hidden = state.role !== "main" || !url;
    if (url) historyLink.href = url;
  }

  function render() {
    $$("#admin-nav button").forEach((button) => button.classList.toggle("active", button.dataset.section === state.section));
    $("#section-eyebrow").textContent = titles[state.section][0]; $("#section-title").textContent = titles[state.section][1];
    const editable=editableSection();saveButton.hidden=!editable;publishButton.hidden=!editable||state.role!=="main";status.hidden=!editable;
    saveButton.disabled = !state.dirty;
    publishButton.disabled = state.role!=="main"||state.dirty||!state.drafts[target()];
    status.textContent = state.dirty ? (state.role === "regular" ? "Draft only" : "Unsaved") : (state.role === "regular" ? "No pending draft" : (state.role === "branch" ? `${state.coins} coins · awaiting main-admin publish` : (state.drafts[target()] ? "Draft saved · not live" : "Live via Blobs"))); renderHistory();
    if (state.section === "resources") renderResources();
    else if (state.section === "syllabus") renderSyllabus();
    else if (state.section === "meta") renderMeta();
    else if (state.section === "creators") renderCreators();
    else if (state.section === "placements") renderPlacements();
    else if (state.section === "scholarships") renderScholarships();
    else if (state.section === "management") renderManagement();
    else if (state.section === "community") renderCommunity();
    else if (state.section === "profile") renderProfile();
    else renderNotices();
  }

  function input(label, path, value, options = {}) {
    const type = options.type || "text"; const full = options.full ? " full" : "";
    const control = type === "textarea"
      ? `<textarea data-bind="${escape(path)}" ${options.required ? "required" : ""}>${escape(value)}</textarea>`
      : `<input data-bind="${escape(path)}" type="${escape(type)}" value="${escape(value)}" ${options.required ? "required" : ""}>`;
    return `<label class="field${full}"><span>${escape(label)}</span>${control}${options.help ? `<small>${escape(options.help)}</small>` : ""}<small class="field-state"></small></label>`;
  }

  function urlInput(label, path, value, accept = ".pdf,application/pdf") {
    return `<label class="field full"><span>${escape(label)}</span><span class="upload-row"><input data-bind="${escape(path)}" type="url" value="${escape(value || "")}" placeholder="Paste a URL or upload a file"><span class="quiet-button upload-button">Upload<input data-upload-bind="${escape(path)}" type="file" accept="${escape(accept)}"></span></span><small class="field-state"></small></label>`;
  }

  function bind(container, root) {
    $$('[data-bind]', container).forEach((node) => node.addEventListener("input", () => {
      const keys = node.dataset.bind.split("."); let current = root;
      keys.slice(0, -1).forEach((key) => { current = current[key]; });
      current[keys.at(-1)] = node.type === "number" ? (node.value === "" ? null : Number(node.value)) : node.type === "checkbox" ? node.checked : node.value;
      const field = node.closest(".field");
      if (field) { field.dataset.dirty = "true"; field.dataset.error = "false"; const note = $(".field-state", field); if (note) note.textContent = state.role === "main" ? "Unsaved draft" : "Unsaved"; }
      markDirty();
    }));
    $$('[data-upload-bind]', container).forEach((node) => node.addEventListener("change", async () => {
      const file = node.files && node.files[0]; if (!file) return;
      const button = node.parentElement; const old = button.firstChild.textContent; button.firstChild.textContent = "Uploading…";
      try {
        const bound = container.querySelector(`[data-bind="${CSS.escape(node.dataset.uploadBind)}"]`);
        const url = await uploadFile(file, bound.value, (percent) => { button.firstChild.textContent = `Uploading ${percent}%`; });
        bound.value = url; bound.dispatchEvent(new Event("input", { bubbles: true })); toast("Upload complete.");
      } catch (error) { toast(error.message); }
      finally { button.firstChild.textContent = old; node.value = ""; }
    }));
  }

  async function uploadFile(file, previousUrl, onProgress) {
    const maximum = file.type === "application/pdf" ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!file.size || file.size > maximum) throw new Error(`File must be under ${maximum / 1024 / 1024} MB.`);
    const chunkSize = 1536 * 1024; const totalChunks = Math.ceil(file.size / chunkSize); const uploadId = crypto.randomUUID().replace(/-/g, "");
    for (let index = 0; index < totalChunks; index += 1) {
      const buffer = await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer();
      const bytes = new Uint8Array(buffer); let binary = "";
      for (let cursor = 0; cursor < bytes.length; cursor += 0x8000) binary += String.fromCharCode(...bytes.subarray(cursor, cursor + 0x8000));
      await request("/api/admin/upload", { method: "POST", body: JSON.stringify({ action: "chunk", uploadId, name: file.name, contentType: file.type, size: file.size, totalChunks, index, data: btoa(binary) }) });
      if (onProgress) onProgress(Math.round(((index + 1) / totalChunks) * 95));
    }
    const result = await request("/api/admin/upload", { method: "POST", body: JSON.stringify({ action: "complete", uploadId, name: file.name, contentType: file.type, size: file.size, totalChunks, previousUrl }) });
    if (onProgress) onProgress(100);
    return result.url;
  }

  function ensureSelection() {
    const branches = state.data.resources.branches; const branch = branches.find((item) => item.id === state.selection.branchId) || branches[0];
    state.selection.branchId = branch && branch.id;
    const semesters = branch ? [...branch.semesters].sort((a, b) => a.order - b.order) : [];
    const semester = semesters.find((item) => item.id === state.selection.semesterId) || semesters[0]; state.selection.semesterId = semester && semester.id;
    const subjectId = semester && semester.subjectIds.includes(state.selection.subjectId) ? state.selection.subjectId : semester && semester.subjectIds[0];
    state.selection.subjectId = subjectId;
  }

  function selectedBranch() { return state.data.resources.branches.find((item) => item.id === state.selection.branchId); }
  function selectedSemester() { const branch = selectedBranch(); return branch && branch.semesters.find((item) => item.id === state.selection.semesterId); }
  function selectedSubject() { return state.data.resources.unitCollections.find((item) => item.id === state.selection.subjectId); }

  function move(list, index, direction) { const targetIndex = index + direction; if (targetIndex < 0 || targetIndex >= list.length) return; [list[index], list[targetIndex]] = [list[targetIndex], list[index]]; markDirty(); renderResources(); }
  function requireDelete(label) { return prompt(`This permanently removes ${label} and its linked content. Type DELETE to continue.`) === "DELETE"; }

  function openFillSelected() {
    if (state.role !== "main") return;
    const source = selectedSubject();
    if (!source) return toast("Choose the subject or resource you want to reuse first.");
    const modal = document.createElement("div");
    modal.className = "request-modal";
    modal.innerHTML = `<form class="request-modal-card fill-modal-card"><p class="eyebrow">Fill in selected</p><h2>Apply ${escape(source.name)}</h2><p class="muted">Select only the branches and semester sections that should receive this subject and its current lecture, notes, PYQs and units. Unchecked sections will not change.</p><div class="fill-selection">${state.data.resources.branches.map((branch) => `<div class="fill-branch"><strong>${escape(branch.name)}</strong><div class="fill-semesters">${[...branch.semesters].sort((a,b)=>a.order-b.order).map((semester) => `<label class="fill-option"><input type="checkbox" data-fill-target value="${escape(branch.id)}:${escape(semester.id)}"><span>${escape(semester.name)}</span></label>`).join("") || '<span class="muted">No sections</span>'}</div></div>`).join("")}</div><p class="fill-hint">If a matching subject already exists in a selected section, it will be linked to this updated version. Otherwise the subject will be added to that section.</p><div class="management-actions"><button class="primary" type="submit">Apply to selected</button><button class="quiet-button" type="button" data-cancel>Cancel</button></div></form>`;
    document.body.appendChild(modal);
    $("[data-cancel]", modal).addEventListener("click", () => modal.remove());
    $("form", modal).addEventListener("submit", (event) => {
      event.preventDefault();
      const targets = $$('[data-fill-target]:checked', modal).map((node) => node.value);
      if (!targets.length) return toast("Select at least one branch and semester section.");
      const sourceRoot = source.sourceSubjectId || source.id;
      const sourceName = source.name.trim().toLowerCase();
      let changed = 0;
      targets.forEach((value) => {
        const [branchId, semesterId] = value.split(":");
        const branch = state.data.resources.branches.find((item) => item.id === branchId);
        const semester = branch && branch.semesters.find((item) => item.id === semesterId);
        if (!semester) return;
        const matchIndex = semester.subjectIds.findIndex((subjectId) => {
          const item = state.data.resources.unitCollections.find((collection) => collection.id === subjectId);
          return subjectId === source.id || subjectId === sourceRoot || item && (item.sourceSubjectId === sourceRoot || item.id === sourceRoot || item.name.trim().toLowerCase() === sourceName);
        });
        const before = semester.subjectIds.join("|");
        if (matchIndex >= 0) semester.subjectIds[matchIndex] = source.id;
        else semester.subjectIds.push(source.id);
        semester.subjectIds = [...new Set(semester.subjectIds)];
        if (semester.subjectIds.join("|") !== before) changed += 1;
      });
      modal.remove();
      if (!changed) return toast("The selected sections already use this subject version.");
      markDirty();
      renderResources();
      toast(`Applied ${source.name} to ${changed} selected section${changed === 1 ? "" : "s"}. Save the draft when ready.`);
    });
  }

  const QUICK_RESOURCE_TYPES = [
    { value: "lecture", label: "Main lecture / playlist", field: "lectureUrl", acceptsFile: false },
    { value: "lecture-item", label: "Extra named lecture", collection: "lectureItems", acceptsFile: false, needsTitle: true },
    { value: "handwritten-notes", label: "Handwritten notes", field: "handwrittenNotesUrl" },
    { value: "master-notes", label: "Master notes", field: "masterNotesUrl" },
    { value: "notes", label: "General notes", field: "notesUrl" },
    { value: "pyq", label: "Previous-year questions (PYQ)", field: "pyqUrl" },
    { value: "book", label: "Recommended book", collection: "books", needsTitle: true, multiple: true },
    { value: "workshop", label: "Workshop file", field: "workshopFileUrl" },
    { value: "class-notes", label: "Class notes", field: "classNotesUrl" },
    { value: "lab-manual", label: "Lab practical / manual", field: "labManualUrl" },
    { value: "experiment-videos", label: "Experiment videos", field: "experimentVideosUrl", acceptsFile: false },
    { value: "viva", label: "Viva questions", field: "vivaQuestionsUrl" },
    { value: "lab-questions", label: "End-semester lab questions", field: "endSemesterQuestionsUrl" },
  ];

  function quickTypesFor(unit) {
    const type = sectionType(unit);
    if (type === "lab") return QUICK_RESOURCE_TYPES.filter((item) => ["lab-manual", "experiment-videos", "viva", "lab-questions", "book"].includes(item.value));
    if (type === "shop") return QUICK_RESOURCE_TYPES.filter((item) => item.value === "workshop");
    if (type === "class-notes") return QUICK_RESOURCE_TYPES.filter((item) => item.value === "class-notes");
    return QUICK_RESOURCE_TYPES.filter((item) => ["lecture", "lecture-item", "handwritten-notes", "master-notes", "notes", "pyq", "book"].includes(item.value));
  }

  function openQuickAddResource() {
    const subject = selectedSubject();
    if (!subject) return toast("Choose a subject first.");
    if (!subject.units.length) return toast("Add a unit or special section first.");
    const initialIndex = Number.isInteger(state.selection.openUnitIndex) && subject.units[state.selection.openUnitIndex]
      ? state.selection.openUnitIndex : 0;
    const branch = selectedBranch(); const semester = selectedSemester();
    const modal = document.createElement("div"); modal.className = "request-modal";
    modal.innerHTML = `<form class="request-modal-card quick-add-card"><div class="quick-modal-head"><div><p class="eyebrow">Quick add</p><h2>Add a resource</h2><p class="muted">${escape(branch ? branch.name : "Library")} · ${escape(semester ? semester.name : "Semester")} · ${escape(subject.name)}</p></div><button class="icon-button" type="button" data-cancel aria-label="Close">×</button></div><div class="quick-step"><span>1</span><label class="field"><strong>Where should it go?</strong><select name="unit">${subject.units.map((unit,index)=>`<option value="${index}" ${index===initialIndex?"selected":""}>${escape(unit.number)} · ${escape(unit.title)}</option>`).join("")}</select></label></div><div class="quick-step"><span>2</span><label class="field"><strong>What are you adding?</strong><select name="type"></select></label></div><div class="quick-step"><span>3</span><div class="quick-source"><label class="field quick-title" hidden><strong>Display title</strong><input name="title" maxlength="250" placeholder="Example: Unit 2 recommended book"></label><label class="field"><strong>Paste a link</strong><input name="url" type="url" placeholder="YouTube, Google Drive or another direct link"></label><div class="quick-or"><span>or</span></div><label class="quick-file-drop"><strong>Upload PDF files</strong><small>Choose one file, or several books at once · 20 MB each</small><input name="files" type="file" accept=".pdf,application/pdf" multiple></label></div></div><p class="quick-help">This changes only the draft. Use <strong>Save draft</strong>, review it, then <strong>Publish changes</strong> when the batch is ready.</p><div class="management-actions"><button class="primary" type="submit">Add to draft</button><button class="quiet-button" type="button" data-cancel>Cancel</button></div></form>`;
    document.body.appendChild(modal);
    const unitSelect = $('[name="unit"]', modal); const typeSelect = $('[name="type"]', modal);
    const titleField = $(".quick-title", modal); const filesInput = $('[name="files"]', modal);
    const updateFields = () => {
      const definition = QUICK_RESOURCE_TYPES.find((item)=>item.value===typeSelect.value);
      titleField.hidden = !definition?.needsTitle;
      filesInput.disabled = definition?.acceptsFile === false;
      filesInput.closest(".quick-file-drop").classList.toggle("disabled", filesInput.disabled);
    };
    const updateTypes = () => {
      const types = quickTypesFor(subject.units[Number(unitSelect.value)]);
      typeSelect.innerHTML = types.map((item)=>`<option value="${escape(item.value)}">${escape(item.label)}</option>`).join("");
      updateFields();
    };
    unitSelect.addEventListener("change", updateTypes); typeSelect.addEventListener("change", updateFields); updateTypes();
    $$('[data-cancel]',modal).forEach((button)=>button.addEventListener("click",()=>modal.remove()));
    $("form",modal).addEventListener("submit",async(event)=>{
      event.preventDefault();
      const unitIndex=Number(unitSelect.value);const unit=subject.units[unitIndex];
      const definition=QUICK_RESOURCE_TYPES.find((item)=>item.value===typeSelect.value);
      const url=String($('[name="url"]',modal).value||"").trim();const files=Array.from(filesInput.files||[]);
      const title=String($('[name="title"]',modal).value||"").trim();
      if(!definition)return;
      if(!url&&!files.length)return toast("Paste a link or choose a PDF file.");
      if(files.length>1&&!definition.multiple)return toast("Choose only one PDF for this resource type.");
      if(definition.needsTitle&&!title&&files.length<1)return toast("Add a display title.");
      const submit=event.submitter;submit.disabled=true;
      try{
        const additions=[];
        if(url)additions.push({url,title:title||definition.label});
        for(let index=0;index<files.length;index+=1){
          submit.textContent=`Uploading ${index+1}/${files.length}…`;
          const uploaded=await uploadFile(files[index],definition.field?unit[definition.field]||"":"",(percent)=>{submit.textContent=`Uploading ${index+1}/${files.length} · ${percent}%`;});
          additions.push({url:uploaded,title:(files[index].name||definition.label).replace(/\.pdf$/i,"")});
        }
        if(definition.collection){
          unit[definition.collection]=Array.isArray(unit[definition.collection])?unit[definition.collection]:[];
          additions.forEach((item)=>unit[definition.collection].push({title:item.title||definition.label,description:definition.collection==="books"?"Recommended reading":"Video lesson",url:item.url}));
        }else{
          unit[definition.field]=additions.at(-1).url;
        }
        state.selection.openUnitIndex=unitIndex;markDirty();modal.remove();renderResources();
        toast(`${additions.length} resource${additions.length===1?"":"s"} added to the draft.`);
      }catch(error){toast(error.message);submit.disabled=false;submit.textContent="Add to draft";}
    });
  }

  function renderResources() {
    ensureSelection(); const resources = state.data.resources; const branch = selectedBranch(); const semester = selectedSemester(); const subject = selectedSubject();
    const main = state.role === "main";
    const branchAdmin = state.role === "branch";
    const branchOptions = resources.branches.map((item) => `<option value="${escape(item.id)}" ${item.id === state.selection.branchId ? "selected" : ""}>${escape(item.name)}</option>`).join("");
    const semesters = branch ? [...branch.semesters].sort((a,b)=>a.order-b.order) : [];
    const semesterOptions = semesters.map((item) => `<option value="${escape(item.id)}" ${item.id === state.selection.semesterId ? "selected" : ""}>${escape(item.name)}</option>`).join("");
    const subjectOptions = semester ? semester.subjectIds.map((id) => {
      const item = resources.unitCollections.find((entry) => entry.id === id);
      return `<option value="${escape(id)}" ${id === state.selection.subjectId ? "selected" : ""}>${escape(item ? item.name : id)}</option>`;
    }).join("") : "";
    const linkOptions = semester ? resources.unitCollections.filter((entry)=>!semester.subjectIds.includes(entry.id)).map((entry)=>`<option value="${escape(entry.id)}">${escape(entry.name)}</option>`).join("") : "";
    const banner=branchAdmin?`<div class="regular-banner branch-banner"><div><strong>Branch admin access</strong><p>You can publish resource attribute updates directly inside your governed sections. Structural changes still need a main admin.</p></div><span class="role-pill">${state.coins} coins</span></div>`:`<div class="regular-banner"><div><strong>Approval-only access</strong><p>You can draft changes only inside your assigned semesters. Approved contributions earn 1 coin.</p></div><span class="role-pill">${state.permissions.length} assigned</span></div>`;
    const structureTools = branchAdmin ? "" : `<details class="panel structure-tools"><summary><span><strong>Manage library structure</strong><small>Add or rename branches, semesters, subjects and sections.</small></span><span class="structure-chevron">⌄</span></summary><div class="structure-body">${main?`<div class="structure-group"><p>Branch</p><button class="mini-button" id="edit-branch">Rename / edit</button><button class="mini-button" id="add-branch">＋ New branch</button><button class="mini-button danger" id="delete-branch">Delete branch</button></div><div class="structure-group"><p>Semester</p><button class="mini-button" id="rename-semester">Rename</button><button class="mini-button" id="move-semester-up">↑ Move up</button><button class="mini-button" id="move-semester-down">↓ Move down</button><button class="mini-button" id="add-semester">＋ New semester</button><button class="mini-button danger" id="delete-semester">Delete semester</button></div>`:""}<div class="structure-group"><p>Subject</p><span class="structure-link"><select id="link-subject"><option value="">Choose existing subject…</option>${linkOptions}</select><button class="mini-button" id="link-subject-button">Link</button></span><button class="mini-button" id="add-subject">＋ ${main?"New subject":"Request new subject"}</button>${subject?`<button class="mini-button danger" id="unlink-subject">Remove from this semester</button>`:""}</div></div></details>`;
    editor.innerHTML = `${main?"":banner}<div class="section-intro resource-intro"><div><h2>Resource editor</h2><p class="muted">Choose a location, add resources, save the batch, then publish it.</p></div><div class="resource-intro-actions"><button class="primary" id="quick-add-resource" ${subject&&subject.units.length?"":"disabled"}>＋ Quick add resource</button>${main?`<button class="quiet-button" id="fill-selected" ${subject?"":"disabled"}>Copy to selected sections…</button>`:""}</div></div><div class="workflow-strip" aria-label="Resource publishing workflow"><span><b>1</b> Choose location</span><i>›</i><span><b>2</b> Add resources</span><i>›</i><span><b>3</b> Save draft</span><i>›</i><span><b>4</b> Publish when ready</span></div><section class="panel resource-navigator" aria-label="Choose resource location"><label><span>1 · Branch</span><select id="branch-picker">${branchOptions}</select></label><i aria-hidden="true">›</i><label><span>2 · Semester</span><select id="semester-picker" ${semesters.length?"":"disabled"}>${semesterOptions||'<option>No semesters</option>'}</select></label><i aria-hidden="true">›</i><label><span>3 · Subject</span><select id="subject-picker" ${subjectOptions?"":"disabled"}>${subjectOptions||'<option>No subjects</option>'}</select></label></section>${structureTools}<article class="panel document resource-document" id="resource-document">${renderSubjectDocument(subject)}</article>`;
    bindResourceTree(); bind($("#resource-document"), subject || {}); bindUnitActions();
    $("#fill-selected")?.addEventListener("click", openFillSelected);
    $("#quick-add-resource")?.addEventListener("click", openQuickAddResource);
  }

  function renderSubjectDocument(subject) {
    if (!subject) return `<div class="empty-state">Choose or create a subject to start editing.</div>`;
    const branchAdmin=state.role==="branch";const credit=subject.providedBy?`<span class="admin-credit">Provided by ${escape(subject.providedBy)}</span>`:"";
    const subjectBooks=Array.isArray(subject.books)?subject.books:[];
    return `<div class="doc-head"><div><p class="eyebrow">Now editing</p><h2>${escape(subject.name)}</h2><p>${escape(subject.description || "Add subject details and resources.")}</p>${credit}</div>${branchAdmin?"":`<button class="danger-button" id="delete-subject">${state.role==="main"?"Delete subject":"Request removal"}</button>`}</div><details class="subject-settings"><summary><span><strong>Subject settings</strong><small>Name, description, colour and shared links</small></span><span>⌄</span></summary><div class="grid subject-settings-body"><label class="field"><span>Subject ID</span><input data-subject-id type="text" value="${escape(subject.id)}" ${branchAdmin?"disabled":""}><small>${branchAdmin?"Structural IDs are managed by main admins.":"Changing this updates every linked semester."}</small><small class="field-state"></small></label>${input("Subject name","name",subject.name,{required:true})}${input("Accent","accent",subject.accent||"")}${input("Description","description",subject.description||"",{type:"textarea",full:true})}${urlInput("Shared lecture URL","lectureUrl",subject.lectureUrl)}${urlInput("Shared notes URL","notesUrl",subject.notesUrl)}</div></details>${renderBooksEditor(subjectBooks,"books","Subject-wide recommended books",null)}<div class="unit-list"><div class="data-group-head unit-list-head"><div><h3>Units & sections</h3><p class="muted">Open one item to add lectures, notes, PYQs, books or lab files.</p></div><span class="role-pill">${subject.units.length} items</span></div>${subject.units.map((unit,index)=>renderUnit(subject,unit,index)).join("")}${branchAdmin?"":`<button class="add-card" id="add-unit">＋ ${state.role==="main"?"Add":"Request new"} unit or special section</button>`}</div>`;
  }

  function resourceTotal(subject, unit) {
    const urls = [unit.lectureUrl, unit.handwrittenNotesUrl, unit.masterNotesUrl, unit.notesUrl, unit.pyqUrl, unit.practiceKey, unit.bookUrl, unit.workshopFileUrl, unit.classNotesUrl, unit.labManualUrl, unit.vivaQuestionsUrl, unit.endSemesterQuestionsUrl, unit.experimentVideosUrl];
    return urls.filter(Boolean).length + (unit.lectureItems || []).filter((item)=>item.url).length + (unit.books || []).filter((item)=>item.url).length;
  }

  function sectionType(unit) {
    if (unit.kind === "lab" || unit.kind === "shop" || unit.kind === "class-notes") return unit.kind;
    return "unit";
  }

  function sectionTypeSelect(unit, index) {
    const value=sectionType(unit);
    return `<label class="field"><span>Section type</span><select data-unit-kind="${index}" ${state.role==="branch"?"disabled":""}><option value="unit" ${value==="unit"?"selected":""}>Standard unit</option><option value="lab" ${value==="lab"?"selected":""}>Lab section</option><option value="shop" ${value==="shop"?"selected":""}>Workshop shop</option><option value="class-notes" ${value==="class-notes"?"selected":""}>Class notes</option></select><small>${state.role==="branch"?"Section types are managed by main admins.":"Changes which upload fields appear below."}</small><small class="field-state"></small></label>`;
  }

  function renderRepeatingLinks(items, base, type, emptyLabel) {
    return `<div class="repeat-list">${items.length?items.map((item,index)=>`<div class="repeat-row"><div class="repeat-fields">${input("Title",`${base}.${index}.title`,item.title||"")}${input("Description",`${base}.${index}.description`,item.description||"")}${urlInput(`${type} URL`,`${base}.${index}.url`,item.url||"")}</div><button class="mini-button danger repeat-delete" type="button" data-repeat-delete="${escape(base)}:${index}">Remove</button></div>`).join(""):`<p class="resource-empty">${escape(emptyLabel)}</p>`}</div>`;
  }

  function renderBooksEditor(items, base, title, unitIndex) {
    const scope=unitIndex===null?"subject":String(unitIndex);
    return `<section class="editor-resource-block books-block"><div class="resource-block-head"><div><p class="resource-kicker">Books</p><h4>${escape(title)}</h4><span>Add as many books as needed. Each book can have its own title and file.</span></div><div class="resource-block-actions"><button class="mini-button" type="button" data-add-book="${scope}">＋ Add link</button><label class="mini-button multi-upload">Upload PDFs<input type="file" accept=".pdf,application/pdf" multiple data-upload-books="${scope}"></label></div></div>${renderRepeatingLinks(items,base,"Book","No books added yet.")}</section>`;
  }

  function renderLectureEditor(unit, index) {
    const lectureItems=Array.isArray(unit.lectureItems)?unit.lectureItems:[];
    return `<section class="editor-resource-block"><div class="resource-block-head"><div><p class="resource-kicker">Lectures</p><h4>Videos and playlists</h4><span>Use the main link for one playlist, or add named topic links below.</span></div><button class="mini-button" type="button" data-add-lecture="${index}">＋ Add topic</button></div>${urlInput("Main lecture URL",`units.${index}.lectureUrl`,unit.lectureUrl)}${input("Unavailable message",`units.${index}.lectureMessage`,unit.lectureMessage||"",{help:"Example: Study from notes"})}${renderRepeatingLinks(lectureItems,`units.${index}.lectureItems`,"Lecture","No extra lecture topics.")}</section>`;
  }

  function renderUnit(subject, unit, index) {
    const base = `units.${index}`;
    const unitBooks=Array.isArray(unit.books)?unit.books:[];
    const actions=state.role==="branch"?"":`<span class="unit-actions"><button class="mini-button" type="button" data-unit-move="${index}:-1">↑</button><button class="mini-button" type="button" data-unit-move="${index}:1">↓</button><button class="mini-button danger" type="button" data-unit-delete="${index}">×</button></span>`;
    const open=state.selection.openUnitIndex===index||(state.selection.openUnitIndex==null&&index===0);
    const type=sectionType(unit);
    let resourcesHtml="";
    if(type==="lab") resourcesHtml=`<section class="editor-resource-block"><div class="resource-block-head"><div><p class="resource-kicker">Lab resources</p><h4>Practical files</h4><span>Upload the manual, experiment videos, viva questions and end-semester questions.</span></div></div>${urlInput("Lab practical / manual",`${base}.labManualUrl`,unit.labManualUrl)}${urlInput("Experiment videos",`${base}.experimentVideosUrl`,unit.experimentVideosUrl,"video/*")}${urlInput("Viva questions",`${base}.vivaQuestionsUrl`,unit.vivaQuestionsUrl)}${urlInput("End-semester lab questions",`${base}.endSemesterQuestionsUrl`,unit.endSemesterQuestionsUrl)}</section>${renderBooksEditor(unitBooks,`${base}.books`,"Lab reference books",index)}`;
    else if(type==="shop") resourcesHtml=`<section class="editor-resource-block"><div class="resource-block-head"><div><p class="resource-kicker">Workshop</p><h4>Workshop file</h4><span>Add the practical file for this shop.</span></div></div>${urlInput("Workshop file",`${base}.workshopFileUrl`,unit.workshopFileUrl)}</section>`;
    else if(type==="class-notes") resourcesHtml=`<section class="editor-resource-block"><div class="resource-block-head"><div><p class="resource-kicker">Notes</p><h4>Class notes</h4><span>Add the combined class notes PDF.</span></div></div>${urlInput("Class notes PDF",`${base}.classNotesUrl`,unit.classNotesUrl)}</section>`;
    else resourcesHtml=`${renderLectureEditor(unit,index)}<section class="editor-resource-block"><div class="resource-block-head"><div><p class="resource-kicker">Notes</p><h4>Study material</h4><span>Use separate handwritten and master notes when available.</span></div></div>${urlInput("Handwritten notes",`${base}.handwrittenNotesUrl`,unit.handwrittenNotesUrl)}${urlInput("Master notes",`${base}.masterNotesUrl`,unit.masterNotesUrl)}${urlInput("General notes",`${base}.notesUrl`,unit.notesUrl)}</section><section class="editor-resource-block"><div class="resource-block-head"><div><p class="resource-kicker">Questions</p><h4>PYQs and Practice Mode</h4><span>The practice PDF is used by Unlimited Practice; it can be the same as the PYQ file.</span></div></div>${urlInput("PYQ file",`${base}.pyqUrl`,unit.pyqUrl)}${urlInput("Practice source PDF",`${base}.practiceKey`,unit.practiceKey||"")}</section>${renderBooksEditor(unitBooks,`${base}.books`,"Recommended books",index)}`;
    return `<details class="unit-card" data-unit-card="${index}" ${open?"open":""}><summary class="unit-summary"><span class="unit-number">${escape(unit.number)}</span><strong>${escape(unit.title)}${unit.providedBy?` <small class="admin-credit">Provided by ${escape(unit.providedBy)}</small>`:""}</strong><span class="resource-total">${resourceTotal(subject,unit)} ready</span>${actions}</summary><div class="unit-body"><div class="grid section-basics">${input("Number / label",`${base}.number`,unit.number,{required:true,help:"Use 1, 2, 3… or LAB."})}${sectionTypeSelect(unit,index)}${input("Section title",`${base}.title`,unit.title,{required:true,full:true})}</div>${resourcesHtml}</div></details>`;
  }

  function bindResourceTree() {
    $("#branch-picker")?.addEventListener("change", (event) => { state.selection.branchId = event.target.value; state.selection.semesterId = ""; state.selection.subjectId = ""; renderResources(); });
    $("#semester-picker")?.addEventListener("change",(event)=>{state.selection.semesterId=event.target.value;state.selection.subjectId="";renderResources();});
    $("#subject-picker")?.addEventListener("change",(event)=>{state.selection.subjectId=event.target.value;state.selection.openUnitIndex=null;renderResources();});
    $("#rename-semester")?.addEventListener("click",()=>{const item=selectedSemester();if(!item)return;const name=prompt("Semester name",item.name);if(name&&name!==item.name){item.name=name;markDirty();renderResources();}});
    $("#move-semester-up")?.addEventListener("click",()=>moveSelectedSemester(-1));
    $("#move-semester-down")?.addEventListener("click",()=>moveSelectedSemester(1));
    $("#delete-semester")?.addEventListener("click",()=>{const branch=selectedBranch();const item=selectedSemester();if(item&&requireDelete(`${item.name} and ${item.subjectIds.length} subject links`)){branch.semesters=branch.semesters.filter(s=>s.id!==item.id);state.selection.semesterId="";state.selection.subjectId="";markDirty();renderResources();}});
    $("#unlink-subject")?.addEventListener("click",()=>{const sem=selectedSemester();if(!sem)return;sem.subjectIds=sem.subjectIds.filter(id=>id!==state.selection.subjectId);state.selection.subjectId="";markDirty();renderResources();});
    $("#link-subject-button")?.addEventListener("click",()=>{const value=$("#link-subject").value;if(value){selectedSemester().subjectIds.push(value);state.selection.subjectId=value;markDirty();renderResources();}});
    $("#add-semester")?.addEventListener("click",()=>{const branch=selectedBranch();if(!branch)return toast("Create a branch first.");const name=prompt("Semester name",`Semester ${branch.semesters.length+1}`);if(!name)return;const id=uniqueId(name,branch.semesters);branch.semesters.push({id,name,order:branch.semesters.length+1,subjectIds:[]});state.selection.semesterId=id;state.selection.subjectId="";markDirty();renderResources();});
    $("#add-subject")?.addEventListener("click",()=>{const semester=selectedSemester();if(!semester)return toast("Add a semester before creating a subject.");const name=prompt("Subject name");if(!name)return;const list=state.data.resources.unitCollections;const id=uniqueId(name,list);list.push({id,name,description:"",accent:"slate",lectureUrl:null,notesUrl:null,units:[]});semester.subjectIds.push(id);state.selection.subjectId=id;markDirty();renderResources();});
    $("#add-branch")?.addEventListener("click",()=>{const name=prompt("Branch name");if(!name)return;const branches=state.data.resources.branches;const id=uniqueId(name,branches);branches.push({id,code:slug(name).slice(0,5).toUpperCase(),name,group:"engineering",semesters:[]});state.selection.branchId=id;state.selection.semesterId="";state.selection.subjectId="";markDirty();renderResources();});
    $("#edit-branch")?.addEventListener("click",()=>{const branch=selectedBranch();if(!branch)return;const id=prompt("Branch ID",branch.id);if(!id||!/^[-a-z0-9]+$/.test(id)||state.data.resources.branches.some(item=>item!==branch&&item.id===id))return toast("Use a unique lowercase branch ID.");const name=prompt("Branch name",branch.name);if(!name)return;const code=prompt("Branch code",branch.code);const group=prompt("Group: engineering or technology",branch.group);if(!["engineering","technology"].includes(group))return toast("Group must be engineering or technology.");branch.id=id;branch.name=name;branch.code=code||branch.code;branch.group=group;state.selection.branchId=id;markDirty();renderResources();});
    $("#delete-branch")?.addEventListener("click",()=>{const branch=selectedBranch();const links=branch?branch.semesters.reduce((sum,item)=>sum+item.subjectIds.length,0):0;if(branch&&requireDelete(`${branch.name}, ${branch.semesters.length} semesters and ${links} subject links`)){state.data.resources.branches=state.data.resources.branches.filter(i=>i.id!==branch.id);state.selection={};markDirty();renderResources();}});
    $("#delete-subject")?.addEventListener("click",()=>{const subject=selectedSubject();if(subject&&requireDelete(`${subject.name} and ${subject.units.length} units`)){state.data.resources.unitCollections=state.data.resources.unitCollections.filter(i=>i.id!==subject.id);state.data.resources.branches.forEach(b=>b.semesters.forEach(s=>{s.subjectIds=s.subjectIds.filter(id=>id!==subject.id);}));state.selection.subjectId="";markDirty();renderResources();}});
    const idInput = $("[data-subject-id]", $("#resource-document"));
    if (idInput) idInput.addEventListener("change", () => { const subject=selectedSubject();const previous=subject.id;const next=idInput.value.trim();if(!/^[-a-z0-9]+$/.test(next)||state.data.resources.unitCollections.some(item=>item!==subject&&item.id===next)){idInput.value=previous;return toast("Subject ID must be unique and use lowercase letters, numbers or hyphens.");}state.data.resources.branches.forEach(b=>b.semesters.forEach(s=>{s.subjectIds=s.subjectIds.map(id=>id===previous?next:id);}));subject.id=next;state.selection.subjectId=next;markDirty();renderResources();});
  }

  function moveSelectedSemester(direction) {
    const branch=selectedBranch();const semester=selectedSemester();if(!branch||!semester)return;
    const list=branch.semesters.sort((a,b)=>a.order-b.order);const index=list.findIndex((item)=>item.id===semester.id);const targetIndex=index+direction;
    if(targetIndex<0||targetIndex>=list.length)return toast("This semester cannot move further.");
    [list[index],list[targetIndex]]=[list[targetIndex],list[index]];list.forEach((item,cursor)=>{item.order=cursor+1;});markDirty();renderResources();
  }

  function openNewSectionDialog() {
    const subject=selectedSubject();if(!subject)return;
    const modal=document.createElement("div");modal.className="request-modal";
    modal.innerHTML=`<form class="request-modal-card new-section-card"><p class="eyebrow">New item</p><h2>Add a unit or section</h2><p class="muted">Choose the type first. The correct upload fields will appear automatically.</p><label class="field"><span>Section type</span><select name="kind"><option value="unit">Standard unit</option><option value="lab">Lab section</option><option value="shop">Workshop shop</option><option value="class-notes">Class notes</option></select></label><label class="field"><span>Number / label</span><input name="number" value="${subject.units.length+1}" required placeholder="1 or LAB"></label><label class="field"><span>Title</span><input name="title" value="Unit ${subject.units.length+1}" required placeholder="e.g. Optics or Physics practicals"></label><div class="management-actions"><button class="primary" type="submit">Add and open</button><button class="quiet-button" type="button" data-cancel>Cancel</button></div></form>`;
    document.body.appendChild(modal);$("[data-cancel]",modal).addEventListener("click",()=>modal.remove());
    $("select",modal).addEventListener("change",(event)=>{const kind=event.target.value;const label=$("[name=number]",modal);const title=$("[name=title]",modal);if(kind==="lab"){label.value="LAB";title.value=`${subject.name.replace(/^Engineering\s+/i,"")} practicals`;}else if(kind==="class-notes"){label.value="CN";title.value="Class Notes";}else if(kind==="shop"){label.value=String(subject.units.length+1);title.value="New workshop shop";}else{label.value=String(subject.units.length+1);title.value=`Unit ${subject.units.length+1}`;}});
    $("form",modal).addEventListener("submit",(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);const kind=String(form.get("kind"));const unit={number:String(form.get("number")).trim(),title:String(form.get("title")).trim()};if(kind!=="unit")unit.kind=kind;subject.units.push(unit);state.selection.openUnitIndex=subject.units.length-1;modal.remove();markDirty();renderResources();setTimeout(()=>document.querySelector(`[data-unit-card="${state.selection.openUnitIndex}"] input[data-bind$=".title"]`)?.focus(),0);});
  }

  function getBookTarget(subject, scope) {
    if(scope==="subject"){subject.books=Array.isArray(subject.books)?subject.books:[];return subject.books;}
    const unit=subject.units[Number(scope)];unit.books=Array.isArray(unit.books)?unit.books:[];return unit.books;
  }

  function bindUnitActions() {
    const subject=selectedSubject(); if(!subject)return;
    $("#add-unit")?.addEventListener("click",openNewSectionDialog);
    $$('[data-unit-card]').forEach((node)=>node.addEventListener("toggle",()=>{if(node.open)state.selection.openUnitIndex=Number(node.dataset.unitCard);}));
    $$('[data-unit-kind]').forEach((node)=>node.addEventListener("change",()=>{const unit=subject.units[Number(node.dataset.unitKind)];if(node.value==="unit")delete unit.kind;else unit.kind=node.value;if(node.value==="lab"&&String(unit.number).match(/^\d+$/))unit.number="LAB";markDirty();state.selection.openUnitIndex=Number(node.dataset.unitKind);renderResources();}));
    $$('[data-unit-delete]').forEach(node=>node.addEventListener("click",(event)=>{event.preventDefault();const index=Number(node.dataset.unitDelete);if(requireDelete(subject.units[index].title)){subject.units.splice(index,1);markDirty();renderResources();}}));
    $$('[data-unit-move]').forEach(node=>node.addEventListener("click",(event)=>{event.preventDefault();const [i,d]=node.dataset.unitMove.split(":");move(subject.units,Number(i),Number(d));}));
    $$('[data-add-lecture]').forEach((node)=>node.addEventListener("click",()=>{const index=Number(node.dataset.addLecture);const unit=subject.units[index];unit.lectureItems=Array.isArray(unit.lectureItems)?unit.lectureItems:[];unit.lectureItems.push({title:"New lecture",description:"Video lesson",url:""});state.selection.openUnitIndex=index;markDirty();renderResources();}));
    $$('[data-add-book]').forEach((node)=>node.addEventListener("click",()=>{const target=getBookTarget(subject,node.dataset.addBook);target.push({title:"New book",description:"Recommended reading",url:""});if(node.dataset.addBook!=="subject")state.selection.openUnitIndex=Number(node.dataset.addBook);markDirty();renderResources();}));
    $$('[data-repeat-delete]').forEach((node)=>node.addEventListener("click",()=>{const marker=node.dataset.repeatDelete;const separator=marker.lastIndexOf(":");const path=marker.slice(0,separator).split(".");const index=Number(marker.slice(separator+1));let current=subject;path.forEach((key)=>{current=current[key];});current.splice(index,1);const unitMatch=marker.match(/^units\.(\d+)/);if(unitMatch)state.selection.openUnitIndex=Number(unitMatch[1]);markDirty();renderResources();}));
    $$('[data-upload-books]').forEach((node)=>node.addEventListener("change",async()=>{const files=Array.from(node.files||[]);if(!files.length)return;const scope=node.dataset.uploadBooks;const target=getBookTarget(subject,scope);const button=node.parentElement;const original=button.firstChild.textContent;node.disabled=true;try{for(let index=0;index<files.length;index+=1){const file=files[index];button.firstChild.textContent=`Uploading ${index+1}/${files.length}…`;const url=await uploadFile(file,"",null);target.push({title:file.name.replace(/\.pdf$/i,""),description:"Recommended reading",url});}if(scope!=="subject")state.selection.openUnitIndex=Number(scope);markDirty();renderResources();toast(`${files.length} book${files.length===1?"":"s"} uploaded.`);}catch(error){toast(error.message);button.firstChild.textContent=original;node.disabled=false;node.value="";}}));
  }

  function renderMeta() {
    const meta=state.data.resources.meta;
    editor.innerHTML=`<div class="section-intro"><div><h2>Site identity</h2><p class="muted">Edit the public title and introduction.</p></div></div><section class="panel form-section"><div class="grid">${input("Website title","title",meta.title,{required:true})}${input("Institution","institution",meta.institution,{required:true})}${input("Description","description",meta.description,{type:"textarea",full:true,required:true})}${input("Last updated","lastUpdated",meta.lastUpdated||"",{type:"date"})}</div></section>`; bind(editor,meta);
  }

  function renderSyllabus() {
    const resources = state.data.resources;
    const byId = new Map(resources.syllabi.map((item) => [item.id, item]));
    editor.innerHTML = `<div class="section-intro"><div><h2>Syllabus Citadel</h2><p class="muted">Engineering and Technology semester folders and subject files.</p></div><button class="quiet-button" id="add-syllabus">＋ Add file</button></div><div class="collection-stack">${resources.syllabusGroups.map((group,gIndex)=>`<section class="panel data-group"><div class="data-group-head"><h2>${escape(group.title)}</h2><span class="muted">${escape(group.subtitle||"")}</span></div>${group.semesters.map((semester,sIndex)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(semester.title)}</strong><button class="mini-button" data-syl-sem-add="${gIndex}:${sIndex}">Link file</button></div><div class="subject-list">${semester.syllabusIds.map(id=>{const item=byId.get(id);return item?`<div class="subject-row"><button type="button">${escape(item.title)}</button><button class="mini-button danger" data-syl-unlink="${gIndex}:${sIndex}:${escape(id)}">×</button></div>`:"";}).join("")}</div></div>`).join("")}</section>`).join("")}</div><section class="panel data-group" style="margin-top:18px"><div class="data-group-head"><h2>All syllabus files</h2></div>${resources.syllabi.map((item,index)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(item.title)}</strong><button class="mini-button danger" data-syl-delete="${index}">Remove</button></div><div class="entry-fields">${input("Title",`${index}.title`,item.title)}${urlInput("PDF URL",`${index}.url`,item.url||"")}<label class="field"><span>Available</span><select data-syl-available="${index}"><option value="true" ${item.available?"selected":""}>Yes</option><option value="false" ${!item.available?"selected":""}>Coming soon</option></select><small class="field-state"></small></label></div></div>`).join("")}</section>`;
    bind(editor, resources.syllabi);
    $$('[data-syl-available]').forEach((node)=>node.addEventListener("change",()=>{resources.syllabi[Number(node.dataset.sylAvailable)].available=node.value==="true";markDirty();}));
    $$('[data-syl-unlink]').forEach((node)=>node.addEventListener("click",()=>{const [g,s,id]=node.dataset.sylUnlink.split(":");const sem=resources.syllabusGroups[Number(g)].semesters[Number(s)];sem.syllabusIds=sem.syllabusIds.filter(value=>value!==id);markDirty();renderSyllabus();}));
    $$('[data-syl-sem-add]').forEach((node)=>node.addEventListener("click",()=>{const [g,s]=node.dataset.sylSemAdd.split(":");const sem=resources.syllabusGroups[Number(g)].semesters[Number(s)];const id=prompt(`Enter a syllabus ID to link:\n${resources.syllabi.map(item=>item.id).join(", ")}`);if(id&&byId.has(id)&&!sem.syllabusIds.includes(id)){sem.syllabusIds.push(id);markDirty();renderSyllabus();}}));
    $("#add-syllabus").addEventListener("click",()=>{const title=prompt("Syllabus title");if(!title)return;resources.syllabi.push({id:uniqueId(title,resources.syllabi),title,available:false,url:null});markDirty();renderSyllabus();});
    $$('[data-syl-delete]').forEach((node)=>node.addEventListener("click",()=>{const index=Number(node.dataset.sylDelete);const item=resources.syllabi[index];if(requireDelete(item.title)){resources.syllabi.splice(index,1);resources.syllabusGroups.forEach(group=>group.semesters.forEach(semester=>{semester.syllabusIds=semester.syllabusIds.filter(id=>id!==item.id);}));markDirty();renderSyllabus();}}));
  }

  function renderCreators() {
    const creators=state.data.resources.creators;
    editor.innerHTML=`<div class="section-intro"><div><h2>Creator profiles</h2><p class="muted">Names, roles, profile photos and WhatsApp contacts.</p></div><button class="quiet-button" id="add-creator">＋ Add creator</button></div><div class="collection-stack">${creators.map((creator,index)=>`<section class="panel creator-card"><img class="creator-photo" src="${escape(creator.photoUrl)}" alt=""><div class="creator-fields">${input("Name",`${index}.name`,creator.name,{required:true})}${input("Role",`${index}.role`,creator.role,{required:true})}${input("WhatsApp number",`${index}.whatsapp`,creator.whatsapp,{help:"Include country code, digits only."})}${urlInput("Profile photo",`${index}.photoUrl`,creator.photoUrl,"image/png,image/jpeg,image/webp")}</div><button class="danger-button" data-delete-creator="${index}">Remove</button></section>`).join("")}</div>`;
    bind(editor,creators); $("#add-creator").addEventListener("click",()=>{creators.push({id:uniqueId("creator",creators),name:"New creator",role:"Contributor",whatsapp:"910000000000",photoUrl:"/favicon.svg"});markDirty();renderCreators();});
    $$('[data-delete-creator]').forEach(node=>node.addEventListener("click",()=>{const index=Number(node.dataset.deleteCreator);if(requireDelete(creators[index].name)){creators.splice(index,1);markDirty();renderCreators();}}));
  }

  function primitiveFields(entry, base) {
    return Object.entries(entry).map(([key,value])=>{
      if(typeof value==="boolean") return `<label class="field"><span>${escape(key)}</span><select data-bind="${escape(base)}.${escape(key)}"><option value="true" ${value?"selected":""}>Yes</option><option value="false" ${!value?"selected":""}>No</option></select></label>`;
      return input(key.replace(/([A-Z])/g," $1"),`${base}.${key}`,value==null?"":value,{type:typeof value==="number"?"number":"text"});
    }).join("");
  }

  function renderPlacements() {
    const data=state.data.placements;
    editor.innerHTML=`<div class="section-intro"><div><h2>Placement records</h2><p class="muted">Published placement snapshots and report links.</p></div></div><section class="panel form-section"><h3>Official source</h3><div class="grid">${primitiveFields(data.source,"source")}</div></section><div class="collection-stack" style="margin-top:18px">${["latest","history","reports"].map(group=>`<section class="panel data-group"><div class="data-group-head"><h2>${escape(group[0].toUpperCase()+group.slice(1))}</h2><button class="mini-button" data-add-entry="${group}">＋ Add</button></div>${data[group].map((entry,index)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(entry.session||entry.title||`Entry ${index+1}`)}</strong><button class="mini-button danger" data-delete-entry="${group}:${index}">Remove</button></div><div class="entry-fields">${primitiveFields(entry,`${group}.${index}`)}</div></div>`).join("")}</section>`).join("")}</div>`;
    bind(editor,data); $$('[data-add-entry]').forEach(node=>node.addEventListener("click",()=>{const group=node.dataset.addEntry;data[group].push(group==="reports"?{title:"New report",meta:"",url:""}:{session:"New session",highestLpa:null,averageLpa:null,reportUrl:""});markDirty();renderPlacements();}));
    $$('[data-delete-entry]').forEach(node=>node.addEventListener("click",()=>{const [group,index]=node.dataset.deleteEntry.split(":");if(requireDelete(`${group} entry`)){data[group].splice(Number(index),1);markDirty();renderPlacements();}}));
  }

  function renderNotices() {
    const data=state.data.notices;
    editor.innerHTML=`<div class="section-intro"><div><h2>Notice board</h2><p class="muted">Fallback notices displayed when the live HBTU feed is unavailable.</p></div><button class="quiet-button" id="add-notice">＋ Add notice</button></div><section class="panel form-section"><div class="grid">${input("Source","source",data.source||"")}${input("Source URL","sourceUrl",data.sourceUrl||"")}${input("Fetched at","fetchedAt",data.fetchedAt||"",{full:true})}</div></section><section class="panel data-group" style="margin-top:18px">${data.notices.map((notice,index)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(notice.title)}</strong><button class="mini-button danger" data-delete-notice="${index}">Remove</button></div><div class="entry-fields">${input("Title",`${index}.title`,notice.title)}${input("URL",`${index}.url`,notice.url)}${input("Category",`${index}.category`,notice.category)}<label class="field"><span>New notice</span><select data-notice-new="${index}"><option value="true" ${notice.isNew?"selected":""}>Yes</option><option value="false" ${!notice.isNew?"selected":""}>No</option></select></label></div></div>`).join("")}</section>`;
    bind(editor,data.notices); $$('[data-bind^="source"]',editor).forEach(node=>{node.replaceWith(node.cloneNode(true));});
    $$('[data-bind]',editor).forEach(node=>{if(node.dataset.bind.startsWith("source")||node.dataset.bind==="fetchedAt")node.addEventListener("input",()=>{data[node.dataset.bind]=node.value;markDirty();});});
    $$('[data-notice-new]').forEach(node=>node.addEventListener("change",()=>{data.notices[Number(node.dataset.noticeNew)].isNew=node.value==="true";markDirty();}));
    $("#add-notice").addEventListener("click",()=>{data.notices.unshift({id:uniqueId("notice",data.notices),title:"New notice",url:"https://hbtu.ac.in/",category:"General",isNew:true});markDirty();renderNotices();});
    $$('[data-delete-notice]').forEach(node=>node.addEventListener("click",()=>{const index=Number(node.dataset.deleteNotice);if(requireDelete(data.notices[index].title)){data.notices.splice(index,1);markDirty();renderNotices();}}));
  }

  function scholarshipFields(item, base) {
    return `${input("Title",`${base}.title`,item.title,{full:true})}${input("Organization",`${base}.organization`,item.organization)}${input("Category",`${base}.category`,item.category)}${input("Description",`${base}.description`,item.description,{type:"textarea",full:true})}${input("Deadline guidance",`${base}.deadline`,item.deadline,{full:true})}${urlInput("Official URL",`${base}.url`,item.url)}<label class="field"><span>Mark as new</span><select data-scholarship-new="${escape(base)}"><option value="true" ${item.isNew?"selected":""}>Yes</option><option value="false" ${!item.isNew?"selected":""}>No</option></select></label>`;
  }

  function renderScholarships() {
    const data=state.data.scholarships;
    editor.innerHTML=`<div class="section-intro"><div><h2>Scholarship directory</h2><p class="muted">The UP Government Scholarship stays pinned. Scheduled official-source updates are merged with this saved directory every day.</p></div><button class="quiet-button" id="add-scholarship">＋ Add scholarship</button></div><section class="panel form-section"><h3>Pinned scholarship</h3><div class="grid">${scholarshipFields(data.featured,"featured")}</div></section><section class="panel data-group" style="margin-top:18px"><div class="data-group-head"><h2>Saved official scholarships</h2><span class="role-pill">${data.scholarships.length}</span></div>${data.scholarships.map((item,index)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(item.title)}</strong><button class="mini-button danger" data-delete-scholarship="${index}">Remove</button></div><div class="entry-fields">${scholarshipFields(item,`scholarships.${index}`)}</div></div>`).join("")}</section>`;
    bind(editor,data);
    $$('[data-scholarship-new]').forEach(node=>node.addEventListener("change",()=>{const path=node.dataset.scholarshipNew;if(path==="featured")data.featured.isNew=node.value==="true";else data.scholarships[Number(path.split(".")[1])].isNew=node.value==="true";markDirty();}));
    $("#add-scholarship").addEventListener("click",()=>{data.scholarships.unshift({id:uniqueId("new-scholarship",data.scholarships),title:"New scholarship",organization:"Official organization",category:"General",description:"Add eligibility and application details from the official source.",deadline:"Check the official announcement for dates",url:"https://scholarships.gov.in/",isNew:true});markDirty();renderScholarships();});
    $$('[data-delete-scholarship]').forEach(node=>node.addEventListener("click",()=>{const index=Number(node.dataset.deleteScholarship);if(requireDelete(data.scholarships[index].title)){data.scholarships.splice(index,1);markDirty();renderScholarships();}}));
  }

  function governedSections(entry) {
    return (entry.permissions||[]).map(permission=>`${permission.branchName} · ${permission.semesterName}`).join(" · ") || "No section assigned";
  }

  function renderCommunity() {
    const entries=state.community||[];
    editor.innerHTML=`<div class="section-intro"><div><h2>Contributor leaderboard</h2><p class="muted">Approved updates earn one coin. The top contributors can be promoted to govern their assigned sections.</p></div><span class="coin-balance">◉ ${state.coins||0} coins</span></div>${entries.length?`<div class="leaderboard panel">${entries.map(entry=>`<article class="leaderboard-row ${entry.topContributor?"leader":""}"><span class="leaderboard-rank">${entry.rank===1?"♛":String(entry.rank).padStart(2,"0")}</span><img class="leaderboard-avatar" src="${escape(entry.photoUrl||"/favicon.svg")}" alt="" width="54" height="54"><div class="leaderboard-person"><strong>${escape(entry.name)}</strong><small>${escape(entry.branch||"Branch not listed")} · @${escape(entry.username)}</small><span>${escape(governedSections(entry))}</span></div><span class="role-pill ${entry.role}">${entry.role==="branch"?"Branch admin":"Regular admin"}</span><div class="leaderboard-score"><strong>${entry.coins}</strong><small>coins</small><span>${entry.contributions} approved</span></div></article>`).join("")}</div>`:`<div class="panel empty-state"><h3>The leaderboard is ready</h3><p>Approved regular admins will appear here.</p></div>`}`;
  }

  function renderProfile() {
    const photo=(state.profile&&state.profile.photoUrl)||"/favicon.svg";
    editor.innerHTML=`<div class="section-intro"><div><h2>Your admin profile</h2><p class="muted">Manage your photo${state.role==="main"?" and secure your main-admin account":""}.</p></div><span class="role-pill">${escape(roleLabel(state.role))}</span></div><div class="account-stack"><section class="panel profile-editor"><img id="profile-preview" src="${escape(photo)}" alt="Profile preview" width="150" height="150"><div class="profile-editor-fields"><label class="field"><span>Profile picture URL</span><input id="profile-photo-url" type="url" value="${escape(photo==="/favicon.svg"?"":photo)}" placeholder="Upload a picture or paste an HTTPS URL"><small>Square photos work best.</small></label><div class="management-actions"><label class="quiet-button profile-upload">Upload picture<input id="profile-photo-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="primary" id="save-profile-picture">Save profile picture</button></div><p class="muted">Maximum upload size: 5 MB.</p></div></section>${state.role==="main"?`<section class="panel password-editor"><div><p class="eyebrow">Security</p><h2>Change password</h2><p class="muted">Confirm your current password, then choose a new password with at least 10 characters. You will be signed out when it changes.</p></div><form id="password-form" class="password-form"><label class="field"><span>Current password</span><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required maxlength="200"></label><label class="field"><span>New password</span><input id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="200"><small>Use at least 10 characters and do not reuse your current password.</small></label><label class="field"><span>Confirm new password</span><input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label><div><button class="primary" type="submit">Change password</button></div></form></section>`:""}</div>`;
    const inputNode=$("#profile-photo-url");const preview=$("#profile-preview");
    inputNode.addEventListener("input",()=>{preview.src=inputNode.value.trim()||"/favicon.svg";});
    $("#profile-photo-file").addEventListener("change",async(event)=>{const file=event.target.files&&event.target.files[0];if(!file)return;const label=event.target.closest("label");const original=label.firstChild.textContent;label.firstChild.textContent="Uploading…";try{const url=await uploadFile(file,inputNode.value,(percent)=>{label.firstChild.textContent=`Uploading ${percent}%`;});inputNode.value=url;preview.src=url;toast("Picture uploaded. Save it to your profile.");}catch(error){toast(error.message);}finally{label.firstChild.textContent=original;event.target.value="";}});
    $("#save-profile-picture").addEventListener("click",async(event)=>{const button=event.currentTarget;const photoUrl=inputNode.value.trim();if(!photoUrl)return toast("Upload a picture or enter an HTTPS image URL.");button.disabled=true;button.textContent="Saving…";try{const result=await request("/api/admin/profile",{method:"POST",body:JSON.stringify({photoUrl})});state.profile=result.profile;state.community=result.community||state.community;$("#admin-avatar").src=result.profile.photoUrl;toast("Profile picture updated.");renderProfile();}catch(error){toast(error.message);button.disabled=false;button.textContent="Save profile picture";}});
    const passwordForm=$("#password-form");
    if(passwordForm)passwordForm.addEventListener("submit",async(event)=>{
      event.preventDefault();
      const button=event.submitter;const currentPassword=$("#current-password").value;const newPassword=$("#new-password").value;const confirmPassword=$("#confirm-password").value;
      if(newPassword!==confirmPassword)return toast("New password and confirmation do not match.");
      button.disabled=true;button.textContent="Changing…";
      try{
        await request("/api/admin/password",{method:"POST",body:JSON.stringify({currentPassword,newPassword,confirmPassword})});
        const username=state.user&&state.user.username||"";
        state.csrf="";state.data=null;state.role=null;state.profile=null;state.community=[];state.user=null;selectLoginTab("signin");
        $("#login-username").value=username;$("#login-password").value="";
        showLogin("Password changed successfully. Sign in with your new password.",true);
      }catch(error){toast(error.message);button.disabled=false;button.textContent="Change password";}
    });
  }

  function permissionChoices(selected, owner) {
    const active=new Set((selected||[]).map(item=>`${item.branchId}:${item.semesterId}`));
    return (state.management.permissionOptions||[]).map(branch=>`<div><strong>${escape(branch.name)}</strong><div class="permission-grid">${branch.semesters.map(semester=>{const key=`${branch.id}:${semester.id}`;return `<label class="permission-option"><input type="checkbox" data-permission-owner="${escape(owner)}" value="${escape(key)}" ${active.has(key)?"checked":""}><span>${escape(semester.name)}</span></label>`;}).join("")}</div></div>`).join("");
  }

  function selectedPermissions(owner) {
    return $$(`[data-permission-owner="${CSS.escape(owner)}"]:checked`).map(node=>{const [branchId,semesterId]=node.value.split(":");return {branchId,semesterId};});
  }

  async function loadManagement() {
    editor.innerHTML='<div class="empty-state">Loading access and approvals…</div>';
    try{state.management=await request("/api/admin/management",{method:"GET"});renderManagement();}
    catch(error){editor.innerHTML=`<div class="empty-state"><strong>Could not load access controls</strong><p>${escape(error.message)}</p></div>`;}
  }

  async function runManagementAction(body, button) {
    const old=button&&button.textContent;if(button){button.disabled=true;button.textContent="Working…";}
    try{const result=await request("/api/admin/management",{method:"POST",body:JSON.stringify(body)});if(result.draft&&result.target)state.drafts[result.target]={draftId:result.draftId||null,updatedAt:result.updatedAt,updatedBy:result.updatedBy};toast(result.draft?"Approved and saved as a private draft. Nothing was deployed.":(result.promoted?"Promoted to main admin. They must sign out and sign in again.":"Access settings updated."));state.management=await request("/api/admin/management",{method:"GET"});state.community=state.management.leaderboard||state.community;renderManagement();return result;}
    catch(error){toast(error.message);if(button){button.disabled=false;button.textContent=old;}return null;}
  }

  function renderManagement() {
    if(state.role!=="main")return; if(!state.management)return loadManagement();
    const data=state.management;
    const pendingRegistrations=data.registrations.filter(item=>item.status==="pending");
    const pendingChanges=data.changeRequests.filter(item=>item.status==="pending"||item.status==="processing");
    const branchNames=new Map(data.permissionOptions.map(branch=>[branch.id,branch]));
    const scopeName=(scope)=>{const branch=branchNames.get(scope.branchId);const semester=branch&&branch.semesters.find(item=>item.id===scope.semesterId);return `${branch?branch.name:scope.branchId} · ${semester?semester.name:scope.semesterId}`;};
    editor.innerHTML=`<div class="section-intro"><div><h2>Access & approvals</h2><p class="muted">Approve changes into a private draft, then publish them through Blobs without a production deployment.</p></div><span class="role-pill">Main admins only</span></div><div class="access-grid">
      ${state.drafts.resources?`<section class="panel data-group wide-panel"><div class="entry-head"><div><h2>Resource draft ready</h2><p class="muted">Saved privately. Publishing updates the live database without a GitHub commit or Netlify deployment.</p></div><button class="primary" data-publish-resource-draft>Publish resource draft</button></div></section>`:""}
      <section class="panel data-group"><div class="data-group-head"><h2>Main admins</h2><span class="status-pill active">Full access</span></div>${data.mainAdmins.map(admin=>`<div class="entry-card admin-person-row"><img src="${escape(admin.photoUrl||"/favicon.svg")}" alt="" width="44" height="44"><div><strong>${escape(admin.name)}</strong><div class="person-meta"><span>@${escape(admin.username)}</span><span>Everything</span>${admin.promoted?`<span>Promoted by ${escape(admin.promotedBy||"main admin")}</span>`:""}</div></div></div>`).join("")}</section>
      <section class="panel data-group"><div class="data-group-head"><h2>Pending registrations</h2><span class="status-pill ${pendingRegistrations.length?"pending":"active"}">${pendingRegistrations.length}</span></div>${pendingRegistrations.length?pendingRegistrations.map(item=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(item.name)}</strong><div class="person-meta"><span>${escape(item.branch)}</span><span>${escape(item.rollNumber)}</span><span>${escape(item.email)}</span></div></div><span class="status-pill pending">Pending</span></div><details><summary class="mini-button">Choose permissions</summary>${permissionChoices([],`registration:${item.id}`)}</details><div class="management-actions"><button class="primary" data-approve-registration="${escape(item.id)}">Approve account</button><button class="danger-button" data-reject-registration="${escape(item.id)}">Reject</button></div></div>`).join(""):'<p class="muted">No registration requests waiting.</p>'}</section>
      <section class="panel data-group wide-panel"><div class="data-group-head"><h2>Contributor admins</h2><span class="role-pill">${data.regularAdmins.length} accounts</span></div>${data.regularAdmins.length?data.regularAdmins.map(admin=>`<div class="entry-card"><div class="entry-head"><div class="admin-person-row"><img src="${escape(admin.photoUrl||"/favicon.svg")}" alt="" width="52" height="52"><div><strong>${escape(admin.name)}</strong><div class="person-meta"><span>@${escape(admin.username)}</span><span>${escape(admin.branch)}</span><span>${escape(admin.rollNumber)}</span><span>${escape(admin.email)}</span><span>◉ ${admin.coins||0} coins</span></div></div></div><span class="status-pill ${admin.active!==false?"active":"disabled"}">${admin.active===false?"Disabled":(admin.role==="branch"?"Branch admin":"Regular admin")}</span></div><details><summary class="mini-button">Manage governed sections (${(admin.permissions||[]).length})</summary>${permissionChoices(admin.permissions,`regular:${admin.id}`)}<button class="primary" data-save-permissions="${escape(admin.id)}">Save permissions</button></details><div class="management-actions"><button class="quiet-button" data-reset-password="${escape(admin.id)}">Reset password</button><button class="quiet-button" data-contributor-role="${escape(admin.id)}" data-role="${admin.role==="branch"?"regular":"branch"}">${admin.role==="branch"?"Return to regular admin":"Promote to branch admin"}</button><button class="quiet-button" data-promote-main="${escape(admin.id)}" ${admin.active===false?"disabled":""}>Make main admin</button><button class="${admin.active!==false?"danger-button":"quiet-button"}" data-toggle-admin="${escape(admin.id)}" data-active="${admin.active===false}">${admin.active!==false?"Disable account":"Enable account"}</button></div></div>`).join(""):'<p class="muted">Approved contributor admins will appear here.</p>'}</section>
      <section class="panel data-group wide-panel"><div class="data-group-head"><h2>Change requests</h2><span class="status-pill ${pendingChanges.length?"pending":"active"}">${pendingChanges.length} pending</span></div>${pendingChanges.length?pendingChanges.map(item=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(item.summary)}</strong><div class="person-meta"><span>${escape(item.requestedBy)}</span><span>${escape(scopeName(item.scope))}</span><span>${escape(new Date(item.createdAt).toLocaleString())}</span></div></div><span class="status-pill ${escape(item.status)}">${escape(item.status)}</span></div><div class="proposal-preview">Subjects affected: ${escape((item.proposal.unitCollections||[]).map(subject=>`${subject.name} (${(subject.units||[]).length} items)`).join(", ")||"None")}</div>${item.status==="pending"?`<div class="management-actions"><button class="primary" data-approve-change="${escape(item.id)}">Approve to draft</button><button class="danger-button" data-reject-change="${escape(item.id)}">Reject</button></div>`:""}</div>`).join(""):'<p class="muted">No resource changes are waiting for approval.</p>'}</section>
      <section class="panel data-group wide-panel"><div class="data-group-head"><h2>Recent contributions</h2></div>${data.changeRequests.filter(item=>["approved","approved-draft","drafted","rejected","published"].includes(item.status)).slice(0,10).map(item=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(item.summary)}</strong><div class="person-meta"><span>${escape(item.requestedBy)}</span><span>${escape(scopeName(item.scope))}</span><span>${item.status==="published"?"Published by main admin":(item.status==="approved-draft"||item.status==="drafted"?"Saved privately · awaiting publish":`Reviewed by ${escape(item.reviewedBy||"main admin")}`)}</span></div></div><span class="status-pill ${escape(item.status)}">${escape(item.status)}</span></div></div>`).join("")||'<p class="muted">No completed contributions yet.</p>'}</section>
    </div>`;
    $$('[data-approve-registration]').forEach(button=>button.addEventListener("click",async()=>{const item=data.registrations.find(entry=>entry.id===button.dataset.approveRegistration);const username=prompt("Choose a username for this regular admin",slug(`${item.name}-${item.rollNumber}`));if(!username)return;const password=prompt("Set a temporary password (minimum 8 characters). Share it with the applicant privately.");if(!password)return;const result=await runManagementAction({action:"approve-registration",registrationId:item.id,username,password,permissions:selectedPermissions(`registration:${item.id}`)},button);if(result&&result.approved)alert(`Account approved for ${item.name}.\n\nUsername: ${username}\nTemporary password: ${password}\n\nCopy these now and share them privately. The password is not shown again.`);}));
    $$('[data-reject-registration]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Reject this registration request?"))runManagementAction({action:"reject-registration",registrationId:button.dataset.rejectRegistration},button);}));
    $$('[data-save-permissions]').forEach(button=>button.addEventListener("click",()=>runManagementAction({action:"update-permissions",adminId:button.dataset.savePermissions,permissions:selectedPermissions(`regular:${button.dataset.savePermissions}`)},button)));
    $$('[data-toggle-admin]').forEach(button=>button.addEventListener("click",()=>runManagementAction({action:"set-regular-status",adminId:button.dataset.toggleAdmin,active:button.dataset.active==="true"},button)));
    $$('[data-reset-password]').forEach(button=>button.addEventListener("click",()=>{const password=prompt("Enter a new temporary password (minimum 8 characters)");if(password)runManagementAction({action:"reset-password",adminId:button.dataset.resetPassword,password},button);}));
    $$('[data-contributor-role]').forEach(button=>button.addEventListener("click",()=>{const role=button.dataset.role;const verb=role==="branch"?"promote this contributor to Branch Admin":"return this contributor to Regular Admin";if(confirm(`Are you sure you want to ${verb}?`))runManagementAction({action:"set-contributor-role",adminId:button.dataset.contributorRole,role},button);}));
    $$('[data-promote-main]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Make this person a main admin? They will receive full access to all content, users, approvals and deployments."))runManagementAction({action:"promote-main-admin",adminId:button.dataset.promoteMain},button);}));
    $$('[data-publish-resource-draft]').forEach(button=>button.addEventListener("click",async()=>{const published=await publishSavedDraft("resources","Resources");if(published){state.management=null;await loadDashboard();}}));
    $$('[data-approve-change]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Approve this request into the private resource draft? Nothing becomes live until a main admin clicks Publish changes."))runManagementAction({action:"approve-change",requestId:button.dataset.approveChange},button);}));
    $$('[data-reject-change]').forEach(button=>button.addEventListener("click",()=>{const note=prompt("Optional reason for rejection","");if(note!==null)runManagementAction({action:"reject-change",requestId:button.dataset.rejectChange,note},button);}));
  }

  window.addEventListener("beforeunload",(event)=>{if(state.dirty){event.preventDefault();event.returnValue="";}});
  boot();
})();
