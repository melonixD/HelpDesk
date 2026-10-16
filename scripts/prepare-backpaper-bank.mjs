// Normalize an owner-authorized, read-only first-year collection.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),model=require('../public/question-bank-model');
const root=path.resolve(import.meta.dirname,'..'),work=path.resolve(root,'../backpaper-import-work');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex').slice(0,24);
const codes={DCS101:'pps',DHS101:'uhv',DHS102:'etw',NCE101:'engineering-graphics',NEE101:'bee',NMA101:'maths-1',NPH101:'engineering-physics',DCE102:'ees',DCH101:'intro-technology',DCY101:'chemistry',DET101:'bet',DHS103:'pc',DME101:'bem'};
const records=new Map();const coverage=[];
for(const name of (await fs.readdir(work)).filter(n=>n.startsWith('questions-'))){const data=JSON.parse(await fs.readFile(path.join(work,name),'utf8'));if(!data.complete)throw new Error('Incomplete source view: '+name);coverage.push(data.summary);for(const q of data.questions){const key=q.id+'|'+q.course_code_and_name;if(!records.has(key))records.set(key,q);}}
let figures={mapping:{},failures:[]};try{figures=JSON.parse(await fs.readFile(path.join(work,'figures-map.json'),'utf8'));}catch{}
const output=path.join(root,'public/practice-answers');await fs.mkdir(output,{recursive:true});await fs.mkdir(path.join(root,'public/practice-assets'),{recursive:true});
for(const filename of Object.values(figures.mapping))await fs.copyFile(path.join(work,'figures',filename),path.join(root,'public/practice-assets',filename));
const questions=[],missingAnswers=[],missingFigures=[],subjects={};let answerCount=0;
for(const [key,source] of records){
  const code=source.course_code_and_name.split('/')[0].replace(/[^A-Za-z0-9]/g,'').toUpperCase(),subjectId=codes[code];if(!subjectId)throw new Error('Unmapped source course: '+source.course_code_and_name);
  const topics=(source.units||[]).map(value=>{const m=/\/Unit:\s*(\d+)\/(.*)/i.exec(value);return m?{unitNumber:m[1],chapter:m[2].trim()}:null;}).filter(Boolean);
  if(!topics.length)topics.push({unitNumber:'unclassified',chapter:'Unclassified · awaiting chapter review'});
  const token=hash(key),id='bp-'+token,academicYear=String(source.year||'');const year=/\b(\d{4})\b/.exec(academicYear);
  const rawExam=String(source.exam_type||'').toLowerCase();const exam=/end/.test(rawExam)?'end-sem':/mid/.test(rawExam)?'mid-sem':'unknown';
  const q={id,subjectId,unitNumber:topics[0].unitNumber,unitNumbers:[...new Set(topics.map(t=>t.unitNumber))],chapter:topics[0].chapter,topics,question:source.content,answer:'',year:year?Number(year[1]):null,academicYear,exam,marks:Number.isFinite(source.marks)?source.marks:null,branchIds:[],sourceTitle:'Previous-year question paper',sourceUrl:'',sourceQuestionId:source.id,sourceCourse:source.course_code_and_name};
  try{
    const answer=JSON.parse(await fs.readFile(path.join(work,'answers',token+'.json'),'utf8'));
    const value={answer:String(answer.content||''),proTip:String(answer.pro_tip||''),videoLinks:(answer.yt_search_term||[]).slice(0,12).map((title,i)=>({title:String(title).slice(0,250),url:answer.youtube_urls?.[i]||'https://www.youtube.com/results?search_query='+encodeURIComponent(title)})).filter(v=>{try{const u=new URL(v.url);return u.protocol==='https:'&&['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname);}catch{return false;}})};
    model.validate({schemaVersion:1,questions:[{...q,...value}]});
    const answerFile=id+'-'+hash(JSON.stringify(value))+'.json';await fs.writeFile(path.join(output,answerFile),JSON.stringify(value));q.answerUrl='/practice-answers/'+answerFile;answerCount++;
  }catch(error){missingAnswers.push({id,sourceQuestionId:source.id,error:error.message});}
  if(source.image_filename){const local=figures.mapping[source.image_filename];if(local)q.imageUrl='/practice-assets/'+local;else{q.figureUnavailable=true;missingFigures.push({id,filename:source.image_filename});}}
  questions.push(q);subjects[subjectId]=(subjects[subjectId]||0)+1;
}
const techUnits=new Map(questions.filter(q=>q.subjectId==='intro-technology').flatMap(q=>q.topics).map(t=>[t.unitNumber,t.chapter]));
const bank={schemaVersion:1,source:'Backpaper',permissionNote:'Source owner reuse permission confirmed by user on 2026-10-14.',extraBranches:[{id:'cse-ai-ml',name:'Computer Science & Engineering (AI & ML)',code:'AI',templateBranchId:'cse'}],extraSubjects:[{id:'intro-technology',name:'Introduction to Chemical Engineering & Technology',groupSemesters:{engineering:['semester-2'],technology:['semester-1']},units:[...techUnits].map(([number,title])=>({number,title}))}],questions};
model.validate(bank);if(Buffer.byteLength(JSON.stringify(bank))>2*1024*1024)throw new Error('Question metadata exceeds the document limit');
await fs.writeFile(path.join(root,'data/practice.json'),JSON.stringify(bank,null,2)+'\n');
const summary={collectedAt:new Date().toISOString(),source:'https://www.backpaper.in/',scope:'All public catalog branches, semesters 1 and 2 only',coverage,uniqueQuestions:questions.length,subjects,answersStored:answerCount,missingAnswers,figuresStored:Object.keys(figures.mapping).length,missingFigures,metadataBytes:Buffer.byteLength(JSON.stringify(bank)),note:'Source Mid-Sem labels are not guessed as Mid-sem 1 or 2. AI/source solutions are not independently verified. Practice-only Intro Technology subject does not alter Resources.'};
await fs.writeFile(path.join(root,'data/backpaper-import-report.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({questions:questions.length,subjects,answers:answerCount,missingAnswers:missingAnswers.length,figures:Object.keys(figures.mapping).length,missingFigures:missingFigures.length,bytes:summary.metadataBytes},null,2));
