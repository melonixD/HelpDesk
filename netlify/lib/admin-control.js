const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { id, loadState, mutateState, cleanRegularAdmin } = require("./admin-state");
const { readJson, validateResources } = require("./admin-content");
const { loadDraft, saveDraft } = require("./admin-drafts");
const { loadPublished } = require("./content-store");

class ControlError extends Error {
  constructor(message, statusCode = 400) { super(message); this.name = "ControlError"; this.statusCode = statusCode; }
}

function text(value, label, maximum = 200) {
  const result = String(value || "").trim();
  if (!result || result.length > maximum) throw new ControlError(`${label} is required and must be under ${maximum} characters.`);
  return result;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function permissionKey(permission) { return `${permission.branchId}:${permission.semesterId}`; }

function contributorRole(admin) { return admin && admin.role === "branch" ? "branch" : "regular"; }

function validatePermissions(value, resources = readJson("resources")) {
  if (!Array.isArray(value)) throw new ControlError("Permissions must be a list.");
  const seen = new Set();
  return value.map((permission) => {
    const branchId = text(permission && permission.branchId, "Permission branch", 80);
    const semesterId = text(permission && permission.semesterId, "Permission semester", 80);
    const branch = resources.branches.find((item) => item.id === branchId);
    if (!branch || !branch.semesters.some((semester) => semester.id === semesterId)) throw new ControlError("A selected branch or semester no longer exists.");
    const clean = { branchId, semesterId }; const key = permissionKey(clean);
    if (seen.has(key)) throw new ControlError("A permission was selected more than once.");
    seen.add(key); return clean;
  });
}

function isAllowed(admin, branchId, semesterId) {
  return admin && admin.active !== false && (admin.permissions || []).some((permission) =>
    permission.branchId === branchId && permission.semesterId === semesterId
  );
}

async function activeContributor(session) {
  if (!session || session.role === "main" || !session.adminId) throw new ControlError("Contributor access is required.", 403);
  const state = await loadState();
  const admin = state.regularAdmins.find((item) => item.id === session.adminId && item.active !== false);
  if (!admin) throw new ControlError("This contributor account is no longer active.", 403);
  return admin;
}

const activeRegularAdmin = activeContributor;

function filterResources(resources, permissions) {
  const keys = new Set(permissions.map(permissionKey));
  const branches = resources.branches.map((branch) => ({
    ...branch,
    semesters: branch.semesters.filter((semester) => keys.has(`${branch.id}:${semester.id}`)),
  })).filter((branch) => branch.semesters.length);
  const subjectIds = new Set(branches.flatMap((branch) => branch.semesters.flatMap((semester) => semester.subjectIds)));
  return {
    ...resources,
    branches,
    unitCollections: resources.unitCollections.filter((collection) => subjectIds.has(collection.id)),
    subjects: [],
    syllabi: [],
    syllabusGroups: [],
  };
}

function profileKey(session) {
  return session.role === "main" ? `main:${String(session.sub).toLowerCase()}` : `contributor:${session.adminId}`;
}

function savedProfileUrl(state, key, fallback = "") {
  const profile = state.profiles.find((item) => item.ownerKey === key);
  return profile && profile.photoUrl ? profile.photoUrl : fallback;
}

function permissionDirectory(resources) {
  return new Map(resources.branches.map((branch) => [branch.id, {
    name: branch.name,
    semesters: new Map(branch.semesters.map((semester) => [semester.id, semester.name])),
  }]));
}

function communityFromState(state, resources) {
  const directory = permissionDirectory(resources);
  const entries = state.regularAdmins.filter((admin) => admin.active !== false && admin.role !== "main").map((admin) => {
    const permissions = (admin.permissions || []).map((permission) => {
      const branch = directory.get(permission.branchId);
      return {
        branchId: permission.branchId,
        branchName: branch ? branch.name : permission.branchId,
        semesterId: permission.semesterId,
        semesterName: branch && branch.semesters.get(permission.semesterId) || permission.semesterId,
      };
    });
    return {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      branch: admin.branch,
      role: contributorRole(admin),
      photoUrl: savedProfileUrl(state, `contributor:${admin.id}`, ""),
      permissions,
      coins: Number(admin.coins) || 0,
      contributions: Number(admin.contributions) || 0,
      requestsSubmitted: state.changeRequests.filter((request) => request.adminId === admin.id).length,
    };
  }).sort((left, right) => right.coins - left.coins || right.contributions - left.contributions || left.name.localeCompare(right.name));
  return entries.map((entry, index) => ({ ...entry, rank: index + 1, topContributor: index === 0 && entry.coins > 0 }));
}

async function dashboardContext(session, mainAdmins, resourceData = null) {
  const state = await loadState();
  const resources = resourceData || await loadPublished("resources");
  let admin = null;
  let role = "main";
  let fallbackPhoto = "";
  if (session.role === "main") {
    const main = mainAdmins.find((item) => item.username.toLowerCase() === String(session.sub).toLowerCase());
    fallbackPhoto = main && main.photoUrl || "";
  } else {
    admin = state.regularAdmins.find((item) => item.id === session.adminId && item.active !== false);
    if (!admin) throw new ControlError("This contributor account is no longer active.", 403);
    role = contributorRole(admin);
  }
  return {
    admin,
    role,
    profile: { photoUrl: savedProfileUrl(state, profileKey({ ...session, role }), fallbackPhoto) },
    community: communityFromState(state, resources),
  };
}

function validatePhotoUrl(value) {
  const url = text(value, "Profile picture URL", 2000);
  if (!/^\/uploads\/[A-Za-z0-9._/-]+$/.test(url) && !/^\/images\/[A-Za-z0-9._/-]+$/.test(url) && !/^https:\/\//i.test(url)) {
    throw new ControlError("Use an uploaded image or a secure HTTPS image URL.");
  }
  return url;
}

async function updateProfile(session, body, mainAdmins) {
  if (session.role !== "main") await activeContributor(session);
  const photoUrl = validatePhotoUrl(body && body.photoUrl);
  const key = profileKey(session);
  await mutateState((state) => {
    let profile = state.profiles.find((item) => item.ownerKey === key);
    if (!profile) {
      profile = { id: id("profile"), ownerKey: key, createdAt: new Date().toISOString() };
      state.profiles.push(profile);
    }
    profile.photoUrl = photoUrl;
    profile.updatedAt = new Date().toISOString();
  });
  const context = await dashboardContext(session, mainAdmins);
  return { saved: true, profile: context.profile, community: context.community };
}

function password(value, label) {
  if (typeof value !== "string" || !value || value.length > 200) {
    throw new ControlError(`${label} is required and must be under 200 characters.`);
  }
  return value;
}

async function changeOwnPassword(session, body, mainAdmins) {
  if (!session || session.role !== "main") throw new ControlError("Main admin permission is required.", 403);
  const currentPassword = password(body && body.currentPassword, "Current password");
  const newPassword = password(body && body.newPassword, "New password");
  const confirmPassword = password(body && body.confirmPassword, "Password confirmation");
  if (newPassword.length < 10) throw new ControlError("New password must contain at least 10 characters.");
  if (newPassword !== confirmPassword) throw new ControlError("New password and confirmation do not match.");

  return mutateState(async (state) => {
    const usernameKey = String(session.sub || "").toLowerCase();
    const configured = mainAdmins.find((admin) => String(admin.username).toLowerCase() === usernameKey);
    const promoted = state.regularAdmins.find((admin) =>
      admin.active !== false && admin.role === "main" &&
      (admin.id === session.adminId || String(admin.username).toLowerCase() === usernameKey)
    );
    const override = state.mainPasswordOverrides.find((item) =>
      String(item.usernameKey || item.username || "").toLowerCase() === usernameKey
    );
    const currentHash = configured ? (override && override.passwordHash) || configured.passwordHash : promoted && promoted.passwordHash;
    if (!currentHash || !await bcrypt.compare(currentPassword, currentHash).catch(() => false)) {
      throw new ControlError("Current password is incorrect.", 401);
    }
    if (await bcrypt.compare(newPassword, currentHash).catch(() => false)) {
      throw new ControlError("Choose a password different from your current password.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updatedAt = new Date().toISOString();
    if (configured) {
      if (override) {
        override.passwordHash = passwordHash;
        override.updatedAt = updatedAt;
      } else {
        state.mainPasswordOverrides.push({ usernameKey, passwordHash, updatedAt });
      }
    } else if (promoted) {
      promoted.passwordHash = passwordHash;
      promoted.updatedAt = updatedAt;
      promoted.updatedBy = session.sub;
    } else {
      throw new ControlError("This main-admin account is no longer active.", 403);
    }
    return { changed: true };
  });
}

async function registration(body) {
  const applicant = {
    id: id("registration"),
    name: text(body && body.name, "Name", 120),
    branch: text(body && body.branch, "Branch", 160),
    rollNumber: text(body && body.rollNumber, "Roll number", 60),
    email: text(body && body.email, "Email", 254).toLowerCase(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant.email)) throw new ControlError("Enter a valid email address.");
  return mutateState((state) => {
    const duplicate = state.registrations.find((item) => item.status === "pending" &&
      (item.email.toLowerCase() === applicant.email || item.rollNumber.toLowerCase() === applicant.rollNumber.toLowerCase()));
    if (duplicate) throw new ControlError("An application with this email or roll number is already pending.", 409);
    state.registrations.unshift(applicant);
    return { submitted: true, applicationId: applicant.id };
  });
}

async function managementSnapshot(mainAdmins, resourceData = null) {
  const state = await loadState();
  const resources = resourceData || await loadPublished("resources");
  const promotedMainAdmins = state.regularAdmins.filter((admin) => admin.active !== false && admin.role === "main").map((admin) => ({
    username: admin.username,
    name: admin.name,
    photoUrl: savedProfileUrl(state, `main:${admin.username.toLowerCase()}`, ""),
    promoted: true,
    promotedAt: admin.promotedAt,
    promotedBy: admin.promotedBy,
  }));
  return {
    mainAdmins: [...mainAdmins.map((admin) => ({
      ...admin,
      photoUrl: savedProfileUrl(state, `main:${admin.username.toLowerCase()}`, admin.photoUrl || ""),
    })), ...promotedMainAdmins],
    registrations: state.registrations,
    regularAdmins: state.regularAdmins.filter((admin) => admin.role !== "main").map((admin) => ({
      ...cleanRegularAdmin(admin),
      photoUrl: savedProfileUrl(state, `contributor:${admin.id}`, ""),
    })),
    changeRequests: state.changeRequests.map((request) => ({ ...request })),
    leaderboard: communityFromState(state, resources),
    permissionOptions: resources.branches.map((branch) => ({
      id: branch.id, name: branch.name,
      semesters: branch.semesters.map((semester) => ({ id: semester.id, name: semester.name })),
    })),
  };
}

const ATTRIBUTION_FIELDS = ["providedBy", "providedAt", "providedByRole"];

function withoutAttribution(value) {
  if (!value || typeof value !== "object") return value;
  const copy = clone(value);
  ATTRIBUTION_FIELDS.forEach((field) => { delete copy[field]; });
  if (Array.isArray(copy.units)) copy.units = copy.units.map(withoutAttribution);
  return copy;
}

function sameContent(left, right) {
  return JSON.stringify(withoutAttribution(left)) === JSON.stringify(withoutAttribution(right));
}

function copyAttribution(source, target) {
  ATTRIBUTION_FIELDS.forEach((field) => {
    if (source && source[field]) target[field] = source[field];
    else delete target[field];
  });
}

function stampCollection(previous, proposed, contributor, providedAt) {
  const next = clone(proposed);
  let changedUnit = false;
  next.units = (next.units || []).map((unit, index) => {
    const prior = previous && previous.units && previous.units[index];
    const updated = clone(unit);
    if (!prior || !sameContent(prior, updated)) {
      changedUnit = true;
      updated.providedBy = contributor.name;
      updated.providedByRole = contributor.role;
      updated.providedAt = providedAt;
    } else {
      copyAttribution(prior, updated);
    }
    return updated;
  });
  const previousHeader = previous ? { ...withoutAttribution(previous), units: undefined } : null;
  const nextHeader = { ...withoutAttribution(next), units: undefined };
  if (!previous || JSON.stringify(previousHeader) !== JSON.stringify(nextHeader) || changedUnit) {
    next.providedBy = contributor.name;
    next.providedByRole = contributor.role;
    next.providedAt = providedAt;
  } else {
    copyAttribution(previous, next);
  }
  return next;
}

function hasOutsideReference(resources, collectionId, scope) {
  return resources.branches.some((branch) => branch.semesters.some((semester) =>
    semester.subjectIds.includes(collectionId) && (branch.id !== scope.branchId || semester.id !== scope.semesterId)
  ));
}

function scopedCollectionId(resources, collectionId, scope) {
  const digest = crypto.createHash("sha256").update(`${collectionId}:${scope.branchId}:${scope.semesterId}`).digest("hex").slice(0, 8);
  const root = collectionId.slice(0, 68).replace(/-+$/g, "") || "subject";
  const base = `${root}-${digest}`;
  const ids = new Set(resources.unitCollections.map((item) => item.id));
  let candidate = base;
  let index = 2;
  while (ids.has(candidate)) candidate = `${base.slice(0, 76 - String(index).length)}-${index++}`;
  return candidate;
}

function buildCandidate(request, contributor = null, baseResources = null) {
  const resources = clone(baseResources || readJson("resources"));
  const branch = resources.branches.find((item) => item.id === request.scope.branchId);
  const semester = branch && branch.semesters.find((item) => item.id === request.scope.semesterId);
  if (!branch || !semester) throw new ControlError("The requested branch or semester no longer exists.", 409);
  const proposedSemester = request.proposal && request.proposal.semester;
  const collections = request.proposal && request.proposal.unitCollections;
  if (!proposedSemester || proposedSemester.id !== semester.id || !Array.isArray(proposedSemester.subjectIds) || !Array.isArray(collections)) {
    throw new ControlError("The proposed resource change is invalid.");
  }
  const proposedIds = new Set(proposedSemester.subjectIds);
  if (proposedIds.size !== proposedSemester.subjectIds.length || collections.some((collection) => !proposedIds.has(collection.id)) || collections.length !== proposedIds.size) {
    throw new ControlError("The proposal must contain exactly the subjects linked to its semester.");
  }
  const linkedIds = [...proposedSemester.subjectIds];
  const providedAt = new Date().toISOString();
  collections.forEach((collection) => {
    const index = resources.unitCollections.findIndex((item) => item.id === collection.id);
    const previous = index >= 0 ? resources.unitCollections[index] : null;
    let next = contributor ? stampCollection(previous, collection, contributor, providedAt) : clone(collection);
    const changed = !previous || !sameContent(previous, collection);
    if (contributor && previous && changed && hasOutsideReference(resources, collection.id, request.scope)) {
      const nextId = scopedCollectionId(resources, collection.id, request.scope);
      next.sourceSubjectId = previous.sourceSubjectId || previous.id;
      next.id = nextId;
      for (let cursor = 0; cursor < linkedIds.length; cursor += 1) {
        if (linkedIds[cursor] === collection.id) linkedIds[cursor] = nextId;
      }
      resources.unitCollections.push(next);
    } else if (index >= 0) resources.unitCollections[index] = next;
    else resources.unitCollections.push(next);
  });
  semester.subjectIds = linkedIds;
  validateResources(resources);
  return resources;
}

function assertAttributeOnly(request, baseResources = null) {
  const resources = clone(baseResources || readJson("resources"));
  const branch = resources.branches.find((item) => item.id === request.scope.branchId);
  const semester = branch && branch.semesters.find((item) => item.id === request.scope.semesterId);
  const proposedSemester = request.proposal && request.proposal.semester;
  const collections = request.proposal && request.proposal.unitCollections;
  if (!semester || !proposedSemester || JSON.stringify(semester.subjectIds) !== JSON.stringify(proposedSemester.subjectIds)) {
    throw new ControlError("Branch admins can edit resource attributes, but structural subject changes still require main-admin approval.", 403);
  }
  const collectionFields = new Set(["name", "description", "accent", "lectureUrl", "notesUrl", "handwrittenNotesUrl", "booksUrl", "books"]);
  const unitFields = new Set(["number", "title", "lectureUrl", "lectureItems", "lectureMessage", "handwrittenNotesUrl", "masterNotesUrl", "notesUrl", "pyqUrl", "practiceKey", "bookUrl", "books", "workshopFileUrl", "classNotesUrl", "labManualUrl", "vivaQuestionsUrl", "endSemesterQuestionsUrl", "experimentVideosUrl"]);
  const changedOutside = (current, proposed, allowed) => [...new Set([...Object.keys(current || {}), ...Object.keys(proposed || {})])]
    .some((key) => key !== "units" && !ATTRIBUTION_FIELDS.includes(key) && !allowed.has(key) && JSON.stringify(current && current[key]) !== JSON.stringify(proposed && proposed[key]));
  if (!Array.isArray(collections) || collections.some((collection) => {
    const current = resources.unitCollections.find((item) => item.id === collection.id);
    return !current || !Array.isArray(collection.units) || collection.units.length !== current.units.length ||
      changedOutside(current, collection, collectionFields) || collection.units.some((unit, index) => changedOutside(current.units[index], unit, unitFields));
  })) {
    throw new ControlError("Branch admins may change existing resource attributes only. Structural changes require main-admin approval.", 403);
  }
}

async function createChangeRequest(session, body) {
  const admin = await activeContributor(session);
  const branchId = text(body && body.scope && body.scope.branchId, "Branch", 80);
  const semesterId = text(body && body.scope && body.scope.semesterId, "Semester", 80);
  if (!isAllowed(admin, branchId, semesterId)) throw new ControlError("You do not have access to this branch and semester.", 403);
  if (!body || !body.proposal || typeof body.proposal !== "object") throw new ControlError("A proposed resource change is required.");
  const request = {
    id: id("change"), adminId: admin.id, requestedBy: admin.name, username: admin.username, requestedRole: contributorRole(admin),
    scope: { branchId, semesterId }, summary: text(body && body.summary, "Change summary", 500),
    proposal: clone(body.proposal), status: "pending", createdAt: new Date().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(request)) > 1024 * 1024) throw new ControlError("This change request is too large.");
  buildCandidate(request, null, await loadPublished("resources"));
  return mutateState((state) => {
    const active = state.regularAdmins.find((item) => item.id === admin.id);
    if (!isAllowed(active, branchId, semesterId)) throw new ControlError("This permission is no longer active.", 403);
    state.changeRequests.unshift(request);
    return { submitted: true, requestId: request.id };
  });
}

async function approveChange(requestId, reviewer) {
  let request;
  await mutateState((state) => {
    request = state.changeRequests.find((item) => item.id === requestId);
    if (!request || request.status !== "pending") throw new ControlError("This change request is no longer pending.", 409);
    request.status = "processing"; request.reviewedBy = reviewer; request.reviewedAt = new Date().toISOString();
  });
  try {
    const existingDraft = await loadDraft("resources");
    const baseResources = existingDraft ? existingDraft.data : await loadPublished("resources");
    const candidate = buildCandidate(request, { name: request.requestedBy, role: request.requestedRole || "regular" }, baseResources);
    const draft = await saveDraft("resources", candidate, reviewer);
    await mutateState((state) => {
      const item = state.changeRequests.find((entry) => entry.id === requestId);
      if (item) { item.status = "approved-draft"; item.draftUpdatedAt = draft.updatedAt; item.coinAwarded = true; delete item.commitUrl; delete item.error; }
      const admin = state.regularAdmins.find((entry) => entry.id === request.adminId);
      if (admin) { admin.coins = (Number(admin.coins) || 0) + 1; admin.contributions = (Number(admin.contributions) || 0) + 1; }
    });
    return { approved: true, draft: true, deploying: false, target: "resources", updatedAt: draft.updatedAt, updatedBy: draft.updatedBy };
  } catch (error) {
    await mutateState((state) => { const item=state.changeRequests.find((entry)=>entry.id===requestId);if(item){item.status="pending";item.error=String(error.message||"Approval failed").slice(0,300);} });
    throw error;
  }
}

async function saveScopedDraft(session, body) {
  const admin = await activeContributor(session);
  if (contributorRole(admin) !== "branch") throw new ControlError("Only branch admins can publish scoped changes directly.", 403);
  const branchId = text(body && body.scope && body.scope.branchId, "Branch", 80);
  const semesterId = text(body && body.scope && body.scope.semesterId, "Semester", 80);
  if (!isAllowed(admin, branchId, semesterId)) throw new ControlError("You do not govern this branch and semester.", 403);
  const request = {
    id: id("change"), adminId: admin.id, requestedBy: admin.name, username: admin.username, requestedRole: "branch",
    scope: { branchId, semesterId }, summary: text(body && body.summary, "Change summary", 500),
    proposal: clone(body && body.proposal), status: "drafted", createdAt: new Date().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(request)) > 1024 * 1024) throw new ControlError("This scoped update is too large.");
  const existingDraft = await loadDraft("resources");
  const baseResources = existingDraft ? existingDraft.data : await loadPublished("resources");
  assertAttributeOnly(request, baseResources);
  const candidate = buildCandidate(request, { name: admin.name, role: "branch" }, baseResources);
  const draft = await saveDraft("resources", candidate, admin.username);
  request.status = "drafted";
  request.draftUpdatedAt = draft.updatedAt;
  request.reviewedBy = admin.username;
  request.reviewedAt = new Date().toISOString();
  request.coinAwarded = true;
  await mutateState((state) => {
    const current = state.regularAdmins.find((entry) => entry.id === admin.id);
    if (current) { current.coins = (Number(current.coins) || 0) + 1; current.contributions = (Number(current.contributions) || 0) + 1; }
    state.changeRequests.unshift(request);
  });
  return { saved: true, draft: true, deploying: false, target: "resources", updatedAt: draft.updatedAt, updatedBy: draft.updatedBy };
}

async function markResourcesDraftPublished(publishedVersion, reviewer) {
  return mutateState((state) => {
    let count = 0;
    const publishedAt = new Date().toISOString();
    state.changeRequests.forEach((request) => {
      if (!["approved-draft", "drafted"].includes(request.status)) return;
      request.status = "published";
      delete request.commitUrl;
      delete request.deployedAt;
      delete request.deployedBy;
      request.publishedVersion = publishedVersion;
      request.publishedAt = publishedAt;
      request.publishedBy = reviewer;
      count += 1;
    });
    return count;
  });
}

async function manage(action, body, reviewer, mainAdmins, resourceData = null) {
  const resources = resourceData || await loadPublished("resources");
  if (action === "approve-change") return approveChange(text(body.requestId, "Request id", 80), reviewer);
  return mutateState(async (state) => {
    if (action === "approve-registration") {
      const application = state.registrations.find((item) => item.id === body.registrationId && item.status === "pending");
      if (!application) throw new ControlError("This application is no longer pending.", 409);
      const username = text(body.username, "Username", 60);
      if (!/^[A-Za-z0-9_.-]{3,60}$/.test(username)) throw new ControlError("Username may use letters, numbers, dots, underscores and hyphens.");
      const password = text(body.password, "Temporary password", 200);
      if (password.length < 8) throw new ControlError("Temporary password must contain at least 8 characters.");
      if (mainAdmins.some((admin) => admin.username.toLowerCase() === username.toLowerCase()) || state.regularAdmins.some((admin) => admin.username.toLowerCase() === username.toLowerCase())) {
        throw new ControlError("That username is already in use.", 409);
      }
      const permissions = validatePermissions(body.permissions, resources);
      if (!permissions.length) throw new ControlError("Assign at least one branch and semester before approving this account.");
      const admin = { id: id("regular"), username, passwordHash: await bcrypt.hash(password, 12), name: application.name,
        branch: application.branch, rollNumber: application.rollNumber, email: application.email,
        permissions, role: "regular", coins: 0, contributions: 0, active: true, createdAt: new Date().toISOString(), createdBy: reviewer };
      state.regularAdmins.unshift(admin); application.status="approved"; application.reviewedAt=new Date().toISOString();application.reviewedBy=reviewer;application.adminId=admin.id;
      return { approved: true, regularAdmin: cleanRegularAdmin(admin) };
    }
    if (action === "reject-registration") {
      const application=state.registrations.find((item)=>item.id===body.registrationId&&item.status==="pending");if(!application)throw new ControlError("This application is no longer pending.",409);
      application.status="rejected";application.reviewedAt=new Date().toISOString();application.reviewedBy=reviewer;return { rejected:true };
    }
    if (["update-permissions","set-regular-status","reset-password","set-contributor-role","promote-main-admin"].includes(action)) {
      const admin=state.regularAdmins.find((item)=>item.id===body.adminId);if(!admin)throw new ControlError("Regular admin not found.",404);
      if(action==="update-permissions")admin.permissions=validatePermissions(body.permissions,resources);
      if(action==="set-regular-status")admin.active=Boolean(body.active);
      if(action==="reset-password"){const password=text(body.password,"New password",200);if(password.length<8)throw new ControlError("New password must contain at least 8 characters.");admin.passwordHash=await bcrypt.hash(password,12);}
      if(action==="set-contributor-role"){
        if(!["regular","branch"].includes(body.role))throw new ControlError("Contributor role must be regular or branch admin.");
        if(body.role==="branch"&&!(admin.permissions||[]).length)throw new ControlError("Assign at least one governed section before promotion.");
        admin.role=body.role;
      }
      if(action==="promote-main-admin"){
        if(admin.active===false)throw new ControlError("Enable this account before promoting it to main admin.");
        if(admin.role==="main")throw new ControlError("This account is already a main admin.",409);
        admin.role="main";admin.promotedAt=new Date().toISOString();admin.promotedBy=reviewer;
        const profile=state.profiles.find((item)=>item.ownerKey===`contributor:${admin.id}`);
        if(profile)profile.ownerKey=`main:${admin.username.toLowerCase()}`;
      }
      admin.updatedAt=new Date().toISOString();admin.updatedBy=reviewer;
      return action==="promote-main-admin"
        ? { updated:true,promoted:true,mainAdmin:cleanRegularAdmin(admin) }
        : { updated:true,regularAdmin:cleanRegularAdmin(admin) };
    }
    if (action === "reject-change") {
      const request=state.changeRequests.find((item)=>item.id===body.requestId&&item.status==="pending");if(!request)throw new ControlError("This change request is no longer pending.",409);
      request.status="rejected";request.reviewedAt=new Date().toISOString();request.reviewedBy=reviewer;request.reviewNote=String(body.note||"").slice(0,500);return { rejected:true };
    }
    throw new ControlError("Unknown management action.");
  });
}

module.exports = {
  ControlError,
  activeContributor,
  activeRegularAdmin,
  changeOwnPassword,
  createChangeRequest,
  dashboardContext,
  filterResources,
  managementSnapshot,
  manage,
  markResourcesDraftPublished,
  saveScopedDraft,
  registration,
  updateProfile,
  validatePermissions,
};
