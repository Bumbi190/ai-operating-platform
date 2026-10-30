import {test,expect} from '@playwright/test';
const dialog=(page:any)=>page.getByRole('dialog',{name:/Dagens film|Familjebild|Mejlutkast|Film utan datum/});
test.beforeEach(async({request})=>{await request.post('/_test/reset',{data:{contentDetail:true}})});
test('existing review inspector renders drafts inline and clears the selected content on source/account changes without writing',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/'))writes.push(r.url())});
 await page.goto('/review-content');const inspector=page.getByRole('region',{name:'Granskat innehåll'});
 for(const text of ['to@example.se','cc@example.se','bcc@example.se','Hela mejlutkastet','Underlag.pdf'])await expect(inspector).toContainText(text);
 await expect(inspector.locator('img,iframe,script')).toHaveCount(0);await page.getByRole('button',{name:/Vanlig rapport/}).click();await expect(inspector).toContainText('Hela rapporten');await expect(inspector).not.toContainText('to@example.se');
 await page.getByRole('button',{name:'Logga ut i testsession'}).click();await expect(inspector).toHaveCount(0);await expect(page.getByText('Hela rapporten')).toHaveCount(0);expect(writes).toEqual([]);expect(errors).toEqual([]);
});
test('replaces box with dated film cards and plays/inspects selected video in the side panel',async({page},testInfo)=>{
 const writes:string[]=[],loads:string[]=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/'))writes.push(r.url());if(r.url().includes('movie-'))loads.push(r.url())});
 await page.goto('/calendar?week=2026-10-26');await expect(page.getByRole('region',{name:'The Prompts publiceringskö'})).toHaveCount(0);
 const card=page.getByRole('button',{name:'Dagens film A · Utan klockslag · Godkänt · väntar'});await expect(card).toBeVisible();await expect(card).toHaveAttribute('data-start-utc','');await card.click();
 await expect(dialog(page)).toContainText('Hela manuset för film A');await expect(dialog(page)).toContainText('Godkännandedatum · ingen fast publiceringstid');await expect(dialog(page).locator('video')).toHaveAttribute('preload','none');await expect(dialog(page)).toContainText('YouTube');expect(loads).toEqual([]);expect(writes).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('calendar-inline-desktop.png'),fullPage:true});
});
test('previews the exact Family image and complete synthetic email inside details without active email HTML',async({page})=>{
 await page.goto('/calendar?week=2026-10-26');await page.getByRole('button',{name:/Familjebild att granska · 16:00/}).click();
 await expect(dialog(page)).toContainText('Hela den sparade bildtexten');await expect(dialog(page).getByRole('img',{name:'Familjebild',exact:true})).toBeVisible();await dialog(page).getByRole('button',{name:'Stäng panel'}).click();
 await page.getByRole('button',{name:/Mejlutkast – exempel · Utan klockslag/}).click();const email=dialog(page).getByRole('region',{name:'Mejlutkast'});
 for(const text of ['mottagare@example.se','kopia@example.se','hemlig@example.se','Veckans underlag','Hela mejltexten','Underlag.pdf'])await expect(email).toContainText(text);await expect(email.locator('img,iframe,form')).toHaveCount(0);
});
test('ignores a late previous film after selecting another and clears private details on account change',async({page})=>{
 let release:()=>void=()=>{};const blocked=new Promise<void>(r=>{release=r});
 await page.route('**/api/calendar/detail?**',async route=>{const source=JSON.parse(new URL(route.request().url()).searchParams.get('source')!);if(source.scriptId.endsWith('001'))await blocked;await route.fulfill({json:{ok:true,detail:{source,title:'Film',content:{kind:'text',text:source.scriptId.endsWith('001')?'OLD-FILM':'CURRENT-FILM'},sourceHref:null,revisionHash:null}}}).catch(()=>{});});
 await page.goto('/calendar?week=2026-10-26');const request=page.waitForRequest(r=>r.url().includes('/api/calendar/detail?'));await page.getByRole('button',{name:/Dagens film A · Utan/}).click();await request;await page.getByRole('button',{name:/Dagens film B · Utan/}).click();await expect(dialog(page)).toContainText('CURRENT-FILM');release();await page.waitForTimeout(150);await expect(dialog(page)).not.toContainText('OLD-FILM');
 await page.getByRole('button',{name:'Logga ut i testsession'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('CURRENT-FILM')).toHaveCount(0);
});
test('keeps undated content accessible and mobile details inside viewport',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/calendar?week=2026-10-26');await page.getByText('Nyheter utan datum (1)',{exact:true}).click();await page.getByRole('button',{name:'Film utan datum',exact:true}).click();
 await expect(dialog(page)).toContainText('Datum saknas');await expect(dialog(page)).toContainText('Ingen verifierbar färdig video');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('calendar-inline-mobile.png'),fullPage:true});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('reports detail failure locally and closes details on project/week changes',async({page})=>{
 await page.route('**/api/calendar/detail?**',r=>r.fulfill({status:503,json:{ok:false,code:'UNAVAILABLE'}}));await page.goto('/calendar?week=2026-10-26');await page.getByRole('button',{name:/Dagens film A · Utan/}).click();await expect(dialog(page)).toContainText('Innehållet kunde inte läsas');await expect(page.getByRole('button',{name:'Nästa vecka',exact:true})).toBeEnabled();
 await page.getByLabel('Visa i kalendern').selectOption('private');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:/Dagens film A · Utan/})).toHaveCount(0);
});
