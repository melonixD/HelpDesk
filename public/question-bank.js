(function () {
  "use strict";
  const dialog = document.getElementById("bank-dialog");
  const form = document.getElementById("bank-filters");
  const results = document.getElementById("bank-results");
  const count = document.getElementById("bank-count");
  const more = document.getElementById("bank-more");
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const unknown = v => v === "unknown" || v === null ? "Not recorded" : v;
  const labelExam = v => ({"mid-sem":"Mid-sem","mid-sem-1":"Mid-sem 1","mid-sem-2":"Mid-sem 2","end-sem":"End-sem"}[v] || unknown(v));
  let resources, controller, requestId = 0, fallback, searchTimer;
  let filter = {branch:"all",semester:"all",subject:"all",unit:"all",chapter:"all",year:"all",exam:"all",marks:"all",q:"",status:"all"};
  let items = [], total = 0, hasMore = false, index = 0, view = "browse", seed = "", returnFocus, advancedOpen=false;
  let rendererPromise,mermaidPromise;
  function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error("Reader asset unavailable"));};document.head.appendChild(script);});}
  function ensureRenderer(){
    if(!rendererPromise){const css=document.createElement("link");css.rel="stylesheet";css.href="/vendor/katex.css?v=20261014";document.head.appendChild(css);
      rendererPromise=Promise.all([loadScript("/vendor/marked.js?v=20261014"),loadScript("/vendor/purify.js?v=20261014"),loadScript("/vendor/katex.js?v=20261014")]).then(()=>loadScript("/vendor/math-render.js?v=20261014")).catch(()=>{rendererPromise=null;});}
    return rendererPromise;
  }
  function richText(value) {
    const math=[];
    const protectedText=String(value||"").replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)/g,text=>{math.push(text);return "HDMATHPLACEHOLDER"+(math.length-1)+"END";});
    if(!window.marked||!window.DOMPurify)return esc(value);
    const html=DOMPurify.sanitize(marked.parse(protectedText,{breaks:true}),{FORBID_TAGS:["img","iframe","svg","math","form","input","style"],FORBID_ATTR:["style"],ALLOW_DATA_ATTR:false});
    return html.replace(/HDMATHPLACEHOLDER(\d+)END/g,(_,index)=>esc(math[Number(index)]||""));
  }
  function renderMath() {
    results.querySelectorAll(".bank-rich").forEach(node=>{
      if(window.renderMathInElement)renderMathInElement(node,{delimiters:[{left:"$$",right:"$$",display:true},{left:"\\[",right:"\\]",display:true},{left:"$",right:"$",display:false},{left:"\\(",right:"\\)",display:false}],throwOnError:false,trust:false,maxExpand:2000});
      node.querySelectorAll("a").forEach(a=>{a.target="_blank";a.rel="noopener noreferrer";});
    });
    renderDiagrams();
  }
  let diagramCounter=0;
  async function renderDiagrams() {
    if(!results.querySelector("pre code.language-mermaid"))return;
    if(!window.mermaid){try{mermaidPromise ||= loadScript("/vendor/mermaid.js?v=20261014");await mermaidPromise;}catch{mermaidPromise=null;return;}}
    mermaid.initialize({startOnLoad:false,securityLevel:"strict",suppressErrorRendering:true,theme:document.documentElement.dataset.theme==="dark"?"dark":"neutral",flowchart:{htmlLabels:false}});
    results.querySelectorAll("pre code.language-mermaid").forEach(async code=>{
      if(code.dataset.rendering)return;code.dataset.rendering="yes";
      const parent=code.closest("pre"),text=code.textContent;if(text.length>12000)return;
      try{const value=await mermaid.render("hd-diagram-"+(++diagramCounter),text);if(!parent.isConnected)return;const box=document.createElement("div");box.className="bank-diagram";box.innerHTML=DOMPurify.sanitize(value.svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:["foreignObject","script","image"]});parent.replaceWith(box);}catch{code.dataset.rendering="failed";}
    });
  }
  const getSet = key => {try { const v=JSON.parse(localStorage.getItem(key)||"[]");return new Set(Array.isArray(v)?v.filter(x=>typeof x==="string").slice(0,10000):[]); } catch{return new Set();}};
  const saved = getSet("helpdesk-bank-saved"), completed = getSet("helpdesk-bank-completed");
  function persist() {try{localStorage.setItem("helpdesk-bank-saved",JSON.stringify([...saved]));localStorage.setItem("helpdesk-bank-completed",JSON.stringify([...completed]));}catch{count.textContent="Your browser could not save progress; it is kept for this session only.";}}
  function subjects() {
    const ids = new Set(resources.branches.filter(b=>filter.branch==="all"||b.id===filter.branch).flatMap(b=>b.semesters.filter(s=>filter.semester==="all"||s.id===filter.semester).flatMap(s=>s.subjectIds)));
    return resources.unitCollections.filter(s=>ids.has(s.id));
  }
  function option(v,title,current) {return `<option value="${esc(v)}" ${String(v)===String(current)?"selected":""}>${esc(title)}</option>`;}
  function select(name,title,choices) {return `<label>${esc(title)}<select name="${name}">${option("all","All",filter[name])}${choices.map(([v,t])=>option(v,t,filter[name])).join("")}</select></label>`;}
  function renderFilters(facets={}) {
    const semesters = new Map(resources.branches.filter(b=>filter.branch==="all"||b.id===filter.branch).flatMap(b=>b.semesters).map(s=>[s.id,s.name]));
    const subject = resources.unitCollections.find(s=>s.id===filter.subject);
    const active=["year","exam","marks"].filter(k=>filter[k]!=="all").length;
    form.innerHTML = '<div class="bank-primary-filters">'+select("branch","1 · Branch",resources.branches.map(b=>[b.id,b.name])) + select("semester","Semester",[...semesters])
      + select("subject","2 · Subject",subjects().map(s=>[s.id,s.name])) + select("unit","3 · Unit",(subject?.units||[]).map(u=>[String(u.number),(u.kind==="lab"?"Lab":"Unit "+u.number)+" · "+u.title]))
      + select("chapter","Chapter / topic",(facets.chapters||[]).map(v=>[v,v])) + select("status","My revision",[["saved","Saved questions"],["completed","Completed questions"]])+'</div>'
      + `<label class="bank-search">Search a question<input name="q" type="search" maxlength="200" value="${esc(filter.q)}" placeholder="Search a concept or question…"></label>`
      + `<details class="bank-advanced" ${advancedOpen?"open":""}><summary>Filters${active?" · "+active+" active":""}<span aria-hidden="true">⌄</span></summary><div class="bank-advanced-grid">`+select("year","Academic year",(facets.years||[]).map(v=>[v,v])) + select("exam","Examination",(facets.exams||[]).map(v=>[v,labelExam(v)]))
      + select("marks","Marks",(facets.marks||[]).map(v=>[v,v+" marks"]))+'</div></details><button class="bank-reset" type="reset">Clear filters</button>';
  }
  function params(offset=0) {
    const p = new URLSearchParams({...filter,offset:String(offset),limit:view==="session"?"50":"20"});
    if(view==="session"){p.set("sort","shuffle");p.set("seed",seed);}
    return p;
  }
  async function fetchPage(offset,signal) {
    const p=params(offset);
    try {
      const revision=filter.status!=="all";
      const response=await fetch(revision?"/api/practice/questions":"/api/practice/questions?"+p,revision?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(p),ids:[...(filter.status==="saved"?saved:completed)]}),cache:"no-store",signal}:{cache:"no-store",signal});
      if(!response.ok)throw new Error("Question API unavailable");
      const data=await response.json();if(!Array.isArray(data.questions))throw new Error("Incomplete response");return data;
    } catch(error) {
      if(error.name==="AbortError")throw error;
      if(!fallback){const response=await fetch("/practice.json",{signal,cache:"no-store"});if(!response.ok)throw error;fallback=HelpDeskBankModel.validate(await response.json());}
      let qs=HelpDeskBankModel.select(fallback,resources,filter);
      if(filter.status!=="all"){const set=filter.status==="saved"?saved:completed;qs=qs.filter(q=>set.has(q.id));}
      if(view==="session") {const score=q=>{let n=0;for(const c of seed+q.id)n=(n*31+c.charCodeAt(0))>>>0;return n;};qs=qs.slice().sort((a,b)=>score(a)-score(b));}
      const facetItems=HelpDeskBankModel.select(fallback,resources,{branch:filter.branch,semester:filter.semester,subject:filter.subject,unit:filter.unit});
      const facets={};for(const [key,field] of [["chapters","chapter"],["years","year"],["exams","exam"],["marks","marks"],["difficulties"]]) facets[key]=[...new Set(facetItems.flatMap(q=>field==="chapter"?(q.topics||[{chapter:q.chapter}]).map(t=>t.chapter):[q[field]]).filter(v=>v!==null&&v!=="unknown"))];
      return {questions:qs.slice(offset,offset+Number(p.get("limit"))),total:qs.length,hasMore:offset+Number(p.get("limit"))<qs.length,facets,fallback:true};
    }
  }
  async function load(append=false,keepSearchFocus=false) {
    controller?.abort();controller=new AbortController();const id=++requestId;
    const offset=append?items.length:0;
    if(!append){items=[];index=0;results.innerHTML='<p class="bank-loading">Finding your questions…</p>';}
    more.disabled=true;
    try {
      const data=await fetchPage(offset,controller.signal);if(id!==requestId||!dialog.open)return;
      items=append?[...items,...data.questions]:data.questions;total=data.total;hasMore=data.hasMore;
      if(!append){renderFilters(data.facets);if(keepSearchFocus){const input=form.elements.q;input.focus();input.setSelectionRange(input.value.length,input.value.length);}}
      count.textContent=`${total} matching question${total===1?"":"s"}${data.fallback?" · bundled offline fallback":""}`;
      renderQuestions();
    } catch(error){if(error.name!=="AbortError"&&id===requestId){results.innerHTML='<div class="bank-empty"><h3>Could not load questions</h3><p>Check your connection and try again.</p><button type="button" class="secondary-button" data-bank-retry>Try again</button></div>';more.hidden=true;}}
    finally{if(id===requestId)more.disabled=false;}
  }
  function questionCard(q) {
    const subject=resources.unitCollections.find(s=>s.id===q.subjectId);
    const source=HelpDeskBankModel.sourceDetails(q);
    const badges=[q.academicYear||(q.year?String(q.year):"Year not recorded"),q.exam!=="unknown"?labelExam(q.exam):"Exam not recorded",q.marks!==null?q.marks+" marks":""];
    return `<article class="bank-question"><div class="bank-question-top"><div class="bank-question-meta">${badges.filter(Boolean).map(v=>`<span class="bank-badge">${esc(v)}</span>`).join("")}</div><button type="button" class="bank-save" data-save="${esc(q.id)}" aria-pressed="${saved.has(q.id)}">${saved.has(q.id)?"★ Saved":"☆ Save"}</button></div>
      <h3>${esc(subject?.name||q.subjectId)} · ${esc(q.chapter)}</h3><div class="bank-question-text bank-rich">${richText(q.question)}</div>
      ${q.imageUrl?`<a class="bank-figure" href="${esc(q.imageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(q.imageUrl)}" alt="Attached figure for this question" loading="lazy"><span>Open figure ↗</span></a>`:""}
      ${q.figureUnavailable?'<p class="bank-figure-missing">The original source references a figure, but its file is unavailable. Please check the source paper.</p>':""}
      <div class="bank-question-actions"><button type="button" class="bank-save" data-complete="${esc(q.id)}" aria-pressed="${completed.has(q.id)}">${completed.has(q.id)?"✓ Completed":"Mark completed"}</button><button type="button" class="bank-copy" data-copy="${esc(q.id)}">Copy question</button><button type="button" class="bank-copy" data-report="${esc(q.id)}">Report issue</button></div>
      <details data-answer-id="${esc(q.id)}"><summary>Show answer / solution</summary><div data-answer-slot>${q.answerUrl&&!q.answer?'<p class="bank-answer-note">Open to load the solution.</p>':answerHtml(q)}</div><p class="bank-answer-note">Imported solutions are source-provided and may contain errors. Verify calculations with your notes.</p></details>
      <small class="bank-question-source">${esc(source.title)}${source.url?` · <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">View source ↗</a>`:""}</small></article>`;
  }
  function answerHtml(q) {
    return `<div class="bank-answer bank-rich">${richText(q.answer||"No solution is available in the imported source yet. Check the source paper and your course notes.")}</div>${q.proTip?`<aside class="bank-pro-tip"><strong>Quick tip</strong><div class="bank-rich">${richText(q.proTip)}</div></aside>`:""}${q.videoLinks?.length?`<div class="bank-video-links"><p>Learn visually</p>${q.videoLinks.map(v=>`<a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.title)} ↗</a>`).join("")}</div>`:""}`;
  }
  results.addEventListener("toggle",async event=>{
    const details=event.target;if(!details.open||!details.dataset?.answerId||details.dataset.loaded)return;
    const q=items.find(item=>item.id===details.dataset.answerId);if(!q?.answerUrl||q.answer)return;
    const slot=details.querySelector("[data-answer-slot]");details.dataset.loaded="loading";slot.innerHTML='<p class="bank-answer-note">Loading solution…</p>';
    try{const response=await fetch(q.answerUrl);if(!response.ok)throw new Error("Missing solution");const answer=await response.json();if(typeof answer.answer!=="string")throw new Error("Invalid solution");HelpDeskBankModel.validate({schemaVersion:1,questions:[{...q,...answer}]});Object.assign(q,answer);slot.innerHTML=answerHtml(q);details.dataset.loaded="yes";renderMath();}
    catch{delete details.dataset.loaded;slot.innerHTML='<p class="bank-answer-note">This solution could not load. Close and reopen to retry.</p>';}
  },true);
  function renderQuestions() {
    document.querySelectorAll("[data-bank-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.bankView===view)));
    if(!items.length){results.innerHTML='<div class="bank-empty"><h3>No questions match yet</h3><p>Try another chapter or clear a filter. Administrators can add and publish questions from the Practice question bank.</p></div>';more.hidden=true;return;}
    results.innerHTML=view==="browse"?items.map(questionCard).join(""):questionCard(items[index])+`<div class="bank-session-bar"><button class="secondary-button" type="button" data-session-prev ${index===0?"disabled":""}>← Previous</button><p>Question ${index+1} of ${total}</p><button class="primary-button" type="button" data-session-next ${index+1>=total?"disabled":""}>Next question →</button></div>`;
    more.hidden=view!=="browse"||!hasMore;
    renderMath();
  }
  async function open(subjectId,unitNumber) {
    returnFocus=document.activeElement;dialog.showModal();results.innerHTML='<p class="bank-loading">Opening your study space…</p>';form.innerHTML="";
    try {
      [resources]=await Promise.all([ensureResourceData(),ensureRenderer()]);try{const response=await fetch("/api/practice/questions?catalog=1",{cache:"no-store"});if(!response.ok)throw new Error("Catalogue unavailable");const data=await response.json();if(!Array.isArray(data.catalog?.branches)||!Array.isArray(data.catalog?.unitCollections))throw new Error("Invalid catalogue");resources={...resources,...data.catalog};}catch{const response=await fetch("/practice.json",{cache:"no-store"});if(response.ok){fallback=HelpDeskBankModel.validate(await response.json());resources=HelpDeskBankModel.practiceResources(fallback,resources);}}if(!dialog.open)return;filter={branch:state.branch||"all",semester:state.semester||"all",subject:subjectId||"all",unit:unitNumber||"all",chapter:"all",year:"all",exam:"all",marks:"all",q:"",status:"all"};
      view=subjectId?"session":"browse";seed=String(Date.now());fallback=null;renderFilters();await load();
    }catch{results.innerHTML='<div class="bank-empty"><h3>The library could not load</h3><p>Close this panel and refresh the page.</p></div>';}
  }
  document.addEventListener("click",event=>{
    const generic=event.target.closest("[data-bank-open]"),chapter=event.target.closest("[data-bank-subject]");
    if(generic||chapter){event.preventDefault();if(!dialog.open)open(chapter?.dataset.bankSubject,chapter?.dataset.bankUnit);}
  });
  document.getElementById("bank-close").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("close",()=>{controller?.abort();clearTimeout(searchTimer);returnFocus?.focus();});
  form.addEventListener("submit",e=>e.preventDefault());
  form.addEventListener("toggle",event=>{if(event.target.classList?.contains("bank-advanced"))advancedOpen=event.target.open;},true);
  form.addEventListener("reset",e=>{e.preventDefault();filter={branch:"all",semester:"all",subject:"all",unit:"all",chapter:"all",year:"all",exam:"all",marks:"all",q:"",status:"all"};seed=String(Date.now());load();});
  form.addEventListener("change",event=>{const key=event.target.name;if(!key||key==="q")return;clearTimeout(searchTimer);filter[key]=event.target.value;
    if(key==="branch"||key==="semester") {filter.subject="all";filter.unit="all";}
    if(key==="subject")filter.unit="all";
    if(["branch","semester","subject","unit"].includes(key))for(const k of ["chapter","year","exam","marks"])filter[k]="all";
    load();});
  form.addEventListener("input",event=>{if(event.target.name!=="q")return;filter.q=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(false,true),300);});
  document.querySelectorAll("[data-bank-view]").forEach(button=>button.addEventListener("click",()=>{view=button.dataset.bankView;seed=String(Date.now());load();}));
  more.addEventListener("click",()=>load(true));
  window.addEventListener("focus",()=>{if(dialog.open&&resources){fallback=null;load();}});
  results.addEventListener("click",async event=>{
    const save=event.target.closest("[data-save]"),done=event.target.closest("[data-complete]");
    if(save||done){const button=save||done,key=save?button.dataset.save:button.dataset.complete,set=save?saved:completed;set.has(key)?set.delete(key):set.add(key);button.setAttribute("aria-pressed",String(set.has(key)));button.textContent=save?(set.has(key)?"★ Saved":"☆ Save"):(set.has(key)?"✓ Completed":"Mark completed");persist();if(filter.status!=="all")load();}
    if(event.target.closest("[data-bank-retry]"))load();
    const copy=event.target.closest("[data-copy]");if(copy){try{await navigator.clipboard.writeText(items.find(q=>q.id===copy.dataset.copy).question);copy.textContent="Copied ✓";}catch{copy.textContent="Select question text to copy";}}
    const report=event.target.closest("[data-report]");if(report){
      const message=prompt("What is wrong with this question or answer? (Sent to HelpDesk admins)");if(message?.trim()){report.disabled=true;try{const response=await fetch("/api/practice/report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({questionId:report.dataset.report,message:message.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Report failed");report.textContent="Report sent ✓";}catch(error){report.textContent=error.message;report.disabled=false;}}
    }
    if(event.target.closest("[data-session-prev]")&&index>0){index--;renderQuestions();}
    const next=event.target.closest("[data-session-next]");
    if(next&&index+1<total){next.disabled=true;const nextIndex=index+1;if(nextIndex>=items.length){await load(true);if(nextIndex>=items.length)return;}index=nextIndex;renderQuestions();}
  });
})();
