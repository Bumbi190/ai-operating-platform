import {test,expect} from '@playwright/test';
const P='10000000-0000-4000-8000-000000000020';
test.beforeEach(async({request})=>{await request.post('/_test/reset',{data:{mediaQueue:true}})});
const region=(page:any)=>page.getByRole('region',{name:'The Prompts publiceringskö'});
test('shows approved ready, unfinished and pending YouTube in current undated queue with project filtering',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/'))writes.push(r.url())});
 await page.goto('/calendar?week=2026-10-19');await expect(region(page)).toBeVisible();
 await expect(region(page)).toContainText('Godkänd film');await expect(region(page)).toContainText('Video förbereds');await expect(region(page)).toContainText('YouTube väntar');
 await expect(region(page)).toContainText('Ingen fast publiceringstid');await expect(region(page)).toContainText('Publicerat · sparat kvitto');
 await page.screenshot({path:'../../.superpowers/sdd/2026-10-26-the-prompt-calendar-visibility/browser/prompt-queue-desktop.png',fullPage:true});
 await expect(page.getByRole('button',{name:/Godkänd film|YouTube väntar/})).toHaveCount(0);
 await page.getByRole('button',{name:'Nästa vecka',exact:true}).click();await expect(region(page)).toContainText('oavsett vilken kalendervecka');
 await page.getByLabel('Visa i kalendern').selectOption('private');await expect(region(page)).toHaveCount(0);
 await page.getByLabel('Visa i kalendern').selectOption(P);await expect(region(page)).toBeVisible();
 await expect(region(page).getByRole('link')).toHaveAttribute('href','/projects/ai-media-automation/scripts');
 await region(page).getByRole('link').click();await expect(page).toHaveURL(/\/projects\/ai-media-automation\/scripts$/);expect(writes).toEqual([]);
});
test('refreshes once on focus/visibility and removes completed queue rows',async({page,request})=>{
 await page.goto('/calendar?week=2026-10-19');await expect(region(page)).toContainText('Godkänd film');
 await request.post('/_test/media',{data:{version:1}});let reads=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/calendar')reads++});
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))});
 await expect(region(page)).not.toContainText('Godkänd film');await expect(region(page)).toContainText('YouTube väntar');expect(reads).toBe(1);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'../../.superpowers/sdd/2026-10-26-the-prompt-calendar-visibility/browser/prompt-queue-mobile.png',fullPage:true});
});
test('hides stale queue on failed refresh and on logout while an old read finishes',async({page,request})=>{
 await page.goto('/calendar?week=2026-10-19');await expect(region(page)).toContainText('Godkänd film');
 await request.post('/_test/errors',{data:{read:true}});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('alert').filter({hasText:'Veckan kunde inte läsas'})).toBeVisible();await expect(region(page)).toHaveCount(0);
 await request.post('/_test/errors',{data:{read:false}});await page.getByRole('button',{name:'Försök igen',exact:true}).click();await expect(region(page)).toBeVisible();
 await request.post('/_test/delay',{data:{date:'2026-10-19',ms:500}});const pending=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/calendar');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await pending;
 await page.getByRole('button',{name:'Logga ut i testsession'}).click();await expect(region(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Logga in som B utan sidbyte'}).click();await expect(region(page)).toHaveCount(0);
 await page.waitForTimeout(650);await expect(region(page)).toHaveCount(0);
});
test('does not carry the previous account queue into a newly mounted user workspace',async({page})=>{
 await page.goto('/calendar?week=2026-10-19');await expect(region(page)).toContainText('Godkänd film');
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/calendar');await page.getByRole('button',{name:'Byt testkonto'}).click();await response;
 await expect(region(page)).toHaveCount(0);await expect(page.getByLabel('Visa i kalendern').getByRole('option',{name:'The Prompt'})).toHaveCount(0);
});
test('keeps a long queue compact with current films first and expandable history',async({page,request})=>{
 await request.post('/_test/media',{data:{version:2}});await page.goto('/calendar?week=2026-10-19');
 await expect(region(page)).toContainText('Godkänd film');await expect(region(page).getByText('Godkänd film',{exact:true})).toBeVisible();
 await expect(region(page).getByText('Äldre film 7',{exact:true})).not.toBeVisible();await region(page).getByText('Visa fler filmer (6)').click();await expect(region(page).getByText('Äldre film 7',{exact:true})).toBeVisible();
});
