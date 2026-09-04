const { authenticate, json } = require("../lib/admin-auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  return authenticate(event);
};
