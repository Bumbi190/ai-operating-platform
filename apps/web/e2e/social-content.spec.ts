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

test('refresh disables review until its snapshot is resolved and cannot undo a later approval',async({page})=>{
 await mocks(page);await page.goto('/content');await fill(page)
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/social-content')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Spara innehållsförslag',exact:true}).click();const oldSnapshot=await (await responsePromise).json()
 let release!:()=>void;const held=new Promise<void>(r=>release=r)
 await page.route('**/api/social-content?*',async route=>{await held;await route.fulfill({json:oldSnapshot})})
 await page.getByRole('button',{name:'Läs senaste innehållet',exact:true}).click()
 await expect(page.getByRole('button',{name:'Godkänn innehållet',exact:true})).toBeDisabled()
 release();await expect(page.getByRole('button',{name:'Godkänn innehållet',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Godkänn innehållet',exact:true}).click()
 await expect(page.getByRole('article',{name:'Granska sparat innehåll'}).getByText('Innehållet godkänt',{exact:true})).toBeVisible()
})

const filmProject='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
function filmContent(){
 const v=contentFixture(filmProject);v.project.name='The Prompt';v.project.slug='ai-media-automation'
 v.plannedChannels=[{channel:'youtube',format:'video',cadence:'manual',purpose:'English AI news'}]
 v.posts=[1,2].map(n=>({id:'20000000-0000-4000-8000-00000000000'+n,revision:{id:'40000000-0000-4000-8000-00000000000'+n,sequence:n,sha256:String(n).repeat(64),planRevisionId:v.currentPlanRevisionId!,draft:{channel:'youtube' as const,format:'video' as const,title:n===1?'Anthropic’s 5% pledge — video draft':'Andra videoutkastet',text:'Reviewed manuscript',linkUrl:'https://www.anthropic.com/news/public-benefit-fund',mediaIds:[],mediaBrief:'Three illustrations',scheduledAt:null},media:[],binding:null,createdAt:'2026-10-19T07:00:00.000Z'},decision:null,status:'proposal' as const,requirements:['media_required']}))
 return v
}
function filmResult(v=filmContent(),index=0){
 const p=v.posts[index];return {kind:'the-prompt-film-preparation-v1',projectId:filmProject,post:{id:p.id,revisionId:p.revision.id,sha256:p.revision.sha256},plan:{revisionId:v.currentPlanRevisionId,sha256:'b'.repeat(64),decisionId:'50000000-0000-4000-8000-000000000001'},dryRun:true,persisted:false,jobId:null,preparationSha256:'c'.repeat(64),checkedAt:'2026-10-19T07:00:00.000Z',sourceExpiresAt:'2026-10-20T16:49:35.513Z',sourceVerification:'operator_supplied_not_verified',canGenerate:false,canPublish:false,blockers:['SOURCE_REVERIFICATION_REQUIRED','CANONICAL_NEWS_SCRIPT_PREPARATION_REQUIRED','GENERATION_BUDGET_REQUIRED','IMAGE_VOICE_USAGE_EVIDENCE_REQUIRED','GENERATED_MEDIA_REQUIRED','RENDER_QA_AND_REVIEW_REQUIRED']}
}
async function openFilm(page:any,v=filmContent()){
 await page.clock.setFixedTime(new Date('2026-10-19T07:00:00Z'))
 await page.route('**/api/social-publications?*',async(route:any)=>{const u=new URL(route.request().url());await route.fulfill({json:{projectId:u.searchParams.get('projectId'),postId:u.searchParams.get('postId'),publication:null,target:null,canRequest:false,blockers:['format_not_supported']}})})
 await page.route('**/api/social-content?*',async(route:any)=>{const id=new URL(route.request().url()).searchParams.get('projectId');await route.fulfill({json:id===filmProject?v:contentFixture(id!)})})
 await page.goto('/content?film');await page.getByRole('button',{name:/Anthropic’s 5% pledge/}).click()
}
test('film preparation shows a read-only version-bound result on mobile and desktop',async({page})=>{
 let body:any;await page.route('**/api/media/film-preparation',async route=>{body=route.request().postDataJSON();await route.fulfill({json:filmResult()})})
 await openFilm(page);await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click()
 await expect(page.getByText('Kontrollerad version 1',{exact:true})).toBeVisible()
 expect(body).toEqual({projectId:filmProject,postId:filmContent().posts[0].id,revisionId:filmContent().posts[0].revision.id,sha256:'1'.repeat(64)})
 await expect(page.getByText('Källuppgifterna behöver verifieras mot originalkällan.',{exact:true})).toBeVisible()
 await expect(page.getByText('Budget för bild och röst behöver godkännas.',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Godkänn innehållet',exact:true})).toBeDisabled()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByText('Filmunderlag – kontrollresultat',{exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:'../../.superpowers/sdd/2026-10-19-film-preparation-app/mobile-film.png',fullPage:true})
 await page.setViewportSize({width:1440,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'../../.superpowers/sdd/2026-10-19-film-preparation-app/desktop-film.png',fullPage:true})
})
test('film result is removed on edit and on plan changes',async({page})=>{
 await page.route('**/api/media/film-preparation',route=>route.fulfill({json:filmResult()}));await openFilm(page)
 await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click();await expect(page.getByText('Kontrollerad version 1',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Redigera utkast',exact:true}).click();await expect(page.getByText('Kontrollerad version 1',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Avbryt redigering',exact:true}).click();await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click();await expect(page.getByText('Kontrollerad version 1',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Byt testplan',exact:true}).click();await expect(page.getByText('Kontrollerad version 1',{exact:true})).toHaveCount(0)
})
for(const change of ['draft','project','plan','edit','revision'] as const)test('late film response is discarded after '+change,async({page})=>{
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let finish!:()=>void;const finished=new Promise<void>(r=>finish=r)
 await page.route('**/api/media/film-preparation',async route=>{await held;try{await route.fulfill({json:filmResult()})}catch{}finally{finish()}})
 const v=filmContent();await openFilm(page,v);await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click()
 if(change==='draft')await page.getByRole('button',{name:/Andra videoutkastet/}).click()
 if(change==='project')await page.getByRole('button',{name:'Byt testprojekt'}).click()
 if(change==='plan')await page.getByRole('button',{name:'Byt testplan'}).click()
 if(change==='edit')await page.getByRole('button',{name:'Redigera utkast',exact:true}).click()
 if(change==='revision'){v.posts[0].revision={...v.posts[0].revision,id:'40000000-0000-4000-8000-000000000009',sha256:'9'.repeat(64),sequence:9};await page.getByRole('button',{name:'Läs senaste innehållet',exact:true}).click();await expect(page.getByText('YouTube · Version 9',{exact:true})).toBeVisible()}
 release();await finished;await expect(page.getByText('Kontrollerad version 1',{exact:true})).toHaveCount(0)
 if(change==='project')await expect(page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true})).toHaveCount(0)
})
test('film response for a different revision is refused',async({page})=>{
 const r=filmResult();r.post.revisionId='40000000-0000-4000-8000-000000000002'
 await page.route('**/api/media/film-preparation',route=>route.fulfill({json:r}));await openFilm(page)
 await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click();await expect(page.getByRole('alert')).toContainText('stämmer inte med det valda utkastet')
 await expect(page.getByText('Kontrollerad version 1',{exact:true})).toHaveCount(0)
})
test('expired source shows a concrete blocker without a successful receipt',async({page})=>{
 await page.route('**/api/media/film-preparation',route=>route.fulfill({status:409,json:{code:'SOURCE_EXPIRED'}}));await openFilm(page)
 await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Källan är för gammal')
 await expect(page.getByText('Kontrollerad version 1',{exact:true})).toHaveCount(0)
})

test('a successful film result disappears when its source expires',async({page})=>{
 const r=filmResult();r.sourceExpiresAt='2026-10-19T07:00:01.000Z'
 await page.route('**/api/media/film-preparation',route=>route.fulfill({json:r}));await openFilm(page)
 await page.getByRole('button',{name:'Kontrollera filmunderlag',exact:true}).click();await expect(page.getByText('Kontrollerad version 1',{exact:true})).toBeVisible()
 await page.clock.runFor(1001);await expect(page.getByText('Kontrollerad version 1',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('alert')).toContainText('Källan är för gammal')
})
