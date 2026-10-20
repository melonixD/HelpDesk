const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const sandbox=path.join(os.tmpdir(),'helpdesk-seo-'+crypto.randomUUID());
process.env.HELPDESK_LOCAL_STORAGE='true';
process.env.PUBLISHED_CONTENT_PATH=path.join(sandbox,'published.json');
process.env.ADMIN_DRAFT_PATH=path.join(sandbox,'drafts.json');
process.env.ADMIN_STATE_PATH=path.join(sandbox,'state.json');
const seo=require('../netlify/lib/search-pages');
const resources=require('../data/resources.json'),bank=require('../data/practice.json');
const {handler}=require('../netlify/functions/search-pages');
const clone=value=>JSON.parse(JSON.stringify(value));
test.after(async()=>{await fs.rm(sandbox,{recursive:true,force:true});});

test('hub contains real, crawlable subject links without JavaScript',()=>{
  const subjects=seo.catalogue(resources,bank),html=seo.render(resources,bank);
  assert.equal(subjects.length,13);assert.match(html,/<h1>HBTU PYQs<\/h1>/);
  for(const subject of subjects)assert.ok(html.includes('href="'+seo.subjectPath(subject.id)+'"'));
  assert.match(html,/rel="canonical" href="https:\/\/helpdeskhbtu.netlify.app\/hbtu-pyqs\/"/);
  const ld=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.ok(ld['@graph'].some(e=>e['@type']==='BreadcrumbList'));
  assert.match(html,/independent student project, not an official HBTU website/);
});
test('subject pages contain actual questions, safe math and links to the right practice subject',()=>{
  const html=seo.render(resources,bank,'maths-1');
  assert.match(html,/HBTU Engineering Mathematics 1 PYQs/);assert.match(html,/katex/);
  assert.match(html,/\/?practice=maths-1#practice-mode/);assert.match(html,/derivative/);
  assert.equal(seo.render(resources,bank,'missing-subject'),null);
  const js=require('node:fs').readFileSync(path.resolve(__dirname,'../public/question-bank.js'),'utf8');
  assert.match(js,/allBranches\?"all"/);assert.match(js,/get\('practice'\)/);
});
test('rendering escapes administrator text and ignores disabled or unsafe paper links',()=>{
  const r=clone(resources),b=clone(bank),subject=r.unitCollections.find(s=>s.id==='chemistry');
  subject.name='Chemistry </script><script>window.BAD=true</script>';
  subject.units[0].pyqUrl='javascript:alert(1)';
  subject.yearWisePyqs=[{year:2025,enabledPapers:['endSemUrl'],midSem2Url:'https://example.com/disabled-paper',endSemUrl:'https://example.com/end-paper'}];
  b.questions.find(q=>q.subjectId==='chemistry').question='<img src=x onerror=alert(1)> What is a bond?';
  const html=seo.render(r,b,'chemistry');
  assert.doesNotMatch(html,/<script>window.BAD/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img src=x/);
  assert.doesNotMatch(html,/javascript:alert|disabled-paper/);assert.match(html,/https:\/\/example.com\/end-paper/);
  const ld=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);assert.ok(ld['@graph']);
  assert.equal(seo.safePaperUrl('/uploads/pdf-v2-325e1fe51962a2b867435115.pdf?asset=20260906'),'/.netlify/functions/admin-asset?key=pdf-v2-325e1fe51962a2b867435115.pdf');
  assert.equal(seo.safePaperUrl('/resources/../admin'), '');
});
test('sitemap includes only absolute canonical pages backed by questions',()=>{
  const xml=seo.sitemap(resources,bank),urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
  assert.equal(urls.length,15);assert.equal(new Set(urls).size,urls.length);
  assert.ok(urls.every(u=>u.startsWith(seo.origin()+'/')&&!/[?#]/.test(u)));
  assert.doesNotMatch(xml,/\/admin|\/api\/|<lastmod>|<priority>/);
  for(const subject of seo.catalogue(resources,bank))assert.ok(urls.includes(seo.origin()+seo.subjectPath(subject.id)));
});
test('public search pages never expose private drafts and return appropriate HTTP responses',async()=>{
  const draft=clone(resources);draft.unitCollections.find(s=>s.id==='chemistry').name='PRIVATE DRAFT SUBJECT';
  await require('../netlify/lib/admin-drafts').saveMergedDraft('resources',draft,'test-main-admin');
  const response=await handler({httpMethod:'GET',queryStringParameters:{subject:'chemistry'}});
  assert.equal(response.statusCode,200);assert.doesNotMatch(response.body,/PRIVATE DRAFT SUBJECT/);
  assert.match(response.headers['Netlify-CDN-Cache-Control'],/max-age=600/);
  assert.equal((await handler({httpMethod:'HEAD'})).body,'');
  assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
  assert.equal((await handler({httpMethod:'GET',queryStringParameters:{subject:'../../admin'}})).statusCode,404);
  assert.equal((await handler({httpMethod:'GET',queryStringParameters:{subject:'not-a-subject'}})).statusCode,404);
});
test('local HTTP routes serve text robots, XML sitemap and HTML subject pages',async()=>{
  const app=require('../server');const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const robots=await fetch(base+'/robots.txt');assert.match(robots.headers.get('content-type'),/text\/plain/);assert.match(await robots.text(),/Sitemap: https:\/\/helpdeskhbtu.netlify.app\/sitemap.xml/);
    const map=await fetch(base+'/sitemap.xml');assert.match(map.headers.get('content-type'),/application\/xml/);assert.match(await map.text(),/<urlset/);
    const page=await fetch(base+'/hbtu-pyqs/bee/');assert.equal(page.status,200);assert.match(await page.text(),/Basic Electrical Engineering/);
    assert.equal((await fetch(base+'/hbtu-pyqs/not-a-subject/')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Netlify rewrites work without injected query parameters',async()=>{
  const sitemapHandler=require('../netlify/functions/search-sitemap').handler;
  for(const event of [
    {path:'/sitemap.xml'},
    {path:'/.netlify/functions/search-pages',rawUrl:'https://helpdeskhbtu.netlify.app/sitemap.xml'},
  ]){
    const result=await handler({httpMethod:'GET',...event});
    assert.match(result.headers['Content-Type'],/application\/xml/);assert.match(result.body,/<urlset/);
  }
  const direct=await sitemapHandler({httpMethod:'GET',path:'/.netlify/functions/search-sitemap'});
  assert.match(direct.headers['Content-Type'],/application\/xml/);
  for(const event of [
    {path:'/hbtu-pyqs/chemistry/'},
    {path:'/.netlify/functions/search-pages/chemistry/'},
    {path:'/.netlify/functions/search-pages',rawUrl:'https://helpdeskhbtu.netlify.app/hbtu-pyqs/chemistry/'},
  ]){
    const result=await handler({httpMethod:'GET',...event});
    assert.equal(result.statusCode,200);assert.match(result.body,/<h1>HBTU Engineering Chemistry PYQs<\/h1>/);
  }
  assert.equal((await handler({httpMethod:'GET',path:'/hbtu-pyqs/no-such-subject/'})).statusCode,404);
});
test('production origin and Search Console token are configurable and validated',()=>{
  const oldUrl=process.env.HELPDESK_PUBLIC_URL,oldToken=process.env.GOOGLE_SITE_VERIFICATION;
  try{
    process.env.HELPDESK_PUBLIC_URL='https://helpdesk.example';process.env.GOOGLE_SITE_VERIFICATION='example-token-12345';
    assert.match(seo.homeMetadata(),/google-site-verification/);assert.match(seo.sitemap(resources,bank),/https:\/\/helpdesk.example\/hbtu-pyqs\//);
    process.env.GOOGLE_SITE_VERIFICATION='<script>';assert.throws(()=>seo.homeMetadata(),/verification token/);
    process.env.HELPDESK_PUBLIC_URL='http://example.com';assert.throws(()=>seo.origin(),/HTTPS origin/);
  }finally{
    if(oldUrl===undefined)delete process.env.HELPDESK_PUBLIC_URL;else process.env.HELPDESK_PUBLIC_URL=oldUrl;
    if(oldToken===undefined)delete process.env.GOOGLE_SITE_VERIFICATION;else process.env.GOOGLE_SITE_VERIFICATION=oldToken;
  }
});
