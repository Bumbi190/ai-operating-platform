import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {randomUUID,createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import sharp from 'sharp'
import {startReferenceStack} from '../../scripts/reference-local-stack.mjs'
const cookieContext=vi.hoisted(()=>({jar:new Map<string,string>()}))
// Only Next's request-local cookie storage is adapted. Production Supabase/auth/routes stay real.
vi.mock('next/headers',()=>({cookies:async()=>({
 getAll:()=>[...cookieContext.jar].map(([name,value])=>({name,value})),
 set:(name:string,value:string)=>cookieContext.jar.set(name,value),
})}))
let stack:any,admin:any,owner:any,outsider:any,ticket:any,finalized:any,receipt:any
let tickets:typeof import('@/app/api/website-build/references/tickets/route')
let finish:typeof import('@/app/api/website-build/references/finish/route')
let image:typeof import('@/app/api/website-build/references/image/route')
let library:typeof import('@/app/api/website-build/references/library/route')
let chat:typeof import('@/app/api/chat/route')
const projectId=randomUUID(),conversationId=randomUUID(),idempotencyKey=randomUUID()
const external:string[]=[],nativeFetch=globalThis.fetch
const q=(value:string)=>"'"+value.replaceAll("'","''")+"'"
function request(path:string,body?:unknown){
 return new Request('http://127.0.0.1:54489'+path,{method:body===undefined?'GET':'POST',
 headers:{origin:'http://127.0.0.1:54489',host:'127.0.0.1:54489','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
const query=()=>new URLSearchParams({projectId,conversationId,ticketId:ticket.ticketId})
function save(text='Behåll färgerna från min privata referens.'){
 return {messages:[{role:'user',content:text}],conversation_id:conversationId,studioContext:{projectId,conversationId},referenceSave:{ticketIds:[ticket.ticketId],idempotencyKey}}
}
async function signIn(email:string,password:string){
 const jar=new Map<string,string>()
 const ssr=createServerClient(stack.url,stack.anonKey,{cookies:{
  getAll:()=>[...jar].map(([name,value])=>({name,value})),
  setAll:values=>values.forEach(({name,value})=>jar.set(name,value)),
 }})
 const result=await ssr.auth.signInWithPassword({email,password})
 expect(result.error).toBeNull();expect(result.data.user?.id).toBeTruthy();expect(jar.size).toBeGreaterThan(0)
 return {jar,user:result.data.user!,ssr}
}
beforeAll(async()=>{
 stack=await startReferenceStack()
 // Only the freshly-owned gateway may receive Node HTTP calls after boot.
 globalThis.fetch=((input:any,init:any)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
  if(url.origin!==stack.url){external.push(url.origin);throw Error('External request forbidden in reference fixture')}
  return nativeFetch(input,{...init,redirect:'error'})
 }) as typeof fetch
 for(const [key,value]of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL:stack.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:stack.anonKey,SUPABASE_SERVICE_ROLE_KEY:stack.serviceKey,
  ATLAS_REFERENCE_UPLOAD_ENABLED:'true',ATLAS_REFERENCE_CHAT_SAVE_ENABLED:'true',ATLAS_MODEL_PROFILE:'standard',
  ANTHROPIC_API_KEY:'fixture-no-provider-access',ATLAS_CTX_ASSEMBLER:'off',
 }))vi.stubEnv(key,value as string)
 admin=createClient(stack.url,stack.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const password='Fixture-'+randomUUID()+'-9!'
 const emails=['owner-'+randomUUID()+'@example.test','other-'+randomUUID()+'@example.test']
 for(const email of emails){
  const r=await admin.auth.admin.createUser({email,password,email_confirm:true})
  expect(r.error).toBeNull();expect(r.data.user?.id).toBeTruthy()
 }
 owner=await signIn(emails[0],password);outsider=await signIn(emails[1],password)
 stack.sql('insert into projects(id,owner_id) values('+q(projectId)+','+q(owner.user.id)+');'+
  'insert into conversations(id,user_id,project_id) values('+q(conversationId)+','+q(owner.user.id)+','+q(projectId)+');'+
  'insert into project_budgets values('+q(projectId)+',10);notify pgrst,\'reload schema\';')
 ;[tickets,finish,image,library,chat]=await Promise.all([
  import('@/app/api/website-build/references/tickets/route'),import('@/app/api/website-build/references/finish/route'),
  import('@/app/api/website-build/references/image/route'),import('@/app/api/website-build/references/library/route'),
  import('@/app/api/chat/route'),
 ])
},120000)
afterAll(async()=>{
 globalThis.fetch=nativeFetch;vi.unstubAllEnvs()
 stack?.diagnostics()
 await stack?.close()
},30000)

it('validates cookie sessions with real Auth and denies absent or forged sessions',async()=>{
 cookieContext.jar=new Map()
 expect((await tickets.GET(request('/api/website-build/references/tickets?projectId='+projectId+'&conversationId='+conversationId))).status).toBe(401)
 cookieContext.jar=new Map(owner.jar);for(const key of cookieContext.jar.keys())cookieContext.jar.set(key,'forged')
 expect((await tickets.GET(request('/api/website-build/references/tickets?projectId='+projectId+'&conversationId='+conversationId))).status).toBe(401)
 cookieContext.jar=owner.jar
 const r=await tickets.GET(request('/api/website-build/references/tickets?projectId='+projectId+'&conversationId='+conversationId))
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({available:true,canSaveToChat:true,userId:owner.user.id})
})
it('issues an owner-bound ticket and denies another signed-in user',async()=>{
 const input={projectId,conversationId,draftId:randomUUID(),slot:0,mimeType:'image/png'}
 cookieContext.jar=outsider.jar
 expect((await tickets.POST(request('/api/website-build/references/tickets',input))).status).toBe(404)
 cookieContext.jar=owner.jar
 const r=await tickets.POST(request('/api/website-build/references/tickets',input))
 if(r.status!==201){
  const probe=await admin.from('website_build_reference_tickets').select('object_path').eq('project_id',projectId)
  const signed=probe.data?.[0]?.object_path?await admin.storage.from('atlas-reference-staging').createSignedUploadUrl(probe.data[0].object_path):null
  console.error('ticket admission diagnostic',JSON.stringify({dbError:probe.error,rows:probe.data?.length,storageError:signed?.error}))
 }
 expect(r.status).toBe(201);ticket=await r.json()
 expect(ticket.bucket).toBe('atlas-reference-staging');expect(ticket.token).toBeTruthy()
})
it('enforces signed-upload path and overwrite rules in real private Storage',async()=>{
 const client=createClient(stack.url,stack.anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const bytes=await sharp({create:{width:73,height:47,channels:3,background:'#276e9b'}}).png().toBuffer()
 const upload=(path:string)=>client.storage.from(ticket.bucket).uploadToSignedUrl(path,ticket.token,bytes,{contentType:'image/png',upsert:false})
 expect((await upload(ticket.path+'.other')).error).not.toBeNull()
 expect((await upload(ticket.path)).error).toBeNull()
 expect((await upload(ticket.path)).error).not.toBeNull()
 const replacement=await sharp({create:{width:11,height:13,channels:3,background:'#ff0000'}}).png().toBuffer()
 const overwrite=await client.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path,ticket.token,replacement,{contentType:'image/png',upsert:true})
 expect(overwrite.error,'request upsert:true must not override the signed non-overwrite token').not.toBeNull()
 const stored=await admin.storage.from(ticket.bucket).download(ticket.path)
 expect(stored.error).toBeNull();expect(Buffer.from(await stored.data.arrayBuffer())).toEqual(bytes)
 expect((await client.storage.from(ticket.bucket).download(ticket.path)).error).not.toBeNull()
 const publicUrl=client.storage.from(ticket.bucket).getPublicUrl(ticket.path).data.publicUrl
 expect((await fetch(publicUrl)).ok).toBe(false)
})
it('finalizes real bytes into a canonical private WebP and scopes read access',async()=>{
 const input={projectId,conversationId,ticketId:ticket.ticketId}
 cookieContext.jar=outsider.jar
 expect((await finish.POST(request('/api/website-build/references/finish',input))).status).toBe(404)
 cookieContext.jar=owner.jar
 const r=await finish.POST(request('/api/website-build/references/finish',input))
 expect(r.status,await r.clone().text()).toBe(200);finalized=await r.json()
 const read=await image.GET(request('/api/website-build/references/image?'+query()))
 expect(read.status).toBe(200);expect(read.headers.get('content-type')).toBe('image/webp')
 expect(read.headers.get('cache-control')).toBe('private, no-store')
 const bytes=Buffer.from(await read.arrayBuffer()),metadata=await sharp(bytes).metadata()
 expect([metadata.format,metadata.width,metadata.height]).toEqual(['webp',73,47])
 const row=await admin.from('assets').select('visibility,storage_bucket,checksum_sha256').eq('id',finalized.assetId).single()
 expect(row.error).toBeNull();expect(row.data).toEqual({visibility:'internal',storage_bucket:'media-assets-private',checksum_sha256:createHash('sha256').update(bytes).digest('hex')})
 cookieContext.jar=outsider.jar
 expect((await image.GET(request('/api/website-build/references/image?'+query()))).status).toBe(404)
 cookieContext.jar=owner.jar
 const list=await library.GET(request('/api/website-build/references/library?'+new URLSearchParams({projectId,conversationId})))
 expect(list.status).toBe(200);expect((await list.json()).items).toHaveLength(1)
})
it('rejects spoofed PNG bytes before admitting any canonical asset',async()=>{
 cookieContext.jar=owner.jar
 const r=await tickets.POST(request('/api/website-build/references/tickets',{projectId,conversationId,draftId:randomUUID(),slot:0,mimeType:'image/png'}))
 expect(r.status).toBe(201);const bad=await r.json()
 const client=createClient(stack.url,stack.anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const uploaded=await client.storage.from(bad.bucket).uploadToSignedUrl(bad.path,bad.token,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),{contentType:'image/png',upsert:false})
 expect(uploaded.error).toBeNull()
 const finalized=await finish.POST(request('/api/website-build/references/finish',{projectId,conversationId,ticketId:bad.ticketId}))
 expect(finalized.status).toBe(400)
 const row=await admin.from('website_build_reference_tickets').select('state,asset_id').eq('id',bad.ticketId).single()
 expect(row.error).toBeNull();expect(row.data).toEqual({state:'rejected',asset_id:null})
 expect(stack.sql('select count(*) from assets;')).toBe('1')
})
it('persists one canonical message/manifest through actual chat and the real RPC',async()=>{
 cookieContext.jar=owner.jar
 const first=await chat.POST(request('/api/chat',save()))
 expect(first.status,await first.clone().text()).toBe(202);receipt=(await first.json()).receipt
 const second=await chat.POST(request('/api/chat',save()))
 expect(second.status).toBe(202);expect((await second.json()).receipt).toEqual(receipt)
 expect(stack.sql('select count(*) from conversation_messages;')).toBe('1')
 expect(stack.sql('select count(*) from website_build_reference_messages;')).toBe('1')
 expect((await chat.POST(request('/api/chat',save('Ändrad kommentar')))).status).toBe(409)
 cookieContext.jar=outsider.jar
 expect((await chat.POST(request('/api/chat',save()))).status).toBe(404)
 expect(stack.sql('select count(*) from conversation_messages;')).toBe('1')
})
it('denies anonymous RPC execution and refuses paused-project replay/read',async()=>{
 const anon=createClient(stack.url,stack.anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const asset=await admin.from('assets').select('checksum_sha256').eq('id',finalized.assetId).single()
 expect(asset.error).toBeNull()
 const args={p_owner_id:owner.user.id,p_project_id:projectId,p_conversation_id:conversationId,
  p_idempotency_key:idempotencyKey,p_message_text:save().messages[0].content,
  p_images:[{ticketId:ticket.ticketId,assetId:finalized.assetId,mimeType:'image/webp',sha256:asset.data.checksum_sha256}]}
 // Identical arguments succeed for service_role, ruling out invalid-signature/input errors.
 const control=await admin.rpc('website_build_persist_reference_turn',args)
 expect(control.error).toBeNull();expect(control.data).toEqual(receipt)
 for(const client of [anon,owner.ssr,outsider.ssr]){
  const forbidden=await client.rpc('website_build_persist_reference_turn',args)
  expect(forbidden.error?.code,'RPC must deny role, not merely fail lookup').toBe('42501')
 }
 stack.sql('update projects set execution_paused=true where id='+q(projectId))
 cookieContext.jar=owner.jar
 expect((await image.GET(request('/api/website-build/references/image?'+query()))).status).toBe(404)
 expect((await chat.POST(request('/api/chat',save()))).status).toBe(409)
 expect(stack.sql('select count(*) from conversation_messages;')).toBe('1')
 expect(external).toEqual([])
})


// Analysis lifecycle uses real proposal SQL/Auth/Storage. Structured completions below
// are explicit fixtures, not model inference or production governance proof.
let analysisRoute:typeof import('@/app/api/website-build/references/analysis/route'),analysisQuote:any,analysisClaim:any
const analysisPath='/api/website-build/references/analysis'
const analysisInput=()=>({projectId,conversationId,messageId:receipt.messageId})
const analysisArgs=()=>({p_owner_id:owner.user.id,p_project_id:projectId,p_conversation_id:conversationId,
 p_message_id:receipt.messageId,p_binding_sha256:receipt.bindingSha256})
const claimArgs=()=>({...analysisArgs(),p_analysis_id:analysisQuote.analysisId,p_quote_token:analysisQuote.quoteToken,
 p_approved_maximum_sek:analysisQuote.maximumSek,p_payload_sha256:stack.sql('select payload_sha256 from website_build_reference_analyses where id='+q(analysisQuote.analysisId))})
it('keeps analysis off by default, then quotes only exact owned saved sources',async()=>{
 stack.sql('update projects set execution_paused=false where id='+q(projectId));cookieContext.jar=owner.jar
 analysisRoute=await import('@/app/api/website-build/references/analysis/route')
 expect((await analysisRoute.POST(request(analysisPath,{action:'quote',...analysisInput()}))).status).toBe(503)
 expect(stack.sql('select count(*) from website_build_reference_analyses')).toBe('0')
 vi.stubEnv('ATLAS_REFERENCE_ANALYSIS_ENABLED','true');vi.stubEnv('H1_SPEND_GATE','1')
 cookieContext.jar=outsider.jar
 expect((await analysisRoute.POST(request(analysisPath,{action:'quote',...analysisInput()}))).status).toBe(404)
 cookieContext.jar=owner.jar
 const csrf=new Request('http://127.0.0.1:54489'+analysisPath,{method:'POST',headers:{origin:'https://foreign.example','content-type':'application/json'},body:JSON.stringify({action:'quote',...analysisInput()})})
 expect((await analysisRoute.POST(csrf)).status).toBe(403)
 const response=await analysisRoute.POST(request(analysisPath,{action:'quote',...analysisInput()}))
 expect(response.status,await response.clone().text()).toBe(200);analysisQuote=await response.json()
 expect(analysisQuote).toMatchObject({status:'quoted',model:'claude-haiku-4-5-20251001'})
 expect(analysisQuote.maximumSek).toBeGreaterThan(0);expect(analysisQuote.maximumSek).toBeLessThanOrEqual(10)
 const sources=await analysisRoute.GET(request(analysisPath+'?'+new URLSearchParams({projectId,conversationId})))
 expect(sources.status).toBe(200);expect((await sources.json()).items).toEqual([expect.objectContaining({messageId:receipt.messageId,imageCount:1})])
 expect(stack.sql("select count(*) from website_build_reference_analyses where status='quoted'")).toBe('1')
})
it('rejects stale quote tokens and denies direct API-role mutation/RPC execution',async()=>{
 const old=analysisQuote
 const refreshed=await analysisRoute.POST(request(analysisPath,{action:'quote',...analysisInput()}))
 expect(refreshed.status).toBe(200);analysisQuote=await refreshed.json();expect(analysisQuote.quoteToken).not.toBe(old.quoteToken)
 expect((await analysisRoute.POST(request(analysisPath,{action:'run',...analysisInput(),analysisId:old.analysisId,quoteToken:old.quoteToken,approvedMaximumSek:old.maximumSek}))).status).toBe(409)
 const anon=createClient(stack.url,stack.anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const quoteArgs={...analysisArgs(),p_payload_sha256:'a'.repeat(64),p_maximum_sek:analysisQuote.maximumSek}
 for(const client of [anon,owner.ssr,outsider.ssr]){
  for(const [name,args] of [
   ['website_build_reference_analysis_quote',quoteArgs],['website_build_reference_analysis_claim',claimArgs()],
   ['website_build_reference_analysis_finish',{...analysisArgs(),p_analysis_id:analysisQuote.analysisId,p_claim_token:randomUUID(),p_status:'unknown',p_canonical_result:null}],
  ] as const){expect((await client.rpc(name,args)).error?.code).toBe('42501')}
 }
 expect((await admin.from('website_build_reference_analyses').update({status:'unknown'}).eq('id',analysisQuote.analysisId)).error?.code).toBe('42501')
})
it('atomically admits one claim and never reclaims after an ambiguous outcome',async()=>{
 const claims=await Promise.all([admin.rpc('website_build_reference_analysis_claim',claimArgs()),admin.rpc('website_build_reference_analysis_claim',claimArgs())])
 for(const response of claims)expect(response.error).toBeNull()
 expect(claims.filter(r=>r.data.claimed)).toHaveLength(1);analysisClaim=claims.find(r=>r.data.claimed)!.data
 const replay=await analysisRoute.POST(request(analysisPath,{action:'run',...analysisInput(),analysisId:analysisQuote.analysisId,quoteToken:analysisQuote.quoteToken,approvedMaximumSek:analysisQuote.maximumSek}))
 expect(replay.status,await replay.clone().text()).toBe(200);expect((await replay.json()).status).toBe('processing')
 // Already paid outcome recording remains possible after pause; disclosure does not.
 stack.sql('update projects set execution_paused=true where id='+q(projectId))
 const completionArgs={...analysisArgs(),p_analysis_id:analysisQuote.analysisId,p_claim_token:analysisClaim.claimToken,p_status:'unknown',p_canonical_result:null}
 const done=await admin.rpc('website_build_reference_analysis_finish',completionArgs)
 expect(done.error).toBeNull();expect(done.data.status).toBe('unknown');expect(done.data.claim_token).toBeUndefined()
 expect((await admin.rpc('website_build_reference_analysis_finish',completionArgs)).error).toBeNull()
 expect((await analysisRoute.GET(request(analysisPath+'?'+new URLSearchParams(analysisInput())))).status).toBe(404)
 stack.sql('update projects set execution_paused=false where id='+q(projectId))
 const quote=await analysisRoute.POST(request(analysisPath,{action:'quote',...analysisInput()}))
 expect(quote.status).toBe(200);expect((await quote.json()).status).toBe('unknown')
 const next=await admin.rpc('website_build_reference_analysis_claim',claimArgs())
 expect(next.error).toBeNull();expect(next.data.claimed).toBe(false);expect(next.data.claimToken).toBeUndefined()
})
it('returns a persisted fixture result only while exact private source bytes and ownership remain valid',async()=>{
 cookieContext.jar=owner.jar
 const saveBody=save();saveBody.referenceSave.idempotencyKey=randomUUID()
 const saved=await chat.POST(request('/api/chat',saveBody));expect(saved.status).toBe(202)
 receipt=(await saved.json()).receipt
 const quoted=await analysisRoute.POST(request(analysisPath,{action:'quote',...analysisInput()}))
 expect(quoted.status).toBe(200);analysisQuote=await quoted.json()
 const claimed=await admin.rpc('website_build_reference_analysis_claim',claimArgs());expect(claimed.error).toBeNull()
 const fixture={version:'reference-analysis.v1',observations:[{imageIndex:1,layout:'Luftig',typography:'Stor rubrik',colors:'Blått'}],
  directions:['editorial','visual','structured'].map(key=>({key,title:'Riktning '+key,rationale:'Egen hierarki',palette:{background:'#ffffff',foreground:'#162032',accent:'#1e40af'},font:'sans',mobile:'En kolumn'})),uncertainties:['Stillbild visar inte funktion.']}
 const completion=await admin.rpc('website_build_reference_analysis_finish',{...analysisArgs(),p_analysis_id:analysisQuote.analysisId,p_claim_token:claimed.data.claimToken,p_status:'succeeded',p_canonical_result:JSON.stringify(fixture)})
 expect(completion.error).toBeNull()
 const url=analysisPath+'?'+new URLSearchParams(analysisInput())
 const response=await analysisRoute.GET(request(url));expect(response.status,await response.clone().text()).toBe(200)
 const view=await response.json();expect(view.analysis).toEqual(fixture);expect(view.concepts).toHaveLength(3)
 for(const c of view.concepts)expect(c.html).not.toContain('<script')
 cookieContext.jar=outsider.jar;expect((await analysisRoute.GET(request(url))).status).toBe(404);cookieContext.jar=owner.jar
 const asset=await admin.from('assets').select('storage_bucket,storage_path').eq('id',finalized.assetId).single();expect(asset.error).toBeNull()
 const original=await admin.storage.from(asset.data.storage_bucket).download(asset.data.storage_path);expect(original.error).toBeNull()
 const originalBytes=Buffer.from(await original.data.arrayBuffer())
 const changed=await sharp({create:{width:20,height:20,channels:3,background:'#ff0000'}}).webp().toBuffer()
 expect((await admin.storage.from(asset.data.storage_bucket).upload(asset.data.storage_path,changed,{contentType:'image/webp',upsert:true})).error).toBeNull()
 try{expect((await analysisRoute.GET(request(url))).status).not.toBe(200)}finally{
  expect((await admin.storage.from(asset.data.storage_bucket).upload(asset.data.storage_path,originalBytes,{contentType:'image/webp',upsert:true})).error).toBeNull()
 }
 expect(external).toEqual([])
})
