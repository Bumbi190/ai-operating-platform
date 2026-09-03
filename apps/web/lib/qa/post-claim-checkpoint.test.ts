/**
 * G3C-3A — the canonical post-claim execution checkpoint.
 *
 * G3C-2A closed ADMISSION: after a pause commits, nothing new is claimed. These
 * prove the window it does not own — the run claimed one second BEFORE the
 * pause, which is already holding a lease and about to start its next step.
 *
 * Three refusals, three different handlings, and none of them a provider
 * failure. That separation is the thing under test; collapsing them is the
 * regression these guard against.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const state = {
  run: {} as Row,
  globalPaused: false,
  projectPaused: false,
  stopReadFails: false,
  updates: [] as { payload: Row; predicates: Row }[],
  runReadFails: false,
}

/** Minimal Supabase double: the run row, the stop RPC, and recorded updates. */
function db() {
  const builder = (table: string) => {
    const predicates: Row = {}
    let payload: Row | null = null
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (p: Row) => { payload = p; return chain },
      eq: (col: string, val: unknown) => { predicates[col] = val; return chain },
      is: () => chain,
      maybeSingle: async () => {
        if (table === 'runs') {
          if (state.runReadFails) return { data: null, error: { message: 'read failed' } }
          return { data: state.run, error: null }
        }
        return { data: null, error: null }
      },
      then: undefined,
    }
    // `update(...).eq(...).eq(...).select()` resolves to the affected rows.
    ;(chain as { select: unknown }).select = () => {
      if (payload === null) return chain
      const matches =
        (predicates.id === undefined || predicates.id === state.run.id) &&
        (predicates.status === undefined || predicates.status === state.run.status) &&
        (predicates.claim_id === undefined || predicates.claim_id === state.run.claim_id)
      state.updates.push({ payload: payload as Row, predicates: { ...predicates } })
      if (matches) Object.assign(state.run, payload)
      return Promise.resolve({ data: matches ? [{ id: state.run.id }] : [], error: null })
    }
    return chain
  }
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      if (fn === 'stop_state') {
        if (state.stopReadFails) return { data: null, error: { message: 'unavailable' } }
        // Exactly the StopStateRow shape the resolver expects. project_requested
        // and project_found are load-bearing: without them the resolver cannot
        // establish the project half and correctly answers "unavailable".
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
const anyDb = () => db() as any

const RUN = 'run-1'
const CLAIM = 'claim-aaa'
const PROJ = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  state.run = {
    id: RUN, status: 'running', claim_id: CLAIM,
    cancel_requested: false, project_id: PROJ,
  }
  state.globalPaused = false
  state.projectPaused = false
  state.stopReadFails = false
  state.runReadFails = false
  state.updates = []
})

async function checkpoint(over: Record<string, unknown> = {}) {
  const { checkpointClaimedRun } = await import('@/lib/governance/run-execution-checkpoint')
  return checkpointClaimedRun(anyDb(), {
    runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'test', ...over,
  } as never)
}

describe('G3C-3A · the checkpoint establishes fresh truth', () => {
  it('clear world → allowed', async () => {
    const v = await checkpoint()
    expect(v.allowed).toBe(true)
  })

  it('GLOBAL stop after claim → STOPPED, with the canonical reason', async () => {
    state.globalPaused = true
    const v = await checkpoint()
    expect(v.allowed).toBe(false)
    expect(v.allowed === false && v.refusal).toBe('STOPPED')
    expect(v.allowed === false && v.refusal === 'STOPPED' && v.reason)
      .toBe('global_automation_paused')
  })

  it('PROJECT stop after claim → STOPPED', async () => {
    state.projectPaused = true
    const v = await checkpoint()
    expect(v.allowed === false && v.refusal).toBe('STOPPED')
    expect(v.allowed === false && v.refusal === 'STOPPED' && v.reason)
      .toBe('project_execution_paused')
  })

  it('stop authority UNREADABLE → fails CLOSED, never "assume clear"', async () => {
    // The whole point of a kill switch: not knowing is not permission. This is
    // deliberately unlike isCancelRequested, whose read failure returns false.
    state.stopReadFails = true
    const v = await checkpoint()
    expect(v.allowed).toBe(false)
    expect(v.allowed === false && v.refusal).toBe('STOPPED')
    expect(v.allowed === false && v.refusal === 'STOPPED' && v.reason)
      .toBe('stop_state_unavailable')
  })

  it('cancellation → CANCELLED, and NOT gated on H1_CANCEL', async () => {
    const prev = process.env.H1_CANCEL
    delete process.env.H1_CANCEL          // the production configuration
    state.run.cancel_requested = true
    const v = await checkpoint()
    if (prev !== undefined) process.env.H1_CANCEL = prev
    expect(v.allowed === false && v.refusal).toBe('CANCELLED')
  })

  it('rotated claim → FENCED, and fencing is decided BEFORE cancel or stop', async () => {
    // A stale worker must not get to act on anything it believes — including a
    // cancellation it would otherwise "helpfully" terminalize on the new owner.
    state.run.claim_id = 'claim-someone-else'
    state.run.cancel_requested = true
    state.globalPaused = true
    const v = await checkpoint()
    expect(v.allowed === false && v.refusal).toBe('FENCED')
  })

  it('no claim at all → FENCED; never-having-owned is not permission', async () => {
    const v = await checkpoint({ claimId: null })
    expect(v.allowed === false && v.refusal).toBe('FENCED')
  })

  it('run no longer running → FENCED', async () => {
    state.run.status = 'done'
    const v = await checkpoint()
    expect(v.allowed === false && v.refusal).toBe('FENCED')
  })

  it('run row UNREADABLE → FENCED, not allowed', async () => {
    state.runReadFails = true
    const v = await checkpoint()
    expect(v.allowed === false && v.refusal).toBe('FENCED')
  })

  it('the checkpoint itself mutates nothing', async () => {
    state.globalPaused = true
    await checkpoint()
    expect(state.updates, 'decision-only by design').toEqual([])
  })
})

describe('G3C-3A · ownership-conditioned lifecycle writes', () => {
  it('release hands a stopped run back to pending — no error, no failure', async () => {
    const { releaseStoppedRun } = await import('@/lib/governance/run-execution-checkpoint')
    const r = await releaseStoppedRun(anyDb(), RUN, CLAIM)
    expect(r).toEqual({ released: true, fenced: false })
    const w = state.updates.at(-1)!
    expect(w.payload.status).toBe('pending')
    expect(w.payload.claim_id).toBeNull()
    expect(w.payload, 'a stop is not a failure — no error text').not.toHaveProperty('error')
    expect(w.payload, 'and no attempt bookkeeping').not.toHaveProperty('attempts')
    expect(w.predicates, 'conditioned on still owning it')
      .toEqual({ id: RUN, status: 'running', claim_id: CLAIM })
  })

  it('release under a rotated claim is FENCED, not a silent success', async () => {
    const { releaseStoppedRun } = await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'other'
    const r = await releaseStoppedRun(anyDb(), RUN, CLAIM)
    expect(r).toEqual({ released: false, fenced: true })
    expect(state.run.status, 'the new owner’s run is untouched').toBe('running')
  })

  it('cancel terminalizes only under the same claim', async () => {
    const { terminalizeCancelledRun } = await import('@/lib/governance/run-execution-checkpoint')
    const r = await terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(r).toEqual({ cancelled: true, fenced: false })
    expect(state.run.status).toBe('cancelled')
  })

  it('a zero-row cancel write is FENCING, never a successful cancellation', async () => {
    const { terminalizeCancelledRun } = await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'other'
    const r = await terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(r.cancelled).toBe(false)
    expect(r.fenced).toBe(true)
    expect(state.run.status).toBe('running')
  })

  it('neither write is attempted without a claim', async () => {
    const m = await import('@/lib/governance/run-execution-checkpoint')
    expect(await m.releaseStoppedRun(anyDb(), RUN, null)).toEqual({ released: false, fenced: true })
    expect(await m.terminalizeCancelledRun(anyDb(), RUN, null)).toEqual({ cancelled: false, fenced: true })
    expect(state.updates, 'no claim, no write').toEqual([])
  })
})

describe('G3C-3A · the refusal is control flow, never a provider failure', () => {
  it('the error carries the distinction rather than flattening it', async () => {
    const { RunCheckpointRefusedError, isRunCheckpointRefusal } =
      await import('@/lib/governance/run-execution-checkpoint')
    for (const r of ['FENCED', 'CANCELLED', 'STOPPED'] as const) {
      const e = new RunCheckpointRefusedError(r, 'detail', 'boundary')
      expect(isRunCheckpointRefusal(e)).toBe(true)
      expect(e.refusal).toBe(r)
      expect(e.name).toBe('RunCheckpointRefusedError')
    }
  })

  it('an ordinary provider error is NOT mistaken for a checkpoint refusal', async () => {
    const { isRunCheckpointRefusal } = await import('@/lib/governance/run-execution-checkpoint')
    expect(isRunCheckpointRefusal(new Error('502 upstream'))).toBe(false)
    expect(isRunCheckpointRefusal(new Error('ECONNRESET'))).toBe(false)
  })
})

describe('G3C-3A · a re-claimed cancelled run cannot begin work', () => {
  it('cancel_requested survives a reaper requeue and the checkpoint sees it', async () => {
    // G3C-3B will teach the reaper about cancel_requested. Until then the
    // application layer is what stops a requeued-and-reclaimed run from
    // executing, so it must catch the flag on the very first checkpoint.
    state.run.status = 'running'          // reclaimed by claim_runs
    state.run.claim_id = CLAIM            // with a fresh token
    state.run.cancel_requested = true     // the flag the reaper left behind
    const v = await checkpoint()
    expect(v.allowed, 'no execution-bearing unit may begin').toBe(false)
    expect(v.allowed === false && v.refusal).toBe('CANCELLED')
  })
})

// ══ CF · CANCEL DURING THE FINAL IN-FLIGHT UNIT ═════════════════════════════

/**
 * The race the per-step checkpoint cannot cover.
 *
 *   T1  the final step's checkpoint says allowed
 *   T2  the final execution-bearing unit begins
 *   T3  cancel_requested commits WHILE it is in flight
 *   T4  the unit returns successfully
 *   T5  there is no next step, so no further checkpoint runs
 *   T6  the worker prepares terminal `done`
 *
 * If T6 can write `done` without re-observing cancellation, then the cancel
 * route's `enforced: true` is false advertising. checkOwnedFinalization is the
 * boundary that closes it.
 */
describe('CF · the final owned boundary linearizes cancel against success', () => {
  const finalize = async () => {
    const m = await import('@/lib/governance/run-execution-checkpoint')
    return m.checkOwnedFinalization(anyDb(), RUN, CLAIM)
  }

  it('CF1 — CANCEL WINS: cancel lands mid-flight, the run does not become done', async () => {
    // The unit already ran and succeeded; the cancellation committed while it
    // was on the wire.
    state.run.cancel_requested = true
    expect(await finalize()).toBe('CANCELLED')

    const { terminalizeCancelledRun } = await import('@/lib/governance/run-execution-checkpoint')
    const r = await terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(r.cancelled).toBe(true)
    expect(state.run.status, 'cancelled, never done').toBe('cancelled')
    // And nothing about this is a provider failure.
    expect(state.updates.some(u => 'error' in u.payload || 'last_error' in u.payload)).toBe(false)
  })

  it('CF2 — DONE WINS: terminal success first, a later cancel affects zero rows', async () => {
    const { terminalizeOwnedRun, terminalizeCancelledRun } =
      await import('@/lib/governance/run-execution-checkpoint')
    // Success commits first, under ownership.
    const done = await terminalizeOwnedRun(anyDb(), RUN, CLAIM, {
      status: 'done', finished_at: 'now', claimed_at: null, lease_until: null,
    })
    expect(done).toEqual({ written: true, fenced: false })
    expect(state.run.status).toBe('done')

    // The cancellation arrives afterwards. request_run_cancel is status-guarded
    // to pending/running in SQL, and the owned terminalizer requires running.
    const late = await terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(late.cancelled, 'completed work is never retroactively rewritten').toBe(false)
    expect(late.fenced).toBe(true)
    expect(state.run.status).toBe('done')
  })

  it('CF3 — FENCE WINS: a rotated claim writes neither done nor cancelled', async () => {
    const m = await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'claim-new-owner'

    expect(await finalize()).toBe('FENCED')

    const done = await m.terminalizeOwnedRun(anyDb(), RUN, CLAIM, { status: 'done' })
    const cancelled = await m.terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(done).toEqual({ written: false, fenced: true })
    expect(cancelled.cancelled).toBe(false)
    expect(state.run.status, 'the new owner’s run is untouched').toBe('running')
  })

  it('CONTINUE_FINALIZATION when owned and uncancelled', async () => {
    expect(await finalize()).toBe('CONTINUE_FINALIZATION')
  })

  it('the finalization boundary does NOT consult governance stop', async () => {
    // A stop arriving AFTER the work finished must not discard the result or
    // push the run back to pending, where a resume could execute it twice.
    state.globalPaused = true
    state.projectPaused = true
    expect(await finalize(), 'a completed run still finalizes honestly')
      .toBe('CONTINUE_FINALIZATION')
  })

  it('unreadable ownership at finalization is FENCED, never a licence to write', async () => {
    state.runReadFails = true
    expect(await finalize()).toBe('FENCED')
  })

  it('the terminal success write is ownership-conditioned, not a bare id match', async () => {
    const { terminalizeOwnedRun } = await import('@/lib/governance/run-execution-checkpoint')
    await terminalizeOwnedRun(anyDb(), RUN, CLAIM, { status: 'done' })
    const w = state.updates.at(-1)!
    expect(w.predicates, 'a read then an unconditional write is not ownership')
      .toEqual({ id: RUN, status: 'running', claim_id: CLAIM })
  })
})
