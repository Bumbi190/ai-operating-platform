import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
const projectId='10000000-0000-4000-8000-000000000001',offerId='40000000-0000-4000-8000-000000000001'
test('five exact drafts survive reload; edit, editorial approval and mobile layout are truthful',async({page,context})=>{
 page.on('pageerror',e=>console.error('PAGE ERROR',e.message))
 await context.grantPermissions(['clipboard-read','clipboard-write'])
 const contacts=Array.from({length:5},(_,i)=>({id:`30000000-0000-4000-8000-00000000000${i+1}`,projectId,companyName:`Testbil ${i+1}`,branchName:i<2?['Nord','Syd'][i]:'',email:i<2?'shared@example.se':`branch${i}@example.se`,websiteUrl:null,version:1,pilotMonths:12,history:'not_contacted',historySource:'Manuellt verifierat testunderlag',confirmed:true,excluded:false,suppressed:false}))
 const model:any={projectId,state:'ok',workerState:'not_connected',contacts,offers:[{id:offerId,projectId,senderEmail:'info@handlarborsen.se',offerText:'12 månader gratis',freeMonths:12,productFacts:['Stängd B2B-marknadsplats'],confirmed:true,createdAt:'2026-10-17T10:00:00Z'}],jobs:[{id:'60000000-0000-4000-8000-000000000001',projectId,status:'queued',createdAt:'2026-10-17T10:01:00Z',attempts:0,detail:null}],drafts:[],evidence:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}
 model.timing={projectId,evaluatedAt:'2026-10-19T08:00:00Z',historyRevisions:[],rules:null,customerSendingEnabled:false,contacts:contacts.map(c=>({contactId:c.id,contactVersion:c.version,initialPreparationAllowed:true,blockers:[],reminderCount:0})),workspaceUrl:'/sales#contact-timing'}
 const writes:any[]=[]
 const host:any={workerId:'60000000-0000-4000-8000-000000000009',managed:true,generation:1,desiredState:'running',connectionState:'online',cliState:'ready',lastSeenAt:'2026-10-17T14:00:00Z',workerExpiresAt:'2026-10-18T14:00:00Z',executionPaused:false,reconnectRequested:false}
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[host],sendingEnabled:false}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales',async route=>{const v=route.request().postDataJSON();writes.push(v);if(v.operation==='revise'){const i=model.drafts.findIndex((d:any)=>d.id===v.revisionId);model.drafts[i]={...model.drafts[i],...v.draft,id:'80000000-0000-4000-8000-000000000001',sha256:'b'.repeat(64),approvalId:'90000000-0000-4000-8000-000000000001',status:'pending'}}else if(v.operation==='set_worker_desired')host.desiredState=v.action==='pause'?'paused':'running';else if(v.operation==='cancel')model.jobs[0].status='cancelled';else throw Error(`Unexpected operation ${v.operation}`);await route.fulfill({json:{ok:true}})})
 await page.route('**/api/approvals/*',async route=>{writes.push(route.request().postDataJSON());model.drafts[0].status='approved';await route.fulfill({json:{ok:true}})})
 await page.setViewportSize({width:1440,height:1000});await page.goto('/sales')
 await expect(page.getByRole('heading',{name:'Säljförberedelse'})).toBeVisible()
 await page.getByRole('heading',{name:'Uppdrag',exact:true}).click();await expect(page.getByText('Väntar på lokal worker',{exact:true})).toBeVisible();await page.getByRole('heading',{name:'Kontakter',exact:true}).click();await page.getByRole('heading',{name:'Erbjudande och Atlas-uppdrag',exact:true}).click()
 for(let i=0;i<5;i++)await page.locator('li').filter({hasText:'Testbil '+(i+1)}).getByRole('checkbox').check()
 await page.getByRole('button',{name:'Kopiera uppdrag till Atlas'}).click()
 const request=await page.evaluate(()=>navigator.clipboard.readText());expect(request).toContain('Testbil 1, Nord (shared@example.se)');expect(request).toContain('Testbil 2, Syd (shared@example.se)');expect(request).toContain('Skicka inget.')
 model.jobs[0].status='awaiting_review';model.jobs[0].attempts=5
 model.drafts=contacts.map((c,i)=>({contactId:c.id,contactVersion:1,offerRevisionId:offerId,senderEmail:'info@handlarborsen.se',toEmail:c.email,subject:`En fråga till ${c.companyName}`,body:'Vill ni prova Handlarbörsen i 12 månader gratis?',evidenceIds:[],questions:[],id:`70000000-0000-4000-8000-00000000000${i+1}`,projectId,jobId:model.jobs[0].id,sha256:'a'.repeat(64),approvalId:`90000000-0000-4000-8000-00000000000${i+2}`,runId:null,status:'pending',current:true,createdAt:'2026-10-17T10:02:00Z'}))
 await page.reload();await page.getByRole('heading',{name:'Mejlutkast att granska',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(5)
 await expect(page.getByRole('article').first()).not.toContainText('shared@example.se');await page.getByRole('article').first().getByRole('button',{name:'Visa förslag'}).click();await expect(page.getByRole('article').first()).toContainText('shared@example.se');await page.getByRole('article').nth(1).getByRole('button',{name:'Visa förslag'}).click();await expect(page.getByRole('article').first()).not.toContainText('shared@example.se');await expect(page.getByRole('article').nth(1)).toContainText('shared@example.se');await page.getByRole('article').first().getByRole('button',{name:'Visa förslag'}).click()
 await expect(page.getByRole('article').first()).toContainText('Nord');await expect(page.getByRole('article').nth(1)).toContainText('Syd')
 await page.getByRole('button',{name:'Redigera',exact:true}).first().click();await page.getByRole('textbox',{name:'Mejltext',exact:true}).fill('En ändrad fråga om 12 månader gratis.');await page.getByRole('button',{name:'Spara ny version'}).click()
 await expect(page.getByText('Ny version sparad. Tidigare godkännande gäller inte längre.',{exact:true})).toBeVisible();await page.getByRole('article').filter({hasText:'Testbil 1 · Nord'}).getByRole('button',{name:'Visa förslag'}).click();await expect(page.getByRole('article').filter({hasText:'Testbil 1 · Nord'})).toContainText('En ändrad fråga om 12 månader gratis.')
 await page.getByRole('article').filter({hasText:'Testbil 1 · Nord'}).getByRole('button',{name:'Godkänn mejltext'}).click();await expect(page.getByText('Mejltexten godkändes. Inget mejl har skickats.',{exact:true})).toBeVisible()
 expect(writes.map(x=>x.operation??x.action)).toEqual(['revise','approved'])
 await page.getByRole('heading',{name:'Erbjudande och Atlas-uppdrag',exact:true}).click();await expect(page.getByText('Redo att förbereda utkast',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa förberedelsen',exact:true}).click();await expect(page.getByText('Förberedelsen är pausad',{exact:true})).toBeVisible();await expect(page.getByText('Worker token',{exact:true})).toHaveCount(0)
 const folder=process.env.SALES_BROWSER_ARTIFACT_DIR??'../../.superpowers/sdd/2026-10-17-sales-strato-inbox/browser';mkdirSync(folder,{recursive:true});await page.screenshot({path:`${folder}/sales-desktop.png`,fullPage:true})
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Säljförberedelse'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`${folder}/sales-mobile.png`,fullPage:true})
})

test('editorial selection is explicit and partial history never appears as send permission',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write'])
 const contact={id:'30000000-0000-4000-8000-000000000001',projectId,companyName:'Review Company',branchName:'Malmö',email:'review@example.se',websiteUrl:null,version:1,pilotMonths:6,history:'not_contacted',historySource:'Current available sources checked; older coverage remains unknown.',confirmed:true,excluded:false,suppressed:false}
 const jobId='60000000-0000-4000-8000-000000000002'
 const model:any={projectId,state:'ok',workerState:'not_connected',contacts:[contact],offers:[{id:offerId,projectId,senderEmail:'info@handlarborsen.se',offerText:'6 månader gratis',freeMonths:6,productFacts:['Stängd B2B-marknadsplats'],confirmed:true,createdAt:'2026-11-02T09:00:00Z'}],jobs:[],drafts:[{preparationMode:'editorial_only',contactId:contact.id,contactVersion:1,offerRevisionId:offerId,senderEmail:'info@handlarborsen.se',toEmail:contact.email,subject:'Ett granskningsutkast',body:'Vill ni titta på pilotupplägget?',evidenceIds:[],questions:[],id:'70000000-0000-4000-8000-000000000002',projectId,jobId,sha256:'a'.repeat(64),approvalId:'90000000-0000-4000-8000-000000000002',runId:null,status:'pending',current:true,createdAt:'2026-11-02T09:02:00Z'}],evidence:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}
 model.timing={projectId,evaluatedAt:'2026-11-02T09:00:00Z',historyRevisions:[],rules:null,customerSendingEnabled:false,contacts:[{contactId:contact.id,contactVersion:1,historyRevisionId:'80000000-0000-4000-8000-000000000002',initialPreparationAllowed:false,editorialPreparationAllowed:true,blockers:['HISTORY_REVIEW_REQUIRED','SOURCE_GAP','NOT_INITIAL_CONTACT'],reminderCount:null}],workspaceUrl:'/sales#contact-timing'}
 const posts:string[]=[]
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[],sendingEnabled:false}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales',async r=>{posts.push(r.request().method());await r.fulfill({status:403,json:{code:'UNEXPECTED_WRITE'}})})
 await page.goto('/sales')
 await page.getByRole('heading',{name:'Kontakter',exact:true}).click()
 const recipient=page.locator('li').filter({hasText:'Review Company'}).getByRole('checkbox')
 await expect(recipient).toBeDisabled()
 await page.getByRole('checkbox',{name:/Förbered endast för granskning/}).check()
 await expect(recipient).toBeEnabled()
 await recipient.check()
 await page.getByRole('heading',{name:'Erbjudande och Atlas-uppdrag',exact:true}).click()
 await page.getByRole('button',{name:'Kopiera uppdrag till Atlas'}).click()
 const request=await page.evaluate(()=>navigator.clipboard.readText())
 expect(request).toContain('Skapa endast ett granskningsutkast')
 expect(request).toContain('Skicka inget.')
 await page.getByRole('heading',{name:'Mejlutkast att granska',exact:true}).click()
 await page.getByRole('article').getByRole('button',{name:'Visa förslag'}).click()
 await expect(page.getByRole('article')).toContainText('Endast granskningsutkast.')
 await expect(page.getByRole('article')).toContainText('Textgodkännande ger inget sändningstillstånd.')
 await expect(page.getByRole('button',{name:/^Skicka/})).toHaveCount(0)
 expect(posts).toEqual([])
 await page.setViewportSize({width:390,height:844})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})


test('draft review shows the current saved audit and stale gaps instead of presenting an old note as the audit',async({page})=>{
 const contact={id:'30000000-0000-4000-8000-000000000001',projectId,companyName:'History Company',branchName:'Malmö',email:'history@example.se',websiteUrl:null,version:1,pilotMonths:6,history:'not_contacted',historySource:'Äldre kontroll: 139 kontakter och 100 Resend-mejl.',confirmed:true,excluded:false,suppressed:false}
 const historyId='80000000-0000-4000-8000-000000000003'
 const draft={preparationMode:'editorial_only',contactId:contact.id,contactVersion:1,offerRevisionId:offerId,senderEmail:'sender@example.se',toEmail:contact.email,subject:'Granska historiken',body:'Ett sparat utkast.',evidenceIds:[],questions:[],id:'70000000-0000-4000-8000-000000000003',projectId,jobId:'60000000-0000-4000-8000-000000000003',sha256:'a'.repeat(64),approvalId:'90000000-0000-4000-8000-000000000003',runId:null,status:'pending',current:true,createdAt:'2026-11-02T10:09:21Z'}
 const source=(channel:string,scopeRef:string)=>({sourceKey:channel,channel,identityRef:'verified fixture',scopeRef,since:'2026-10-04T00:00:00Z',through:'2026-11-02T10:00:31Z',observedAt:'2026-11-02T10:00:31Z',state:'gap',reference:'Recorded audit reference'})
 const history={id:historyId,projectId,recipient:contact.email,version:2,previousId:null,createdAt:'2026-11-02T10:05:14Z',reviewedBy:'20000000-0000-4000-8000-000000000001',data:{schemaVersion:1,history:'unknown',olderHistoryAttestation:null,contactVersions:[{id:contact.id,version:1}],sources:[source('strato_sent','36 skickade i Strato; samtliga sex mappar kontrollerade.'),source('strato_inbox','71 Strato-mejl totalt, inga nya svar.'),source('resend','133 tillgängliga Resend-poster, paginering till slutet.')],events:[],correctionOf:null,reviewNote:'Tidigare och extern historik är fortfarande okänd.'}}
 const model:any={projectId,state:'ok',workerState:'not_connected',contacts:[contact],offers:[],jobs:[],drafts:[draft],evidence:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,timing:{projectId,evaluatedAt:'2026-11-03T07:00:00Z',contacts:[{contactId:contact.id,recipient:contact.email,contactVersion:1,historyRevisionId:historyId,initialPreparationAllowed:false,editorialPreparationAllowed:false,blockers:['HISTORY_REVIEW_REQUIRED','SOURCE_GAP','SOURCE_STALE'],reminderCount:null}],historyRevisions:[{...history,id:'80000000-0000-4000-8000-000000000004',version:99,data:{...history.data,reviewNote:'DECOY-UNBOUND-HISTORY'}},history],rules:null,customerSendingEnabled:false,workspaceUrl:'/sales#contact-timing'}}
 const writes:string[]=[]
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[],sendingEnabled:false}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales',r=>{writes.push(r.request().method());return r.fulfill({status:403,json:{code:'UNEXPECTED_WRITE'}})})
 await page.goto('/sales');await page.getByRole('heading',{name:'Mejlutkast att granska',exact:true}).click()
 const card=page.getByRole('article').filter({hasText:'History Company'})
 await card.getByRole('button',{name:/Visa förslag/}).click();await card.getByText('Visa källunderlag och kontakthistorik',{exact:true}).click()
 await expect(card.getByRole('heading',{name:'Senast sparade kontaktkontroll'})).toBeVisible()
 await expect(card).toContainText('2026-11-02 11:05:14 UTC+01:00')
 await expect(card).toContainText('Källorna behöver uppdateras')
 await expect(card).toContainText('Historiken har luckor')
 await expect(card).toContainText('inte en ny mejlkontroll')
 await expect(card).not.toContainText('DECOY-UNBOUND-HISTORY')
 await card.getByText('Visa sparad avgränsning och referens',{exact:true}).last().click()
 await expect(card.getByText('133 tillgängliga Resend-poster, paginering till slutet.',{exact:true})).toBeVisible()
 await expect(card.getByText(contact.historySource,{exact:true})).not.toBeVisible()
 await card.getByText('Äldre kontaktanteckning',{exact:true}).click()
 await expect(card.getByText(contact.historySource,{exact:true})).toBeVisible()
 expect(writes).toEqual([])
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
