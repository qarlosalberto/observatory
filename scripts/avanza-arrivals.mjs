// Validate actual operator stop predictions without discarding verified vehicles in a partly malformed reply.
export const AVANZA_URL='https://gps.avanzabus.com/index.php/zaragoza/fRefrescaEmpresaExternos';
export const AVANZA_TIMEOUT_MS=10000;
const strip=s=>s.replace(/<[^>]+>/g,' ').replace(/&nbsp;?/gi,' ').replace(/\s+/g,' ').trim();

export function parseAvanzaArrivals(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.tablatiempos!=='string')throw Error('Invalid Avanza response');
 const html=data.tablatiempos.trim(),reported=new Set(),seen=new Map(),arrivals=[];
 for(const marker of Object.values(data.maquinas??{})){
  if(!marker||typeof marker!=='object'||!/(?:^|\/)bus\.png(?:\?.*)?$/i.test(String(marker.icon??'')))continue;
  const vehicle=String(marker.title??'').trim().match(/(?:^|\s)(\d{3,6})\s*$/)?.[1];
  if(vehicle)reported.add(vehicle);
 }
 if(!html){if(reported.size)throw Error('Avanza vehicle mismatch');return []}
 const blocks=[...html.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)];
 if(!blocks.length)throw Error('Avanza route headings missing');
 let recognized=0;
 for(let i=0;i<blocks.length;i++){
  const heading=blocks[i][1],left=heading.search(/<i\b/i),right=heading.search(/<\/i\s*>/i);
  if(left<0||right<left)continue;
  const number=strip(heading.slice(0,left)),destination=strip(heading.slice(right).replace(/^<\/i\s*>/i,''));
  if(!/^(?:\d{1,3}|[A-Za-z]{1,4}\d{0,3})$/.test(number)||!destination)continue;
  recognized++;
  const line=/^\d+$/.test(number)?String(Number(number)):number.toUpperCase();
  const body=html.slice(blocks[i].index+blocks[i][0].length,blocks[i+1]?.index??html.length);
  for(const [,vehicle,inside] of body.matchAll(/<a\b[^>]*href=["'][^"']*\/fParadas\/\d+\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)){
   const value=strip(inside).match(/^(\d+)\s*\[\s*(-?\d+)\s*min(?:s|utos)?\s*\]$/i);
   if(!value||value[1]!==vehicle)continue;
   const estimate=Number(value[2]);
   // A slightly negative ETA means the vehicle has reached the stop. Never accept arbitrary negatives.
   if(!Number.isInteger(estimate)||estimate< -2||estimate>180)continue;
   if(!reported.has(vehicle))continue;
   const minutes=Math.max(0,estimate),existing=seen.get(vehicle);
   if(existing){
    if(existing.line!==line)continue;
    existing.minutes=Math.min(existing.minutes,minutes);
   }else{
    const row={line,minutes,destination,vehicle};
    seen.set(vehicle,row);
    arrivals.push(row);
   }
  }
 }
 if(!recognized)throw Error('Unrecognized Avanza headings');
 if(!arrivals.length&&reported.size)throw Error('Avanza arrivals could not be verified');
 return arrivals.sort((a,b)=>a.minutes-b.minutes||a.line.localeCompare(b.line,'en',{numeric:true}));
}

export async function fetchAvanzaArrivals(number,fetcher=fetch){
 if(!Number.isInteger(number)||number<1)throw Error('Invalid bus stop number');
 for(let attempt=0;attempt<2;attempt++){
  try{
   const r=await fetcher(AVANZA_URL,{method:'POST',signal:AbortSignal.timeout(AVANZA_TIMEOUT_MS),
    headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Observatory/1.0 (+https://github.com/qarlosalberto/observatory)'},
    body:new URLSearchParams({poste:String(number),coche:'0'}).toString()});
   if(!r.ok){const e=Error('Avanza HTTP '+r.status);e.retryable=r.status===429||r.status>=500;throw e}
   let data;
   try{data=JSON.parse(await r.text())}catch{throw Error('Avanza returned non-JSON content')}
   return parseAvanzaArrivals(data);
  }catch(e){
   const transient=e.retryable||e.name==='TimeoutError'||e.name==='AbortError'||/timed? ?out|fetch failed|socket hang up|ECONNRESET/i.test(String(e.message));
   if(attempt||!transient)throw e;
   await new Promise(resolve=>setTimeout(resolve,500));
  }
 }
}
