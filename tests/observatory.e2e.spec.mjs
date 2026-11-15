import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
const require=createRequire(import.meta.url);
const leafletJs=require.resolve('leaflet/dist/leaflet.js'),leafletCss=require.resolve('leaflet/dist/leaflet.css'),chartJs=join(dirname(require.resolve('chart.js')),'chart.umd.js');
const BUS='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus';
const INCIDENT='https://www.zaragoza.es/sede/servicio/via-publica/incidencia';
const GBFS='https://zaragoza.publicbikesystem.net/customer/gbfs/v3.0/';
const response=data=>({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
const before='2026-11-08T10:00:00.000Z',after='2026-11-08T10:30:00.000Z';
const stop=(id,minutes)=>({id:'tuzsa-'+id,name:'Stop '+id,coords:[41.6488,-0.8891+(id-798)*.001],status:'known',arrivals:[{line:'23',minutes}]});
const bike=available=>({id:'1',name:'Central Bizi',coords:[41.6484,-0.8894],available,disabled:2,docks:10});
const older={at:before,bizi:{status:'ok',capturedAt:before,stations:[bike(0)]},bus:{status:'ok',capturedAt:before,population:180,sampled:1,stops:[stop(798,22)]}};
const latest={schema:1,at:after,bizi:{status:'ok',capturedAt:after,stations:[bike(4)]},bus:{status:'ok',capturedAt:after,population:180,sampled:2,stops:[stop(798,4),stop(799,8)]}};
const notices=[
 {id:1,title:'CENTRAL AVENUE',calle:'CENTRAL AVENUE',tipo:{id:1},inicio:'2020-01-01',fin:'2099-12-31',geometry:{coordinates:[-0.889,41.65]},uri:INCIDENT+'/1'},
 {id:2,title:'RIVER STREET',calle:'RIVER STREET',tipo:{id:0},inicio:'2199-01-01',fin:'2199-01-10',geometry:{coordinates:[-0.892,41.65]},uri:INCIDENT+'/2'},
 {id:3,title:'OLD SQUARE',calle:'OLD SQUARE',tipo:{id:2},inicio:'2000-01-01',fin:'2000-01-31',geometry:{coordinates:[-0.886,41.65]},uri:INCIDENT+'/3'}
];
async function setup(page){
 const liveCalls=[];
 page.on('request',r=>{if([BUS,INCIDENT,GBFS].some(base=>r.url().startsWith(base)))liveCalls.push(r.url())});
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',r=>r.fulfill({path:leafletJs,contentType:'application/javascript'}));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',r=>r.fulfill({path:leafletCss,contentType:'text/css'}));
 await page.route('https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',r=>r.fulfill({path:chartJs,contentType:'application/javascript'}));
 await page.route('**/history/latest.json*',r=>r.fulfill(response(latest)));
 await page.route('**/history/timeline.json*',r=>r.fulfill(response({schema:1,frames:[older,latest]})));
 await page.route('**/history/incidents.json*',r=>r.fulfill(response({fetchedAt:after,totalCount:3,items:notices})));
 await page.route(BUS+'.json?*',r=>r.fulfill(response({result:[{id:'tuzsa-798',title:'Stop 798',geometry:{coordinates:[-0.8891,41.6488]}}]})));
 await page.route(/poste-autobus\/tuzsa-\d+\.json/,r=>r.fulfill(response({destinos:[{linea:'23',primero:'5 min'}]})));
 await page.route(GBFS+'gbfs.json',r=>r.fulfill(response({data:{feeds:[{name:'station_information',url:GBFS+'station_information.json'},{name:'station_status',url:GBFS+'station_status.json'}]}})));
 await page.route(GBFS+'station_information.json',r=>r.fulfill(response({data:{stations:[{station_id:'1',name:'Central Bizi',lat:41.6484,lon:-0.8894}]}})));
 await page.route(GBFS+'station_status.json',r=>r.fulfill(response({data:{stations:[{station_id:'1',num_vehicles_available:7,num_vehicles_disabled:1}]}})));
 await page.route(INCIDENT+'.json?*',r=>r.fulfill(response({totalCount:3,result:notices})));
 await page.route('https://*.tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest?.state.latest?.at)).toBe(after);
 return liveCalls;
}
test('cached first paint makes zero municipal API requests',async({page})=>{
 const calls=await setup(page);
 await expect(page.locator('#overviewBus')).toHaveText('2');
 await expect(page.locator('#overviewBike')).toHaveText('4');
 await expect(page.locator('#overviewIncidents')).toHaveText('1');
 await expect(page.locator('#timelineLabel')).toContainText('Latest available capture');
 await expect(page.locator('#overviewView #map')).toHaveCount(0);
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(2);
 expect(calls).toEqual([]);
});
test('timeline changes map geometry and statistics without inventing observations',async({page})=>{
 const calls=await setup(page);
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.timeline?.length)).toBe(2);
 await page.locator('#timelineSlider').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await expect(page.locator('#overviewBike')).toHaveText('0');
 await expect(page.locator('#timelineLabel')).toContainText('Historical capture');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(1);
 const colors=await page.evaluate(()=>[...window.__observatoryTest.state.markers.values()].map(m=>m.ring.options.fillColor));
 expect(colors).toContain('#871a2c');
 await page.locator('#timelineLatest').click();
 await expect(page.locator('#overviewBike')).toHaveText('4');
 await expect(page.locator('#timelineLabel')).toContainText('Latest available capture');
 expect(calls).toEqual([]);
});
test('tabs and incident filters work from recorded data only',async({page})=>{
 const calls=await setup(page);
 for(const name of ['buses','bizi','incidents','history','method','overview']){
  await page.locator('[data-view="'+name+'"]').click();
  await expect(page.locator('#'+name+'View')).toBeVisible();
  await expect(page.locator('[data-view="'+name+'"]')).toHaveAttribute('aria-selected','true');
 }
 await page.locator('[data-view="incidents"]').click();
 await expect(page.locator('#incidentList')).toContainText('CENTRAL AVENUE');
 await expect(page.locator('#incidentList')).not.toContainText('RIVER STREET');
 await page.locator('#incidentType').selectOption('water');
 await page.locator('#incidentPhase').selectOption('upcoming');
 await expect(page.locator('#incidentList')).toContainText('RIVER STREET');
 await page.locator('#incidentSearch').fill('not a street');
 await expect(page.locator('#incidentList')).toContainText('No matching notices');
 expect(calls).toEqual([]);
});
test('live mode requires explicit user action and can return to last capture',async({page})=>{
 const calls=await setup(page);
 await page.locator('[data-view="buses"]').click();
 await page.locator('#liveButton').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.liveMode)).toBe(true);
 await expect.poll(()=>calls.length).toBeGreaterThan(0);
 await page.locator('#liveButton').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.liveMode)).toBe(false);
 await expect(page.locator('#timelineBadge')).toContainText('Recorded');
});
test('six tabs have no mobile horizontal overflow and support keyboard navigation',async({page})=>{
 await setup(page);
 for(const name of ['overview','buses','bizi','incidents','history','method']){
  await page.locator('[data-view="'+name+'"]').click();
  await expect(page.locator('#'+name+'View')).toBeVisible();
  const sizes=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport+2);
 }
 await page.locator('[data-view="buses"]').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('[data-view="bizi"]')).toHaveAttribute('aria-selected','true');
});

test('manual bus requests retry the documented extensionless endpoint after HTTP 400',async({page})=>{
 await setup(page);
 await page.route(/poste-autobus\/tuzsa-\d+\.json/,r=>r.fulfill({status:400,contentType:'application/json',body:'{"error":"Bad request"}'}));
 await page.route(/poste-autobus\/tuzsa-\d+$/,r=>r.fulfill(response({destinos:[{linea:'23',primero:'5 min'}]})));
 await page.locator('[data-view="buses"]').click();
 await page.locator('#liveButton').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.stops.some(s=>s.apiResult==='known')),{timeout:30000}).toBe(true);
});

test('Bizi stations use discreet color-coded dots without default repair icons',async({page})=>{
 const calls=await setup(page);
 await page.locator('[data-view="bizi"]').click();
 await expect.poll(()=>page.locator('.bike-station-dot').evaluateAll(nodes=>nodes.some(node=>node.style.getPropertyValue('--pin')==='#e9a52f'))).toBe(true);
 await expect(page.locator('body')).toContainText('Bizi: 1–4 bikes');
 expect(calls).toEqual([]);
});

test('overview contains no map and the introduction expands only on request',async({page})=>{
 await setup(page);
 await expect(page.locator('#overviewMapHost')).toHaveCount(0);
 await expect(page.locator('#overviewView #map')).toHaveCount(0);
 await expect(page.locator('#siteIntro')).toBeHidden();
 await expect(page.locator('#aboutToggle')).toHaveAttribute('aria-expanded','false');
 await page.locator('#aboutToggle').click();
 await expect(page.locator('#siteIntro')).toBeVisible();
 await page.locator('#aboutToggle').click();
 await expect(page.locator('#siteIntro')).toBeHidden();
});
test('bus and Bizi tabs exclusively show their service layers',async({page})=>{
 const calls=await setup(page);
 await page.locator('[data-view="buses"]').click();
 await expect(page.locator('#busesMapHost #map')).toBeVisible();
 await expect(page.locator('#showBus')).toBeChecked();
 await expect(page.locator('#showBizi')).not.toBeChecked();
 await expect(page.locator('#repairFilter')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBeGreaterThan(0);
 await expect(page.locator('.bike-station-dot')).toHaveCount(0);
 await page.locator('[data-view="bizi"]').click();
 await expect(page.locator('#biziMapHost #map')).toBeVisible();
 await expect(page.locator('#showBus')).not.toBeChecked();
 await expect(page.locator('#showBizi')).toBeChecked();
 await expect(page.locator('#repairFilter')).toBeVisible();
 await expect(page.locator('.bike-station-dot')).toHaveCount(1);
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(0);
 expect(calls).toEqual([]);
});
test('repair filter renders only repair icons and hides ordinary Bizi pins',async({page})=>{
 await setup(page);
 await page.locator('[data-view="bizi"]').click();
 await expect(page.locator('.bike-station-dot')).toHaveCount(1);
 await page.locator('#brokenOnly').check();
 await expect(page.locator('.repair-only-pin')).toHaveCount(1);
 await expect(page.locator('.bike-station-dot')).toHaveCount(0);
 await expect(page.locator('.bike-broken')).toHaveCount(0);
 await page.locator('#brokenOnly').uncheck();
 await expect(page.locator('.bike-station-dot')).toHaveCount(1);
});
test('Bizi count cards show percentages calculated from reported denominators',async({page})=>{
 await setup(page);
 const cards=page.locator('#biziKpis');
 await expect(cards).toContainText('Available bikes');
 await expect(cards).toContainText('4 (67%)');
 await expect(cards).toContainText('Out-of-service bikes');
 await expect(cards).toContainText('2 (33%)');
 await expect(cards).toContainText('Empty stations');
 await expect(cards).toContainText('0 (0%)');
});

test('cached bus catalogue shows actual stop locations without inventing arrival predictions',async({page})=>{
 const calls=await setup(page);
 const catalog=[
  {id:'tuzsa-798',name:'Stop 798',coords:[41.6488,-0.8891]},
  {id:'tuzsa-799',name:'Stop 799',coords:[41.6488,-0.8881]},
  {id:'tuzsa-800',name:'Stop 800',coords:[41.6488,-0.8871]}
 ];
 await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus:{...latest.bus,catalog}})));
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest?.state.latest?.bus?.catalog?.length)).toBe(3);
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(3);
 const actual=await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-800')?.ring.options.fillColor);
 expect(actual).toBe('#89929f');
 expect(calls).toEqual([]);
});


test('overview groups Bizi, buses and incidents and counts zero-bike stations below five',async({page})=>{
 const calls=await setup(page);
 await expect(page.locator('#overviewView #map')).toHaveCount(0);
 await expect(page.locator('#overviewBikeKpis')).toContainText('Stations below 5 bikes');
 await expect(page.locator('#overviewBikeKpis')).toContainText('1 (100%)');
 await expect(page.locator('#overviewBikeKpis')).toContainText('Stations below 2 bikes');
 await expect(page.locator('#overviewBusKpis')).toContainText('Sampled stop coverage');
 await expect(page.locator('#overviewIncidentKpis')).toContainText('Active notices');
 await page.locator('[data-view="bizi"]').click();
 await expect(page.locator('#biziKpis')).toContainText('Stations below 5 bikes');
 await expect(page.locator('.bike-station-dot')).toHaveCount(1);
 await expect(page.locator('.bike-broken')).toHaveCount(0);
 expect(calls).toEqual([]);
});
test('history service groups expose charts and do not invent repair durations from incomplete frames',async({page})=>{
 await setup(page);
 await page.locator('[data-view="history"]').click();
 await expect(page.locator('#historyBiziKpis')).toContainText('Mean time until faults clear');
 await expect(page.locator('#historyBiziKpis')).toContainText('No fully bracketed episodes yet');
 await expect(page.locator('#episodeExplanation')).toContainText('moves or removals');
 await expect(page.locator('#historyBusKpis')).toContainText('Stops sampled');
 for(const id of ['historyBiziChart','historyRepairChart','historyAvailabilityChart','historyBusChart','historyErrorsChart','historyWaitsChart','historyCoverageChart','historyIncidentsChart'])
  await expect(page.locator('#'+id)).toBeVisible();
 await expect(page.locator('#historyStatus')).toContainText('aggregate snapshots');
});


test('bus statistics distinguish multiple stop-level ETAs from unique reported vehicles',async({page})=>{
 await setup(page);
 const bus={...latest.bus,stops:[
  {...stop(798,4),arrivals:[{line:'23',minutes:4,vehicle:'9001',destination:'CENTER'}]},
  {...stop(799,8),arrivals:[{line:'23',minutes:8,vehicle:'9001',destination:'CENTER'}]}
 ]};
 await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus})));
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest?.state.latest?.at)).toBe(after);
 await expect(page.locator('#overviewBusKpis')).toContainText('Stop-level arrival estimates');
 await expect(page.locator('#overviewBusKpis')).toContainText('Distinct operator vehicle IDs');
 await page.locator('[data-view="buses"]').click();
 const cards=page.locator('#busKpis .kpi');
 await expect(cards.filter({hasText:'Stop-level arrival estimates'}).locator('strong')).toHaveText('2');
 await expect(cards.filter({hasText:'Distinct operator vehicle IDs'}).locator('strong')).toHaveText('1');
});


test.describe('Spanish (Spain) browser localization',()=>{
 test.use({locale:'es-ES'});
 test('renders all navigation, page metadata and the recorded overview in Spanish',async({page})=>{
  const calls=await setup(page);
  await expect(page.locator('html')).toHaveAttribute('lang','es-ES');
  await expect(page).toHaveTitle('Observatory — Servicios públicos de Zaragoza');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',/visión independiente/);
  await expect(page.locator('[data-view="overview"]')).toContainText('Resumen');
  await expect(page.locator('[data-view="incidents"]')).toContainText('Incidencias');
  await expect(page.locator('[data-view="history"]')).toContainText('Histórico');
  await expect(page.locator('[data-view="method"]')).toContainText('Metodología');
  await expect(page.locator('#overviewBikeKpis')).toContainText('Estaciones con menos de 5 bicis');
  await expect(page.locator('#overviewBusKpis')).toContainText('Estimaciones de llegada por parada');
  await expect(page.locator('#overviewIncidentKpis')).toContainText('Avisos activos');
  await expect(page.locator('#siteIntro')).toBeHidden();
  await page.locator('#aboutToggle').click();
  await expect(page.locator('#siteIntro')).toContainText('Una visión más clara de');
  await expect(page.locator('#aboutToggle')).toHaveAttribute('aria-label','Ocultar información sobre Observatory');
  expect(calls).toEqual([]);
 });
 test('translates cached data cards, chart legends, map popups and history labels',async({page})=>{
  const calls=await setup(page);
  await page.locator('[data-view="bizi"]').click();
  await expect(page.locator('#biziKpis')).toContainText('Bicicletas disponibles');
  await expect(page.locator('#bikeNote')).toContainText('estaciones notifican disponibilidad');
  await expect(page.locator('#repairFilter')).toContainText('Mostrar solo estaciones');
  await expect(page.locator('#timelineBadge')).toContainText('Registrado');
  await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.charts.bikeChart?.data.labels[0])).toBe('5 o más disponibles');
  await page.evaluate(()=>window.__observatoryTest.state.bl.getLayers()[0].openPopup());
  await expect(page.locator('.leaflet-popup-content')).toContainText('Disponibles: 4');
  await page.locator('[data-view="incidents"]').click();
  await expect(page.locator('#incidentSearch')).toHaveAttribute('placeholder','Buscar por calle o título…');
  await expect(page.locator('#incidentList')).toContainText('Ver aviso oficial');
  await expect(page.locator('#incidentList')).toContainText('Fin previsto');
  await expect(page.locator('#incidentList')).toContainText('CENTRAL AVENUE');
  await page.locator('[data-view="history"]').click();
  await expect(page.locator('#historyView')).toContainText('Cómo se calculan las estimaciones de duración');
  await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.charts.historyBiziChart?.data.datasets[0]?.label)).toBe('Con menos de 2 bicis');
  expect(calls).toEqual([]);
 });
 test('translates the long bus-to-bus gap shown on a red map marker',async({page})=>{
  await setup(page);
  const withArrivals={...latest,bus:{...latest.bus,stops:[{...stop(798,3),arrivals:[
   {line:'23',destination:'CENTRO',minutes:3,vehicle:'1001'},
   {line:'23',destination:'CENTRO',minutes:40,vehicle:'1002'}
  ]}]}};
  await page.route('**/history/latest.json*',r=>r.fulfill(response(withArrivals)));
  await page.reload();
  await page.locator('[data-view="buses"]').click();
  const red=await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798').ring.options.fillColor);
  expect(red).toBe('#871a2c');
  await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798').ring.openPopup());
  await expect(page.locator('.leaflet-popup-content')).toContainText('intervalo de 37 min');
  await expect(page.locator('.bus-legend').filter({hasText:'Autobús: espera o intervalo >15 y ≤18 min'})).toHaveCount(1);
 });
});
test.describe('non-Spanish locale falls back to English',()=>{
 test.use({locale:'fr-FR'});
 test('uses the unchanged English UI without requesting municipal APIs automatically',async({page})=>{
  const calls=await setup(page);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page).toHaveTitle('Observatory — Zaragoza Public Services');
  await expect(page.locator('[data-view="overview"]')).toContainText('Overview');
  await expect(page.locator('#overviewBikeKpis')).toContainText('Available bikes');
  await page.locator('[data-view="bizi"]').click();
  await expect(page.locator('#biziKpis')).toContainText('Stations below 5 bikes');
  expect(calls).toEqual([]);
 });
});

test('visible coloured bus pin owns its popup without an invisible overlapping hit target',async({page})=>{
 await setup(page);
 await page.locator('[data-view="buses"]').click();
 const pin=await page.evaluate(()=>{
  const marker=window.__observatoryTest.state.markers.get('tuzsa-798');
  return {interactive:marker.ring.options.interactive,hasTap:Object.hasOwn(marker,'tap'),text:marker.ring.getPopup().getContent().textContent};
 });
 expect(pin.interactive).toBe(true);
 expect(pin.hasTap).toBe(false);
 expect(pin.text).toContain('Route 23');
 expect(pin.text).toContain('4 min');
});

test('red marks predicted gaps above 15 minutes even when the first bus arrives soon',async({page})=>{
 await setup(page);
 const withArrivals={...latest,bus:{...latest.bus,sampled:5,stops:[
  {...stop(798,3),arrivals:[
   {line:'23',destination:'CENTRO',minutes:3,vehicle:'1001'},
   {line:'23',destination:'CENTRO',minutes:40,vehicle:'1002'},
   {line:'23',destination:'CENTRO',minutes:55,vehicle:'1003'}
  ]},
  {...stop(799,2),arrivals:[{line:'23',minutes:2},{line:'23',minutes:17}]},
  stop(800,16),
  {...stop(801,3),arrivals:[{line:'23',minutes:3},{line:'24',minutes:10}]},
  {id:'tuzsa-802',name:'Stop 802',coords:[41.6488,-0.8851],status:'unknown',arrivals:[]}
 ]}};
 await page.route('**/history/latest.json*',r=>r.fulfill(response(withArrivals)));
 await page.reload();
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(5);
 const pins=await page.evaluate(()=>Object.fromEntries([...window.__observatoryTest.state.markers].map(([id,marker])=>[id,marker.ring.options.fillColor])));
 expect(pins['tuzsa-798']).toBe('#871a2c');
 expect(pins['tuzsa-799']).toBe('#4274c7'); // 15-minute interval is allowed
 expect(pins['tuzsa-800']).toBe('#d94749'); // 16 minutes to the first bus
 expect(pins['tuzsa-801']).toBe('#4274c7'); // two different lines are not consecutive
 expect(pins['tuzsa-802']).toBe('#89929f');
 await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798').ring.openPopup());
 await expect(page.locator('.leaflet-popup-content')).toContainText('37 min between buses');
 await expect(page.locator('.leaflet-popup-content')).toContainText('15 min between buses');
 await expect(page.locator('#busKpis')).toContainText('Stops with waits or gaps >15 min');
});


test('bus map uses dark red for waits or gaps strictly above 18 minutes',async({page})=>{
 await setup(page);
 const withArrivals={...latest,bus:{...latest.bus,stops:[
  stop(798,18),
  stop(799,19),
  {...stop(800,3),arrivals:[{line:'23',minutes:3},{line:'23',minutes:40}]}
 ]}};
 await page.route('**/history/latest.json*',r=>r.fulfill(response(withArrivals)));
 await page.reload();
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(3);
 const pins=await page.evaluate(()=>Object.fromEntries([...window.__observatoryTest.state.markers].map(([id,m])=>[id,m.ring.options.fillColor])));
 expect(pins['tuzsa-798']).toBe('#d94749');
 expect(pins['tuzsa-799']).toBe('#871a2c');
 expect(pins['tuzsa-800']).toBe('#871a2c');
 await expect(page.locator('.bus-legend').filter({hasText:'Bus: wait or gap >18 min'})).toHaveCount(1);
});

test('predicted wait chart separates 16–18 from >18 minutes using map colours',async({page})=>{
 await setup(page);
 const bus={...latest.bus,sampled:2,stops:[
  {...stop(798,0),arrivals:[0,5,6,15,16,18,19,31].map((minutes,i)=>({line:String(30+i),minutes}))},
  {...stop(799,null),arrivals:[{line:'23',minutes:null},{line:'24',minutes:-1},{line:'25',minutes:181}]}
 ]};
 await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus})));
 await page.reload();
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.charts.busChart?.data.labels.length)).toBe(4);
 const chart=await page.evaluate(()=>{
  const item=window.__observatoryTest.state.charts.busChart;
  return {labels:item.data.labels,data:item.data.datasets[0].data,colors:item.data.datasets[0].backgroundColor};
 });
 expect(chart).toEqual({
  labels:['0–5 min','6–15 min','16–18 min','>18 min'],
  data:[2,2,2,2],
  colors:['#18875b','#4274c7','#d94749','#871a2c']
 });
 const cards=page.locator('#busKpis .kpi');
 await expect(cards.filter({hasText:'Waits 16–18 min'}).locator('strong')).toHaveText('2 (25%)');
 await expect(cards.filter({hasText:'Waits >18 min'}).locator('strong')).toHaveText('2 (25%)');
 await expect(page.locator('#busesView')).toContainText('not the intervals between buses');
});

test.describe('Spanish bus-wait chart categories',()=>{
 test.use({locale:'es-ES'});
 test('new dark-red category and explanatory note are translated',async({page})=>{
  await setup(page);
  await page.locator('[data-view="buses"]').click();
  await expect(page.locator('#busKpis')).toContainText('Esperas de 16 a 18 min');
  await expect(page.locator('#busKpis')).toContainText('Esperas de más de 18 min');
  await expect(page.locator('#busesView')).toContainText('La gráfica cuenta las predicciones de llegada válidas individuales');
  await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.charts.busChart?.data.labels)).toEqual(['0–5 min','6–15 min','16–18 min','>18 min']);
 });
});

test('searchable line selector lists catalogue routes and filters bus pins and severity',async({page})=>{
 await setup(page);
 const stops=[
  {...stop(798,3),name:'(798) Avenida Líneas: 23, 24',arrivals:[
   {line:'23',minutes:3,destination:'CENTRO',vehicle:'1001'},
   {line:'23',minutes:9,destination:'CENTRO',vehicle:'1002'},
   {line:'24',minutes:2,destination:'SUR',vehicle:'2001'},
   {line:'24',minutes:40,destination:'SUR',vehicle:'2002'}
  ]},
  {...stop(799,null),name:'(799) Plaza Líneas: 23',status:'unknown',arrivals:[]},
  {...stop(800,17),name:'(800) Barrio Líneas: 24',arrivals:[{line:'24',minutes:17}]},
  {...stop(801,19),name:'(801) Calle Líneas: 23',arrivals:[{line:'23',minutes:19}]}
 ];
 const catalog=[
  ...stops.map(s=>({id:s.id,coords:s.coords,name:s.name})),
  {id:'tuzsa-802',coords:stop(802,0).coords,name:'(802) Night Líneas: N3'},
  {id:'tuzsa-803',coords:stop(803,0).coords,name:'(803) No prediction Líneas: 23, 31'}
 ];
 const bus={...latest.bus,population:6,sampled:4,stops,catalog};
 await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus})));
 await page.reload();
 await page.locator('[data-view="buses"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(6);
 await page.locator('#busLineToggle').click();
 await expect(page.locator('#busLineMatches')).toBeVisible();
 const allOptions=await page.locator('#busLineMatches [role="option"]').allTextContents();
 expect(allOptions).toEqual(['23','24','31','N3']);
 await page.locator('#busLineMatches [role="option"]').filter({hasText:'23'}).click();
 await expect(page.locator('#busLineMatches')).toBeHidden();
 await expect(page.locator('#busLineFilter')).toHaveValue('23');
 const pinColors=()=>page.evaluate(()=>Object.fromEntries([...window.__observatoryTest.state.markers].map(([id,m])=>[id,m.ring.options.fillColor])));
 expect((await pinColors())['tuzsa-798']).toBe('#871a2c'); // Unfiltered: line 24 has a 38-minute gap.
 await page.locator('#busLineFilter').fill('23');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.busLineFilter)).toBe('23');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(4);
 const line23=await pinColors();
 expect(Object.keys(line23).sort()).toEqual(['tuzsa-798','tuzsa-799','tuzsa-801','tuzsa-803']);
 expect(line23['tuzsa-798']).toBe('#4274c7'); // Same stop is blue when only line 23 counts.
 expect(line23['tuzsa-799']).toBe('#89929f'); // A known route stop without an ETA stays visible.
 expect(line23['tuzsa-801']).toBe('#871a2c');
 expect(line23['tuzsa-803']).toBe('#89929f'); // Unsampled catalogue stop with a published route.
 await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798').ring.openPopup());
 const popup=page.locator('.leaflet-popup-content');
 await expect(popup).toContainText('Route 23');
 await expect(popup).not.toContainText('Route 24');
 await expect(page.locator('#busLineFilterStatus')).toContainText('4 known stops for line 23');
 await page.locator('#busLineFilter').fill('24');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(2);
 const line24=await pinColors();
 expect(line24['tuzsa-798']).toBe('#871a2c');
 expect(line24['tuzsa-800']).toBe('#d94749');
 await page.locator('#busLineFilter').fill('N3');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(1);
 expect((await pinColors())['tuzsa-802']).toBe('#89929f');
 await page.locator('#clearBusLineFilter').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(6);
 expect(await page.locator('#busLineFilter').inputValue()).toBe('');
});

test('bus line filter persists across historical frames and other service tabs',async({page})=>{
 await setup(page);
 const bus={...latest.bus,stops:[
  {...stop(798,3),name:'(798) Avenida Líneas: 23, 24',arrivals:[{line:'23',minutes:3},{line:'24',minutes:40}]},
  {...stop(799,null),name:'(799) Plaza Líneas: 23',arrivals:[]}
 ],catalog:[
  {id:'tuzsa-798',coords:stop(798,0).coords,name:'(798) Avenida Líneas: 23, 24'},
  {id:'tuzsa-799',coords:stop(799,0).coords,name:'(799) Plaza Líneas: 23'}
 ]};
 await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus})));
 await page.reload();
 await page.locator('[data-view="buses"]').click();
 await page.locator('#busLineFilter').fill('23');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798')?.ring.options.fillColor)).toBe('#4274c7');
 await page.locator('[data-view="bizi"]').click();
 await page.locator('[data-view="buses"]').click();
 expect(await page.locator('#busLineFilter').inputValue()).toBe('23');
 await page.locator('#timelineSlider').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await expect(page.locator('#timelineLabel')).toContainText('Historical capture');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798')?.ring.options.fillColor)).toBe('#871a2c'); // 22-minute wait on line 23.
 expect(await page.locator('#busLineFilter').inputValue()).toBe('23');
 await page.locator('#timelineLatest').click();
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798')?.ring.options.fillColor)).toBe('#4274c7');
});

test.describe('Spanish searchable bus line selector',()=>{
 test.use({locale:'es-ES'});
 test('shows translated labels and only the selected line in the popup',async({page})=>{
  await setup(page);
  const bus={...latest.bus,stops:[{...stop(798,3),name:'(798) Avenida Líneas: 23, 24',arrivals:[
   {line:'23',minutes:3},{line:'24',minutes:40}
  ]}],catalog:[{id:'tuzsa-798',name:'(798) Avenida Líneas: 23, 24',coords:stop(798,0).coords}]};
  await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus})));
  await page.reload();
  await page.locator('[data-view="buses"]').click();
  await expect(page.locator('.bus-line-filter')).toContainText('Filtrar el mapa por línea');
  await expect(page.locator('#busLineFilter')).toHaveAttribute('placeholder','Todas las líneas · escribe o selecciona una línea');
  await page.locator('#busLineFilter').fill('23');
  await expect(page.locator('#busLineFilterStatus')).toContainText('Solo esta línea determina los colores');
  await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-798').ring.openPopup());
  await expect(page.locator('.leaflet-popup-content')).toContainText('Línea 23');
  await expect(page.locator('.leaflet-popup-content')).not.toContainText('Línea 24:');
 });
});

test('searchable bus-line dropdown includes special EM3 service and supports Enter and arrows',async({page})=>{
 await setup(page);
 const bus={...latest.bus,sampled:2,stops:[
  {...stop(798,2),name:'(798) Avenida Líneas: 23',arrivals:[{line:'23',minutes:2}]},
  {...stop(799,20),name:'(799) Shuttle Líneas: EM3',arrivals:[{line:'EM3',minutes:20}]}
 ],catalog:[
  {id:'tuzsa-798',name:'(798) Avenida Líneas: 23',coords:stop(798,0).coords},
  {id:'tuzsa-799',name:'(799) Shuttle Líneas: EM3',coords:stop(799,0).coords}
 ]};
 await page.route('**/history/latest.json*',r=>r.fulfill(response({...latest,bus})));
 await page.reload();
 await page.locator('[data-view="buses"]').click();
 const input=page.locator('#busLineFilter');
 await input.click();
 await expect(input).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#busLineMatches [role="option"]')).toHaveCount(2);
 await input.fill('em');
 await expect(page.locator('#busLineMatches [role="option"]')).toHaveCount(1);
 await expect(page.locator('#busLineMatches')).toContainText('EM3');
 await input.press('Enter');
 await expect(page.locator('#busLineMatches')).toBeHidden();
 await expect(input).toHaveValue('EM3');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.busLineFilter)).toBe('EM3');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(1);
 const chosen=await page.evaluate(()=>window.__observatoryTest.state.markers.get('tuzsa-799')?.ring.options.fillColor);
 expect(chosen).toBe('#871a2c');
 await page.locator('#busLineToggle').click();
 await expect(page.locator('#busLineMatches [role="option"]')).toHaveCount(2);
 await input.press('ArrowDown');
 await input.press('Enter');
 await expect(input).toHaveValue('EM3');
 await expect(page.locator('#busLineMatches')).toBeHidden();
 await input.fill('not a real route');
 await expect(page.locator('#busLineMatches')).toContainText('No matching bus lines');
 await page.locator('#clearBusLineFilter').click();
 await expect(page.locator('#busLineMatches')).toBeHidden();
 await expect(input).toHaveValue('');
 await expect.poll(()=>page.evaluate(()=>window.__observatoryTest.state.markers.size)).toBe(2);
});
