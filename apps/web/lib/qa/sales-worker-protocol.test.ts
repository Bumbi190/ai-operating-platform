import {describe,it,expect,vi} from 'vitest'
import {createSalesWorkerApi} from '@/lib/sales/worker-protocol'
const projectId='10000000-0000-4000-8000-000000000001',token='a'.repeat(43)
function setup(){const rpc=vi.fn(async(name:string)=>name==='sales_worker_identity'?{data:{projectId},error:null}:{data:{ref:null},error:null});return {rpc,api:createSalesWorkerApi({db:()=>({rpc} as never),enabled:()=>true})}}
function req(body:unknown,bearer=token){return new Request('https://omnira.example/api/sales/worker',{method:'POST',headers:{authorization:'Bearer '+bearer},body:JSON.stringify(body)})}
describe('worker sales protocol',()=>{
 it('rejects missing/invalid bearer before database access',async()=>{const {api,rpc}=setup();expect((await api(req({operation:'claim'},'bad'))).status).toBe(401);expect(rpc).not.toHaveBeenCalled()})
 it('passes only a hash to database',async()=>{const {api,rpc}=setup();expect((await api(req({operation:'claim'}))).status).toBe(200);expect(JSON.stringify(rpc.mock.calls)).not.toContain(token)})
 it('rejects extra fields rather than proxying commands',async()=>{const {api}=setup();expect((await api(req({operation:'claim',command:'send everything'}))).status).toBe(400)})
 it('rejects unknown operations',async()=>{const {api}=setup();expect((await api(req({operation:'send'}))).status).toBe(400)})
 it('honors revoked credentials reported by database',async()=>{const {api,rpc}=setup();rpc.mockResolvedValueOnce({data:null as never,error:{code:'P0002'} as never});expect((await api(req({operation:'claim'}))).status).toBe(404)})
 it('does not claim when feature is off',async()=>{const rpc=vi.fn().mockResolvedValue({data:{projectId},error:null});const api=createSalesWorkerApi({db:()=>({rpc} as never),enabled:()=>false});expect((await api(req({operation:'claim'}))).status).toBe(404);expect(rpc).toHaveBeenCalledTimes(1)})
})
