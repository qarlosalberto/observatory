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
 expect(colors).toContain('#d94749');
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
