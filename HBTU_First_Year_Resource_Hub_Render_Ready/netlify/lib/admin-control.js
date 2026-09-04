const bcrypt = require("bcryptjs");
const { id, loadState, mutateState, cleanRegularAdmin } = require("./admin-state");
const { commitJson, readJson, validateResources } = require("./admin-content");

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

async function activeRegularAdmin(session) {
  if (!session || session.role !== "regular" || !session.adminId) throw new ControlError("Regular admin access is required.", 403);
  const state = await loadState();
  const admin = state.regularAdmins.find((item) => item.id === session.adminId && item.active !== false);
  if (!admin) throw new ControlError("This regular-admin account is no longer active.", 403);
  return admin;
}

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

async function managementSnapshot(mainAdmins) {
  const state = await loadState();
  return {
    mainAdmins,
    registrations: state.registrations,
    regularAdmins: state.regularAdmins.map(cleanRegularAdmin),
    changeRequests: state.changeRequests.map((request) => ({ ...request })),
    permissionOptions: readJson("resources").branches.map((branch) => ({
      id: branch.id, name: branch.name,
      semesters: branch.semesters.map((semester) => ({ id: semester.id, name: semester.name })),
    })),
  };
}

function buildCandidate(request) {
  const resources = readJson("resources");
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
  semester.subjectIds = [...proposedSemester.subjectIds];
  collections.forEach((collection) => {
    const index = resources.unitCollections.findIndex((item) => item.id === collection.id);
    if (index >= 0) resources.unitCollections[index] = clone(collection);
    else resources.unitCollections.push(clone(collection));
  });
  validateResources(resources);
  return resources;
}

async function createChangeRequest(session, body) {
  const admin = await activeRegularAdmin(session);
  const branchId = text(body && body.scope && body.scope.branchId, "Branch", 80);
  const semesterId = text(body && body.scope && body.scope.semesterId, "Semester", 80);
  if (!isAllowed(admin, branchId, semesterId)) throw new ControlError("You do not have access to this branch and semester.", 403);
  if (!body || !body.proposal || typeof body.proposal !== "object") throw new ControlError("A proposed resource change is required.");
  const request = {
    id: id("change"), adminId: admin.id, requestedBy: admin.name, username: admin.username,
    scope: { branchId, semesterId }, summary: text(body && body.summary, "Change summary", 500),
    proposal: clone(body.proposal), status: "pending", createdAt: new Date().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(request)) > 1024 * 1024) throw new ControlError("This change request is too large.");
  buildCandidate(request);
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
    const result = await commitJson("resources", buildCandidate(request), `Approve ${request.summary} (requested by ${request.requestedBy})`);
    await mutateState((state) => { const item=state.changeRequests.find((entry)=>entry.id===requestId);if(item){item.status="approved";item.commitUrl=result.commitUrl;delete item.error;} });
    return { approved: true, deploying: true, ...result };
  } catch (error) {
    await mutateState((state) => { const item=state.changeRequests.find((entry)=>entry.id===requestId);if(item){item.status="pending";item.error=String(error.message||"Approval failed").slice(0,300);} });
    throw error;
  }
}

async function manage(action, body, reviewer, mainAdmins) {
  const resources = readJson("resources");
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
        permissions, active: true, createdAt: new Date().toISOString(), createdBy: reviewer };
      state.regularAdmins.unshift(admin); application.status="approved"; application.reviewedAt=new Date().toISOString();application.reviewedBy=reviewer;application.adminId=admin.id;
      return { approved: true, regularAdmin: cleanRegularAdmin(admin) };
    }
    if (action === "reject-registration") {
      const application=state.registrations.find((item)=>item.id===body.registrationId&&item.status==="pending");if(!application)throw new ControlError("This application is no longer pending.",409);
      application.status="rejected";application.reviewedAt=new Date().toISOString();application.reviewedBy=reviewer;return { rejected:true };
    }
    if (["update-permissions","set-regular-status","reset-password"].includes(action)) {
      const admin=state.regularAdmins.find((item)=>item.id===body.adminId);if(!admin)throw new ControlError("Regular admin not found.",404);
      if(action==="update-permissions")admin.permissions=validatePermissions(body.permissions,resources);
      if(action==="set-regular-status")admin.active=Boolean(body.active);
      if(action==="reset-password"){const password=text(body.password,"New password",200);if(password.length<8)throw new ControlError("New password must contain at least 8 characters.");admin.passwordHash=await bcrypt.hash(password,12);}
      admin.updatedAt=new Date().toISOString();admin.updatedBy=reviewer;return { updated:true,regularAdmin:cleanRegularAdmin(admin) };
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
  activeRegularAdmin,
  createChangeRequest,
  filterResources,
  managementSnapshot,
  manage,
  registration,
  validatePermissions,
};
