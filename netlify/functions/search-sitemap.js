const { handler } = require('./search-pages');

// Use a separate entry point so sitemap routing never depends on rewrite queries.
exports.handler = event => handler({
  ...event,
  queryStringParameters: { ...(event.queryStringParameters || {}), kind: 'sitemap' },
});
