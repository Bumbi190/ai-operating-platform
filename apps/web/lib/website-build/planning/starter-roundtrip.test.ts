import {beforeAll,beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {initializeWorkerDb,testSql,TEST_PROJECT,TEST_AGENT,TEST_PRINCIPAL} from '../test-db'
import {handleWebsitePlanningTool} from './chat-tools'
import {readWebsitePlan,setProjectWebsiteBuilder,approveWebsitePlan,approveWebsiteMockup,readWebsiteMockupArtifact,startApprovedWebsitePlan} from './store'
import {appendBuildFeedback,readBuildSession,readBuildArtifact} from '../store'
import {executeWebsiteBuildRun} from '../worker'
import type {PlanContent,PlanView} from './types'
import type {BuildSessionView,WebsiteDraft} from '../types'
import type {Run} from '@/lib/supabase/types'
const provider=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/runner',()=>({runStep:provider}))
let db:ReturnType<typeof initializeWorkerDb>
beforeAll(()=>{db=initializeWorkerDb()},30000)
beforeEach(()=>provider.mockReset())
const content:PlanContent={title:'Handlarbörsen',purpose:'En fiktiv bilhandlardemo',audience:'Bilhandlare',pages:[{key:'home',title:'Hem',purpose:'Showroom och exempelbilar'}],design:{style:'Mörk premium',reference:null,starter:'premium-dealer-demo-v1'},features:[{name:'Filter',mode:'preview_demo',provider:null}],architecture:'Endast statisk demonstration',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'"
async function proposal(){
 const conversationId=randomUUID()
 testSql(`insert into conversations(id,user_id,project_id) values(${q(conversationId)},${q(TEST_PRINCIPAL.userId)},${q(TEST_PROJECT)});`)
 await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT})
 const value=await handleWebsitePlanningTool('draft_website_build_plan',{projectId:TEST_PROJECT,content,expectedRevisionId:null,idempotencyKey:randomUUID()},TEST_PRINCIPAL,conversationId,db) as PlanView
 expect(value).not.toHaveProperty('error');return value
}
function selection(p:PlanView){const m=p.designReview!.options.find(m=>m.key==='visual')!;return {...p.currentRevision,mockupId:m.id,mockupSha256:m.sha256,idempotencyKey:randomUUID()}}
async function start(p:PlanView){const review=await approveWebsiteMockup(db,TEST_PRINCIPAL,selection(p));const decision=await approveWebsitePlan(db,TEST_PRINCIPAL,{...p.currentRevision,mockupDecisionId:review.designReview!.approved!.id,idempotencyKey:randomUUID()});return startApprovedWebsitePlan(db,TEST_PRINCIPAL,{...p.currentRevision,decisionId:decision.id})}
function claim(s:BuildSessionView):Run{testSql(`update runs set status='running',claim_id=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=(select current_run_id from website_build_sessions where id=${q(s.sessionId)});`);return JSON.parse(testSql(`select to_jsonb(r) from runs r where id=(select current_run_id from website_build_sessions where id=${q(s.sessionId)});`))}
const response=(value:unknown)=>({content:JSON.stringify(value),tokensIn:1,tokensOut:1,durationMs:1,authorityRefreshRequired:false})

describe('real SQL starter tool to build and edit; provider output is a fixture',()=>{
 it('saves a compact actual showroom through the real planning tool, retaining explicit approvals',async()=>{
  const p=await proposal(),loaded=await readWebsitePlan(db,TEST_PRINCIPAL,p.ref)
  expect(loaded.currentRevision.content.design.starter).toBe('premium-dealer-demo-v1')
  expect(loaded.designReview!.options).toHaveLength(3);expect(loaded.approvedDecision).toBeNull()
  await expect(approveWebsitePlan(db,TEST_PRINCIPAL,{...p.currentRevision,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'MOCKUP_REVIEW_REQUIRED'})
  const stored=JSON.parse(testSql(`select json_build_object('bytes',octet_length(canonical_draft),'draft',draft) from website_build_mockups where id=${q(selection(p).mockupId)};`))
  expect(stored.bytes).toBeLessThan(48000);expect(JSON.stringify(stored.draft)).not.toContain('base64,')
  const preview=await readWebsiteMockupArtifact(db,TEST_PRINCIPAL,selection(p));expect(preview.pages[0].html).toContain('data:image/webp;base64,');expect(preview.pages[0].html).toContain('8 av 8 visas')
  expect(provider).not.toHaveBeenCalled()
 },30000)
 it('worker restores exact approved image bytes, preserves them after feedback and rejects a foreign image handle',async()=>{
  const p=await proposal(),s=await start(p)
  const pinned=JSON.parse(testSql(`select design_reference from website_build_sessions where id=${q(s.sessionId)};`)),source=JSON.parse(pinned.canonicalDraft) as WebsiteDraft
  provider.mockImplementationOnce(async(args:any)=>{const request=JSON.parse(args.userMessage);expect(args.userMessage).not.toContain('base64,');expect(request.assets).toHaveLength(17);expect(Buffer.byteLength(args.userMessage)).toBeLessThan(48000);return response(source)})
  const firstRun=claim(s);await executeWebsiteBuildRun(db,firstRun,firstRun.claim_id!)
  const first=await readBuildSession(db,TEST_PRINCIPAL,s),artifact=await readBuildArtifact(db,TEST_PRINCIPAL,s,first.activePreviewRevisionId!)
  expect(first.status).toBe('ready');expect(artifact.pages[0].html).not.toContain('atlas-asset:')
  const images=artifact.pages[0].html.match(/src="data:image\/webp;base64,[^"]+"/g)!
  expect(images).toHaveLength(21);expect(new Set(images).size).toBe(17)
  const feedback=await appendBuildFeedback(db,TEST_PRINCIPAL,s,{idempotencyKey:randomUUID(),text:'Byt bara accentfärgen till #71d7ba. Behåll bilderna.',inputSource:'text',viewedRevisionId:first.activePreviewRevisionId})
  const edited={...source,css:source.css!.replaceAll('#efb563','#71d7ba')}
  provider.mockResolvedValueOnce(response({items:[{feedbackId:feedback.id,summary:'Ändrar färg och behåller bilder.',disposition:'apply',changeKey:'theme.accent',supersedesFeedbackIds:[]}]})).mockImplementationOnce(async(args:any)=>{expect(args.userMessage).not.toContain('base64,');expect(JSON.parse(args.userMessage).assets).toHaveLength(17);return response(edited)})
  const next=claim(s);await executeWebsiteBuildRun(db,next,next.claim_id!)
  const second=await readBuildSession(db,TEST_PRINCIPAL,s),changed=await readBuildArtifact(db,TEST_PRINCIPAL,s,second.activePreviewRevisionId!)
  expect(second.revisions).toHaveLength(2);expect(second.feedback.find(f=>f.id===feedback.id)?.status).toBe('applied')
  expect(changed.pages[0].html.match(/src="data:image\/webp;base64,[^"]+"/g)).toEqual(images)
  expect(changed.pages[0].html.replaceAll('#71d7ba','#efb563')).toBe(artifact.pages[0].html)
  expect(await readBuildArtifact(db,TEST_PRINCIPAL,s,first.activePreviewRevisionId!)).toEqual(artifact)
  const badFeedback=await appendBuildFeedback(db,TEST_PRINCIPAL,s,{idempotencyKey:randomUUID(),text:'Prova ett annat foto',inputSource:'text',viewedRevisionId:second.activePreviewRevisionId})
  const invalid=structuredClone(edited);invalid.pages[0].bodyHtml=invalid.pages[0].bodyHtml.replace(/atlas-asset:[a-f0-9]{64}/,'atlas-asset:'+'0'.repeat(64))
  provider.mockResolvedValueOnce(response({items:[{feedbackId:badFeedback.id,summary:'Försök till annan bild',disposition:'apply',changeKey:'hero.image',supersedesFeedbackIds:[]}]})).mockResolvedValueOnce(response(invalid))
  const bad=claim(s);await expect(executeWebsiteBuildRun(db,bad,bad.claim_id!)).rejects.toMatchObject({code:'INVALID_MODEL_IMAGE'})
  const after=await readBuildSession(db,TEST_PRINCIPAL,s);expect(after.revisions).toHaveLength(2);expect(after.activePreviewRevisionId).toBe(second.activePreviewRevisionId)
  expect(provider).toHaveBeenCalledTimes(5)
 },90000)
})
