const { readFinal } = require("../lib/admin-uploads");

exports.handler = async (event) => {
  if (!["GET", "HEAD"].includes(event.httpMethod)) return { statusCode: 405, headers: { Allow: "GET, HEAD" }, body: "" };
  const key = event.queryStringParameters && event.queryStringParameters.key;
  const result = await readFinal(key);
  if (!result) return { statusCode: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Not found" };
  const total = result.data.length;
  const maximumResponse = 4 * 1024 * 1024;
  const rangeHeader = String((event.headers && (event.headers.range || event.headers.Range)) || "");
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  let start = match && match[1] ? Number(match[1]) : 0;
  let end = match && match[2] ? Number(match[2]) : Math.min(total - 1, start + maximumResponse - 1);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= total || end < start) {
    return { statusCode: 416, headers: { "Content-Range": `bytes */${total}` }, body: "" };
  }
  end = Math.min(end, total - 1, start + maximumResponse - 1);
  const partial = event.httpMethod !== "HEAD" && (Boolean(match) || total > maximumResponse);
  const payload = result.data.subarray(start, end + 1);
  return {
    statusCode: partial ? 206 : 200,
    isBase64Encoded: event.httpMethod !== "HEAD",
    headers: {
      "Content-Type": result.metadata.contentType || "application/octet-stream",
      "Content-Length": String(event.httpMethod === "HEAD" ? total : payload.length),
      "Content-Disposition": result.metadata.contentType === "application/pdf" ? "inline" : "inline",
      "Accept-Ranges": "bytes",
      ...(partial ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
    body: event.httpMethod === "HEAD" ? "" : payload.toString("base64"),
  };
};
