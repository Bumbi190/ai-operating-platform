import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeWorkerDb, resetWorkerDb, testSql, TEST_AGENT, TEST_CONVERSATION, TEST_PRINCIPAL, TEST_PROJECT } from '@/lib/website-build/test-db'
import { createBuildSession, readBuildSession, requestBuildControl } from '@/lib/website-build/store'
import { GovernanceDispatchUnknownError } from '@/lib/governance/execution-signal'
const doubles = vi.hoisted(() => ({ db: null as unknown, provider: vi.fn(), legacy: vi.fn(), marketing: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => doubles.db }))
vi.mock('@/lib/ai/runner', () => ({ runStep: doubles.provider }))
vi.mock('@/lib/ai/workflow-runner', () => ({ runSteps: doubles.legacy }))
vi.mock('@/lib/ai/workflow-executor', () => ({ executeRunSteps: vi.fn() }))
vi.mock('@/lib/marketing/workflows', () => ({ isMarketingRun: (kind: unknown) => kind === 'marketing_campaign_planner', MARKETING_HANDLERS: { marketing_campaign_planner: doubles.marketing } }))
vi.mock('@/lib/atlas/memory/record-event', () => ({ isMemoryEnabled: () => false, recordMemoryEvent: async () => undefined }))
vi.mock('@/lib/email/brevo', () => ({ sendAdminNotification: async () => undefined }))
vi.mock('@/lib/workflows/action-executor', () => ({ isWorkflowActionRun: (run: { workflow_instance_id?: string }) => Boolean(run.workflow_instance_id), executeWorkflowAction: vi.fn() }))
const payload = { format: 'static-website.v1', title: 'Test', pages: [{ key: 'index', title: 'Hem', bodyHtml: '<h1>En riktig sida</h1>', css: '', behaviors: [] }] }
let db: ReturnType<typeof initializeWorkerDb>
beforeAll(() => { db = initializeWorkerDb(); doubles.db = db; vi.stubEnv('CRON_SECRET','website-test-cron'); vi.stubEnv('H1_FENCING','1') }, 30_000)
beforeEach(() => { resetWorkerDb(); doubles.provider.mockReset(); doubles.provider.mockResolvedValue({ content: JSON.stringify(payload), tokensIn: 1, tokensOut: 1, durationMs: 1, authorityRefreshRequired: false }); doubles.legacy.mockClear(); doubles.marketing.mockClear() })
async function start() { return createBuildSession(db, TEST_PRINCIPAL, { projectId: TEST_PROJECT, agentId: TEST_AGENT, conversationId: TEST_CONVERSATION, brief: 'Bygg en hemsida', idempotencyKey: crypto.randomUUID() }) }
async function drain(auth = true) { const { GET } = await import('@/app/api/runs/drain/route'); return GET(new Request('http://localhost/api/runs/drain', { headers: auth ? { authorization: 'Bearer website-test-cron' } : {} })) }
describe('website build dispatch through actual drain route and SQL', () => {
  it('requires_cron_auth_before_any_build', async () => { const s = await start(); expect((await drain(false)).status).toBe(401); expect(doubles.provider).not.toHaveBeenCalled(); expect((await readBuildSession(db, TEST_PRINCIPAL, s)).revisions).toHaveLength(0) }, 30_000)
  it('dispatches_website_kind_without_touching_legacy_handlers', async () => {
    const s = await start(), res = await drain()
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await readBuildSession(db, TEST_PRINCIPAL, s)).revisions).toHaveLength(1)
    expect(doubles.legacy).not.toHaveBeenCalled(); expect(doubles.marketing).not.toHaveBeenCalled()
  }, 40_000)
  it('invalid_artifact_is_terminal_without_automatic_paid_retry', async () => {
    const s = await start()
    doubles.provider.mockResolvedValueOnce({ content: JSON.stringify({ ...payload, pages: [{ ...payload.pages[0], bodyHtml: '<script>fetch("https://bad.example")</script>' }] }), tokensIn: 1, tokensOut: 1, durationMs: 1, authorityRefreshRequired: false })
    await drain()
    expect((await readBuildSession(db, TEST_PRINCIPAL, s)).status).toBe('failed')
    await drain(); expect(doubles.provider).toHaveBeenCalledTimes(1)
  }, 40_000)
  it('legacy_and_marketing_dispatch_still_use_their_existing_paths', async () => {
    testSql(`insert into runs(project_id,kind,status,steps_snapshot) values('${TEST_PROJECT}',null,'pending','[{"order":1,"name":"Legacy","agent_id":"${TEST_AGENT}","input_template":"test","output_key":"output"}]'),('${TEST_PROJECT}','marketing_campaign_planner','pending',null);`)
    const res = await drain()
    expect(res.status, await res.clone().text()).toBe(200)
    expect(doubles.legacy).toHaveBeenCalledTimes(1); expect(doubles.marketing).toHaveBeenCalledTimes(1)
    expect(doubles.provider).not.toHaveBeenCalled()
  }, 40_000)
  it('in_flight_unknown_waits_for_reconciliation_and_never_looks_like_an_active_build', async () => {
    const s = await start()
    doubles.provider.mockRejectedValueOnce(new GovernanceDispatchUnknownError('anthropic','GLOBAL_STOPPED'))
    const res = await drain()
    expect(res.status, await res.clone().text()).toBe(200)
    const result = await readBuildSession(db, TEST_PRINCIPAL, s)
    expect(result.status).toBe('awaiting_decision')
    expect(result.stage).toContain('okänt')
    expect(result.revisions).toHaveLength(0)
    await drain(); expect(doubles.provider).toHaveBeenCalledTimes(1)
    await expect(requestBuildControl(db, TEST_PRINCIPAL, s, 'resume', 'unknown-resume')).rejects.toMatchObject({ code: 'CONTROL_PENDING' })
    const closed = await requestBuildControl(db, TEST_PRINCIPAL, s, 'cancel', 'unknown-close')
    expect(closed.status).toBe('cancelled'); expect(closed.stage).toContain('okänt')
    const original = JSON.parse(testSql(`select to_jsonb(r) from runs r where id='${result.currentRunId}';`))
    expect(original.status).toBe('unknown'); expect(original.reconciliation_required).toBe(true)
  }, 40_000)
})
