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
  updates: [] as { payload: Row; predicates: Row; applied: boolean }[],
  runReadFails: false,
  updateFails: false,
  /** Deterministic barrier: fires just before an update is evaluated. */
  beforeUpdate: undefined as (() => void) | undefined,
  /** Deterministic barrier: fires on each runs-row read. */
  beforeRunRead: undefined as (() => void) | undefined,
  /** G3C-3B: makes the lifecycle RPC fault, so ERROR can be told from FENCED. */
  rpcFails: false,
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
          state.beforeRunRead?.()
          if (state.runReadFails) return { data: null, error: { message: 'read failed' } }
          return { data: { ...state.run }, error: null }
        }
        return { data: null, error: null }
      },
      then: undefined,
    }
    // `update(...).eq(...).eq(...).select()` resolves to the affected rows.
    ;(chain as { select: unknown }).select = () => {
      if (payload === null) return chain
      if (state.updateFails) {
        return Promise.resolve({ data: null, error: { message: 'simulated update failure' } })
      }
      // The barrier runs BEFORE the predicates are evaluated, so a test can
      // commit a cancellation inside the window a pre-read cannot see.
      state.beforeUpdate?.()
      const matches =
        (predicates.id === undefined || predicates.id === state.run.id) &&
        (predicates.status === undefined || predicates.status === state.run.status) &&
        (predicates.claim_id === undefined || predicates.claim_id === state.run.claim_id) &&
        (predicates.cancel_requested === undefined
          || predicates.cancel_requested === (state.run.cancel_requested === true))
      state.updates.push({ payload: payload as Row, predicates: { ...predicates }, applied: matches })
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
      if (fn === 'release_stopped_run') {
        // Mirrors public.release_stopped_run: ownership-conditioned, and it reads
        // cancel_requested INSIDE the write rather than before it.
        if (state.rpcFails) return { data: null, error: { message: 'connection lost' } }
        const owned = state.run.status === 'running' && state.run.claim_id === CLAIM
        if (!owned) return { data: 'FENCED', error: null }
        if (state.run.cancel_requested === true) {
          Object.assign(state.run, { status: 'cancelled', claimed_at: null, lease_until: null })
          return { data: 'CANCELLED', error: null }
        }
        Object.assign(state.run, {
          status: 'pending', claimed_at: null, lease_until: null, claim_id: null,
          attempts: Math.max((state.run.attempts as number ?? 1) - 1, 0),
        })
        return { data: 'RELEASED', error: null }
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
  state.updateFails = false
  state.rpcFails = false
  state.beforeUpdate = undefined
  state.beforeRunRead = undefined
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
    state.run.attempts = 1
    const r = await releaseStoppedRun(anyDb(), RUN, CLAIM)
    expect(r).toBe('RELEASED')
    expect(state.run.status).toBe('pending')
    expect(state.run.claim_id, 'a requeued row must lose its claim').toBeNull()
    expect(state.run, 'a stop is not a failure — no error text').not.toHaveProperty('error')
    // G3C-3B: the admission IS compensated now. claim_runs counts admissions and a
    // stop is not an execution attempt — without this a max_attempts=1 material
    // run would strand on its first stop crossing.
    expect(state.run.attempts, 'the released admission is given back').toBe(0)
  })

  it('release under a rotated claim is FENCED, not a silent success', async () => {
    const { releaseStoppedRun } = await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'other'
    const r = await releaseStoppedRun(anyDb(), RUN, CLAIM)
    expect(r).toBe('FENCED')
    expect(state.run.status, 'the new owner’s run is untouched').toBe('running')
  })

  it('G3C-3B · a cancel committing before the release terminalizes, never requeues', async () => {
    // THE R9 SHAPE, at unit level. The checkpoint decided STOP; the cancellation
    // becomes durable before the release lands. A blind requeue here would write
    // `pending + cancel_requested = true` — which claim_runs now refuses and the
    // reaper never sees, because it matches status='running' only. Ownerless.
    const { releaseStoppedRun } = await import('@/lib/governance/run-execution-checkpoint')
    state.run.cancel_requested = true
    const r = await releaseStoppedRun(anyDb(), RUN, CLAIM)
    expect(r, 'the release resolves the cancellation instead of requeueing').toBe('CANCELLED')
    expect(state.run.status).toBe('cancelled')
    expect(
      state.run.status === 'pending' && state.run.cancel_requested === true,
      'the forbidden ownerless state must never be produced',
    ).toBe(false)
  })

  it('G3C-3B · a terminating cancel does NOT hand back an attempt', async () => {
    // Compensation exists to keep a STOPPED run claimable. A cancelled run
    // terminates and is never admitted again, so returning the attempt would be
    // a false ledger entry.
    const { releaseStoppedRun } = await import('@/lib/governance/run-execution-checkpoint')
    state.run.cancel_requested = true
    state.run.attempts = 1
    expect(await releaseStoppedRun(anyDb(), RUN, CLAIM)).toBe('CANCELLED')
    expect(state.run.attempts).toBe(1)
  })

  it('G3C-3B · a database fault reports ERROR — it is not lost ownership', async () => {
    // G3C-3A collapsed this into fenced:true. Safe, but a lie: FENCED is a claim
    // about OWNERSHIP, and it would send an operator hunting a second worker that
    // never existed. The SAFETY behaviour is identical — nothing is written.
    const { releaseStoppedRun, terminalizeCancelledRun } =
      await import('@/lib/governance/run-execution-checkpoint')
    state.rpcFails = true
    state.updateFails = true
    expect(await releaseStoppedRun(anyDb(), RUN, CLAIM)).toBe('ERROR')
    expect(await terminalizeCancelledRun(anyDb(), RUN, CLAIM)).toBe('ERROR')
    expect(state.run.status, 'and still nothing was written').toBe('running')
  })

  it('cancel terminalizes only under the same claim', async () => {
    const { terminalizeCancelledRun } = await import('@/lib/governance/run-execution-checkpoint')
    const r = await terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(r).toBe('CANCELLED')
    expect(state.run.status).toBe('cancelled')
  })

  it('a zero-row cancel write is FENCING, never a successful cancellation', async () => {
    const { terminalizeCancelledRun } = await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'other'
    const r = await terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(r, 'a rotated claim is FENCED — never a successful cancellation').toBe('FENCED')
    expect(state.run.status).toBe('running')
  })

  it('neither write is attempted without a claim', async () => {
    const m = await import('@/lib/governance/run-execution-checkpoint')
    expect(await m.releaseStoppedRun(anyDb(), RUN, null)).toBe('FENCED')
    expect(await m.terminalizeCancelledRun(anyDb(), RUN, null)).toBe('FENCED')
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
    expect(r).toBe('CANCELLED')
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
    expect(late, 'completed work is never retroactively rewritten').toBe('FENCED')
    expect(state.run.status).toBe('done')
  })

  it('CF3 — FENCE WINS: a rotated claim writes neither done nor cancelled', async () => {
    const m = await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'claim-new-owner'

    expect(await finalize()).toBe('FENCED')

    const done = await m.terminalizeOwnedRun(anyDb(), RUN, CLAIM, { status: 'done' })
    const cancelled = await m.terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(done).toEqual({ written: false, fenced: true })
    expect(cancelled).toBe('FENCED')
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

// ══ CF4 · CANCEL INSIDE THE TOCTOU WINDOW ═══════════════════════════════════

/**
 * CF1 proves cancellation that ALREADY EXISTS at finalization entry is honoured.
 * CF4 proves the harder case: cancellation arriving AFTER the finalization read
 * and BEFORE the terminal write.
 *
 *   T1  the worker reaches finalization
 *   T2  a preliminary read observes cancel_requested = false
 *   T3  the worker is held, deterministically, before the success UPDATE
 *   T4  the cancellation commits
 *   T5  the worker resumes
 *   T6  the success CAS attempts its transition
 *
 * With a pre-read as the only guard, T6's predicates (id, status, claim_id) all
 * still match and `done` overwrites a cancellation that committed first. The
 * `cancel_requested = false` predicate inside the same conditional write is what
 * makes that impossible.
 *
 * The barrier is a real hook on the update path — no sleeps.
 */
describe('CF4 · a cancel landing inside the finalization window cannot be overwritten', () => {
  it('CF4 — success CAS misses, cancellation is recognised, status is cancelled', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')

    // T2: a preliminary read sees no cancellation — exactly what
    // checkOwnedFinalization would have observed.
    expect(state.run.cancel_requested).toBe(false)

    // T3/T4: the barrier fires on the FIRST update attempt (the success CAS),
    // committing the cancellation after the read and before the write lands.
    let fired = false
    state.beforeUpdate = () => {
      if (fired) return
      fired = true
      state.run.cancel_requested = true   // the cancellation commits here
    }

    const r = await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, {
      status: 'done', finished_at: 'now', claimed_at: null, lease_until: null,
    })
    state.beforeUpdate = undefined

    expect(r.outcome, 'the cancellation committed first and must win').toBe('CANCELLED')
    expect(state.run.status, 'never done').toBe('cancelled')
    // The success payload must not have been applied at all.
    expect(state.updates.some(u => u.payload.status === 'done' && u.applied)).toBe(false)
  })

  it('the success CAS carries the cancellation predicate, not just ownership', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')
    await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, { status: 'done' })
    const cas = state.updates.find(u => u.payload.status === 'done')!
    expect(cas.predicates, 'ownership AND uncancelled, in one conditional write')
      .toEqual({ id: RUN, status: 'running', claim_id: CLAIM, cancel_requested: false })
  })

  it('SUCCESS WINS: the CAS commits and a later cancel finds no running row', async () => {
    const m = await import('@/lib/governance/run-execution-checkpoint')
    const r = await m.finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, {
      status: 'done', finished_at: 'now', claimed_at: null, lease_until: null,
    })
    expect(r.outcome).toBe('SUCCEEDED')
    expect(state.run.status).toBe('done')

    const late = await m.terminalizeCancelledRun(anyDb(), RUN, CLAIM)
    expect(late, 'completed work is never retroactively rewritten').toBe('FENCED')
    expect(state.run.status).toBe('done')
  })

  it('FENCE WINS: a rotated claim yields FENCED, and no cancellation is claimed', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')
    state.run.claim_id = 'claim-new-owner'
    state.run.cancel_requested = true      // even with a cancellation pending
    const r = await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, { status: 'done' })
    expect(r.outcome, 'a stale worker decides nothing').toBe('FENCED')
    expect(state.run.status).toBe('running')
  })

  it('a database fault is ERROR, never silently FENCED or CANCELLED', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')
    state.updateFails = true
    const r = await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, { status: 'done' })
    state.updateFails = false
    expect(r.outcome, 'a DB fault is not a lifecycle conclusion').toBe('ERROR')
  })

  it('the terminal CAS never consults governance stop', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')
    state.globalPaused = true
    state.projectPaused = true
    const r = await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, {
      status: 'done', finished_at: 'now',
    })
    expect(r.outcome, 'finished work still finalizes honestly').toBe('SUCCEEDED')
  })
})

// ══ ACTION-S3 · authority changing DURING readiness ═════════════════════════

/**
 * The window readiness itself opens.
 *
 *   T1  checkpoint #1 passes
 *   T2  readiness begins its own DB reads
 *   T3  a global stop / cancellation / claim rotation commits
 *   T4  readiness returns ready
 *   T5  the FINAL checkpoint runs
 *
 * With only checkpoint #1 the function returned `allowed` on a world that had
 * already changed. The barrier below mutates authority between the two reads,
 * deterministically — no sleeps.
 */
describe('ACTION-S3 · authority changing during readiness is caught by the final check', () => {
  const flip = (fn: () => void) => {
    // Fires on the SECOND runs-row read: checkpoint #1 has passed and readiness
    // is underway.
    let n = 0
    state.beforeRunRead = () => { if (++n === 2) fn() }
  }

  it('GLOBAL stop committing during readiness → refused', async () => {
    const { checkpointClaimedRun } = await import('@/lib/governance/run-execution-checkpoint')
    flip(() => { state.globalPaused = true })
    const first = await checkpointClaimedRun(anyDb(), {
      runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'first',
    } as never)
    expect(first.allowed, 'checkpoint #1 legitimately passed').toBe(true)
    // …the world then changes, and the FINAL checkpoint is what must catch it.
    const final = await checkpointClaimedRun(anyDb(), {
      runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'action:pre-dispatch:final',
    } as never)
    state.beforeRunRead = undefined
    expect(final.allowed).toBe(false)
    expect(final.allowed === false && final.refusal).toBe('STOPPED')
  })

  it('CANCELLATION committing during readiness → refused', async () => {
    const { checkpointClaimedRun } = await import('@/lib/governance/run-execution-checkpoint')
    const first = await checkpointClaimedRun(anyDb(), {
      runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'first',
    } as never)
    expect(first.allowed).toBe(true)
    state.run.cancel_requested = true
    const final = await checkpointClaimedRun(anyDb(), {
      runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'action:pre-dispatch:final',
    } as never)
    expect(final.allowed === false && final.refusal).toBe('CANCELLED')
  })

  it('CLAIM ROTATION during readiness → refused as FENCED', async () => {
    const { checkpointClaimedRun } = await import('@/lib/governance/run-execution-checkpoint')
    const first = await checkpointClaimedRun(anyDb(), {
      runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'first',
    } as never)
    expect(first.allowed).toBe(true)
    state.run.claim_id = 'claim-new-owner'
    const final = await checkpointClaimedRun(anyDb(), {
      runId: RUN, projectId: PROJ, claimId: CLAIM, boundary: 'action:pre-dispatch:final',
    } as never)
    expect(final.allowed === false && final.refusal).toBe('FENCED')
  })
})

// ══ PROBE-S2 · a mid-probe refusal is control flow, not a lost response ═════

describe('PROBE-S2 · governance refusing request N+1 says nothing about request N', () => {
  it('a STOPPED refusal is a typed sentinel, not a generic handler error', async () => {
    const { RunCheckpointRefusedError, isRunCheckpointRefusal } =
      await import('@/lib/governance/run-execution-checkpoint')
    const sentinel = new RunCheckpointRefusedError('STOPPED', 'global_automation_paused', 'probe:before-request')

    expect(isRunCheckpointRefusal(sentinel), 'the executor catch can recognise it').toBe(true)
    expect(sentinel.refusal).toBe('STOPPED')
    // The distinguishing property: a plain Error would be indistinguishable from
    // a genuine handler fault and would be routed into the failure model.
    expect(isRunCheckpointRefusal(new Error('probe halted before next request'))).toBe(false)
  })

  it('the adapter stops emitting once beforeAttempt throws', async () => {
    // Request 1 is allowed and sent; the stop commits; request 2's beforeAttempt
    // refuses and NO further request leaves.
    let sent = 0
    let allowed = true
    const beforeAttempt = async () => {
      if (!allowed) {
        const { RunCheckpointRefusedError } =
          await import('@/lib/governance/run-execution-checkpoint')
        throw new RunCheckpointRefusedError('STOPPED', 'global_automation_paused', 'probe:before-request')
      }
    }
    const loop = async () => {
      for (let i = 0; i < 4; i++) {
        await beforeAttempt()
        sent++
        if (sent === 1) allowed = false     // the stop commits after request 1
      }
    }
    await expect(loop()).rejects.toMatchObject({ name: 'RunCheckpointRefusedError' })
    expect(sent, 'request 1 went, request 2 did not').toBe(1)
  })

  it('NOT_READY is deliberately NOT flattened into a governance stop', async () => {
    // Authorization, target or state genuinely drifted mid-handler. That is the
    // action failure model's business, not a kill switch.
    const exec = await import('node:fs').then(fs =>
      fs.readFileSync('lib/workflows/action-executor.ts', 'utf8'))
    expect(exec).toContain("again.refusal !== 'NOT_READY'")
  })
})

// ══ APPROVAL-N1 · no stale approval email when cancellation wins ════════════

describe('APPROVAL-N1 · the approval notification follows the CAS', () => {
  it('cancellation winning the awaiting_approval CAS suppresses the notification', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')

    let notified = false
    const notifyApproval = async () => { notified = true }

    // The cancellation lands inside the CAS window.
    state.beforeUpdate = () => { state.run.cancel_requested = true }
    const appr = await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, {
      status: 'awaiting_approval', finished_at: 'now', claimed_at: null, lease_until: null,
    })
    state.beforeUpdate = undefined

    // The drain's ordering: notify ONLY on SUCCEEDED.
    if (appr.outcome === 'SUCCEEDED') await notifyApproval()

    expect(appr.outcome).toBe('CANCELLED')
    expect(state.run.status).toBe('cancelled')
    expect(notified, 'no operator is told to review a cancelled run').toBe(false)
  })

  it('a successful CAS still notifies exactly once', async () => {
    const { finalizeOwnedRunUnlessCancelled } =
      await import('@/lib/governance/run-execution-checkpoint')
    let notified = 0
    const appr = await finalizeOwnedRunUnlessCancelled(anyDb(), RUN, CLAIM, {
      status: 'awaiting_approval', finished_at: 'now', claimed_at: null, lease_until: null,
    })
    if (appr.outcome === 'SUCCEEDED') notified++
    expect(appr.outcome).toBe('SUCCEEDED')
    expect(state.run.status).toBe('awaiting_approval')
    expect(notified).toBe(1)
  })
})
