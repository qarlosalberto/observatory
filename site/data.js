export const BUS_API='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus';
export const BIZI_GBFS='https://zaragoza.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json';
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
  if(line||values.length){const key=line||'Desconocida '+(++unknown);const eta=values.length?Math.min(...values):null;const prev=byLine.get(key);
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
