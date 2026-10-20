const fs = require('node:fs');
const path = require('node:path');
const { homeMetadata, origin } = require('../netlify/lib/search-pages');

function prepareSeo() {
  const publicDir = path.resolve(__dirname,'../public');
  const file = path.join(publicDir,'index.html');
  const html = fs.readFileSync(file,'utf8');
  const block = /<!-- SEO_HEAD_START -->[\s\S]*?<!-- SEO_HEAD_END -->/;
  if (!block.test(html)) throw new Error('Homepage SEO metadata markers are missing.');
  fs.writeFileSync(file,html.replace(block,()=>`<!-- SEO_HEAD_START -->\n${homeMetadata()}\n<!-- SEO_HEAD_END -->`));
  fs.writeFileSync(path.join(publicDir,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${origin()}/sitemap.xml\n`);
}
if (require.main === module) prepareSeo();
module.exports = { prepareSeo };
