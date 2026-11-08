import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
const require=createRequire(import.meta.url);
const leafletJs=require.resolve('leaflet/dist/leaflet.js'),leafletCss=require.resolve('leaflet/dist/leaflet.css'),chartJs=join(dirname(require.resolve('chart.js')),'chart.umd.js');
const BUS='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus';
const GBFS='https://zaragoza.publicbikesystem.net/customer/gbfs/v3.0/';
const response=data=>({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
async function setup(page,extra=0){
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>route.fulfill({path:leafletJs,contentType:'application/javascript'}));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',route=>route.fulfill({path:leafletCss,contentType:'text/css'}));
 await page.route('https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',route=>route.fulfill({path:chartJs,contentType:'application/javascript'}));
 const info=[{station_id:'1',name:'Con averías',lat:41.6483,lon:-0.8955},{station_id:'2',name:'Sin averías',lat:41.6465,lon:-0.897},{station_id:'3',name:'Sin datos',lat:41.6469,lon:-0.8958}];
 const statuses=[{station_id:'1',num_vehicles_available:4,num_vehicles_disabled:2},{station_id:'2',num_vehicles_available:0,num_vehicles_disabled:0}];
 await page.route(GBFS+'gbfs.json',route=>route.fulfill(response({data:{feeds:[{name:'station_information',url:GBFS+'station_information.json'},{name:'station_status',url:GBFS+'station_status.json'}]}})));
 await page.route(GBFS+'station_information.json',route=>route.fulfill(response({data:{stations:info}})));
 await page.route(GBFS+'station_status.json',route=>route.fulfill(response({data:{stations:statuses}})));
 const stops=[{id:'tuzsa-798',title:'Parada A',geometry:{coordinates:[-0.8891,41.6488]}},{id:'tuzsa-799',title:'Parada B',geometry:{coordinates:[-0.8845,41.6499]}},{id:'tuzsa-800',title:'Sin predicciones',geometry:{coordinates:[-0.8955,41.6501]}}];
 for(let n=0;n<extra;n++)stops.push({id:'tuzsa-'+(801+n),title:'Extra '+n,geometry:{coordinates:[-0.8887+(n%6)*.0003,41.649+Math.floor(n/6)*.0003]}});
 await page.route(BUS+'.json?*',route=>route.fulfill(response({result:stops})));
 await page.route(/poste-autobus\/tuzsa-\d+\.json/,route=>{
  const id=+(route.request().url().match(/tuzsa-(\d+)/)?.[1]||0);
  return route.fulfill(response(id===798?{destinos:[{linea:'23',primero:'6 min'},{linea:'35',primero:'22 min'},{linea:'40',primero:'Sin información'}]}:id===799?{destinos:[{linea:'10',primero:'8 min'}]}:id===800?{destinos:[{linea:'31',primero:'Sin información'}]}:{destinos:[{linea:'50',primero:'7 min'}]}));
 });
 await page.route('https://*.tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>Boolean(window.__observatoryTest?.state.stops.length))).toBe(true);
 await expect(page.locator('#status')).toContainText('con predicción');
}
test('mapa muestra sólo paradas con ETA por línea, y abre popup persistente al tocar',async({page})=>{
 await setup(page);
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(2);
 const st=await page.evaluate(()=>window.__observatoryTest.state.stops.find(s=>s.id==='tuzsa-798').arrivals);
 expect(st).toEqual([{line:'23',minutes:6},{line:'35',minutes:22},{line:'40',minutes:null}]);
 const rings=await page.evaluate(()=>[...window.__observatoryTest.state.markers.values()].map(x=>x.ring.options.fillColor));
 expect(rings).toContain('#d94749');expect(rings).toContain('#4274c7');
 await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798').tap.openPopup());
 await expect(page.locator('.leaflet-popup-content')).toContainText('Línea 35: 22 min');
 await page.evaluate(()=>window.__observatoryTest.state.map.fire('moveend'));
 await expect(page.locator('.leaflet-popup-content')).toContainText('Línea 23: 6 min');
});
test('filtro averías muestra solo estaciones conocidas y estadísticas Chart.js',async({page})=>{
 await setup(page);
 await expect(page.locator('.bike-wrapper')).toHaveCount(3);
 await page.locator('#brokenOnly').check();
 await expect(page.locator('.bike-wrapper')).toHaveCount(1);
 await expect(page.locator('.bike-broken')).toContainText('2');
 await page.locator('[data-view="stats"]').click();
 await expect(page.locator('#statsView')).toBeVisible();
 await expect(page.locator('#faultNote')).toContainText('mismas 2 estaciones');
 await expect.poll(()=>page.evaluate(()=>Object.keys(window.__observatoryTest.state.charts).length)).toBe(3);
});
test('se completan más de 24 consultas de bus sin mover el mapa',async({page})=>{
 await setup(page,28);
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.stops.filter(s=>s.apiResult==='known').length),{timeout:60000}).toBe(30);
});
test('a zoom 12 sigue mostrando predicciones, sin dibujar paradas sin ETA',async({page})=>{
 await setup(page);
 await page.evaluate(()=>window.__observatoryTest.state.map.setZoom(12,{animate:false}));
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(2);
 await page.evaluate(()=>window.__observatoryTest.state.map.setZoom(11,{animate:false}));
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(0);
});
test('layout móvil no crea desbordamiento horizontal y las tres secciones funcionan',async({page})=>{
 await setup(page);
 const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,height:document.querySelector('#map').getBoundingClientRect().height}));
 expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport+2);
 expect(dimensions.height).toBeGreaterThanOrEqual(340);
 await page.locator('[data-view="method"]').click();
 await expect(page.locator('#methodView')).toBeVisible();
 await page.locator('[data-view="map"]').click();
 await expect(page.locator('#mapView')).toBeVisible();
});
