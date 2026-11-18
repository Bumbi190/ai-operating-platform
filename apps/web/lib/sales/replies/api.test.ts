import {describe,it,expect} from 'vitest'
import {createReplyApi} from './api'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,principal={userId:id(2),allowedProjectIds:[id(1)]}
const input={projectId:id(1),conversationId:id(3),messageId:id(4),messageVersion:1,contactId:id(5),contactVersion:1,offerRevisionId:id(6),idempotencyKey:id(7)}
const request=(v:unknown,origin='https://owner.invalid')=>new Request('https://owner.invalid/api/sales/replies',{method:'POST',headers:{origin},body:JSON.stringify(v)})
function fixture(errorCode?:string){const calls:any[]=[];const api=createReplyApi({access:async()=>({ok:true as const,...principal}),enabled:(p:string)=>p===id(1),db:()=>({rpc:async(n:string,a:unknown)=>{calls.push([n,a]);return errorCode?{data:null,error:{code:errorCode}}:{data:{jobs:[],drafts:[],sendingEnabled:false},error:null}}}) as never});return {api,calls}}
describe('owner reply API',()=>{
 it('requires session, owner and same origin before privileged SQL',async()=>{const {api,calls}=fixture();expect((await api(request({operation:'prepare',...input},'https://foreign.invalid'))).status).toBe(403);expect((await api(request({operation:'prepare',...input,projectId:id(9)}))).status).toBe(404);expect(calls).toHaveLength(0)})
 it('strictly bounds queries and never exposes a send action',async()=>{const {api,calls}=fixture();expect((await api(new Request('https://owner.invalid/api/sales/replies?projectId='+id(1)+'&projectId='+id(1)))).status).toBe(400);expect((await api(request({operation:'send',projectId:id(1)}))).status).toBe(400);expect(calls).toHaveLength(0)})
 it('forwards only a validated prepare request with bound conversation',async()=>{const {api,calls}=fixture();const r=await api(request({operation:'prepare',...input}));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(calls).toEqual([['sales_reply_prepare',{p_principal:{ok:true,...principal},p_input:input}]])})
 it('stale_revision_cannot_approve and cannot silently switch to latest',async()=>{const {api,calls}=fixture('23505');const r=await api(request({operation:'review',projectId:id(1),revisionId:id(8),expectedHash:'a'.repeat(64),decision:'approved'}));expect(r.status).toBe(409);expect(await r.json()).toEqual({code:'REVISION_CONFLICT'});expect(calls[0][1].p_input.revisionId).toBe(id(8))})
})
