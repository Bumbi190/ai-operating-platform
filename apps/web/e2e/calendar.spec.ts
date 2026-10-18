import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.post('/_test/reset')});
async function open(page:any){await page.goto('/calendar?week=2026-10-19');await expect(page.getByRole('heading',{name:'Kalender',exact:true})).toBeVisible()}
async function fillMeeting(page:any,title='Möte med Oscar'){
 await page.getByRole('button',{name:'Ny händelse',exact:true}).click();
 await page.getByLabel('Titel',{exact:true}).fill(title);await page.getByLabel('Datum',{exact:true}).fill('2026-10-22');await page.getByLabel('Starttid',{exact:true}).fill('14:00');
 await page.getByLabel('Ingen sluttid').uncheck();await page.getByLabel('Slutdatum',{exact:true}).fill('2026-10-22');await page.getByLabel('Sluttid',{exact:true}).fill('15:00');
}
test('creates, reloads, moves, cancels and restores a meeting',async({page})=>{
 await open(page);await fillMeeting(page);await page.getByRole('button',{name:'Spara',exact:true}).click();
 await expect(page.getByRole('button',{name:/Möte med Oscar/})).toBeVisible();await page.reload();
 await page.getByRole('button',{name:/Möte med Oscar/}).click();await page.getByLabel('Datum',{exact:true}).fill('2026-10-23');await page.getByLabel('Starttid',{exact:true}).fill('10:00');await page.getByLabel('Slutdatum',{exact:true}).fill('2026-10-23');await page.getByLabel('Sluttid',{exact:true}).fill('11:00');await page.getByRole('button',{name:'Spara',exact:true}).click();
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
 await request.post('/_test/errors',{data:{save:true}});await page.getByRole('button',{name:'Spara',exact:true}).click();await expect(page.getByRole('alert')).toContainText('sparas');await expect(page.getByLabel('Titel',{exact:true})).toHaveValue('Mitt osparade möte');
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
 await request.post('/_test/errors',{data:{read:true}});await page.getByRole('button',{name:'Nästa vecka'}).click();await expect(page.getByRole('alert')).toContainText('läsas');
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
