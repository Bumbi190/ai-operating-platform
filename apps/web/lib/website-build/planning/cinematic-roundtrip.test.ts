import {beforeAll,beforeEach,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {GET,POST} from '@/app/api/website-build/studio/cinematic-plan/route'
import {initializeWorkerDb,resetWorkerDb,testSql,TEST_PRINCIPAL,TEST_PROJECT,TEST_AGENT,TEST_CONVERSATION} from '../test-db'
import {approveWebsitePlan,startApprovedWebsitePlan,setProjectWebsiteBuilder,readWebsiteMockupArtifact} from './store'
import {approveTestMockup} from './test-fixture'
import {CINEMATIC_BINDING,compileCinematicArtifact} from '../studio/cinematic-binding'
import {executeWebsiteBuildRun} from '../worker'
import {readBuildSession,readBuildArtifact,appendBuildFeedback} from '../store'
import type {Run} from '@/lib/supabase/types'
import type {BuildSessionView} from '../types'
import type {PlanView} from './types'
const state=vi.hoisted(()=>({db:null as unknown,authenticated:true,allowed:true,provider:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.authenticated?{ok:true,...TEST_PRINCIPAL,allowedProjectIds:state.allowed?TEST_PRINCIPAL.allowedProjectIds:[]}:{ok:false,response:new Response(null,{status:401})}}))
vi.mock('@/lib/ai/runner',()=>({runStep:state.provider}))
let db:ReturnType<typeof initializeWorkerDb>,conversationId:string
beforeAll(()=>{db=initializeWorkerDb();state.db=db},30000)
beforeEach(()=>{resetWorkerDb();state.authenticated=true;state.allowed=true;state.provider.mockReset();conversationId=randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');")})
const body=()=>({projectId:TEST_PROJECT,conversationId,expectedRevisionId:null,expectedPackageSha:CINEMATIC_BINDING.sha256,idempotencyKey:randomUUID()})
const request=(input:unknown,origin='http://localhost')=>new Request('http://localhost/api/website-build/studio/cinematic-plan',{method:'POST',headers:{origin,host:'localhost','content-type':'application/json'},body:JSON.stringify(input)})
const response=(content:unknown)=>({content:JSON.stringify(content),tokensIn:100,tokensOut:80,durationMs:1,authorityRefreshRequired:false})
async function claim(s:BuildSessionView):Promise<Run>{
 testSql("update runs set status='running',claim_id=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=(select current_run_id from website_build_sessions where id='"+s.sessionId+"');")
 return JSON.parse(testSql("select to_jsonb(r) from runs r where id=(select current_run_id from website_build_sessions where id='"+s.sessionId+"');"))
}
async function build(){
 await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT})
 const saved=await POST(request(body()));expect(saved.status,await saved.clone().text()).toBe(201)
 const plan:PlanView=await saved.json()
 expect(plan.approvedDecision).toBeNull();expect(plan.activeSessionId).toBeNull()
 expect(plan.designReview!.options).toHaveLength(3)
 const option=plan.designReview!.options[1]
 const preview=await readWebsiteMockupArtifact(db,TEST_PRINCIPAL,{...plan.currentRevision,mockupId:option.id,mockupSha256:option.sha256})
 expect(preview.sha256).toBe(compileCinematicArtifact(CINEMATIC_BINDING).sha256)
 const reviewed=await approveTestMockup(db,TEST_PRINCIPAL,plan)
 const decision=await approveWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,mockupDecisionId:reviewed.designReview!.approved!.id,idempotencyKey:randomUUID()})
 const session=await startApprovedWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,decisionId:decision.id}),run=await claim(session)
 await executeWebsiteBuildRun(db,run,run.claim_id!)
 const view=await readBuildSession(db,TEST_PRINCIPAL,session)
 expect(view.status).toBe('ready');expect(state.provider).not.toHaveBeenCalled()
 return view
}
it('requires authentication, project ownership, same origin and current package; saves no approval',async()=>{
 state.authenticated=false;expect((await GET()).status).toBe(401);expect((await POST(request(body()))).status).toBe(401)
 state.authenticated=true;state.allowed=false;expect((await POST(request(body()))).status).toBe(404)
 state.allowed=true;expect((await POST(request(body(),'https://foreign.example'))).status).toBe(403)
 expect((await POST(request({...body(),expectedPackageSha:'0'.repeat(64)}))).status).toBe(409)
 expect((await POST(request({...body(),approvedBy:TEST_PRINCIPAL.userId}))).status).toBe(400)
 expect(testSql("select count(*) from website_build_plans where conversation_id='"+conversationId+"';")).toBe('0')
 const saved=await POST(request(body()));expect(saved.status,await saved.clone().text()).toBe(201)
 const p:PlanView=await saved.json()
 const next={...body(),planId:p.ref.planId,expectedRevisionId:p.currentRevision.revisionId}
 expect((await POST(request(next))).status).toBe(201)
 expect((await POST(request({...next,idempotencyKey:randomUUID()}))).status).toBe(409)
 expect(testSql("select count(*) from website_build_plan_decisions d join website_build_plans p on p.id=d.plan_id where p.conversation_id='"+conversationId+"';")).toBe('0')
 expect(testSql("select count(*) from website_build_sessions where conversation_id='"+conversationId+"';")).toBe('0')
},40000)
it('builds approved exact package, applies bounded feedback and preserves original revision',async()=>{
 const first=await build(),oldId=first.activePreviewRevisionId!,old=await readBuildArtifact(db,TEST_PRINCIPAL,first,oldId)
 const f=await appendBuildFeedback(db,TEST_PRINCIPAL,first,{idempotencyKey:randomUUID(),text:'Ändra Roadsterns knapptext till Boka en visning',inputSource:'text',viewedRevisionId:oldId})
 state.provider.mockResolvedValueOnce(response({items:[{feedbackId:f.id,summary:'Ändrar knapptexten.',disposition:'apply',changeKey:'roadster.cta',supersedesFeedbackIds:[]}]})).mockResolvedValueOnce(response({roadsterCta:'Boka en visning'}))
 const run=await claim(await readBuildSession(db,TEST_PRINCIPAL,first));await executeWebsiteBuildRun(db,run,run.claim_id!)
 const next=await readBuildSession(db,TEST_PRINCIPAL,first),updated=await readBuildArtifact(db,TEST_PRINCIPAL,first,next.activePreviewRevisionId!)
 expect(next.revisions).toHaveLength(2)
 expect(updated).toEqual(compileCinematicArtifact(CINEMATIC_BINDING,{roadsterCta:'Boka en visning'}))
 expect(updated.assets).toEqual(old.assets)
 expect(await readBuildArtifact(db,TEST_PRINCIPAL,first,oldId)).toEqual(old)
 expect(next.feedback[0].appliedRevisionId).toBe(next.activePreviewRevisionId)
 expect(state.provider.mock.calls.map(c=>c[0].cost.operation)).toEqual(['website.feedback.interpret','website.cinematic.copy'])
},60000)
it('parks unsupported edits before generation and never replaces the accepted media',async()=>{
 const first=await build(),f=await appendBuildFeedback(db,TEST_PRINCIPAL,first,{idempotencyKey:randomUUID(),text:'Byt film och lägg till betalning',inputSource:'text',viewedRevisionId:first.activePreviewRevisionId})
 state.provider.mockResolvedValueOnce(response({items:[{feedbackId:f.id,summary:'Byter film.',disposition:'apply',changeKey:'video',supersedesFeedbackIds:[]}]}))
 const run=await claim(first);await executeWebsiteBuildRun(db,run,run.claim_id!)
 const final=await readBuildSession(db,TEST_PRINCIPAL,first)
 expect(final.status).toBe('awaiting_decision');expect(final.revisions).toHaveLength(1);expect(state.provider).toHaveBeenCalledTimes(1)
},50000)
