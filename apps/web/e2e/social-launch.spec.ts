import {test,expect} from '@playwright/test'
import {socialFixture} from './social-launch-fixture'
test.beforeEach(async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/social')})
async function selectPinterest(page:any){await page.getByRole('checkbox',{name:'Planera Pinterest',exact:true}).check();await page.getByLabel('Syfte för Pinterest',{exact:true}).fill('Familjeaktiviteter')}
test('saves choices and approves the exact saved revision',async({page})=>{
 let sent:any
 await page.route('**/api/social-launch',async route=>{
  sent=route.request().postDataJSON();const m=socialFixture()
  m.plan.currentRevision={id:'30000000-0000-4000-8000-000000000001',sequence:1,sha256:'a'.repeat(64),choices:sent.choices??[{channel:'pinterest',purpose:'Familjeaktiviteter',format:'image',cadence:'manual'}],createdAt:'2026-10-16T00:00:00Z'}
  if(sent.operation==='decide')m.plan.decision={id:'decision',revisionId:sent.revisionId,sha256:sent.sha256,decision:sent.decision,decidedAt:'2026-10-16T00:00:00Z'}
  await route.fulfill({json:m})
 })
 await selectPinterest(page);await page.getByRole('button',{name:'Spara förslag',exact:true}).click()
 await expect(page.getByRole('button',{name:'Godkänn version 1',exact:true})).toBeVisible()
 expect(sent.choices[0].channel).toBe('pinterest')
 await page.getByRole('button',{name:'Godkänn version 1',exact:true}).click()
 await expect(page.getByText('Godkänd kanalplan', {exact:true})).toBeVisible()
 expect(sent.sha256).toBe('a'.repeat(64));expect(sent.revisionId).toContain('30000000')
})
test('retains unsaved choices on a failed save',async({page})=>{
 await page.route('**/api/social-launch',r=>r.fulfill({status:503,json:{code:'PLAN_UNAVAILABLE'}}))
 await selectPinterest(page);await page.getByRole('button',{name:'Spara förslag',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('kunde inte sparas')
 await expect(page.getByLabel('Syfte för Pinterest',{exact:true})).toHaveValue('Familjeaktiviteter')
 await expect(page.getByRole('button',{name:/Godkänn version/})).toHaveCount(0)
})
test('shows a stale conflict and retains the draft for explicit refresh',async({page})=>{
 await page.route('**/api/social-launch',r=>r.fulfill({status:409,json:{code:'REVISION_CONFLICT'}}))
 await selectPinterest(page);await page.getByRole('button',{name:'Spara förslag',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('ändrats')
 await expect(page.getByLabel('Syfte för Pinterest',{exact:true})).toHaveValue('Familjeaktiviteter')
})
test('ignores a delayed response after changing project',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r)
 await page.route('**/api/social-launch',async route=>{await gate;const m=socialFixture();m.plan.currentRevision={id:'old',sequence:1,sha256:'a'.repeat(64),choices:[{channel:'pinterest',purpose:'Gamla projektet',format:'image',cadence:'weekly'}],createdAt:'2026-10-16T00:00:00Z'};await route.fulfill({json:m}).catch(()=>{})})
 await selectPinterest(page);await page.getByRole('button',{name:'Spara förslag',exact:true}).click();await page.getByRole('button',{name:'Byt testprojekt'}).click();release()
 await expect(page.getByRole('heading',{name:'Sociala medier · Handlarbörsen'})).toBeVisible()
 await expect(page.getByRole('checkbox',{name:'Planera Pinterest',exact:true})).not.toBeChecked()
 await expect(page.getByRole('button',{name:/Godkänn version/})).toHaveCount(0)
})
test('mobile controls fit and unavailable adapters never claim connection or publishing',async({page})=>{
 await expect(page.getByRole('checkbox')).toHaveCount(6)
 await expect(page.getByText('Kontokoppling saknas i Omnira',{exact:true})).toHaveCount(1)
 await expect(page.getByRole('button',{name:/Publicera|Anslut/})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'../../.superpowers/sdd/2026-10-16-atlas-social-launch/mobile.png',fullPage:true})
})
