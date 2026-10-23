import {it,expect,vi,afterEach} from 'vitest'
// Existing behavioral tests opt into a simulated post-incident-clearance gate;
// production hard-stop behavior is tested independently in activation-fence.test.ts.
vi.mock('../activation-fence',()=>({localTextDispatchEnabled:()=>process.env.ATLAS_LOCAL_TEXT_ENABLED==='true'}))
const fixture=vi.hoisted(()=>({calls:0}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('@/lib/local-text/worker-api',()=>({executeWorkerRequest:async()=>{fixture.calls++;throw Error('private implementation detail must not escape')}}))
import {POST} from '@/app/api/local-text/worker/[operation]/route'
afterEach(()=>{vi.unstubAllEnvs();fixture.calls=0})
it('default disabled feature cannot dispatch a worker operation',async()=>{
 vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','');const response=await POST(new Request('https://omnira.example/api/local-text/worker/claim',{method:'POST'}),{params:{operation:'claim'}})
 expect(response.status).toBe(503);expect(fixture.calls).toBe(0)
})
it('unknown operation is refused and internal errors remain opaque',async()=>{
 vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true');const request=new Request('https://omnira.example/api/local-text/worker/unknown',{method:'POST'})
 expect((await POST(request,{params:{operation:'unknown'}})).status).toBe(404);expect(fixture.calls).toBe(0)
 const response=await POST(request,{params:{operation:'claim'}});expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('private implementation')
})
