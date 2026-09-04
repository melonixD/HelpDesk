const { json, verifySession } = require("../lib/admin-auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  const session = verifySession(event);
  if (!session) return json(200, { authenticated: false });
  return json(200, {
    authenticated: true,
    username: session.sub,
    csrfToken: session.csrf,
    expiresAt: session.exp,
  });
};
