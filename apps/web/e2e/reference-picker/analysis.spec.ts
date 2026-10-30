import {test,expect,type Page} from '@playwright/test'
const id='70000000-0000-4000-8000-000000000001',userId='10000000-0000-4000-8000-000000000003'
async function backend(page:Page,{lose=false,delay=false,enabled=true}={}){
 const requests:any[]=[],plans:any[]=[]
 const result=await page.request.get('/fixture/concepts');expect(result.ok()).toBe(true)
 const completion=await result.json()
 let status='not_started'
 const quote={analysisId:id,messageId:id,quoteToken:id,quoteExpiresAt:'2099-10-30T14:00:00Z',maximumSek:2.2613,model:'claude-haiku-4-5-20251001'}
 const view=()=>({messageId:id,...(status==='not_started'?{}:quote),status,analysis:status==='succeeded'?completion.analysis:null,concepts:status==='succeeded'?completion.concepts:[]})
 await page.route('**/fixture/history',r=>r.fulfill({json:[]}))
 await page.route('**/api/website-build/references/tickets?*',r=>r.fulfill({json:{available:true,canSaveToChat:true,userId,...(enabled?{canAnalyzeReferences:true}:{})}}))
 await page.route('**/api/website-build/references/library?*',r=>r.fulfill({json:{available:true,items:[]}}))
 await page.route('**/api/website-build/references/analysis?*',async r=>{
  const q=new URL(r.request().url()).searchParams
  if(q.get('projectId')?.endsWith('2')){await r.fulfill({json:{items:[]}});return}
  if(q.has('messageId')){await r.fulfill({json:view()});return}
  await r.fulfill({json:{items:[{messageId:id,imageCount:1,comment:'Behåll luften från min referens',createdAt:'2026-10-30'}]}})
 })
 let release:()=>void=()=>{}
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/website-build/references/analysis',async r=>{
  const body=r.request().postDataJSON();requests.push(body)
  if(body.action==='quote'){status='quoted';await r.fulfill({json:view()});return}
  status='succeeded'
  if(delay)await held
  if(lose){lose=false;await r.abort('failed');return}
  await r.fulfill({json:view()})
 })
 await page.route('**/api/chat',async r=>{plans.push(r.request().postDataJSON());await r.fulfill({status:503,json:{error:'Fixture stops model execution'}})})
 return {requests,plans,release}
}
for(const width of [1440,390])test('explicit quote -> analysis -> three responsive concepts at '+width,async({page},info)=>{
 const api=await backend(page);await page.setViewportSize({width,height:900});await page.goto('/picker')
 await expect(page.getByLabel('Sparat referensmeddelande')).toBeVisible();expect(api.requests).toHaveLength(0)
 await page.getByRole('button',{name:'Visa kostnadstak'}).click()
 await expect(page.getByText(/2,2613/)).toBeVisible();expect(api.requests.map(x=>x.action)).toEqual(['quote'])
 await page.getByRole('button',{name:'Godkänn kostnadstak och analysera'}).click()
 await expect(page.getByRole('heading',{name:'Bildanalys',exact:true})).toBeVisible()
 expect(api.requests.map(x=>x.action)).toEqual(['quote','run']);expect(api.requests[1].approvedMaximumSek).toBe(2.2613)
 expect(api.requests[1].quoteToken).toBe(id)
 for(const title of ['Redaktionell','Bild i fokus','Tydlig struktur']){
  await page.getByRole('button',{name:title,exact:true}).click()
  const frame=page.frameLocator('iframe[title="Layoutkoncept: '+title+'"]')
  await expect(frame.getByRole('heading',{name:'En tydlig plats för ditt innehåll',exact:true})).toBeVisible()
  expect(await page.locator('iframe[title="Layoutkoncept: '+title+'"]').getAttribute('sandbox')).toBe('')
 }
 await page.getByRole('button',{name:'Mobilvy',exact:true}).click()
 expect(await page.locator('iframe[title^="Layoutkoncept:"]').evaluate((el:HTMLIFrameElement)=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(390)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
 const preview=page.locator('iframe[title^="Layoutkoncept:"]')
 await preview.scrollIntoViewIfNeeded()
 await expect(page.frameLocator('iframe[title^="Layoutkoncept:"]').getByRole('heading',{name:'En tydlig plats för ditt innehåll',exact:true})).toBeVisible()
 await preview.screenshot({path:info.outputPath('concept-mobile-'+width+'.png')})
 await page.screenshot({path:info.outputPath('analysis-'+width+'.png'),fullPage:true})
 await page.getByRole('button',{name:'Planera med riktningen'}).click()
 await expect.poll(()=>api.plans.length).toBe(1)
 expect(api.plans[0].messages.at(-1).content).toContain('conceptSha256')
 expect(api.plans[0].visiblePlan).toBeUndefined()
})
test('lost completion response reconciles by read without another paid action',async({page})=>{
 const api=await backend(page,{lose:true});await page.goto('/picker')
 await page.getByRole('button',{name:'Visa kostnadstak'}).click()
 await page.getByRole('button',{name:'Godkänn kostnadstak och analysera'}).click()
 await expect(page.getByRole('alert')).toContainText('Uppdatera status')
 await expect(page.getByRole('button',{name:'Godkänn kostnadstak och analysera'})).toHaveCount(0)
 await page.getByRole('button',{name:'Uppdatera analysstatus'}).click()
 await expect(page.getByRole('heading',{name:'Bildanalys',exact:true})).toBeVisible()
 await page.reload();await expect(page.getByRole('heading',{name:'Bildanalys',exact:true})).toBeVisible()
 expect(api.requests.map(x=>x.action)).toEqual(['quote','run'])
})
test('scope switch and signout discard late private analysis responses',async({page})=>{
 const api=await backend(page,{delay:true});await page.goto('/picker')
 await page.getByRole('button',{name:'Visa kostnadstak'}).click()
 await page.getByRole('button',{name:'Godkänn kostnadstak och analysera'}).click()
 await expect.poll(()=>api.requests.length).toBe(2)
 await page.getByRole('button',{name:'Byt projekt'}).click();api.release()
 await expect(page.getByLabel('Designanalys av referenser')).not.toContainText('Bildanalys')
 await page.getByRole('button',{name:'Simulera utloggning'}).click()
 await expect(page.getByLabel('Designanalys av referenser')).toHaveCount(0)
})
test('unadvertised analysis creates no analysis requests or controls',async({page})=>{
 await backend(page,{enabled:false});let calls=0
 page.on('request',r=>{if(r.url().includes('/references/analysis'))calls++})
 await page.goto('/picker');await expect(page.getByText('Sparade bilder i denna konversation')).toBeVisible()
 await expect(page.getByLabel('Designanalys av referenser')).toHaveCount(0);expect(calls).toBe(0)
})
