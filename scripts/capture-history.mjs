// Scheduled public-data snapshots. Never treat unavailable data as zero.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {BUS_API,BIZI_GBFS,asItems,stopId,parseBusLines} from '../site/data.js';
const output='site/history/snapshots.json';
const detailsOutput='site/history/bus-details.json';
let observations=[];
const get=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{accept:'application/json'}});if(!response.ok)throw Error('HTTP '+response.status);return response.json()};
const now=new Date().toISOString();
const snapshot={at:now,bizi:{status:'unavailable'},bus:{status:'unavailable'}};
try{
 const root=await get(BIZI_GBFS);
 const feeds=root.data?.feeds||Object.values(root.data||{}).find(x=>Array.isArray(x?.feeds))?.feeds||[];
 const info=feeds.find(x=>x.name==='station_information')?.url;
 const status=feeds.find(x=>x.name==='station_status')?.url;
 if(!info||!status)throw Error('GBFS feeds missing');
 const [i,s]=await Promise.all([get(info),get(status)]);
 const ids=new Set(asItems(i).map(x=>String(x.station_id)));
 const stations=asItems(s).filter(x=>ids.has(String(x.station_id)));
 const numeric=(x)=>x!=null&&Number.isFinite(Number(x))?Number(x):null;
 const availability=stations.map(x=>numeric(x.num_vehicles_available??x.num_bikes_available));
 const disabled=stations.map(x=>numeric(x.num_vehicles_disabled??x.num_bikes_disabled));
 snapshot.bizi={status:'ok',total:stations.length,known:availability.filter(x=>x!==null).length,empty:availability.filter(x=>x===0).length,available:availability.reduce((a,b)=>a+(b??0),0),disabledKnown:disabled.filter(x=>x!==null).length,disabled:disabled.reduce((a,b)=>a+(b??0),0)};
}catch(e){snapshot.bizi.error=String(e.message).slice(0,120)}
try{
 const stops=[],seen=new Set();
 for(let start=0;start<4000;start+=500){
  const batch=asItems(await get(`${BUS_API}.json?rows=500&start=${start}&srsname=wgs84`));
  for(const item of batch){const id=stopId(item);if(id?.startsWith('tuzsa-')&&!seen.has(id)){seen.add(id);stops.push(id)}}
  if(batch.length<500)break;
 }
 if(!stops.length)throw Error('No stops returned');
 stops.sort();
 // Rotating sample, not a citywide census. A fixed sample size limits API pressure.
 const sampleSize=Math.min(60,stops.length);
 const start=(Math.floor(Date.now()/1800000)*61)%stops.length;
 const sample=Array.from({length:sampleSize},(_,i)=>stops[(start+i)%stops.length]);
 let known=0,unknown=0,errors=0,long=0,estimates=0;
 for(let offset=0;offset<sample.length;offset+=6){
  await Promise.all(sample.slice(offset,offset+6).map(async id=>{
   try{const lines=parseBusLines(await get(`${BUS_API}/${encodeURIComponent(id)}.json`));
    const valid=lines.filter(x=>x.minutes!==null);
    if(valid.length)known++;else unknown++;
    observations.push({stop:id,status:valid.length?'known':'unknown',lines:lines.map(x=>({line:x.line,minutes:x.minutes}))});
    estimates+=valid.length;long+=valid.filter(x=>x.minutes>15).length;
   }catch{errors++;observations.push({stop:id,status:'error',lines:[]})}
  }));
 }
 snapshot.bus={status:'ok',population:stops.length,sampled:sample.length,known,unknown,errors,estimates,over15:long,sampling:'rotating'};
}catch(e){snapshot.bus.error=String(e.message).slice(0,120)}
let history=[];
try{const saved=JSON.parse(await readFile(output,'utf8'));if(Array.isArray(saved))history=saved}catch{}
history.push(snapshot);
history=history.filter(x=>x&&typeof x.at==='string'&&Date.parse(x.at)>=Date.now()-90*86400000).slice(-4500);
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(history,null,2)+String.fromCharCode(10));
// Aggregated by stop and line. Retains counts rather than personally identifying journeys.
let detail={schema:1,updatedAt:now,stops:{},lines:{}};
try{const existing=JSON.parse(await readFile(detailsOutput,'utf8'));if(existing?.schema===1&&existing.stops&&existing.lines)detail=existing}catch{}
const bump=(record,key)=>{record[key]=(record[key]||0)+1};
for(const observation of observations){
 const stop=detail.stops[observation.stop]??={samples:0,known:0,unknown:0,errors:0,over15:0,estimates:0,lastSeen:null};
 bump(stop,'samples');bump(stop,observation.status==='known'?'known':observation.status==='error'?'errors':'unknown');stop.lastSeen=now;
 for(const arrival of observation.lines){if(arrival.minutes===null)continue;
  bump(stop,'estimates');if(arrival.minutes>15)bump(stop,'over15');
  const line=detail.lines[arrival.line]??={samples:0,over15:0,totalMinutes:0,stops:{}};
  bump(line,'samples');line.totalMinutes+=arrival.minutes;if(arrival.minutes>15)bump(line,'over15');
  const atStop=line.stops[observation.stop]??={samples:0,over15:0,totalMinutes:0};
  bump(atStop,'samples');atStop.totalMinutes+=arrival.minutes;if(arrival.minutes>15)bump(atStop,'over15');
 }
}
detail.updatedAt=now;
await writeFile(detailsOutput,JSON.stringify(detail)+String.fromCharCode(10));
console.log(JSON.stringify(snapshot));
