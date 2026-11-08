export const BUS_API='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus';
export const BIZI_GBFS='https://zaragoza.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json';
export const INCIDENT_API='https://www.zaragoza.es/sede/servicio/via-publica/incidencia';
export const BIZI_FALLBACK='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/estacion-bicicleta';
export const asItems = data => Array.isArray(data)?data:[data?.result,data?.results,data?.features,data?.data?.stations,data?.data?.items,data?.data?.results,data?.stations].find(Array.isArray)||[];
export function coordsOf(obj){
 const p=obj.geometry||obj.position||obj.location;const arr=p?.coordinates||p?.geometry?.coordinates;
 if(Array.isArray(arr)&&arr.length>=2&&Number.isFinite(+arr[0])&&Number.isFinite(+arr[1]))return [+arr[1],+arr[0]];
 const lat=obj.lat??obj.latitude??p?.lat,lon=obj.lon??obj.lng??obj.longitude??p?.lon;
 return lat!=null&&lon!=null&&Number.isFinite(+lat)&&Number.isFinite(+lon)?[+lat,+lon]:null;
}
export function stopId(obj){
 const raw=String(obj.id??obj.identifier??obj.codigo??obj.code??obj.properties?.id??'').trim();
 const token=raw.match(/(?:tuzsa|rural)[-_]\d+/i);if(token)return token[0].replace('_','-').toLowerCase();
 return /^\d{1,6}$/.test(raw)?'tuzsa-'+raw:null;
}
export function minutesOf(raw){
 if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0&&raw<=180?raw:null;
 if(typeof raw!=='string')return null;
 const text=raw.trim();if(/^(en la parada|llegando|inminente)$/i.test(text))return 0;
 if(/^\d{1,3}$/.test(text))return +text<=180?+text:null;
 const m=text.match(/^(?:aprox\.?\s*)?(\d{1,3})\s*(?:min(?:utos|utes)?|m\b)/i);
 return m&&+m[1]<=180?+m[1]:null;
}
const LINE_KEY=/^(linea|línea|line|route|route_id|linea_id|lineNumber|numeroLinea|numLinea)$/i;
const ETA_KEY=/^(primero|segundo|primerBus|segundoBus|tiempo|tiempoEspera|tiempoLlegada|tiempo_espera|minutos|minutes|espera|arrival_in_minutes|arrivalInMinutes|waitingTime|wait|prediction|timeLeft|remainingMinutes|proximo|proximaLlegada)$/i;
const CHILD_KEY=/^(result|results|data|datos|features|properties|lineas|lines|tiempos|tiemposEspera|llegadas|arrivals|destinos|estimaciones|predicciones|bus|buses|servicios|poste|posteAutobus|autobuses|resultado|respuesta)$/i;
export function parseBusLines(response){
 const byLine=new Map();let unknown=0;
 function visit(value,depth=0,parentLine=''){
  if(depth>8||value==null)return;
  if(Array.isArray(value)){for(const x of value)visit(x,depth+1,parentLine);return}
  if(typeof value!=='object')return;
  let line=parentLine;
  for(const [key,v] of Object.entries(value))if(LINE_KEY.test(key)&&v!=null){
   const name=typeof v==='object'?v.nombre??v.numero??v.id:v;
   if(name!=null&&String(name).trim())line=String(name).trim();break;
  }
  const values=Object.entries(value).filter(([k])=>ETA_KEY.test(k)).map(([,v])=>minutesOf(v)).filter(v=>v!==null);
  if(line||values.length){const key=line||'Unknown route '+(++unknown);const eta=values.length?Math.min(...values):null;const prev=byLine.get(key);
   if(prev===undefined||prev===null)byLine.set(key,eta);else if(eta!==null)byLine.set(key,Math.min(prev,eta));}
  for(const [key,v] of Object.entries(value))if(v&&typeof v==='object'&&CHILD_KEY.test(key))visit(v,depth+1,line);
 }
 visit(response);
 return [...byLine].map(([line,minutes])=>({line,minutes})).sort((a,b)=>a.line.localeCompare(b.line,undefined,{numeric:true}));
}
export function summarizeBikes(stations){
 const known=stations.filter(s=>s.available!==null),pairs=stations.filter(s=>s.available!==null&&s.disabled!==null);
 return {total:stations.length,known:known.length,empty:known.filter(s=>s.available===0).length,low:known.filter(s=>s.available>0&&s.available<=2).length,good:known.filter(s=>s.available>2).length,available:known.reduce((n,s)=>n+s.available,0),faultStations:stations.filter(s=>s.disabled!==null&&s.disabled>0).length,faultKnown:stations.filter(s=>s.disabled!==null).length,faultTotal:stations.filter(s=>s.disabled!==null).reduce((n,s)=>n+s.disabled,0),pairedStations:pairs.length,pairedAvailable:pairs.reduce((n,s)=>n+s.available,0),pairedFaults:pairs.reduce((n,s)=>n+s.disabled,0)};
}
export function summarizeBuses(stops){
 const estimates=stops.flatMap(s=>s.arrivals||[]).filter(x=>x.minutes!==null);
 return {estimates:estimates.length,quick:estimates.filter(x=>x.minutes<=5).length,medium:estimates.filter(x=>x.minutes>5&&x.minutes<=15).length,long:estimates.filter(x=>x.minutes>15).length,queried:stops.filter(s=>s.checked>0).length,withETA:stops.filter(s=>(s.arrivals||[]).some(a=>a.minutes!==null)).length,unknown:stops.filter(s=>s.apiResult==='unknown').length,errors:stops.filter(s=>s.apiResult==='error').length};
}

/** Convert WGS84 or municipal UTM zone 30N coordinates to Leaflet coordinates. */
export function incidentCoords(feature){
 const raw=feature?.geometry?.coordinates;
 if(!Array.isArray(raw)||raw.length<2)return null;
 const x=Number(raw[0]),y=Number(raw[1]);
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 if(Math.abs(x)<=180&&Math.abs(y)<=90)return [y,x];
 if(x<100000||x>900000||y<4000000||y>5200000)return null;
 // Zaragoza's EPSG:25830 grid is close to WGS84 UTM zone 30N at map scale.
 const a=6378137,e2=0.00669437999014,k=0.9996,ep2=e2/(1-e2),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
 const m=y/k,mu=m/(a*(1-e2/4-3*e2**2/64-5*e2**3/256));
 const p=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
 const sin=Math.sin(p),cos=Math.cos(p),tan=Math.tan(p),n=a/Math.sqrt(1-e2*sin*sin),t=tan*tan,c=ep2*cos*cos,r=a*(1-e2)/(1-e2*sin*sin)**1.5,d=(x-500000)/(n*k);
 const lat=p-(n*tan/r)*(d*d/2-(5+3*t+10*c-4*c*c-9*ep2)*d**4/24+(61+90*t+298*c+45*t*t-252*ep2-3*c*c)*d**6/720);
 const lon=(-3*Math.PI/180)+(d-(1+2*t+c)*d**3/6+(5-2*c+28*t-3*c*c+8*ep2+24*t*t)*d**5/120)/cos;
 return [lat*180/Math.PI,lon*180/Math.PI];
}
export const incidentTypes={water:'Water supply outage',traffic:'Traffic closure',major:'Major disruption',other:'Other notice'};
export function incidentPhase(row,today){
 const start=row.start,end=row.end;
 if(!start||!end)return 'unknown';
 if(today<start)return 'upcoming';
 if(today>end)return 'ended';
 return 'active';
}
export function normalizeIncidents(items){
 const seen=new Set();
 return items.filter(x=>x&&typeof x==='object').map(x=>{
  const id=String(x.id??x.uri??'').trim();
  const typeId=Number(x.tipo?.id??x.tipo?.value??x.tipo);
  const type=typeId===0?'water':typeId===1?'traffic':typeId===2?'major':'other';
  const date=v=>typeof v==='string'?v.match(/^\d{4}-\d{2}-\d{2}/)?.[0]??null:null;
  const url=String(x.uri??x.link??'');
  let link=null;
  try{const parsed=new URL(url);if(parsed.protocol==='https:'&&(parsed.hostname==='www.zaragoza.es'||parsed.hostname==='zaragoza.es'))link=parsed.href}catch{}
  return {id,title:String(x.title??x.calle??'Unnamed location').trim(),street:String(x.calle??'').trim(),type,start:date(x.inicio),end:date(x.fin),updated:date(x.lastUpdated),coords:incidentCoords(x),link};
 }).filter(x=>{const key=x.id||[x.title,x.start,x.type].join(':');if(seen.has(key))return false;seen.add(key);return true});
}

/** Choose a provider-supplied GBFS label without stringifying translation objects. */
export function stationName(value,id){
 if(typeof value==='string'&&value.trim()&&!value.includes('[object Object]'))return value.trim();
 if(Array.isArray(value)){
  const entries=value.filter(x=>x&&typeof x==='object').map(x=>({language:x.language??x.lang,text:x.text??x.value}));
  const chosen=entries.find(x=>x.language==='en'&&typeof x.text==='string'&&x.text.trim())
   ??entries.find(x=>x.language==='es'&&typeof x.text==='string'&&x.text.trim())
   ??entries.find(x=>typeof x.text==='string'&&x.text.trim());
  if(chosen)return chosen.text.trim();
 }
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  for(const field of ['en','es','text','value'])if(typeof value[field]==='string'&&value[field].trim())return value[field].trim();
 }
 return String(id??'Unknown station');
}
