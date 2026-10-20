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


test('owner reviews complete month evidence then expressly decides exact version; no publication',async({page})=>{
 const month='2026-12',candidateId='30000000-0000-4000-8000-000000000003'
 const hash='a'.repeat(64)
 let posted:any=null,viewed=0,decided=false
 const card={candidateId,month,candidateSha256:hash,createdAt:'2026-10-20T20:00:00Z',
  card:{heading:'December public preview',summary:'A short private source review',
   evidenceCount:1,dates:['2026-11-27'],decisionPrompt:'Review exact copy and evidence',
   concerns:['Source rights still require verification']},
  decision:null,canActivate:false,canPublish:false}
 const proposal={projectId:'77cda551-57c9-4dc0-b019-1bb6438777f7',month,
  planRevisionId:'e745041f-ad3a-493f-bd3b-025525d561b2',title:'December public preview',
  publicSummary:'A short private source review',campaignPurpose:'Preview',
  proof:[{kind:'owner-project-public-evidence',referenceId:'public-december-hero',
   sha256:'b'.repeat(64),description:'Owner source original',privateSubscriberAsset:false}],
  proposedCopy:[{date:'2026-11-27',variant:'winter',
   title:'Winter with Nova and Pling',text:'Public teaser needs independent review.'}]}
 await page.route('**/api/family-month-source-review**',async route=>{
  const u=new URL(route.request().url())
  if(route.request().method()==='POST'){
   posted=route.request().postDataJSON();decided=true
   await route.fulfill({json:{candidateId,candidateSha256:hash,
    stored:true,decision:posted.decision,activationAllowed:false,canPublish:false}})
  }else if(u.searchParams.has('candidateId')){
   viewed++
   await route.fulfill({json:{kind:'family-month-source-owner-review-v1',
    month,candidate:card,proposal,latest:true,canActivate:false,canPublish:false}})
  }else{
   await route.fulfill({json:{kind:'family-month-source-owner-review-list-v1',month,
    records:[decided?{...card,decision:{kind:'approve',
     decidedAt:'2026-10-20T21:00:00Z',candidateSha256:hash}}:card],
    canActivate:false,canPublish:false}})
  }
 })
 await page.goto('/content?family-source-review=1')
 await expect(page.getByRole('region',{name:'Månadskällor'})).toBeVisible()
 const approve=page.getByRole('button',{name:'Godkänn källan'})
 await expect(approve).toHaveCount(0)
 await expect(page.getByText('December public preview')).toBeVisible()
 await page.getByRole('button',{name:'Granska underlag'}).click()
 await expect(page.getByText('Owner source original')).toBeVisible()
 await expect(page.getByText('Public teaser needs independent review.')).toBeVisible()
 await expect(approve).toBeDisabled()
 expect(viewed).toBe(1)
 expect(posted).toBeNull()
 await page.getByRole('checkbox',{name:/Jag har granskat/}).check()
 await expect(approve).toBeEnabled()
 await approve.click()
 await expect(page.getByText(/Beslutet aktiverar inte källan/)).toBeVisible()
 expect(posted).toEqual({operation:'decide',month,candidateId,
  candidateSha256:hash,decision:'approve',confirmed:true})
 await expect(approve).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('disabled month-source feature and cross-project context show no controls',async({page})=>{
 let calls=0
 await page.route('**/api/family-month-source-review**',async route=>{
  calls++;await route.fulfill({status:503,json:{code:'UNAVAILABLE'}})
 })
 await page.goto('/content?family-source-review=1')
 await expect(page.getByRole('region',{name:'Månadskällor'})).toHaveCount(0)
 expect(calls).toBe(1)
 await page.goto('/content?family-source-review=1&foreign-source=1')
 await expect(page.getByRole('region',{name:'Månadskällor'})).toHaveCount(0)
 expect(calls).toBe(1)
})

test('changed month review never exposes decision buttons',async({page})=>{
 const hash='a'.repeat(64)
 await page.route('**/api/family-month-source-review**',async route=>{
  const u=new URL(route.request().url())
  if(u.searchParams.has('candidateId')){
   await route.fulfill({json:{kind:'family-month-source-owner-review-v1',
    month:'2026-12',latest:false,canActivate:false,canPublish:false,
    candidate:{candidateId:'30000000-0000-4000-8000-000000000003',
     month:'2026-12',candidateSha256:hash,decision:null,canActivate:false,canPublish:false},
    proposal:{}}})
  }else await route.fulfill({json:{kind:'family-month-source-owner-review-list-v1',
   month:'2026-12',canActivate:false,canPublish:false,
   records:[{candidateId:'30000000-0000-4000-8000-000000000003',
    month:'2026-12',candidateSha256:hash,decision:null,
    canActivate:false,canPublish:false,
    card:{heading:'Public preview',summary:'A source to review',
     evidenceCount:1,dates:['2026-11-27'],concerns:[],decisionPrompt:'Check'}}]}})
 })
 await page.goto('/content?family-source-review=1')
 await page.getByRole('button',{name:'Granska underlag'}).click()
 await expect(page.getByRole('alert')).toContainText('Underlaget har ändrats')
 await expect(page.getByRole('button',{name:'Godkänn källan'})).toHaveCount(0)
})


test('a successful decision HTTP response alone cannot claim success before persisted readback',async({page})=>{
 const month='2026-12',candidateId='30000000-0000-4000-8000-000000000003',sha='a'.repeat(64)
 const card={candidateId,month,candidateSha256:sha,createdAt:'2026-10-20T20:00:00Z',
  card:{heading:'December review',summary:'A source requiring owner review',
   evidenceCount:1,dates:['2026-11-27'],decisionPrompt:'Review the source',
   concerns:[]},decision:null,canActivate:false,canPublish:false}
 const proposal={projectId:'77cda551-57c9-4dc0-b019-1bb6438777f7',
  month,proof:[{kind:'owner-project-public-evidence',referenceId:'public-image',
   sha256:'b'.repeat(64),description:'Owner original image',privateSubscriberAsset:false}],
  proposedCopy:[{date:'2026-11-27',variant:'winter',title:'December',
   text:'Preview requires editorial approval.'}]}
 let posted=0
 await page.route('**/api/family-month-source-review**',async route=>{
  const u=new URL(route.request().url())
  if(route.request().method()==='POST'){
   posted++
   await route.fulfill({json:{stored:true,candidateId,candidateSha256:sha,
    decision:'approve',activationAllowed:false,canPublish:false}})
  }else if(u.searchParams.has('candidateId')){
   await route.fulfill({json:{kind:'family-month-source-owner-review-v1',
    month,candidate:card,proposal,latest:true,canActivate:false,canPublish:false}})
  }else{
   // A readback that cannot prove the decision MUST NOT authorize success.
   await route.fulfill({json:{kind:'family-month-source-owner-review-list-v1',
    month,records:[card],canActivate:false,canPublish:false}})
  }
 })
 await page.goto('/content?family-source-review=1')
 await page.getByRole('button',{name:'Granska underlag'}).click()
 await page.getByRole('checkbox',{name:/Jag har granskat/}).check()
 await page.getByRole('button',{name:'Godkänn källan'}).click()
 await expect(page.getByRole('alert')).toContainText('Underlaget har ändrats')
 await expect(page.getByText(/Beslutet aktiverar inte källan/)).toHaveCount(0)
 expect(posted).toBe(1)
})
