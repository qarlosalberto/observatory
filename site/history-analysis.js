// Derive interval-censored Bizi availability episodes from immutable provider observations.
// A decline in reported disabled bikes is not proof that any individual bike was repaired.
const DEFAULT_GAP_MINUTES=90;
const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const mean=list=>list.length?list.reduce((a,b)=>a+b,0)/list.length:null;
function intervalEpisodes(tracks,field,affected,maxGapMs){
 const completed=[];let censored=0;
 for(const [id,visits] of tracks){
  let previous=null,run=null;
  for(const visit of visits){
   const value=number(visit[field]);
   if(value===null){
    if(run)censored++;
    run=null;previous=null;continue;
   }
   if(previous&&(visit.index!==previous.index+1||visit.ms-previous.ms>maxGapMs||visit.ms<=previous.ms)){
    if(run)censored++;
    previous=null;run=null;
   }
   const isAffected=affected(value);
   if(isAffected){
    if(run)run.lastAffectedAt=visit.ms;
    else run={firstAffectedAt:visit.ms,lastAffectedAt:visit.ms,lastHealthyAt:previous&&!affected(previous.value)?previous.ms:null,name:visit.name};
   }else if(run){
    if(run.lastHealthyAt!==null){
     const lowerMinutes=(run.lastAffectedAt-run.firstAffectedAt)/60000;
     const upperMinutes=(visit.ms-run.lastHealthyAt)/60000;
     completed.push({id,name:run.name,lowerMinutes,upperMinutes,estimateMinutes:(lowerMinutes+upperMinutes)/2});
    }else censored++;
    run=null;
   }
   previous={ms:visit.ms,index:visit.index,value};
  }
  if(run)censored++; // End-of-window episodes are right-censored, not completed repairs.
 }
 return {
  completed:completed.length,censored,
  meanMinutes:mean(completed.map(x=>x.estimateMinutes)),
  meanLowerMinutes:mean(completed.map(x=>x.lowerMinutes)),
  meanUpperMinutes:mean(completed.map(x=>x.upperMinutes)),
  episodes:completed
 };
}
export function analyzeBikeHistory(frames,{maxGapMinutes=DEFAULT_GAP_MINUTES}={}){
 const snapshots=(Array.isArray(frames)?frames:[])
  .filter(x=>x?.bizi?.status==='ok'&&Array.isArray(x.bizi.stations)&&Number.isFinite(Date.parse(x.at)))
  .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const tracks=new Map(),series=[];
 for(const [index,frame] of snapshots.entries()){
  const seen=new Set(),st=frame.bizi.stations;
  let known=0,empty=0,underTwo=0,underFive=0,available=0,disabled=0,disabledKnown=0,affectedStations=0;
  for(const station of st){
   if(station?.id===undefined||station?.id===null)continue;
   const id=String(station.id);
   if(seen.has(id))continue;seen.add(id);
   const bikes=number(station.available),faults=number(station.disabled);
   if(bikes!==null){
    known++;available+=bikes;
    if(bikes===0)empty++;
    if(bikes<2)underTwo++;
    if(bikes<5)underFive++;
   }
   if(faults!==null){disabledKnown++;disabled+=faults;if(faults>0)affectedStations++}
   if(!tracks.has(id))tracks.set(id,[]);
   tracks.get(id).push({id,name:String(station.name??id),index,ms:Date.parse(frame.at),available:bikes,disabled:faults});
  }
  series.push({at:frame.at,known,empty,underTwo,underFive,available,disabled,disabledKnown,affectedStations});
 }
 const maxGapMs=Math.max(1,maxGapMinutes)*60000;
 const low=intervalEpisodes(tracks,'available',x=>x<2,maxGapMs);
 const faults=intervalEpisodes(tracks,'disabled',x=>x>0,maxGapMs);
 const last=series.at(-1)??null;
 const ranked=[...tracks.entries()].map(([id,observations])=>{
  const known=observations.filter(x=>x.available!==null);
  const lowCount=known.filter(x=>x.available<2).length;
  return {id,name:observations.at(-1)?.name??id,lowCount,known:known.length,share:known.length?lowCount/known.length:null};
 }).filter(x=>x.known>=3&&x.lowCount>=2)
  .sort((a,b)=>b.share-a.share||b.lowCount-a.lowCount||a.name.localeCompare(b.name,'en')).slice(0,10);
 const largeGaps=series.slice(1).filter((x,i)=>Date.parse(x.at)-Date.parse(series[i].at)>maxGapMs).length;
 return {frames:series.length,firstAt:series[0]?.at??null,lastAt:last?.at??null,series,last,low,faults,ranked,largeGaps,maxGapMinutes};
}
