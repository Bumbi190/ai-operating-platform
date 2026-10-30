import {test,expect} from '@playwright/test';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
for(const channel of ['instagram','facebook'])test(channel+' requires image comparison and explicit confirmation',async({page})=>{
 const calls:any[]=[];
 await page.route('**/api/social-content/media?**',r=>r.fulfill({contentType:'image/png',body:png}));
 await page.route('https://scontent.example.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
 await page.route('**/api/social-publication-reconciliation',r=>{const body=r.request().postDataJSON();calls.push(body);return r.fulfill({json:body.operation==='inspect'?{receipt:{version:3},revision:{draft:{text:'Tre aktiviteter'},media:[{id:'asset',sha256:'a'.repeat(64)}]},candidates:[{id:'proof',accountId:'123',createdAt:'2026-10-23T18:31:47Z',text:'Tre aktiviteter',imageUrl:'https://scontent.example.test/image.png',permalink:'https://www.instagram.com/p/test/'}]}:{state:'published'}})});
 await page.goto('/reconciliation?channel='+channel);
 await page.getByRole('button',{name:/Läs befintliga/}).click();
 await page.getByRole('radio').check();
 const complete=page.getByRole('button',{name:'Koppla verifierat inlägg till kvittot'});
 await expect(complete).toBeDisabled();
 await expect(page.getByRole('checkbox')).toBeEnabled();
 await page.getByRole('checkbox').check();await expect(complete).toBeEnabled();await complete.click();
 await expect(page.locator('body')).toHaveAttribute('data-completed','true');
 expect(calls.map(c=>c.operation)).toEqual(['inspect','complete']);expect(calls[1]).toMatchObject({imageConfirmed:true,candidateId:'proof',expectedVersion:3});
});
test('ambiguous Instagram match offers no completion',async({page})=>{
 await page.route('**/api/social-publication-reconciliation',r=>r.fulfill({json:{inspectionStatus:'ambiguous',receipt:{version:3},revision:{draft:{text:'Tre aktiviteter'},media:[]},candidates:[]}}));
 await page.goto('/reconciliation');await page.getByRole('button',{name:/Läs befintliga/}).click();
 await expect(page.getByText('Flera matchande inlägg hittades. Kvittot är fortfarande osäkert.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Koppla verifierat inlägg till kvittot'})).toHaveCount(0);
});
