// Rotate through the complete, sorted municipal catalogue independently of cron reliability.
export const BUS_SAMPLE_LIMIT=180;
export function selectBusSample(stops,priorOffset=0,limit=BUS_SAMPLE_LIMIT){
 const total=stops.length;
 if(!total)return {sample:[],size:0,nextOffset:0};
 const size=Math.min(total,Math.max(1,Math.floor(limit)));
 const start=Number.isInteger(priorOffset)&&priorOffset>=0?priorOffset%total:0;
 const sample=Array.from({length:size},(_,i)=>stops[(start+i)%total]);
 return {sample,size,nextOffset:(start+size)%total};
}
