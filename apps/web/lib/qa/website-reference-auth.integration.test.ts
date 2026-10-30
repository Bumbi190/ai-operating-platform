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
 const forbidden=await anon.rpc('website_build_persist_reference_turn',{})
 expect(forbidden.error).not.toBeNull()
 stack.sql('update projects set execution_paused=true where id='+q(projectId))
 cookieContext.jar=owner.jar
 expect((await image.GET(request('/api/website-build/references/image?'+query()))).status).toBe(404)
 expect((await chat.POST(request('/api/chat',save()))).status).toBe(409)
 expect(stack.sql('select count(*) from conversation_messages;')).toBe('1')
 expect(external).toEqual([])
})
