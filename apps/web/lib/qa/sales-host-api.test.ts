import {describe,it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {createSalesHostApi} from '@/lib/sales/host-api'
import {createSalesApi} from '@/lib/sales/api'
const projectId='10000000-0000-4000-8000-000000000001',workerId='60000000-0000-4000-8000-000000000001',ownerId='20000000-0000-4000-8000-000000000001'
const secret='x'.repeat(43),hash=createHash('sha256').update(secret).digest('hex')
const principal={ownerId,projectId,workerId,generation:2}
const status={workerId,managed:true,generation:2,desiredState:'running',connectionState:'online',cliState:'ready',lastSeenAt:null,workerExpiresAt:'2026-10-18T13:00:00Z',executionPaused:false,reconnectRequested:false}
function setup(enabled=true){const rpc=vi.fn(async(name:string,_args?:Record<string,unknown>)=>({data:name.endsWith('identity')?principal:name==='sales_host_rotate'?{generation:3,expiresAt:'2026-10-18T13:00:00Z'}:name==='sales_host_adopt'?{workerId,generation:2,expiresAt:'2026-10-18T13:00:00Z'}:status,error:null}));return {rpc,api:createSalesHostApi({db:()=>({rpc} as never),enabled:()=>enabled})}}
function req(body:unknown,token=secret){return new Request('https://omnira.example/api/sales/host',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(body)})}
describe('bounded managed host API',()=>{
 it.each([{operation:'poll'},{operation:'report_status',generation:2,cliState:'ready'},{operation:'rotate',rotationId:'70000000-0000-4000-8000-000000000001',newTokenHash:'a'.repeat(64),expectedGeneration:2},{operation:'adopt',managerTokenHash:'a'.repeat(64)}])('accepts only the right credential purpose %j',async body=>{const {api,rpc}=setup();rpc.mockImplementation(async name=>({data:null as never,error:{code:'P0002'} as never}));expect((await api(req(body))).status).toBe(404)})
 it('hashes bearer and exposes only bounded status',async()=>{const {api,rpc}=setup();const r=await api(req({operation:'poll'}));expect(r.status).toBe(200);expect(await r.json()).toEqual(status);expect(rpc.mock.calls[0]).toEqual(['sales_host_identity',{p_token_hash:hash}]);expect(JSON.stringify(rpc.mock.calls)).not.toContain(secret);expect(r.headers.get('cache-control')).toContain('no-store')})
 it('uses normal worker identity only for adopt',async()=>{const {api,rpc}=setup();expect((await api(req({operation:'adopt',managerTokenHash:'a'.repeat(64)}))).status).toBe(200);expect(rpc.mock.calls[0][0]).toBe('sales_worker_identity')})
 it('fences rotation with exact generation and fixed receipt',async()=>{const {api,rpc}=setup();const r=await api(req({operation:'rotate',rotationId:'70000000-0000-4000-8000-000000000001',newTokenHash:'a'.repeat(64),expectedGeneration:2}));expect(await r.json()).toEqual({generation:3,expiresAt:'2026-10-18T13:00:00Z'});expect(rpc.mock.calls[1][0]).toBe('sales_host_rotate')})
 it.each([{operation:'poll',projectId},{operation:'poll',workerId},{operation:'poll',command:'whoami'},{operation:'adopt',managerTokenHash:'x'},{operation:'rotate',rotationId:workerId,newTokenHash:'a'.repeat(64),expectedGeneration:0},{operation:'report_status',generation:2,cliState:'invented'}])('rejects altered or invalid fields %j',async body=>{expect((await setup().api(req(body))).status).toBe(400)})
 it('keeps default-off projects inaccessible',async()=>{const {api,rpc}=setup(false);expect((await api(req({operation:'poll'}))).status).toBe(404);expect(rpc).toHaveBeenCalledTimes(1)})
 it('rejects invalid raw credentials',async()=>{const {api,rpc}=setup();expect((await api(req({operation:'poll'},'short'))).status).toBe(401);expect(rpc).not.toHaveBeenCalled()})
 it('rejects oversized bodies and malformed UTF-8',async()=>{const {api}=setup();expect((await api(req({operation:'poll',x:'a'.repeat(65536)}))).status).toBe(400);expect((await api(new Request('https://omnira.example/api/sales/host',{method:'POST',headers:{authorization:'Bearer '+secret},body:new Uint8Array([255])}))).status).toBe(400)})
 it('does not leak private RPC fields in status',async()=>{const {api,rpc}=setup();rpc.mockImplementation(async name=>({data:name.endsWith('identity')?principal:{...status,manager_token_hash:hash,token:'PRIVATE'},error:null}));const text=await (await api(req({operation:'poll'}))).text();expect(text).not.toContain(hash);expect(text).not.toContain('PRIVATE')})
 it('sanitizes revoked/owner-changed failures',async()=>{const {api,rpc}=setup();rpc.mockImplementation(async()=>({data:null as never,error:{code:'P0002',message:secret} as never}));const r=await api(req({operation:'poll'}));expect(await r.json()).toEqual({code:'NOT_FOUND'})})
})
describe('managed owner operations',()=>{
 function api(){return createSalesApi({db:()=>({rpc:async()=>({data:status,error:null})} as never),enabled:()=>true,access:async()=>({ok:true,userId:ownerId,allowedProjectIds:[projectId]})})}
 function ownerReq(operation:string,origin='https://omnira.example'){return new Request('https://omnira.example/api/sales',{method:'POST',headers:{origin},body:JSON.stringify({operation,projectId,workerId,...(operation==='set_worker_desired'?{action:'pause'}:{})})})}
 it.each(['authorize_managed_worker','set_worker_desired'])('permits explicit owner action %s',async op=>expect((await api()(ownerReq(op))).status).toBe(200))
 it('requires same-origin owner session',async()=>expect((await api()(ownerReq('authorize_managed_worker','https://evil.example'))).status).toBe(403))
})
