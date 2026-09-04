const { generatePractice, methodNotAllowed } = require("../lib/helpdesk-api");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed("POST");
  return generatePractice(event);
};
