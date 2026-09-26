/* Local UI integration check. All auth, listings, images and map tiles are synthetic;
 * no requests reach Supabase or any other external service.
 * Start Vite --host127.0.0.1 --port5174 --mode production first (spaces after flags).
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(__dirname, '..');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5174';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = path.join(root, 'node_modules/.cache/map-search-smoke');
fs.mkdirSync(output, { recursive: true });
const now = new Date().toISOString();
const env = fs.readFileSync(path.join(root, 'apps/web/.env.production'), 'utf8');
const publicUrl = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
assert(publicUrl);
const key = `sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`;
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'map-fixture@example.invalid', email_confirmed_at: now, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: now };
const profile = { ...user, role: 'user', full_name: 'Map Fixture', organization_name: null, notification_channels: {}, contact_pref: 'app', best_time: 'anytime' };
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp })).toString('base64url')}.fixture`;
const session = { access_token: token, refresh_token: 'local-test-only', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
const points = [[9.88,57.04],[9.89,57.035],[9.90,57.05],[9.91,57.045],[9.94,57.025],[9.95,57.04],[9.96,57.055],[9.97,57.03]];
const listings = points.map(([lon, lat], i) => ({
  id: `00000000-0000-4000-8000-${String(i + 10).padStart(12,'0')}`, address: `${['Hasserisvej','Skovbakkevej','Engvej','Klostermarken','Dalgasvej','Vestre Alle','Sofievej','Mølleparkvej'][i]} ${i+2}`, municipality: 'Aalborg', postalCode: '9000', price: 3500000 + i*150000, sqm: 125+i*5, rooms: 4+i%3,
  listingDate: '2026-01-01', listingSource: 'boligsiden', externalId: `fixture-${i}`, dataMode: 'real', lat, lon, status: 'active', buildingYear: 1965+i*4, propertyType: 'villa',
  images: [{ url: `${base}/__fixtures__/home-${i}.svg`, category: 'photo', sources: [] }], description: 'Synthetic browser fixture', agentName: 'BOLIGDATA · LOKAL TEST', listingUrl: null,
  agentUserId: null, isPromoted: false, promotedAt: null, promotedBy: null, idLokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfeNummer: null, registeredAreaSqm: null, bbrData: null, riskFlags: null, createdAt: now, updatedAt: now,
}));
const houseImage = i => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="510" viewBox="0 0 800 510"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${['#a0bfd2','#e7b9b0','#afc4dc','#ccd6d9'][i%4]}"/><stop offset="1" stop-color="#eff2e5"/></linearGradient></defs><rect width="800" height="510" fill="url(#sky)"/><path d="M0 285 Q170 205 340 286T800 250V510H0Z" fill="#6e8963"/><path d="M0 370Q380 305 800 360V510H0Z" fill="#577851"/><rect x="145" y="220" width="520" height="175" fill="${['#e4d1b5','#f6f1e5','#c4ac90','#e5d5bd'][i%4]}"/><path d="m115 230 290-153 290 153Z" fill="#53555c"/><rect x="186" y="265" width="92" height="72" fill="#a8c0c7" stroke="#fcfaf4" stroke-width="10"/><rect x="514" y="265" width="100" height="72" fill="#d9cc9e" stroke="#fcfaf4" stroke-width="10"/><rect x="355" y="265" width="82" height="130" fill="#40555c"/><path d="m355 395-35 115h170l-53-115" fill="#c7c4bd"/><path d="M0 438H800" stroke="#afbc97" stroke-width="8"/><g fill="#2f5746"><circle cx="77" cy="260" r="78"/><circle cx="741" cy="270" r="92"/></g><text x="24" y="490" fill="white" font-family="sans-serif" font-size="14">Synthetic UI test image</text></svg>`;
const mapStyle = { version: 8, glyphs: `${base}/__fixtures__/glyphs/{fontstack}/{range}.pbf`, sources: { fixture: { type: 'geojson', data: { type: 'FeatureCollection', features: [
  { type:'Feature', properties:{kind:'water'}, geometry:{type:'Polygon',coordinates:[[[9.75,57.07],[10.1,57.09],[10.1,57.065],[9.75,57.045],[9.75,57.07]]] } },
  { type:'Feature', properties:{kind:'park'}, geometry:{type:'Polygon',coordinates:[[[9.90,57.015],[9.93,57.015],[9.93,57.04],[9.90,57.04],[9.90,57.015]]] } },
  ...[9.88,9.9,9.92,9.94,9.96,9.98].map(lon=>({type:'Feature',properties:{kind:'road'},geometry:{type:'LineString',coordinates:[[lon,57.0],[lon,57.08]]}})),
  ...[57.02,57.035,57.05,57.065].map(lat=>({type:'Feature',properties:{kind:'road'},geometry:{type:'LineString',coordinates:[[9.8,lat],[10.05,lat]]}})),
] } } }, layers: [
  {id:'background',type:'background',paint:{'background-color':'#eeede6'}},
  {id:'water',type:'fill',source:'fixture',filter:['==','kind','water'],paint:{'fill-color':'#abd5e7'}},
  {id:'park',type:'fill',source:'fixture',filter:['==','kind','park'],paint:{'fill-color':'#c5dab4'}},
  {id:'roads',type:'line',source:'fixture',filter:['==','kind','road'],paint:{'line-color':'#ffffff','line-width':4}},
] };
function inside(point, polygon) {
  let result = false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [x,y]=point,[xi,yi]=polygon[i],[xj,yj]=polygon[j];
    if(((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) result = !result;
  }
  return result;
}
async function main() {
  const browserPath = process.env.BROWSER_EXECUTABLE || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  const browser = await playwright.chromium.launch({headless:true, executablePath:browserPath,args:['--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'da-DK',serviceWorkers:'block',hasTouch:true});
  const report = {checks:[],pageErrors:[],requests:[],writes:[],unexpected:[],screenshots:[]};
  const json = (route,body,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('boligdata.lang','da');localStorage.setItem('boligdata.theme','light');},{key,session});
  if(context.routeWebSocket) await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==new URL(base).origin) {
      if(url.pathname.includes('/rest/v1/user_profiles'))return json(route,profile);
      if(url.pathname.includes('/auth/v1/user'))return json(route,user);
      if(url.pathname.includes('/auth/v1/'))return json(route,session);
      if(url.hostname==='tiles.openfreemap.org')return json(route,mapStyle);
      return route.fulfill({status:204,body:''});
    }
    if(url.pathname.startsWith('/__fixtures__/glyphs/')) return route.fulfill({status:200,contentType:'application/x-protobuf',body:Buffer.alloc(0)});
    if(url.pathname.startsWith('/__fixtures__/')) return route.fulfill({status:200,contentType:'image/svg+xml',body:houseImage(Number(url.pathname.match(/home-(\d+)/)?.[1]||0))});
    if(!url.pathname.startsWith('/api/'))return route.continue();
    const resource=url.searchParams.get('resource');
    if(url.pathname==='/api/properties') {
      report.requests.push(Object.fromEntries(url.searchParams));
      let rows=[...listings];
      if(url.searchParams.has('polygon')) {
        let polygon;try{polygon=JSON.parse(url.searchParams.get('polygon'));}catch{return json(route,{error:'Invalid map boundary'},400);}
        rows=rows.filter(row=>inside([row.lon,row.lat],polygon));
      }
      if(url.searchParams.has('bbox')) {const [w,s,e,n]=url.searchParams.get('bbox').split(',').map(Number);rows=rows.filter(row=>row.lon>=w&&row.lon<=e&&row.lat>=s&&row.lat<=n);}
      if(url.searchParams.get('maxPrice'))rows=rows.filter(row=>row.price<=Number(url.searchParams.get('maxPrice')));
      const total=rows.length,limit=Math.min(Number(url.searchParams.get('limit')||50),100),offset=Number(url.searchParams.get('offset')||0);
      return json(route,{authenticated:true,properties:rows.slice(offset,offset+limit),summaries:[],total,limit,offset,page:Math.floor(offset/limit)+1,totalPages:Math.max(1,Math.ceil(total/limit))});
    }
    if(url.pathname==='/api/searches') {if(req.method()==='POST'){const body=req.postDataJSON();report.writes.push(body);return json(route,{id:'fixture-search',...body});}return json(route,[]);}
    if(url.pathname==='/api/favorites')return json(route,{favorites:[],properties:[]});
    if(url.pathname==='/api/recommendations')return json(route,{recommendations:[],properties:[]});
    if(resource==='profile')return json(route,{profile,email:user.email});
    if(resource==='notifications')return json(route,{notifications:[]});
    if(url.pathname==='/api/notifications')return json(route,{notifications:[]});
    if(resource==='conversations')return json(route,{conversations:[]});
    if(resource==='settings')return json(route,{settings:{broadcastEnabled:false,updatedAt:now}});
    report.unexpected.push(url.pathname+'?'+url.searchParams);return json(route,{error:'Unexpected fixture endpoint'},501);
  });
  const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  const snap=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage:true,animations:'disabled'});report.screenshots.push(file);};
  try {
    await page.goto(base);
    await page.getByTestId('property-results').locator('a[href^="/property/"]').first().waitFor();
    assert.equal(await page.getByTestId('property-results').locator('a[href^="/property/"]').count(),8);
    await page.getByRole('button',{name:'Tegn område',exact:true}).waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Tegn område'&&!button.disabled));
    report.checks.push('Desktop split layout loads eight fixture listings and interactive map');
    await snap('search-desktop');
    await page.evaluate(()=>window.scrollTo({top:500,behavior:'instant'}));
    await page.waitForFunction(()=>window.scrollY>=499);
    report.sticky=await page.evaluate(()=>({scrollY:window.scrollY,headerTop:document.querySelector('header').getBoundingClientRect().top,mapTop:document.querySelector('aside[aria-label="Kort over boliger"]').getBoundingClientRect().top}));
    assert(Math.abs(report.sticky.headerTop)<=1,`Header must stick at viewport top: ${JSON.stringify(report.sticky)}`);
    assert(Math.abs(report.sticky.mapTop-64)<=1,`Desktop map must stick below the 64px header: ${JSON.stringify(report.sticky)}`);
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    report.checks.push('Desktop header stays at0 and map at64px after scrolling500px');
    await page.setViewportSize({width:1024,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'1024px document overflow');
    await snap('search-1024');
    await page.setViewportSize({width:1440,height:1000});
    report.checks.push('1024px header, list and map fit without horizontal overflow');
    await page.getByRole('button',{name:'Tegn område',exact:true}).click();
    const canvas=page.locator('.maplibregl-canvas').first();
    const box=await canvas.boundingBox();assert(box);
    for(const [x,y] of [[.12,.25],[.60,.75]])await canvas.click({position:{x:box.width*x,y:box.height*y}});
    assert.equal(await page.getByRole('button',{name:'Afslut område',exact:true}).isDisabled(),true,'Two points must not form a search boundary');
    for(const [x,y] of [[.60,.25],[.12,.75]])await canvas.click({position:{x:box.width*x,y:box.height*y}});
    await page.getByRole('button',{name:'Afslut område',exact:true}).click();
    await page.getByText('Området skal have mindst 3 forskellige punkter uden krydsende linjer. Ret punkterne og prøv igen.',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.has('polygon'),false,'Invalid crossing boundary must not change search');
    await page.getByRole('button',{name:'Fortryd punkt',exact:true}).click();
    await page.getByText(/Klik eller tryk på kortet: 3 punkter/).waitFor();
    await page.getByRole('button',{name:'Annuller',exact:true}).click();
    report.checks.push('Incomplete and self-crossing canvas drawings are rejected; undo and cancel leave search unchanged');
    await page.getByRole('button',{name:'Tegn område',exact:true}).click();
    for(const [x,y] of [[.12,.20],[.60,.20],[.60,.80],[.12,.80]])await canvas.click({position:{x:box.width*x,y:box.height*y}});
    await page.getByRole('button',{name:'Afslut område',exact:true}).click();
    await page.waitForURL(url=>url.searchParams.has('polygon'));
    const polygon=JSON.parse(new URL(page.url()).searchParams.get('polygon'));
    const expected=listings.filter(row=>inside([row.lon,row.lat],polygon));
    assert(expected.length>0&&expected.length<listings.length,`Drawn area should narrow results, got ${expected.length}`);
    await page.waitForFunction(n=>document.querySelectorAll('[data-testid="property-results"] a[href^="/property/"]').length===n,expected.length);
    report.checks.push('Click-drawn polygon narrows server query, list and count to matching homes');
    await snap('search-boundary');
    const savedUrl=page.url();
    const previousBbox=report.requests.filter(request=>request.bbox).at(-1)?.bbox;
    const panRequest=page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/properties'&&url.searchParams.has('bbox')&&url.searchParams.get('bbox')!==previousBbox&&url.searchParams.has('polygon');});
    await page.mouse.move(box.x+box.width*.8,box.y+box.height*.75);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.65,{steps:8});await page.mouse.up();
    const panned=await panRequest;
    assert.equal(new URL(panned.url()).searchParams.get('polygon'),JSON.stringify(polygon));
    assert.equal(page.url(),savedUrl,'Panning must preserve the committed URL boundary');
    assert.equal(await page.getByTestId('property-results').locator('a[href^="/property/"]').count(),expected.length,'Panning must not change list results');
    report.checks.push('Panning refreshes viewport query while retaining polygon and list selection');
    await page.reload();await page.getByRole('button',{name:'Fjern område',exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('polygon'),JSON.stringify(polygon));
    report.checks.push('Boundary persists through reload via URL');
    await page.getByRole('button',{name:'Gem søgning',exact:true}).click();
    await page.getByRole('textbox',{name:'Navn på søgning',exact:true}).fill('Mit kortområde');
    await page.locator('form').filter({has:page.getByRole('textbox',{name:'Navn på søgning',exact:true})}).getByRole('button',{name:'Gem',exact:true}).click();
    assert.equal(report.writes[0]?.filters.polygon,JSON.stringify(polygon));
    report.checks.push('Saved search includes the exact drawn boundary');
    await page.getByRole('button',{name:'Tegn område',exact:true}).click();
    await canvas.click({position:{x:box.width*.3,y:box.height*.5}});
    await page.keyboard.press('Escape');
    assert.equal(page.url(),savedUrl);
    report.checks.push('Cancel preserves committed boundary');
    await page.getByRole('button',{name:'Fjern område',exact:true}).click();
    await page.waitForURL(url=>!url.searchParams.has('polygon'));
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid="property-results"] a[href^="/property/"]').length===8);
    report.checks.push('Remove boundary restores unrestricted filtered results');
    await page.getByRole('button',{name:/Flere filtre/}).click();
    await page.getByRole('dialog').waitFor();
    const dialog=page.getByRole('dialog');
    const controls=dialog.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]');
    await controls.last().focus();await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true,'Forward tab must remain in modal');
    await controls.first().focus();await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true,'Backward tab must remain in modal');
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    report.checks.push('Responsive filter dialog traps focus and closes with Escape');
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Kort',exact:true}).click();
    await page.getByRole('button',{name:'Tegn område',exact:true}).waitFor();
    await page.getByText('Søgning gemt',{exact:true}).waitFor({state:'hidden'});
    await snap('search-mobile-map');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile document overflow');
    await page.getByRole('button',{name:'Tegn område',exact:true}).tap();
    const mobileCanvas=page.locator('.maplibregl-canvas').first();
    const mobileBox=await mobileCanvas.boundingBox();assert(mobileBox);
    for(const [x,y] of [[.15,.32],[.75,.32],[.75,.75],[.15,.75]])await mobileCanvas.tap({position:{x:mobileBox.width*x,y:mobileBox.height*y}});
    await page.getByText(/Klik eller tryk på kortet: 4 punkter/).waitFor();
    await page.getByRole('button',{name:'Afslut område',exact:true}).tap();
    await page.waitForURL(url=>url.searchParams.has('polygon'));
    const touchPolygon=JSON.parse(new URL(page.url()).searchParams.get('polygon'));
    assert.equal(touchPolygon.length,4,'Touch drawing must preserve four vertices');
    await snap('search-mobile-boundary');
    await page.getByRole('button',{name:'Fjern område',exact:true}).tap();
    await page.waitForURL(url=>!url.searchParams.has('polygon'));
    report.checks.push('390px touch drawing creates and removes a real four-vertex canvas boundary');
    const cluster=page.getByRole('button',{name:/Zoom ind på \d+ boliger/}).first();
    await cluster.waitFor();
    const beforeCluster=report.requests.filter(request=>request.bbox).at(-1)?.bbox;
    const expandedViewport=page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/properties'&&url.searchParams.has('bbox')&&url.searchParams.get('bbox')!==beforeCluster&&!url.searchParams.has('polygon');});
    await cluster.focus();await page.keyboard.press('Enter');
    const expandedRequest=await expandedViewport;
    const oldBounds=beforeCluster.split(',').map(Number),newBounds=new URL(expandedRequest.url()).searchParams.get('bbox').split(',').map(Number);
    assert(newBounds[2]-newBounds[0]<oldBounds[2]-oldBounds[0],'Keyboard activation of a cluster must zoom into a smaller viewport');
    const priceMarker=page.locator('.property-map-price').first();await priceMarker.waitFor();
    await priceMarker.focus();await page.keyboard.press('Enter');
    await page.locator('.maplibregl-popup a[href^="/property/"]').waitFor();
    const popupText=await page.locator('.maplibregl-popup').innerText();
    assert(listings.some(listing=>popupText.includes(listing.address)),'Keyboard-opened popup must identify an actual fixture property');
    await page.locator('.maplibregl-popup-close-button').click();
    report.checks.push('Keyboard Enter expands a named cluster and opens a price-marker popup with a property link');
    await page.getByRole('button',{name:'Liste',exact:true}).click();
    await snap('search-mobile-list');
    report.checks.push('390px mobile list/map toggle and page have no horizontal overflow');
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'Skift til mørkt tema'}).click();
    // Finish theme color transitions before evaluating contrast in the saved image.
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
    await snap('search-dark');
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dark')),true);
    report.checks.push('Dark theme remains available with the shared blue palette');
    assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.unexpected,[]);
  } catch(error) {report.failure=error.stack;await snap('search-failure').catch(()=>{});throw error;}
  finally {fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,pageErrors:report.pageErrors,unexpected:report.unexpected,report:path.join(output,'report.json')},null,2));await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
