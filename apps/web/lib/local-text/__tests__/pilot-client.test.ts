import {it,expect} from 'vitest'
const api=await import('../pilot-client').catch(()=>({}) as typeof import('../pilot-client'))
const projectId='22222222-2222-4222-8222-222222222222',conversationId='33333333-3333-4333-8333-333333333333',requestId='55555555-5555-4555-8555-555555555555',jobId='44444444-4444-4444-8444-444444444444'
function fixture(){const values=new Map<string,string>();return {values,store:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}}}}
it('reconciles server-committed lost acknowledgment after remount using one job identity',async()=>{
 expect(typeof api.queueLocalTextPilot).toBe('function')
 const {values,store}=fixture(),jobs=new Map<string,string>();let creations=0,requests=0
 const ports={store,now:()=>Date.parse('2026-10-17T18:00:00Z'),randomUUID:()=>requestId,createConversation:async()=>{creations++;return conversationId},send:async(body:any)=>{requests++;expect([...values.values()].join('')).toContain(body.idempotencyKey);jobs.set(body.idempotencyKey,jobId);if(requests===1)throw Error('ACK_LOST');return {receipt:{type:'local_text_job',id:jobs.get(body.idempotencyKey),projectId,conversationId:body.conversationId,expiresAt:'2026-10-18T18:00:00Z'}}}}
 await expect(api.queueLocalTextPilot(projectId,ports)).rejects.toThrow('ACK_LOST')
 const result=await api.queueLocalTextPilot(projectId,{...ports,randomUUID:()=>{throw Error('must reuse pending key')}})
 expect(result).toEqual({id:jobId,projectId,conversationId});expect(creations).toBe(1);expect(jobs.size).toBe(1);expect(requests).toBe(2)
 expect([...values.values()].join('')).not.toContain('Jag behöver')
})
it('does not dispatch if durable pending identity cannot be stored',async()=>{
 const {store}=fixture();let dispatched=false
 await expect(api.queueLocalTextPilot(projectId,{store:{...store,setItem:()=>{throw Error('QUOTA')}},now:()=>Date.now(),randomUUID:()=>requestId,createConversation:async()=>conversationId,send:async()=>{dispatched=true;throw Error()}})).rejects.toThrow('PILOT_STATE_UNAVAILABLE')
 expect(dispatched).toBe(false)
})
it('expired unknown pending state erases identifiers and refuses a replacement job',async()=>{
 const {values,store}=fixture();values.set('local-text-pilot-request:'+projectId,JSON.stringify({version:1,projectId,conversationId,idempotencyKey:requestId,expiresAt:'2026-10-16T00:00:00Z'}));let dispatched=false
 await expect(api.queueLocalTextPilot(projectId,{store,now:()=>Date.parse('2026-10-17T00:00:00Z'),randomUUID:()=>requestId,createConversation:async()=>{throw Error('must not create')},send:async()=>{dispatched=true;throw Error()}})).rejects.toThrow('PILOT_REQUEST_EXPIRED')
 expect(dispatched).toBe(false);expect([...values.values()].join('')).not.toContain(conversationId);expect([...values.values()].join('')).not.toContain(requestId)
})
