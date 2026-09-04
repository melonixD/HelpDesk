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
  const status = $("#save-status");
  const historyLink = $("#history-link");
  const state = { csrf: "", data: null, history: {}, section: "resources", dirty: false, saving: false, selection: {}, role: null, user: null, permissions: [], management: null };
  const titles = {
    resources: ["Content", "Resources"], syllabus: ["Academics", "Syllabus"], meta: ["Website", "Site details"], creators: ["People", "Creators"],
    placements: ["Outcomes", "Placements"], notices: ["Updates", "Notices"], management: ["Security", "Access & approvals"],
  };

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

  function showLogin(message) {
    adminView.hidden = true; loginView.hidden = false;
    if (message) { $("#login-error").textContent = message; $("#login-error").hidden = false; }
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
    state.data = { resources: payload.resources, placements: payload.placements, notices: payload.notices };
    state.role = payload.role; state.user = payload.user; state.permissions = payload.permissions || [];
    state.history = payload.history || {}; state.csrf = payload.csrfToken || state.csrf;
    $$('[data-section]').forEach((button) => { button.hidden = state.role !== "main" && button.dataset.section !== "resources"; });
    $("#management-nav").hidden = state.role !== "main";
    $("#admin-identity").textContent = `${state.user.name || state.user.username} · ${state.role === "main" ? "Main admin" : "Regular admin"}`;
    saveButton.textContent = state.role === "main" ? "Save changes" : "Submit request";
    loginView.hidden = true; adminView.hidden = false;
    ensureSelection(); render();
  }

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const error = $("#login-error"); error.hidden = true;
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
    state.csrf = ""; state.data = null; state.role=null; selectLoginTab("signin"); showLogin();
  });

  $$("#admin-nav button").forEach((button) => button.addEventListener("click", async () => {
    if (state.dirty) await saveChanges();
    if (state.dirty) return toast("Save the current section before leaving it.");
    state.section = button.dataset.section; render(); closeSidebar();
  }));

  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebar-scrim").hidden = true; }
  $("#open-sidebar").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#sidebar-scrim").hidden = false; });
  $("#close-sidebar").addEventListener("click", closeSidebar); $("#sidebar-scrim").addEventListener("click", closeSidebar);

  function markDirty() {
    state.dirty = true; state.revision = (state.revision || 0) + 1;
    saveButton.disabled = false; status.textContent = state.role === "regular" ? "Draft only" : "Unsaved";
    clearTimeout(state.autoSaveTimer);
    if (state.role === "main") state.autoSaveTimer = setTimeout(saveChanges, 1200);
  }
  function target() { return ["meta", "creators", "syllabus"].includes(state.section) ? "resources" : state.section; }

  async function saveChanges() {
    clearTimeout(state.autoSaveTimer);
    if (!state.dirty) return;
    if (state.role === "regular") return submitRegularChange();
    if (state.saving) { state.saveQueued = true; return; }
    state.saving = true; saveButton.disabled = true; saveButton.textContent = "Saving…"; status.textContent = "Validating";
    const key = target(); const revision = state.revision;
    if (key === "resources") state.data.resources.meta.creators = state.data.resources.creators.map((creator) => creator.name);
    try {
      const result = await request("/api/admin/save", { method: "POST", body: JSON.stringify({ target: key, data: state.data[key], message: `Update ${titles[state.section][1]} from HelpDesk admin` }) });
      state.dirty = state.revision !== revision;
      status.textContent = state.dirty ? "Unsaved" : "Deploying…"; state.history[key] = result.historyUrl || state.history[key]; renderHistory();
      $$('.field[data-dirty="true"]').forEach((field) => {
        field.dataset.dirty = "false"; field.dataset.saved = "true";
        const note = $(".field-state", field); if (note) note.textContent = "Saved ✓";
        setTimeout(() => { field.dataset.saved = "false"; }, 2200);
      });
      toast("Saved. Netlify is deploying your update now.");
    } catch (error) {
      status.textContent = "Save failed"; saveButton.disabled = false;
      $$('.field[data-dirty="true"]').forEach((field) => { field.dataset.error = "true"; const note = $(".field-state", field); if (note) note.textContent = "Save failed"; });
      toast(error.message);
    } finally {
      state.saving = false; saveButton.textContent = state.role === "main" ? "Save changes" : "Submit request"; saveButton.disabled = !state.dirty;
      if (state.saveQueued || state.dirty) { state.saveQueued = false; clearTimeout(state.autoSaveTimer); state.autoSaveTimer = setTimeout(saveChanges, 500); }
    }
  }
  saveButton.addEventListener("click", saveChanges);

  function askChangeSummary() {
    return new Promise((resolve) => {
      const modal=document.createElement("div");modal.className="request-modal";
      modal.innerHTML=`<form class="request-modal-card"><p class="eyebrow">Approval required</p><h2>Describe your requested change</h2><p class="muted">A main admin will review this draft before anything reaches the website.</p><textarea required maxlength="500" placeholder="Example: Replace Unit 2 master notes and add a lecture link."></textarea><div class="management-actions"><button class="primary" type="submit">Send for approval</button><button class="quiet-button" type="button" data-cancel>Keep editing</button></div></form>`;
      document.body.appendChild(modal);const finish=(value)=>{modal.remove();resolve(value);};
      $("[data-cancel]",modal).addEventListener("click",()=>finish(null));
      $("form",modal).addEventListener("submit",(event)=>{event.preventDefault();finish($("textarea",modal).value.trim());});
    });
  }

  async function submitRegularChange() {
    if (state.saving) return; const branch=selectedBranch();const semester=selectedSemester();
    if(!branch||!semester)return toast("Choose an assigned branch and semester first.");
    const summary=await askChangeSummary();if(!summary)return;
    state.saving=true;saveButton.disabled=true;saveButton.textContent="Submitting…";status.textContent="Sending for approval";
    const subjectIds=new Set(semester.subjectIds);
    const proposal={semester:{id:semester.id,name:semester.name,order:semester.order,subjectIds:[...semester.subjectIds]},unitCollections:state.data.resources.unitCollections.filter(item=>subjectIds.has(item.id))};
    try{
      await request("/api/admin/change-request",{method:"POST",body:JSON.stringify({scope:{branchId:branch.id,semesterId:semester.id},summary,proposal})});
      state.dirty=false;status.textContent="Pending approval";toast("Change request sent to the main admins.");await loadDashboard();
    }catch(error){status.textContent="Request failed";toast(error.message);}
    finally{state.saving=false;saveButton.textContent="Submit request";saveButton.disabled=!state.dirty;}
  }

  function renderHistory() {
    const url = state.history[target()]; historyLink.hidden = state.role !== "main" || !url;
    if (url) historyLink.href = url;
  }

  function render() {
    $$("#admin-nav button").forEach((button) => button.classList.toggle("active", button.dataset.section === state.section));
    $("#section-eyebrow").textContent = titles[state.section][0]; $("#section-title").textContent = titles[state.section][1];
    saveButton.disabled = !state.dirty; status.textContent = state.dirty ? (state.role === "regular" ? "Draft only" : "Unsaved") : (state.role === "regular" ? "No pending draft" : "Saved"); renderHistory();
    if (state.section === "resources") renderResources();
    else if (state.section === "syllabus") renderSyllabus();
    else if (state.section === "meta") renderMeta();
    else if (state.section === "creators") renderCreators();
    else if (state.section === "placements") renderPlacements();
    else if (state.section === "management") renderManagement();
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
      if (field) { field.dataset.dirty = "true"; field.dataset.error = "false"; const note = $(".field-state", field); if (note) note.textContent = "Saving…"; }
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

  function renderResources() {
    ensureSelection(); const resources = state.data.resources; const branch = selectedBranch(); const semester = selectedSemester(); const subject = selectedSubject();
    const main = state.role === "main";
    const branchOptions = resources.branches.map((item) => `<option value="${escape(item.id)}" ${item.id === state.selection.branchId ? "selected" : ""}>${escape(item.name)}</option>`).join("");
    const semesterHtml = branch ? [...branch.semesters].sort((a,b)=>a.order-b.order).map((item, index, list) => {
      const active = item.id === state.selection.semesterId; const names = new Map(resources.unitCollections.map((entry) => [entry.id, entry.name]));
      return `<div class="semester-block"><div class="semester-row"><button class="semester-name ${active ? "active" : ""}" data-semester="${escape(item.id)}">${escape(item.name)}</button>${main?`<span class="tree-actions"><button class="mini-button" data-sem-rename="${escape(item.id)}" title="Rename">✎</button><button class="mini-button" data-sem-move="${item.id}:-1" ${index===0?"disabled":""}>↑</button><button class="mini-button" data-sem-move="${item.id}:1" ${index===list.length-1?"disabled":""}>↓</button><button class="mini-button danger" data-sem-delete="${escape(item.id)}">×</button></span>`:""}</div>${active ? `<div class="subject-list">${item.subjectIds.map((id) => `<div class="subject-row"><button data-subject="${escape(id)}" class="${id===state.selection.subjectId?"active":""}">${escape(names.get(id) || id)}</button><button class="mini-button danger" data-unlink="${escape(id)}" title="${main?"Remove":"Request removal"}">×</button></div>`).join("")}<div class="tree-add"><select id="link-subject"><option value="">Link existing subject…</option>${resources.unitCollections.filter((entry)=>!item.subjectIds.includes(entry.id)).map((entry)=>`<option value="${escape(entry.id)}">${escape(entry.name)}</option>`).join("")}</select><button class="mini-button" id="link-subject-button">+</button></div></div>` : ""}</div>`;
    }).join("") : "";
    editor.innerHTML = `${main?"":`<div class="regular-banner"><div><strong>Approval-only access</strong><p>You can draft changes only inside your assigned semesters. Nothing goes live until a main admin approves it.</p></div><span class="role-pill">${state.permissions.length} assigned</span></div>`}<div class="section-intro"><div><h2>Library structure</h2><p class="muted">${main?"Branches, semesters, subjects and unit resources.":"Your assigned resource sections."}</p></div></div><div class="resource-layout"><aside class="panel tree"><div class="tree-head"><select id="branch-picker">${branchOptions}</select>${main?`<span class="tree-actions"><button class="mini-button" id="edit-branch" title="Edit branch">Edit</button><button class="mini-button danger" id="delete-branch" title="Delete branch">×</button></span>`:""}</div>${semesterHtml}<div class="tree-footer">${main?`<button class="mini-button" id="add-semester">＋ Add section</button><button class="mini-button" id="add-branch">＋ New branch</button>`:""}<button class="mini-button" id="add-subject">＋ ${main?"New subject":"Request new subject"}</button></div></aside><article class="panel document" id="resource-document">${renderSubjectDocument(subject)}</article></div>`;
    bindResourceTree(); bind($("#resource-document"), subject || {}); bindUnitActions();
  }

  function renderSubjectDocument(subject) {
    if (!subject) return `<div class="empty-state">Choose or create a subject to start editing.</div>`;
    return `<div class="doc-head"><div><p class="eyebrow">Subject</p><h2>${escape(subject.name)}</h2><p>${escape(subject.description || "Add subject details and resources.")}</p></div><button class="danger-button" id="delete-subject">${state.role==="main"?"Delete subject":"Request removal"}</button></div><div class="grid"><label class="field"><span>Subject ID</span><input data-subject-id type="text" value="${escape(subject.id)}"><small>Changing this updates every linked semester.</small><small class="field-state"></small></label>${input("Subject name","name",subject.name,{required:true})}${input("Accent","accent",subject.accent||"")}${input("Description","description",subject.description||"",{type:"textarea",full:true})}${urlInput("Subject lecture URL","lectureUrl",subject.lectureUrl)}${urlInput("Subject notes URL","notesUrl",subject.notesUrl)}</div><div class="unit-list"><div class="data-group-head"><h3>Units & sections</h3><span class="muted">${subject.units.length} items</span></div>${subject.units.map((unit,index)=>renderUnit(unit,index)).join("")}<button class="add-card" id="add-unit">＋ ${state.role==="main"?"Add":"Request new"} unit or section</button></div>`;
  }

  function renderUnit(unit, index) {
    const base = `units.${index}`;
    return `<details class="unit-card" ${index===0?"open":""}><summary class="unit-summary"><span class="unit-number">${escape(unit.number)}</span><strong>${escape(unit.title)}</strong><span class="unit-actions"><button class="mini-button" type="button" data-unit-move="${index}:-1">↑</button><button class="mini-button" type="button" data-unit-move="${index}:1">↓</button><button class="mini-button danger" type="button" data-unit-delete="${index}">×</button></span></summary><div class="unit-body grid">${input("Number / label",`${base}.number`,unit.number,{required:true})}${input("Title",`${base}.title`,unit.title,{required:true})}${urlInput("Lecture URL",`${base}.lectureUrl`,unit.lectureUrl)}${urlInput("Handwritten notes",`${base}.handwrittenNotesUrl`,unit.handwrittenNotesUrl)}${urlInput("Master notes",`${base}.masterNotesUrl`,unit.masterNotesUrl)}${urlInput("PYQ file",`${base}.pyqUrl`,unit.pyqUrl)}${urlInput("Practice source PDF",`${base}.practiceKey`,unit.practiceKey||"")}${urlInput("Recommended book",`${base}.bookUrl`,unit.bookUrl)}${urlInput("Workshop / lab file",`${base}.workshopFileUrl`,unit.workshopFileUrl)}${urlInput("Class notes",`${base}.classNotesUrl`,unit.classNotesUrl)}${urlInput("Lab manual",`${base}.labManualUrl`,unit.labManualUrl)}${urlInput("Viva questions",`${base}.vivaQuestionsUrl`,unit.vivaQuestionsUrl)}${urlInput("End-semester questions",`${base}.endSemesterQuestionsUrl`,unit.endSemesterQuestionsUrl)}</div></details>`;
  }

  function bindResourceTree() {
    $("#branch-picker")?.addEventListener("change", (event) => { state.selection.branchId = event.target.value; state.selection.semesterId = ""; state.selection.subjectId = ""; renderResources(); });
    $$('[data-semester]').forEach((node)=>node.addEventListener("click",()=>{state.selection.semesterId=node.dataset.semester;state.selection.subjectId="";renderResources();}));
    $$('[data-subject]').forEach((node)=>node.addEventListener("click",()=>{state.selection.subjectId=node.dataset.subject;renderResources();}));
    $$('[data-sem-move]').forEach((node)=>node.addEventListener("click",()=>{const [id,d]=node.dataset.semMove.split(":");const list=selectedBranch().semesters.sort((a,b)=>a.order-b.order);move(list,list.findIndex(i=>i.id===id),Number(d));list.forEach((s,i)=>s.order=i+1);}));
    $$('[data-sem-rename]').forEach((node)=>node.addEventListener("click",()=>{const item=selectedBranch().semesters.find(semester=>semester.id===node.dataset.semRename);const name=prompt("Semester name",item.name);if(name&&name!==item.name){item.name=name;markDirty();renderResources();}}));
    $$('[data-sem-delete]').forEach((node)=>node.addEventListener("click",()=>{const branch=selectedBranch();const item=branch.semesters.find(s=>s.id===node.dataset.semDelete);if(item&&requireDelete(`${item.name} and ${item.subjectIds.length} subject links`)){branch.semesters=branch.semesters.filter(s=>s.id!==item.id);state.selection.semesterId="";markDirty();renderResources();}}));
    $$('[data-unlink]').forEach((node)=>node.addEventListener("click",()=>{const sem=selectedSemester();sem.subjectIds=sem.subjectIds.filter(id=>id!==node.dataset.unlink);state.selection.subjectId="";markDirty();renderResources();}));
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

  function bindUnitActions() {
    const subject=selectedSubject(); if(!subject)return;
    $("#add-unit")?.addEventListener("click",()=>{subject.units.push({number:subject.units.length+1,title:"New unit",lectureUrl:null,handwrittenNotesUrl:null,masterNotesUrl:null,pyqUrl:null,practiceKey:null});markDirty();renderResources();});
    $$('[data-unit-delete]').forEach(node=>node.addEventListener("click",(event)=>{event.preventDefault();const index=Number(node.dataset.unitDelete);if(requireDelete(subject.units[index].title)){subject.units.splice(index,1);markDirty();renderResources();}}));
    $$('[data-unit-move]').forEach(node=>node.addEventListener("click",(event)=>{event.preventDefault();const [i,d]=node.dataset.unitMove.split(":");move(subject.units,Number(i),Number(d));}));
  }

  function renderMeta() {
    const meta=state.data.resources.meta;
    editor.innerHTML=`<div class="section-intro"><div><h2>Site identity</h2><p class="muted">Edit the public title and introduction.</p></div></div><section class="panel form-section"><div class="grid">${input("Website title","title",meta.title,{required:true})}${input("Institution","institution",meta.institution,{required:true})}${input("Description","description",meta.description,{type:"textarea",full:true,required:true})}${input("Last updated","lastUpdated",meta.lastUpdated||"",{type:"date"})}</div></section>`; bind(editor,meta);
  }

  function renderSyllabus() {
    const resources = state.data.resources;
    const byId = new Map(resources.syllabi.map((item) => [item.id, item]));
    editor.innerHTML = `<div class="section-intro"><div><h2>Syllabus library</h2><p class="muted">Engineering and Technology semester folders and subject files.</p></div><button class="quiet-button" id="add-syllabus">＋ Add file</button></div><div class="collection-stack">${resources.syllabusGroups.map((group,gIndex)=>`<section class="panel data-group"><div class="data-group-head"><h2>${escape(group.title)}</h2><span class="muted">${escape(group.subtitle||"")}</span></div>${group.semesters.map((semester,sIndex)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(semester.title)}</strong><button class="mini-button" data-syl-sem-add="${gIndex}:${sIndex}">Link file</button></div><div class="subject-list">${semester.syllabusIds.map(id=>{const item=byId.get(id);return item?`<div class="subject-row"><button type="button">${escape(item.title)}</button><button class="mini-button danger" data-syl-unlink="${gIndex}:${sIndex}:${escape(id)}">×</button></div>`:"";}).join("")}</div></div>`).join("")}</section>`).join("")}</div><section class="panel data-group" style="margin-top:18px"><div class="data-group-head"><h2>All syllabus files</h2></div>${resources.syllabi.map((item,index)=>`<div class="entry-card"><div class="entry-head"><strong>${escape(item.title)}</strong><button class="mini-button danger" data-syl-delete="${index}">Remove</button></div><div class="entry-fields">${input("Title",`${index}.title`,item.title)}${urlInput("PDF URL",`${index}.url`,item.url||"")}<label class="field"><span>Available</span><select data-syl-available="${index}"><option value="true" ${item.available?"selected":""}>Yes</option><option value="false" ${!item.available?"selected":""}>Coming soon</option></select><small class="field-state"></small></label></div></div>`).join("")}</section>`;
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
    try{const result=await request("/api/admin/management",{method:"POST",body:JSON.stringify(body)});toast(result.deploying?"Approved. The website update is deploying.":"Access settings updated.");state.management=await request("/api/admin/management",{method:"GET"});renderManagement();}
    catch(error){toast(error.message);if(button){button.disabled=false;button.textContent=old;}}
  }

  function renderManagement() {
    if(state.role!=="main")return; if(!state.management)return loadManagement();
    const data=state.management;
    const pendingRegistrations=data.registrations.filter(item=>item.status==="pending");
    const pendingChanges=data.changeRequests.filter(item=>item.status==="pending"||item.status==="processing");
    const branchNames=new Map(data.permissionOptions.map(branch=>[branch.id,branch]));
    const scopeName=(scope)=>{const branch=branchNames.get(scope.branchId);const semester=branch&&branch.semesters.find(item=>item.id===scope.semesterId);return `${branch?branch.name:scope.branchId} · ${semester?semester.name:scope.semesterId}`;};
    editor.innerHTML=`<div class="section-intro"><div><h2>Access & approvals</h2><p class="muted">Control regular admins and approve every requested website change.</p></div><span class="role-pill">Main admins only</span></div><div class="access-grid">
      <section class="panel data-group"><div class="data-group-head"><h2>Main admins</h2><span class="status-pill active">Full access</span></div>${data.mainAdmins.map(admin=>`<div class="entry-card"><strong>${escape(admin.name)}</strong><div class="person-meta"><span>@${escape(admin.username)}</span><span>Everything</span></div></div>`).join("")}</section>
      <section class="panel data-group"><div class="data-group-head"><h2>Pending registrations</h2><span class="status-pill ${pendingRegistrations.length?"pending":"active"}">${pendingRegistrations.length}</span></div>${pendingRegistrations.length?pendingRegistrations.map(item=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(item.name)}</strong><div class="person-meta"><span>${escape(item.branch)}</span><span>${escape(item.rollNumber)}</span><span>${escape(item.email)}</span></div></div><span class="status-pill pending">Pending</span></div><details><summary class="mini-button">Choose permissions</summary>${permissionChoices([],`registration:${item.id}`)}</details><div class="management-actions"><button class="primary" data-approve-registration="${escape(item.id)}">Approve account</button><button class="danger-button" data-reject-registration="${escape(item.id)}">Reject</button></div></div>`).join(""):'<p class="muted">No registration requests waiting.</p>'}</section>
      <section class="panel data-group wide-panel"><div class="data-group-head"><h2>Regular admins</h2><span class="role-pill">${data.regularAdmins.length} accounts</span></div>${data.regularAdmins.length?data.regularAdmins.map(admin=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(admin.name)}</strong><div class="person-meta"><span>@${escape(admin.username)}</span><span>${escape(admin.branch)}</span><span>${escape(admin.rollNumber)}</span><span>${escape(admin.email)}</span></div></div><span class="status-pill ${admin.active!==false?"active":"disabled"}">${admin.active!==false?"Active":"Disabled"}</span></div><details><summary class="mini-button">Manage assigned semesters (${(admin.permissions||[]).length})</summary>${permissionChoices(admin.permissions,`regular:${admin.id}`)}<button class="primary" data-save-permissions="${escape(admin.id)}">Save permissions</button></details><div class="management-actions"><button class="quiet-button" data-reset-password="${escape(admin.id)}">Reset password</button><button class="${admin.active!==false?"danger-button":"quiet-button"}" data-toggle-admin="${escape(admin.id)}" data-active="${admin.active===false}">${admin.active!==false?"Disable account":"Enable account"}</button></div></div>`).join(""):'<p class="muted">Approved regular admins will appear here.</p>'}</section>
      <section class="panel data-group wide-panel"><div class="data-group-head"><h2>Change requests</h2><span class="status-pill ${pendingChanges.length?"pending":"active"}">${pendingChanges.length} pending</span></div>${pendingChanges.length?pendingChanges.map(item=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(item.summary)}</strong><div class="person-meta"><span>${escape(item.requestedBy)}</span><span>${escape(scopeName(item.scope))}</span><span>${escape(new Date(item.createdAt).toLocaleString())}</span></div></div><span class="status-pill ${escape(item.status)}">${escape(item.status)}</span></div><div class="proposal-preview">Subjects affected: ${escape((item.proposal.unitCollections||[]).map(subject=>`${subject.name} (${(subject.units||[]).length} items)`).join(", ")||"None")}</div>${item.status==="pending"?`<div class="management-actions"><button class="primary" data-approve-change="${escape(item.id)}">Approve & deploy</button><button class="danger-button" data-reject-change="${escape(item.id)}">Reject</button></div>`:""}</div>`).join(""):'<p class="muted">No resource changes are waiting for approval.</p>'}</section>
      <section class="panel data-group wide-panel"><div class="data-group-head"><h2>Recent decisions</h2></div>${data.changeRequests.filter(item=>["approved","rejected"].includes(item.status)).slice(0,10).map(item=>`<div class="entry-card"><div class="entry-head"><div><strong>${escape(item.summary)}</strong><div class="person-meta"><span>${escape(item.requestedBy)}</span><span>${escape(scopeName(item.scope))}</span><span>Reviewed by ${escape(item.reviewedBy||"main admin")}</span></div></div><span class="status-pill ${escape(item.status)}">${escape(item.status)}</span></div></div>`).join("")||'<p class="muted">No completed decisions yet.</p>'}</section>
    </div>`;
    $$('[data-approve-registration]').forEach(button=>button.addEventListener("click",()=>{const item=data.registrations.find(entry=>entry.id===button.dataset.approveRegistration);const username=prompt("Choose a username for this regular admin",slug(`${item.name}-${item.rollNumber}`));if(!username)return;const password=prompt("Set a temporary password (minimum 8 characters). Share it with the applicant privately.");if(!password)return;runManagementAction({action:"approve-registration",registrationId:item.id,username,password,permissions:selectedPermissions(`registration:${item.id}`)},button);}));
    $$('[data-reject-registration]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Reject this registration request?"))runManagementAction({action:"reject-registration",registrationId:button.dataset.rejectRegistration},button);}));
    $$('[data-save-permissions]').forEach(button=>button.addEventListener("click",()=>runManagementAction({action:"update-permissions",adminId:button.dataset.savePermissions,permissions:selectedPermissions(`regular:${button.dataset.savePermissions}`)},button)));
    $$('[data-toggle-admin]').forEach(button=>button.addEventListener("click",()=>runManagementAction({action:"set-regular-status",adminId:button.dataset.toggleAdmin,active:button.dataset.active==="true"},button)));
    $$('[data-reset-password]').forEach(button=>button.addEventListener("click",()=>{const password=prompt("Enter a new temporary password (minimum 8 characters)");if(password)runManagementAction({action:"reset-password",adminId:button.dataset.resetPassword,password},button);}));
    $$('[data-approve-change]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Approve this request and deploy it to the public website?"))runManagementAction({action:"approve-change",requestId:button.dataset.approveChange},button);}));
    $$('[data-reject-change]').forEach(button=>button.addEventListener("click",()=>{const note=prompt("Optional reason for rejection","");if(note!==null)runManagementAction({action:"reject-change",requestId:button.dataset.rejectChange,note},button);}));
  }

  window.addEventListener("beforeunload",(event)=>{if(state.dirty){event.preventDefault();event.returnValue="";}});
  boot();
})();
