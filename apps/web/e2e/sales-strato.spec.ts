import {test,expect} from '@playwright/test'
import {generateKeyPairSync,createHash,privateDecrypt,createDecipheriv,constants} from 'node:crypto'
import {mkdirSync} from 'node:fs'
const projectId='10000000-0000-4000-8000-000000000001',workerId='60000000-0000-4000-8000-000000000001',mailboxId='80000000-0000-4000-8000-000000000001',setupId='70000000-0000-4000-8000-000000000001'
test('real browser encrypts a private Strato form and reports login-only proof on desktop/mobile',async({page})=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicExponent:65537}),publicJwk=publicKey.export({format:'jwk'}),kid=createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex'),password='STRATO_PRIVATE_CANARY_20261017_å🔐'
 const context={projectId,workerId,mailboxId,setupId,kid,email:'info@example.se',expiresAt:new Date(Date.now()+900000).toISOString()}
 const status:any={mailboxId,email:context.email,status:'not_connected',smtpAuthenticatedAt:null,imapAuthenticatedAt:null,reasonCode:null,inboxEnabled:false,sendingEnabled:false}
 const host={workerId,managed:true,generation:1,desiredState:'paused',connectionState:'online',cliState:'blocked',lastSeenAt:null,workerExpiresAt:context.expiresAt,executionPaused:false,reconnectRequested:false}
 const bodies:string[]=[],logs:string[]=[];page.on('request',r=>{if(r.postData())bodies.push(r.postData()!)});page.on('console',m=>logs.push(m.text()));let submitted=false
 const model={projectId,state:'ok',workerState:'connected',contacts:[],offers:[],jobs:[],drafts:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}
 let beginReady:()=>void=()=>{},releaseBegin:()=>void=()=>{};const beginStarted=new Promise<void>(resolve=>beginReady=resolve),beginGate=new Promise<void>(resolve=>releaseBegin=resolve)
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[host],sendingEnabled:false}:model}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:status}))
 await page.route('**/api/sales/mailbox',async route=>{const body=route.request().postDataJSON();if(body.operation==='begin_setup'){beginReady();await beginGate;expect(body.email).toBe(context.email);await route.fulfill({json:{context,publicJwk,alreadySubmitted:false}});return}
  expect(body.operation).toBe('submit_sealed');expect(Object.keys(body).sort()).toEqual(['envelope','operation','projectId','setupId']);const e=body.envelope,label=Buffer.from(`OmniraSales/strato/v1\n${projectId}\n${workerId}\n${setupId}\n${kid}`),aes=privateDecrypt({key:privateKey,oaepHash:'sha256',oaepLabel:label,padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(e.wrappedKey,'base64url')),raw=Buffer.from(e.ciphertext,'base64url'),decipher=createDecipheriv('aes-256-gcm',aes,Buffer.from(e.iv,'base64url'));decipher.setAAD(label);decipher.setAuthTag(raw.subarray(-16));expect(JSON.parse(Buffer.concat([decipher.update(raw.subarray(0,-16)),decipher.final()]).toString())).toEqual({email:context.email,password});submitted=true;status.status='authenticated';status.smtpAuthenticatedAt=new Date().toISOString();status.imapAuthenticatedAt=new Date().toISOString();await route.fulfill({json:{accepted:true,setupId}})
 })
 await page.setViewportSize({width:1440,height:1000});await page.goto('/sales?stratoWorker='+workerId)
 await expect(page.getByRole('heading',{name:'Anslut Strato',exact:true})).toBeVisible()
 await page.getByRole('textbox',{name:'Fullständig postfacksadress',exact:true}).fill(context.email)
 await page.getByLabel('Postfackslösenord',{exact:true}).fill(password)
 await page.getByRole('checkbox',{name:'Jag bekräftar att detta är rätt postfack.'}).check()
 await page.getByRole('button',{name:'Anslut Strato',exact:true}).click()
 await beginStarted;try{await expect(page.getByRole('textbox',{name:'Fullständig postfacksadress',exact:true})).toBeDisabled()}finally{releaseBegin()}
 await expect(page.getByText(`Strato-inloggningen är verifierad för ${context.email}.`,{exact:true})).toBeVisible({timeout:15000});expect(submitted).toBe(true);expect(bodies.join('\n')).not.toContain(password);expect(logs.join('\n')).not.toContain(password);await expect(page.getByLabel('Postfackslösenord',{exact:true})).toHaveValue('')
 await expect(page.getByText('Inkorgsinläsning är inte aktiverad.',{exact:true})).toBeVisible();await expect(page.getByText('Provar inloggningen – inga mejl skickas',{exact:true})).toBeVisible()
 const dir=process.env.SALES_BROWSER_ARTIFACT_DIR??'../../.superpowers/sdd/2026-10-17-sales-strato-inbox/browser';mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/strato-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:dir+'/strato-mobile.png',fullPage:true})
})

test('saved authentication identifies its exact mailbox while another address is edited',async({page})=>{
 const saved='verified@example.se',edited='unverified@example.se'
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[{workerId,managed:true,connectionState:'online'}]}:{projectId,state:'ok',workerState:'connected',contacts:[],offers:[],jobs:[],drafts:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:{mailboxId,email:saved,status:'authenticated',inboxEnabled:false,sendingEnabled:false}}))
 await page.goto('/sales?stratoWorker='+workerId)
 const input=page.getByRole('textbox',{name:'Fullständig postfacksadress',exact:true})
 await expect(input).toHaveValue(saved)
 await expect(page.getByText(`Strato-inloggningen är verifierad för ${saved}.`,{exact:true})).toBeVisible()
 await input.fill(edited);await page.waitForTimeout(5200)
 await expect(input).toHaveValue(edited)
 await expect(page.getByText(`Strato-inloggningen är verifierad för ${saved}.`,{exact:true})).toBeVisible()
 await expect(page.getByText(`Strato-inloggningen är verifierad för ${edited}.`,{exact:true})).toHaveCount(0)
})
test('oversize Unicode and JSON expansion are refused before a setup exists',async({page})=>{
 const bodies:string[]=[],logs:string[]=[]
 page.on('request',r=>{if(r.postData())bodies.push(r.postData()!)});page.on('console',m=>logs.push(m.text()))
 await page.route('**/api/sales?*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('connection')?{connections:[{workerId,managed:true,connectionState:'online'}]}:{projectId,state:'ok',workerState:'connected',contacts:[],offers:[],jobs:[],drafts:[],workers:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false}}))
 await page.route('**/api/sales/mailbox?*',r=>r.fulfill({json:null}))
 await page.route('**/api/sales/mailbox',r=>r.fulfill({status:400,json:{error:'BLOCKED'}}))
 await page.goto('/sales?stratoWorker='+workerId)
 await expect(page.getByRole('button',{name:'Anslut Strato',exact:true})).toBeEnabled()
 await page.getByRole('checkbox',{name:'Jag bekräftar att detta är rätt postfack.'}).check()
 for(const secret of ['å'.repeat(1025),'\u0001'.repeat(700)]){
  await page.getByLabel('Postfackslösenord',{exact:true}).fill(secret)
  await page.getByRole('button',{name:'Anslut Strato',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('Lösenordet är för stort för säker lagring. Gränsen är 2048 UTF-8-byte och 4096 byte för den krypterade kontoinformationen.')
  await expect(page.getByLabel('Postfackslösenord',{exact:true})).toHaveValue('')
  expect(bodies).toHaveLength(0);expect(logs.join('\n')).not.toContain(secret)
 }
})
