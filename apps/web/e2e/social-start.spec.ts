import {test,expect} from '@playwright/test'
import {contentFixture} from './social-content-fixture'
import {socialFixture} from './social-launch-fixture'
const projectId='10000000-0000-4000-8000-000000000001'
const view=(id=projectId)=>({project:{id,name:id.endsWith('1')?'Familje-Stunden':'Handlarbörsen',slug:'social-'+id},revision:null as any,assets:[],hasMoreAssets:false,workspaceUrl:'/projects/social-'+id+'/social#profile'})
test.beforeEach(async({page})=>{await page.setViewportSize({width:390,height:844})})
async function mocks(page:any,fail=false){
 let model=view(),saved:any,requests:any[]=[]
 await page.route('**/api/social-profile?*',async(route:any)=>{const id=new URL(route.request().url()).searchParams.get('projectId')!;await route.fulfill({json:id===model.project.id?model:view(id)})})
 await page.route('**/api/social-profile',async(route:any)=>{saved=route.request().postDataJSON();requests.push(saved);if(fail){await route.fulfill({status:503,json:{code:'UNAVAILABLE'}});return}model={...view(saved.projectId),revision:{id:'40000000-0000-4000-8000-000000000001',sequence:1,sha256:'a'.repeat(64),profile:saved.profile,createdAt:'2026-10-16T11:30:00Z'}};await route.fulfill({json:model})})
 await page.route('**/api/social-content?*',async(route:any)=>{const v=contentFixture();v.planApproved=false;await route.fulfill({json:v})})
 return {requests,model:()=>model,saved:()=>saved}
}
async function fill(page:any){await page.getByRole('button',{name:'Företagsunderlag',exact:true}).click();await page.getByLabel('Vad erbjuder företaget?',{exact:true}).fill('Sagor och aktiviteter');await page.getByLabel('Vem vill ni nå?',{exact:true}).fill('Föräldrar med små barn');await page.getByLabel('Ton och språk',{exact:true}).fill('Varm svenska')}
test('locked draft explains the next action and opens the channel plan',async({page})=>{await mocks(page);await page.goto('/start#content');await expect(page.getByRole('button',{name:'Nytt utkast',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Gå till kanalplanen',exact:true}).click();await expect(page.getByLabel('Planera Facebook',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Börja här',exact:true})).toBeVisible()})
test('saves context with explicit working-context status and persists after reload',async({page})=>{const m=await mocks(page);await page.goto('/start');await fill(page);await page.getByLabel('Webbplats (valfritt)',{exact:true}).fill('https://example.test');await page.getByRole('button',{name:'Spara företagsunderlag',exact:true}).click();await expect(page.getByText('Sparat underlag · version 1',{exact:true})).toBeVisible();expect(m.saved().profile.websiteUrl).toBe('https://example.test');expect(m.saved().expectedRevisionId).toBeNull();await page.reload();await page.getByRole('button',{name:'Företagsunderlag',exact:true}).click();await expect(page.getByLabel('Vad erbjuder företaget?',{exact:true})).toHaveValue('Sagor och aktiviteter');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)})
test('failed save retains exact draft and one retry intent across tabs',async({page})=>{const m=await mocks(page,true);await page.goto('/start');await fill(page);await page.getByRole('button',{name:'Spara företagsunderlag',exact:true}).click();await expect(page.getByRole('alert')).toContainText('finns kvar');const key=m.saved().idempotencyKey;await page.getByRole('button',{name:'Kanaler och konton',exact:true}).click();await page.getByRole('button',{name:'Företagsunderlag',exact:true}).click();await expect(page.getByLabel('Vad erbjuder företaget?',{exact:true})).toHaveValue('Sagor och aktiviteter');await page.getByRole('button',{name:'Spara företagsunderlag',exact:true}).click();expect(m.saved().idempotencyKey).toBe(key)})
test('refresh does not overwrite dirty fields and save waits for held reads',async({page})=>{await mocks(page);await page.goto('/start');await fill(page);page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Läs senaste underlaget',exact:true}).click();await expect(page.getByLabel('Vad erbjuder företaget?',{exact:true})).toHaveValue('Sagor och aktiviteter');await page.getByRole('button',{name:'Spara företagsunderlag',exact:true}).click();let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/social-profile?*',async route=>{await held;await route.fulfill({json:view()})});await page.getByRole('button',{name:'Läs senaste underlaget',exact:true}).click();await expect(page.getByRole('button',{name:'Spara företagsunderlag',exact:true})).toBeDisabled();await expect(page.getByLabel('Vad erbjuder företaget?',{exact:true})).toBeDisabled();release()})
test('late previous-project reads cannot leak company facts',async({page})=>{await mocks(page);let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/social-profile?*',async route=>{const id=new URL(route.request().url()).searchParams.get('projectId')!;if(id.endsWith('1'))await held;try{await route.fulfill({json:view(id)})}catch{}});await page.goto('/start#profile');await page.getByRole('button',{name:'Byt testprojekt',exact:true}).click();await expect(page.getByRole('heading',{name:'Företagsunderlag – Handlarbörsen',exact:true})).toBeVisible();release();await expect(page.getByRole('heading',{name:'Företagsunderlag – Familje-Stunden',exact:true})).toHaveCount(0)})
test('desktop start guide and editor stay usable',async({page})=>{await page.setViewportSize({width:1440,height:1000});await mocks(page);await page.goto('/start');await expect(page.getByRole('heading',{name:'Börja här',exact:true})).toBeVisible();await fill(page);await expect(page.getByText('Underlaget hjälper Atlas. Varje inlägg granskas separat.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../../.superpowers/sdd/2026-10-16-atlas-social-start/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'../../.superpowers/sdd/2026-10-16-atlas-social-start/mobile.png',fullPage:true})})

test('mobile editor has room and the start guide remains available on demand',async({page})=>{
 await mocks(page);await page.goto('/start');await page.getByRole('button',{name:'Företagsunderlag',exact:true}).click()
 const heading=page.getByRole('heading',{name:'Företagsunderlag – Familje-Stunden',exact:true});await expect(heading).toBeVisible()
 expect((await heading.boundingBox())!.y).toBeLessThan(500)
 await expect(page.getByRole('heading',{name:'Börja här',exact:true})).not.toBeVisible()
 await page.getByText('Visa startguiden',{exact:true}).click();await expect(page.getByRole('heading',{name:'Börja här',exact:true})).toBeVisible()
})

test('approving the channel plan unlocks an already opened content tab without connecting accounts',async({page})=>{
 await mocks(page);let approved=false,current=socialFixture()
 await page.route('**/api/social-content?*',async route=>{const v=contentFixture();v.planApproved=approved;await route.fulfill({json:v})})
 await page.route('**/api/social-launch',async route=>{
  const p=route.request().postDataJSON()
  if(p.operation==='propose')current.plan.currentRevision={id:'30000000-0000-4000-8000-000000000001',sequence:1,sha256:'a'.repeat(64),choices:p.choices,createdAt:'2026-10-16T11:30:00Z'}
  else{approved=true;current.plan.decision={id:'50000000-0000-4000-8000-000000000001',revisionId:current.plan.currentRevision!.id,sha256:current.plan.currentRevision!.sha256,decision:'approve',decidedAt:'2026-10-16T11:30:00Z'}}
  await route.fulfill({json:current})
 })
 await page.goto('/start#content');await expect(page.getByRole('button',{name:'Nytt utkast',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Gå till kanalplanen',exact:true}).click();await page.getByLabel('Planera Facebook',{exact:true}).check();await page.getByLabel('Syfte för Facebook',{exact:true}).fill('Hjälpa familjer hitta aktiviteter');await page.getByRole('button',{name:'Spara förslag',exact:true}).click();await page.getByRole('button',{name:'Godkänn version 1',exact:true}).click()
 await page.getByRole('button',{name:'Förbered första inlägget',exact:true}).click();await expect(page.getByRole('button',{name:'Nytt utkast',exact:true})).toBeEnabled()
})
