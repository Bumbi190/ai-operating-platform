/**
 * G3C-3B — a FAILED OWNED LIFECYCLE WRITE is its own control flow, at every
 * boundary, proven end to end.
 *
 * The helpers were taught to say `ERROR` in Phase 1, and then every caller
 * flattened it again: the executor threw `fencedError`, the runner rethrew the
 * ORIGINAL refusal, the action executor returned `refusal: 'fenced'`, and the
 * drain reported `status: 'fenced'` with `reason: 'lifecycle_write_failed'` —
 * a status claiming lost ownership beside a reason claiming a write fault.
 *
 * Why each wrong classification has consequences:
 *
 *   FENCED           claims another worker owns the run. It sends an operator
 *                    hunting a second executor that never existed.
 *   CANCELLED        claims the run is terminally cancelled when the write that
 *                    would have made it so did not land.
 *   RELEASED/STOPPED claims the run is safely back in the queue when it is not.
 *   provider failure feeds retry backoff and failure counters — and for a
 *                    workflow action, the PR9d ambiguity model, recording
 *                    UNKNOWN/reconciliation for a remote call never made.
 *
 * The only honest response is: touch nothing, start nothing. The run keeps its
 * lease, and expiry plus the reaper decide its durable state.
 *
 * Every case below drives the REAL production path and fails the REAL lifecycle
 * write; nothing asserts on source text.
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
vi.mock('@/lib/ai/runner', () => ({
  runStep: () => { state.providerCalls += 1; return Promise.resolve({ content: 'x', tokensIn: 1, tokensOut: 1, durationMs: 1 }) },
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
      insert: () => Promise.resolve({ data: null, error: null }),
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
describe('G3C-3B · drain entry', () => {
  const get = async () => {
    const { GET } = await import('@/app/api/runs/drain/route')
    const res = await GET(drain())
    return (await res.json() as { results?: Row[] }).results?.[0] ?? {}
  }

  it('CANCELLED + failed write → lifecycle_error, not fenced', async () => {
    state.run.cancel_requested = true
    state.updateFails = true
    const r = await get()
    expect(r.status).toBe('lifecycle_error')
    expect(r.reason).toBe('lifecycle_write_failed')
    assertInert()
  })

  it('STOPPED + failed release → lifecycle_error, not fenced, not deferred', async () => {
    state.globalPaused = true
    state.rpcFails = true
    const r = await get()
    expect(r.status).toBe('lifecycle_error')
    expect(r.status).not.toBe('deferred_by_stop')
    assertInert()
  })

  it('R9 ABOVE SQL — a STOP whose release answers CANCELLED reports cancelled', async () => {
    // The SQL race proves release_stopped_run returns CANCELLED when a cancel
    // commits after the STOP decision. This proves the APPLICATION says so too:
    // without it, R9 would be correct in the database and misreported as
    // `deferred_by_stop` by every caller — a run the operator believes is queued
    // when it is terminally cancelled.
    state.globalPaused = true
    state.releaseAnswer = 'CANCELLED'
    const r = await get()
    expect(r.status, 'the release, not the checkpoint, decides the outcome').toBe('cancelled')
    expect(r.status).not.toBe('deferred_by_stop')
  })

  it('a genuine FENCED is still reported as fenced', async () => {
    // Non-vacuity: the ERROR cases above must not pass merely because the drain
    // stopped saying `fenced` at all.
    state.rotatedTo = 'someone-else'
    const r = await get()
    expect(r.status).toBe('fenced')
  })

  it('a normal STOP still defers', async () => {
    state.globalPaused = true
    const r = await get()
    expect(r.status).toBe('deferred_by_stop')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('G3C-3B · unified executor steps', () => {
  const exec = async () => {
    const m = await import('@/lib/ai/workflow-executor')
    return m.executeRunSteps(anyDb(), RUN, PROJ, STEPS as never, { claimId: CLAIM })
  }
  const kindOf = async (): Promise<string> => {
    const g = await import('@/lib/governance/run-execution-checkpoint')
    try { await exec(); return 'NO_THROW' } catch (e) {
      if (g.isRunLifecycleWriteError(e)) return 'LIFECYCLE_ERROR'
      if (g.isRunCheckpointRefusal(e)) return `REFUSAL:${e.refusal}`
      return `OTHER:${String((e as Error).message).slice(0, 40)}`
    }
  }

  it('CANCELLED + failed write → RunLifecycleWriteError, not fenced', async () => {
    state.run.cancel_requested = true
    state.updateFails = true
    expect(await kindOf()).toBe('LIFECYCLE_ERROR')
    assertInert()
  })

  it('STOPPED + failed release → RunLifecycleWriteError, not a stop refusal', async () => {
    state.globalPaused = true
    state.rpcFails = true
    expect(await kindOf()).toBe('LIFECYCLE_ERROR')
    assertInert()
  })

  it('STOPPED whose release CANCELS surfaces cancellation, not a stop refusal', async () => {
    state.globalPaused = true
    state.releaseAnswer = 'CANCELLED'
    const k = await kindOf()
    expect(k, 'the cancel sentinel, not RunCheckpointRefusedError(STOPPED)')
      .toMatch(/^OTHER:.*cancelled/)
  })

  it('an ordinary STOP is still a STOPPED refusal', async () => {
    state.globalPaused = true
    expect(await kindOf()).toBe('REFUSAL:STOPPED')
  })

  it('H1_CANCEL=1 cannot revive the obsolete cancellation taxonomy', async () => {
    // G3C-3B removed the H1.P5 cooperative branch that sat immediately before
    // the canonical checkpoint. It was inert only because the flag is unset:
    // enabling it would have let `fencedRunUpdate` PREEMPT the checkpoint and
    // collapse a failed lifecycle write back into FENCED.
    //
    // With the flag ON, a cancelled run whose terminalizing write fails must
    // still travel the canonical path and report a lifecycle error.
    process.env.H1_CANCEL = '1'
    try {
      state.run.cancel_requested = true
      state.updateFails = true
      expect(await kindOf(), 'the canonical path owns this, flag or no flag')
        .toBe('LIFECYCLE_ERROR')
      assertInert()
    } finally {
      delete process.env.H1_CANCEL
    }
  })

  it('H1_CANCEL=1 still cancels normally through the canonical path', async () => {
    // Non-vacuity for the case above: with the flag on and the write healthy,
    // cancellation still works — it simply goes through one boundary now.
    process.env.H1_CANCEL = '1'
    try {
      state.run.cancel_requested = true
      const k = await kindOf()
      expect(k).toMatch(/^OTHER:.*cancelled/)
      expect(state.run.status).toBe('cancelled')
    } finally {
      delete process.env.H1_CANCEL
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('G3C-3B · legacy runner steps', () => {
  const kindOf = async (): Promise<string> => {
    const m = await import('@/lib/ai/workflow-runner')
    const g = await import('@/lib/governance/run-execution-checkpoint')
    try {
      await m.runSteps(anyDb(), RUN, PROJ, STEPS as never, {}, CLAIM)
      return 'NO_THROW'
    } catch (e) {
      if (g.isRunLifecycleWriteError(e)) return 'LIFECYCLE_ERROR'
      if (g.isRunCheckpointRefusal(e)) return `REFUSAL:${e.refusal}`
      return `OTHER:${String((e as Error).message).slice(0, 40)}`
    }
  }

  it('CANCELLED + failed write → lifecycle error, NOT successful cancellation', async () => {
    // The runner previously discarded the terminalize result and rethrew the
    // ORIGINAL CANCELLED refusal, so a failed write was reported as a completed
    // cancellation.
    state.run.cancel_requested = true
    state.updateFails = true
    expect(await kindOf()).toBe('LIFECYCLE_ERROR')
    assertInert()
  })

  it('STOPPED + failed release → lifecycle error, NOT a stop refusal', async () => {
    state.globalPaused = true
    state.rpcFails = true
    expect(await kindOf()).toBe('LIFECYCLE_ERROR')
    assertInert()
  })

  it('CANCELLED whose write is FENCED reports fencing, not cancellation', async () => {
    state.run.cancel_requested = true
    state.rotatedTo = 'someone-else'
    expect(await kindOf()).toBe('REFUSAL:FENCED')
  })

  it('STOPPED whose release CANCELS reports cancellation', async () => {
    state.globalPaused = true
    state.releaseAnswer = 'CANCELLED'
    expect(await kindOf()).toBe('REFUSAL:CANCELLED')
  })

  it('an ordinary cancellation is still a CANCELLED refusal', async () => {
    state.run.cancel_requested = true
    expect(await kindOf()).toBe('REFUSAL:CANCELLED')
  })
})
