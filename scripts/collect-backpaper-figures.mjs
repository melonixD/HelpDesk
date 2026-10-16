// Public GET only; use after collecting first-year question metadata.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const work=path.resolve(import.meta.dirname,'../../backpaper-import-work');
const dir=path.join(work,'figures');await fs.mkdir(dir,{recursive:true});
const filenames=new Set();
for(const file of (await fs.readdir(work)).filter(n=>n.startsWith('questions-'))){const d=JSON.parse(await fs.readFile(path.join(work,file),'utf8'));for(const q of d.questions)if(q.image_filename)filenames.add(q.image_filename);}
const mapping={},failures=[];let index=0;const all=[...filenames];
await Promise.all(Array.from({length:2},async()=>{while(index<all.length){const name=all[index++];
  const hash=crypto.createHash('sha256').update(name).digest('hex').slice(0,24);
  try {
    const response=await fetch('https://api.backpaper.in/static/'+encodeURIComponent(name),{signal:AbortSignal.timeout(45000)});
    if([401,403,429].includes(response.status))throw Object.assign(new Error('Source restriction '+response.status),{stop:true});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const data=Buffer.from(await response.arrayBuffer());if(data.length>5*1024*1024)throw new Error('Figure larger than 5 MB');
    const ext=data.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'png':data.subarray(0,3).toString('hex')==='ffd8ff'?'jpg':data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP'?'webp':null;
    if(!ext)throw new Error('Unsupported/non-image content');
    const file='bp-'+hash+'.'+ext;await fs.writeFile(path.join(dir,file),data);mapping[name]=file;
  }catch(error){if(error.stop)throw error;failures.push({name,error:error.message});}
  if((Object.keys(mapping).length+failures.length)%10===0)console.log(`Figures ${Object.keys(mapping).length}, unavailable ${failures.length}`);
}}));
await fs.writeFile(path.join(work,'figures-map.json'),JSON.stringify({mapping,failures},null,2));
console.log(`Collected ${Object.keys(mapping).length} unique figures; ${failures.length} unavailable.`);
