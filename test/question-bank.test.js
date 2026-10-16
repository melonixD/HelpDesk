const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const model = require("../public/question-bank-model");
const resources = require("../data/resources.json");
const bundled = require("../data/practice.json");
const sample=bundled.questions.find(q=>q.subjectId==="chemistry"&&q.unitNumber==="1");
const clone = value => JSON.parse(JSON.stringify(value));
const sandbox = path.join(os.tmpdir(),"helpdesk-bank-test-"+crypto.randomUUID());
process.env.HELPDESK_LOCAL_STORAGE="true";
process.env.ADMIN_DRAFT_PATH=path.join(sandbox,"drafts.json");
process.env.PUBLISHED_CONTENT_PATH=path.join(sandbox,"published.json");
process.env.ADMIN_STATE_PATH=path.join(sandbox,"state.json");

test.after(async()=>{await Promise.all([fs.unlink(process.env.ADMIN_DRAFT_PATH).catch(()=>{}),fs.unlink(process.env.PUBLISHED_CONTENT_PATH).catch(()=>{}),fs.unlink(process.env.ADMIN_STATE_PATH).catch(()=>{})]);await fs.rmdir(sandbox).catch(()=>{});});

test("all authorized first-year questions preserve academic metadata and local answer references",()=>{
  assert.equal(model.validate(bundled),bundled);assert.equal(bundled.questions.length,821);
  assert.ok(bundled.questions.every(q=>q.answerUrl&&q.sourceQuestionId&&q.academicYear));
});
test("difficulty-free questions remain compatible with existing published metadata",()=>{
  const q=clone(sample);delete q.difficulty;
  assert.equal(model.validate({schemaVersion:1,questions:[q]}).questions[0],q);
  const legacy={...q,difficulty:"hard"};
  assert.equal(model.select({schemaVersion:1,questions:[legacy]},resources,{subject:q.subjectId,difficulty:"easy"}).length,1);
});
test("legacy imported sources use neutral display labels without mutating records",()=>{
  const q={sourceTitle:"Backpaper collection",sourceUrl:"https://www.backpaper.in/"};
  assert.deepEqual(model.sourceDetails(q),{title:"Previous-year question paper",url:""});
  assert.equal(q.sourceTitle,"Backpaper collection");
  assert.deepEqual(model.sourceDetails({sourceTitle:"University paper",sourceUrl:"https://example.org/paper.pdf"}),{title:"University paper",url:"https://example.org/paper.pdf"});
});
test("branch and semester mapping separates the engineering and technology cohorts",()=>{
  assert.ok(model.select(bundled,resources,{branch:"food-technology",semester:"semester-1",subject:"chemistry"}).length>0);
  assert.equal(model.select(bundled,resources,{branch:"civil",semester:"semester-1",subject:"chemistry"}).length,0);
  assert.ok(model.select(bundled,resources,{branch:"civil",semester:"semester-2",subject:"chemistry"}).length>0);
  assert.equal(model.select(bundled,resources,{branch:"not-a-branch"}).length,0);
});
test("unit, topic, keyword, exam and branch restrictions are exact",()=>{
  const q=clone(sample);q.question="AXE example question";q.unitNumbers=["1"];q.unitNumber="1";q.year=2025;q.exam="mid-sem-2";q.marks=5;q.difficulty="medium";q.branchIds=["food-technology"];
  const bank={schemaVersion:1,questions:[q]};model.validate(bank);
  assert.equal(model.select(bank,resources,{branch:"civil",semester:"semester-2"}).length,0);
  assert.equal(model.select(bank,resources,{branch:"food-technology",semester:"semester-1",unit:"1",year:"2025",exam:"mid-sem-2",marks:"5",difficulty:"medium",q:"AXE"}).length,1);
  assert.equal(model.select(bank,resources,{unit:"2"}).length,0);
});
test("imports skip duplicate text without replacing reviewed content",()=>{
  const q=clone(bundled.questions[0]);const current={schemaVersion:1,questions:[q]};
  const duplicate={...q,id:"new-id",question:"  "+q.question+"  ",answer:"Different solution"};
  const result=model.mergeImport(current,{schemaVersion:1,questions:[duplicate]});assert.equal(result.skipped,1);assert.equal(result.bank.questions[0].answer,"");
  assert.throws(()=>model.mergeImport(current,{schemaVersion:1,questions:[{...q,question:"Different question"}]}),/ID conflict/);
  const anotherYear={...q,id:"another-year",year:1999,exam:"end-sem"};
  assert.equal(model.mergeImport(current,{schemaVersion:1,questions:[anotherYear]}).added,1);
});
test("unsafe source URLs, duplicate IDs and invalid metadata are rejected",()=>{
  const q=clone(bundled.questions[0]);const input=q=>({schemaVersion:1,questions:[q]});
  assert.throws(()=>model.validate(input({...q,sourceUrl:"javascript:alert(1)"})),/HTTPS/);
  assert.throws(()=>model.validate(input({...q,marks:-1})),/marks/);
  assert.throws(()=>model.validate(input({...q,exam:"made-up"})),/exam/);
  assert.throws(()=>model.validate({schemaVersion:1,questions:[q,q]}),/unique/);
});
test("question API paginates, filters and shuffles predictably",async()=>{
  const {handler}=require("../netlify/functions/practice-questions");
  const query={branch:"food-technology",semester:"semester-1",subject:"chemistry",unit:"1",limit:"3"};
  const response=await handler({httpMethod:"GET",queryStringParameters:query});assert.equal(response.statusCode,200);
  const first=JSON.parse(response.body);assert.equal(first.questions.length,3);assert.equal(first.hasMore,true);
  const second=JSON.parse((await handler({httpMethod:"GET",queryStringParameters:{...query,offset:"3"}})).body);
  assert.ok(second.questions.every(q=>!first.questions.some(other=>other.id===q.id)));
  const shuffled=async()=>JSON.parse((await handler({httpMethod:"GET",queryStringParameters:{...query,sort:"shuffle",seed:"same"}})).body);
  assert.deepEqual(await shuffled(),await shuffled());
  assert.equal((await handler({httpMethod:"DELETE"})).statusCode,405);
  assert.equal((await handler({httpMethod:"POST",body:"not-json"})).statusCode,400);
  const revision=JSON.parse((await handler({httpMethod:"POST",body:JSON.stringify({...query,ids:[first.questions[0].id]})})).body);assert.equal(revision.total,1);
  const empty=JSON.parse((await handler({httpMethod:"POST",body:JSON.stringify({...query,ids:[]})})).body);assert.equal(empty.total,0);
  const saved=JSON.parse((await handler({httpMethod:"GET",queryStringParameters:{...query,ids:first.questions[0].id}})).body);assert.equal(saved.total,1);
});
test("practice drafts do not affect public results until explicit publish",async()=>{
  const {saveMergedDraft,publishDraft}=require("../netlify/lib/admin-drafts");
  const {handler}=require("../netlify/functions/practice-questions");
  const bank=clone(bundled),q={...bank.questions[0],id:"q-import-test",question:"Distinct authorized test question",year:2026,exam:"end-sem"};bank.questions.push(q);
  const draft=await saveMergedDraft("practice",bank,"test-admin");
  const query={httpMethod:"GET",queryStringParameters:{q:"Distinct authorized test question"}};
  assert.equal(JSON.parse((await handler(query)).body).total,0);
  const result=await publishDraft("practice","test-admin","test",draft.draftId);assert.equal(result.deploying,false);
  assert.equal(JSON.parse((await handler(query)).body).total,1);
});
test("new UI is between library and Help, while AI practice stays separate",async()=>{
  const html=await fs.readFile(path.resolve(__dirname,"../public/index.html"),"utf8");const app=await fs.readFile(path.resolve(__dirname,"../public/app.js"),"utf8");
  assert.ok(html.indexOf('id="practice-mode"')<html.indexOf('id="help"'));
  assert.match(html,/data-bank-open/);assert.match(html,/id="practice-open"/);assert.match(app,/renderChapterPractice/);assert.match(app,/title: "AI Practice"/);
});
test("local HTTP route serves JSON and rejects unauthorized question-bank saves",async()=>{
  const app=require("../server");const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  const base="http://127.0.0.1:"+server.address().port;
  try {
    const get=await fetch(base+"/api/practice/questions?branch=food-technology&semester=semester-1&subject=chemistry&limit=2");
    assert.equal(get.status,200);assert.match(get.headers.get("content-type"),/application\/json/);const data=await get.json();assert.equal(data.questions.length,2);
    const post=await fetch(base+"/api/practice/questions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:[data.questions[0].id]})});assert.equal((await post.json()).total,1);
    const save=await fetch(base+"/api/admin/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target:"practice",data:bundled})});assert.equal(save.status,401);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test("practice-only catalogue extends coverage without modifying the main library",async()=>{
  const before=JSON.stringify(resources);const catalogue=model.practiceResources(bundled,resources);
  assert.ok(catalogue.branches.some(b=>b.id==="cse-ai-ml"));assert.ok(catalogue.unitCollections.some(s=>s.id==="intro-technology"));
  assert.equal(model.select(bundled,resources,{branch:"food-technology",semester:"semester-1",subject:"intro-technology"}).length,126);
  assert.equal(model.select(bundled,resources,{branch:"civil",semester:"semester-1",subject:"intro-technology"}).length,0);
  assert.equal(model.select(bundled,resources,{branch:"civil",semester:"semester-2",subject:"intro-technology"}).length,126);
  assert.equal(JSON.stringify(resources),before);
  const response=await require("../netlify/functions/practice-questions").handler({httpMethod:"GET",queryStringParameters:{catalog:"1"}});assert.equal(response.statusCode,200);assert.ok(JSON.parse(response.body).catalog.branches.some(b=>b.id==="cse-ai-ml"));
});
test("multi-unit source tags are available from each appropriate chapter",()=>{
  const q=bundled.questions.find(q=>q.unitNumbers.length>1);assert.ok(q);
  for(const unit of q.unitNumbers)assert.ok(model.select({schemaVersion:1,questions:[q]},resources,{subject:q.subjectId,unit}).length);
});
test("all answer references and available figures exist as validated local assets",async()=>{
  for(const q of bundled.questions){
    const answer=JSON.parse(await fs.readFile(path.resolve(__dirname,"../public"+q.answerUrl),"utf8"));assert.ok(answer.answer.trim());model.validate({schemaVersion:1,questions:[{...q,...answer}]});
    if(q.imageUrl){const data=await fs.readFile(path.resolve(__dirname,"../public"+q.imageUrl));assert.ok(data.length>0);}
  }
  assert.equal(bundled.questions.filter(q=>q.figureUnavailable).length,3);
});
test("student reports reject cross-origin requests and hide the admin queue",async()=>{
  const {handler}=require("../netlify/functions/practice-report");
  assert.equal((await handler({httpMethod:"GET"})).statusCode,401);
  assert.equal((await handler({httpMethod:"POST",headers:{host:"localhost"},body:JSON.stringify({questionId:sample.id,message:"Check this answer"})})).statusCode,403);
  const sent=await handler({httpMethod:"POST",headers:{host:"localhost",origin:"http://localhost"},body:JSON.stringify({questionId:sample.id,message:"Check this answer"})});assert.equal(sent.statusCode,201);
  assert.equal((await handler({httpMethod:"POST",headers:{host:"localhost",origin:"http://localhost"},body:JSON.stringify({action:"resolve",reportId:"x"})})).statusCode,401);
  const state=await require("../netlify/lib/admin-state").loadState();assert.equal(state.practiceReports.length,1);
});
test("mobile reader uses collapsed filters and lazy-loaded rendering libraries",async()=>{
  const js=await fs.readFile(path.resolve(__dirname,"../public/question-bank.js"),"utf8");const css=await fs.readFile(path.resolve(__dirname,"../public/question-bank.css"),"utf8");
  assert.match(js,/bank-advanced/);assert.match(js,/DOMPurify\.sanitize/);assert.match(js,/trust:false/);assert.match(js,/securityLevel:"strict"/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/min-height:44px/);
});
