import {it,expect,vi,beforeEach,afterEach} from 'vitest'
// Existing behavioral tests opt into a simulated post-incident-clearance gate;
// production hard-stop behavior is tested independently in activation-fence.test.ts.
vi.mock('../activation-fence',()=>({localTextDispatchEnabled:()=>process.env.ATLAS_LOCAL_TEXT_ENABLED==='true'}))
const f=vi.hoisted(()=>({operator:{ok:true,userId:'11111111-1111-4111-8111-111111111111'} as Record<string,unknown>,calls:[] as any[],profile:null as any}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>f.operator}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(...args:any[])=>{f.calls.push(args);return {data:{kind:'applied',value:{id:'11111111-1111-4111-8111-111111111111',status:'revoked',version:2}},error:null}}})}))
vi.mock('../cloud-profile',()=>({readCloudTextProfile:()=>f.profile}))
const {handleCloudBudgetRequest}=await import('../budget-api')
const id='11111111-1111-4111-8111-111111111111',body={action:'authorize',projectId:id,profileHash:'a'.repeat(64),expiresAt:'2099-01-01T00:00:00.000Z',jobCostCapUsd:0.25,dailyCostCapUsd:5}
function request(v:unknown,origin='https://omnira.example'){return new Request('https://omnira.example/api/local-text/admissions/'+id+'/cloud-budget',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(v)})}
beforeEach(()=>{f.operator={ok:true,userId:id};f.calls=[];f.profile=null;vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')})
afterEach(()=>vi.unstubAllEnvs())
it('caps and a guessed profile do not authorize spend',async()=>{expect((await handleCloudBudgetRequest(request(body),id)).status).toBe(409);expect(f.calls).toHaveLength(0);expect((await handleCloudBudgetRequest(request({...body,ownerId:id}),id)).status).toBe(400)})
it('revoke works while disabled and carries verified owner only',async()=>{vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','false');expect((await handleCloudBudgetRequest(request({action:'revoke',projectId:id,authorizationId:id,expectedVersion:1}),id)).status).toBe(200);expect(f.calls[0][1]).toEqual({p_owner_id:id,p_project_id:id,p_admission_id:id,p_action:'revoke',p_specification:{id,expectedVersion:1}})})
it('foreign origin or unauthenticated session cannot reach RPC',async()=>{expect((await handleCloudBudgetRequest(request(body,'https://evil.example'),id)).status).toBe(403);f.operator={ok:false,reason:'unauthenticated'};expect((await handleCloudBudgetRequest(request(body),id)).status).toBe(401);expect(f.calls).toHaveLength(0)})
