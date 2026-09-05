const { authorize, json, mainAdminDirectory } = require("../lib/admin-auth");
const { historyUrls, readJson } = require("../lib/admin-content");
const { dashboardContext, filterResources } = require("../lib/admin-control");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  const auth = authorize(event);
  if (!auth.ok) return auth.response;
  try {
    const context = await dashboardContext(auth.session, mainAdminDirectory());
    const main = context.role === "main";
    const contributor = context.admin;
    const resources = readJson("resources");
    return json(200, {
      role: context.role,
      user: { username: auth.session.sub, name: contributor ? contributor.name : auth.session.name },
      profile: context.profile,
      community: context.community,
      permissions: contributor ? contributor.permissions : "all",
      coins: contributor ? Number(contributor.coins) || 0 : null,
      resources: main ? resources : filterResources(resources, contributor.permissions),
      placements: main ? readJson("placements") : null,
      notices: main ? readJson("notices") : null,
      scholarships: main ? readJson("scholarships") : null,
      history: main ? historyUrls() : {},
      csrfToken: auth.session.csrf,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not load admin data." });
  }
};
