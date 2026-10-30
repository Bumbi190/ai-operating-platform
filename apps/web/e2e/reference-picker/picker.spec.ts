import {test,expect,type Page} from '@playwright/test'
const tickets=Array.from({length:5},(_,i)=>'70000000-0000-4000-8000-'+String(i+1).padStart(12,'0'))
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')
async function backend(page:Page,options:{enabled?:boolean;lose?:boolean}={}){
 const requests:any[]=[],committed=new Map<string,any>(),persisted:any[]=[];let lose=options.lose===true
 let userId='10000000-0000-4000-8000-000000000003',library=tickets
 await page.route('**/fixture/history',r=>r.fulfill({json:persisted.filter(row=>row.userId===userId).map(({userId:_userId,...row})=>row)}))
 await page.route('**/api/website-build/references/tickets?*',r=>r.fulfill({json:{available:true,canSaveToChat:options.enabled!==false,userId}}))
 await page.route('**/api/website-build/references/library?*',r=>r.fulfill({json:{available:true,items:library.map(ticketId=>({ticketId,assetId:ticketId,issuedAt:'2026-10-30T08:00:00Z'}))}}))
 await page.route('**/api/website-build/references/image?*',r=>r.fulfill({contentType:'image/png',body:png}))
 await page.route('**/api/chat',async route=>{
  const body=route.request().postDataJSON();requests.push(body)
  const key=body.studioContext.conversationId+':'+body.referenceSave.idempotencyKey
  let result=committed.get(key)
  if(!result){result={status:'reference_saved',analysis:'not_started',receipt:{
   messageId:crypto.randomUUID(),projectId:body.studioContext.projectId,conversationId:body.conversation_id,
   messageSha256:'a'.repeat(64),referenceSha256:'b'.repeat(64),bindingSha256:'c'.repeat(64),imageCount:body.referenceSave.ticketIds.length}};committed.set(key,result)
   persisted.push({id:result.receipt.messageId,role:'user',content:body.messages.at(-1).content,tool_data:null,created_at:'2026-10-30T08:00:00Z',userId})}
  if(lose){lose=false;await route.abort('failed');return}
  await route.fulfill({status:202,json:result})
 })
 return {requests,committed,setUserId:(id:string)=>{userId=id},emptyLibrary:()=>{library=[]}}
}
for(const width of [1440,390])test('selects ordered references and saves one comment at '+width,async({page},info)=>{
 const api=await backend(page);await page.setViewportSize({width,height:900});await page.goto('/picker')
 await page.getByRole('checkbox',{name:'Välj referens 2',exact:true}).check()
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Behåll färgerna från bild två.')
 await page.screenshot({path:info.outputPath('selected-'+width+'.png'),fullPage:true})
 await page.getByRole('button',{name:'Spara referenser i chatten',exact:true}).click()
 await expect(page.getByRole('region',{name:'Testchatt'})).toContainText('Referenserna är sparade')
 expect(api.requests[0].referenceSave.ticketIds).toEqual([tickets[1],tickets[0]])
 expect(api.committed.size).toBe(1)
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
 await page.screenshot({path:info.outputPath('saved-'+width+'.png'),fullPage:true})
})
test('lost response and reload retry one immutable intent without duplicates',async({page})=>{
 const api=await backend(page,{lose:true});await page.goto('/picker')
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Samma meddelande efter avbrott')
 await page.getByRole('button',{name:'Spara referenser i chatten',exact:true}).click()
 await expect(page.getByRole('button',{name:'Försök spara igen',exact:true})).toBeVisible()
 await expect(page.getByLabel('Kommentar till referenserna')).toBeDisabled()
 await page.reload()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('Samma meddelande efter avbrott')
 await page.getByRole('button',{name:'Försök spara igen',exact:true}).click()
 await expect(page.getByRole('region',{name:'Testchatt'})).toContainText('Referenserna är sparade')
 expect(api.requests).toHaveLength(2)
 expect(api.requests[1].referenceSave).toEqual(api.requests[0].referenceSave)
 expect(api.committed.size).toBe(1)
 await expect(page.getByRole('region',{name:'Testchatt'}).getByText('Samma meddelande efter avbrott',{exact:true})).toHaveCount(1)
})
test('caps selection at four and supports keyboard selection',async({page})=>{
 await backend(page);await page.goto('/picker')
 const first=page.getByRole('checkbox',{name:'Välj referens 1',exact:true})
 await first.focus();await page.keyboard.press('Space');await expect(first).toBeChecked()
 for(const i of [2,3,4])await page.getByRole('checkbox',{name:'Välj referens '+i,exact:true}).check()
 await expect(page.getByRole('checkbox',{name:'Välj referens 5',exact:true})).toBeDisabled()
 await first.uncheck();await expect(page.getByRole('checkbox',{name:'Välj referens 5',exact:true})).toBeEnabled()
})
test('hides the picker when chat save is not advertised',async({page})=>{
 await backend(page,{enabled:false});await page.goto('/picker')
 await expect(page.getByText('Sparade bilder i denna konversation')).toBeVisible()
 await expect(page.getByRole('checkbox')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Spara referenser i chatten',exact:true})).toHaveCount(0)
})
test('readOnly and project switch cannot carry editable selections across scope',async({page})=>{
 const api=await backend(page);await page.goto('/picker')
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Endast projekt A')
 await page.getByRole('button',{name:'Växla skrivskydd'}).click()
 await expect(page.getByRole('button',{name:'Spara referenser i chatten',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Växla skrivskydd'}).click()
 await page.getByRole('button',{name:'Byt projekt'}).click()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('')
 await expect(page.getByRole('checkbox',{name:'Välj referens 1',exact:true})).not.toBeChecked()
 expect(api.requests).toHaveLength(0)
})
test('makes no backend save if browser cannot retain the retry intent',async({page})=>{
 const api=await backend(page)
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('atlas-reference-save:'))throw new DOMException('full','QuotaExceededError');return original.call(this,key,value)}})
 await page.goto('/picker');await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Behåll min kommentar')
 await page.getByRole('button',{name:'Spara referenser i chatten',exact:true}).click()
 await expect(page.getByRole('alert')).toBeVisible()
 expect(api.requests).toHaveLength(0)
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('Behåll min kommentar')
})

test('restores an unconfirmed save even when its entire library window is empty',async({page})=>{
 const api=await backend(page,{lose:true});await page.goto('/picker')
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Återställ bilden utanför biblioteket')
 await page.getByRole('button',{name:'Spara referenser i chatten',exact:true}).click()
 await expect(page.getByRole('button',{name:'Försök spara igen',exact:true})).toBeVisible()
 api.emptyLibrary();await page.reload()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('Återställ bilden utanför biblioteket')
 await expect(page.getByRole('checkbox',{name:'Välj referens 1',exact:true})).toBeChecked()
 await page.getByRole('button',{name:'Försök spara igen',exact:true}).click()
 await expect(page.getByRole('region',{name:'Testchatt'})).toContainText('Referenserna är sparade')
 expect(api.requests[1].referenceSave).toEqual(api.requests[0].referenceSave)
 expect(api.committed.size).toBe(1)
})
test('never restores another signed-in users unconfirmed comment in a shared workspace',async({page})=>{
 const api=await backend(page,{lose:true});await page.goto('/picker')
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Privat ofärdig kommentar från användare A')
 await page.getByRole('button',{name:'Spara referenser i chatten',exact:true}).click()
 await expect(page.getByRole('button',{name:'Försök spara igen',exact:true})).toBeVisible()
 api.setUserId('10000000-0000-4000-8000-000000000004');await page.reload()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('')
 await expect(page.getByRole('checkbox',{name:'Välj referens 1',exact:true})).not.toBeChecked()
 expect(api.requests).toHaveLength(1)
 api.setUserId('10000000-0000-4000-8000-000000000003');await page.reload()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('Privat ofärdig kommentar från användare A')
})

test('clears private in-memory comment on signout without relying on a page redirect',async({page})=>{
 const api=await backend(page);await page.goto('/picker')
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByLabel('Kommentar till referenserna').fill('Osparad kommentar från användare A')
 await page.getByRole('button',{name:'Simulera utloggning'}).click()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveCount(0)
 await expect(page.getByText('Osparad kommentar från användare A')).toHaveCount(0)
 api.setUserId('10000000-0000-4000-8000-000000000004')
 await page.getByRole('button',{name:'Återaktivera konversation'}).click()
 await expect(page.getByLabel('Kommentar till referenserna')).toHaveValue('')
 expect(api.requests).toHaveLength(0)
})
test('keeps a selected reference visible when an upload rotates it out of the library window',async({page})=>{
 const api=await backend(page);await page.goto('/picker?selection-window')
 await page.getByRole('checkbox',{name:'Välj referens 1',exact:true}).check()
 await page.getByRole('button',{name:'Uppdatera bildbibliotek'}).click()
 await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(1)
 // This click removes the off-window row; uncheck() would wait on a detached input.
 await page.getByRole('checkbox',{checked:true}).click()
 await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(0)
 expect(api.requests).toHaveLength(0)
})

for(const ready of [true,false])test('previews only a server-verified upload; ready='+ready,async({page})=>{
 const api=await backend(page);api.emptyLibrary()
 const ticketId='80000000-0000-4000-8000-000000000001',uploads:any[]=[],imageReads:string[]=[]
 let finishRequested=false,release!:()=>void
 const finishGate=new Promise<void>(resolve=>release=resolve)
 await page.route('**/api/website-build/references/tickets',async route=>{
  const body=route.request().postDataJSON()
  await route.fulfill({json:{ticketId,bucket:'atlas-reference-staging',
   path:'incoming/'+body.projectId+'/'+body.conversationId+'/'+ticketId+'.png',token:'fixture-token',mimeType:'image/png'}})
 })
 await page.route('**/fixture/upload',async route=>{
  uploads.push({headers:route.request().headers(),bytes:route.request().postDataBuffer()})
  await route.fulfill({status:200,body:''})
 })
 await page.route('**/api/website-build/references/finish',async route=>{
  finishRequested=true;await finishGate
  await route.fulfill({status:ready?200:422,json:ready?{status:'ready',assetId:ticketId}:{error:'invalid_image'}})
 })
 await page.route('**/api/website-build/references/image?*',async route=>{
  imageReads.push(route.request().url());await route.fulfill({contentType:'image/png',body:png})
 })
 await page.goto('/picker')
 await expect(page.getByRole('button',{name:'Lägg till bild',exact:true})).toBeEnabled()
 await page.getByLabel('Välj referensbilder').setInputFiles({name:'<img src=x onerror=alert(1)>.png',mimeType:'image/png',buffer:png})
 await expect.poll(()=>finishRequested).toBe(true)
 await expect(page.getByRole('img')).toHaveCount(0)
 expect(imageReads).toHaveLength(0)
 expect(uploads).toHaveLength(1);expect(uploads[0].bytes).toEqual(png)
 expect(uploads[0].headers).toMatchObject({'content-type':'image/png','x-fixture-bucket':'atlas-reference-staging','x-fixture-token':'fixture-token','x-fixture-upsert':'false'})
 release()
 if(ready){
  const preview=page.getByRole('img',{name:'Förhandsvisning av <img src=x onerror=alert(1)>.png',exact:true})
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('src',/\/api\/website-build\/references\/image\?.*ticketId=80000000-0000-4000-8000-000000000001/)
  await expect.poll(()=>imageReads.length).toBeGreaterThan(0)
 }else{
  await expect(page.getByText('Uppladdning misslyckades',{exact:true})).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(0)
  expect(imageReads).toHaveLength(0)
 }
})
