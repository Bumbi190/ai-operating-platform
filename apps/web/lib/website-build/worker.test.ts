import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeWebsiteBuildRun } from './worker'
import { appendBuildFeedback, createBuildSession, loadBuildSnapshot, readBuildArtifact, readBuildSession, requestBuildControl } from './store'
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
async function session(): Promise<BuildSessionView> { return createBuildSession(db, TEST_PRINCIPAL, { projectId: TEST_PROJECT, agentId: TEST_AGENT, conversationId: TEST_CONVERSATION, brief: 'Bygg en svensk hemsida för mitt företag.', idempotencyKey: 'test-' + crypto.randomUUID() }) }
async function claim(view: BuildSessionView): Promise<Run> {
  testSql(`update runs set status='running',claim_id=gen_random_uuid(),claimed_at=now(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=(select current_run_id from website_build_sessions where id='${view.sessionId}');`)
  // Use direct SQL for JSON-path selection; the transport intentionally supports
  // only identifiers in generated queries.
  return JSON.parse(testSql(`select to_jsonb(r) from runs r where id=(select current_run_id from website_build_sessions where id='${view.sessionId}');`)) as Run
}
async function view(s: BuildSessionView) { return readBuildSession(db, TEST_PRINCIPAL, s) }
function writer(s: BuildSessionView, run: Run): WriterRef { return { projectId: s.projectId, sessionId: s.sessionId, runId: run.id, claimId: run.claim_id!, generation: (run.input as { generation: number }).generation } }
describe('durable website worker with real SQL', () => {
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
