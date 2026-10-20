const { practiceResources, select } = require('../../public/question-bank-model');
const { assetUrl } = require('../../public/asset-url');
const DEFAULT_ORIGIN = 'https://helpdeskhbtu.netlify.app';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function origin() {
  const url = new URL(process.env.HELPDESK_PUBLIC_URL || DEFAULT_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('HELPDESK_PUBLIC_URL must be an HTTPS origin without a path.');
  return url.origin;
}
function jsonLd(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function metadata(title, description, pathname, extra = []) {
  const base = origin(), url = base + pathname;
  const entities = [
    {'@type':'WebSite','@id':base+'/#website',name:'HelpDesk',url:base+'/',description:'An independent student resource hub for HBTU Kanpur.'},
    {'@type':pathname === '/' ? 'WebPage' : 'CollectionPage','@id':url+'#page',name:title,url,description,isPartOf:{'@id':base+'/#website'}},
    ...extra,
  ];
  return `<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:site_name" content="HelpDesk"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><script type="application/ld+json">${jsonLd({'@context':'https://schema.org','@graph':entities})}</script>`;
}
function homeMetadata() {
  // Public ownership tag supplied by Google Search Console for HelpDesk.
  const verification = String(process.env.GOOGLE_SITE_VERIFICATION || '-pszZt7niioXlGNfayrgDKIYV2e-fN85h68rdSoTAls').trim();
  if (verification && !/^[a-zA-Z0-9_-]{10,250}$/.test(verification)) throw new Error('Use only the Google verification token, not the entire meta tag.');
  return metadata('HBTU PYQs, Notes & Lectures | HelpDesk','Find HBTU previous-year questions, first-year notes, lectures and syllabi. Browse Engineering and Technology subjects or revise with HelpDesk Practice Mode.','/')
    + (verification ? `<meta name="google-site-verification" content="${esc(verification)}">` : '');
}
function catalogue(resources, bank) {
  const publicQuestions = select(bank, resources, {});
  const collections = practiceResources(bank, resources).unitCollections;
  return collections.map(subject => ({...subject,questions:publicQuestions.filter(q => q.subjectId === subject.id)}))
    .filter(subject => subject.questions.length).sort((a,b) => a.name.localeCompare(b.name));
}
function subjectPath(id) { return '/hbtu-pyqs/' + encodeURIComponent(id) + '/'; }
function sitemap(resources, bank) {
  const urls = ['/', '/hbtu-pyqs/', ...catalogue(resources,bank).map(s => subjectPath(s.id))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(p => `<url><loc>${esc(origin()+p)}</loc></url>`).join('\n')+'\n</urlset>\n';
}
function safePaperUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.trim();
  if (text.startsWith('/') && !text.startsWith('//') && !text.includes('\\')) {
    try {
      const u = new URL(text,origin()), decoded = decodeURIComponent(u.pathname);
      return /^\/(resources|uploads)\//.test(decoded) && !decoded.split('/').includes('..') ? assetUrl(u.pathname+u.search+u.hash,origin()) : '';
    } catch { return ''; }
  }
  try { const u = new URL(text); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function papers(subject) {
  const found = [];
  for (const unit of subject.units || []) {
    const url = safePaperUrl(unit.pyqUrl);
    if (url) found.push({title:`${unit.kind === 'lab' ? 'Lab' : 'Unit '+unit.number} · ${unit.title}`,url});
  }
  for (const year of subject.yearWisePyqs || []) {
    for (const [field,label] of [['midSem1Url','Mid-sem 1'],['midSem2Url','Mid-sem 2'],['endSemUrl','End-sem']]) {
      if (Array.isArray(year.enabledPapers) && !year.enabledPapers.includes(field)) continue;
      const url = safePaperUrl(year[field]);
      if (url) found.push({title:`${year.year} · ${label}`,url});
    }
  }
  return found;
}
function excerpt(question) {
  const text = question.slice(0,2200), re = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)/g;
  let output = '', cursor = 0;
  for (const match of text.matchAll(re)) {
    output += esc(text.slice(cursor,match.index));
    const block = match[0].startsWith('$$') || match[0].startsWith('\\['), edge = block || match[0].startsWith('\\(') ? 2 : 1;
    try { output += require('katex').renderToString(match[0].slice(edge,-edge),{displayMode:block,throwOnError:false,trust:false,maxExpand:1000,maxSize:20}); } catch { output += esc(match[0]); }
    cursor = match.index + match[0].length;
  }
  return output + esc(text.slice(cursor)) + (question.length > text.length ? '…' : '');
}
function render(resources,bank,id) {
  const subjects = catalogue(resources,bank), subject = id ? subjects.find(s => s.id === id) : null;
  if (id && !subject) return null;
  const base = origin(), pathname = subject ? subjectPath(subject.id) : '/hbtu-pyqs/';
  const title = subject ? `HBTU ${subject.name} PYQs | HelpDesk` : 'HBTU PYQs — First-Year Previous-Year Questions | HelpDesk';
  const description = subject ? `Revise HBTU ${subject.name} with ${subject.questions.length} previous-year questions. Browse topics, available papers and practice solutions on HelpDesk.` : 'Browse HBTU first-year previous-year questions by subject. Find available unit-wise papers and use chapter-based Practice Mode for Engineering and Technology courses.';
  const crumbs = {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'HelpDesk',item:base+'/'},{'@type':'ListItem',position:2,name:'HBTU PYQs',item:base+'/hbtu-pyqs/'},...(subject?[{'@type':'ListItem',position:3,name:subject.name,item:base+pathname}]:[])]};
  const practiceUrl = subject ? '/?practice='+encodeURIComponent(subject.id)+'#practice-mode' : '/?practice=all#practice-mode';
  let content;
  if (!subject) {
    content = `<p class="seo-lead">Previous-year questions for first-year students at Harcourt Butler Technical University, Kanpur. Choose a subject to find available papers and start revising by unit or topic.</p><div class="seo-actions"><a class="seo-button" href="${practiceUrl}">Start Practice Mode</a><a href="/#resources">Open the resource library →</a></div><section aria-labelledby="subject-heading"><h2 id="subject-heading">Choose your subject</h2><div class="seo-grid">${subjects.map(s => `<a class="seo-card" href="${subjectPath(s.id)}"><h3>${esc(s.name)}</h3><p>${s.questions.length} practice questions</p><span>Browse questions & papers →</span></a>`).join('')}</div></section><section class="seo-guide"><h2>How to use these PYQs</h2><ol><li>Match your subject and unit with your current syllabus.</li><li>Open an available paper, or filter questions by topic, exam and year in Practice Mode.</li><li>Attempt each question before opening its solution. Save questions you want to revise again.</li></ol><p>Engineering and Technology courses can place shared subjects in different semesters. Choose your branch and semester in the main library to check the right combination.</p></section>`;
  } else {
    const links = papers(subject), topics = [...new Set(subject.questions.flatMap(q => (q.topics || [{chapter:q.chapter}]).map(t => t.chapter)))];
    const chosen = [], units = new Set();
    for (const q of subject.questions) if (!units.has(q.unitNumber)) {chosen.push(q);units.add(q.unitNumber);}
    for (const q of subject.questions) if (chosen.length < 8 && !chosen.some(item => item.id === q.id)) chosen.push(q);
    content = `<p class="seo-lead">${subject.questions.length} previous-year questions for ${esc(subject.name)}. Use Practice Mode to filter by unit, topic, academic year or examination and open the available solutions.</p><div class="seo-actions"><a class="seo-button" href="${practiceUrl}">Practise ${esc(subject.name)}</a><a href="/#resources">Find notes & lectures →</a></div><section><h2>Available question papers</h2>${links.length?`<ul class="seo-papers">${links.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`:'<p>Full-paper links have not been added for this subject yet. Individual practice questions are available below and in Practice Mode.</p>'}</section><section><h2>Topics in the question bank</h2><ul class="seo-topics">${topics.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section><section><h2>Sample previous-year questions</h2>${chosen.slice(0,8).map(q => `<article class="seo-question"><p class="seo-label">${esc(q.academicYear || q.year || 'Year not recorded')} · ${esc(q.exam === 'unknown' ? 'Exam not recorded' : q.exam.replaceAll('-',' '))}${q.marks !== null ? ' · '+esc(q.marks)+' marks':''}</p><h3>${esc(q.chapter)}</h3><div class="seo-question-text">${excerpt(q.question)}</div><a href="${practiceUrl}">Open the full question bank and solutions →</a></article>`).join('')}</section><p class="seo-note">Imported solutions may contain errors. Check calculations against your notes and official syllabus.</p><nav aria-label="Other PYQ subjects" class="seo-other">${subjects.filter(s => s.id !== subject.id).map(s => `<a href="${subjectPath(s.id)}">${esc(s.name)}</a>`).join('')}</nav>`;
  }
  return `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metadata(title,description,pathname,[crumbs])}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/premium.css?v=20261020-seo"><link rel="stylesheet" href="/search-pages.css?v=20261020"><link rel="stylesheet" href="/vendor/katex.css?v=20261014"><script src="/search-pages.js?v=20261020" defer></script></head><body><a class="skip-link" href="#main">Skip to questions</a><header class="seo-header seo-shell"><a class="seo-brand" href="/">H <span>HelpDesk</span></a><nav aria-label="Primary"><a href="/hbtu-pyqs/">PYQs</a><a href="/#resources">Library</a><button id="seo-theme" type="button" aria-label="Switch colour theme">◐</button></nav></header><main id="main" class="seo-shell"><nav class="seo-breadcrumb" aria-label="Breadcrumb"><a href="/">HelpDesk</a> / <a href="/hbtu-pyqs/">HBTU PYQs</a>${subject?' / '+esc(subject.name):''}</nav><p class="seo-overline">HBTU KANPUR · STUDENT RESOURCES</p><h1>${subject?'HBTU '+esc(subject.name)+' PYQs':'HBTU PYQs'}</h1>${content}</main><footer class="seo-shell seo-footer"><p>HelpDesk is an independent student project, not an official HBTU website.</p><a href="/#help">Contact the HelpDesk team</a></footer></body></html>`;
}
module.exports = { origin, metadata, homeMetadata, catalogue, subjectPath, sitemap, render, safePaperUrl };
