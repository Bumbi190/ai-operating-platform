import {describe,expect,it} from 'vitest'
import {AtlasConversationController} from './controller'
const P='10000000-0000-4000-8000-000000000001',C='50000000-0000-4000-8000-000000000001',
 T='70000000-0000-4000-8000-000000000001',K='80000000-0000-4000-8000-000000000001',M='90000000-0000-4000-8000-000000000001'
const input={conversationId:C,text:'Spara referenser',ticketIds:[T],idempotencyKey:K}
const payload=()=>({status:'reference_saved',analysis:'not_started',receipt:{
 messageId:M,projectId:P,conversationId:C,messageSha256:'a'.repeat(64),
 referenceSha256:'b'.repeat(64),bindingSha256:'c'.repeat(64),imageCount:1}})
function controller(request:typeof fetch){
 const c=new AtlasConversationController(request)
 c.activateConversation({id:C,projectId:P,studio:true,saved:[],state:'ok'});return c
}
describe('explicit reference-save transport',()=>{
 it('posts a scoped save intent and shows a notice without inventing assistant analysis',async()=>{
  let sent:any
  const c=controller(async(_url,init)=>{sent=JSON.parse(init!.body as string);return Response.json(payload(),{status:202})})
  const result=await c.saveReferenceTurn(input)
  expect(result.ok).toBe(true);expect(result.referenceReceipt?.messageId).toBe(M)
  expect(sent.referenceSave).toEqual({ticketIds:[T],idempotencyKey:K})
  expect(sent.studioContext).toEqual({projectId:P,conversationId:C})
  expect(c.snapshot().history).toEqual([{role:'user',content:input.text}])
  expect(c.snapshot().entries).toContainEqual(expect.objectContaining({kind:'notice',tone:'info'}))
  expect(c.snapshot().entries.some(e=>e.kind==='assistant')).toBe(false)
 })
 it('retries a lost response with the same key and one logical user message',async()=>{
  const keys:string[]=[];let first=true
  const c=controller(async(_url,init)=>{keys.push(JSON.parse(init!.body as string).referenceSave.idempotencyKey);if(first){first=false;throw Error('lost after commit')}return Response.json(payload(),{status:202})})
  expect((await c.saveReferenceTurn(input)).ok).toBe(false);expect(c.snapshot().history).toEqual([])
  expect((await c.saveReferenceTurn(input)).ok).toBe(true)
  expect(keys).toEqual([K,K]);expect(c.snapshot().history).toHaveLength(1)
 })
 it('does not duplicate local history when the server returns a previously confirmed message ID',async()=>{
  const c=controller(async()=>Response.json(payload(),{status:202}))
  await c.saveReferenceTurn(input);await c.saveReferenceTurn(input)
  expect(c.snapshot().history).toHaveLength(1)
 })
 it('does not save in ordinary chat or when client scope/selection is invalid',async()=>{
  let calls=0;const c=controller(async()=>{calls++;return Response.json(payload(),{status:202})})
  c.activateConversation({id:C,projectId:P,saved:[],state:'ok'})
  expect((await c.saveReferenceTurn(input)).ok).toBe(false)
  c.activateConversation({id:C,projectId:P,studio:true,saved:[],state:'ok'})
  expect((await c.saveReferenceTurn({...input,ticketIds:[T,T]})).ok).toBe(false)
  expect(calls).toBe(0)
 })
 for(const change of [
  (p:any)=>({...p,analysis:'complete'}),(p:any)=>({...p,receipt:{...p.receipt,projectId:T}}),
  (p:any)=>({...p,receipt:{...p.receipt,conversationId:T}}),(p:any)=>({...p,receipt:{...p.receipt,imageCount:2}}),
  (p:any)=>({...p,receipt:{...p.receipt,executionAuthorized:true}}),
 ])it('refuses a malformed/foreign receipt and preserves retryable history',async()=>{
  const c=controller(async()=>Response.json(change(payload()),{status:202}))
  expect((await c.saveReferenceTurn(input)).ok).toBe(false)
  expect(c.snapshot().history).toEqual([])
 })
})

it('an old rejected save after signout cannot clear or overwrite a new pending turn',async()=>{
 let rejectOld!:(error:Error)=>void,releaseNew!:(response:Response)=>void,calls=0
 const c=controller(async()=>++calls===1?new Promise<Response>((_r,reject)=>rejectOld=reject):new Promise<Response>(resolve=>releaseNew=resolve))
 const old=c.saveReferenceTurn(input)
 c.clearOnSignout()
 c.activateConversation({id:C,projectId:P,studio:true,saved:[],state:'ok'})
 const fresh=c.saveReferenceTurn({...input,text:'Nytt meddelande'})
 rejectOld(Error('old failed response'));await old
 try{expect(c.snapshot().pending).toBe(true);expect(c.snapshot().history[0]?.content).toBe('Nytt meddelande')}
 finally{releaseNew(Response.json(payload(),{status:202}));await fresh}
})

for(const successful of [true,false])it('settles a '+(successful?'successful':'failed')+' save after navigation without duplicate retry history',async()=>{
 let release!:(response:Response)=>void,calls=0
 const c=controller(async()=>++calls===1?new Promise<Response>(resolve=>release=resolve):Response.json(payload(),{status:202}))
 const old=c.saveReferenceTurn(input)
 const other='50000000-0000-4000-8000-000000000002'
 c.activateConversation({id:other,projectId:P,studio:true,saved:[],state:'ok'})
 release(successful?Response.json(payload(),{status:202}):Response.json({error:'unavailable'},{status:503}))
 expect((await old).ok).toBe(successful)
 expect(c.snapshot().id).toBe(other);expect(c.snapshot().history).toEqual([])
 c.activateConversation({id:C,projectId:P,studio:true,saved:[],state:'ok'})
 expect(c.snapshot().history).toHaveLength(successful?1:0)
 expect((await c.saveReferenceTurn(input)).ok).toBe(true)
 expect(c.snapshot().history).toHaveLength(1)
})

for(const success of [true,false])it('settles a '+(success?'confirmed':'failed')+' reference save after pending clears for queued voice consumers',async()=>{
 const c=controller(async()=>success?Response.json(payload(),{status:202}):Response.json({error:'unavailable'},{status:503}))
 const settled:any[]=[]
 c.subscribeSettled(event=>settled.push({...event,pending:c.snapshot().pending}))
 const result=await c.saveReferenceTurn(input)
 expect(result.ok).toBe(success)
 expect(settled).toEqual([{conversationId:C,generation:1,current:true,ok:success,pending:false}])
})
it('marks a reference-save settlement stale after navigation without clearing the active conversation',async()=>{
 let release!:(response:Response)=>void
 const c=controller(async()=>new Promise<Response>(resolve=>release=resolve)),settled:any[]=[]
 c.subscribeSettled(event=>settled.push(event))
 const pending=c.saveReferenceTurn(input)
 const other='50000000-0000-4000-8000-000000000002'
 c.activateConversation({id:other,projectId:P,studio:true,saved:[],state:'ok'})
 release(Response.json(payload(),{status:202}));await pending
 expect(settled).toEqual([{conversationId:C,generation:1,current:false,ok:true}])
 expect(c.snapshot().id).toBe(other);expect(c.snapshot().pending).toBe(false)
})

it('does not duplicate a hydrated persisted message when replaying its lost receipt after reload',async()=>{
 const c=controller(async()=>Response.json(payload(),{status:202}))
 c.activateConversation({id:C,projectId:P,studio:true,state:'ok',saved:[
  {id:M,role:'user',content:input.text,tool_data:null,created_at:'2026-10-30T08:00:00Z'},
 ]})
 expect((await c.saveReferenceTurn(input)).ok).toBe(true)
 expect(c.snapshot().history).toEqual([{role:'user',content:input.text}])
 expect(c.snapshot().entries.filter(e=>e.kind==='user')).toHaveLength(1)
})
it('keeps a different persisted message with the same text when saving a new reference message',async()=>{
 const c=controller(async()=>Response.json(payload(),{status:202}))
 c.activateConversation({id:C,projectId:P,studio:true,state:'ok',saved:[
  {id:'90000000-0000-4000-8000-000000000002',role:'user',content:input.text,tool_data:null,created_at:'2026-10-30T08:00:00Z'},
 ]})
 expect((await c.saveReferenceTurn(input)).ok).toBe(true)
 expect(c.snapshot().history).toEqual([{role:'user',content:input.text},{role:'user',content:input.text}])
})
