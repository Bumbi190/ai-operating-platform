/**
 * APPROVAL-N1 — the approval-pending notification, proven BEHAVIOURALLY.
 *
 * The previous proof was a source-order pin plus a test that re-implemented
 * `if (CAS succeeded) notify()`. That proves nothing: it asserts the test's own
 * copy of the rule, not the drain's. Given how many presence-vs-effect gaps this
 * slice has already turned up, the only acceptable proof drives the real route.
 *
 * So this exercises `GET /api/runs/drain` end to end with the REAL post-claim
 * checkpoint and the REAL atomic CAS. Only the surrounding collaborators are
 * mocked — the executor, the memory recorder, and Brevo, so no mail leaves.
 *
 * The sequence under test:
 *
 *   approval insert (if none)
 *     → awaiting_approval atomic CAS
 *       → CANCELLED  : return the approval, exit, notify NOBODY
 *       → FENCED/ERR : exit, notify nobody
 *       → SUCCEEDED  : notify exactly once
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const RUN = 'run-ap1'
const CLAIM = 'claim-ap1'
const PROJ = '11111111-1111-1111-1111-111111111111'

const state = {
  run: {} as Row,
  approvals: [] as Row[],
  approvalInserts: 0,
  approvalUpdates: [] as Row[],
  globalPaused: false,
  projectPaused: false,
  /** Fires just before an update is evaluated — the cancellation lever. */
  beforeUpdate: undefined as ((table: string, payload: Row) => void) | undefined,
}

const notifications: string[] = []
vi.mock('@/lib/email/brevo', () => ({
  sendAdminNotification: (subject: string) => { notifications.push(subject); return Promise.resolve() },
}))
vi.mock('@/lib/atlas/memory/record-event', () => ({ recordMemoryEvent: () => Promise.resolve() }))
vi.mock('@/lib/ai/checkpoint', () => ({
  computeCheckpoint: () => Promise.resolve({ startFromOrder: 0, existingContext: {} }),
}))
vi.mock('@/lib/ai/workflow-executor', () => ({
  executeRunSteps: () => Promise.resolve({ outputContent: 'result', lastOutputKey: 'k0' }),
}))
vi.mock('@/lib/ai/workflow-runner', () => ({ runSteps: () => Promise.resolve() }))

function makeDb() {
  const builder = (table: string) => {
    const preds: Row = {}
    let payload: Row | null = null
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (row: Row) => {
        if (table === 'approvals') { state.approvals.push({ ...row, id: 'appr-1' }); state.approvalInserts += 1 }
        return Promise.resolve({ data: null, error: null })
      },
      update: (p: Row) => { payload = p; return chain },
      eq: (c: string, v: unknown) => { preds[c] = v; return chain },
      is: () => chain, limit: () => chain, order: () => chain,
      maybeSingle: async () => resolve(table),
      single: async () => resolve(table),
      then: (ok: (v: unknown) => unknown) => {
        // An awaited update with no .select() — used by the approvals return.
        if (payload !== null) return Promise.resolve(applyUpdate(table, payload, preds)).then(ok)
        return Promise.resolve(resolve(table)).then(ok)
      },
    }
    ;(chain as { select: unknown }).select = () => {
      if (payload === null) return chain
      return Promise.resolve(applyUpdate(table, payload, preds))
    }
    return chain
  }

  const applyUpdate = (table: string, payload: Row, preds: Row) => {
    state.beforeUpdate?.(table, payload)
    if (table === 'approvals') {
      // payload LAST: spreading preds after it would overwrite `status:
      // 'returned'` with the predicate's `status: 'pending'`.
      state.approvalUpdates.push({ predicates: { ...preds }, ...payload })
      state.approvals = state.approvals.map(a =>
        (preds.status === undefined || a.status === preds.status) ? { ...a, ...payload } : a)
      return { data: [{ id: 'appr-1' }], error: null }
    }
    // runs: honour every predicate the CAS carries.
    const hit =
      (preds.id === undefined || preds.id === state.run.id) &&
      (preds.status === undefined || preds.status === state.run.status) &&
      (preds.claim_id === undefined || preds.claim_id === state.run.claim_id) &&
      (preds.cancel_requested === undefined
        || preds.cancel_requested === (state.run.cancel_requested === true))
    if (hit) Object.assign(state.run, payload)
    return { data: hit ? [{ id: state.run.id }] : [], error: null }
  }

  const resolve = (t: string) => {
    if (t === 'runs') return { data: { ...state.run }, error: null }
    if (t === 'approvals') return { data: state.approvals[0] ?? null, error: null }
    if (t === 'projects') return { data: { execution_paused: state.projectPaused }, error: null }
    if (t === 'workflows') {
      return { data: { name: 'wf', project_id: PROJ, projects: { name: 'proj' }, steps: [] }, error: null }
    }
    return { data: null, error: null }
  }

  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      if (fn === 'claim_runs') return { data: [{ ...state.run }], error: null }
      if (fn === 'stop_state') {
        return {
          data: [{
            global_paused: state.globalPaused, global_paused_at: null, global_paused_reason: null,
            project_requested: true, project_found: true,
            project_paused: state.projectPaused, project_paused_at: null, project_paused_reason: null,
          }],
          error: null,
        }
      }
      return { data: null, error: null }
    },
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeDb() as any }))

const drainRequest = () =>
  new Request('http://test/api/runs/drain', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  process.env.H1_POLICY_GATE = '1'      // so decideGate can return awaiting_approval
  process.env.H1_UNIFIED_EXECUTOR = '1'
  state.run = {
    id: RUN, project_id: PROJ, status: 'running', claim_id: CLAIM,
    cancel_requested: false, kind: null, workflow_id: 'wf-1',
    workflow_instance_id: null, policy_class: 'destructive',
    input: {}, attempts: 1, steps_snapshot: [{ order: 0, agent_id: 'a1', name: 's', input_template: '', output_key: 'k0' }],
  }
  state.approvals = []
  state.approvalInserts = 0
  state.approvalUpdates = []
  state.globalPaused = false
  state.projectPaused = false
  state.beforeUpdate = undefined
  notifications.length = 0
  vi.resetModules()
})

describe('APPROVAL-N1 · the approval-pending email follows the CAS', () => {
  it('N1B — SUCCESS WINS: approval inserted, CAS succeeds, exactly one notification', async () => {
    const { GET } = await import('@/app/api/runs/drain/route')
    const res = await GET(drainRequest())
    const body = await res.json() as { results?: Row[] }

    // Non-vacuity: the approval was genuinely created and the CAS genuinely won.
    expect(state.approvalInserts, 'a new approval row was inserted').toBe(1)
    expect(state.run.status, 'the CAS committed the transition').toBe('awaiting_approval')
    expect(body.results?.[0]?.status).toBe('awaiting_approval')
    expect(notifications.length, 'notified exactly once, after success').toBe(1)
  })

  it('N1A — CANCEL WINS: approval returned, run cancelled, ZERO notifications', async () => {
    // The cancellation becomes durable just as the awaiting_approval CAS is
    // evaluated — the window a pre-read cannot see.
    state.beforeUpdate = (table, payload) => {
      if (table === 'runs' && payload.status === 'awaiting_approval') {
        state.run.cancel_requested = true
      }
    }
    const { GET } = await import('@/app/api/runs/drain/route')
    const res = await GET(drainRequest())
    const body = await res.json() as { results?: Row[] }

    // Non-vacuity: the approval really was created BEFORE the cancellation
    // resolved — otherwise "0 emails" would be trivially true.
    expect(state.approvalInserts, 'the approval was created first').toBe(1)
    expect(state.run.status, 'cancel wins the CAS').toBe('cancelled')
    expect(body.results?.[0]?.status).toBe('cancelled')
    expect(state.approvalUpdates.some(u => u.status === 'returned'),
      'the pending approval is returned, mirroring the cancel route').toBe(true)
    expect(state.approvals[0]?.status, 'and the row really carries it').toBe('returned')
    expect(notifications.length,
      'no operator is told to review a run that just cancelled').toBe(0)
  })

  it('N1C — EXISTING APPROVAL: no duplicate insert, no duplicate notification', async () => {
    state.approvals = [{ id: 'appr-existing', run_id: RUN, status: 'pending' }]
    const { GET } = await import('@/app/api/runs/drain/route')
    await GET(drainRequest())

    expect(state.approvalInserts, 'idempotent — no second approval row').toBe(0)
    expect(state.run.status).toBe('awaiting_approval')
    // Current canonical behaviour: the notification is tied to CREATION, so a
    // re-entrant drain does not re-notify. Pinned as-is rather than changed.
    expect(notifications.length, 'no duplicate approval-pending email').toBe(0)
  })

  it('FENCED: a rotated claim loses the CAS and notifies nobody', async () => {
    state.beforeUpdate = (table, payload) => {
      if (table === 'runs' && payload.status === 'awaiting_approval') {
        state.run.claim_id = 'claim-new-owner'
      }
    }
    const { GET } = await import('@/app/api/runs/drain/route')
    await GET(drainRequest())

    expect(state.approvalInserts).toBe(1)
    expect(state.run.status, 'the new owner’s run is untouched').toBe('running')
    expect(notifications.length, 'a fenced worker sends nothing').toBe(0)
  })

  it('a governance STOP before the approval work notifies nobody either', async () => {
    // Belt and braces: the post-claim checkpoint refuses at drain entry, so the
    // approval path is never reached at all.
    state.globalPaused = true
    const { GET } = await import('@/app/api/runs/drain/route')
    const res = await GET(drainRequest())
    const body = await res.json() as { results?: Row[] }

    expect(body.results?.[0]?.status).toBe('deferred_by_stop')
    expect(state.approvalInserts, 'no approval work begins under a stop').toBe(0)
    expect(notifications.length).toBe(0)
  })
})
