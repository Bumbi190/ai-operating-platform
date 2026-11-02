import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),cancel:vi.fn()}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:mock.access}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('./store',()=>({readCampaign:mock.read,cancelCampaign:mock.cancel}))
import {campaignApi} from './api'
const id='11111111-1111-4111-8111-111111111111'
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({ok:true,userId:id,allowedProjectIds:[id]});mock.read.mockResolvedValue({id,status:'queued'});mock.cancel.mockResolvedValue({id,status:'cancelled'})})
it('returns private owned status and rejects extra query authority',async()=>{const response=await campaignApi(new Request('https://omniraos.se/api/social/campaign?projectId='+id+'&campaignId='+id));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toMatchObject({status:'queued'});expect((await campaignApi(new Request('https://omniraos.se/api/social/campaign?projectId='+id+'&campaignId='+id+'&approved=true'))).status).toBe(400)})
it('refuses unsigned source mutation and oversized/forged cancel body before database writes',async()=>{
 const url='https://omniraos.se/api/social/campaign'
 for(const request of [new Request(url,{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}),new Request(url,{method:'POST',headers:{origin:'https://omniraos.se','content-type':'application/json'},body:'x'.repeat(5000)}),new Request(url,{method:'POST',headers:{origin:'https://omniraos.se','content-type':'application/json'},body:JSON.stringify({projectId:id,campaignId:id,approved:true})})]){
 expect((await campaignApi(request)).status).toBeGreaterThanOrEqual(400)
 }
 expect(mock.cancel).not.toHaveBeenCalled()
})
it('an unauthenticated caller does not reach the service role store',async()=>{mock.access.mockResolvedValue({ok:false,response:new Response('',{status:401})});expect((await campaignApi(new Request('https://omniraos.se/api/social/campaign'))).status).toBe(401);expect(mock.read).not.toHaveBeenCalled()})
