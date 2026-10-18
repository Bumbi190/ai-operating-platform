
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
const s=vi.hoisted(()=>({auth:true,operator:true,allowed:true,calls:0}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>s.auth?{ok:true,userId:'owner',allowedProjectIds:s.allowed?['project']:[]}:{ok:false,response:Response.json({},{status:401})}}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>({ok:s.operator,userId:'owner'})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('./store',()=>({readSchedules:async()=>({projectId:'project',batches:[],monthlyRule:null,releaseEvidence:[]}),proposeSchedule:async()=>{s.calls++;return {}},approveSchedule:async()=>{s.calls++;return {}},revokeSchedule:async()=>{s.calls++;return {}},saveMonthlyRule:async()=>{s.calls++;return {}},recordReleaseEvidence:async()=>{s.calls++;return {}},scheduleDispatchEnabled:()=>false}))
vi.mock('./readiness',()=>({readScheduleReadiness:async()=>({ready:false,blockers:['dispatch_disabled'],nextJobs:[],dryRun:{jobId:null,result:'no_jobs'}})}))
import {socialSchedulesOwnerApi} from './owner-api'
beforeEach(()=>{s.auth=true;s.operator=true;s.allowed=true;s.calls=0;vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','false')})
afterEach(()=>vi.unstubAllEnvs())
const req=(body?:unknown,origin='http://localhost')=>new Request('http://localhost/api/social-schedules?projectId=project',body===undefined?{}:{method:'POST',headers:{origin,host:'localhost'},body:JSON.stringify(body)})
it('a reader cannot approve and all mutations require same origin and operator',async()=>{
 s.operator=false
 const view=await socialSchedulesOwnerApi(req());expect(await view.json()).toMatchObject({canManage:false,dispatchEnabled:false})
 expect((await socialSchedulesOwnerApi(req({operation:'approve',projectId:'project'}))).status).toBe(403)
 s.operator=true
 expect((await socialSchedulesOwnerApi(req({operation:'approve',projectId:'project'},'https://evil.test'))).status).toBe(403)
 expect(s.calls).toBe(0)
})
it('rejects unknown operations fields and oversized input without any write',async()=>{
 for(const body of [{operation:'dispatch',projectId:'project'},{operation:'approve',projectId:'project',token:'override'},{operation:'propose',projectId:'project',extra:'x'.repeat(40000)}])expect((await socialSchedulesOwnerApi(req(body))).status).toBe(400)
 expect(s.calls).toBe(0)
})

it('owner readiness is read only same-origin and project scoped',async()=>{
 const body={operation:'readiness',projectId:'project'}
 const good=await socialSchedulesOwnerApi(req(body))
 expect(good.status).toBe(200);expect(await good.json()).toMatchObject({ready:false,blockers:['dispatch_disabled']})
 expect(s.calls).toBe(0)
 s.operator=false;expect((await socialSchedulesOwnerApi(req(body))).status).toBe(403)
 s.operator=true;s.allowed=false;expect((await socialSchedulesOwnerApi(req(body))).status).toBe(404)
 expect((await socialSchedulesOwnerApi(req({...body,secret:'override'}))).status).toBe(400)
})
