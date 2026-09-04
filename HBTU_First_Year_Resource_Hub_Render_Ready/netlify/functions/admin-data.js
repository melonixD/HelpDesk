const { authorize, json } = require("../lib/admin-auth");
const { historyUrls, readJson } = require("../lib/admin-content");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  const auth = authorize(event);
  if (!auth.ok) return auth.response;
  try {
    return json(200, {
      resources: readJson("resources"),
      placements: readJson("placements"),
      notices: readJson("notices"),
      history: historyUrls(),
      csrfToken: auth.session.csrf,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not load admin data." });
  }
};
