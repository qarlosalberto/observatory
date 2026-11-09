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
