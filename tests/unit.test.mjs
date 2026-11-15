import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 parseBusLines,minutesOf,stopId,summarizeBikes,summarizeBuses,
 incidentCoords,incidentPhase,normalizeIncidents,stationName,INCIDENT_API,BIZI_LOW_MAX,repairTimelineStationNames
} from '../site/data.js';

test('each route retains its next arrival, including unavailable predictions',()=>{
 assert.deepEqual(parseBusLines({destinos:[
  {linea:'23',primero:'6 min',segundo:'28 min'},
  {linea:'35',primero:'22 minutos',segundo:'40 min'},
  {linea:'40',primero:'Sin información'}
 ]}),[{line:'23',minutes:6},{line:'35',minutes:22},{line:'40',minutes:null}]);
});
test('nested arrival records retain their route number',()=>{
 assert.deepEqual(parseBusLines({result:[{linea:'5',tiempos:[{minutos:12}]}]}),[{line:'5',minutes:12}]);
});
test('Spanish municipal arrival strings remain valid API input',()=>{
 assert.equal(minutesOf('sin información'),null);
 assert.equal(minutesOf('En la parada'),0);
 assert.equal(minutesOf('22 minutos'),22);
 assert.equal(stopId({id:'https://example.com/tuzsa-798'}),'tuzsa-798');
});
test('missing Bizi fault counts are not silently interpreted as zero',()=>{
 const x=summarizeBikes([{available:3,disabled:2},{available:0,disabled:null},{available:null,disabled:null}]);
 assert.equal(x.faultKnown,1);
 assert.equal(x.faultTotal,2);
 assert.equal(x.pairedStations,1);
 assert.equal(x.empty,1);
});
test('predictions over 15 minutes are counted per route, not per stop',()=>{
 const x=summarizeBuses([{arrivals:[{line:'23',minutes:6},{line:'35',minutes:22},{line:'40',minutes:null}],checked:10,apiResult:'known'}]);
 assert.equal(x.long,1);
 assert.equal(x.estimates,2);
 assert.equal(x.withETA,1);
});
test('incident coordinates accept WGS84 and municipal UTM zone 30N',()=>{
 assert.deepEqual(incidentCoords({geometry:{coordinates:[-0.889,41.65]}}),[41.65,-0.889]);
 const point=incidentCoords({geometry:{coordinates:[676848.74,4613403.44]}});
 assert.ok(Math.abs(point[0]-41.653)<0.005);
 assert.ok(Math.abs(point[1]+0.876)<0.005);
 assert.equal(incidentCoords({geometry:{coordinates:[0,99999999]}}),null);
});
test('incident phase uses scheduled ranges, including both boundary dates',()=>{
 const issue={start:'2026-11-01',end:'2026-11-30'};
 assert.equal(incidentPhase(issue,'2026-10-31'),'upcoming');
 assert.equal(incidentPhase(issue,'2026-11-01'),'active');
 assert.equal(incidentPhase(issue,'2026-11-30'),'active');
 assert.equal(incidentPhase(issue,'2026-12-01'),'ended');
 assert.equal(incidentPhase({start:null,end:null},'2026-11-08'),'unknown');
});
test('incident normalization preserves official names while rejecting unsafe links',()=>{
 const items=normalizeIncidents([
  {id:2,title:'ROADWORKS',tipo:{id:1},inicio:'2026-11-01',fin:'2026-11-30',uri:'https://www.zaragoza.es/sede/servicio/incidencia/via-publica/2'},
  {id:2,title:'ROADWORKS',tipo:{id:1}},
  {id:3,title:'WATER OUTAGE',tipo:{id:0},uri:'https://example.com/malicious'}
 ]);
 assert.equal(items.length,2);
 assert.equal(items[0].type,'traffic');
 assert.equal(items[1].type,'water');
 assert.equal(items[1].link,null);
 assert.equal(items[0].start,'2026-11-01');
});

test('incident API uses the current official municipal route',()=>{
 assert.equal(INCIDENT_API,'https://www.zaragoza.es/sede/servicio/via-publica/incidencia');
});
test('GBFS multilingual labels and old invalid labels never render as objects',()=>{
 assert.equal(stationName([{language:'es',text:'Plaza de España'},{language:'en',text:'Spain Square'}],'2'),'Spain Square');
 assert.equal(stationName([{language:'es',text:'Plaza de España'}],'2'),'Plaza de España');
 assert.equal(stationName('[object Object],[object Object]','2'),'2');
});

test('Bizi low-availability category includes four bikes but not five',()=>{
 assert.equal(BIZI_LOW_MAX,4);
 const stations=[null,0,1,2,3,4,5,8].map(available=>({available,disabled:null}));
 const summary=summarizeBikes(stations);
 assert.equal(summary.known,7);
 assert.equal(summary.empty,1);
 assert.equal(summary.low,4);
 assert.equal(summary.good,2);
 assert.equal(summary.available,23);
});

test('legacy timeline labels are repaired without changing observed measurements',()=>{
 const frames=[{at:'2026-11-08T20:44:00Z',bizi:{status:'ok',stations:[{id:'2',name:'[object Object]',available:8,disabled:0},{id:'3',name:'Original',available:4}]}}];
 const repaired=repairTimelineStationNames(frames,[{id:'2',name:'1-Palacio Congresos'},{id:'3',name:'Updated'}]);
 assert.equal(repaired[0].bizi.stations[0].name,'1-Palacio Congresos');
 assert.equal(repaired[0].bizi.stations[0].available,8);
 assert.equal(repaired[0].bizi.stations[1].name,'Original');
 assert.equal(frames[0].bizi.stations[0].name,'[object Object]');
 assert.equal(repaired[0].at,frames[0].at);
});

import {parseAvanzaArrivals,fetchAvanzaArrivals,AVANZA_URL,AVANZA_TIMEOUT_MS} from '../scripts/avanza-arrivals.mjs';
test('Avanza arrivals are retained only when vehicle identifiers agree',()=>{
 const body='<li><a href="#"><strong>039<i></i>VADORREY</strong></a><ul><li><a href="https://gps.avanzabus.com/zaragoza/fParadas/744/9001"><i></i>9001 [3 mins]</a></li></ul></li>';
 const row={tablatiempos:body,maquinas:{'0':{icon:'/img/bus_rojo.png'},'1':{icon:'/img/bus.png',title:'039 9001'}}};
 assert.deepEqual(parseAvanzaArrivals(row),[{line:'39',minutes:3,destination:'VADORREY',vehicle:'9001'}]);
 assert.deepEqual(parseAvanzaArrivals({tablatiempos:''}),[]);
 assert.throws(()=>parseAvanzaArrivals({...row,maquinas:{}}),/could not be verified/);
 assert.throws(()=>parseAvanzaArrivals({...row,tablatiempos:body.replace('[3 mins]','[999 mins]')}),/could not be verified/);
 assert.throws(()=>parseAvanzaArrivals({message:'error'}),/Invalid Avanza response/);
});
test('Avanza transport uses the published stop POST parameters',async()=>{
 let call;
 const rows=await fetchAvanzaArrivals(744,async(url,options)=>{call={url,options};return {ok:true,text:async()=>JSON.stringify({tablatiempos:''})}});
 assert.deepEqual(rows,[]);
 assert.equal(call.url,AVANZA_URL);
 assert.equal(call.options.method,'POST');
 assert.equal(AVANZA_TIMEOUT_MS,10000);
 assert.equal(new URLSearchParams(call.options.body).get('poste'),'744');
 assert.equal(new URLSearchParams(call.options.body).get('coche'),'0');
});

import {BUS_SAMPLE_LIMIT,HISTORY_BUS_SAMPLE_LIMIT,selectBusSample,serializeBusArrivals} from '../scripts/bus-sampling.mjs';
test('operator observations retain every vehicle for the same route and validate duplicates',()=>{
 const body='<li><strong>039<i></i>VADORREY</strong><ul><li><a href="/zaragoza/fParadas/744/9001">9001 [3 mins]</a></li><li><a href="/zaragoza/fParadas/744/9002">9002 [11 mins]</a></li></ul></li>';
 const markers={'0':{icon:'/img/bus.png',title:'039 9001'},'1':{icon:'/img/bus.png',title:'039 9002'}};
 const actual=parseAvanzaArrivals({tablatiempos:body,maquinas:markers});
 assert.equal(actual.length,2);
 assert.deepEqual(actual.map(x=>x.minutes),[3,11]);
 assert.deepEqual(actual.map(x=>x.vehicle),['9001','9002']);
 const partial=parseAvanzaArrivals({tablatiempos:body.replace('/744/9002','/744/9001').replace('9002 [11 mins]','9001 [11 mins]'),maquinas:markers});
 assert.deepEqual(partial.map(x=>x.vehicle),['9001']);
 assert.equal(partial[0].minutes,3);
 assert.deepEqual(parseAvanzaArrivals({tablatiempos:body.replace(/<a href="[^"]+">9002 \[11 mins\]<\/a>/,'').replace('<li></li>',''),maquinas:markers}).map(x=>x.vehicle),['9001']);
});
test('rotating bus-stop sampling covers all stops despite missing scheduled invocations',()=>{
 const stops=Array.from({length:983},(_,i)=>({id:'tuzsa-'+(i+1)}));
 let cursor=0;const selected=new Set();
 for(let capture=0;capture<6;capture++){
  const selection=selectBusSample(stops,cursor,BUS_SAMPLE_LIMIT);
  assert.equal(selection.size,stops.length);
  assert.equal(new Set(selection.sample.map(x=>x.id)).size,stops.length);
  if(capture===0)assert.ok(Number(selection.sample.at(-1).id.slice(6))>700,'first capture spans the stop catalogue');
  for(const s of selection.sample)selected.add(s.id);
  cursor=selection.nextOffset;
 }
 assert.equal(selected.size,983);
 assert.equal(selectBusSample([],0).size,0);
 assert.equal(selectBusSample(stops,'invalid').sample[0].id,'tuzsa-1');
 assert.equal(HISTORY_BUS_SAMPLE_LIMIT,180);
 let historyCursor=0;const historicalStops=new Set();
 for(let capture=0;capture<6;capture++){
  const selection=selectBusSample(stops,historyCursor,HISTORY_BUS_SAMPLE_LIMIT);
  assert.equal(selection.size,180);
  for(const stop of selection.sample)historicalStops.add(stop.id);
  historyCursor=selection.nextOffset;
 }
 assert.equal(historicalStops.size,983);
});
test('Bizi station thresholds include zero and exclude five bikes',()=>{
 const value=summarizeBikes([0,1,2,3,4,5,null].map(available=>({available,disabled:null})));
 assert.equal(value.underFive,5);
 assert.equal(value.underTwo,2);
});

import {analyzeBikeHistory} from '../site/history-analysis.js';
test('historical low-bike and out-of-service durations are interval estimates, not asserted repair times',()=>{
 const t=['2026-11-09T10:00:00Z','2026-11-09T10:30:00Z','2026-11-09T11:00:00Z','2026-11-09T11:30:00Z'];
 const frames=t.map((at,i)=>({at,bizi:{status:'ok',stations:[
  {id:'a',name:'Station A',available:[3,1,1,4][i],disabled:[0,2,1,0][i]},
  {id:'b',name:'Station B',available:0,disabled:1}
 ]}}));
 const result=analyzeBikeHistory(frames);
 assert.equal(result.frames,4);
 assert.equal(result.last.underFive,2);
 assert.equal(result.last.underTwo,1);
 assert.equal(result.last.affectedStations,1);
 assert.equal(result.low.completed,1);
 assert.equal(result.faults.completed,1);
 assert.equal(result.low.meanMinutes,60);
 assert.equal(result.low.meanLowerMinutes,30);
 assert.equal(result.low.meanUpperMinutes,90);
 assert.equal(result.faults.meanMinutes,60);
 assert.equal(result.low.censored,1);
 assert.equal(result.faults.censored,1);
 assert.equal(result.ranked[0].id,'b');
 assert.equal(result.ranked[0].share,1);
});
test('history does not bridge missed captures, missing values or right-censored episodes',()=>{
 const t=['2026-11-09T10:00:00Z','2026-11-09T10:30:00Z','2026-11-09T13:00:00Z'];
 const frames=t.map((at,i)=>({at,bizi:{status:'ok',stations:[{id:'a',available:[4,1,4][i],disabled:[0,2,0][i]}]}}));
 const result=analyzeBikeHistory(frames);
 assert.equal(result.low.completed,0);
 assert.equal(result.faults.completed,0);
 assert.equal(result.low.meanMinutes,null);
 assert.equal(result.faults.meanMinutes,null);
 assert.equal(result.largeGaps,1);
 const missing=analyzeBikeHistory([
  {at:t[0],bizi:{status:'ok',stations:[{id:'a',available:4,disabled:0}]}},
  {at:t[1],bizi:{status:'ok',stations:[{id:'a',available:null,disabled:null}]}},
  {at:'2026-11-09T11:00:00Z',bizi:{status:'ok',stations:[{id:'a',available:0,disabled:1}]}},
  {at:'2026-11-09T11:30:00Z',bizi:{status:'ok',stations:[{id:'a',available:4,disabled:0}]}}
 ]);
 assert.equal(missing.low.completed,0);
 assert.equal(missing.faults.completed,0);
 assert.equal(analyzeBikeHistory([]).frames,0);
});

test('captured bus records keep every vehicle and destination without inventing missing metadata',()=>{
 const source=[
  {line:'39',minutes:3,vehicle:'9001',destination:'VADORREY'},
  {line:'39',minutes:11,vehicle:'9002',destination:'VADORREY'},
  {line:'23',minutes:5}
 ];
 assert.deepEqual(serializeBusArrivals(source),source);
 assert.equal(serializeBusArrivals(source).length,3);
 assert.deepEqual(serializeBusArrivals([{line:'31',minutes:null}]),[{line:'31',minutes:null}]);
});


import {resolveLanguage,translateText} from '../site/i18n.js';
test('Spanish is selected only when the primary browser language is Spanish',()=>{
 for(const value of ['es','es-ES','es-MX','es-419','ES_es'])assert.equal(resolveLanguage(value),'es-ES');
 for(const value of ['en','en-US','en-GB','fr-FR','de-DE','ca-ES','zh-CN',''])assert.equal(resolveLanguage(value),'en');
});
test('Spanish interface messages retain official provider names and interpolate real counts',()=>{
 assert.equal(translateText('Available bikes','es-ES'),'Bicicletas disponibles');
 assert.equal(translateText('2 of 3 stations reporting','es-ES'),'2 de 3 estaciones con datos');
 assert.equal(translateText('Route 23 → CENTER · vehicle 9001: 4 min','es-ES'),'Línea 23 → CENTER · vehículo 9001: 4 min');
 assert.equal(translateText('More information about Observatory','es-ES'),'Más información sobre Observatory');
 assert.equal(translateText('Plaza del Pilar','es-ES'),'Plaza del Pilar');
 assert.equal(translateText('Available bikes','en'),'Available bikes');
 assert.equal(translateText('Available bikes','fr-FR'),'Available bikes');
});

test('partially malformed Avanza response retains independently verified arrivals',()=>{
 const rows='<strong>039<i></i>VADORREY</strong><a href="/zaragoza/fParadas/744/9001">9001 [2 mins]</a><a href="/zaragoza/fParadas/744/9002">9002 [999 mins]</a><strong>bad heading</strong>';
 const maquinas={'0':{icon:'/img/bus.png',title:'039 9001'},'1':{icon:'/img/bus.png',title:'039 9002'}};
 assert.deepEqual(parseAvanzaArrivals({tablatiempos:rows,maquinas}),[{line:'39',minutes:2,destination:'VADORREY',vehicle:'9001'}]);
 assert.deepEqual(parseAvanzaArrivals({tablatiempos:rows.replace('[2 mins]','[-1 mins]'),maquinas}),[{line:'39',minutes:0,destination:'VADORREY',vehicle:'9001'}]);
 assert.throws(()=>parseAvanzaArrivals({tablatiempos:rows,maquinas:{}}),/could not be verified/);
});

test('transient Avanza errors are retried, permanent HTTP errors are not',async()=>{
 let attempts=0;
 const fetcher=async()=>{attempts++;if(attempts===1)return {ok:false,status:503};return {ok:true,text:async()=>JSON.stringify({tablatiempos:''})}};
 assert.deepEqual(await fetchAvanzaArrivals(744,fetcher),[]);
 assert.equal(attempts,2);
 attempts=0;
 await assert.rejects(()=>fetchAvanzaArrivals(744,async()=>{attempts++;return {ok:false,status:400}}),/HTTP 400/);
 assert.equal(attempts,1);
});

import {BUS_GAP_THRESHOLD,BUS_DARK_RED_WAIT_THRESHOLD,analyzeBusRegularity} from '../site/data.js';

test('bus stop turns red for 37-minute interval even with a first bus in three minutes',()=>{
 const value=analyzeBusRegularity([
  {line:'23',destination:'CENTRO',minutes:55,vehicle:'1003'},
  {line:'23',destination:'CENTRO',minutes:3,vehicle:'1001'},
  {line:'23',destination:'CENTRO',minutes:40,vehicle:'1002'}
 ]);
 assert.equal(BUS_GAP_THRESHOLD,15);
 assert.equal(value.red,true);
 assert.equal(value.slowFirst,false);
 assert.equal(value.longGap,true);
 assert.equal(value.comparedGaps,2);
 assert.deepEqual(value.routes[0].gaps,[{from:3,to:40,minutes:37},{from:40,to:55,minutes:15}]);
});

test('regularity detection includes initial long waits but requires strictly over 15 minutes',()=>{
 const boundary=analyzeBusRegularity([{line:'21',minutes:2},{line:'21',minutes:17}]);
 assert.equal(boundary.red,false);
 assert.equal(boundary.longGap,false);
 assert.equal(analyzeBusRegularity([{line:'21',minutes:2},{line:'21',minutes:18}]).red,true);
 const lone=analyzeBusRegularity([{line:'21',minutes:16}]);
 assert.equal(lone.red,true);
 assert.equal(lone.slowFirst,true);
 assert.equal(lone.longGap,false);
 assert.equal(lone.comparedGaps,0);
 assert.equal(analyzeBusRegularity([{line:'21',minutes:3}]).red,false);
});

test('bus headways never mix lines, destinations, missing ETAs or repeated vehicles',()=>{
 const value=analyzeBusRegularity([
  {line:'23',destination:'CENTRO',minutes:3,vehicle:'1001'},
  {line:'23',destination:'centro',minutes:4,vehicle:'1001'},
  {line:'23',destination:'CENTRO',minutes:null},
  {line:'23',destination:'BARRIO',minutes:40,vehicle:'1002'},
  {line:'24',destination:'CENTRO',minutes:7,vehicle:'1003'},
  {line:'24',destination:'CENTRO',minutes:17,vehicle:'1004'}
 ]);
 assert.equal(value.routes.length,3);
 assert.equal(value.comparedGaps,1);
 assert.equal(value.longGap,false);
 assert.equal(value.slowFirst,true);
 assert.deepEqual(value.routes.find(x=>x.line==='24').gaps,[{from:7,to:17,minutes:10}]);
 assert.equal(value.routes.find(x=>x.destination==='CENTRO'&&x.line==='23').gaps.length,0);
 assert.equal(analyzeBusRegularity([{line:'23',minutes:null},{line:'23',minutes:NaN}]).hasArrivals,false);
});

test('bus aggregates include red stops and stops with actual measured headways',()=>{
 const stops=[
  {checked:1,arrivals:[{line:'23',minutes:3},{line:'23',minutes:40}],apiResult:'known'},
  {checked:1,arrivals:[{line:'23',minutes:2},{line:'23',minutes:15}],apiResult:'known'},
  {checked:1,arrivals:[{line:'23',minutes:18}],apiResult:'known'},
  {checked:0,arrivals:[],apiResult:'unsampled'}
 ];
 const stats=summarizeBuses(stops);
 assert.equal(stats.redStops,2);
 assert.equal(stats.longGapStops,1);
 assert.equal(stats.comparedGaps,2);
 assert.equal(stats.withETA,3);
});

test('dark red bus wait or headway is strictly greater than 18 minutes',()=>{
 assert.equal(BUS_DARK_RED_WAIT_THRESHOLD,18);
 for(const minutes of [3,15,16,18]){
  const a=analyzeBusRegularity([{line:'23',minutes}]);
  assert.equal(a.darkRed,false,minutes+' min must not be dark red');
 }
 const late=analyzeBusRegularity([{line:'23',minutes:19}]);
 assert.equal(late.darkRed,true);
 assert.equal(late.red,true);
 const gapOnly=analyzeBusRegularity([{line:'23',minutes:3},{line:'23',minutes:40}]);
 assert.equal(gapOnly.darkRed,true,'37-minute gap is dark red despite the first bus arriving soon');
 assert.equal(gapOnly.red,true);
 const gapAtThreshold=analyzeBusRegularity([{line:'23',minutes:3},{line:'23',minutes:21}]);
 assert.equal(gapAtThreshold.darkRed,false,'an exact 18-minute gap stays standard red');
 assert.equal(gapAtThreshold.red,true);
 const mixed=analyzeBusRegularity([{line:'23',minutes:3},{line:'24',minutes:21}]);
 assert.equal(mixed.darkRed,true,'one route with first wait >18 min is sufficient');
 assert.equal(analyzeBusRegularity([{line:'23',minutes:null}]).darkRed,false);
});
