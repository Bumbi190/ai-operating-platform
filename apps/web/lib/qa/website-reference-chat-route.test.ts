import {beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
const s=vi.hoisted(()=>({user:null as null|{id:string},scope:null as any,persisted:0,model:0,writes:0,fail:false,wait:null as Promise<void>|null}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:s.user}})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,
  insert:()=>{s.writes++;return q},update:()=>q,maybeSingle:async()=>({data:{id:s.scope?.conversationId},error:null}),
  then:(ok:any)=>Promise.resolve({data:[],error:null}).then(ok)};return q},rpc:async()=>({data:null,error:null})})}))
vi.mock('@/lib/atlas/isolation',async original=>({...await original<typeof import('@/lib/atlas/isolation')>(),getAllowedProjectIds:async()=>s.scope?[s.scope.projectId]:[]}))
vi.mock('@/lib/website-build/studio/turn-context',()=>({resolveStudioTurnContext:async()=>s.scope}))
vi.mock('@/lib/ai/atlas-model-policy',()=>({atlasModelPolicy:()=>({profile:'anthropic'})}))
vi.mock('@/lib/ai/anthropic',()=>({getAnthropic:()=>({messages:{stream:()=>{
 s.model++;return {on(){return this},async finalMessage(){return {stop_reason:'end_turn',content:[{type:'text',text:'Unwanted text fallback'}]}}}
}}})}))
vi.mock('@/lib/website-build/assets/persist-reference-turn',async original=>{
 const real=await original<typeof import('@/lib/website-build/assets/persist-reference-turn')>()
 return {...real,persistReferenceUserTurn:async(_db:unknown,p:any,input:any)=>{
  s.persisted++;if(s.wait)await s.wait;if(s.fail)throw Error('private provider diagnostic')
  expect(p.userId).toBe(s.user?.id)
  expect(input.projectId).toBe(s.scope.projectId);expect(input.conversationId).toBe(s.scope.conversationId)
  return {messageId:'90000000-0000-4000-8000-000000000001',projectId:input.projectId,conversationId:input.conversationId,
   messageSha256:'a'.repeat(64),referenceSha256:'b'.repeat(64),bindingSha256:'c'.repeat(64),imageCount:input.ticketIds.length}
 }}
})
import {POST} from '@/app/api/chat/route'
import {AtlasConversationController} from '@/lib/atlas/conversation/controller'
const projectId=randomUUID(),conversationId=randomUUID(),ticketId=randomUUID(),idempotencyKey=randomUUID()
function body(){return {messages:[{role:'user',content:'Spara dessa referenser'}],conversation_id:conversationId,
 studioContext:{projectId,conversationId},referenceSave:{ticketIds:[ticketId],idempotencyKey}}}
async function post(value:any=body(),origin='http://localhost'){
 const r=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(value)}))
 if(r.headers.get('content-type')?.includes('text/event-stream'))await r.text()
 return r
}
beforeEach(()=>{
 vi.stubEnv('ANTHROPIC_API_KEY','fixture-only');vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true')
 vi.stubEnv('ATLAS_REFERENCE_CHAT_SAVE_ENABLED','true')
 s.user={id:randomUUID()};s.scope={projectId,conversationId};s.persisted=0;s.model=0;s.writes=0;s.fail=false;s.wait=null
})
describe('actual chat reference save boundary',()=>{
 it('returns a durable message receipt, not model output or a second legacy save',async()=>{
  const r=await post()
  expect(r.status).toBe(202)
  expect(await r.json()).toMatchObject({status:'reference_saved',analysis:'not_started',receipt:{projectId,conversationId,imageCount:1}})
  expect(r.headers.get('cache-control')).toBe('private, no-store')
  expect(s.persisted).toBe(1);expect(s.writes).toBe(0);expect(s.model).toBe(0)
 })
 it('waits for durable persistence before reporting success',async()=>{
  let release!:()=>void;s.wait=new Promise<void>(resolve=>release=resolve);let done=false
  const pending=post().then(r=>{done=true;return r})
  await vi.waitFor(()=>expect(s.persisted).toBe(1));expect(done).toBe(false)
  release();expect((await pending).status).toBe(202)
 })
 it('denies unauthenticated and cross-origin attempts',async()=>{
  s.user=null;expect((await post()).status).toBe(401)
  s.user={id:randomUUID()};expect((await post(body(),'https://evil.test')).status).toBe(403)
  expect(s.persisted).toBe(0);expect(s.model).toBe(0)
 })
 it('keeps the new capability disabled by default',async()=>{
  vi.stubEnv('ATLAS_REFERENCE_CHAT_SAVE_ENABLED','')
  expect((await post()).status).toBe(503);expect(s.persisted).toBe(0);expect(s.model).toBe(0)
 })
 it('requires a verified studio context',async()=>{
  s.scope=null;const b=body();delete (b as any).studioContext
  expect((await post(b)).status).toBe(409);expect(s.persisted).toBe(0);expect(s.model).toBe(0)
 })
 it('rejects malformed selections and client identity/authority fields',async()=>{
  for(const selection of [null,{}, {ticketIds:[ticketId],idempotencyKey,ownerId:s.user?.id},
   {ticketIds:[ticketId,ticketId],idempotencyKey}]){
   expect((await post({...body(),referenceSave:selection})).status).toBe(400)
  }
  expect(s.persisted).toBe(0);expect(s.model).toBe(0)
 })
 it('requires the final message to be user-authored plain text',async()=>{
  for(const messages of [[],[{role:'assistant',content:'other'}],[{role:'user',content:[{type:'text',text:'ambiguous'}]}]]){
   expect((await post({...body(),messages})).status).toBe(400)
  }
  expect(s.persisted).toBe(0);expect(s.model).toBe(0)
 })
 it('rejects simultaneous approval/build/voice intents rather than executing them',async()=>{
  for(const extra of [{websitePlanRef:{}},{buildContext:{}},{voice:true}]){
   expect((await post({...body(),...extra})).status).toBe(409)
  }
  expect(s.persisted).toBe(0);expect(s.model).toBe(0)
 })
 it('never falls back to a model after persistence failure',async()=>{
  s.fail=true;const r=await post()
  expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('private provider')
  expect(s.model).toBe(0);expect(s.writes).toBe(0)
 })
})

it('round-trips the real shared sender through POST without a second writer or model fallback',async()=>{
 const controller=new AtlasConversationController(async(_url,init)=>POST(new Request('http://localhost/api/chat',{
  ...init,headers:{'content-type':'application/json',origin:'http://localhost',host:'localhost'},
 })))
 controller.activateConversation({id:conversationId,projectId,studio:true,saved:[],state:'ok'})
 const turn={conversationId,text:'Spara dessa referenser',ticketIds:[ticketId],idempotencyKey}
 const first=await controller.saveReferenceTurn(turn),retry=await controller.saveReferenceTurn(turn)
 expect(first.ok).toBe(true);expect(retry.referenceReceipt?.messageId).toBe(first.referenceReceipt?.messageId)
 expect(controller.snapshot().history).toEqual([{role:'user',content:turn.text}])
 expect(controller.snapshot().entries.some(e=>e.kind==='assistant')).toBe(false)
 expect(s.model).toBe(0);expect(s.writes).toBe(0)
})
