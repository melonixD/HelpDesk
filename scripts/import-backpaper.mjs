// Public read-only import. Run only with the source owner's reuse permission.
// No login, credentials, report writes, private endpoints or access bypass.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const checkpoint=path.resolve(root,'../backpaper-import-work');
const base='https://api.backpaper.in';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex').slice(0,24);
let stopped=false;
async function get(route) {
  if(stopped)throw new Error('Import stopped');
  const response=await fetch(base+route,{signal:AbortSignal.timeout(45000),headers:{Accept:'application/json'}});
  if([401,403,429].includes(response.status)){stopped=true;throw new Error('Stop: public source returned '+response.status+'; no restrictions will be bypassed.');}
  if(!response.ok)throw new Error('Source returned '+response.status+' for '+route);
  return response.json();
}
async function write(name,data){await fs.writeFile(path.join(checkpoint,name),JSON.stringify(data,null,2)+'\n');}
async function pool(values,workers,fn){let cursor=0;await Promise.all(Array.from({length:workers},async()=>{while(cursor<values.length&&!stopped){const value=values[cursor++];await fn(value);await pause(300);}}));}
await fs.mkdir(checkpoint,{recursive:true});
const catalog=await get('/api/catalog');await write('catalog.json',catalog);
const jobs=catalog.branches.flatMap(branch=>branch.semesters.filter(s=>[1,2].includes(Number(s))).map(semester=>({branch:branch.id,semester:Number(semester)})));
const coverage=[];
await pool(jobs,2,async job=>{
  const filename=`questions-${job.branch}-${job.semester}.json`;
  let record;try{record=JSON.parse(await fs.readFile(path.join(checkpoint,filename),'utf8'));}catch{}
  if(record?.complete){coverage.push(record.summary);console.log('Using checkpoint '+filename);return;}
  const questions=[];let offset=0,total=0;
  do {
    const data=await get(`/api/questions?branch=${encodeURIComponent(job.branch)}&semester=${job.semester}&offset=${offset}&limit=100`);
    if(!Array.isArray(data.questions)||(offset===0&&!Number.isInteger(data.total)))throw new Error(`Unexpected response for ${job.branch} S${job.semester}: keys=${Object.keys(data)} total=${data.total}`);
    if(Number.isInteger(data.total))total=data.total;questions.push(...data.questions);
    const next=data.next_offset;
    if(next===null||next===undefined||data.questions.length===0)break;
    if(Number(next)<=offset)throw new Error('Pagination did not advance');offset=Number(next);
    await pause(300);
  }while(questions.length<total);
  const unique=new Set(questions.map(q=>q.id));
  if(questions.length!==total||unique.size!==total)throw new Error('Question count mismatch for '+filename);
  const summary={...job,total,received:questions.length};coverage.push(summary);
  await write(filename,{complete:true,summary,questions});console.log(`Collected ${job.branch} S${job.semester}: ${total}`);
});
await write('coverage.json',coverage);
const records=[];
for(const job of jobs){const data=JSON.parse(await fs.readFile(path.join(checkpoint,`questions-${job.branch}-${job.semester}.json`),'utf8'));records.push(...data.questions.map(q=>({question:q,route:job})));}
const unique=new Map();
for(const item of records){const key=item.question.id+'|'+item.question.course_code_and_name;if(!unique.has(key))unique.set(key,item);}
console.log('Unique source questions: '+unique.size);
const answerDir=path.join(checkpoint,'answers');await fs.mkdir(answerDir,{recursive:true});
if(process.argv.includes('--answers')) {
  let done=0,failed=0;
  await pool([...unique.values()],2,async item=>{
    const key=hash(item.question.id+'|'+item.question.course_code_and_name),file=path.join(answerDir,key+'.json');
    try{await fs.access(file);done++;return;}catch{}
    try {
      const answer=await get(`/api/questions/${encodeURIComponent(item.question.id)}/answer?branch=${encodeURIComponent(item.route.branch)}&semester=${item.route.semester}`);
      if(typeof answer.content!=='string')throw new Error('No answer content');
      await fs.writeFile(file,JSON.stringify(answer));done++;
    }catch(error){if(stopped)throw error;failed++;console.log('Answer unavailable: '+item.question.id+' ('+error.message+')');}
    if((done+failed)%25===0)console.log(`Answers ${done}, unavailable ${failed}, remaining ${unique.size-done-failed}`);
  });
}
await write('summary.json',{fetchedAt:new Date().toISOString(),permission:'Owner reuse permission confirmed by user',coverage,uniqueQuestions:unique.size,answersRequested:process.argv.includes('--answers')});
console.log('Read-only collection complete.');
