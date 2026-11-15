// Cache municipal line itineraries separately from real-time stop predictions.
// Paths are taken only from published geometry or ordered line-stop records.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {BUS_LINE_ROUTE_API,busRoutePaths,busLinesOf} from '../site/data.js';

const folder='site/history/routes',statusFile='site/history/routes-status.json';
const readJson=async(file,fallback)=>{try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}};
const latest=await readJson('site/history/latest.json',null);
const lines=[...new Set((latest?.bus?.catalog||[]).flatMap(busLinesOf))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
if(!lines.length){console.log('No municipal bus line catalogue available');process.exit(0)}
const status=await readJson(statusFile,{schema:1,lines:{}});
status.lines??={};
const day=86400000,now=Date.now(),deadline=now+110000;
const due=lines.filter(line=>{
 const entry=status.lines[line],date=Date.parse(entry?.checkedAt??'');
 return !Number.isFinite(date)||now-date>(entry?.ok?7*day:day);
});
await mkdir(folder,{recursive:true});
let index=0,success=0,failed=0,skipped=0,diagnostics=0;
async function fetchSource(url){
 const res=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{Accept:'application/json'}});
 if(!res.ok)throw Error('HTTP '+res.status);
 return await res.json();
}
async function worker(){
 while(index<due.length){
  const line=due[index++];
  if(Date.now()>=deadline){skipped++;continue}
  let paths=[];
  for(const endpoint of ['linea','linea-autobus']){
   try{
    const payload=await fetchSource(BUS_LINE_ROUTE_API+'/'+endpoint+'/'+encodeURIComponent(line)+'.json?srsname=wgs84');
    paths=busRoutePaths(payload);
    if(!paths.length&&diagnostics<4){
     diagnostics++;
     console.log('No ordered coordinates in '+endpoint+'/'+line+'; top-level keys:',Object.keys(payload||{}).slice(0,15));
    }
    if(paths.length)break;
   }catch(e){
    if(diagnostics<4){diagnostics++;console.log('Line '+line+' endpoint '+endpoint+': '+String(e.message).slice(0,130))}
   }
  }
  status.lines[line]={checkedAt:new Date().toISOString(),ok:paths.length>0};
  if(paths.length){
   const rounded=paths.map(path=>path.map(point=>point.map(value=>Math.round(value*1e6)/1e6)));
   await writeFile(folder+'/'+line+'.json',JSON.stringify({schema:1,line,source:'Zaragoza City Council',capturedAt:new Date().toISOString(),paths:rounded})+'\n');
   success++;
  }else failed++;
 }
}
await Promise.all(Array.from({length:5},worker));
await writeFile(statusFile,JSON.stringify(status)+'\n');
console.log('Municipal line itineraries: '+success+' saved, '+failed+' unavailable, '+skipped+' deferred, '+(lines.length-due.length)+' still fresh');
