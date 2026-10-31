import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
const projectId='10000000-0000-4000-8000-000000000001',workerId='60000000-0000-4000-8000-000000000001',mailboxId='70000000-0000-4000-8000-000000000001',messageId='80000000-0000-4000-8000-000000000001',jobId='a0000000-0000-4000-8000-000000000001',revisionId='b0000000-0000-4000-8000-000000000001'
async function fixture(page:any){
 const contacts=['Malmö','Lund'].map((branchName,i)=>({id:`90000000-0000-4000-8000-00000000000${i+1}`,projectId,companyName:'Exempelbil',branchName,email:'dealer@example.se',confirmed:true,excluded:false,suppressed:false,version:1,history:'contacted',historySource:'Verifierat tidigare mejl',pilotMonths:12}))
 const offer={id:'40000000-0000-4000-8000-000000000001',projectId,senderEmail:'info@handlarborsen.se',freeMonths:12,confirmed:true,offerText:'12 månader gratis',productFacts:['Stängd B2B'],createdAt:'2026-10-18T00:00Z'}
 const message:any={id:messageId,canonicalMessageId:messageId,mailboxId,header:{from:'dealer@example.se',to:'info@handlarborsen.se',subject:'Svar om pilot',messageId:'<test>',inReplyTo:null,references:[]},text:null,textState:'not_selected',textSelected:false,contactId:null,contactState:'ambiguous',version:1,occurrences:[{uid:3,uidValidity:'11'}]}
 const job:any={id:jobId,projectId,messageId,status:'awaiting_review',createdAt:'2026-10-18T03:00Z',detail:null,attempts:1,sourceCurrent:true,newerIncoming:false,sendingEnabled:false,source:{subject:'Svar om pilot',companyName:'Exempelbil',branchName:'Lund',senderEmail:offer.senderEmail,toEmail:'dealer@example.se',offerText:offer.offerText}}
 const draft:any={id:revisionId,projectId,jobId,subject:'Svar om piloten',body:'<img src="https://untrusted.example/pixel">\nTack för din fråga.',evidenceIds:[messageId],questions:[],sha256:'a'.repeat(64),current:true,status:'pending',runId:jobId,approvalId:revisionId,createdAt:job.createdAt}
 const calls:any[]=[];let external=0;let failReview=false
 await page.route('**/api/sales?*',(r:any)=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[{workerId,managed:true,desiredState:'running',connectionState:'online',cliState:'ready',executionPaused:false}]}:{projectId,state:'ok',contacts,offers:[offer],jobs:[],drafts:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}}))
 await page.route('**/api/sales/mailbox?*',(r:any)=>r.fulfill({json:{mailboxId,email:offer.senderEmail,status:'authenticated',inboxEnabled:true,sendingEnabled:false}}))
 await page.route('**/api/sales/inbox?*',(r:any)=>r.fulfill({json:new URL(r.request().url()).searchParams.has('messageId')?message:{config:{projectId,mailboxId,version:2,mailboxGeneration:6,folder:'INBOX',since:'2026-10-07T22:00Z',selectedContactIds:[],state:'enabled'},messages:[message],inboxEnabled:true,readingEnabled:true,scopeCurrent:true,sendingEnabled:false}}))
 await page.route('**/api/sales/inbox',(r:any)=>{const b=r.request().postDataJSON();calls.push(b);if(b.operation==='select_text'){Object.assign(message,{text:'Vad kostar piloten?',textSelected:true,textState:'complete',version:2})}if(b.operation==='link_message'){Object.assign(message,{contactId:b.contactId,contactState:'linked',version:3})}return r.fulfill({json:message})})
 await page.route('**/api/sales/replies?*',(r:any)=>r.fulfill({json:{jobs:[job],drafts:[draft],sendingEnabled:false}}))
 await page.route('**/api/sales/replies',(r:any)=>{const b=r.request().postDataJSON();calls.push(b);if(failReview&&b.operation==='review')return r.fulfill({status:409,json:{code:'REVISION_CONFLICT'}});if(b.operation==='edit')Object.assign(draft,{id:'b0000000-0000-4000-8000-000000000002',body:b.body,subject:b.subject,sha256:'b'.repeat(64),status:'pending'});if(b.operation==='review')draft.status=b.decision;return r.fulfill({json:draft})})
 await page.route('https://untrusted.example/**',(r:any)=>{external++;return r.abort()})
 return {message,job,draft,calls,contacts,offer,setFailReview:()=>{failReview=true},external:()=>external}
}
test('unselected text and ambiguous branch cannot silently start a model; exact request goes through Atlas',async({page,context})=>{
 const f=await fixture(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Inkorg',exact:true}).click()
 const inbox=page.getByRole('region',{name:'Inkorg',exact:true});await inbox.getByRole('button',{name:'Svar om pilot',exact:true}).click()
 await expect(inbox.getByText(/Välj och läs hela mejltexten/)).toBeVisible();expect(f.calls).toEqual([])
 await inbox.getByRole('button',{name:'Läs texten i detta mejl'}).click();await expect(inbox.getByText(/Koppla en bekräftad kontakt/)).toBeVisible()
 await inbox.getByLabel('Bekräftad kontakt och filial').selectOption(f.contacts[1].id);await inbox.getByRole('button',{name:'Koppla vald kontakt'}).click();await expect(inbox.getByText(/Lämna valt underlag till Claude/)).toBeVisible()
 const button=inbox.getByRole('button',{name:'Kopiera svarsuppdrag till Atlas'});await expect(button).toBeDisabled();await inbox.getByLabel('Erbjudande för svaret').selectOption(f.offer.id);await inbox.getByRole('checkbox',{name:/Jag vill förbereda ett svar med detta valda underlag/}).check();await button.click()
 const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toContain('prepare_sales_reply');expect(copied).toContain(f.contacts[1].id);expect(copied).toContain('"messageVersion":3');expect(copied).not.toContain('conversationId');expect(f.calls.some(x=>/prepare|send/.test(x.operation))).toBe(false)
})
test('private reply review shows stale evidence, plain text, exact revision and no send action on desktop/mobile',async({page})=>{
 const f=await fixture(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Svarsförslag att granska',exact:true}).click()
 const replies=page.getByRole('region',{name:'Svarsförslag',exact:true});await expect(replies).toBeVisible();await expect(replies.getByText(/Svarsförslag för granskning/)).toBeVisible();await expect(replies.locator('img')).toHaveCount(0);expect(f.external()).toBe(0);await expect(replies.getByRole('button',{name:/Skicka/})).toHaveCount(0)
 await expect(replies.getByText(f.draft.body,{exact:true})).toHaveCount(0); await replies.locator('button[aria-controls^="reply-review-"]').first().click()
 await expect(replies.getByText(f.draft.body,{exact:true})).toBeVisible();await expect(replies.getByText('Lund',{exact:false})).toBeVisible();await replies.getByRole('button',{name:'Redigera svarsförslag'}).click();await replies.getByLabel('Svarstext').fill('Ett granskat svar.');await replies.getByRole('button',{name:'Spara ny svarsversion'}).click();expect(f.calls.find(x=>x.operation==='edit')).toMatchObject({revisionId,expectedHash:'a'.repeat(64),body:'Ett granskat svar.'})
 f.setFailReview();await replies.getByRole('button',{name:'Godkänn svarsförslag'}).click();await expect(replies.getByText(/Underlaget har ändrats/)).toBeVisible();expect(f.calls.find(x=>x.operation==='review')).toMatchObject({revisionId:'b0000000-0000-4000-8000-000000000002',expectedHash:'b'.repeat(64)})
 f.job.newerIncoming=true;await replies.getByRole('button',{name:'Uppdatera svarsförslag'}).click();await expect(replies.getByText(/nyare mejl finns från samma adress/i)).toBeVisible();await expect(replies.getByRole('button',{name:'Godkänn svarsförslag'})).toBeDisabled()
 const dir=process.env.SALES_BROWSER_ARTIFACT_DIR!;mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/reply-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:dir+'/reply-mobile.png',fullPage:true});expect(await replies.getAttribute('data-private')).toBe('true')
})

test('switching from dirty reply A to branch B resets all editor fields before saving B',async({page})=>{
 const f=await fixture(page),jobB={...f.job,id:'a0000000-0000-4000-8000-000000000002',source:{...f.job.source,branchName:'Malmö'}},draftB={...f.draft,id:'b0000000-0000-4000-8000-000000000003',jobId:jobB.id,sha256:'c'.repeat(64),subject:'Only branch B subject',body:'Only branch B body',questions:['Only branch B question']}
 await page.route('**/api/sales/replies?*',(r:any)=>r.fulfill({json:{jobs:[f.job,jobB],drafts:[f.draft,draftB],sendingEnabled:false}}))
 await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Svarsförslag att granska',exact:true}).click()
 const replies=page.getByRole('region',{name:'Svarsförslag',exact:true}),toggle=replies.locator('button[aria-controls^="reply-review-"]')
 await expect(replies.getByText('Only branch B body',{exact:true})).toHaveCount(0)
 await toggle.nth(0).click()
 await replies.getByRole('button',{name:'Redigera svarsförslag'}).click()
 await replies.getByLabel('Svarstext').fill('Dirty private text for A only')
 await replies.getByLabel('Ämne för svaret').fill('Dirty A subject')
 await toggle.nth(1).click()
 await expect(replies.getByText('Dirty private text for A only')).toHaveCount(0)
 await expect(replies.getByText('Only branch B body',{exact:true})).toBeVisible()
 await replies.getByRole('button',{name:'Redigera svarsförslag'}).click()
 await expect(replies.getByRole('heading',{name:'Redigera detta svar'})).toBeVisible();await expect(replies.getByLabel('Svarstext')).toHaveValue('Only branch B body');await expect(replies.getByLabel('Ämne för svaret')).toHaveValue('Only branch B subject');await expect(replies.getByLabel('Kvarstående frågor')).toHaveValue('Only branch B question')
 await replies.getByRole('button',{name:'Spara ny svarsversion'}).click();expect(f.calls.find(x=>x.operation==='edit')).toMatchObject({revisionId:draftB.id,expectedHash:draftB.sha256,body:'Only branch B body',subject:'Only branch B subject',questions:['Only branch B question']})
})

test('ordinary selected reply needs no customer or offer and mode changes reset consent',async({page,context})=>{
 const f=await fixture(page);Object.assign(f.message,{text:'Tack för testet.',textSelected:true,textState:'complete',version:2,contactId:null,contactState:'unknown'})
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Inkorg',exact:true}).click()
 const inbox=page.getByRole('region',{name:'Inkorg',exact:true});await inbox.getByRole('button',{name:'Svar om pilot',exact:true}).click()
 await inbox.getByLabel('Typ av svar').selectOption('general')
 const button=inbox.getByRole('button',{name:'Kopiera svarsuppdrag till Atlas'});await expect(button).toBeDisabled()
 await inbox.getByRole('checkbox',{name:/Jag vill förbereda ett svar med detta valda underlag/}).check();await button.click()
 const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toContain('"replyMode":"general"');expect(copied).not.toContain('contactId');expect(copied).not.toContain('offerRevisionId');expect(copied).not.toContain('senderName')
 await inbox.getByLabel('Typ av svar').selectOption('commercial');await expect(inbox.getByText(/Koppla en bekräftad kontakt/)).toBeVisible()
 await inbox.getByLabel('Typ av svar').selectOption('general');await expect(button).toBeDisabled()
 expect(f.calls.some(x=>/prepare|send/.test(x.operation))).toBe(false)
})

test('global review shows exact private email preview and uses only version-bound decisions',async({page})=>{
 const f=await fixture(page)
 const approval={id:revisionId,kind:'sales_reply_review',outputKey:'sales_reply_draft',content:'PRIVATE_METADATA_CANARY',status:'pending',statusClass:'actionable',statusLabel:'Väntar på granskning',reviewerNotes:null,createdAt:f.job.createdAt,reviewedAt:null,decidedAt:null,runId:jobId,runStatus:'awaiting_approval',runHref:null,runActionKind:null,workflowName:null,project:{id:projectId,name:'Handlarbörsen',slug:'handlarborsen',color:'#abc',href:'/projects/handlarborsen',paused:false,pausedReason:null},decidable:true,blockedReason:null}
 await page.route('**/fixture-review',r=>r.fulfill({json:{state:'ok',queue:[approval],archive:[],total:1,truncated:false,filter:null,links:{approvals:'/approvals'}}}))
 await page.goto('/sales?review=1')
 const detail=page.getByRole('complementary',{name:'Granskningsdetaljer'})
 await expect(detail.getByText(f.draft.body,{exact:true})).toBeVisible()
 await expect(detail.getByText('PRIVATE_METADATA_CANARY')).toHaveCount(0)
 const dir=process.env.SALES_BROWSER_ARTIFACT_DIR!;await page.screenshot({path:dir+'/global-reply-preview-desktop.png',fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.getByRole('list',{name:'Granskningsobjekt'}).getByRole('button').click();await expect(detail.getByText(f.draft.body,{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:dir+'/global-reply-preview-mobile.png',fullPage:true})
 await page.setViewportSize({width:1440,height:1000})
 // An obsolete approval must never show or decide a different current revision.
 f.draft.approvalId='b0000000-0000-4000-8000-000000000099'
 await detail.getByRole('button',{name:'Uppdatera svarsförslag'}).click()
 await expect(detail.getByText(/saknar en aktuell mejlversion/)).toBeVisible()
 await expect(detail.getByText(f.draft.body,{exact:true})).toHaveCount(0)
 await expect(detail.getByRole('button',{name:'Godkänn svarsförslag',exact:true})).toHaveCount(0)
 f.draft.approvalId=revisionId;await detail.getByRole('button',{name:'Uppdatera svarsförslag'}).click()
 await expect(detail.getByRole('button',{name:'Godkänn',exact:true})).toHaveCount(0)
 await detail.getByRole('button',{name:'Godkänn svarsförslag',exact:true}).click()
 expect(f.calls.find(x=>x.operation==='review')).toMatchObject({revisionId,expectedHash:'a'.repeat(64)})
 await expect(detail.getByText(/godkänt för texten.*Inget mejl har skickats/)).toBeVisible()
 await expect(detail.getByText(f.draft.body,{exact:true})).toHaveCount(0)
})

test('one open proposal across reply and first-email draft queues; hidden text is not rendered',async({page})=>{
 const f=await fixture(page)
 const first={id:'b0000000-0000-4000-8000-000000000011',projectId,contactId:f.contacts[0].id,contactVersion:1,
  offerRevisionId:f.offer.id,senderEmail:'info@handlarborsen.se',toEmail:'dealer@example.se',
  evidenceIds:[],subject:'FIRST-DRAFT SUBJECT',body:'FIRST-DRAFT PRIVATE CANARY',questions:[],sha256:'f'.repeat(64),
  approvalId:'b0000000-0000-4000-8000-000000000012',runId:null,current:true,status:'pending',
  createdAt:'2026-10-19T12:00:00Z'}
 await page.route('**/api/sales?*',(route:any)=>route.fulfill({json:{
  projectId, state:'ok',contacts:f.contacts,offers:[f.offer],jobs:[],drafts:[first],
  workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,
 }}))
 await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Mejlutkast att granska'}).click()
 const initial=page.getByRole('region',{name:'Mejlutkast för granskning'})
 const repliesSection=page.getByRole('region',{name:'Svarsförslag',exact:true})
 const a=initial.locator('button[aria-controls^="outreach-review-"]')
 await expect(initial.getByText(first.body,{exact:true})).toHaveCount(0)
 await expect(page.getByText(f.draft.body,{exact:true})).toHaveCount(0)
 await a.click()
 await expect(initial.getByText(first.body,{exact:true})).toBeVisible()
 await page.getByRole('heading',{name:'Svarsförslag att granska'}).click()
 await repliesSection.locator('button[aria-controls^="reply-review-"]').first().click()
 await expect(initial.getByText(first.body,{exact:true})).toHaveCount(0)
 await expect(repliesSection.getByText(f.draft.body,{exact:true})).toBeVisible()
 await a.click()
 await expect(repliesSection.getByText(f.draft.body,{exact:true})).toHaveCount(0)
 await expect(initial.getByText(first.body,{exact:true})).toBeVisible()
 await a.click()
 await expect(initial.getByText(first.body,{exact:true})).toHaveCount(0)
 await page.setViewportSize({width:390,height:844})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 expect(f.calls.some((call:any)=>/send|review|prepare/i.test(call.operation))).toBe(false)
})

test('obsolete first-email draft is not editable or approvable',async({page})=>{
 const f=await fixture(page)
 const obsolete={id:'b0000000-0000-4000-8000-000000000041',projectId,
  contactId:f.contacts[0].id,contactVersion:1,offerRevisionId:f.offer.id,
  senderEmail:'info@handlarborsen.se',toEmail:'dealer@example.se',
  evidenceIds:[],subject:'OBSOLETE SUBJECT',body:'OBSOLETE PRIVATE BODY',questions:[],
  sha256:'e'.repeat(64),approvalId:'b0000000-0000-4000-8000-000000000042',
  current:false,status:'pending',runId:null,createdAt:'2026-10-28T12:00:00Z'}
 await page.route('**/api/sales?*',r=>r.fulfill({json:{
  projectId,state:'ok',contacts:f.contacts,offers:[f.offer],jobs:[],
  drafts:[obsolete],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,
 }}))
 await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Mejlutkast att granska'}).click()
 const initial=page.getByRole('region',{name:'Mejlutkast för granskning'})
 await expect(initial.getByText('Föråldrad version – kan inte granskas')).toBeVisible()
 await expect(initial.getByText(obsolete.body,{exact:true})).toHaveCount(0)
 await initial.locator('button[aria-controls^="outreach-review-"]').click()
 await expect(initial.getByText(obsolete.body,{exact:true})).toBeVisible()
 await expect(initial.getByRole('button',{name:'Redigera',exact:true})).toBeDisabled()
 await expect(initial.getByRole('button',{name:'Godkänn mejltext'})).toHaveCount(0)
 await expect(initial.getByRole('button',{name:'Avvisa'})).toHaveCount(0)
 expect(f.calls.some((x:any)=>/send|review|revise|approve/i.test(x.operation))).toBe(false)
})

test('first-email text approval is a review decision only, never an SMTP operation',async({page})=>{
 const f=await fixture(page)
 const first={id:'b0000000-0000-4000-8000-000000000051',projectId,
  contactId:f.contacts[0].id,contactVersion:1,offerRevisionId:f.offer.id,
  senderEmail:'info@handlarborsen.se',toEmail:'dealer@example.se',
  evidenceIds:[],subject:'FIRST EMAIL SUBJECT',body:'FIRST EMAIL PRIVATE BODY',
  questions:[],sha256:'d'.repeat(64),approvalId:'b0000000-0000-4000-8000-000000000052',
  current:true,status:'pending',runId:jobId,createdAt:'2026-10-28T12:00:00Z'}
 const writes:string[]=[]
 await page.route('**/api/sales?*',r=>r.fulfill({json:{
  projectId,state:'ok',contacts:f.contacts,offers:[f.offer],jobs:[],
  drafts:[first],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false,
 }}))
 await page.route('**/api/approvals/*',r=>{
  writes.push(r.request().method()+' '+new URL(r.request().url()).pathname)
  const body=r.request().postDataJSON()
  if(body.action==='approved')first.status='approved'
  return r.fulfill({json:{ok:true}})
 })
 page.on('request',req=>{
  if(req.method()!=='GET' && /sending|smtp|\/send(\?|$)/i.test(req.url()))writes.push('UNAUTHORIZED_SEND '+req.url())
 })
 await page.goto('/sales?stratoWorker='+workerId)
 await page.getByRole('heading',{name:'Mejlutkast att granska'}).click()
 const initial=page.getByRole('region',{name:'Mejlutkast för granskning'})
 await initial.locator('button[aria-controls^="outreach-review-"]').click()
 await initial.getByRole('button',{name:'Godkänn mejltext'}).click()
 await expect(initial.getByText('Mejltexten godkändes. Inget mejl har skickats.')).toBeVisible()
 expect(writes).toEqual(['PATCH /api/approvals/'+first.approvalId])
 await expect(initial.getByText('Text godkänd')).toBeVisible()
})
