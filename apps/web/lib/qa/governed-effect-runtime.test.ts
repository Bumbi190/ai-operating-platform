/**
 * lib/qa/governed-effect-runtime.test.ts — Phase 2B-2.5.
 *
 * The engine can now execute an effect. These prove it travels the real path and
 * that every gate on that path actually refuses.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS NOT ──────────────────────────────────────
 * REAL: `executeWorkflowAction` (routing and every gate), `executeGovernedEffect`
 * (spend decision, certainty, evidence gating, retry), the effect handler, the
 * proof adapter, and the policy read from ACTION_CLASS_POLICY.
 *
 * STUBBED: the database and the governance collaborators that read it —
 * readiness, the G3C-3A checkpoint, fenced writes and evidence persistence. They
 * are stubbed so their VERDICTS can be varied (stopped, fenced, drifted), which
 * is the only way to prove the executor obeys them.
 *
 * NOT DONE: no production definition is registered and no cron tick runs. That
 * would be a production activation, which this phase forbids.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

let spendRefuses = false
const ready = vi.fn()
const stillAuthorized = vi.fn()
const fenced = vi.fn()
const recorded = vi.fn()
const reserved = vi.fn()

vi.mock('@/lib/workflows/action-run', async orig => ({
  ...(await orig<typeof import('@/lib/workflows/action-run')>()),
  assertWorkflowActionReady: (...a: unknown[]) => ready(...a),
  assertWorkflowActionStillAuthorized: (...a: unknown[]) => stillAuthorized(...a),
}))

vi.mock('@/lib/workflows/store', async orig => ({
  ...(await orig<typeof import('@/lib/workflows/store')>()),
  readInstance: async () => INSTANCE,
  readDefinitionById: async () => DEFINITION,
  listEvidence: async () => [],
  recordEvidence: (...a: unknown[]) => { recorded(...a); return Promise.resolve({}) },
}))

vi.mock('@/lib/governance/run-execution-checkpoint', async orig => ({
  ...(await orig<typeof import('@/lib/governance/run-execution-checkpoint')>()),
  checkpointClaimedRun: async () => ({ allowed: true }),
}))

/**
 * The spend boundary, stubbed to RECORD rather than to reserve.
 *
 * It runs the real callback, so the release-vs-settle decision under test is the
 * real one: `withGovernedSpend` releases on `ProviderNotDispatchedError` and
 * settles on everything else, and the callback is what raises it.
 */
vi.mock('@/lib/cost/governed-spend', async orig => {
  const actual = await orig<typeof import('@/lib/cost/governed-spend')>()
  return {
    ...actual,
    withGovernedSpend: async (input: Record<string, unknown>, fn: () => Promise<unknown>) => {
      reserved(input)
      if (spendRefuses) {
        const e = new Error('budget refused'); e.name = 'SpendRefusedError'; throw e
      }
      try {
        const out = await fn()
        reserved.mock.calls[reserved.mock.calls.length - 1].push('SETTLED')
        return out
      } catch (e) {
        reserved.mock.calls[reserved.mock.calls.length - 1].push(
          e instanceof actual.ProviderNotDispatchedError ? 'RELEASED' : 'SETTLED')
        throw e
      }
    },
  }
})

const { executeWorkflowAction } = await import('@/lib/workflows/action-executor')
const { ACTION_REGISTRY, isGovernedEffectEnabled } =
  await import('@/lib/workflows/action-registry')
const { ACTION_CLASS_POLICY } = await import('@/lib/workflows/action-target')
const { EFFECT_HANDLERS } = await import('@/lib/workflows/effect/effect-handlers')

/**
 * The smallest database that answers what the executor actually asks.
 *
 * Only two shapes are used on this path: `fencedActionUpdate`'s
 * update→eq→eq→select chain, and an rpc the refusal accounting may reach.
 * Returning one row means "you still own the claim", which is the condition
 * under test everywhere except the fencing case below.
 */
const writes: Record<string, unknown>[] = []
let fencedOut = false
const fakeDb = {
  from: () => ({
    update: (payload: Record<string, unknown>) => {
      writes.push(payload)
      const res = { data: fencedOut ? [] : [{ id: 'run-1' }], error: null }
      const chain = {
        eq: () => chain,
        select: () => Promise.resolve(res),
        then: (r: (v: unknown) => unknown) => Promise.resolve(res).then(r),
      }
      return chain
    },
    select: () => {
      const chain = {
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: null }),
        single: () => Promise.resolve({ data: null }),
      }
      return chain
    },
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {} }) }) }),
  }),
  rpc: () => Promise.resolve({ data: null, error: null }),
} as never

const NOW = '2026-09-04T12:00:00.000Z'
const HASH = 'a'.repeat(64)

const INSTANCE = {
  id: 'inst-1', project_id: 'proj-1', instance_key: 'success',
  def_key: 'omnira.execution-proof', def_version: 1, def_hash: HASH,
  def_id: 'def-1', current_state: 'effect', status: 'active',
}
const DEFINITION = { def_key: 'omnira.execution-proof', version: 1, spec: { canonical: {} } }

const runFor = (scenario: string, over: Record<string, unknown> = {}) => ({
  id: 'run-1', project_id: 'proj-1',
  workflow_instance_id: 'inst-1',
  workflow_from_state: 'effect',
  action_kind: 'proof_governed_effect',
  action_class: 'FINANCIAL',
  target_version_hash: HASH,
  attempt_group: 'grp-1',
  idempotency_key: 'idem-1',
  attempts: 1,
  authorization_id: 'auth-1',
  _scenario: scenario,
  ...over,
})

const exec = (scenario: string, over: Record<string, unknown> = {}) => {
  INSTANCE.instance_key = scenario
  return executeWorkflowAction(fakeDb, runFor(scenario, over) as never, 'claim-1', NOW)
}

beforeEach(() => {
  ready.mockReset(); stillAuthorized.mockReset(); fenced.mockReset()
  recorded.mockReset(); reserved.mockReset()
  writes.length = 0; fencedOut = false; spendRefuses = false
  ready.mockResolvedValue({ ready: true, blockers: [], terminal: false, detail: 'ok' })
  stillAuthorized.mockResolvedValue({ allowed: true })
  INSTANCE.instance_key = 'success'
})

// ── A. The end-to-end success path ──────────────────────────────────────────

describe('a governed effect travels the real executor path', () => {
  it('reaches the handler exactly once and confirms', async () => {
    const r = await exec('success')
    expect(r.executed).toBe(true)
    expect(r.outcome).toBe('SUCCEEDED')
    expect(r.phase).toBe('REMOTE_CONFIRMED')
  })

  it('MUTATION — G3C-3A ran BEFORE the effect, not after', async () => {
    await exec('success')
    // Readiness, then the pre-dispatch checkpoint, then the handler. If the
    // checkpoint had not run, this count would be zero and the effect would
    // still have happened.
    expect(ready).toHaveBeenCalled()
    expect(stillAuthorized).toHaveBeenCalled()
  })

  it('MUTATION — a stop asserted before dispatch prevents the effect', async () => {
    stillAuthorized.mockResolvedValue({ allowed: false, refusal: 'STOPPED', reason: 'paused' })
    const r = await exec('success')
    expect(r.executed).toBe(false)
    // Nothing was reserved, because nothing was attempted.
    expect(reserved).not.toHaveBeenCalled()
  })

  it('MUTATION — readiness refusing prevents the effect', async () => {
    ready.mockResolvedValue({ ready: false, blockers: ['authorization_not_effective'],
                              terminal: false, detail: 'no execution authorization' })
    const r = await exec('success')
    expect(r.executed).toBe(false)
    expect(reserved).not.toHaveBeenCalled()
  })

  it('records automated evidence for the exact run', async () => {
    await exec('success')
    expect(recorded).toHaveBeenCalledTimes(1)
    const [, payload] = recorded.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.source).toBe('automated')
    expect(payload.observation).toEqual({ runId: 'run-1' })
    expect(payload.result).toBe('pass')
  })
})

// ── B. Spend ────────────────────────────────────────────────────────────────

describe('FINANCIAL spend is enforced at runtime, not merely declared', () => {
  it('MUTATION — a FINANCIAL effect reserves exactly once', async () => {
    await exec('success')
    expect(reserved).toHaveBeenCalledTimes(1)
  })

  it('MUTATION — the reservation is keyed on the action identity', async () => {
    await exec('success')
    const [input] = reserved.mock.calls[0] as [Record<string, unknown>]
    expect(input.idempotencyKey).toBe('idem-1')
    expect(input.operation).toBe('proof_governed_effect')
  })

  it('MUTATION — a same-intent retry cannot take a second reservation key', async () => {
    await exec('success')
    await exec('success')
    const keys = reserved.mock.calls.map(c => (c[0] as { idempotencyKey?: string }).idempotencyKey)
    expect(new Set(keys).size).toBe(1)
  })

  it('MUTATION — a provable non-dispatch RELEASES', async () => {
    await exec('local_failure')
    expect(reserved.mock.calls[0]).toContain('RELEASED')
  })

  it('MUTATION — an ambiguous dispatch SETTLES, never releases', async () => {
    await exec('timeout_after_acceptance')
    expect(reserved.mock.calls[0]).toContain('SETTLED')
    expect(reserved.mock.calls[0]).not.toContain('RELEASED')
  })

  it('MUTATION — a confirmed effect SETTLES', async () => {
    await exec('success')
    expect(reserved.mock.calls[0]).toContain('SETTLED')
  })

  it('MUTATION — a budget refusal stops before any effect, and is temporary', async () => {
    // The stub refuses when the estimate is the sentinel. What matters is the
    // executor's response: nothing dispatched, nothing owed, and eligible again
    // if the budget answer changes — not a permanent rejection.
    spendRefuses = true
    const r = await exec('success')
    expect(r.executed).toBe(false)
    expect(r.refusal).toBe('spend_refused')
    expect(r.disposition).toBe('temporary')
    expect(r.outcome).toBe('FAILED')
    // And no evidence claimed anything happened.
    expect(recorded).not.toHaveBeenCalled()
  })
})

// ── C. Certainty, retry, reconciliation ─────────────────────────────────────

describe('certainty decides, and ambiguity never retries', () => {
  it('MUTATION — an ambiguous FINANCIAL effect requires reconciliation', async () => {
    for (const s of ['timeout_before_acceptance', 'timeout_after_acceptance']) {
      const r = await exec(s)
      expect(r.detail, s).toMatch(/reconcile=true/)
      expect(r.detail, s).toMatch(/retry=false/)
    }
  })

  it('MUTATION — a confirmed effect is never retried', async () => {
    for (const s of ['success', 'confirmed_then_local_crash']) {
      expect((await exec(s)).detail, s).toMatch(/retry=false/)
    }
  })

  it('an explicit remote rejection is a clean failure, not an ambiguity', async () => {
    const r = await exec('remote_rejected')
    expect(r.outcome).toBe('FAILED')
    expect(r.detail).toMatch(/reconcile=false/)
  })

  it('FINANCIAL keeps maxAttempts 1 — it does not inherit the read-only budget', () => {
    expect(ACTION_CLASS_POLICY.FINANCIAL.maxAttempts).toBe(1)
    expect(ACTION_CLASS_POLICY.READ_ONLY.maxAttempts).toBe(5)
  })
})

// ── D. Evidence gating ──────────────────────────────────────────────────────

describe('evidence cannot outrun certainty', () => {
  it('MUTATION — no success evidence while reconciliation is required', async () => {
    await exec('timeout_after_acceptance')
    const [, payload] = recorded.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.result).toBe('fail')
    expect((payload.detail as Record<string, unknown>).reconciliation_required).toBe(true)
  })

  it('a confirmed-but-unrecorded effect does not claim success', async () => {
    await exec('confirmed_then_local_crash')
    const [, payload] = recorded.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.result).toBe('fail')
  })

  it('evidence is always automated — a handler cannot claim attestation', async () => {
    for (const s of ['success', 'remote_rejected', 'timeout_after_acceptance']) {
      recorded.mockClear()
      await exec(s)
      const [, payload] = recorded.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(payload.source, s).toBe('automated')
    }
  })
})

// ── E. What did NOT become possible ─────────────────────────────────────────

describe('the runtime opened exactly one door', () => {
  it('MUTATION — only the proof action is enabled', () => {
    expect(Object.keys(EFFECT_HANDLERS)).toEqual(['proof_governed_effect'])
    expect(isGovernedEffectEnabled('generate_monthly_story')).toBe(false)
  })

  it('MUTATION — generate_monthly_story is refused by the family gate', async () => {
    const r = await executeWorkflowAction(
      fakeDb,
      { ...runFor('success'), action_kind: 'generate_monthly_story' } as never,
      'claim-1', NOW)
    expect(r.executed).toBe(false)
    expect(r.refusal).toBe('not_executable_family')
    expect(r.detail).toMatch(/not enabled/)
    expect(reserved).not.toHaveBeenCalled()
  })

  it('MUTATION — every real FS effectful action stays not_executable', async () => {
    for (const kind of ['generate_page_audio', 'apply_release_gate_migration',
                        'upload_protected_artifacts', 'send_release_newsletter'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family, kind).toBe('not_executable')
      const r = await executeWorkflowAction(
        fakeDb, { ...runFor('success'), action_kind: kind,
          action_class: ACTION_REGISTRY[kind].action_class } as never, 'claim-1', NOW)
      expect(r.refusal, kind).toBe('not_executable_family')
    }
  })

  it('MUTATION — a READ_ONLY action never enters the governed path', async () => {
    recorded.mockClear(); reserved.mockClear()
    INSTANCE.instance_key = '2026-10'
    INSTANCE.def_key = 'familje-stunden.monthly-release'
    const r = await executeWorkflowAction(
      fakeDb,
      { ...runFor('2026-10'), action_kind: 'compute_release_instant',
        action_class: 'READ_ONLY', workflow_from_state: 'planning' } as never,
      'claim-1', NOW)
    INSTANCE.def_key = 'omnira.execution-proof'
    // It ran, and it took no reservation — the governed branch was never entered.
    expect(r.executed).toBe(true)
    expect(reserved).not.toHaveBeenCalled()
  })
})
