import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBusLines,minutesOf,stopId,summarizeBikes,summarizeBuses} from '../site/data.js';

test('cada línea conserva su próxima llegada, incluidas las líneas desconocidas',()=>{
 assert.deepEqual(parseBusLines({destinos:[{linea:'23',primero:'6 min',segundo:'28 min'},{linea:'35',primero:'22 minutos',segundo:'40 min'},{linea:'40',primero:'Sin información'}]}),[{line:'23',minutes:6},{line:'35',minutes:22},{line:'40',minutes:null}]);
});
test('llegadas anidadas retienen el número de línea',()=>{
 assert.deepEqual(parseBusLines({result:[{linea:'5',tiempos:[{minutos:12}]}]}),[{line:'5',minutes:12}]);
});
test('no confunde línea, identificador ni ausencia de tiempos con llegadas',()=>{
 assert.equal(minutesOf('sin información'),null);
 assert.equal(minutesOf('En la parada'),0);
 assert.equal(minutesOf('22 minutos'),22);
 assert.equal(stopId({id:'https://example.com/tuzsa-798'}),'tuzsa-798');
});
test('no atribuye cero averías a estaciones sin datos',()=>{
 const s=summarizeBikes([{available:3,disabled:2},{available:0,disabled:null},{available:null,disabled:null}]);
 assert.equal(s.faultKnown,1);assert.equal(s.faultTotal,2);assert.equal(s.pairedStations,1);assert.equal(s.empty,1);
});
test('una espera superior a 15 minutos se cuenta por línea, no por parada',()=>{
 const b=summarizeBuses([{arrivals:[{line:'23',minutes:6},{line:'35',minutes:22},{line:'40',minutes:null}],checked:10,apiResult:'known'}]);
 assert.equal(b.long,1);assert.equal(b.estimates,2);assert.equal(b.withETA,1);
});
