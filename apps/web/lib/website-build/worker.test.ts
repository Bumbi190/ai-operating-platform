import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeWebsiteBuildRun } from './worker'
import { appendBuildFeedback, loadBuildSnapshot, readBuildArtifact, readBuildSession, requestBuildControl, recordBuildInterpretation, commitBuildRevision } from './store'
import { compileWebsiteArtifact } from './artifact'
import { approvedTestBuild } from './planning/test-fixture'
import { initializeWorkerDb, resetWorkerDb, testSql, TEST_AGENT, TEST_CONVERSATION, TEST_PRINCIPAL, TEST_PROJECT } from './test-db'
import type { Run } from '@/lib/supabase/types'
import type { BuildSessionView, WriterRef } from './types'
const provider = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai/runner', () => ({ runStep: provider }))
let db: ReturnType<typeof initializeWorkerDb>
const draft = (title = 'Vår idé') => ({ format: 'static-website.v1', title: 'Svensk hemsida', pages: [{ key: 'index', title: 'Hem', bodyHtml: `<h1>${title}</h1>`, css: 'h1{color:green}', behaviors: [] }] })
const response = (content: unknown) => ({ content: JSON.stringify(content), tokensIn: 100, tokensOut: 200, durationMs: 1, authorityRefreshRequired: false })
beforeAll(() => { db = initializeWorkerDb() }, 30_000)
beforeEach(() => { resetWorkerDb(); provider.mockReset(); provider.mockResolvedValue(response(draft())) })
async function session(): Promise<BuildSessionView> { return approvedTestBuild(db, TEST_PRINCIPAL, { projectId: TEST_PROJECT, agentId: TEST_AGENT, conversationId: TEST_CONVERSATION, brief: 'Bygg en svensk hemsida för mitt företag.', idempotencyKey: 'test-' + crypto.randomUUID() }) }
async function claim(view: BuildSessionView): Promise<Run> {
  testSql(`update runs set status='running',claim_id=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=(select current_run_id from website_build_sessions where id='${view.sessionId}');`)
  // Use direct SQL for JSON-path selection; the transport intentionally supports
  // only identifiers in generated queries.
  return JSON.parse(testSql(`select to_jsonb(r) from runs r where id=(select current_run_id from website_build_sessions where id='${view.sessionId}');`)) as Run
}
async function view(s: BuildSessionView) { return readBuildSession(db, TEST_PRINCIPAL, s) }
function writer(s: BuildSessionView, run: Run): WriterRef { return { projectId: s.projectId, sessionId: s.sessionId, runId: run.id, claimId: run.claim_id!, generation: (run.input as { generation: number }).generation } }
describe('durable website worker with real SQL', () => {
  it('commit_receipts_match_only_the_current_generation_interpretation', async () => {
    const s = await session()
    await requestBuildControl(db, TEST_PRINCIPAL, s, 'pause', 'receipt-pause')
    // Observe the worker's pause boundary for the queued initial unit.
    const initial = await claim(s); await executeWebsiteBuildRun(db, initial, initial.claim_id!)
    const a = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'old-ack', text: 'Gammal instruktion', inputSource: 'text', viewedRevisionId: null })
    const b = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'new-ack', text: 'Aktuell instruktion', inputSource: 'text', viewedRevisionId: null })
    const resumed = await requestBuildControl(db, TEST_PRINCIPAL, s, 'resume', 'receipt-resume'), run = await claim(resumed), w = writer(s, run)
    testSql(`update website_build_feedback set status='acknowledged',disposition='apply',interpretation='Tidigare accepterad' where id='${a.id}';`)
    await recordBuildInterpretation(db, w, { items: [{ feedbackId: b.id, summary: 'Aktuellt underlag', disposition: 'apply', changeKey: 'title', supersedesFeedbackIds: [] }] })
    await commitBuildRevision(db, w, compileWebsiteArtifact(draft('Aktuell instruktion')))
    const final = await view(s)
    expect(final.feedback.find(item => item.id === a.id)?.appliedRevisionId).toBeNull()
    expect(final.feedback.find(item => item.id === b.id)?.appliedRevisionId).toBe(final.activePreviewRevisionId)
  }, 30_000)
  it('mixed_apply_and_decision_survive_resolution_with_exact_revision_receipts', async () => {
    const s = await session(), first = await claim(s)
    await executeWebsiteBuildRun(db, first, first.claim_id!)
    await requestBuildControl(db, TEST_PRINCIPAL, s, 'pause', 'mix-pause')
    const a = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'mix-a', text: 'Gör rubriken större', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const b = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'mix-b', text: 'Kan sidan ta betalt?', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const resumed = await requestBuildControl(db, TEST_PRINCIPAL, s, 'resume', 'mix-resume'), run = await claim(resumed)
    provider.mockResolvedValueOnce(response({ items: [{ feedbackId: a.id, summary: 'Större rubrik', disposition: 'apply', changeKey: 'hero.title', supersedesFeedbackIds: [] }, { feedbackId: b.id, summary: 'Behöver besked om betalning', disposition: 'decision', changeKey: 'payments', supersedesFeedbackIds: [] }] }))
    await executeWebsiteBuildRun(db, run, run.claim_id!)
    expect((await view(s)).status).toBe('awaiting_decision')
    const c = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'mix-c', text: 'Ingen betalning, ändra färgen också', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const next = await claim(await view(s)), snap = await loadBuildSnapshot(db, writer(s, next))
    expect(snap.feedback.map(item => item.id)).toEqual([a.id, b.id, c.id])
    provider.mockResolvedValueOnce(response({ items: [{ feedbackId: a.id, summary: 'Större rubrik', disposition: 'apply', changeKey: 'hero.title', supersedesFeedbackIds: [] }, { feedbackId: b.id, summary: 'Betalning utgår', disposition: 'answer', changeKey: 'payments', supersedesFeedbackIds: [] }, { feedbackId: c.id, summary: 'Ändrar färgen', disposition: 'apply', changeKey: 'color', supersedesFeedbackIds: [] }] })).mockResolvedValueOnce(response(draft('Större rubrik med ny färg')))
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    const final = await view(s)
    expect(final.revisions).toHaveLength(2)
    for (const id of [a.id, c.id]) expect(final.feedback.find(item => item.id === id)?.appliedRevisionId).toBe(final.activePreviewRevisionId)
    expect(final.feedback.find(item => item.id === b.id)?.appliedRevisionId).toBeNull()
  }, 40_000)
  it('a_superseded_decision_does_not_park_an_actionable_batch', async () => {
    const s = await session(), first = await claim(s)
    await executeWebsiteBuildRun(db, first, first.claim_id!)
    await requestBuildControl(db, TEST_PRINCIPAL, s, 'pause', 'sup-pause')
    const a = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'sup-a', text: 'Kanske blå eller grön rubrik?', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const b = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'sup-b', text: 'Bestämt: blå rubrik', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const resumed = await requestBuildControl(db, TEST_PRINCIPAL, s, 'resume', 'sup-resume'), next = await claim(resumed)
    provider.mockResolvedValueOnce(response({ items: [{ feedbackId: a.id, summary: 'Oklart färgval', disposition: 'decision', changeKey: 'hero.color', supersedesFeedbackIds: [] }, { feedbackId: b.id, summary: 'Blå rubrik', disposition: 'apply', changeKey: 'hero.color', supersedesFeedbackIds: [a.id] }] })).mockResolvedValueOnce(response(draft('Blå rubrik')))
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    const final = await view(s)
    expect(final.revisions).toHaveLength(2)
    expect(final.feedback.find(item => item.id === a.id)?.status).toBe('superseded')
    expect(final.feedback.find(item => item.id === b.id)?.appliedRevisionId).toBe(final.activePreviewRevisionId)
  }, 40_000)
  it('real_brief_produces_revision_one', async () => {
    const s = await session(), run = await claim(s)
    await executeWebsiteBuildRun(db, run, run.claim_id!)
    const result = await view(s)
    expect(result.status).toBe('ready'); expect(result.revisions).toHaveLength(1)
    expect((await readBuildArtifact(db, TEST_PRINCIPAL, s, result.activePreviewRevisionId!)).pages[0].html).toContain('Vår idé')
    const paid = provider.mock.calls[0][0]
    expect(paid.execution.context).toBe('AUTONOMOUS')
    expect(paid.authority).toEqual({ kind: 'RUN_BOUND', runId: run.id, claimId: run.claim_id })
    expect(paid.cost.projectId).toBe(TEST_PROJECT)
    expect(paid.systemPrompt).toContain('design-taste-frontend')
  }, 30_000)
  it('feedback_during_provider_call_builds_successor', async () => {
    const s = await session(), run = await claim(s)
    provider.mockImplementationOnce(async () => { await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'during-1', text: 'Byt rubriken till Nästa idé', inputSource: 'text', viewedRevisionId: null }); return response(draft()) })
    await executeWebsiteBuildRun(db, run, run.claim_id!)
    let result = await view(s)
    expect(result.status).toBe('queued'); expect(result.revisions).toHaveLength(1)
    const next = await claim(result), feedback = result.feedback[0]
    provider.mockResolvedValueOnce(response({ items: [{ feedbackId: feedback.id, summary: 'Jag ändrar rubriken.', disposition: 'apply', changeKey: 'hero.title', supersedesFeedbackIds: [] }] })).mockResolvedValueOnce(response(draft('Nästa idé')))
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    result = await view(s)
    expect(result.revisions).toHaveLength(2)
    expect(result.feedback[0].appliedRevisionId).toBe(result.activePreviewRevisionId)
    expect((await readBuildArtifact(db, TEST_PRINCIPAL, s, result.activePreviewRevisionId!)).pages[0].html).toContain('Nästa idé')
  }, 40_000)
  it('retry_after_commit_does_not_regenerate', async () => {
    const s = await session(), run = await claim(s)
    await executeWebsiteBuildRun(db, run, run.claim_id!)
    const completed = JSON.parse(testSql(`select to_jsonb(r) from runs r where id='${run.id}';`)) as Run
    provider.mockClear()
    await executeWebsiteBuildRun(db, completed, completed.claim_id!)
    expect(provider).not.toHaveBeenCalled(); expect((await view(s)).revisions).toHaveLength(1)
  }, 30_000)
  it.each(['stop', 'cancel', 'fence'])('stop_or_lost_claim_prevents_paid_dispatch_and_commit: %s', async reason => {
    const s = await session(), run = await claim(s)
    if (reason === 'stop') testSql('update platform_config set automation_paused=true;')
    if (reason === 'cancel') testSql(`select request_run_cancel('${run.id}','${TEST_PROJECT}',null,'test cancel');`)
    if (reason === 'fence') testSql(`update runs set claim_id=gen_random_uuid() where id='${run.id}';`)
    const task = executeWebsiteBuildRun(db, run, run.claim_id!)
    if (reason === 'stop') await expect(task).rejects.toMatchObject({ name: 'RunCheckpointRefusedError', refusal: 'STOPPED' })
    else await expect(task).rejects.toThrowError(reason === 'cancel' ? /^cancelled:/ : /^fenced:/)
    const stored = JSON.parse(testSql(`select to_jsonb(r) from runs r where id='${run.id}';`))
    expect(stored.status).toBe(reason === 'stop' ? 'pending' : reason === 'cancel' ? 'cancelled' : 'running')
    expect(provider).not.toHaveBeenCalled(); expect((await view(s)).revisions).toHaveLength(0)
  }, 30_000)
  it('pause_is_acknowledged_only_at_boundary', async () => {
    const s = await session(), run = await claim(s)
    provider.mockImplementationOnce(async () => { const pending = await requestBuildControl(db, TEST_PRINCIPAL, s, 'pause', 'pause'); expect(pending.status).toBe('pausing'); return response(draft()) })
    await executeWebsiteBuildRun(db, run, run.claim_id!)
    expect((await view(s)).status).toBe('paused'); expect((await view(s)).revisions).toHaveLength(0)
    const resumed = await requestBuildControl(db, TEST_PRINCIPAL, s, 'resume', 'resume'), next = await claim(resumed)
    provider.mockClear()
    expect((await loadBuildSnapshot(db, writer(resumed, next))).candidate?.sha256).toMatch(/^[a-f0-9]{64}$/)
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    expect(provider).not.toHaveBeenCalled(); expect((await view(s)).revisions).toHaveLength(1)
  }, 40_000)
  it('question_is_answered_without_fake_applied_receipt', async () => {
    const s = await session(), first = await claim(s)
    await executeWebsiteBuildRun(db, first, first.claim_id!)
    const f = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'question', text: 'Vilken färg använde du?', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const next = await claim(await view(s))
    provider.mockClear(); provider.mockResolvedValueOnce(response({ items: [{ feedbackId: f.id, summary: 'Jag använde grönt.', disposition: 'answer', changeKey: null, supersedesFeedbackIds: [] }] }))
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    const result = await view(s)
    expect(result.revisions).toHaveLength(1); expect(result.feedback[0].status).toBe('acknowledged'); expect(result.feedback[0].appliedRevisionId).toBeNull()
    expect(provider).toHaveBeenCalledTimes(1)
  }, 40_000)
  it('ambiguous_feedback_waits_for_decision_and_keeps_preview', async () => {
    const s = await session(), first = await claim(s)
    await executeWebsiteBuildRun(db, first, first.claim_id!)
    const f = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'decision', text: 'Lägg in betalning', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const next = await claim(await view(s))
    provider.mockResolvedValueOnce(response({ items: [{ feedbackId: f.id, summary: 'Betalning behöver en separat integration.', disposition: 'decision', changeKey: null, supersedesFeedbackIds: [] }] }))
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    expect((await view(s)).status).toBe('awaiting_decision'); expect((await view(s)).revisions).toHaveLength(1)
  }, 40_000)
  it('pause_during_interpretation_preserves_ack_and_does_not_pay_for_it_twice', async () => {
    const s = await session(), first = await claim(s)
    await executeWebsiteBuildRun(db, first, first.claim_id!)
    const f = await appendBuildFeedback(db, TEST_PRINCIPAL, s, { idempotencyKey: 'interp-pause', text: 'Byt rubriken', inputSource: 'text', viewedRevisionId: (await view(s)).activePreviewRevisionId })
    const next = await claim(await view(s))
    provider.mockImplementationOnce(async () => { await requestBuildControl(db, TEST_PRINCIPAL, s, 'pause', 'pause-interpret'); return response({ items: [{ feedbackId: f.id, summary: 'Jag byter rubriken.', disposition: 'apply', changeKey: 'hero.title', supersedesFeedbackIds: [] }] }) })
    await executeWebsiteBuildRun(db, next, next.claim_id!)
    expect((await view(s)).status).toBe('paused')
    expect((await view(s)).feedback[0].status).toBe('acknowledged')
    const resumed = await requestBuildControl(db, TEST_PRINCIPAL, s, 'resume', 'resume-interpret'), resumedRun = await claim(resumed)
    provider.mockClear(); provider.mockResolvedValue(response(draft('Nytt namn')))
    await executeWebsiteBuildRun(db, resumedRun, resumedRun.claim_id!)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(provider.mock.calls[0][0].cost.operation).toBe('website.artifact.generate')
  }, 45_000)
})
describe('website output limits', () => {
  it('reports a truncated successful provider response without retrying or committing it',async()=>{
    const s=await session(),run=await claim(s)
    provider.mockResolvedValueOnce({...response(draft()),stopReason:'max_tokens',tokensOut:6000})
    await expect(executeWebsiteBuildRun(db,run,run.claim_id!)).rejects.toMatchObject({code:'MODEL_OUTPUT_TRUNCATED'})
    expect(provider).toHaveBeenCalledTimes(1)
    expect((await view(s)).revisions).toHaveLength(0)
  },30000)
  it('uses the configured output allowance for a complete package',async()=>{
    testSql("update agents set config=jsonb_build_object('max_tokens',12000) where id='"+TEST_AGENT+"';")
    const s=await session(),run=await claim(s)
    await executeWebsiteBuildRun(db,run,run.claim_id!)
    expect(provider.mock.calls[0][0].maxTokens).toBe(12000)
  },30000)
  it('preserves a custom builder output cap',async()=>{
    testSql("update agents set config='{\"max_tokens\":3500}'::jsonb where id='"+TEST_AGENT+"';")
    const s=await session(),run=await claim(s)
    await executeWebsiteBuildRun(db,run,run.claim_id!)
    expect(provider.mock.calls[0][0].maxTokens).toBe(3500)
  },30000)
})

it('uses OpenAI in the temporary economy profile without changing the saved agent',async()=>{
 process.env.ATLAS_MODEL_PROFILE='openai_economy'
 try{
  const s=await session(),run=await claim(s)
  const savedModel=testSql("select model from agents where id='"+TEST_AGENT+"';")
  await executeWebsiteBuildRun(db,run,run.claim_id!)
  expect(provider.mock.calls[0][0].model).toBe('gpt-5.4-mini')
  expect((await view(s)).status).toBe('ready')
  expect(testSql("select model from agents where id='"+TEST_AGENT+"';")).toBe(savedModel)
 }finally{delete process.env.ATLAS_MODEL_PROFILE}
},30000)

it('retains a rejected paid draft as a non-executable diagnostic without retry or preview',async()=>{
 const s=await session(),run=await claim(s)
 const rejected=draft();rejected.pages[0].bodyHtml='<a href="https://bad.example">Extern</a>'
 const content=JSON.stringify(rejected)
 provider.mockResolvedValueOnce({...response(rejected),content})
 await expect(executeWebsiteBuildRun(db,run,run.claim_id!)).rejects.toMatchObject({code:'INVALID_LINK'})
 expect(provider).toHaveBeenCalledTimes(1);expect((await view(s)).revisions).toHaveLength(0)
 const stored=testSql("select content from run_logs where run_id='"+run.id+"' and content like '%website.rejected-draft.v1%' limit 1;")
 expect(stored).not.toBe('')
 const log=JSON.parse(stored)
 expect(log).toMatchObject({kind:'website.rejected-draft.v1',projectId:TEST_PROJECT,sessionId:s.sessionId,model:provider.mock.calls[0][0].model,code:'INVALID_LINK',content})
 expect(log.sha256).toMatch(/^[a-f0-9]{64}$/)
 expect(testSql("select role from run_logs where run_id='"+run.id+"' and content like '%website.rejected-draft.v1%' limit 1;")).toBe('system')
},30000)

it('keeps the validation failure when rejected-draft logging is unavailable',async()=>{
 const s=await session(),run=await claim(s),bad=draft();bad.pages[0].bodyHtml='<a href="mailto:example@example.com">E-post</a>'
 provider.mockResolvedValueOnce(response(bad))
 const from=db.from.bind(db),attempts:string[]=[]
 const unavailable={...db,from:(table:string)=>table==='run_logs'?{insert:async()=>{attempts.push(table);return{error:{message:'test unavailable'}}}}:from(table as any)} as typeof db
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{})
 try{
  await expect(executeWebsiteBuildRun(unavailable,run,run.claim_id!)).rejects.toMatchObject({code:'INVALID_LINK'})
  expect(attempts).toEqual(['run_logs']);expect(provider).toHaveBeenCalledTimes(1);expect((await view(s)).revisions).toHaveLength(0)
 }finally{warning.mockRestore()}
},30000)
it('does not retain a draft after losing the claim during the paid call',async()=>{
 const s=await session(),run=await claim(s),bad=draft();bad.pages[0].bodyHtml='<a href="https://bad.example">Extern</a>'
 provider.mockImplementationOnce(async()=>{testSql("update runs set claim_id=gen_random_uuid() where id='"+run.id+"';");return response(bad)})
 await expect(executeWebsiteBuildRun(db,run,run.claim_id!)).rejects.toThrow(/^fenced:/)
 expect(testSql("select count(*) from run_logs where run_id='"+run.id+"' and content like '%website.rejected-draft.v1%';")).toBe('0')
 expect((await view(s)).revisions).toHaveLength(0);expect(provider).toHaveBeenCalledTimes(1)
},30000)

it.each(['stop','cancel','fence'])('preserves rejection finalization after compilation begins: %s',async reason=>{
 const s=await session(),run=await claim(s),bad=draft();bad.pages[0].bodyHtml='<a href="https://bad.example">Extern</a>'
 const content=JSON.stringify(bad);let changed=false
 provider.mockResolvedValueOnce({...response(bad),get content(){
  if(!changed){changed=true
   if(reason==='stop')testSql('update platform_config set automation_paused=true;')
   if(reason==='cancel')testSql("select request_run_cancel('"+run.id+"','"+TEST_PROJECT+"',null,'test cancel');")
   if(reason==='fence')testSql("update runs set claim_id=gen_random_uuid() where id='"+run.id+"';")
  }
  return content
 }})
 const task=executeWebsiteBuildRun(db,run,run.claim_id!)
 if(reason==='stop')await expect(task).rejects.toMatchObject({code:'INVALID_LINK'})
 else await expect(task).rejects.toThrow(reason==='cancel'?/^cancelled:/:/^fenced:/)
 expect(testSql("select status from runs where id='"+run.id+"';")).toBe(reason==='cancel'?'cancelled':'running')
 expect(testSql("select count(*) from run_logs where run_id='"+run.id+"' and content like '%website.rejected-draft.v1%';")).toBe(reason==='stop'?'1':'0')
 expect(provider).toHaveBeenCalledTimes(1);expect((await view(s)).revisions).toHaveLength(0)
},30000)

it.each(['valid','paused','paused-feedback','legacy-worker','rejected-stop','rejected-cancel','rejected-fence','wrong-hash','wrong-session','unsafe-draft'])('recovers a saved rejected draft without paid dispatch: %s',async mode=>{
 const s=await session(),source=await claim(s),bad=draft();bad.pages[0].bodyHtml='<svg><rect width="10" height="10"></rect></svg>'
 provider.mockResolvedValueOnce(response(bad))
 await expect(executeWebsiteBuildRun(db,source,source.claim_id!)).rejects.toMatchObject({code:'UNSUPPORTED_ELEMENT'})
 const log=JSON.parse(testSql("select content from run_logs where run_id='"+source.id+"' and content like '%website.rejected-draft.v1%' limit 1;"))
 testSql("update runs set status='failed' where id='"+source.id+"'; update website_build_sessions set status='failed',current_run_id=null where id='"+s.sessionId+"';")
 const resumed=await requestBuildControl(db,TEST_PRINCIPAL,s,'resume','recovery-'+mode),next=await claim(resumed)
 const recovery={sourceRunId:source.id,sourceSha256:mode==='wrong-hash'?'0'.repeat(64):log.sha256,draft:mode==='unsafe-draft'||mode.startsWith('rejected-')?bad:draft('Återställd utan nytt modellanrop')}
 if(mode==='wrong-session')testSql("update runs set input=jsonb_set(input,'{sessionId}','\"00000000-0000-4000-8000-000000000099\"'::jsonb) where id='"+source.id+"';")
 next.input={...(next.input as object),recovery}
 testSql("update runs set input='"+JSON.stringify(next.input).replaceAll("'","''")+"'::jsonb where id='"+next.id+"';")
 provider.mockClear();provider.mockRejectedValue(new Error('Paid generation must not be called during recovery'))
 if(mode.startsWith('rejected-')){
  let changed=false
  Object.defineProperty(recovery,'draft',{get(){
   if(!changed){changed=true
    if(mode==='rejected-stop')testSql('update platform_config set automation_paused=true;')
    if(mode==='rejected-cancel')testSql("select request_run_cancel('"+next.id+"','"+TEST_PROJECT+"',null,'test recovery cancel');")
    if(mode==='rejected-fence')testSql("update runs set claim_id=gen_random_uuid() where id='"+next.id+"';")
   }
   return bad
  }})
  const task=executeWebsiteBuildRun(db,next,next.claim_id!)
  if(mode==='rejected-stop')await expect(task).rejects.toMatchObject({code:'UNSUPPORTED_ELEMENT'})
  else await expect(task).rejects.toThrow(mode==='rejected-cancel'?/^cancelled:/:/^fenced:/)
  expect(testSql("select status from runs where id='"+next.id+"';")).toBe(mode==='rejected-cancel'?'cancelled':'running')
  expect((await view(s)).revisions).toHaveLength(0)
 }
 else if(mode==='legacy-worker'){
  // Old deployed workers have no recovery protocol marker and must fail before
  // obtaining the snapshot from which they could dispatch paid generation.
  await expect(loadBuildSnapshot(db,writer(s,next))).rejects.toMatchObject({message:expect.stringContaining('RECOVERY_WORKER_REQUIRED')})
  expect((await view(s)).revisions).toHaveLength(0)
 }
 else if(mode==='paused'||mode==='paused-feedback'){
  await requestBuildControl(db,TEST_PRINCIPAL,s,'pause','pause-recovery')
  await executeWebsiteBuildRun(db,next,next.claim_id!)
  expect((await view(s)).status).toBe('paused')
  if(mode==='paused-feedback')await appendBuildFeedback(db,TEST_PRINCIPAL,s,{idempotencyKey:'during-recovery',text:'Byt rubriken',inputSource:'text',viewedRevisionId:null})
  const resumedAgain=await requestBuildControl(db,TEST_PRINCIPAL,s,'resume','resume-recovery'),last=await claim(resumedAgain)
  if(mode==='paused-feedback'){
   await expect(executeWebsiteBuildRun(db,last,last.claim_id!)).rejects.toMatchObject({code:'INVALID_RECOVERY'})
   expect((await view(s)).revisions).toHaveLength(0)
  }else{
   await executeWebsiteBuildRun(db,last,last.claim_id!)
   expect((await view(s)).status).toBe('ready');expect((await view(s)).revisions).toHaveLength(1)
  }
 }
 else if(mode==='valid'){await executeWebsiteBuildRun(db,next,next.claim_id!);expect((await view(s)).status).toBe('ready');expect((await view(s)).revisions).toHaveLength(1)}
 else{await expect(executeWebsiteBuildRun(db,next,next.claim_id!)).rejects.toMatchObject({code:mode==='unsafe-draft'?'UNSUPPORTED_ELEMENT':'INVALID_RECOVERY'});expect((await view(s)).revisions).toHaveLength(0)}
 expect(provider).not.toHaveBeenCalled()
},30000)

it.each(['missing-pages','complete'] as const)('enforces the approved three-page scope: %s',async(mode)=>{
 const planning=await import('./planning/store'),conversationId=crypto.randomUUID()
 testSql("insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');")
 await planning.setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT})
 const plan=await planning.saveWebsitePlanRevision(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,conversationId,expectedRevisionId:null,idempotencyKey:crypto.randomUUID(),content:{title:'Tre sidor',purpose:'Behåll hela den överenskomna webbplatsen',audience:'Kunder',pages:[{key:'home',title:'Hem',purpose:'Introduktion'},{key:'policy',title:'Policy',purpose:'Villkor'},{key:'order',title:'Order',purpose:'Exempel'}],design:{style:'Varm',reference:null},features:[],architecture:'Statiskt paket',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}})
 const option=plan.designReview!.options[0]
 await planning.approveWebsiteMockup(db,TEST_PRINCIPAL,{...plan.currentRevision,mockupId:option.id,mockupSha256:option.sha256,idempotencyKey:crypto.randomUUID()})
 const decision=await planning.approveWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,idempotencyKey:crypto.randomUUID()}),s=await planning.startApprovedWebsitePlan(db,TEST_PRINCIPAL,{...plan.currentRevision,decisionId:decision.id}),run=await claim(s)
 if(mode==='complete'){
  const complete=draft();complete.pages.push({...complete.pages[0],key:'policy',title:'Policy'},{...complete.pages[0],key:'order',title:'Order'})
  provider.mockResolvedValueOnce(response(complete))
  await executeWebsiteBuildRun(db,run,run.claim_id!)
  const final=await view(s);expect(final.status).toBe('ready');expect(final.revisions).toHaveLength(1)
  const artifact=await readBuildArtifact(db,TEST_PRINCIPAL,s,final.activePreviewRevisionId!)
  expect(artifact.pages.map(page=>page.key).sort()).toEqual(['index','order','policy'])
 }else{
  await expect(executeWebsiteBuildRun(db,run,run.claim_id!)).rejects.toMatchObject({code:'APPROVED_PAGE_SCOPE_MISMATCH'})
  expect((await view(s)).revisions).toHaveLength(0)
 }
},30000)
