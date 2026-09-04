const { filterResources, json, methodNotAllowed } = require("../lib/helpdesk-api");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return methodNotAllowed("GET");
  return json(200, filterResources(event.queryStringParameters || {}));
};
