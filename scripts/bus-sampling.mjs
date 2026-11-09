// Rotate through the complete, sorted municipal catalogue independently of cron reliability.
export const BUS_SAMPLE_LIMIT=180;
export function selectBusSample(stops,priorOffset=0,limit=BUS_SAMPLE_LIMIT){
 const total=stops.length;
 if(!total)return {sample:[],size:0,nextOffset:0};
 const size=Math.min(total,Math.max(1,Math.floor(limit)));
 const start=Number.isInteger(priorOffset)&&priorOffset>=0?priorOffset%total:0;
 // Interleave the sorted IDs: one capture covers stops across the city rather
 // than an adjacent block of IDs. A coprime stride visits every stop once per cycle.
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 let stride=Math.max(1,Math.floor(total/size));
 while(gcd(stride,total)!==1)stride++;
 const sample=Array.from({length:size},(_,i)=>stops[(start+i*stride)%total]);
 return {sample,size,nextOffset:(start+size*stride)%total};
}


// Preserve operator identity and destination alongside each observed stop-level ETA.
// Municipal fallback predictions may legitimately have no vehicle identifier.
export function serializeBusArrivals(lines){
 return lines.map(row=>({
  line:String(row.line),
  minutes:row.minutes??null,
  ...(typeof row.vehicle==='string'&&row.vehicle?{vehicle:row.vehicle}:{}),
  ...(typeof row.destination==='string'&&row.destination?{destination:row.destination}:{})
 }));
}
