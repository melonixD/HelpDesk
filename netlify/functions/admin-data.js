const { authorize, json, mainAdminDirectory } = require("../lib/admin-auth");
const { historyUrls, readJson } = require("../lib/admin-content");
const { draftDirectory, loadDraft } = require("../lib/admin-drafts");
const { dashboardContext, filterResources } = require("../lib/admin-control");
const { connectNetlifyBlobs } = require("../lib/netlify-runtime");

exports.handler = async (event) => {
  connectNetlifyBlobs(event);
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  const auth = authorize(event);
  if (!auth.ok) return auth.response;
  try {
    const context = await dashboardContext(auth.session, mainAdminDirectory());
    const main = context.role === "main";
    const contributor = context.admin;
    const liveResources = readJson("resources");
    const drafts = main ? await draftDirectory() : {};
    const resourceDraft = await loadDraft("resources");
    const [placementDraft, noticeDraft, scholarshipDraft] = main
      ? await Promise.all(["placements", "notices", "scholarships"].map(loadDraft))
      : [null, null, null];
    const resources = resourceDraft ? resourceDraft.data : liveResources;
    return json(200, {
      role: context.role,
      user: { username: auth.session.sub, name: contributor ? contributor.name : auth.session.name },
      profile: context.profile,
      community: context.community,
      permissions: contributor ? contributor.permissions : "all",
      coins: contributor ? Number(contributor.coins) || 0 : null,
      resources: main ? resources : filterResources(resources, contributor.permissions),
      placements: main ? (placementDraft ? placementDraft.data : readJson("placements")) : null,
      notices: main ? (noticeDraft ? noticeDraft.data : readJson("notices")) : null,
      scholarships: main ? (scholarshipDraft ? scholarshipDraft.data : readJson("scholarships")) : null,
      drafts,
      history: main ? historyUrls() : {},
      csrfToken: auth.session.csrf,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not load admin data." });
  }
};
