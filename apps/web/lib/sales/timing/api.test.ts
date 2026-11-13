import {it,expect,vi} from 'vitest'
import {createTimingApi} from './api'
const pid='10000000-0000-4000-8000-000000000001',cid='30000000-0000-4000-8000-000000000001',uid='20000000-0000-4000-8000-000000000001'
const principal={ok:true as const,userId:uid,allowedProjectIds:[pid]}
const report={projectId:pid,contacts:[],rules:null,customerSendingEnabled:false}
function setup(error=false){const rpc=vi.fn(async(name:string)=>({data:error?null:name==='sales_timing_read'?report:{id:cid},error:error?{code:'XX000'}:null}));return {rpc,api:createTimingApi({access:async()=>principal,db:()=>({rpc} as never),enabled:()=>true})}}
const url='https://fixture.invalid/api/sales/timing'
const rules={operation:'save_rules',projectId:pid,idempotencyKey:cid,expectedPreviousId:null,minWaitSeconds:1209600,maxReminders:1,maxSourceAgeSeconds:900,confirmed:true}
it('GET is one read with private headers and preserves missing history',async()=>{const {api,rpc}=setup();const r=await api(new Request(url+'?projectId='+pid));expect(r.status).toBe(200);expect(await r.json()).toEqual(report);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_timing_read'])})
it.each(['&projectId='+pid,'&now=2026-10-19','&contactId='+cid+'&contactId='+cid])('rejects duplicate/unknown query fields %s',async(s)=>{const {api,rpc}=setup();expect((await api(new Request(url+'?projectId='+pid+s))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()})
it('writes require same origin',async()=>{const {api,rpc}=setup();expect((await api(new Request(url,{method:'POST',body:JSON.stringify(rules)}))).status).toBe(403);expect(rpc).not.toHaveBeenCalled()})
it('canonical save returns revision and freshly read timing only after explicit confirmation',async()=>{const {api,rpc}=setup();const r=await api(new Request(url,{method:'POST',headers:{origin:'https://fixture.invalid'},body:JSON.stringify(rules)}));expect(r.status).toBe(200);expect(await r.json()).toEqual({revision:{id:cid},timing:report});expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_timing_save_rules','sales_timing_read'])})
it.each([{...rules,confirmed:false},{...rules,now:'x'},{...rules,operation:'send'},{...rules,projectId:cid}])('refuses invalid/foreign mutation before writes',async value=>{const {api,rpc}=setup();expect((await api(new Request(url,{method:'POST',headers:{origin:'https://fixture.invalid'},body:JSON.stringify(value)}))).status).not.toBe(200);expect(rpc).not.toHaveBeenCalled()})
it('read failure is unavailable, never zero',async()=>{const {api}=setup(true);const r=await api(new Request(url+'?projectId='+pid));expect(r.status).toBe(503);expect(await r.json()).toEqual({code:'UNAVAILABLE'})})
