import {BUS_API,BIZI_GBFS,BIZI_FALLBACK,asItems,coordsOf,stopId,parseBusLines,summarizeBikes,summarizeBuses,INCIDENT_API,normalizeIncidents,incidentPhase,incidentTypes} from './data.js';
const $=id=>document.getElementById(id);
const state={stations:[],stops:[],busFetched:0,bikeFetched:0,bikeSource:'',busError:'',bikeError:'',busLoading:false,busReloadRequested:false,map:null,bl:null,sl:null,markers:new Map(),charts:{},incidents:[],incidentFetched:0,incidentSource:'',incidentTotal:0,incidentError:'',incidentLoading:false,incidentMap:null,incidentLayer:null,incidentMapFitted:false,liveMode:false,liveEpoch:0,latest:null,timeline:null,selectedFrameIndex:null,timelineLoading:false,snapshotBusPopulation:0,snapshotBusSampled:0,snapshotAt:null,snapshotBusAt:null,snapshotBiziAt:null};
const color={green:'#18875b',yellow:'#e9a52f',red:'#d94749',blue:'#4274c7',grey:'#89929f'};
async function getJson(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}}
function renderMetricCards(id,cards){
 const target=$(id);if(!target)return;
 target.replaceChildren(...cards.map(([label,value,note])=>{
  const div=document.createElement('article');div.className='kpi';const span=document.createElement('span');span.className='label';span.textContent=label;
  const strong=document.createElement('strong');strong.textContent=value;
  const small=document.createElement('small');small.textContent=note;
  div.append(span,strong,small);return div;
 }));
}
function formatSnapshotTime(at){
 if(!at||!Number.isFinite(Date.parse(at)))return 'No recorded data';
 return new Date(at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'})+' (Zaragoza)';
}
function report(){
 const s=summarizeBikes(state.stations),b=summarizeBuses(state.stops);
 const visible=state.map?state.stops.filter(x=>x.id.startsWith('tuzsa-')&&state.map.getBounds().pad(.12).contains(x.coords)):[];
 if(state.liveMode){
  $('status').textContent=`On-demand live requests · ${visible.filter(x=>x.checked>0).length}/${visible.length} visible bus stops queried · ${b.withETA} stops with predictions · ${b.errors} bus errors${state.busLoading?' · Loading…':''}${state.busError?' · '+state.busError:''}`;
  $('updated').textContent='Live fetch requested · '+new Date().toLocaleTimeString('en-GB');
 }else{
  const busCapture=state.snapshotBusAt?formatSnapshotTime(state.snapshotBusAt):'unavailable';
  const bikeCapture=state.snapshotBiziAt?formatSnapshotTime(state.snapshotBiziAt):'unavailable';
  $('status').textContent=state.snapshotAt
   ?`Recorded observations only · Bus: ${state.snapshotBusSampled}/${state.snapshotBusPopulation||'?'} stops sampled at ${busCapture} (${b.withETA} with predictions) · Bizi: ${state.stations.length} stations at ${bikeCapture}. No live API requests.`
   :'No recorded mobility snapshot yet. The scheduled capture has not produced usable data. You can request live data manually.';
  $('updated').textContent=state.snapshotAt?'Captured '+formatSnapshotTime(state.snapshotAt):'No recorded capture yet';
 }
 const cards=[['Available bikes',s.known?s.available:'—',s.known+'/'+s.total+' stations reporting'],['Out-of-service bikes',s.faultKnown?s.faultTotal:'—',s.faultKnown+'/'+s.total+' stations reporting'],['Empty Bizi stations',s.known?s.empty:'—','Among stations with known availability'],['Routes with waits >15 min',b.estimates?b.long:'—',b.estimates+' known predictions']];
 renderMetricCards('kpis',cards);
 renderMetricCards('busKpis',[
  ['Known predictions',b.estimates||'—',b.withETA+' stops with an estimate'],
  ['Predicted waits ≤5 min',b.estimates?b.quick:'—','Known predictions only'],
  ['Waits >15 min',b.estimates?b.long:'—','Not proof of lateness'],
  ['API requests without a prediction',b.unknown,'Separate from '+b.errors+' API errors']
 ]);
 renderMetricCards('biziKpis',[
  ['Available bikes',s.known?s.available:'—',s.known+' reporting stations'],
  ['Empty stations',s.known?s.empty:'—','Out of '+s.known+' with availability data'],
  ['Out-of-service bikes',s.faultKnown?s.faultTotal:'—',s.faultKnown+' reporting stations'],
  ['Data coverage',s.total?Math.round(100*s.known/s.total)+'%':'—',s.known+' of '+s.total+' stations']
 ]);
 $('overviewBus').textContent=b.estimates||'—';
 $('overviewBike').textContent=s.known?s.available:'—';
 $('bikeNote').textContent=s.known?`${s.known} of ${s.total} stations report availability; ${s.total-s.known} unknown.`:'No reliable availability data.';
 $('faultNote').textContent=s.pairedStations?`Comparison across ${s.pairedStations} stations reporting both counts. ${s.total-s.pairedStations} stations have no comparable data.`:'The source does not provide comparable out-of-service bike counts. Unknown does not mean zero.';
 $('busNote').textContent=`${b.estimates} route-level predictions from ${b.withETA} stops. ${b.unknown} responses without predictions; ${b.errors} API errors. Timetable delays cannot be established without scheduled arrival data.`;
 chart('bikeChart','doughnut',['≥3 available','1–2 available','Empty'],[s.good,s.low,s.empty],[color.green,color.yellow,color.red]);
 chart('faultChart','bar',s.pairedStations?['Available','Out of service']:['No data'],s.pairedStations?[s.pairedAvailable,s.pairedFaults]:[0],s.pairedStations?[color.green,color.yellow]:[color.grey]);
 chart('busChart','bar',['0–5 min','6–15 min','>15 min'],[b.quick,b.medium,b.long],[color.green,color.blue,color.red]);
}
function chart(id,type,labels,data,colors){if(!window.Chart)return;state.charts[id]?.destroy();state.charts[id]=new window.Chart($(id),{type,data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0,borderRadius:type==='bar'?5:0}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:type==='doughnut',position:'bottom'}},...(type==='bar'?{scales:{y:{beginAtZero:true,ticks:{precision:0}}}}:{})}})}
function popup(title,details){const div=document.createElement('div'),strong=document.createElement('strong');strong.textContent=title;div.append(strong);for(const [line,cls] of details){const p=document.createElement('div');p.className='popup-line'+(cls?' '+cls:'');p.textContent=line;div.append(p)}return div}
function bikeMarkers(){state.bl.clearLayers();if(!$('showBizi').checked)return;for(const st of state.stations){if($('brokenOnly').checked&&!(st.disabled>0))continue;const available=st.available,hex=available===null?color.grey:available===0?color.red:available<=2?color.yellow:color.green;const n=available===null?'?':available;const badge=st.disabled>0?`<span class="bike-broken">🔧 ${st.disabled}</span>`:'';const icon=L.divIcon({className:'bike-wrapper',html:`<span class="bike-pin" style="--pin:${hex}">${n}</span>${badge}`,iconSize:[42,42],iconAnchor:[21,21]});const lines=[['Available: '+(available??'unknown')],['Free docks: '+(st.docks??'unknown')],['Out of service: '+(st.disabled??'no data')]];L.marker(st.coords,{icon,zIndexOffset:750}).bindPopup(popup('Bizi · '+st.name,lines)).addTo(state.bl)}}
function removeBus(id,marker){state.sl.removeLayer(marker.ring);state.sl.removeLayer(marker.tap);state.markers.delete(id)}
function busMarkers(){if(!state.map)return;const zoom=state.map.getZoom(),bounds=state.map.getBounds().pad(.2),active=new Set();if($('showBus').checked&&zoom>=12)for(const stop of state.stops){if(!bounds.contains(stop.coords))continue;const valid=stop.arrivals.filter(a=>a.minutes!==null);if(!valid.length)continue;active.add(stop.id);const red=valid.some(a=>a.minutes>15),hex=red?color.red:color.blue;const size=zoom>=14?22:zoom===13?14:10,touch=zoom>=14?34:zoom===13?24:17;const shape={radius:size,color:'#fff',weight:size>=22?2.5:1.5,fillColor:hex,fillOpacity:.94};const details=stop.arrivals.map(a=>['Route '+a.line+': '+(a.minutes===null?'no prediction':a.minutes+' min'),a.minutes===null?'unknown':a.minutes>15?'over':'']);const signature=JSON.stringify([shape,details]);let marker=state.markers.get(stop.id);if(!marker){const ring=L.circleMarker(stop.coords,{pane:'busPane',...shape,interactive:false}).addTo(state.sl);const tap=L.circleMarker(stop.coords,{pane:'busPane',radius:touch,color:'#000',opacity:0,weight:0,fillOpacity:.001,interactive:true});tap.bindPopup(popup('Stop '+stop.name,details),{autoPan:false}).addTo(state.sl);marker={ring,tap,signature};state.markers.set(stop.id,marker)}else if(marker.signature!==signature){marker.ring.setStyle(shape);marker.ring.setRadius(size);marker.tap.setRadius(touch);marker.tap.setPopupContent(popup('Stop '+stop.name,details));marker.signature=signature}}
 for(const [id,m] of state.markers)if(!active.has(id)&&!m.tap.isPopupOpen())removeBus(id,m)}
async function loadBizi(force=false){if(!state.liveMode||!$('showBizi').checked)return;const epoch=state.liveEpoch;if(!force&&state.stations.length&&Date.now()-state.bikeFetched<60000){bikeMarkers();return}state.bikeError='';try{const feed=await getJson(BIZI_GBFS);const feeds=feed.data?.feeds||Object.values(feed.data||{}).find(x=>Array.isArray(x?.feeds))?.feeds||[];const info=feeds.find(x=>x.name==='station_information')?.url,status=feeds.find(x=>x.name==='station_status')?.url;if(!info||!status)throw Error('Missing GBFS feeds');const [i,s]=await Promise.all([getJson(info),getJson(status)]),statuses=new Map(asItems(s).map(a=>[String(a.station_id),a]));if(epoch!==state.liveEpoch||!state.liveMode)return;state.stations=asItems(i).map(x=>{const a=statuses.get(String(x.station_id))||{},n=a.num_vehicles_available??a.num_bikes_available,d=a.num_vehicles_disabled??a.num_bikes_disabled,k=a.num_docks_available;return {name:typeof x.name==='string'?x.name:String(x.station_id),coords:coordsOf(x),available:n!=null&&Number.isFinite(+n)?+n:null,disabled:d!=null&&Number.isFinite(+d)?+d:null,docks:k!=null&&Number.isFinite(+k)?+k:null}}).filter(x=>x.coords);if(!state.stations.length)throw Error('No station coordinates');state.bikeSource='GBFS';}catch(err){try{const found=[];for(let start=0;start<4000;start+=500){const batch=asItems(await getJson(`${BIZI_FALLBACK}.json?rows=500&start=${start}&srsname=wgs84`));for(const st of batch){const coords=coordsOf(st);if(!coords)continue;const n=st.bicisDisponibles,k=st.anclajesDisponibles;found.push({name:String(st.title??st.nombre??st.id),coords,available:n!=null&&Number.isFinite(+n)?+n:null,disabled:null,docks:k!=null&&Number.isFinite(+k)?+k:null})}if(batch.length<500)break}if(!found.length)throw Error('No municipal station data');if(epoch!==state.liveEpoch||!state.liveMode)return;state.stations=found;state.bikeSource='Municipal API (out-of-service status unknown)';}catch(e){if(epoch!==state.liveEpoch||!state.liveMode)return;state.bikeError=e.message;state.stations=[];state.bikeSource=''}}state.bikeFetched=Date.now();bikeMarkers();report()}
async function loadStops(force=false){if(!state.liveMode||!$('showBus').checked)return;const epoch=state.liveEpoch;if(!force&&state.stops.length&&Date.now()-state.busFetched<3600000){busMarkers();void loadVisibleBusETAs();return}try{const out=[],seen=new Set();for(let start=0;start<4000;start+=500){const batch=asItems(await getJson(`${BUS_API}.json?rows=500&start=${start}&srsname=wgs84`));for(const st of batch){const id=stopId(st),coords=coordsOf(st);if(!id||!coords||seen.has(id))continue;seen.add(id);out.push({id,coords,name:String(st.title??st.nombre??st.name??id),arrivals:[],checked:0,apiResult:'pending'})}if(batch.length<500)break}if(!out.length)throw Error('No bus stops returned');if(epoch!==state.liveEpoch||!state.liveMode)return;state.stops=out;state.busFetched=Date.now();state.busError='';void loadVisibleBusETAs()}catch(e){if(epoch!==state.liveEpoch||!state.liveMode)return;state.busError=e.message;report()}}
async function loadVisibleBusETAs(){if(!state.liveMode)return;if(state.busLoading){state.busReloadRequested=true;return}if(!state.map||!$('showBus').checked||state.map.getZoom()<12||!state.stops.length)return;state.busLoading=true;state.busReloadRequested=false;try{while($('showBus').checked&&state.map.getZoom()>=12){const now=Date.now(),bounds=state.map.getBounds().pad(.12),visible=state.stops.filter(x=>x.id.startsWith('tuzsa-')&&bounds.contains(x.coords)),pending=visible.filter(x=>now-x.checked>60000);if(!pending.length)break;const batch=pending.slice(0,48);report();await Promise.all(Array.from({length:6},async(_,worker)=>{for(let i=worker;i<batch.length;i+=6){const st=batch[i];try{let result;for(let attempt=0;attempt<2;attempt++){try{result=await getJson(`${BUS_API}/${encodeURIComponent(st.id)}.json`);break}catch(e){if(attempt)throw e;await new Promise(resolve=>setTimeout(resolve,350))}}st.arrivals=parseBusLines(result);st.apiResult=st.arrivals.some(a=>a.minutes!==null)?'known':'unknown';st.checked=Date.now()}catch{st.arrivals=[];st.apiResult='error';st.checked=Date.now()-30000}}}));busMarkers();report();if(pending.length>48)await new Promise(resolve=>setTimeout(resolve,350))}}finally{state.busLoading=false;report();if(state.busReloadRequested){state.busReloadRequested=false;void loadVisibleBusETAs()}}}
function refresh(force=false){
 if(!state.liveMode){
  if(force)void loadLatestSnapshot(true);
  else {bikeMarkers();busMarkers();report()}
  return;
 }
 if($('showBizi').checked)void loadBizi(force);else state.bl.clearLayers();
 if($('showBus').checked)void loadStops(force);else {for(const [id,m] of state.markers)removeBus(id,m)}
 report();
}
function initMap(){state.map=L.map('map',{zoomControl:false}).setView([41.6488,-0.8891],14);L.control.zoom({position:'bottomright'}).addTo(state.map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(state.map);state.map.createPane('busPane');state.map.getPane('busPane').style.zIndex='390';state.bl=L.layerGroup().addTo(state.map);state.sl=L.layerGroup().addTo(state.map);state.map.on('moveend',()=>{busMarkers();void loadVisibleBusETAs()})}
function applyRecordedFrame(frame){
 state.liveMode=false;state.liveEpoch++;
 state.snapshotAt=frame?.at||null;
 state.snapshotBusAt=frame?.bus?.capturedAt||((frame?.bus?.status==='ok')?frame.at:null);
 state.snapshotBiziAt=frame?.bizi?.capturedAt||((frame?.bizi?.status==='ok')?frame.at:null);
 state.snapshotBusPopulation=frame?.bus?.population||0;
 state.snapshotBusSampled=frame?.bus?.sampled||0;
 state.stations=(frame?.bizi?.stations||[]).filter(x=>Array.isArray(x.coords)&&x.coords.length===2).map(x=>({
  name:String(x.name??x.id),coords:x.coords,available:x.available??null,disabled:x.disabled??null,docks:x.docks??null
 }));
 state.stops=(frame?.bus?.stops||[]).filter(x=>Array.isArray(x.coords)&&x.coords.length===2).map(x=>({
  id:String(x.id),name:String(x.name??x.id),coords:x.coords,
  arrivals:Array.isArray(x.arrivals)?x.arrivals.map(a=>({line:String(a.line),minutes:a.minutes??null})):[],
  checked:1,apiResult:x.status||'unknown'
 }));
 state.bikeSource=state.snapshotBiziAt?'Recorded GBFS':'';
 state.bikeError='';state.busError='';
 for(const [id,marker] of state.markers)removeBus(id,marker);
 bikeMarkers();busMarkers();report();
 $('timelineLabel').textContent=(state.selectedFrameIndex===null?'Latest available capture · ':'Historical capture · ')+formatSnapshotTime(frame?.at);
 $('timelineBadge').textContent='Recorded · no live requests';
 $('liveButton').textContent='Fetch live data ↗';
 const bus=state.snapshotBusAt?'Bus '+formatSnapshotTime(state.snapshotBusAt):'No bus measurements';
 const bikes=state.snapshotBiziAt?'Bizi '+formatSnapshotTime(state.snapshotBiziAt):'No Bizi measurements';
 $('timelineCoverage').textContent=bus+' · '+bikes+' · '+state.snapshotBusSampled+' sampled stops';
}
async function loadLatestSnapshot(force=false){
 try{
  const frame=await getJson('./history/latest.json'+(force?'?t='+Date.now():''));
  if(frame?.schema!==1||!frame.at||!Number.isFinite(Date.parse(frame.at)))throw Error('No completed capture');
  state.latest=frame;
  if(!state.liveMode&&state.selectedFrameIndex===null)applyRecordedFrame(frame);
 }catch(e){
  if(!state.latest&&!state.liveMode){
   state.snapshotAt=null;
   $('timelineLabel').textContent='Awaiting first scheduled capture';
   $('timelineCoverage').textContent='The timeline will populate after a successful collection';
   report();
  }
 }
}
async function loadTimeline(force=false){
 if(state.timelineLoading||state.timeline&&!force)return;
 state.timelineLoading=true;
 try{
  const data=await getJson('./history/timeline.json'+(force?'?t='+Date.now():''));
  if(data?.schema!==1||!Array.isArray(data.frames))throw Error('Invalid timeline');
  const frames=data.frames.filter(f=>f?.at&&Number.isFinite(Date.parse(f.at))).sort((a,b)=>a.at.localeCompare(b.at));
  state.timeline=frames;
  const slider=$('timelineSlider');
  slider.max=String(Math.max(0,frames.length-1));
  slider.value=String(frames.length-1);
  slider.disabled=!frames.length;
  $('timelinePrev').disabled=frames.length<2;
  $('timelineNext').disabled=frames.length<2;
  if(!frames.length&&state.latest)$('timelineCoverage').textContent='Timeline will populate as scheduled captures accumulate';
 }catch(e){$('timelineCoverage').textContent='Recorded timeline not available yet'}
 finally{state.timelineLoading=false}
}
function chooseFrame(index){
 const frames=state.timeline||[];
 if(!frames.length)return;
 const clamped=Math.max(0,Math.min(frames.length-1,Number(index)||0));
 $('timelineSlider').value=String(clamped);
 state.selectedFrameIndex=clamped===frames.length-1?null:clamped;
 applyRecordedFrame(state.selectedFrameIndex===null?(state.latest||frames[clamped]):frames[clamped]);
}
function jumpToLatest(){
 state.selectedFrameIndex=null;
 const frames=state.timeline||[];
 $('timelineSlider').value=String(Math.max(0,frames.length-1));
 if(state.latest)applyRecordedFrame(state.latest);
 else if(frames.length)applyRecordedFrame(frames[frames.length-1]);
}
function toggleLive(){
 if(state.liveMode){jumpToLatest();return}
 state.liveMode=true;state.liveEpoch++;
 state.selectedFrameIndex=null;state.snapshotAt=null;
 state.stations=[];state.stops=[];
 state.busFetched=0;state.bikeFetched=0;state.busError='';state.bikeError='';
 for(const [id,marker] of state.markers)removeBus(id,marker);
 bikeMarkers();
 $('timelineLabel').textContent='Fetching live readings on demand…';
 $('timelineBadge').textContent='Live · manual request';
 $('timelineCoverage').textContent='These readings are not part of the recorded timeline';
 $('liveButton').textContent='Return to recorded data';
 refresh(true);
}
async function loadBusRankings(){
 const render=(id,items,type)=>{
  const el=$(id);el.replaceChildren();
  if(!items.length){el.textContent='Not enough measurements for a reliable ranking yet.';return}
  const table=document.createElement('table');table.className='ranking-table';
  const head=document.createElement('thead'),heading=document.createElement('tr');
  for(const name of [type==='line'?'Route':'Stop','Predictions','>15 min','Percentage']){const th=document.createElement('th');th.textContent=name;heading.append(th)}
  head.append(heading);table.append(head);const body=document.createElement('tbody');
  for(const [name,v] of items){const tr=document.createElement('tr');for(const val of [name,v.samples,v.over15,(100*v.over15/v.samples).toFixed(1)+' %']){const td=document.createElement('td');td.textContent=val;tr.append(td)}body.append(tr)}
  table.append(body);el.append(table);
 };
 try{
  const data=await getJson('./history/bus-details.json');
  const sorted=entries=>entries.filter(([,x])=>x.samples>=20).sort((a,b)=>b[1].over15/b[1].samples-a[1].over15/a[1].samples||b[1].samples-a[1].samples).slice(0,15);
  render('lineRanking',sorted(Object.entries(data.lines||{})),'line');
  render('stopRanking',sorted(Object.entries(data.stops||{}).map(([id,x])=>[id,{samples:x.estimates,over15:x.over15}])),'stop');
 }catch(e){$('lineRanking').textContent='Could not load rankings: '+e.message;$('stopRanking').textContent='Could not load rankings.'}
}
async function loadHistory(){
 void loadBusRankings();
 const status=$('historyStatus');
 try{
  const rows=await getJson('./history/snapshots.json');
  if(!Array.isArray(rows))throw Error('Invalid history format');
  const recent=rows.slice(-336);
  const dates=recent.map(x=>new Date(x.at).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
  const series=[
   ['historyBiziChart',recent.map(x=>x.bizi?.status==='ok'?x.bizi.empty:null)],
   ['historyBusChart',recent.map(x=>x.bus?.status==='ok'&&x.bus.estimates>0?Math.round(1000*x.bus.over15/x.bus.estimates)/10:null)],
   ['historyErrorsChart',recent.map(x=>x.bus?.status==='ok'?x.bus.errors:null)]
  ];
  for(const [id,data] of series){
   if(!window.Chart)continue;
   state.charts[id]?.destroy();
   state.charts[id]=new window.Chart($(id),{type:'line',data:{labels:dates,datasets:[{data,label:id==='historyBiziChart'?'Empty stations':id==='historyBusChart'?'% of predictions':'API errors',borderColor:'#16558c',backgroundColor:'#16558c',pointRadius:0,spanGaps:false,tension:.15}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true}},plugins:{legend:{display:false}}}});
  }
  const first=rows[0]?.at,last=rows.at(-1)?.at;
  status.textContent=rows.length?`${rows.length} snapshots recorded · from ${new Date(first).toLocaleString('en-GB')} to ${new Date(last).toLocaleString('en-GB')} · showing the latest ${recent.length}`:'No measurements yet. The first snapshot will appear after the scheduled workflow runs.';
 }catch(e){status.textContent='Could not load history: '+e.message}
}

function zaragozaToday(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=kind=>parts.find(x=>x.type===kind)?.value;
 return [value('year'),value('month'),value('day')].join('-');
}
function displayIncidentDate(value){
 if(!value)return 'Not published';
 const [year,month,day]=value.split('-');
 return [day,month,year].join('/');
}
function incidentColor(type){return {traffic:'#e15d65',water:'#5188e2',major:'#d99236',other:'#7b8699'}[type]||'#7b8699'}
function makeText(tag,content,className){
 const el=document.createElement(tag);el.textContent=content;if(className)el.className=className;return el;
}
function renderIncidentMap(items){
 if(!state.incidentMap)return;
 state.incidentLayer.clearLayers();
 const positions=[];
 for(const issue of items){
  if(!issue.coords)continue;
  const marker=L.circleMarker(issue.coords,{radius:9,color:'#fff',weight:2,fillColor:incidentColor(issue.type),fillOpacity:.94});
  const details=[[incidentTypes[issue.type]],['From: '+displayIncidentDate(issue.start)],['Planned until: '+displayIncidentDate(issue.end)]];
  marker.bindPopup(popup(issue.title,details)).addTo(state.incidentLayer);
  positions.push(issue.coords);
 }
 $('incidentMapCount').textContent=positions.length+' mapped';
 if(positions.length&&!state.incidentMapFitted){
  state.incidentMap.fitBounds(L.latLngBounds(positions).pad(.2),{maxZoom:13});
  state.incidentMapFitted=true;
 }
}
function initIncidentMap(){
 if(state.incidentMap||!window.L)return;
 state.incidentMap=L.map('incidentMap',{zoomControl:false}).setView([41.6488,-0.8891],12);
 L.control.zoom({position:'bottomright'}).addTo(state.incidentMap);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(state.incidentMap);
 state.incidentLayer=L.layerGroup().addTo(state.incidentMap);
 renderIncidents();
}
function renderIncidents(){
 const ready=Boolean(state.incidentFetched);
 const today=zaragozaToday(),items=state.incidents;
 const active=items.filter(x=>incidentPhase(x,today)==='active');
 const upcoming=items.filter(x=>incidentPhase(x,today)==='upcoming');
 renderMetricCards('incidentKpis',[
  ['Active notices',ready?active.length:'—','Based on published start and end dates'],
  ['Upcoming notices',ready?upcoming.length:'—','Future planned disruptions'],
  ['Traffic closures',ready?active.filter(x=>x.type==='traffic').length:'—','Active notices only'],
  ['Water outages',ready?active.filter(x=>x.type==='water').length:'—','Active notices only']
 ]);
 $('overviewIncidents').textContent=ready?active.length:'—';
 if(!ready){$('incidentStatus').textContent=state.incidentError||'Loading official incident notices…';return}
 const category=$('incidentType').value,phase=$('incidentPhase').value,term=$('incidentSearch').value.trim().toLocaleLowerCase();
 const shown=items.filter(x=>(category==='all'||x.type===category)&&(phase==='all'||incidentPhase(x,today)===phase)&&(!term||(x.title+' '+x.street).toLocaleLowerCase().includes(term))).sort((a,b)=>a.title.localeCompare(b.title,'en'));
 const total=state.incidentTotal;
 $('incidentStatus').textContent=shown.length+' matching notices · '+items.length+(total>items.length?' of '+total:'')+' published records retrieved. Dates are planned, not confirmed completion times.';
 $('incidentUpdated').textContent=state.incidentSource+' · checked '+new Date(state.incidentFetched).toLocaleString('en-GB')+(state.incidentError?' · Live source currently unavailable':'');
 const list=$('incidentList');list.replaceChildren();
 $('incidentListCount').textContent=shown.length+' notices';
 if(!shown.length)list.append(makeText('p','No matching notices in the retrieved data.','empty-state'));
 for(const issue of shown.slice(0,150)){
  const card=document.createElement('article');card.className='incident-card';
  const meta=document.createElement('div');meta.className='incident-tags';
  const kind=makeText('span',incidentTypes[issue.type],'incident-type');kind.style.setProperty('--issue-color',incidentColor(issue.type));
  meta.append(kind,makeText('span',({active:'Active today',upcoming:'Upcoming',ended:'Past',unknown:'Dates unavailable'})[incidentPhase(issue,today)],'incident-phase'));
  card.append(meta,makeText('h3',issue.title));
  if(issue.street&&issue.street!==issue.title)card.append(makeText('p',issue.street,'incident-address'));
  card.append(makeText('p','From '+displayIncidentDate(issue.start)+' · Planned until '+displayIncidentDate(issue.end),'incident-dates'));
  if(issue.link){const link=document.createElement('a');link.href=issue.link;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View official notice ↗';card.append(link)}
  list.append(card);
 }
 if(shown.length>150)list.append(makeText('p','Showing the first 150 matches. Narrow the filters to see more.','fineprint'));
 renderIncidentMap(shown);
}
async function loadIncidents(force=false){
 if(state.incidentLoading)return;
 if(!force&&state.incidentFetched&&Date.now()-state.incidentFetched<300000){renderIncidents();return}
 state.incidentLoading=true;state.incidentError='';
 let data,source='Live City API',fetched=Date.now();
 try{
  data=await getJson(INCIDENT_API+'.json?rows=500&start=0&srsname=wgs84');
  if(!Array.isArray(data?.result)&&!Array.isArray(data))throw Error('Unexpected municipal response');
 }catch(err){
  try{
   data=await getJson('./history/incidents.json');
   if(!data?.fetchedAt||!Array.isArray(data?.items))throw Error('No cached incident snapshot');
   fetched=Date.parse(data.fetchedAt);
   if(!Number.isFinite(fetched))throw Error('Invalid snapshot timestamp');
   source='Saved municipal snapshot';state.incidentError=err.message;
  }catch{state.incidentLoading=false;state.incidentError='Incident data is currently unavailable. Try again later.';renderIncidents();return}
 }
 const raw=Array.isArray(data)?data:data.result??data.items;
 state.incidents=normalizeIncidents(raw);
 state.incidentTotal=Number.isFinite(Number(data.totalCount))?Number(data.totalCount):raw.length;
 state.incidentFetched=fetched;state.incidentSource=source;
 state.incidentLoading=false;
 renderIncidents();
}
function selectView(view){
 const views=['overview','buses','bizi','incidents','history','method'];
 if(!views.includes(view))view='overview';
 for(const button of document.querySelectorAll('[data-view]')){
  const active=button.dataset.view===view;
  button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
 }
 for(const name of views)$(name+'View').classList.toggle('hidden',name!==view);
 if(['overview','buses','bizi'].includes(view)){
  $(view+'MapHost').append($('mapWorkspace'));
  $('mapTitle').textContent=view==='buses'?'Recorded bus predictions':view==='bizi'?'Recorded Bizi stations':'Recorded service map';
  $('showBus').checked=view!=='bizi';$('showBizi').checked=view!=='buses';
  $('brokenOnly').checked=false;
  if(state.liveMode)refresh(false);else {bikeMarkers();busMarkers();report()}
  requestAnimationFrame(()=>{state.map?.invalidateSize();bikeMarkers();busMarkers();for(const chart of Object.values(state.charts))chart.resize()});
 }else if(view==='incidents'){
  void loadIncidents();
  requestAnimationFrame(()=>{initIncidentMap();state.incidentMap?.invalidateSize();renderIncidents()});
 }else if(view==='history'){
  void loadHistory();
  requestAnimationFrame(()=>{for(const chart of Object.values(state.charts))chart.resize()});
 }
 if(location.hash.slice(1)!==view)history.replaceState(null,'','#'+view);
}
for(const button of document.querySelectorAll('[data-view]')){
 button.addEventListener('click',()=>selectView(button.dataset.view));
 button.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
  e.preventDefault();
  const tabs=[...document.querySelectorAll('[data-view]')],index=tabs.indexOf(button);
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  selectView(tabs[next].dataset.view);tabs[next].focus();
 });
}
$('openIncidents').addEventListener('click',()=>selectView('incidents'));
$('refresh').addEventListener('click',()=>refresh(true));
$('showBizi').addEventListener('change',()=>refresh(false));
$('showBus').addEventListener('change',()=>refresh(false));
$('brokenOnly').addEventListener('change',()=>{if(!$('showBizi').checked)$('showBizi').checked=true;bikeMarkers();if(!state.stations.length)void loadBizi()});
$('incidentRefresh').addEventListener('click',()=>void loadIncidents(true));
for(const id of ['incidentType','incidentPhase','incidentSearch'])$(id).addEventListener(id==='incidentSearch'?'input':'change',renderIncidents);
$('overviewMapHost').append($('mapWorkspace'));
$('timelineSlider').addEventListener('input',e=>chooseFrame(e.target.value));
$('timelinePrev').addEventListener('click',()=>chooseFrame(Number($('timelineSlider').value)-1));
$('timelineNext').addEventListener('click',()=>chooseFrame(Number($('timelineSlider').value)+1));
$('timelineLatest').addEventListener('click',jumpToLatest);
$('liveButton').addEventListener('click',toggleLive);
initMap();
report();
void loadLatestSnapshot();
void loadIncidents();
setTimeout(()=>void loadTimeline(),400);
if(['overview','buses','bizi','incidents','history','method'].includes(location.hash.slice(1)))selectView(location.hash.slice(1));
setInterval(()=>{
 if(document.hidden)return;
 if(state.liveMode)refresh();
 else if(state.selectedFrameIndex===null)void loadLatestSnapshot(true);
 if(state.incidentFetched)void loadIncidents();
},300000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.liveMode&&state.selectedFrameIndex===null)void loadLatestSnapshot(true)});
if(location.hostname==='localhost'||location.hostname==='127.0.0.1')window.__observatoryTest={state,refresh,loadVisibleBusETAs,selectView,loadIncidents,loadLatestSnapshot,chooseFrame};
