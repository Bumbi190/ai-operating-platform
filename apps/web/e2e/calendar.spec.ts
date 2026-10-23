import {test,expect} from '@playwright/test';
test('shows source-aware status dots and opens calendar attention on mobile and desktop',async({page})=>{
 const zone='Europe/Stockholm',projectId='10000000-0000-4000-8000-000000000001';
 const base={projectId,editable:false,href:'/projects/familje-stunden/social#content',pendingChange:null,time:{kind:'all_day',startDate:'2026-10-22',endDateExclusive:'2026-10-23',timeZone:zone}};
 const entries=[
  {...base,id:'social:1',title:'Publiceringskontroll',status:'published',source:{kind:'social',projectId,postId:'p',revisionId:'r',sha256:'a'.repeat(64),jobId:'j'}},
  {...base,id:'workflow:1',title:'Illustrationer',status:'failed',source:{kind:'workflow',projectId,instanceId:'w'}},
  {...base,id:'workflow:2',title:'Sagan färdig',status:'complete',source:{kind:'workflow',projectId,instanceId:'w2'}},
 ];
 await page.route('**/api/calendar?**',route=>route.fulfill({json:{range:{fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:zone},entries,projects:[],unscheduledTasks:[],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}}}));
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:844});await open(page);
  if(width===390)await page.getByRole('button',{name:/torsdag 22/}).click();
  await expect(page.locator('[data-event-id="social:1"] [data-tone="review"]')).toBeVisible();
  await expect(page.locator('[data-event-id="workflow:1"] [data-tone="error"]')).toBeVisible();
  await expect(page.locator('[data-event-id="workflow:2"] [data-tone="success"]')).toBeVisible();
  const notices=page.getByRole('region',{name:'Kalendernotiser för veckan'});
  await notices.getByText('Behöver din uppmärksamhet (2)').click();
  await notices.getByRole('button',{name:'Öppna kalendernotis: Publiceringskontroll'}).click();
  await expect(page.getByRole('dialog')).toContainText('Publicering behöver bekräftas');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(process.env.CALENDAR_STATUS_SCREENSHOT_DIR)await page.screenshot({path:process.env.CALENDAR_STATUS_SCREENSHOT_DIR+'/kalender-status-'+width+'.png',fullPage:true});
 }
});
test.beforeEach(async({request})=>{await request.post('/_test/reset')});
async function open(page:any){await page.goto('/calendar?week=2026-10-19');await expect(page.getByRole('heading',{name:'Kalender',exact:true})).toBeVisible({timeout:20000})}
async function setClock(page:any,label:string,time:string){
 await page.getByRole('button',{name:label,exact:true}).click();
 const quick=page.getByRole('group',{name:'Välj '+label.toLowerCase()}).getByRole('button',{name:time,exact:true});
 if(await quick.count()){await quick.click();return;}
 await page.getByRole('button',{name:'09:00',exact:true}).click();
 await page.getByRole('button',{name:label,exact:true}).click();
 const [h,m]=time.split(':').map(Number);
 await page.getByRole('button',{name:String((h%12)||12),exact:true}).click();
 await page.getByLabel('Välj minut').getByRole('button',{name:String(m).padStart(2,'0'),exact:true}).click();
 if(h>=12){await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'Eftermiddag'}).click();await page.getByLabel('Välj minut').getByRole('button',{name:String(m).padStart(2,'0'),exact:true}).click();}
}
async function fillMeeting(page:any,title='Möte med Oscar'){
 await page.getByRole('button',{name:'Ny händelse',exact:true}).click();
 await page.getByLabel('Titel',{exact:true}).fill(title);await page.getByLabel('Datum',{exact:true}).fill('2026-10-22');await setClock(page,'Starttid','14:00');
 await page.getByLabel('Ingen sluttid').uncheck();await page.getByLabel('Slutdatum',{exact:true}).fill('2026-10-22');await setClock(page,'Sluttid','15:00');
}
test('expanded clock stays inside event panel at desktop and narrow widths',async({page})=>{
 for(const width of [1024,525,390]){
  await page.setViewportSize({width,height:800});
  await open(page);
  await page.getByRole('button',{name:'Ny h\u00e4ndelse',exact:true}).click();
  await page.getByRole('button',{name:'Starttid',exact:true}).click();
  const picker=page.getByRole('group',{name:'V\u00e4lj starttid'});
  await expect(picker).toBeVisible();
  const geometry=await picker.evaluate(element=>{
   const panel=element.closest('[role=dialog]') as HTMLElement;
   const box=element.getBoundingClientRect(),panelBox=panel.getBoundingClientRect(),panelStyle=getComputedStyle(panel);
   return {left:box.left,right:box.right,allowedLeft:panelBox.left+parseFloat(panelStyle.paddingLeft),allowedRight:panelBox.right-parseFloat(panelStyle.paddingRight),horizontalOverflow:panel.scrollWidth>panel.clientWidth+2};
  });
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.allowedLeft-2);
  expect(geometry.right).toBeLessThanOrEqual(geometry.allowedRight+2);
  expect(geometry.horizontalOverflow).toBe(false);
  await picker.getByRole('button',{name:'Klar'}).click();
  await expect(picker).toHaveCount(0);
 }
});
test('mobile clock and recurrence controls are usable without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 await page.getByRole('button',{name:'Ny händelse',exact:true}).click();
 await expect(page.getByRole('button',{name:'Starttid'})).toBeVisible();
 await page.getByRole('button',{name:'Starttid'}).click();
 await expect(page.getByRole('group',{name:'Välj starttid'})).toBeVisible();
 await page.getByRole('button',{name:'15:00',exact:true}).click();
 await expect(page.getByRole('button',{name:'Starttid'})).toContainText('15:00');
 await page.getByLabel('Upprepning').selectOption('weekly');
 await expect(page.getByLabel('Upprepa till')).toBeVisible();
 await page.getByLabel('Titel',{exact:true}).fill('Gym varje vecka');
 await expect(page.getByRole('button',{name:'Avsluta upprepning efter idag'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('creates, reloads, moves, cancels and restores a meeting',async({page})=>{
 await open(page);await fillMeeting(page);await page.getByRole('button',{name:'Spara',exact:true}).click();
 await expect(page.getByRole('button',{name:/Möte med Oscar/})).toBeVisible();await page.reload();
 await page.getByRole('button',{name:/Möte med Oscar/}).click();await page.getByLabel('Datum',{exact:true}).fill('2026-10-23');await setClock(page,'Starttid','10:00');await page.getByLabel('Slutdatum',{exact:true}).fill('2026-10-23');await setClock(page,'Sluttid','11:00');await page.getByRole('button',{name:'Spara',exact:true}).click();
 const event=page.getByRole('button',{name:/Möte med Oscar/});await expect(event).toHaveAttribute('data-start-utc','2026-10-23T08:00:00.000Z');await event.click();await page.getByRole('button',{name:'Avboka händelse'}).click();
 await expect(event).toHaveAttribute('data-status','cancelled');await event.click();await page.getByRole('button',{name:'Återställ händelse'}).click();await expect(event).toHaveAttribute('data-status','scheduled');
});
test('shows one readable day at 390px and supports keyboard opening',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await fillMeeting(page,'Mobilmöte');await page.getByRole('button',{name:'Spara',exact:true}).click();
 await page.getByRole('button',{name:/torsdag 22/}).click();const event=page.getByRole('button',{name:/Mobilmöte/});await expect(event).toBeVisible();await event.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('keeps the draft through Escape and a failed save',async({page,request})=>{
 await open(page);await fillMeeting(page,'Mitt osparade möte');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Fortsätt utkast'}).click();await expect(page.getByLabel('Titel',{exact:true})).toHaveValue('Mitt osparade möte');
 await request.post('/_test/errors',{data:{save:true}});await page.getByRole('button',{name:'Spara',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'sparas'})).toContainText('sparas');await expect(page.getByLabel('Titel',{exact:true})).toHaveValue('Mitt osparade möte');
 await request.post('/_test/errors',{data:{save:false}});await page.getByRole('button',{name:'Spara',exact:true}).click();await expect(page.getByRole('button',{name:/Mitt osparade möte/})).toBeVisible();
});
test('clears private entries on account change and ignores an old delayed week response',async({page,request})=>{
 await open(page);await fillMeeting(page,'Endast konto A');await page.getByRole('button',{name:'Spara',exact:true}).click();
 await request.post('/_test/delay',{data:{date:'2026-10-26',ms:700}});await page.getByRole('button',{name:'Nästa vecka'}).click();await page.getByRole('button',{name:'Byt testkonto'}).click();
 await page.waitForTimeout(900);await expect(page.getByRole('button',{name:/Endast konto A/})).toHaveCount(0);
 await expect(page.locator('[data-week]')).toHaveAttribute('data-week','2026-10-19');
});
test('keeps original IDs and times for all-day, overnight, overlapping and point events',async({page,request})=>{
 await request.post('/_test/reset',{data:{geometry:true}});await open(page);
 await expect(page.locator('[data-date="2026-10-25"]').getByRole('button',{name:/Heldag den 25:e/})).toBeVisible();
 const night=page.locator('[data-event-id="manual:10000000-0000-4000-8000-000000000002"]');await expect(night).toHaveCount(2);
 await expect(night.first()).toHaveAttribute('data-start-utc','2026-10-22T21:00:00.000Z');
 await expect(page.getByRole('button',{name:/Punkt utan sluttid/})).toHaveAttribute('data-end-utc','');
 await expect(page.getByRole('button',{name:/Överlapp A/})).toHaveAttribute('data-columns','2');
 await night.first().click();await page.getByLabel('Arbetsstatus').selectOption('in_progress');await page.getByRole('button',{name:'Spara',exact:true}).click();
 await night.first().click();await expect(page.getByLabel('Arbetsstatus')).toHaveValue('in_progress');await page.getByLabel('Arbetsstatus').selectOption('done');await page.getByRole('button',{name:'Spara',exact:true}).click();await expect(night.first()).toContainText('Klart');
});
test('keeps private entries when social reads fail and reports a failed week read',async({page,request})=>{
 await open(page);await fillMeeting(page,'Privat finns kvar');await page.getByRole('button',{name:'Spara',exact:true}).click();await request.post('/_test/errors',{data:{social:false}});await page.reload();
 await expect(page.getByRole('button',{name:/Privat finns kvar/})).toBeVisible();await expect(page.getByRole('status')).toContainText('sociala');
 await request.post('/_test/errors',{data:{read:true}});await page.getByRole('button',{name:'Nästa vecka'}).click();await expect(page.getByRole('alert').filter({hasText:'Veckan kunde inte läsas'})).toContainText('läsas');
});
test('captures the desktop and mobile calendar layouts',async({page,request})=>{
 await request.post('/_test/reset',{data:{geometry:true}});await page.setViewportSize({width:1440,height:1000});await open(page);await page.screenshot({path:'../../.superpowers/sdd/2026-10-18-omnira-calendar/calendar-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/torsdag 22/}).click();await page.screenshot({path:'../../.superpowers/sdd/2026-10-18-omnira-calendar/calendar-mobile.png',fullPage:true});
});

test('shows the approved social time and its proposed new time together',async({page,request})=>{
 await request.post('/_test/reset',{data:{pending:true}});await open(page);
 await expect(page.getByRole('button',{name:/^Familjeinlägg · 17:00 · Schemalagt/})).toHaveCount(1);
 const proposed=page.getByRole('button',{name:/Tidsförslag · Familjeinlägg/});await expect(proposed).toBeVisible();await expect(proposed).toHaveAttribute('data-start-utc','2026-10-23T15:00:00.000Z');await proposed.click();
 await expect(page.getByRole('dialog')).toContainText('2026-10-22 kl 17:00');await expect(page.getByRole('dialog')).toContainText('2026-10-23 kl 17:00');await expect(page.getByRole('button',{name:'Föreslå ny tid'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Spara',exact:true})).toHaveCount(0);
});
test('updates the current-time marker as the minute changes',async({page})=>{
 await page.clock.install({time:new Date('2026-10-22T12:00:00.000Z')});await open(page);
 const marker=page.locator('[aria-label="Aktuell tid"]');await expect(marker).toHaveCSS('top','840px');
 await page.clock.runFor(60000);await expect(marker).toHaveCSS('top','841px');
});

test('clears private state on auth notifications without replacing the server owner prop',async({page,request})=>{
 await request.post('/_test/reset',{data:{demo:true}});await open(page);
 await expect(page.getByRole('button',{name:/Möte med Oscar/})).toBeVisible();await fillMeeting(page,'A:s privata utkast');
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),reached=new Promise<void>(resolve=>seen=resolve);
 await page.route('**/api/calendar?**',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response}).catch(()=>{});});
 await page.getByRole('button',{name:'Nästa vecka'}).click();await reached;
 await page.getByRole('button',{name:'Logga ut i testsession',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:/Möte med Oscar/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Fortsätt utkast'})).toHaveCount(0);
 await page.getByRole('button',{name:'Logga in som B utan sidbyte',exact:true}).click();release();await page.waitForTimeout(150);
 await expect(page.getByRole('button',{name:'Ny händelse',exact:true})).toBeDisabled();
 await expect(page.getByRole('status')).toContainText('Sessionen har ändrats');
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:/Möte med Oscar/})).toHaveCount(0);
});
test('ignores a saved A receipt after the authenticated session has changed to B',async({page})=>{
 await open(page);await fillMeeting(page,'Sparades för A');
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),reached=new Promise<void>(resolve=>seen=resolve);
 await page.route('**/api/calendar',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response}).catch(()=>{});});
 await page.getByRole('button',{name:'Spara',exact:true}).click();await reached;
 await page.getByRole('button',{name:'Logga ut i testsession',exact:true}).click();await page.getByRole('button',{name:'Logga in som B utan sidbyte',exact:true}).click();release();
 await page.waitForTimeout(150);await expect(page.getByRole('button',{name:/Sparades för A/})).toHaveCount(0);
 await expect(page.getByRole('status')).not.toContainText('Händelsen är sparad');
 await expect(page.getByRole('button',{name:'Ny händelse',exact:true})).toBeDisabled();
});
test('refreshes the visible week after a delayed save and preserves its events',async({page,request})=>{
 await request.post('/api/calendar',{data:{operation:'create',eventId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),draft:{kind:'private',title:'Vecka B ligger kvar',description:'',location:'',projectId:null,taskId:null,time:{kind:'timed',startUtc:'2026-10-29T12:00:00.000Z',endUtc:null,timeZone:'Europe/Stockholm'},workStatus:null}}});
 await open(page);await fillMeeting(page,'Sparning i vecka A');
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),reached=new Promise<void>(resolve=>seen=resolve);
 await page.route('**/api/calendar',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response});});
 await page.getByRole('button',{name:'Spara',exact:true}).click();await reached;await page.getByRole('button',{name:'Nästa vecka'}).click();
 await expect(page.getByRole('button',{name:/Vecka B ligger kvar/})).toBeVisible();release();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('status')).toContainText('Händelsen är sparad');
 await page.waitForTimeout(150);await expect(page.locator('[data-week]')).toHaveAttribute('data-week','2026-10-26');
 await expect(page.getByRole('button',{name:/Vecka B ligger kvar/})).toBeVisible();await expect(page.getByRole('button',{name:/Sparning i vecka A/})).toHaveCount(0);
});
test('a delayed receipt preserves a later editor and its unsaved fields',async({page,request})=>{
 await request.post('/_test/reset',{data:{demo:true}});await open(page);await fillMeeting(page,'Första sparningen');
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),reached=new Promise<void>(resolve=>seen=resolve);
 await page.route('**/api/calendar',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response});});
 await page.getByRole('button',{name:'Spara',exact:true}).click();await reached;await page.getByRole('button',{name:'Stäng panel'}).click();
 await page.getByRole('button',{name:/Möte med Oscar/}).click();await page.getByLabel('Anteckning').fill('Nytt osparat innehåll');
 release();await expect(page.getByRole('status')).toContainText('Händelsen är sparad');
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Anteckning')).toHaveValue('Nytt osparat innehåll');
 await expect(page.getByLabel('Titel',{exact:true})).toHaveValue('Möte med Oscar');
});
for(const [label,start,end] of [
 ['sekunder','2026-10-22T12:00:30.000Z','2026-10-22T13:00:45.000Z'],
 ['första 02:30','2026-10-25T00:30:15.000Z','2026-10-25T00:45:30.000Z'],
 ['andra 02:30','2026-10-25T01:30:15.000Z','2026-10-25T01:45:30.000Z'],
])test('preserves exact UTC times when only text is edited: '+label,async({page,request})=>{
 const id=crypto.randomUUID();await request.post('/api/calendar',{data:{operation:'create',eventId:id,idempotencyKey:crypto.randomUUID(),draft:{kind:'private',title:'Exakt '+label,description:'',location:'',projectId:null,taskId:null,time:{kind:'timed',startUtc:start,endUtc:end,timeZone:'Europe/Stockholm'},workStatus:null}}});
 await open(page);await page.locator('[data-event-id="manual:'+id+'"]').click();await page.getByLabel('Titel',{exact:true}).fill('Ändrad '+label);await page.getByLabel('Anteckning').fill('Bara text ändrades');await page.getByRole('button',{name:'Spara',exact:true}).click();
 const event=page.locator('[data-event-id="manual:'+id+'"]');await expect(event).toContainText('Ändrad');await expect(event).toHaveAttribute('data-start-utc',start);await expect(event).toHaveAttribute('data-end-utc',end);
});
test('rejects a newly entered ambiguous autumn wall time',async({page})=>{
 await open(page);await fillMeeting(page,'Tvetydig tid');await page.getByLabel('Datum',{exact:true}).fill('2026-10-25');await setClock(page,'Starttid','02:30');await page.getByLabel('Ingen sluttid').check();await page.getByRole('button',{name:'Spara',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'tider'})).toContainText('tider');await expect(page.getByLabel('Titel',{exact:true})).toHaveValue('Tvetydig tid');
});

test('shows an authorized Atlas decision and its actual outcome on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/calendar/decisions?**',async route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.has('decisionId')){
   await route.fulfill({json:{ok:true,decision:{decisionId:'decision-demo',title:'Lansering beslutad',status:'completed',statement:'Starta pilot',rationale:'Redo efter granskning',expectedImpact:'Få återkoppling',outcome:{summary:'Fem handlare svarade'},review:null,decidedAt:'2026-10-20T09:00:00Z',lastRecordAt:'2026-10-20T09:00:00Z'}}});
  }else{
   await route.fulfill({json:{decisions:[{id:'atlas-decision:decision-demo:1',sourceSystem:'atlas_decision_ledger',sourceId:'decision-demo',projectId:'project-demo',title:'Lansering beslutad',status:'completed',occurredAt:'2026-10-20T09:00:00Z',decisionAt:'2026-10-20T09:00:00Z',reviewAt:null,hasOutcome:true,detailKey:'decision-demo'}],available:true,truncated:false}});
  }
 });
 await open(page);
 await page.getByRole('button',{name:/Lansering beslutad/}).click();
 await expect(page.getByRole('dialog',{name:'Beslutsdetaljer'})).toContainText('Redo efter granskning');
 await expect(page.getByRole('dialog',{name:'Beslutsdetaljer'})).toContainText('Fem handlare svarade');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('hides decision summaries immediately after logout',async({page})=>{
 await page.route('**/api/calendar/decisions?**',async route=>route.fulfill({json:{decisions:[{id:'atlas-decision:demo:1',sourceSystem:'atlas_decision_ledger',sourceId:'demo',projectId:'demo-project',title:'Privat ledningsbeslut',status:'active',occurredAt:'2026-10-20T09:00:00Z',decisionAt:null,reviewAt:null,hasOutcome:false,detailKey:'demo'}],available:true,truncated:false}}));
 await open(page);
 await expect(page.getByRole('button',{name:/Privat ledningsbeslut/})).toBeVisible();
 await page.getByRole('button',{name:'Logga ut i testsession',exact:true}).click();
 await expect(page.getByRole('button',{name:/Privat ledningsbeslut/})).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Beslutsdetaljer'})).toHaveCount(0);
});
