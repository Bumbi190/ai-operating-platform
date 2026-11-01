import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {initializeWorkerDb,testSql,TEST_AGENT,TEST_PROJECT,TEST_PRINCIPAL} from '../test-db'
import {saveWebsitePlanRevision,readWebsitePlan,approveWebsiteMockup,readWebsiteMockupArtifact,approveWebsitePlan,startApprovedWebsitePlan,setProjectWebsiteBuilder} from './store'
import {appendBuildFeedback,readBuildSession,readBuildArtifact} from '../store'
import {executeWebsiteBuildRun} from '../worker'
import {hashPlanContent} from './validation'
import type {PlanContent,PlanView} from './types'
import type {BuildSessionView,WebsiteDraft} from '../types'
import type {Run} from '@/lib/supabase/types'
const provider=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/runner',()=>({runStep:provider}))
let db:ReturnType<typeof initializeWorkerDb>
const visual={palette:{background:'#101827',foreground:'#f4f1ea',accent:'#62d6bb'},font:'sans' as const}
const planContent=():PlanContent=>({title:'Demo Motors',purpose:'Visa fiktiva konceptbilar',audience:'Bilintresserade',pages:[{key:'home',title:'Hem',purpose:'Introduktion'},{key:'lager',title:'Lager',purpose:'Exempelbilar'},{key:'kontakt',title:'Kontakt',purpose:'Demokontakt'}],design:{style:'Mörk premium',reference:null,visual:structuredClone(visual)},features:[],architecture:'Statisk demonstration',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}})
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'"
beforeAll(()=>{db=initializeWorkerDb()},30000)
beforeEach(()=>provider.mockReset())
async function proposal(){
 const conversationId=randomUUID()
 testSql(`insert into conversations(id,user_id,project_id) values(${q(conversationId)},${q(TEST_PRINCIPAL.userId)},${q(TEST_PROJECT)});`)
 await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT})
 return saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId,expectedRevisionId:null,idempotencyKey:randomUUID(),content:planContent()})
}
function selection(p:PlanView){const m=p.designReview!.options[1];return {...p.currentRevision,mockupId:m.id,mockupSha256:m.sha256,idempotencyKey:randomUUID()}}
async function approved(p:PlanView){const reviewed=await approveWebsiteMockup(db,TEST_PRINCIPAL,selection(p));return approveWebsitePlan(db,TEST_PRINCIPAL,{...p.currentRevision,mockupDecisionId:reviewed.designReview!.approved!.id,idempotencyKey:randomUUID()})}
function claim(s:BuildSessionView):Run{
 testSql(`update runs set status='running',claim_id=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=(select current_run_id from website_build_sessions where id=${q(s.sessionId)});`)
 return JSON.parse(testSql(`select to_jsonb(r) from runs r where id=(select current_run_id from website_build_sessions where id=${q(s.sessionId)});`))
}
const draft=(accent:string):WebsiteDraft=>({format:'static-website.v1',title:'Demo Motors',css:`:root{--accent:${accent}}body{background:#101827;color:#f4f1ea}h1{color:var(--accent)}`,pages:planContent().pages.map(p=>({key:p.key==='home'?'index':p.key,title:p.title,bodyHtml:`<main><h1>${p.title}</h1><p>Fiktiv demonstration. Ingen verklig försäljning.</p></main>`,behaviors:[]}))})
const response=(value:unknown)=>({content:JSON.stringify(value),tokensIn:1,tokensOut:1,durationMs:1,authorityRefreshRequired:false})

describe('visual plan real PostgreSQL roundtrip (synthetic auth; provider stub)',()=>{
 it('retains exact visual data, hashes and three mockups after a database reload',async()=>{
  const p=await proposal(),loaded=await readWebsitePlan(db,TEST_PRINCIPAL,p.ref)
  expect(loaded.currentRevision.content.design.visual).toEqual(visual)
  expect(loaded.currentRevision.sha256).toBe(hashPlanContent(planContent()))
  expect(loaded.designReview!.options).toEqual(p.designReview!.options)
  expect(loaded.designReview!.options).toHaveLength(3)
  const stored=JSON.parse(testSql(`select canonical_content from website_build_plan_revisions where id=${q(p.currentRevision.revisionId)};`))
  expect(stored.design.visual).toEqual(visual)
  const artifact=await readWebsiteMockupArtifact(db,TEST_PRINCIPAL,selection(loaded))
  expect(artifact.pages[0].html).toContain('--accent:#62d6bb')
  expect(artifact.pages[0].html).toContain('font-family:system-ui,sans-serif')
  expect(provider).not.toHaveBeenCalled()
 },30000)
 it('a palette revision invalidates old approvals without rewriting old data',async()=>{
  const p=await proposal(),oldSelection=selection(p),old=await readWebsiteMockupArtifact(db,TEST_PRINCIPAL,oldSelection)
  await approved(p)
  const changed=structuredClone(p.currentRevision.content);changed.design.visual!.palette.accent='#e3aa63'
  const next=await saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId:p.conversationId,planId:p.ref.planId,expectedRevisionId:p.currentRevision.revisionId,content:changed,idempotencyKey:randomUUID()})
  expect(next.currentRevision.sha256).not.toBe(p.currentRevision.sha256)
  expect(next.currentRevision.content.pages).toEqual(p.currentRevision.content.pages)
  expect(next.designReview!.approved).toBeNull();expect(next.approvedDecision).toBeNull()
  await expect(approveWebsiteMockup(db,TEST_PRINCIPAL,oldSelection)).rejects.toMatchObject({code:'PLAN_STALE'})
  await expect(approveWebsitePlan(db,TEST_PRINCIPAL,{...next.currentRevision,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'MOCKUP_REVIEW_REQUIRED'})
  const original=JSON.parse(testSql(`select canonical_content from website_build_plan_revisions where id=${q(p.currentRevision.revisionId)};`))
  expect(original.design.visual).toEqual(visual)
  expect(old.pages[0].html).toContain('--accent:#62d6bb')
  const updated=await readWebsiteMockupArtifact(db,TEST_PRINCIPAL,selection(next))
  expect(updated.pages[0].html).toContain('--accent:#e3aa63')
  expect(updated.sha256).not.toBe(old.sha256)
 },30000)
 it('refuses another owner even if their principal claims access to this project',async()=>{
  const p=await proposal(),other={userId:'20000000-0000-4000-8000-000000000002',allowedProjectIds:[TEST_PROJECT]}
  await expect(readWebsitePlan(db,other,p.ref)).rejects.toMatchObject({code:'NOT_FOUND'})
  await expect(readWebsiteMockupArtifact(db,other,selection(p))).rejects.toMatchObject({code:'NOT_FOUND'})
  await expect(approveWebsiteMockup(db,other,selection(p))).rejects.toMatchObject({code:'NOT_FOUND'})
  expect((await readWebsitePlan(db,TEST_PRINCIPAL,p.ref)).designReview!.approved).toBeNull()
 },30000)
 it('pins approved style, builds once and applies a color change as a second immutable revision',async()=>{
  const p=await proposal(),decision=await approved(p)
  const s=await startApprovedWebsitePlan(db,TEST_PRINCIPAL,{...p.currentRevision,decisionId:decision.id})
  const again=await startApprovedWebsitePlan(db,TEST_PRINCIPAL,{...p.currentRevision,decisionId:decision.id})
  expect(again.sessionId).toBe(s.sessionId)
  const pinned=JSON.parse(testSql(`select design_reference from website_build_sessions where id=${q(s.sessionId)};`))
  expect(JSON.parse(pinned.canonicalDraft).css).toContain('--accent:#62d6bb')
  provider.mockResolvedValueOnce(response(draft('#62d6bb')))
  const run=claim(s);await executeWebsiteBuildRun(db,run,run.claim_id!)
  const first=await readBuildSession(db,TEST_PRINCIPAL,s)
  expect(first.status).toBe('ready');expect(first.revisions).toHaveLength(1)
  const original=await readBuildArtifact(db,TEST_PRINCIPAL,s,first.activePreviewRevisionId!)
  expect(original.pages.map(p=>p.key).sort()).toEqual(['index','kontakt','lager'])
  expect(JSON.parse(provider.mock.calls[0][0].userMessage).designReference.draft.css).toContain('--accent:#62d6bb')
  const feedback=await appendBuildFeedback(db,TEST_PRINCIPAL,s,{idempotencyKey:randomUUID(),text:'Ändra bara accentfärgen till #e3aa63. Behåll alla sidor och texter.',inputSource:'text',viewedRevisionId:first.activePreviewRevisionId})
  provider.mockResolvedValueOnce(response({items:[{feedbackId:feedback.id,summary:'Ändrar endast accentfärgen.',disposition:'apply',changeKey:'theme.accent',supersedesFeedbackIds:[]}]})).mockResolvedValueOnce(response(draft('#e3aa63')))
  const secondRun=claim(await readBuildSession(db,TEST_PRINCIPAL,s));await executeWebsiteBuildRun(db,secondRun,secondRun.claim_id!)
  const final=await readBuildSession(db,TEST_PRINCIPAL,s),updated=await readBuildArtifact(db,TEST_PRINCIPAL,s,final.activePreviewRevisionId!)
  expect(final.status).toBe('ready');expect(final.revisions).toHaveLength(2)
  expect(final.feedback.find(f=>f.id===feedback.id)).toMatchObject({status:'applied',appliedRevisionId:final.activePreviewRevisionId})
  expect(updated.pages.map(p=>p.key)).toEqual(original.pages.map(p=>p.key))
  for(let i=0;i<updated.pages.length;i++)expect(updated.pages[i].html.replaceAll('#e3aa63','#62d6bb')).toBe(original.pages[i].html)
  expect(await readBuildArtifact(db,TEST_PRINCIPAL,s,first.activePreviewRevisionId!)).toEqual(original)
  expect(provider).toHaveBeenCalledTimes(3)
 },90000)
})
