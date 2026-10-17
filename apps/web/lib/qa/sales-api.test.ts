import {describe,it,expect,vi} from 'vitest'
import {createSalesApi} from '@/lib/sales/api'
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002'
const contact={operation:'save_contact',projectId:id,id:'30000000-0000-4000-8000-000000000001',companyName:'Testbil',branchName:'Hässleholm',email:'info@example.se',websiteUrl:null,history:'not_contacted',historySource:'Manuellt kontrollerad',confirmed:true,excluded:false,suppressed:false,expectedVersion:0}
function setup(){const rpc=vi.fn().mockResolvedValue({data:{ok:true},error:null});const api=createSalesApi({access:async()=>({ok:true as const,userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[id]}),db:()=>({rpc} as never),enabled:p=>p===id});return {rpc,api}}
function req(value:unknown,origin='https://omnira.example'){return new Request('https://omnira.example/api/sales',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)})}
describe('operator sales API',()=>{
 it('requires same origin',async()=>{const {api,rpc}=setup();expect((await api(req(contact,'https://evil.example'))).status).toBe(403);expect(rpc).not.toHaveBeenCalled()})
 it('does not let an unrelated project through service-role',async()=>{const {api,rpc}=setup();expect((await api(req({...contact,projectId:other}))).status).toBe(404);expect(rpc).not.toHaveBeenCalled()})
 it('rejects malformed UTF-8',async()=>{const {api}=setup();expect((await api(new Request('https://omnira.example/api/sales',{method:'POST',headers:{origin:'https://omnira.example'},body:new Uint8Array([0xff])}))).status).toBe(400)})
 it('rejects oversized body',async()=>{const {api}=setup();expect((await api(req({text:'a'.repeat(65537)}))).status).toBe(400)})
 it('validates contact and preserves separate branch record',async()=>{const {api,rpc}=setup();expect((await api(req(contact))).status).toBe(200);expect(rpc.mock.calls[0][1].p_input.id).toBe(contact.id)})
 it('does not accept send or approval operations',async()=>{const {api,rpc}=setup();for(const operation of ['send','approve','autopilot'])expect((await api(req({projectId:id,operation}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()})
 it('does not pass user supplied principal to database',async()=>{const {api,rpc}=setup();expect((await api(req({...contact,userId:other}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()})
 it('enrolls an explicit worker with a hashed secret and private response',async()=>{const {api,rpc}=setup();const r=await api(req({projectId:id,operation:'enroll_worker'})),b=await r.json();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(b.token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(JSON.stringify(rpc.mock.calls)).not.toContain(b.token);expect(rpc.mock.calls[0][1].p_input.tokenHash).toMatch(/^[a-f0-9]{64}$/)})
})
