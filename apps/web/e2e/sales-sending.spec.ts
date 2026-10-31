import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',jobId='9ff8cf88-41e6-4951-8bf1-4c1af09d6901',revisionId='91736c50-3db6-4d68-86f8-1660672fed0f',hash='a'.repeat(64)
async function fixture(page:any,status='approved'){
 const calls:any[]=[]
 const job={id:jobId,projectId,status:'awaiting_review',editorialStatus:status,replyMode:'general',messageId:jobId,sourceCurrent:true,newerIncoming:false,createdAt:'2026-10-18T07:30:00Z',attempts:1,source:{subject:'Svar på test',senderName:'Andre',senderEmail:'info@handlarborsen.se',toEmail:'andrehultgren190@gmail.com',companyName:'Mejlsvar',branchName:null,offerText:'Inget erbjudande'}}
 const draft={id:revisionId,projectId,jobId,sha256:hash,subject:'Svar på test',body:'Syntetiskt svar.\n\nVänliga hälsningar\nAndre',status,current:true,approvalId:revisionId,questions:[],createdAt:job.createdAt}
 let send:any=null
 await page.route('**/api/sales?*',(r:any)=>r.fulfill({json:{projectId,state:'ok',contacts:[],offers:[],jobs:[],drafts:[],connections:[],workspaceUrl:'/sales',sendingEnabled:false}}))
 await page.route('**/api/sales/replies?*',(r:any)=>r.fulfill({json:{jobs:[job],drafts:[draft],sendingEnabled:false}}))
 await page.route('**/api/sales/sending?*',(r:any)=>r.fulfill({json:{revisionId,revisionHash:hash,mailboxGeneration:6,canConfirm:status==='approved'&&!send,blockedReason:status==='approved'?null:'TEXT_APPROVAL_REQUIRED',job:send}}))
 await page.route('**/api/sales/sending',(r:any)=>{const b=r.request().postDataJSON();calls.push(b);send={id:jobId,revisionId,revisionHash:hash,status:'queued',serverAccepted:false,deliveryConfirmed:false};return r.fulfill({json:send})})
 return {calls,job,draft,setSend:(s:string)=>{send={id:jobId,revisionId,revisionHash:hash,status:s,serverAccepted:s==='smtp_accepted',deliveryConfirmed:false}}}
}
test('approved text shows a separate exact-envelope send confirmation; double click queues once',async({page})=>{
 const f=await fixture(page);await page.goto('/sales');const area=page.getByRole('region',{name:'Svarsförslag',exact:true})
 await expect(page.getByText('Kundutskick är inte aktiverade.',{exact:true})).toBeVisible();await expect(area.getByText('Syntetiskt svar.',{exact:false})).toBeVisible();await expect(area.getByText('Andre <info@handlarborsen.se>',{exact:true})).toBeVisible();await expect(area.getByText('andrehultgren190@gmail.com',{exact:true})).toBeVisible()
 const button=area.getByRole('button',{name:'Godkänn och skicka detta testmejl'});await expect(button).toBeEnabled();expect(f.calls).toEqual([])
 const dir=process.env.SALES_BROWSER_ARTIFACT_DIR!;mkdirSync(dir,{recursive:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:dir+'/send-confirm-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/send-confirm-mobile.png',fullPage:true});await button.dblclick();expect(f.calls).toHaveLength(1);expect(f.calls[0]).toEqual({operation:'confirm',projectId,revisionId,expectedRevisionHash:hash,expectedMailboxGeneration:6,idempotencyKey:expect.any(String)});await expect(area.getByText('Köat för sändning',{exact:true})).toBeVisible()
})
test('unapproved text never exposes an enabled send action',async({page})=>{const f=await fixture(page,'pending');await page.goto('/sales');await expect(page.getByRole('button',{name:'Godkänn och skicka detta testmejl'})).toHaveCount(0);expect(f.calls).toEqual([])})
test('accepted and uncertain statuses are truthful on desktop and mobile',async({page})=>{
 const f=await fixture(page);f.setSend('delivery_unknown');await page.setViewportSize({width:1440,height:1000});await page.goto('/sales')
 await expect(page.getByText('Leverans osäker — skicka inte igen',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Godkänn och skicka detta testmejl'})).toHaveCount(0);await expect(page.getByRole('button',{name:/Försök igen/})).toHaveCount(0)
 const dir=process.env.SALES_BROWSER_ARTIFACT_DIR!;mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/send-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:dir+'/send-mobile.png',fullPage:true})
 f.setSend('smtp_accepted');await page.getByRole('button',{name:'Uppdatera sändstatus'}).click();await expect(page.getByText('Accepterat av Strato',{exact:true})).toBeVisible();await expect(page.getByText(/Mottagning i inkorgen är inte bekräftad/)).toBeVisible();expect(f.calls).toEqual([])
})
