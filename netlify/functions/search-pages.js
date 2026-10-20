const { loadPublished } = require('../lib/content-store');
const { connectNetlifyBlobs } = require('../lib/netlify-runtime');
const seo = require('../lib/search-pages');

exports.handler = async event => {
  const headers = {'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60','Netlify-CDN-Cache-Control':'public, max-age=600, stale-while-revalidate=60','Netlify-Vary':'query','X-Content-Type-Options':'nosniff'};
  if (!['GET','HEAD'].includes(event.httpMethod)) return {statusCode:405,headers:{...headers,Allow:'GET, HEAD','Cache-Control':'no-store'},body:'Method not allowed.'};
  try {
    connectNetlifyBlobs(event);
    const [resources,bank] = await Promise.all([loadPublished('resources'),loadPublished('practice')]);
    const params = event.queryStringParameters || {}, isSitemap = params.kind === 'sitemap';
    const id = params.subject ? String(params.subject).replace(/\/$/,'') : '';
    if (id && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) return {statusCode:404,headers:{...headers,'X-Robots-Tag':'noindex'},body:'Subject not found.'};
    const body = isSitemap ? seo.sitemap(resources,bank) : seo.render(resources,bank,id);
    if (body === null) return {statusCode:404,headers:{...headers,'X-Robots-Tag':'noindex'},body:'Subject not found. <a href="/hbtu-pyqs/">Browse HBTU PYQs</a>'};
    return {statusCode:200,headers:{...headers,...(isSitemap?{'Content-Type':'application/xml; charset=utf-8'}:{})},body:event.httpMethod === 'HEAD' ? '' : body};
  } catch (error) {
    console.error('Search page unavailable:',error.message);
    return {statusCode:503,headers:{...headers,'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','Retry-After':'600','X-Robots-Tag':'noindex'},body:'The PYQ library is temporarily unavailable. Please try again shortly.'};
  }
};
