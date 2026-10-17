import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
const projectId='10000000-0000-4000-8000-000000000001',offerId='40000000-0000-4000-8000-000000000001'
test('five exact drafts survive reload; edit, editorial approval and mobile layout are truthful',async({page,context})=>{
 page.on('pageerror',e=>console.error('PAGE ERROR',e.message))
 await context.grantPermissions(['clipboard-read','clipboard-write'])
 const contacts=Array.from({length:5},(_,i)=>({id:`30000000-0000-4000-8000-00000000000${i+1}`,projectId,companyName:`Testbil ${i+1}`,branchName:i<2?['Nord','Syd'][i]:'',email:i<2?'shared@example.se':`branch${i}@example.se`,websiteUrl:null,version:1,pilotMonths:12,history:'not_contacted',historySource:'Manuellt verifierat testunderlag',confirmed:true,excluded:false,suppressed:false}))
 const model:any={projectId,state:'ok',workerState:'not_connected',contacts,offers:[{id:offerId,projectId,senderEmail:'info@handlarborsen.se',offerText:'12 månader gratis',freeMonths:12,productFacts:['Stängd B2B-marknadsplats'],confirmed:true,createdAt:'2026-10-17T10:00:00Z'}],jobs:[{id:'60000000-0000-4000-8000-000000000001',projectId,status:'queued',createdAt:'2026-10-17T10:01:00Z',attempts:0,detail:null}],drafts:[],evidence:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}
 const writes:any[]=[]
 const host:any={workerId:'60000000-0000-4000-8000-000000000009',managed:true,generation:1,desiredState:'running',connectionState:'online',cliState:'ready',lastSeenAt:'2026-10-17T14:00:00Z',workerExpiresAt:'2026-10-18T14:00:00Z',executionPaused:false,reconnectRequested:false}
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[host],sendingEnabled:false}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales',async route=>{const v=route.request().postDataJSON();writes.push(v);if(v.operation==='revise'){const i=model.drafts.findIndex((d:any)=>d.id===v.revisionId);model.drafts[i]={...model.drafts[i],...v.draft,id:'80000000-0000-4000-8000-000000000001',sha256:'b'.repeat(64),approvalId:'90000000-0000-4000-8000-000000000001',status:'pending'}}else if(v.operation==='set_worker_desired')host.desiredState=v.action==='pause'?'paused':'running';else if(v.operation==='cancel')model.jobs[0].status='cancelled';else throw Error(`Unexpected operation ${v.operation}`);await route.fulfill({json:{ok:true}})})
 await page.route('**/api/approvals/*',async route=>{writes.push(route.request().postDataJSON());model.drafts[0].status='approved';await route.fulfill({json:{ok:true}})})
 await page.setViewportSize({width:1440,height:1000});await page.goto('/sales')
 await expect(page.getByRole('heading',{name:'Säljförberedelse'})).toBeVisible()
 await expect(page.getByText('Väntar på lokal worker',{exact:true})).toBeVisible()
 for(let i=0;i<5;i++)await page.getByRole('checkbox').nth(i).check()
 await page.getByRole('button',{name:'Kopiera uppdrag till Atlas'}).click()
 const request=await page.evaluate(()=>navigator.clipboard.readText());expect(request).toContain('Testbil 1, Nord (shared@example.se)');expect(request).toContain('Testbil 2, Syd (shared@example.se)');expect(request).toContain('Skicka inget.')
 model.jobs[0].status='awaiting_review';model.jobs[0].attempts=5
 model.drafts=contacts.map((c,i)=>({contactId:c.id,contactVersion:1,offerRevisionId:offerId,senderEmail:'info@handlarborsen.se',toEmail:c.email,subject:`En fråga till ${c.companyName}`,body:'Vill ni prova Handlarbörsen i 12 månader gratis?',evidenceIds:[],questions:[],id:`70000000-0000-4000-8000-00000000000${i+1}`,projectId,jobId:model.jobs[0].id,sha256:'a'.repeat(64),approvalId:`90000000-0000-4000-8000-00000000000${i+2}`,runId:null,status:'pending',current:true,createdAt:'2026-10-17T10:02:00Z'}))
 await page.reload();await expect(page.getByRole('article')).toHaveCount(5)
 await expect(page.getByRole('article').first()).toContainText('shared@example.se');await expect(page.getByRole('article').nth(1)).toContainText('shared@example.se')
 await expect(page.getByRole('article').first().getByRole('heading',{level:3})).toContainText('Nord');await expect(page.getByRole('article').nth(1).getByRole('heading',{level:3})).toContainText('Syd')
 await page.getByRole('button',{name:'Redigera och granska på nytt'}).first().click();await page.getByRole('textbox',{name:'Mejltext',exact:true}).fill('En ändrad fråga om 12 månader gratis.');await page.getByRole('button',{name:'Spara ny version'}).click()
 await expect(page.getByRole('article').first()).toContainText('En ändrad fråga om 12 månader gratis.')
 await page.getByRole('button',{name:'Godkänn utkast'}).first().click();await expect(page.getByText('Utkastet är godkänt. Inget mejl har skickats.',{exact:true})).toBeVisible()
 expect(writes.map(x=>x.operation??x.action)).toEqual(['revise','approved'])
 await expect(page.getByText('Redo att förbereda utkast',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Pausa förberedelsen',exact:true}).click();await expect(page.getByText('Förberedelsen är pausad',{exact:true})).toBeVisible();await expect(page.getByText('Worker token',{exact:true})).toHaveCount(0)
 const folder='../../.superpowers/sdd/2026-10-17-sales-managed-host/browser';mkdirSync(folder,{recursive:true});await page.screenshot({path:`${folder}/sales-desktop.png`,fullPage:true})
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Säljförberedelse'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`${folder}/sales-mobile.png`,fullPage:true})
})
