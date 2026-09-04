/**
 * G3C-3C-A · D1 — a PHYSICAL ADMISSION REFUSAL has an owner.
 *
 * Phase 1C made the adapter refuse before dispatch and documented that "the
 * owning boundary classifies and settles". Nothing did. The drain's catch did
 * not recognise the error, so it fell through into generic failure accounting:
 * a `run_logs` error row, an `error_history` entry, a burned retry and a
 * `pending`/`failed` flip — for a request governance deliberately prevented
 * from ever being made.
 *
 * The four refusals are four different non-failures:
 *
 *   CANCELLED             settle canonically, report what the settlement
 *                         ACTUALLY did (cancelled / fenced / lifecycle_error).
 *   STOPPED               settle canonically; a cancellation may have won the
 *                         race, so the report follows the settlement, not the
 *                         refusal.
 *   FENCED                another owner holds the run. Write nothing.
 *   AUTHORITY_UNAVAILABLE the truth could not be READ. It is not cancelled, not
 *                         stopped, not fenced and not failed — asserting any of
 *                         them would invent a durable claim from an unread row.
 *                         Write nothing; the lease and the reaper own recovery.
 *
 * Every case drives the REAL drain route against the REAL settlement helpers.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const RUN = 'run-le1'
const CLAIM = 'claim-le1'
const PROJ = '11111111-1111-1111-1111-111111111111'
const INST = '33333333-3333-3333-3333-333333333333'

const state = {
  run: {} as Row,
  globalPaused: false,
  /** Fails the release RPC — the STOPPED-side lifecycle write. */
  rpcFails: false,
  /** Fails the runs UPDATE — the CANCELLED-side lifecycle write. */
  updateFails: false,
  /** What release_stopped_run answers when it does not fail. */
  releaseAnswer: 'RELEASED' as string,
  /** Claim_id seen by the checkpoint's FRESH read only — models a rotation that
   *  happened after this worker was handed the row. */
  rotatedTo: undefined as string | undefined,
  writes: [] as { payload: Row; predicates: Row }[],
  providerCalls: 0,
  /** Which admission refusal the provider seam raises, if any. */
  refuseAdmission: null as null | 'CANCELLED' | 'STOPPED' | 'FENCED' | 'AUTHORITY_UNAVAILABLE',
  /** An ordinary provider failure, to prove the generic path still works. */
  throwGeneric: false,
  /** Error lines written to run_logs — failure accounting's visible trace. */
  errorLogs: [] as string[],
}

const notifications: string[] = []
vi.mock('@/lib/email/brevo', () => ({
  sendAdminNotification: (s: string) => { notifications.push(s); return Promise.resolve() },
}))
vi.mock('@/lib/atlas/memory/record-event', () => ({ recordMemoryEvent: () => Promise.resolve() }))
vi.mock('@/lib/ai/checkpoint', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/ai/checkpoint')),
  computeCheckpoint: () => Promise.resolve({ startFromOrder: 0, existingContext: {} }),
}))
// The provider seam. If any ERROR case reaches this, the worker kept working
// after a failed lifecycle write — which is the whole point of the suite.
// The provider seam. `runStep` here stands in for the whole governed adapter
// chain: what matters to THIS suite is which error type reaches the drain, and
// that it is the real one the adapters throw.
vi.mock('@/lib/ai/runner', () => ({
  runStep: async () => {
    state.providerCalls += 1
    if (state.refuseAdmission) {
      const { PhysicalAdmissionRefusedError } = await import('@/lib/governance/execution-signal')
      throw new PhysicalAdmissionRefusedError(state.refuseAdmission, 'openai', 'admission refused')
    }
    if (state.throwGeneric) throw new Error('provider exploded')
    return { content: 'x', tokensIn: 1, tokensOut: 1, durationMs: 1, authorityRefreshRequired: false }
  },
}))

function makeDb() {
  const builder = (table: string) => {
    const predicates: Row = {}
    let payload: Row | null = null
    const AGENT = { id: 'a1', name: 'A', system_prompt: 's', model: 'm', config: {} }
    // Awaiting the builder is the LIST form (the executor bulk-loads agents with
    // .in()); .single()/.maybeSingle() is the row form. The double must honour
    // both or the executor never reaches the checkpoint under test.
    const resolveList = () => (table === 'agents'
      ? { data: [AGENT], error: null }
      : { data: [], error: null })
    const resolve = () => {
      if (table === 'runs') {
        return { data: { ...state.run, ...(state.rotatedTo ? { claim_id: state.rotatedTo } : {}) },
                 error: null }
      }
      if (table === 'agents') return { data: AGENT, error: null }
      if (table === 'workflows') {
        return { data: { name: 'wf', project_id: PROJ, projects: { name: 'p' }, steps: [] }, error: null }
      }
      if (table === 'approvals') return { data: null, error: null }
      return { data: null, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (row: Row) => {
        if (table === 'run_logs' && String(row?.content ?? '').startsWith('❌')) {
          state.errorLogs.push(String(row.content))
        }
        return Promise.resolve({ data: null, error: null })
      },
      update: (p: Row) => { payload = p; return chain },
      eq: (c: string, v: unknown) => { predicates[c] = v; return chain },
      is: () => chain, limit: () => chain, order: () => chain, not: () => chain,
      in: () => chain, gte: () => chain, lt: () => chain,
      single: async () => resolve(),
      maybeSingle: async () => resolve(),
      then: (ok: (v: unknown) => unknown) => {
        if (payload !== null) {
          if (table === 'runs' && state.updateFails) {
            return Promise.resolve({ data: null, error: { message: 'connection lost' } }).then(ok)
          }
          state.writes.push({ payload, predicates })
          const hit = Object.entries(predicates).every(([k, v]) =>
            k === 'id' || state.run[k] === v)
          if (hit && table === 'runs') Object.assign(state.run, payload)
          return Promise.resolve({ data: hit ? [{ id: RUN }] : [], error: null }).then(ok)
        }
        return Promise.resolve(table === 'runs' ? resolve() : resolveList()).then(ok)
      },
    }
    return chain
  }
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      if (fn === 'claim_runs') return { data: [{ ...state.run }], error: null }
      if (fn === 'release_stopped_run') {
        if (state.rpcFails) return { data: null, error: { message: 'connection lost' } }
        return { data: state.releaseAnswer, error: null }
      }
      if (fn === 'stop_state') {
        return {
          data: [{
            global_paused: state.globalPaused, global_paused_at: null, global_paused_reason: null,
            project_requested: true, project_found: true,
            project_paused: false, project_paused_at: null, project_paused_reason: null,
          }],
          error: null,
        }
      }
      return { data: null, error: null }
    },
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const anyDb = () => makeDb() as any
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeDb() as any }))

const STEPS = [{ order: 0, agent_id: 'a1', name: 's0', input_template: 't', output_key: 'k0' }]

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  process.env.H1_UNIFIED_EXECUTOR = '1'
  state.run = {
    id: RUN, project_id: PROJ, status: 'running', claim_id: CLAIM,
    cancel_requested: false, kind: null, workflow_id: 'wf-1',
    workflow_instance_id: null, policy_class: 'non_destructive',
    input: {}, context: {}, attempts: 1, max_attempts: 3, steps_snapshot: STEPS,
  }
  state.globalPaused = false
  state.rpcFails = false
  state.updateFails = false
  state.releaseAnswer = 'RELEASED'
  state.rotatedTo = undefined
  state.writes = []
  state.providerCalls = 0
  state.refuseAdmission = null
  state.throwGeneric = false
  state.errorLogs = []
  notifications.length = 0
  vi.resetModules()
})

/** Nothing was written, and no work continued. Asserted on every ERROR case. */
function assertInert() {
  expect(state.writes, 'a failed lifecycle write must not be followed by another').toEqual([])
  expect(state.run.status, 'the run keeps its state and its lease').toBe('running')
  expect(state.providerCalls, 'and no further execution-bearing work begins').toBe(0)
}

const drain = () => new Request('http://t/api/runs/drain', {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })


// ═══════════════════════════════════════════════════════════════════════════
const drainOnce = async () => {
  const { GET } = await import('@/app/api/runs/drain/route')
  const res = await GET(drain())
  return (await res.json() as { results?: Row[] }).results?.[0] ?? {}
}

/** No failure accounting of any kind reached the run. */
function assertNoFailureAccounting() {
  const failureWrites = state.writes.filter(w =>
    'last_error' in w.payload || 'error_history' in w.payload || 'error' in w.payload)
  expect(failureWrites, 'a refusal must never write failure accounting').toEqual([])
  const statuses = state.writes.map(w => w.payload.status).filter(Boolean)
  expect(statuses, 'and never flip the run to pending/failed')
    .not.toContain('failed')
  expect(statuses).not.toContain('pending')
  expect(state.errorLogs, 'and never log a provider error line').toEqual([])
}

describe('D1–D4 · the drain owns the physical admission refusal', () => {
  it('D1 — CANCELLED settles canonically and reports the settlement', async () => {
    state.refuseAdmission = 'CANCELLED'
    const r = await drainOnce()
    expect(r.status, 'reported as the settlement, not as a failure').toBe('cancelled')
    expect(state.run.status, 'and the run really was terminalized').toBe('cancelled')
    assertNoFailureAccounting()
  })

  it('D1b — CANCELLED whose lifecycle write FAILS reports lifecycle_error, not cancelled', async () => {
    state.refuseAdmission = 'CANCELLED'
    state.updateFails = true
    const r = await drainOnce()
    expect(r.status, 'the ACTUAL settlement result, not the refusal').toBe('lifecycle_error')
    expect(r.reason).toBe('lifecycle_write_failed')
    expect(state.run.status, 'the run keeps its state and its lease').toBe('running')
    assertNoFailureAccounting()
  })

  it('D2 — STOPPED settles canonically and defers, with no backoff or error', async () => {
    state.refuseAdmission = 'STOPPED'
    const r = await drainOnce()
    expect(r.status).toBe('deferred_by_stop')
    assertNoFailureAccounting()
  })

  it('D2b — STOPPED that a cancellation WON reports cancelled, not deferred', async () => {
    // R9: `release_stopped_run` is cancel-aware. The report follows what the
    // settlement did, never what the refusal said.
    state.refuseAdmission = 'STOPPED'
    state.releaseAnswer = 'CANCELLED'
    const r = await drainOnce()
    expect(r.status).toBe('cancelled')
    assertNoFailureAccounting()
  })

  it('D3 — FENCED writes no lifecycle at all', async () => {
    state.refuseAdmission = 'FENCED'
    const r = await drainOnce()
    expect(r.status).toBe('fenced')
    expect(state.writes, 'the new owner decides this run — we touch nothing').toEqual([])
    assertNoFailureAccounting()
  })

  it('D4 — AUTHORITY_UNAVAILABLE writes nothing and invents no durable claim', async () => {
    state.refuseAdmission = 'AUTHORITY_UNAVAILABLE'
    const r = await drainOnce()
    expect(r.status, 'a control status, not a runs.status value').toBe('authority_unavailable')
    expect(r.reason).toBe('authority_unreadable')
    expect(state.writes, 'nothing was written').toEqual([])
    expect(state.run.status, 'the run keeps its lease for the reaper').toBe('running')
    assertNoFailureAccounting()
  })

  it('D4b — AUTHORITY_UNAVAILABLE is not silently reclassified as fenced or cancelled', async () => {
    state.refuseAdmission = 'AUTHORITY_UNAVAILABLE'
    const r = await drainOnce()
    expect(r.status).not.toBe('fenced')
    expect(r.status).not.toBe('cancelled')
    expect(r.status).not.toBe('deferred_by_stop')
    expect(r.status).not.toBe('failed')
  })

  it('D4c — an ordinary provider error still gets full failure accounting', async () => {
    // The refusal branch must not have swallowed the generic path with it.
    state.refuseAdmission = null
    state.throwGeneric = true
    await drainOnce()
    const failureWrites = state.writes.filter(w => 'last_error' in w.payload)
    expect(failureWrites.length, 'a real failure is still a failure').toBeGreaterThan(0)
  })
})
