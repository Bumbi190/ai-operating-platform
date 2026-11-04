import {test,expect} from '@playwright/test'
const projectId='10000000-0000-4000-8000-000000000001'
const seed=(n:number,kind='initial')=>({id:'60000000-0000-4000-8000-00000000000'+n,projectId,templateKey:'pilot-six-months-'+kind+'-v1',version:1,previousId:null,createdAt:'2026-10-19T10:00:00Z',createdBy:'20000000-0000-4000-8000-000000000001',kind,offerRevisionId:'40000000-0000-4000-8000-000000000001',pilotMonths:6,offerText:'Sex månader kostnadsfritt. Ingen automatisk betalning.',productFacts:[],senderName:'Andre',senderEmail:'info@handlarborsen.se',subject:kind==='initial'?'En första inbjudan':'En framtida påminnelse',body:'Hej!\n\nHela den ursprungliga texten. <img src=x onerror=alert(1)>\n\nAndre\nHandlarbörsen',usage:'Ingen kontakt nu. Alla spärrar kvar.',status:'draft',recipient:null,scheduledAt:null,ownerTextReviewed:false})
async function setup(page:any,mode='normal'){
 const model:any={projectId,state:'ok',workerState:'not_connected',contacts:[],offers:[],jobs:[],drafts:[],workers:[],emailTemplates:[seed(1),seed(2,'reminder')],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,timing:{projectId,evaluatedAt:'2026-10-19T10:00:00Z',rules:null,contacts:[],historyRevisions:[],customerSendingEnabled:false,workspaceUrl:'/sales#contact-timing'}}
 const writes:any[]=[],saved=new Map<string,any>();let first=true
 await page.route('**/api/sales?*',(r:any)=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[]}:model}))
 await page.route('**/api/sales/mailbox?*',(r:any)=>r.fulfill({json:null}))
 await page.route('**/api/sales/inbox?*',(r:any)=>r.fulfill({json:{messages:[],config:null}}))
 await page.route('**/api/sales/timing*',(r:any)=>r.fulfill({json:model.timing}))
 await page.route('**/api/sales',async(r:any)=>{
  const v=r.request().postDataJSON();writes.push(v);expect(v.operation).toBe('save_email_copy')
  expect(Object.keys(v).sort()).toEqual(['body','expectedPreviousId','idempotencyKey','operation','projectId','subject','templateKey'].sort())
  let row=saved.get(v.idempotencyKey)
  if(!row){const old=model.emailTemplates.filter((x:any)=>x.templateKey===v.templateKey).sort((a:any,b:any)=>b.version-a.version)[0];if(old.id!==v.expectedPreviousId)return r.fulfill({status:409,json:{code:'REVISION_CONFLICT'}});row={...old,id:crypto.randomUUID(),previousId:old.id,version:old.version+1,subject:v.subject,body:v.body};model.emailTemplates.push(row);saved.set(v.idempotencyKey,row)}
  if(mode==='lost-response'&&first){first=false;return r.abort('failed')}
  return r.fulfill({json:row})
 })
 await page.goto('/sales');const panel=page.locator('#email-templates');return {model,writes,panel}
}
test('full copy is collapsed, editable, versioned and survives reload without transport controls',async({page})=>{
 const {model,writes,panel}=await setup(page);await expect(panel).toHaveJSProperty('open',false);expect(writes).toHaveLength(0)
 await panel.locator('summary').first().click();await expect(panel.getByText('Andre <info@handlarborsen.se>').first()).toBeVisible();await expect(panel.locator('img')).toHaveCount(0)
 await panel.getByRole('button',{name:'Redigera mall'}).first().click();await panel.getByLabel('Ämne',{exact:true}).fill('Ändrat ämne');await panel.getByRole('textbox',{name:'Mejltext',exact:true}).fill('Hela den nya texten.\n\nAndre\nHandlarbörsen')
 await panel.getByRole('button',{name:'Spara ny mallversion'}).click();await expect(panel.getByRole('status')).toContainText('Ny mallversion sparad')
 await expect(panel.getByRole('article').first()).toContainText('version 2');expect(model.emailTemplates).toHaveLength(3);expect(writes).toHaveLength(1)
 await page.reload();await panel.locator('summary').first().click();await expect(panel.getByRole('article')).toHaveCount(2);await expect(panel.getByRole('article').first()).toContainText('Hela den nya texten.')
 const card=panel.getByRole('article').first();await card.getByText('Visa erbjudande och tidigare versioner',{exact:true}).click();await card.getByText(/^Version 1 ·/).click();await expect(card.getByText(/Hela den ursprungliga texten/)).toBeVisible()
 expect(await panel.getByRole('button',{name:/Skicka|Schemalägg|Godkänn/}).count()).toBe(0);expect(model.jobs).toEqual([])
})
test('refresh and a stale save preserve unsaved text',async({page})=>{
 const {model,panel}=await setup(page);await panel.locator('summary').first().click();await panel.getByRole('button',{name:'Redigera mall'}).first().click();await panel.getByRole('textbox',{name:'Mejltext',exact:true}).fill('Min osparade text')
 model.emailTemplates.push({...model.emailTemplates[0],id:'70000000-0000-4000-8000-000000000001',version:2,subject:'En annan sparad version'})
 await page.getByRole('button',{name:'Uppdatera',exact:true}).click();await expect(panel.getByRole('textbox',{name:'Mejltext',exact:true})).toHaveValue('Min osparade text')
 await panel.getByRole('button',{name:'Spara ny mallversion'}).click();await expect(panel.getByRole('status')).toContainText('Mallen har ändrats');await expect(panel.getByRole('textbox',{name:'Mejltext',exact:true})).toHaveValue('Min osparade text')
})
test('lost success response retries the same request without a duplicate version',async({page})=>{
 const {model,writes,panel}=await setup(page,'lost-response');await panel.locator('summary').first().click();await panel.getByRole('button',{name:'Redigera mall'}).first().click();await panel.getByRole('textbox',{name:'Mejltext',exact:true}).fill('En ändring som sparades trots svarsfel')
 await panel.getByRole('button',{name:'Spara ny mallversion'}).click();await expect(panel.getByRole('status')).toContainText('Din redigering är kvar')
 await panel.getByRole('button',{name:'Spara ny mallversion'}).click();await expect(panel.getByRole('status')).toContainText('Ny mallversion sparad')
 expect(writes).toHaveLength(2);expect(writes[0].idempotencyKey).toBe(writes[1].idempotencyKey);expect(model.emailTemplates).toHaveLength(3)
})
test('mobile preview and edit remain readable within the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {panel}=await setup(page);await panel.locator('summary').first().click();await panel.getByRole('button',{name:'Redigera mall'}).first().click()
 await expect(panel.getByRole('textbox',{name:'Mejltext',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
