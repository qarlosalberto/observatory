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
/** Only accept genuine operator line identifiers, not free-text stop names. */
export function normalizeBusLine(value){
 const raw=String(value??'').trim().toUpperCase();
 if(!/^(?:[A-Z]{0,4}\d{1,3}|TRA|ESP)$/.test(raw))return '';
 return /^\d+$/.test(raw)?String(Number(raw)):raw;
}

/**
 * Stop catalogue titles contain an official "Líneas: 23, N5, 31" suffix.
 * Include separately reported arrival lines because the catalogue can be stale;
 * do not infer a route from a stop number or nearby geometry.
 */
export function busLinesOf(stop){
 const lines=new Set();
 const name=String(stop?.name??'');
 const suffix=name.match(/L[ií]neas?\s*:\s*(.*)$/i)?.[1]??'';
 for(const value of suffix.split(/[,;\s/]+/)){
  const line=normalizeBusLine(value);
  if(line)lines.add(line);
 }
 for(const a of stop?.arrivals||[]){
  const line=normalizeBusLine(a?.line);
  if(line)lines.add(line);
 }
 return [...lines];
}

export function arrivalsForLine(arrivals,line){
 const selected=normalizeBusLine(line);
 return selected?(arrivals||[]).filter(a=>normalizeBusLine(a?.line)===selected):(arrivals||[]);
}

export const BIZI_LOW_MAX=4;
export function summarizeBikes(stations){
 const known=stations.filter(s=>s.available!==null),pairs=stations.filter(s=>s.available!==null&&s.disabled!==null);
 return {total:stations.length,known:known.length,empty:known.filter(s=>s.available===0).length,underTwo:known.filter(s=>s.available<2).length,underFive:known.filter(s=>s.available<=BIZI_LOW_MAX).length,low:known.filter(s=>s.available>0&&s.available<=BIZI_LOW_MAX).length,good:known.filter(s=>s.available>BIZI_LOW_MAX).length,available:known.reduce((n,s)=>n+s.available,0),faultStations:stations.filter(s=>s.disabled!==null&&s.disabled>0).length,faultKnown:stations.filter(s=>s.disabled!==null).length,faultTotal:stations.filter(s=>s.disabled!==null).reduce((n,s)=>n+s.disabled,0),pairedStations:pairs.length,pairedAvailable:pairs.reduce((n,s)=>n+s.available,0),pairedFaults:pairs.reduce((n,s)=>n+s.disabled,0)};
}
export const BUS_GAP_THRESHOLD=15;
export const BUS_DARK_RED_WAIT_THRESHOLD=18;

/**
 * Compare successive predictions only within the same route and destination.
 * ETAs are minutes from one observation, not proof of published headways or punctuality.
 * A single predicted bus cannot establish the interval to an unreported next bus.
 * Distinct observations expose their first wait or preceding same-service gap for popup colouring.
 */
export function analyzeBusRegularity(arrivals=[]){
 const byService=new Map();
 for(const a of arrivals??[]){
  if(!a||!Number.isFinite(a.minutes)||a.minutes<0||a.minutes>180)continue;
  const line=String(a.line??'').trim();
  if(!line)continue;
  const destination=typeof a.destination==='string'?a.destination.trim().replace(/\s+/g,' '):'';
  const key=JSON.stringify([line.toUpperCase(),destination.toLocaleUpperCase('es')]);
  if(!byService.has(key))byService.set(key,{line,destination,entries:[],vehicles:new Map()});
  const service=byService.get(key),vehicle=typeof a.vehicle==='string'&&a.vehicle.trim()?a.vehicle.trim():null;
  if(vehicle&&service.vehicles.has(vehicle)){
   // Two observations of the same physical vehicle do not form an interval.
   const existing=service.vehicles.get(vehicle);
   if(a.minutes<existing.minutes){existing.minutes=a.minutes;existing.arrival=a}
  }else{
   const entry={minutes:a.minutes,arrival:a};
   service.entries.push(entry);
   if(vehicle)service.vehicles.set(vehicle,entry);
  }
 }
 const routes=[...byService.values()].map(({line,destination,entries})=>{
  const sorted=entries.slice().sort((a,b)=>a.minutes-b.minutes);
  const times=sorted.map(a=>a.minutes),gaps=[];
  for(let i=1;i<times.length;i++)gaps.push({from:times[i-1],to:times[i],minutes:times[i]-times[i-1]});
  const observations=sorted.map((entry,i)=>({
   arrival:entry.arrival,minutes:entry.minutes,
   first:i===0,interval:i===0?entry.minutes:entry.minutes-times[i-1]
  }));
  const first=times[0];
  return {line,destination,first,gaps,observations,slowFirst:first>=BUS_GAP_THRESHOLD,longGap:gaps.some(x=>x.minutes>=BUS_GAP_THRESHOLD)};
 }).sort((a,b)=>a.line.localeCompare(b.line,undefined,{numeric:true})||a.destination.localeCompare(b.destination));
 return {
  routes,
  hasArrivals:routes.length>0,
  slowFirst:routes.some(r=>r.slowFirst),
  longGap:routes.some(r=>r.longGap),
  darkRed:routes.some(r=>r.first>BUS_DARK_RED_WAIT_THRESHOLD||r.gaps.some(g=>g.minutes>BUS_DARK_RED_WAIT_THRESHOLD)),
  red:routes.some(r=>r.slowFirst||r.longGap),
  comparedGaps:routes.reduce((sum,r)=>sum+r.gaps.length,0)
 };
}

export function summarizeBuses(stops){
 const validETA=a=>Number.isFinite(a?.minutes)&&a.minutes>=0&&a.minutes<=180;
 const estimates=stops.flatMap(s=>s.arrivals||[]).filter(validETA);
 const redWaits=estimates.filter(x=>x.minutes>=BUS_GAP_THRESHOLD&&x.minutes<=BUS_DARK_RED_WAIT_THRESHOLD).length;
 const darkRedWaits=estimates.filter(x=>x.minutes>BUS_DARK_RED_WAIT_THRESHOLD).length;
 const observed=stops.map(s=>analyzeBusRegularity(s.arrivals));
 return {estimates:estimates.length,quick:estimates.filter(x=>x.minutes<=5).length,medium:estimates.filter(x=>x.minutes>5&&x.minutes<BUS_GAP_THRESHOLD).length,redWaits,darkRedWaits,long:redWaits+darkRedWaits,queried:stops.filter(s=>s.checked>0).length,withETA:stops.filter(s=>(s.arrivals||[]).some(validETA)).length,unknown:stops.filter(s=>s.apiResult==='unknown').length,errors:stops.filter(s=>s.apiResult==='error').length,redStops:observed.filter(x=>x.red).length,longGapStops:observed.filter(x=>x.longGap).length,comparedGaps:observed.reduce((n,x)=>n+x.comparedGaps,0)};
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

// Repair legacy display labels only; recorded counts and timestamps remain unchanged.
export function repairTimelineStationNames(frames,referenceStations){
 const names=new Map(referenceStations.filter(s=>s?.id!=null&&typeof s.name==='string'&&!s.name.includes('[object Object]')).map(s=>[String(s.id),s.name]));
 return frames.map(frame=>({...frame,bizi:frame.bizi?.stations?{...frame.bizi,stations:frame.bizi.stations.map(st=>st?.name?.includes('[object Object]')&&names.has(String(st.id))?{...st,name:names.get(String(st.id))}:st)}:frame.bizi}));
}
