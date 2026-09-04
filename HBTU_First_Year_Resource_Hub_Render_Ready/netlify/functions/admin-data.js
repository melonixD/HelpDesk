const { authorize, json } = require("../lib/admin-auth");
const { historyUrls, readJson } = require("../lib/admin-content");
const { activeRegularAdmin, filterResources } = require("../lib/admin-control");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  const auth = authorize(event);
  if (!auth.ok) return auth.response;
  try {
    const main = auth.session.role === "main";
    const regularAdmin = main ? null : await activeRegularAdmin(auth.session);
    const resources = readJson("resources");
    return json(200, {
      role: auth.session.role,
      user: { username: auth.session.sub, name: auth.session.name },
      permissions: regularAdmin ? regularAdmin.permissions : "all",
      resources: main ? resources : filterResources(resources, regularAdmin.permissions),
      placements: main ? readJson("placements") : null,
      notices: main ? readJson("notices") : null,
      history: main ? historyUrls() : {},
      csrfToken: auth.session.csrf,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not load admin data." });
  }
};
