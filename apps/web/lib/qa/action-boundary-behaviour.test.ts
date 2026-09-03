/**
 * G3C-3A — the action pre-dispatch boundary, proven BEHAVIOURALLY.
 *
 * These exist because the structural guards were not enough, twice over:
 *
 *  • the original guard inspected the CALLER's ordering and treated the call to
 *    `assertWorkflowActionStillAuthorized` as though the canonical checkpoint
 *    happened at the end of it. It never looked inside, so it passed while the
 *    checkpoint ran BEFORE another readiness read and the returned decision was
 *    already stale — an abstraction-level false proof;
 *
 *  • the replacement guard reads source text, so M15/M16 could die on it alone.
 *    A source pin cannot show that DISPATCH_STARTED was not written or that the
 *    handler was not called.
 *
 * So ACTION-S3 and PROBE-S2 drive the real functions against a database double,
 * with a deterministic barrier that changes the world DURING readiness. No
 * sleeps, and no assertions about source text.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const RUN = 'run-a1'
const CLAIM = 'claim-a1'
const PROJ = '11111111-1111-1111-1111-111111111111'
const INST = '22222222-2222-2222-2222-222222222222'
const DEF = '33333333-3333-3333-3333-333333333333'

const state = {
  run: {} as Row,
  instance: {} as Row,
  def: {} as Row,
  globalPaused: false,
  projectPaused: false,
  /** Fires on every `runs` read; the interleaving lever. */
  onRunRead: undefined as ((n: number) => void) | undefined,
  runReads: 0,
}

/** Serves exactly the tables readiness and the checkpoint consult. */
function db() {
  const builder = (table: string) => {
    const preds: Row = {}
    let payload: Row | null = null
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (p: Row) => { payload = p; return chain },
      eq: (c: string, v: unknown) => { preds[c] = v; return chain },
      is: () => chain, limit: () => chain, order: () => chain,
      maybeSingle: async () => resolve(table, preds),
      single: async () => resolve(table, preds),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(rows(table)).then(ok),
    }
    ;(chain as { select: unknown }).select = () => {
      if (payload === null) return chain
      const hit =
        (preds.id === undefined || preds.id === state.run.id) &&
        (preds.status === undefined || preds.status === state.run.status) &&
        (preds.claim_id === undefined || preds.claim_id === state.run.claim_id) &&
        (preds.cancel_requested === undefined
          || preds.cancel_requested === (state.run.cancel_requested === true))
      if (hit) Object.assign(state.run, payload)
      return Promise.resolve({ data: hit ? [{ id: state.run.id }] : [], error: null })
    }
    return chain
  }
  const rows = (t: string) => {
    if (t === 'workflow_evidence') return { data: [], error: null }
    return { data: [], error: null }
  }
  const resolve = (t: string, _p: Row) => {
    if (t === 'runs') {
      state.runReads += 1
      state.onRunRead?.(state.runReads)
      return { data: { ...state.run }, error: null }
    }
    if (t === 'workflow_instances') return { data: { ...state.instance }, error: null }
    if (t === 'workflow_defs') return { data: { ...state.def }, error: null }
    if (t === 'projects') {
      return { data: { execution_paused: state.projectPaused }, error: null }
    }
    return { data: null, error: null }
  }
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => fn === 'stop_state'
      ? {
          data: [{
            global_paused: state.globalPaused, global_paused_at: null, global_paused_reason: null,
            project_requested: true, project_found: true,
            project_paused: state.projectPaused, project_paused_at: null, project_paused_reason: null,
          }],
          error: null,
        }
      : { data: null, error: null },
  }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const anyDb = () => db() as any

const SPEC = {
  states: [
    { id: 'observing', next_state: 'done', inputs: [] },
    { id: 'done', next_state: null, inputs: [] },
  ],
}

/**
 * The target hash is derived with the SAME function the code under test uses,
 * so readiness legitimately returns ready rather than being forced.
 */
async function seed() {
  const { computeWorkflowActionTarget } = await import('@/lib/workflows/action-target')
  state.instance = {
    id: INST, def_id: DEF, def_key: 'probe-validation', def_version: 1,
    def_hash: 'a'.repeat(64), project_id: PROJ, instance_key: '2099-01',
    current_state: 'observing', status: 'active',
  }
  state.def = { id: DEF, def_key: 'probe-validation', version: 1, def_hash: 'a'.repeat(64), spec: SPEC }
  const target = computeWorkflowActionTarget({
    instance: state.instance as never, spec: SPEC as never, state: 'observing',
    actionKind: 'probe_anonymous_protected_access', actionClass: 'READ_ONLY',
    sideEffectTarget: null, evidence: [], declaredCheckKeys: [],
  })
  state.run = {
    id: RUN, project_id: PROJ, status: 'running', claim_id: CLAIM,
    cancel_requested: false, workflow_instance_id: INST,
    workflow_def_hash: 'a'.repeat(64), workflow_from_state: 'observing',
    action_kind: 'probe_anonymous_protected_access', action_class: 'READ_ONLY',
    target_version_hash: target.versionHash, authorization_id: null,
  }
}

beforeEach(async () => {
  state.globalPaused = false
  state.projectPaused = false
  state.onRunRead = undefined
  state.runReads = 0
  await seed()
})

describe('ACTION-S3 · authority changing DURING readiness is caught before dispatch', () => {
  it('the fixture is honest: readiness genuinely returns ready in a clear world', async () => {
    // If this ever fails, every refusal below would be trivially true and the
    // whole file would prove nothing.
    const { assertWorkflowActionReady } = await import('@/lib/workflows/action-run')
    const r = await assertWorkflowActionReady(anyDb(), RUN)
    expect(r.ready, r.detail).toBe(true)
  })

  it('clear world → the pre-dispatch contract allows', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v.allowed, v.reason).toBe(true)
  })

  it('GLOBAL stop committing during readiness → refused as STOPPED', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    // Read #1 is checkpoint #1. Read #2 is readiness. Flipping there means
    // checkpoint #1 legitimately passed and only checkpoint #2 can catch it.
    state.onRunRead = n => { if (n === 2) state.globalPaused = true }

    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)

    expect(state.runReads, 'a SECOND checkpoint must read the run again after readiness')
      .toBeGreaterThanOrEqual(3)
    expect(v.allowed).toBe(false)
    expect(v.refusal).toBe('STOPPED')
    expect(v.stopReason).toBe('global_automation_paused')
  })

  it('CANCELLATION landing after readiness → caught by checkpoint #2 as CANCELLED', async () => {
    // Readiness checks cancel_requested itself, so a cancellation DURING it is
    // caught there as NOT_READY — also a refusal, just a different label. What
    // only checkpoint #2 can catch is one that lands after readiness has already
    // returned ready, which is read #3.
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    state.onRunRead = n => { if (n === 3) state.run.cancel_requested = true }
    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(state.runReads, 'checkpoint #2 read the run a third time').toBeGreaterThanOrEqual(3)
    expect(v.allowed).toBe(false)
    expect(v.refusal).toBe('CANCELLED')
  })

  it('CLAIM ROTATION during readiness → refused as FENCED', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    state.onRunRead = n => { if (n === 2) state.run.claim_id = 'claim-new-owner' }
    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v.allowed).toBe(false)
    expect(v.refusal).toBe('FENCED')
  })

  it('PROJECT stop landing after readiness → caught by checkpoint #2 as STOPPED', async () => {
    // Same shape as cancellation: readiness reads projects.execution_paused, so
    // it catches a mid-readiness pause itself. Checkpoint #2 owns the window
    // after readiness returned.
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    state.onRunRead = n => { if (n === 3) state.projectPaused = true }
    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v.allowed).toBe(false)
    expect(v.refusal).toBe('STOPPED')
  })

  it('a refusal carries a STOPPED reason, never a NOT_READY flattening', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    state.onRunRead = n => { if (n === 2) state.globalPaused = true }
    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v.refusal, 'a governance stop is temporary control flow, not a rejection')
      .not.toBe('NOT_READY')
  })
})

describe('PROBE-S2 · a mid-probe refusal never enters the failure model', () => {
  /**
   * The executor's catch after DISPATCH_STARTED writes REMOTE_CONFIRMED with an
   * UNKNOWN/PARTIAL outcome and reconciliation_required. A bare Error from
   * `beforeAttempt` landed there and claimed request N's response was lost —
   * when in truth request N+1 was refused before it left.
   */
  it('a typed refusal is recognised; a generic Error is not', async () => {
    const { RunCheckpointRefusedError, isRunCheckpointRefusal } =
      await import('@/lib/governance/run-execution-checkpoint')
    expect(isRunCheckpointRefusal(
      new RunCheckpointRefusedError('STOPPED', 'global_automation_paused', 'probe:before-request'),
    )).toBe(true)
    expect(isRunCheckpointRefusal(new Error('probe halted before next request'))).toBe(false)
  })

  it('request 1 is sent, the stop commits, request 2 never leaves', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    const { RunCheckpointRefusedError } =
      await import('@/lib/governance/run-execution-checkpoint')

    let sent = 0
    // Exactly the executor's beforeAttempt shape.
    const beforeAttempt = async () => {
      const again = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
      if (again.allowed) return
      if (again.refusal && again.refusal !== 'NOT_READY') {
        throw new RunCheckpointRefusedError(again.refusal, again.reason, 'probe:before-request')
      }
      throw new Error(`probe halted before next request: ${again.reason}`)
    }

    const emit = async () => {
      for (let i = 0; i < 4; i++) {
        await beforeAttempt()
        sent++
        if (sent === 1) state.globalPaused = true   // the stop commits after request 1
      }
    }

    await expect(emit()).rejects.toMatchObject({
      name: 'RunCheckpointRefusedError', refusal: 'STOPPED',
    })
    expect(sent, 'request 1 went; request 2 did not').toBe(1)
  })

  it('a cancellation between attempts halts the next request the same way', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    const v0 = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v0.allowed).toBe(true)                    // request 1 was allowed
    state.run.cancel_requested = true                // cancellation lands
    const v1 = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v1.allowed).toBe(false)
    expect(v1.refusal, 'no NEXT attempt begins').toBe('CANCELLED')
  })

  it('a claim rotation between attempts halts the next request as FENCED', async () => {
    const { assertWorkflowActionStillAuthorized } = await import('@/lib/workflows/action-run')
    expect((await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)).allowed).toBe(true)
    state.run.claim_id = 'claim-new-owner'
    const v = await assertWorkflowActionStillAuthorized(anyDb(), RUN, CLAIM, PROJ)
    expect(v.refusal, 'the new owner decides the lifecycle').toBe('FENCED')
  })

  /**
   * SCOPE LIMITATION, stated deliberately.
   *
   * The executable action family is closed to READ_ONLY today. When STOPPED
   * releases the run to `pending`, request 1's observation may be REPEATED after
   * resume. That is acceptable for the anonymous-protection probe: repeating it
   * creates no business-side mutation, and its whole purpose is to be refused.
   *
   * This must NOT be generalized. For MATERIAL_WRITE, FINANCIAL,
   * EXTERNAL_COMMUNICATION or DESTRUCTIVE, a mid-handler stop after partial
   * dispatch belongs to the PR9d outcome/reconciliation model, not to blind
   * replay. That contract is future action-runtime work.
   */
  it('the mid-handler release path is tied to the READ_ONLY lane', async () => {
    const { executableActionKinds } = await import('@/lib/workflows/action-executor')
    const { ACTION_CLASS_POLICY } = await import('@/lib/workflows/action-target')
    // If a non-READ_ONLY kind ever becomes executable, the replay assumption
    // above stops holding and this fails deliberately.
    // Both executable kinds are READ_ONLY today — the HANDLERS map is typed
    // `Record<ExecutableReadOnlyActionKind, …>`, so the lane is closed by the
    // type, not by convention.
    expect(executableActionKinds().sort())
      .toEqual(['compute_release_instant', 'observe_release_gate', 'probe_anonymous_protected_access'])
    expect(ACTION_CLASS_POLICY.READ_ONLY.requiresAuthorization).toBe(false)
    expect(ACTION_CLASS_POLICY.MATERIAL_WRITE.requiresPreCommitRevalidation,
      'writes keep the stricter pre-commit contract').toBe(true)
  })
})

// ══ PROBE-S2 (executor) · the real catch, not a simulated loop ══════════════

/**
 * The previous PROBE-S2 cases built their own `beforeAttempt` inline, so
 * mutating the executor's sentinel left them green — the same abstraction gap
 * these tests exist to close. This drives `executeWorkflowAction` itself, with
 * the adapter mocked to emit two attempts, and asserts on the LIFECYCLE WRITES.
 */
const adapterAttempts = { count: 0 }
vi.mock('@/lib/workflows/adapters/familje-stunden', async () => ({
  // Spread the real module so only the probe is replaced — the adapter also
  // exports the system identifier and the adapter registration, both of which
  // other modules import.
  ...(await vi.importActual<typeof import('@/lib/workflows/adapters/familje-stunden')>(
    '@/lib/workflows/adapters/familje-stunden')),
  checkAnonymousProtectedAccessDenied: async (
    _key: string, now: string, beforeAttempt?: () => Promise<void> | void,
  ) => {
    // Two outbound attempts, each re-authorising — the real adapter's shape.
    for (let i = 0; i < 2; i++) {
      if (beforeAttempt) await beforeAttempt()
      adapterAttempts.count += 1
    }
    return {
      check_key: 'anonymous_protected_access_denied', result: 'pass',
      expected: 'x', observed: 'y', authoritative_system: 'fs', observed_at: now, detail: {},
    }
  },
}))

describe('PROBE-S2 · the executor classifies a mid-probe refusal as control flow', () => {
  it('a STOPPED refusal between attempts never enters the PR9d failure model', async () => {
    const { executeWorkflowAction } = await import('@/lib/workflows/action-executor')
    adapterAttempts.count = 0
    const writes: Row[] = []
    const spy = () => {
      const base = db()
      return {
        ...base,
        from: (t: string) => {
          const c = base.from(t) as Record<string, unknown>
          const origUpdate = c.update as (p: Row) => unknown
          c.update = (p: Row) => { if (t === 'runs') writes.push(p); return origUpdate(p) }
          return c
        },
      } as never
    }

    // The stop commits after the FIRST outbound attempt.
    let attempts = 0
    state.onRunRead = () => {
      // beforeAttempt runs the full pre-dispatch contract, which reads runs.
      // Once the first attempt has been counted, flip authority.
      if (adapterAttempts.count >= 1 && attempts === 0) { attempts = 1; state.globalPaused = true }
    }

    const res = await executeWorkflowAction(
      spy(), state.run as never, CLAIM, new Date().toISOString())

    expect(adapterAttempts.count, 'attempt 1 went out, attempt 2 did not').toBe(1)
    expect(res.executed).toBe(false)
    // The load-bearing assertions: the refusal must not have been laundered into
    // the failure model.
    const phases = writes.map(w => w.action_phase)
    expect(phases, 'no REMOTE_CONFIRMED caused by a governance refusal')
      .not.toContain('REMOTE_CONFIRMED')
    expect(writes.some(w => w.action_outcome === 'UNKNOWN' || w.action_outcome === 'PARTIAL'),
      'a refused NEXT request is not evidence the PREVIOUS response was lost').toBe(false)
    expect(writes.some(w => w.reconciliation_required === true),
      'no reconciliation demanded merely because governance refused').toBe(false)
    expect(writes.some(w => 'last_error' in w),
      'a governance stop is not a provider failure').toBe(false)
    // …and it IS reported as temporary control flow.
    expect(res.disposition).toBe('temporary')
  })

  it('DISPATCH_STARTED is written before the handler, and survives the refusal honestly', async () => {
    // The phase timestamp is real history: attempt 1 genuinely left. The refusal
    // must not rewrite that into "nothing dispatched".
    const { executeWorkflowAction } = await import('@/lib/workflows/action-executor')
    adapterAttempts.count = 0
    const writes: Row[] = []
    const spy = () => {
      const base = db()
      return {
        ...base,
        from: (t: string) => {
          const c = base.from(t) as Record<string, unknown>
          const origUpdate = c.update as (p: Row) => unknown
          c.update = (p: Row) => { if (t === 'runs') writes.push(p); return origUpdate(p) }
          return c
        },
      } as never
    }
    let flipped = false
    state.onRunRead = () => {
      if (adapterAttempts.count >= 1 && !flipped) { flipped = true; state.globalPaused = true }
    }
    await executeWorkflowAction(spy(), state.run as never, CLAIM, new Date().toISOString())

    expect(writes.some(w => w.action_phase === 'DISPATCH_STARTED'),
      'the dispatch that really happened is still recorded').toBe(true)
  })
})
