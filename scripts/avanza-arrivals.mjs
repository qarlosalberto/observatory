// Parse Avanza's public stop feed without treating malformed responses as arrivals.
export const AVANZA_URL='https://gps.avanzabus.com/index.php/zaragoza/fRefrescaEmpresaExternos';
const strip=s=>s.replace(/<[^>]+>/g,' ').replace(/&nbsp;?/gi,' ').replace(/\s+/g,' ').trim();
export function parseAvanzaArrivals(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.tablatiempos!=='string')throw Error('Invalid Avanza response');
 const html=data.tablatiempos.trim(),reported=new Set(),seen=new Set(),best=new Map();
 for(const m of Object.values(data.maquinas??{})){
  if(!m||typeof m!=='object'||String(m.icon??'').split('/').pop()!=='bus.png')continue;
  const title=String(m.title??'').trim().split(/\s+/);
  if(title.length!==2||!/^\d+$/.test(title[1]))throw Error('Unrecognized vehicle marker');
  reported.add(title[1]);
 }
 if(!html){if(reported.size)throw Error('Avanza vehicle mismatch');return []}
 const blocks=[...html.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)];
 if(!blocks.length)throw Error('Avanza route headings missing');
 for(let i=0;i<blocks.length;i++){
  const heading=blocks[i][1],left=heading.search(/<i\b/i),right=heading.search(/<\/i\s*>/i);
  if(left<0||right<0)throw Error('Unrecognized Avanza heading');
  const number=strip(heading.slice(0,left)),destination=strip(heading.slice(right).replace(/^<\/i\s*>/i,''));
  if(!/^(?:\d{1,3}|[A-Za-z]{1,3}\d{1,3})$/.test(number)||!destination)throw Error('Incomplete Avanza heading');
  const line=/^\d+$/.test(number)?String(Number(number)):number.toUpperCase();
  const body=html.slice(blocks[i].index+blocks[i][0].length,blocks[i+1]?.index??html.length);
  for(const [,vehicle,inside] of body.matchAll(/<a\b[^>]*href=["'][^"']*\/fParadas\/\d+\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)){
   const m=strip(inside).match(/^(\d+)\s*\[\s*(-?\d+)\s*mins?\s*\]$/i);
   if(!m||m[1]!==vehicle)throw Error('Avanza row does not match vehicle');
   const minutes=Number(m[2]);
   if(!Number.isInteger(minutes)||minutes<0||minutes>180)throw Error('Invalid Avanza arrival minutes');
   seen.add(vehicle);
   if(!best.has(line)||minutes<best.get(line))best.set(line,minutes);
  }
 }
 if(seen.size!==reported.size||[...seen].some(v=>!reported.has(v)))throw Error('Avanza arrival and vehicle lists disagree');
 return [...best].map(([line,minutes])=>({line,minutes})).sort((a,b)=>a.line.localeCompare(b.line,'en',{numeric:true}));
}
export async function fetchAvanzaArrivals(number,fetcher=fetch){
 if(!Number.isInteger(number)||number<1)throw Error('Invalid bus stop number');
 const r=await fetcher(AVANZA_URL,{method:'POST',signal:AbortSignal.timeout(6500),
  headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Observatory/1.0 (+https://github.com/qarlosalberto/observatory)'},
  body:new URLSearchParams({poste:String(number),coche:'0'}).toString()});
 if(!r.ok)throw Error('Avanza HTTP '+r.status);
 let data;
 try{data=JSON.parse(await r.text())}catch{throw Error('Avanza returned non-JSON content')}
 return parseAvanzaArrivals(data);
}
