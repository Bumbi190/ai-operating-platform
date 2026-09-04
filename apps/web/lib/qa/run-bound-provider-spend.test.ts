/**
 * lib/qa/run-bound-provider-spend.test.ts — Phase 2B-2.6.
 *
 * One execution intent, one meaningful reservation, taken by exactly one party.
 *
 * The invariant these hold is the one whose absence stopped Phase 2B-3: an
 * executor reservation of zero looked like governed spend, and a real provider
 * would have taken a second, unbound reservation beside it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const reserved = vi.fn()
const ready = vi.fn()
const stillAuthorized = vi.fn()
const recorded = vi.fn()

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
vi.mock('@/lib/cost/governed-spend', async orig => {
  const actual = await orig<typeof import('@/lib/cost/governed-spend')>()
  return {
    ...actual,
    withGovernedSpend: async (input: Record<string, unknown>, fn: () => Promise<unknown>) => {
      reserved(input)
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
const { SPEND_BOUNDARY_BY_KIND, spendBoundaryOwnerFor, executorReservationIsMeaningful } =
  await import('@/lib/workflows/effect/spend-boundary')
const { GOVERNED_EFFECT_ENABLED_KINDS } = await import('@/lib/workflows/action-registry')
const { PROOF_EFFECT_ESTIMATED_SEK } = await import('@/lib/workflows/effect/proof-adapter')

const NOW = '2026-09-04T12:00:00.000Z'
const HASH = 'a'.repeat(64)
const INSTANCE = {
  id: 'inst-1', project_id: 'proj-1', instance_key: 'success',
  def_key: 'omnira.execution-proof', def_version: 1, def_hash: HASH,
  def_id: 'def-1', current_state: 'effect', status: 'active',
}
const DEFINITION = { def_key: 'omnira.execution-proof', version: 1, spec: { canonical: {} } }
const fakeDb = {
  from: () => ({
    update: () => {
      const res = { data: [{ id: 'run-1' }], error: null }
      const chain = { eq: () => chain, select: () => Promise.resolve(res) }
      return chain
    },
    select: () => { const c = { eq: () => c, maybeSingle: async () => ({ data: null }) }; return c },
  }),
  rpc: async () => ({ data: null, error: null }),
} as never

const runFor = (over: Record<string, unknown> = {}) => ({
  id: 'run-1', project_id: 'proj-1', workflow_instance_id: 'inst-1',
  workflow_from_state: 'effect', action_kind: 'proof_governed_effect',
  action_class: 'FINANCIAL', target_version_hash: HASH, attempt_group: 'grp-1',
  idempotency_key: 'idem-1', attempts: 1, authorization_id: 'auth-1', ...over,
})
const exec = (scenario: string, over: Record<string, unknown> = {}) => {
  INSTANCE.instance_key = scenario
  return executeWorkflowAction(fakeDb, runFor(over) as never, 'claim-1', NOW)
}

beforeEach(() => {
  reserved.mockReset(); ready.mockReset(); stillAuthorized.mockReset(); recorded.mockReset()
  ready.mockResolvedValue({ ready: true, blockers: [], terminal: false, detail: 'ok' })
  stillAuthorized.mockResolvedValue({ allowed: true })
  INSTANCE.instance_key = 'success'
})

// ── A. Exactly one reservation, run-bound, non-zero ─────────────────────────

describe('one intent, one meaningful reservation', () => {
  it('MUTATION — exactly ONE reservation exists for one execution identity', async () => {
    await exec('success')
    expect(reserved).toHaveBeenCalledTimes(1)
  })

  it('MUTATION — its key IS the run execution identity', async () => {
    await exec('success')
    expect((reserved.mock.calls[0][0] as { idempotencyKey?: string }).idempotencyKey)
      .toBe('idem-1')
  })

  it('MUTATION — the amount is non-zero', async () => {
    await exec('success')
    const amount = (reserved.mock.calls[0][0] as { estimatedSek: number }).estimatedSek
    expect(amount).toBeGreaterThan(0)
    expect(amount).toBe(PROOF_EFFECT_ESTIMATED_SEK)
  })

  it('MUTATION — the executor takes NO second reservation', async () => {
    await exec('success')
    const owners = reserved.mock.calls.map(c => (c[0] as { provider: string }).provider)
    // One call, from the adapter boundary. The executor's 'workflow' provider
    // reservation must not appear beside it.
    expect(owners).toEqual(['proof'])
    expect(owners).not.toContain('workflow')
  })

  it('a fresh attempt_group is a different identity', async () => {
    await exec('success')
    await exec('success', { attempt_group: 'grp-2', idempotency_key: 'idem-2' })
    const keys = reserved.mock.calls.map(c => (c[0] as { idempotencyKey: string }).idempotencyKey)
    expect(keys).toEqual(['idem-1', 'idem-2'])
  })

  it('the same intent replays the same key, never a new one', async () => {
    await exec('success'); await exec('success')
    const keys = new Set(reserved.mock.calls.map(
      c => (c[0] as { idempotencyKey: string }).idempotencyKey))
    expect(keys.size).toBe(1)
  })
})

// ── B. Zero-value FINANCIAL governance is impossible ────────────────────────

describe('a FINANCIAL action cannot be governed by a reservation of nothing', () => {
  it('MUTATION — the executor refuses an executor-owned FINANCIAL boundary', async () => {
    // The executor cannot price work it has not performed, so its own estimate is
    // zero. For FINANCIAL that is the ABSENCE of spend governance.
    expect(executorReservationIsMeaningful('FINANCIAL', 0)).toBe(false)
    expect(executorReservationIsMeaningful('FINANCIAL', 0.01)).toBe(true)
  })

  it('a class that enforces no spend is unaffected', () => {
    expect(executorReservationIsMeaningful('READ_ONLY', 0)).toBe(true)
    expect(executorReservationIsMeaningful('MATERIAL_WRITE', 0)).toBe(true)
  })

  it('MUTATION — the guard is wired, not merely defined', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/effect/effect-execution.ts'), 'utf8')
    expect(src).toMatch(/executorReservationIsMeaningful\(/)
    expect(src).toMatch(/executor_estimate_missing/)
  })
})

// ── C. Ownership is closed, typed, and must be proven ───────────────────────

describe('ownership is declared, and a claim must be a fact', () => {
  it('every enabled kind declares an owner', () => {
    for (const kind of GOVERNED_EFFECT_ENABLED_KINDS) {
      expect(spendBoundaryOwnerFor(kind), kind).not.toBeNull()
    }
  })

  it('MUTATION — the proof kind owns its boundary at the adapter', () => {
    expect(SPEND_BOUNDARY_BY_KIND.proof_governed_effect).toBe('trusted_adapter')
  })

  it('an undeclared kind has no owner, so it cannot spend', () => {
    expect(spendBoundaryOwnerFor('generate_monthly_story')).toBeNull()
    expect(spendBoundaryOwnerFor('anything_else')).toBeNull()
  })

  it('MUTATION — a trusted-adapter claim without proof is refused', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/effect/effect-execution.ts'), 'utf8')
    expect(src).toMatch(/adapter_did_not_reserve/)
    expect(src).toMatch(/adapter_reserved_under_wrong_identity/)
    expect(src).toMatch(/observed\.spendReservedUnderKey !== key/)
  })

  it('the proof handler reports the identity it reserved under', async () => {
    await exec('success')
    // It settled, and the executor accepted the result — which it only does when
    // the reported key matches the run's own.
    expect(reserved.mock.calls[0]).toContain('SETTLED')
  })
})

// ── D. Release, settle, ambiguity ───────────────────────────────────────────

describe('the reservation closes the way the certainty model says', () => {
  it('MUTATION — a provable non-dispatch RELEASES', async () => {
    await exec('local_failure')
    expect(reserved.mock.calls[0]).toContain('RELEASED')
  })

  it('an explicit rejection releases AND stays a confirmed answer', async () => {
    const r = await exec('remote_rejected')
    expect(reserved.mock.calls[0]).toContain('RELEASED')
    // Not ambiguity: the remote answered. Collapsing this into `not_dispatched`
    // would send every rejection to reconciliation.
    expect(r.outcome).toBe('FAILED')
    expect(r.detail).toMatch(/reconcile=false/)
  })

  it('MUTATION — ambiguity SETTLES and never releases', async () => {
    for (const s of ['timeout_before_acceptance', 'timeout_after_acceptance']) {
      reserved.mockClear()
      await exec(s)
      expect(reserved.mock.calls[0], s).toContain('SETTLED')
      expect(reserved.mock.calls[0], s).not.toContain('RELEASED')
    }
  })

  it('a confirmed effect settles', async () => {
    await exec('success')
    expect(reserved.mock.calls[0]).toContain('SETTLED')
  })
})

// ── E. The Anthropic Hard Gate is intact ────────────────────────────────────

describe('the provider boundary was extended, not opened', () => {
  const anthropic = () => readFileSync(join(process.cwd(), 'lib/ai/anthropic.ts'), 'utf8')

  it('MUTATION — no raw client is exported', () => {
    expect(anthropic()).not.toMatch(/export\s+(function|const)\s+raw/)
    expect(anthropic()).toMatch(/^function raw\(\): Anthropic/m)
  })

  it('MUTATION — Anthropic is constructed in exactly one place', () => {
    // Comments stripped: the module's header DISCUSSES `new Anthropic()` in order
    // to record the audit that removed it from 20 call sites, and a guard that
    // could not tell that from an implementation would force the history out.
    const code = readFileSync(join(process.cwd(), 'lib/ai/anthropic.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect((code.match(/new Anthropic\(/g) ?? []).length).toBe(1)
  })

  it('the identity is forwarded to the boundary at both call sites', () => {
    expect((anthropic().match(/idempotencyKey: ctx\.idempotencyKey/g) ?? []).length).toBe(2)
  })

  it('the key is OPTIONAL, so existing call sites are unchanged', () => {
    expect(anthropic()).toMatch(/idempotencyKey\?: string/)
  })

  it('MUTATION — provablyNotBilled is not duplicated into the workflow', () => {
    const files = ['lib/workflows/effect/effect-execution.ts',
                   'lib/workflows/effect/proof-handler.ts',
                   'lib/workflows/effect/spend-boundary.ts']
    for (const f of files) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f)
        .not.toMatch(/function provablyNotBilled/)
    }
  })

  it('no workflow module constructs an Anthropic client', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let out = ''
    try {
      out = execFileSync('grep', ['-rl', 'new Anthropic(', `${process.cwd()}/lib/workflows`],
                         { encoding: 'utf8' })
    } catch { /* none, which is the expected outcome */ }
    expect(out.trim()).toBe('')
  })
})

// ── F. Nothing else moved ───────────────────────────────────────────────────

describe('no product capability was opened', () => {
  it('generate_monthly_story is still not enabled and has no spend owner', () => {
    expect([...GOVERNED_EFFECT_ENABLED_KINDS]).toEqual(['proof_governed_effect'])
    expect(spendBoundaryOwnerFor('generate_monthly_story')).toBeNull()
  })

  it('no StoryTextProvider implementation exists yet', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let out = ''
    try {
      out = execFileSync('grep', ['-rl', 'StoryTextProvider', `${process.cwd()}/lib`],
                         { encoding: 'utf8' })
    } catch { /* none */ }
    const impls = out.trim().split('\n').filter(Boolean)
      .filter(f => !f.includes('/qa/'))
      .map(f => f.slice(f.lastIndexOf('/') + 1)).sort()
    // Only the seam and the deterministic fake. No Anthropic implementation.
    expect(impls).toEqual(['fake-provider.ts', 'provider.ts'])
  })
})
