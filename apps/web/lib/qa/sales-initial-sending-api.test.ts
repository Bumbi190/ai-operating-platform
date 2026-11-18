import {describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn()}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:vi.fn()}))
import {createInitialSendApi} from '../sales/initial-sending/api'
const pid='10000000-0000-4000-8000-000000000001',uid='20000000-0000-4000-8000-000000000001',rid='30000000-0000-4000-8000-000000000001',hid='40000000-0000-4000-8000-000000000001'
const input={projectId:pid,revisionId:rid,expectedRevisionHash:'a'.repeat(64),expectedMailboxGeneration:6,expectedHistoryRevisionId:hid,expectedRuleRevisionId:hid,expectedPolicyVersion:1,acceptHistoryGap:true,idempotencyKey:hid}
function fixture(enabled=true){const calls:{name:string;args:unknown}[]=[];const api=createInitialSendApi({access:async()=>({ok:true,userId:uid,allowedProjectIds:[pid]}) as never,db:()=>({rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:{id:hid,status:'queued'},error:null}}}) as never,enabled:()=>enabled});return {api,calls}}
function req(data:unknown,origin='https://app.example'){return new Request('https://app.example/api/sales/initial-sending',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)})}
describe('owner initial send boundary',()=>{
 it('requires same-origin even for an approved draft',async()=>{const f=fixture();expect((await f.api(req({operation:'confirm',...input},'https://evil.example'))).status).toBe(403);expect(f.calls).toHaveLength(0)})
 it('refuses recipient and body overrides before persistence',async()=>{for(const field of ['toEmail','body','senderEmail']){const f=fixture();expect((await f.api(req({operation:'confirm',...input,[field]:'override'}))).status).toBe(400);expect(f.calls).toHaveLength(0)}})
 it('never confirms when the initial-only feature is disabled',async()=>{const f=fixture(false);expect((await f.api(req({operation:'confirm',...input}))).status).toBe(404);expect(f.calls).toHaveLength(0)})
 it('reads disabled readiness without minting authority',async()=>{const f=fixture(false);const r=await f.api(new Request('https://app.example/api/sales/initial-sending?projectId='+pid+'&revisionId='+rid));expect(await r.json()).toEqual({available:false});expect(f.calls).toHaveLength(0)})
 it('rejects a foreign project before accessing data',async()=>{const f=fixture();expect((await f.api(req({operation:'confirm',...input,projectId:hid}))).status).toBe(404);expect(f.calls).toHaveLength(0)})
 it('passes only exact identities and explicit gap decision to initial authority',async()=>{const f=fixture();const r=await f.api(req({operation:'confirm',...input}));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({status:'queued'});expect(f.calls).toEqual([{name:'sales_initial_send_confirm',args:{p_principal:{ok:true,userId:uid,allowedProjectIds:[pid]},p_input:input}}])})
 it('GET previews but never queues',async()=>{const f=fixture();const r=await f.api(new Request('https://app.example/api/sales/initial-sending?projectId='+pid+'&revisionId='+rid));expect(r.status).toBe(200);expect(f.calls.map(c=>c.name)).toEqual(['sales_initial_send_preview'])})
 it('requires a real boolean gap decision and positive integer versions',async()=>{for(const patch of [{acceptHistoryGap:'true'},{expectedPolicyVersion:0},{expectedMailboxGeneration:true},{expectedHistoryRevisionId:null}]){const f=fixture();expect((await f.api(req({operation:'confirm',...input,...patch}))).status).toBe(400);expect(f.calls).toHaveLength(0)}})
})
