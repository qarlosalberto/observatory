// Scheduled collection: only actual provider responses become observations.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fetchAvanzaArrivals} from './avanza-arrivals.mjs';
import {BUS_SAMPLE_LIMIT,selectBusSample,serializeBusArrivals} from './bus-sampling.mjs';
import {BUS_API,BIZI_GBFS,INCIDENT_API,asItems,coordsOf,stopId,parseBusLines,stationName,repairTimelineStationNames} from '../site/data.js';

const paths={
 summary:'site/history/snapshots.json',
 detail:'site/history/bus-details.json',
 incidents:'site/history/incidents.json',
 latest:'site/history/latest.json',
 timeline:'site/history/timeline.json'
};
const now=new Date().toISOString();
const snapshot={at:now,bizi:{status:'unavailable'},bus:{status:'unavailable'},incidents:{status:'unavailable'}};
const frame={at:now,bizi:{status:'unavailable',stations:[]},bus:{status:'unavailable',sampled:0,population:0,stops:[]}};
const observations=[];
let busCatalog=[];
const numeric=x=>x!=null&&Number.isFinite(Number(x))?Number(x):null;
const coordinate=x=>x?.length===2?x.map(v=>Math.round(v*1e6)/1e6):null;
const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'))}catch{return fallback}};
const saveJson=async(path,data)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(data)+String.fromCharCode(10))};
const previous=await readJson(paths.latest,null);
async function get(url){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{accept:'application/json'}});
   if(!response.ok){
    const body=(await response.text()).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
    const err=Error('HTTP '+response.status+(body?': '+body:''));
    err.httpStatus=response.status;throw err;
   }
   return await response.json();
  }catch(e){if(attempt||e.httpStatus===400||e.httpStatus===404)throw e;await new Promise(resolve=>setTimeout(resolve,500))}
 }
}

try{
 const root=await get(BIZI_GBFS);
 const feeds=root.data?.feeds||Object.values(root.data||{}).find(x=>Array.isArray(x?.feeds))?.feeds||[];
 const info=feeds.find(x=>x.name==='station_information')?.url;
 const status=feeds.find(x=>x.name==='station_status')?.url;
 if(!info||!status)throw Error('Required GBFS feeds missing');
 const [infoData,statusData]=await Promise.all([get(info),get(status)]);
 const statuses=new Map(asItems(statusData).map(x=>[String(x.station_id),x]));
 const stations=asItems(infoData).map(x=>{
  const v=statuses.get(String(x.station_id))||{};
  const coords=coordinate(coordsOf(x));
  return {id:String(x.station_id),name:stationName(x.name,x.station_id),coords,
   available:numeric(v.num_vehicles_available??v.num_bikes_available),
   disabled:numeric(v.num_vehicles_disabled??v.num_bikes_disabled),
   docks:numeric(v.num_docks_available)};
 }).filter(x=>x.coords);
 if(!stations.length)throw Error('No Bizi stations with coordinates');
 frame.bizi={status:'ok',stations};
 const known=stations.filter(x=>x.available!==null);
 const withDisabled=stations.filter(x=>x.disabled!==null);
 snapshot.bizi={status:'ok',total:stations.length,known:known.length,
  empty:known.filter(x=>x.available===0).length,
  available:known.reduce((n,x)=>n+x.available,0),
  disabledKnown:withDisabled.length,
  disabled:withDisabled.reduce((n,x)=>n+x.disabled,0)};
}catch(e){snapshot.bizi.error=String(e.message).slice(0,160)}

try{
 const discovered=[],seen=new Set();
 for(let start=0;start<4000;start+=500){
  const batch=asItems(await get(`${BUS_API}.json?rows=500&start=${start}&srsname=wgs84`));
  for(const x of batch){
   const id=stopId(x),coords=coordinate(coordsOf(x));
   if(!id?.startsWith('tuzsa-')||!coords||seen.has(id))continue;
   seen.add(id);discovered.push({id,coords,name:String(x.title??x.nombre??x.name??id)});
  }
  if(batch.length<500)break;
 }
 if(!discovered.length)throw Error('No bus stops with coordinates');
 discovered.sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
 busCatalog=discovered;
 const {sample,size,nextOffset}=selectBusSample(discovered,previous?.bus?.nextSampleOffset,BUS_SAMPLE_LIMIT);
 frame.bus={status:'ok',sampled:size,population:discovered.length,stops:[],nextSampleOffset:nextOffset};
 let known=0,unknown=0,errors=0,long=0,estimates=0;
 const failures=[];
 for(let offset=0;offset<sample.length;offset+=2){
  await Promise.all(sample.slice(offset,offset+2).map(async stop=>{
   try{
    let lines,source='avanza';
    try{lines=await fetchAvanzaArrivals(Number(stop.id.slice('tuzsa-'.length)))}
    catch(operatorError){
     source='municipal';
     try{
      let response;
      try{response=await get(`${BUS_API}/${encodeURIComponent(stop.id)}.json`)}
      catch(e){if(!/^HTTP (400|404)\b/.test(e.message))throw e;response=await get(`${BUS_API}/${encodeURIComponent(stop.id)}`)}
      lines=parseBusLines(response);
     }catch(cityError){throw Error(`Avanza: ${operatorError.message}; municipal: ${cityError.message}`)}
    }
    const arrivals=serializeBusArrivals(lines);
    const valid=arrivals.filter(x=>x.minutes!==null);
    const status=valid.length?'known':'unknown';
    if(valid.length)known++;else unknown++;
    estimates+=valid.length;long+=valid.filter(x=>x.minutes>15).length;
    frame.bus.stops.push({...stop,arrivals,status,source,observedAt:new Date().toISOString()});
    observations.push({stop:stop.id,status,lines:arrivals});
   }catch(e){
    errors++;if(failures.length<3)failures.push(`${stop.id}: ${String(e.message).slice(0,90)}`);
    frame.bus.stops.push({...stop,arrivals:[],status:'error',observedAt:new Date().toISOString()});
    observations.push({stop:stop.id,status:'error',lines:[]});
   }
  }));
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 frame.bus.stops.sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
 frame.bus.completedAt=new Date().toISOString();
 if(errors===size)frame.bus.status='unavailable';
 snapshot.bus={status:errors===size?'unavailable':'ok',population:discovered.length,sampled:size,
  known,unknown,errors,estimates,over15:long,sampling:'rotating',
  nextSampleOffset:nextOffset,completedAt:frame.bus.completedAt,
  sources:{avanza:frame.bus.stops.filter(s=>s.source==='avanza').length,municipal:frame.bus.stops.filter(s=>s.source==='municipal').length},
  verifiedBySource:{avanza:frame.bus.stops.filter(s=>s.status==='known'&&s.source==='avanza').length,municipal:frame.bus.stops.filter(s=>s.status==='known'&&s.source==='municipal').length},
  ...(errors===size?{error:'All sampled bus arrival requests failed'}:{}),
  ...(failures.length?{failureExamples:failures}:{})};
}catch(e){snapshot.bus.error=String(e.message).slice(0,160)}

try{
 const data=await get(`${INCIDENT_API}.json?rows=500&start=0&srsname=wgs84`);
 const items=Array.isArray(data?.result)?data.result:Array.isArray(data)?data:null;
 if(!items)throw Error('Unexpected incidents API response');
 const records=items.map(x=>({id:x.id,title:x.title,calle:x.calle,
  tipo:{id:x.tipo?.id??x.tipo},inicio:x.inicio,fin:x.fin,
  lastUpdated:x.lastUpdated,geometry:x.geometry,uri:x.uri??x.link}));
 const totalCount=Number.isFinite(Number(data.totalCount))?Number(data.totalCount):records.length;
 await saveJson(paths.incidents,{fetchedAt:now,totalCount,items:records});
 snapshot.incidents={status:'ok',fetched:records.length,totalCount};
}catch(e){snapshot.incidents.error=String(e.message).slice(0,160)}

// The fast bootstrap file retains the most recent *successful* source capture
// and its original timestamp; it never silently relabels old data as new.
const catalog=busCatalog.length?busCatalog:(previous?.bus?.catalog??[]);
const catalogFetchedAt=busCatalog.length?now:(previous?.bus?.catalogFetchedAt??null);
const busCurrent=frame.bus.status==='ok'
 ?{...frame.bus,capturedAt:now,catalog,catalogFetchedAt}
 :previous?.bus?.status==='ok'?{...previous.bus,catalog,catalogFetchedAt,nextSampleOffset:frame.bus.nextSampleOffset??previous.bus.nextSampleOffset}:
  busCatalog.length?{...frame.bus,catalog,catalogFetchedAt}:(previous?.bus??frame.bus);
const latest={schema:1,at:frame.bizi.status==='ok'||frame.bus.status==='ok'?now:(previous?.at??null),
 bizi:frame.bizi.status==='ok'?{...frame.bizi,capturedAt:now}:(previous?.bizi??frame.bizi),
 bus:busCurrent};
await saveJson(paths.latest,latest);

// Timeline measurements remain immutable; repair only malformed legacy display names using station IDs.
const timeline=await readJson(paths.timeline,{schema:1,frames:[]});
const frames=Array.isArray(timeline?.frames)?timeline.frames:[];
frames.push(frame);
const retained=repairTimelineStationNames(frames.filter(x=>x?.at&&Date.parse(x.at)>=Date.now()-7*86400000).slice(-336),latest.bizi?.stations??[]);
await saveJson(paths.timeline,{schema:1,updatedAt:now,retentionDays:7,frames:retained});

const summary=await readJson(paths.summary,[]);
const summaries=Array.isArray(summary)?summary:[];
summaries.push(snapshot);
await saveJson(paths.summary,summaries.filter(x=>x?.at&&Date.parse(x.at)>=Date.now()-90*86400000).slice(-4500));

// Route and stop aggregates stay separate from the map's seven-day time series.
const oldDetail=await readJson(paths.detail,{schema:1,stops:{},lines:{}});
const detail=oldDetail?.schema===1&&oldDetail?.stops&&oldDetail?.lines?oldDetail:{schema:1,stops:{},lines:{}};
const bump=(record,key)=>{record[key]=(record[key]||0)+1};
for(const observation of observations){
 const stop=detail.stops[observation.stop]??={samples:0,known:0,unknown:0,errors:0,over15:0,estimates:0,lastSeen:null};
 bump(stop,'samples');bump(stop,observation.status==='known'?'known':observation.status==='error'?'errors':'unknown');
 stop.lastSeen=now;
 for(const arrival of observation.lines){
  if(arrival.minutes===null)continue;
  bump(stop,'estimates');if(arrival.minutes>15)bump(stop,'over15');
  const line=detail.lines[arrival.line]??={samples:0,over15:0,totalMinutes:0,stops:{}};
  bump(line,'samples');line.totalMinutes+=arrival.minutes;if(arrival.minutes>15)bump(line,'over15');
  const atStop=line.stops[observation.stop]??={samples:0,over15:0,totalMinutes:0};
  bump(atStop,'samples');atStop.totalMinutes+=arrival.minutes;if(arrival.minutes>15)bump(atStop,'over15');
 }
}
detail.updatedAt=now;
await saveJson(paths.detail,detail);
console.log(JSON.stringify(snapshot));
