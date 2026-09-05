const { authorize, clearCookie, json } = require("../lib/admin-auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  const auth = authorize(event, { csrf: true });
  if (!auth.ok) return auth.response;
  return json(200, { authenticated: false }, { "Set-Cookie": clearCookie(event) });
};
