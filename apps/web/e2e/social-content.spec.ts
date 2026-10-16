import {test,expect} from '@playwright/test'
import {contentFixture} from './social-content-fixture'
test.beforeEach(async({page})=>{await page.setViewportSize({width:390,height:844});await page.clock.install({time:new Date('2026-10-16T10:00:00Z')})})
async function mocks(page:any,fail=false){
 let current=contentFixture(),saved:any
 await page.route('**/api/social-content?*',async(route:any)=>{const id=new URL(route.request().url()).searchParams.get('projectId')!;await route.fulfill({json:id===current.project.id?current:contentFixture(id)})})
 await page.route('**/api/social-content',async(route:any)=>{
  saved=route.request().postDataJSON();if(fail){await route.fulfill({status:503,json:{code:'UNAVAILABLE'}});return}
  if(saved.operation==='propose'){current.posts=[{id:saved.postId,revision:{id:'40000000-0000-4000-8000-000000000001',sequence:1,sha256:'a'.repeat(64),planRevisionId:saved.planRevisionId,draft:saved.draft,media:[],binding:null,createdAt:'2026-10-16T10:00:00Z'},decision:null,status:'proposal',requirements:['activation_required','account_required']}]}
  else{current.posts[0].decision={id:'d',decision:saved.decision,revisionId:saved.revisionId,sha256:saved.sha256,decidedAt:'2026-10-16T10:00:00Z'};current.posts[0].status=saved.decision==='approve'?'approved':'rejected'}
  await route.fulfill({json:current})
 });return ()=>saved
}
async function fill(page:any){await page.getByRole('button',{name:'Nytt utkast',exact:true}).click();await page.getByLabel('Rubrik',{exact:true}).fill('Familjehelg');await page.getByLabel('Inläggstext',{exact:true}).fill('Tre roliga aktiviteter tillsammans.')}
test('creates a preparation, reviews exact text and shows intended calendar with no sending',async({page})=>{
 const sent=await mocks(page);await page.goto('/content');await fill(page);await page.getByLabel('Önskad publiceringstid (Stockholm)',{exact:true}).fill('2026-12-17T12:30');await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click()
 expect(sent().draft.scheduledAt).toBe('2026-12-17T11:30:00.000Z');await expect(page.getByText('Tre roliga aktiviteter tillsammans.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Godkänn innehållet',exact:true}).click();expect(sent().sha256).toBe('a'.repeat(64));await expect(page.getByRole('article',{name:'Granska sparat innehåll'}).getByText('Innehållet godkänt',{exact:true})).toBeVisible();await expect(page.getByText('Väntar på kontokoppling',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Kalender',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('failed save retains title text and time and reuses same intent on retry',async({page})=>{const sent=await mocks(page,true);await page.goto('/content');await fill(page);await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click();const key=sent().idempotencyKey;await expect(page.getByRole('alert')).toContainText('finns kvar');await expect(page.getByLabel('Rubrik',{exact:true})).toHaveValue('Familjehelg');await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click();expect(sent().idempotencyKey).toBe(key)})
test('editing saved text disables review until a new version is saved',async({page})=>{await mocks(page);await page.goto('/content');await fill(page);await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click();await page.getByRole('button',{name:'Redigera utkast',exact:true}).click();await page.getByLabel('Inläggstext',{exact:true}).fill('Ny text');await expect(page.getByRole('button',{name:'Godkänn innehållet',exact:true})).toBeDisabled()})
test('late previous-project responses never overwrite the current project',async({page})=>{
 let release!:()=>void;const pending=new Promise<void>(r=>release=r);await page.route('**/api/social-content?*',async route=>{const id=new URL(route.request().url()).searchParams.get('projectId')!;if(id.endsWith('1'))await pending;try{await route.fulfill({json:contentFixture(id)})}catch{}})
 await page.goto('/content');await page.getByRole('button',{name:'Byt testprojekt'}).click();await expect(page.getByRole('heading',{name:'Innehåll – Handlarbörsen',exact:true})).toBeVisible();release();await expect(page.getByRole('heading',{name:'Innehåll – Familje-Stunden',exact:true})).toHaveCount(0)
})
test('image idea cannot be approved as attached media',async({page})=>{await mocks(page);await page.goto('/content');await fill(page);await page.getByLabel('Kanal',{exact:true}).selectOption('pinterest');await page.getByLabel('Bild- eller videoidé',{exact:true}).fill('En färgglad raket');await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click();await expect(page.getByRole('button',{name:'Godkänn innehållet',exact:true})).toBeDisabled();await expect(page.getByText('Bifoga projektets bild eller video före granskning.',{exact:true})).toBeVisible()})

test('workspace navigation retains an unsaved content draft',async({page})=>{
 await mocks(page);await page.goto('/content?workspace#content');await fill(page);await page.getByRole('button',{name:'Kanaler och konton',exact:true}).click();await page.getByRole('button',{name:'Innehåll och kalender',exact:true}).click();await expect(page.getByLabel('Rubrik',{exact:true})).toHaveValue('Familjehelg');await expect(page.getByLabel('Inläggstext',{exact:true})).toHaveValue('Tre roliga aktiviteter tillsammans.')
})
test('desktop review remains usable and produces a review screenshot',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await mocks(page);await page.goto('/content');await fill(page);await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click();await expect(page.getByRole('button',{name:'Godkänn innehållet',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../../.superpowers/sdd/2026-10-16-atlas-social-content/desktop-review.png',fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'../../.superpowers/sdd/2026-10-16-atlas-social-content/mobile-review.png',fullPage:true})
})
