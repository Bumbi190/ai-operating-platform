import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({worker:vi.fn(),legacy:vi.fn(),marketing:vi.fn(),final:vi.fn(),checkpoint:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:mock.rpc})}))
vi.mock('./worker',()=>({isCampaignRun:(k:unknown)=>k==='social.campaign.image.v1',executeCampaignImageRun:mock.worker}))
vi.mock('@/lib/ai/workflow-runner',()=>({runSteps:mock.legacy}))
vi.mock('@/lib/ai/workflow-executor',()=>({executeRunSteps:mock.legacy}))
vi.mock('@/lib/ai/checkpoint',()=>({computeCheckpoint:vi.fn()}))
vi.mock('@/lib/local-text/incidents',()=>({reconcileLocalTextHealth:vi.fn(),purgeExpiredLocalText:vi.fn()}))
vi.mock('@/lib/local-text/cloud-runs',()=>({executeLocalTextCloudRun:vi.fn()}))
vi.mock('@/lib/marketing/workflows',()=>({isMarketingRun:()=>false,MARKETING_HANDLERS:{}}))
vi.mock('@/lib/website-build/worker',()=>({isWebsiteBuildRun:()=>false,executeWebsiteBuildRun:vi.fn(),isWebsiteBuildPermanentError:()=>false}))
vi.mock('@/lib/workflows/action-executor',()=>({isWorkflowActionRun:()=>false,executeWorkflowAction:vi.fn()}))
vi.mock('@/lib/governance/run-execution-checkpoint',()=>({checkpointClaimedRun:mock.checkpoint,checkOwnedFinalization:mock.final,settleRefusal:vi.fn(),terminalizeCancelledRun:vi.fn(),recordDispatchUnknown:vi.fn(),isRunCheckpointRefusal:()=>false,isRunLifecycleWriteError:()=>false,finalizeOwnedRunUnlessCancelled:vi.fn()}))
vi.mock('@/lib/email/brevo',()=>({sendAdminNotification:vi.fn()}))
vi.mock('@/lib/atlas/memory/record-event',()=>({isMemoryEnabled:()=>false,recordMemoryEvent:vi.fn()}))
import {GET} from '@/app/api/runs/drain/route'
const run={id:'run',kind:'social.campaign.image.v1',project_id:'project',claim_id:'claim'}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','campaign-test-only');mock.rpc.mockResolvedValue({data:[run],error:null});mock.checkpoint.mockResolvedValue({allowed:true});mock.worker.mockResolvedValue('uncertain')})
it('actual drain dispatches campaign kind with finite invocation deadline, never to a generic agent',async()=>{
 const now=Date.now(),response=await GET(new Request('https://example/api/runs/drain',{headers:{authorization:'Bearer campaign-test-only'}}))
 expect(response.status).toBe(200);expect(mock.worker).toHaveBeenCalledTimes(1)
 expect(mock.worker.mock.calls[0].slice(1,3)).toEqual([run,'claim'])
 expect(mock.worker.mock.calls[0][3]).toBeGreaterThanOrEqual(now+299000)
 expect(mock.legacy).not.toHaveBeenCalled();expect(mock.final).not.toHaveBeenCalled()
 expect(await response.json()).toMatchObject({results:[{run_id:'run',status:'uncertain'}]})
})
it('cron authorization and native checkpoint precede every image worker',async()=>{
 expect((await GET(new Request('https://example/api/runs/drain'))).status).toBe(401);expect(mock.worker).not.toHaveBeenCalled()
 mock.checkpoint.mockResolvedValue({allowed:false,refusal:'FENCED',detail:'reclaimed'})
 await GET(new Request('https://example/api/runs/drain',{headers:{authorization:'Bearer campaign-test-only'}}));expect(mock.worker).not.toHaveBeenCalled()
})

it('the campaign worker owns its native finalization and a ready receipt is not finalized twice',async()=>{
 mock.worker.mockResolvedValue('review_ready')
 const response=await GET(new Request('https://example/api/runs/drain',{headers:{authorization:'Bearer campaign-test-only'}}))
 expect(await response.json()).toMatchObject({results:[{status:'review_ready'}]})
 expect(mock.final).not.toHaveBeenCalled()
})
