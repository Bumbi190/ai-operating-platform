/**
 * Phase 3A — the spend/financial DECOUPLING SEAM, proven behaviourally.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * `H1_SPEND_GATE` was OVERLOADED. One env var decided two separate things:
 *
 *   • is the budget verdict HONOURED, or merely recorded?
 *   • may the FINANCIAL action class enter the execution lifecycle at all?
 *
 * That conflation meant enabling budget enforcement silently unlocked the first
 * real-money effect (`generate_monthly_story`). An operator could not turn on
 * budget enforcement without also opening a rollout gate they had not decided
 * to open, and could not tell from a refusal WHICH prerequisite was missing.
 *
 * The seam splits them. A FINANCIAL action must now satisfy BOTH, checked
 * independently and reported with distinct refusal reasons. Neither implies the
 * other, and neither may be substituted for the other.
 *
 * ── WHAT IS PROVEN, AND AT WHICH SURFACE ────────────────────────────────────
 * The two checks appear at two places in `action-run.ts`: BIND
 * (`createWorkflowActionRun`) and READINESS (`assertWorkflowActionReady`).
 * Both consult the SAME canonical policy table and the SAME two predicates.
 *
 * CASE A–D are driven BEHAVIOURALLY against the readiness surface, because that
 * is where all four cases are reachable with real code. At the BIND surface
 * steps 1–7 (instance, project, target, authorization, evidence) necessarily
 * run FIRST, so a FINANCIAL bind cannot reach its flag checks without a
 * genuinely effective authorization — fabricating one in a mock would mean
 * mocking the very ledger the check is downstream of, which proves nothing.
 * So the bind half of the matrix is proven two ways instead:
 *
 *   • BEHAVIOURALLY for everything reachable without authority — that a closed
 *     gate grants nothing (CASE D must not bypass), that READ_ONLY binds
 *     unaffected, and that the flag refusal reasons are distinct; and
 *   • STRUCTURALLY — that bind applies the identical two-predicate rule in the
 *     identical order as the behaviourally-proven readiness path.
 *
 * The distinction is stated rather than blurred. A source pin cannot show that
 * a refusal fired; a behaviour test cannot show that bind and readiness agree
 * unless both are read. Together they do.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

/**
 * §12 needs the REAL `reserveSpend`. It builds its own admin client, so the
 * client is what gets mocked — never the verdict logic under test.
 */
const CURRENT: { db: unknown } = { db: null }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))

type Row = Record<string, unknown>

const APP = process.cwd()
const RUN = 'run-3a'
const PROJ = '11111111-1111-1111-1111-111111111111'
const INST = '22222222-2222-2222-2222-222222222222'
const DEF = '33333333-3333-3333-3333-333333333333'

/** The FINANCIAL-classed kind that is the real-money effect (§13). */
const MONEY_KIND = 'generate_monthly_story'

// ── env control ─────────────────────────────────────────────────────────────
// Saved and restored around every test so a flag flip cannot leak between them.
const SAVED: Record<string, string | undefined> = {}
const FLAGS = ['H1_SPEND_GATE', 'H1_FINANCIAL_EXECUTION'] as const

function setFlags(spend: boolean, financial: boolean): void {
  for (const f of FLAGS) if (!(f in SAVED)) SAVED[f] = process.env[f]
  if (spend) process.env.H1_SPEND_GATE = '1'; else delete process.env.H1_SPEND_GATE
  if (financial) process.env.H1_FINANCIAL_EXECUTION = '1'
  else delete process.env.H1_FINANCIAL_EXECUTION
}

beforeEach(() => {
  for (const f of FLAGS) delete process.env[f]
  CURRENT.db = null
})

afterEach(() => {
  for (const f of FLAGS) {
    if (SAVED[f] === undefined) delete process.env[f]
    else process.env[f] = SAVED[f]
  }
})

// ── the readiness database double ───────────────────────────────────────────
/**
 * Serves exactly the tables readiness consults, and nothing else. Copied in
 * shape from `action-boundary-behaviour.test.ts`, whose fixture is proven to
 * return `ready: true` in a clear world — the honesty check at the top of the
 * matrix exists so this file cannot silently regress into proving nothing.
 */
const state = {
  run: {} as Row,
  instance: {} as Row,
  def: {} as Row,
  projectPaused: false,
  paused: false,
}

function db() {
  const builder = (table: string) => {
    const preds: Row = {}
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: () => chain,
      eq: (c: string, v: unknown) => { preds[c] = v; return chain },
      is: () => chain, limit: () => chain, order: () => chain,
      maybeSingle: async () => resolve(table),
      single: async () => resolve(table),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    }
    return chain
  }
  const resolve = (t: string) => {
    if (t === 'runs') return { data: { ...state.run }, error: null }
    if (t === 'workflow_instances') return { data: { ...state.instance }, error: null }
    if (t === 'workflow_defs') return { data: { ...state.def }, error: null }
    if (t === 'projects') return { data: { execution_paused: state.projectPaused }, error: null }
    return { data: null, error: null }
  }
  return { from: (t: string) => builder(t), rpc: async () => ({ data: null, error: null }) }
}
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const anyDb = () => db() as any

const SPEC = {
  states: [
    { id: 'observing', next_state: 'done', inputs: [] },
    { id: 'done', next_state: null, inputs: [] },
  ],
}

/**
 * The pinned target hash is derived with the SAME function the code under test
 * uses, so readiness is not forced — it legitimately passes the target check
 * and the flag layer is the only thing left to observe.
 */
async function seed(actionKind: string, actionClass: string) {
  const { computeWorkflowActionTarget } = await import('@/lib/workflows/action-target')
  // Reset here, not only in beforeEach: a test that pauses the project and then
  // re-seeds would otherwise leak the pause into every test after it, and every
  // refusal below would be trivially true.
  state.projectPaused = false
  state.instance = {
    id: INST, def_id: DEF, def_key: 'probe-validation', def_version: 1,
    def_hash: 'a'.repeat(64), project_id: PROJ, instance_key: '2099-01',
    current_state: 'observing', status: 'active',
  }
  state.def = {
    id: DEF, def_key: 'probe-validation', version: 1, def_hash: 'a'.repeat(64), spec: SPEC,
  }
  const target = computeWorkflowActionTarget({
    instance: state.instance as never, spec: SPEC as never, state: 'observing',
    actionKind, actionClass: actionClass as never,
    sideEffectTarget: null, evidence: [], declaredCheckKeys: [],
  })
  state.run = {
    id: RUN, project_id: PROJ, status: 'running', claim_id: 'claim-3a',
    cancel_requested: false, workflow_instance_id: INST,
    workflow_def_hash: 'a'.repeat(64), workflow_from_state: 'observing',
    action_kind: actionKind, action_class: actionClass,
    target_version_hash: target.versionHash,
    // Deliberately absent: a FINANCIAL action needs one, and supplying a fake
    // would mean a fabricated ledger. CASE D asserts the CONSEQUENCE instead.
    authorization_id: null,
  }
}

async function ready(kind = MONEY_KIND, cls = 'FINANCIAL') {
  await seed(kind, cls)
  const { assertWorkflowActionReady } = await import('@/lib/workflows/action-run')
  return assertWorkflowActionReady(anyDb(), RUN)
}

/** Neither flag blocker — the flag layer contributed nothing. */
const FLAG_BLOCKERS = ['spend_enforcement_required', 'financial_execution_disabled'] as const

// ── §9/§10 — the required behaviour matrix ──────────────────────────────────

describe('§10 · readiness matrix — a FINANCIAL action needs BOTH requirements', () => {
  it('CASE A — spend OFF, financial OFF → spend_enforcement_required only', async () => {
    setFlags(false, false)
    const r = await ready()
    expect(r.blockers).toContain('spend_enforcement_required')
    expect(r.blockers).not.toContain('financial_execution_disabled')
  })

  it('CASE B — spend ON, financial OFF → financial_execution_disabled ONLY', async () => {
    setFlags(true, false)
    const r = await ready()
    expect(r.blockers).toContain('financial_execution_disabled')
    // The whole point of the decoupling: enforcement being on does NOT satisfy
    // the rollout gate, and the refusal says WHICH prerequisite is missing.
    expect(r.blockers).not.toContain('spend_enforcement_required')
  })

  it('CASE C — spend OFF, financial ON → spend_enforcement_required ONLY', async () => {
    setFlags(false, true)
    const r = await ready()
    expect(r.blockers).toContain('spend_enforcement_required')
    // …and the rollout gate being open does NOT excuse an advisory budget.
    expect(r.blockers).not.toContain('financial_execution_disabled')
  })

  it('CASE D — both ON → the flag layer adds NOTHING, and bypasses nothing', async () => {
    setFlags(true, true)
    const r = await ready()
    for (const b of FLAG_BLOCKERS) expect(r.blockers).not.toContain(b)
    // The gate grants no authority of its own: the pre-existing requirement is
    // still enforced. This is the assertion that stops the seam becoming a bypass.
    expect(r.blockers).toContain('authorization_not_effective')
  })

  it('both config blockers are NOT drift — and NOT retryable', async () => {
    // The final Phase 3A model. These two facts are easy to conflate and must not
    // be: a rollout blocker is not DRIFT (the approved act still exists and the
    // pinned target is unchanged), but it is also not RETRYABLE on this durable
    // run. `claim_runs` increments `attempts` on admission and nothing on the
    // requeue path compensates it, so returning a maxAttempts=1 FINANCIAL row to
    // `pending` leaves `attempts == max_attempts` — claimable never again.
    //
    // Asserted on the constants rather than on `terminal` alone, because a
    // FINANCIAL fixture with no authorization legitimately IS drift for an
    // unrelated reason, and an aggregate assertion would confuse the two.
    const runSrc = readFileSync(join(APP, 'lib', 'workflows', 'action-run.ts'), 'utf8')
    const execSrc = readFileSync(join(APP, 'lib', 'workflows', 'action-executor.ts'), 'utf8')

    const driftFrom = runSrc.indexOf('const DRIFT: ActionReadinessBlocker[] = [')
    // The closing bracket is found after `= [`, not after the declaration start:
    // `ActionReadinessBlocker[]` carries a `]` of its own, and anchoring on the
    // declaration start yields an EMPTY slice whose `not.toContain` assertions
    // would all pass vacuously. The membership check below is the guard.
    const driftOpen = runSrc.indexOf('= [', driftFrom)
    expect(driftFrom, 'the drift declaration must exist').toBeGreaterThan(-1)
    expect(driftOpen, 'the drift initializer must exist').toBeGreaterThan(driftFrom)
    const drift = runSrc.slice(driftOpen, runSrc.indexOf(']', driftOpen))
    expect(drift, 'the slice must be the real list, not empty').toContain('target_drifted')
    for (const b of FLAG_BLOCKERS) {
      expect(drift, `${b} must NOT be drift`).not.toContain(b)
    }

    // The retryable list must NOT contain either — re-adding one without an
    // admission-compensation design is the stranding defect, restored silently.
    const temporary = execSrc.slice(
      execSrc.indexOf('const TEMPORARY_BLOCKERS = ['),
      execSrc.indexOf(']', execSrc.indexOf('const TEMPORARY_BLOCKERS = [')))
    for (const b of FLAG_BLOCKERS) {
      expect(temporary, `${b} must NOT be a temporary requeue blocker`).not.toContain(b)
    }

    // …and they are instead declared TERMINAL, in a list that must not be empty —
    // an empty list here would mean the guard had been quietly dropped.
    const terminal = execSrc.slice(
      execSrc.indexOf('const CONFIG_TERMINAL_BLOCKERS = ['),
      execSrc.indexOf(']', execSrc.indexOf('const CONFIG_TERMINAL_BLOCKERS = [')))
    for (const b of FLAG_BLOCKERS) {
      expect(terminal, `${b} must be declared terminal`).toContain(b)
    }

    // Behaviourally: the blockers really are produced in each case.
    for (const [spend, financial, expected] of [
      [false, false, 'spend_enforcement_required'],
      [true, false, 'financial_execution_disabled'],
      [false, true, 'spend_enforcement_required'],
    ] as Array<[boolean, boolean, string]>) {
      setFlags(spend, financial)
      const r = await ready()
      expect(r.blockers, `spend=${spend} financial=${financial}`).toContain(expected)
    }
  })

  it('both requirements are reported for a paused project too — no short-circuit', async () => {
    // project_paused is pushed before the flag layer, so both must survive.
    setFlags(false, false)
    await seed(MONEY_KIND, 'FINANCIAL')
    state.projectPaused = true
    const { assertWorkflowActionReady } = await import('@/lib/workflows/action-run')
    const r = await assertWorkflowActionReady(anyDb(), RUN)
    expect(r.blockers).toContain('project_paused')
    expect(r.blockers).toContain('spend_enforcement_required')
  })
})

// ── §11 — non-FINANCIAL invariance ──────────────────────────────────────────

describe('§11 · the five other classes are untouched by the new flag', () => {
  const OTHERS: Array<[string, string]> = [
    ['probe_anonymous_protected_access', 'READ_ONLY'],
    ['record_dealer_response', 'REVERSIBLE_WRITE'],
    ['apply_release_migration', 'MATERIAL_WRITE'],
    ['publish_social_post', 'EXTERNAL_COMMUNICATION'],
    ['delete_media_asset', 'DESTRUCTIVE'],
  ]

  it('the policy table grants the new requirement to FINANCIAL and nobody else', async () => {
    const { ACTION_CLASS_POLICY, ACTION_CLASSES } = await import('@/lib/workflows/action-target')
    for (const cls of ACTION_CLASSES) {
      expect(ACTION_CLASS_POLICY[cls].requiresFinancialExecutionEnablement,
        `${cls} enablement`).toBe(cls === 'FINANCIAL')
    }
    // …and it did NOT replace the spend fact: FINANCIAL still requires both.
    expect(ACTION_CLASS_POLICY.FINANCIAL.requiresSpendEnforcement).toBe(true)
  })

  it('no non-FINANCIAL class gains a flag blocker, in ANY flag combination', async () => {
    for (const [kind, cls] of OTHERS) {
      for (const [spend, financial] of [[false, false], [true, false], [false, true], [true, true]]) {
        setFlags(spend, financial)
        const r = await ready(kind, cls)
        for (const b of FLAG_BLOCKERS) {
          expect(r.blockers, `${cls} spend=${spend} financial=${financial}`).not.toContain(b)
        }
      }
    }
  })

  it('READ_ONLY is genuinely READY with both flags off — the gate is not a new tax on reads', async () => {
    setFlags(false, false)
    const r = await ready('probe_anonymous_protected_access', 'READ_ONLY')
    expect(r.ready, r.detail).toBe(true)
  })
})

// ── §9 — the bind surface ───────────────────────────────────────────────────

describe('§9 · bind applies the same rule — and a closed gate grants nothing', () => {
  const runSrc = () => readFileSync(join(APP, 'lib', 'workflows', 'action-run.ts'), 'utf8')

  it('BOTH requirements are present at bind, each with its own predicate', () => {
    const src = runSrc()
    // Two checks, not one — the exact thing the ruling forbids collapsing.
    expect(src).toMatch(
      /if \(policy\.requiresSpendEnforcement && !isSpendGateEnforced\(\)\) \{/)
    expect(src).toMatch(
      /if \(policy\.requiresFinancialExecutionEnablement && !isFinancialExecutionEnabled\(\)\) \{/)
  })

  it('spend is reported FIRST — an advisory budget is the more dangerous state', () => {
    const src = runSrc()
    const spend = src.indexOf('if (policy.requiresSpendEnforcement && !isSpendGateEnforced()) {')
    const fin = src.indexOf('if (policy.requiresFinancialExecutionEnablement && !isFinancialExecutionEnabled()) {')
    expect(spend).toBeGreaterThan(-1)
    expect(fin).toBeGreaterThan(-1)
    expect(spend, 'the budget requirement is reported before the rollout gate').toBeLessThan(fin)
  })

  it('the two refusals are DISTINCT and closed — an operator can tell them apart', () => {
    const src = runSrc()
    expect(src).toMatch(/refusal: 'spend_enforcement_required'/)
    expect(src).toMatch(/refusal: 'financial_execution_disabled'/)
    // Both are members of the closed refusal union, so neither can be invented
    // by a caller and neither can be silently dropped by a switch.
    expect(src).toMatch(/\| 'financial_execution_disabled'/)
  })

  it('CASE D at BIND — both flags ON still refuses a FINANCIAL action with no authorization', async () => {
    // The flag layer sits BEHIND authorization (steps 5–6 precede step 8), so
    // this proves ordering and non-bypass at once: opening the gate does not
    // carry an action past the authority checks that come before it.
    setFlags(true, true)
    await seed(MONEY_KIND, 'FINANCIAL')
    const { createWorkflowActionRun } = await import('@/lib/workflows/action-run')
    const r = await createWorkflowActionRun(anyDb() as never,
      { instanceId: INST, actionKind: MONEY_KIND })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.refusal).toBe('authorization_not_effective')
  })

  it('a closed gate never becomes a way to SKIP a requirement that already existed', () => {
    const src = runSrc()
    // The flag checks return a refusal; they never return success, and they are
    // never an `else` around the authorization block.
    const body = src.slice(
      src.indexOf('// 8) TWO INDEPENDENT REQUIREMENTS'),
      src.indexOf('// 9) identity'))
    expect(body).not.toMatch(/\bok: true\b/)
    expect(body).not.toMatch(/return \{\s*ok: true/)
  })
})

// ── §12 — budget independence ───────────────────────────────────────────────

describe('§12 · the budget authority is unmoved by the new flag', () => {
  /**
   * A `budget_reserve` answer that REFUSES. `reserveSpend` builds its own admin
   * client, so only the client is mocked — the verdict logic under test is real.
   */
  function refusingDb() {
    return {
      rpc: async () => ({
        data: [{
          allowed: false, reason: 'budget_exhausted', reservation_id: null,
          budget_sek: 100, committed_sek: 100, reserved_sek: 0,
          headroom_sek: 0, binding_scope: 'project_monthly',
        }],
        error: null,
      }),
    }
  }

  it('a refused verdict is honoured iff H1_SPEND_GATE is on — and ONLY then', async () => {
    const { reserveSpend } = await import('@/lib/cost/budget-gate')
    const seen: Record<string, boolean> = {}
    for (const [spend, financial] of [[false, false], [true, false], [false, true], [true, true]]) {
      setFlags(spend, financial)
      CURRENT.db = refusingDb()
      const v = await reserveSpend({ projectId: PROJ, estimatedSek: 5 })
      seen[`spend=${spend},financial=${financial}`] = v.allowed
    }
    expect(seen).toEqual({
      // advisory: the refusal is recorded and overridden, exactly as before
      'spend=false,financial=false': true,
      'spend=true,financial=false': false,
      // …and the new flag changes NOTHING in either direction
      'spend=false,financial=true': true,
      'spend=true,financial=true': false,
    })
  })

  it('the advisory override is still reported as such, not silently passed', async () => {
    const { reserveSpend } = await import('@/lib/cost/budget-gate')
    setFlags(false, true)
    CURRENT.db = refusingDb()
    const v = await reserveSpend({ projectId: PROJ, estimatedSek: 5 })
    expect(v.allowed).toBe(true)
    expect(v.wouldAllow).toBe(false)
    expect(v.advisoryOverride).toBe(true)
  })

  it('the spend module reads exactly ONE flag, and it is not the new one', () => {
    const src = readFileSync(join(APP, 'lib', 'cost', 'budget-gate.ts'), 'utf8')
    expect(src).not.toMatch(/H1_FINANCIAL_EXECUTION/)
    expect(src).not.toMatch(/isFinancialExecutionEnabled/)
  })
})

// ── §13 — the real-money action ─────────────────────────────────────────────

describe('§13 · the real-money effect is FINANCIAL and stays FINANCIAL', () => {
  it('generate_monthly_story resolves to the FINANCIAL class', async () => {
    const { lookupAction } = await import('@/lib/workflows/action-registry')
    const a = lookupAction(MONEY_KIND)
    expect(a, `${MONEY_KIND} must be in the canonical registry`).toBeTruthy()
    expect(a!.action_class).toBe('FINANCIAL')
  })

  it('proof_governed_effect stays FINANCIAL — the seam does not quietly reclassify it', async () => {
    const { lookupAction } = await import('@/lib/workflows/action-registry')
    const a = lookupAction('proof_governed_effect')
    expect(a, 'proof_governed_effect must be in the canonical registry').toBeTruthy()
    expect(a!.action_class).toBe('FINANCIAL')
  })

  it('both real-money kinds are therefore gated by BOTH flags', async () => {
    const { lookupAction } = await import('@/lib/workflows/action-registry')
    const { ACTION_CLASS_POLICY } = await import('@/lib/workflows/action-target')
    for (const kind of [MONEY_KIND, 'proof_governed_effect']) {
      const cls = lookupAction(kind)!.action_class
      const p = ACTION_CLASS_POLICY[cls]
      expect(p.requiresSpendEnforcement, `${kind} spend`).toBe(true)
      expect(p.requiresFinancialExecutionEnablement, `${kind} enablement`).toBe(true)
    }
  })
})

// ── §14 — env read guards ───────────────────────────────────────────────────

describe('§14 · each flag has exactly ONE production reader', () => {
  /**
   * Comments stripped, because prose is not a read. The financial reader's own
   * doc comment legitimately NAMES `H1_SPEND_GATE` to explain why there is no
   * fallback to it — banning the string outright would force that reasoning out
   * of the file, which is the opposite of what this guard is for.
   */
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  /** Every production source file (tests excluded — they toggle flags by design). */
  function productionSources(): Array<{ path: string; body: string }> {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const out = execSync(
      "grep -rl 'H1_SPEND_GATE\\|H1_FINANCIAL_EXECUTION' lib app 2>/dev/null || true",
      { cwd: APP, encoding: 'utf8' })
    return out.split('\n').filter(Boolean)
      .filter(p => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
      .map(p => ({ path: p, body: readFileSync(join(APP, p), 'utf8') }))
  }

  it('H1_SPEND_GATE is read only in spend-gate-flag.ts', () => {
    const readers = productionSources()
      .filter(f => /process\.env\.H1_SPEND_GATE/.test(code(f.body))).map(f => f.path)
    expect(readers).toEqual(['lib/cost/spend-gate-flag.ts'])
  })

  it('H1_FINANCIAL_EXECUTION is read only in financial-execution-flag.ts', () => {
    const readers = productionSources()
      .filter(f => /process\.env\.H1_FINANCIAL_EXECUTION/.test(code(f.body))).map(f => f.path)
    expect(readers).toEqual(['lib/governance/financial-execution-flag.ts'])
  })

  it('the two readers are physically separate modules — that separation is the point', () => {
    const spend = code(readFileSync(join(APP, 'lib', 'cost', 'spend-gate-flag.ts'), 'utf8'))
    const fin = code(readFileSync(join(APP, 'lib', 'governance', 'financial-execution-flag.ts'), 'utf8'))
    // Neither predicate may be reachable from the other's module: a single
    // module holding both would make substituting one for the other a one-line
    // edit, which is exactly the failure this seam exists to prevent.
    expect(spend).not.toMatch(/isFinancialExecutionEnabled|H1_FINANCIAL_EXECUTION/)
    expect(fin).not.toMatch(/isSpendGateEnforced|H1_SPEND_GATE/)
  })

  it('the financial predicate has NO fallback to the spend flag', () => {
    const fin = code(readFileSync(join(APP, 'lib', 'governance', 'financial-execution-flag.ts'), 'utf8'))
    const body = fin.slice(fin.indexOf('export function isFinancialExecutionEnabled'))
    // Default OFF, and OFF means only one thing.
    expect(body).toMatch(/=== '1'/)
    expect(body).not.toMatch(/\|\||&&|\?\?/)
  })
})

// ── §8 — the execution safety surface ───────────────────────────────────────

describe('§8 · execution safety reports drift, never the safe default', () => {
  it('financial ON + spend OFF is surfaced as configuration drift', async () => {
    const { unsafeExecutionFlags } = await import('@/lib/ai/execution-flags')
    const base = {
      fencing: true, cancel: true, policy_gate: true,
      unified_executor: true, spend_gate: true, financial_execution: true,
    }
    expect(unsafeExecutionFlags({ ...base, spend_gate: false, financial_execution: true }))
      .toContain('financial_execution_without_spend_enforcement')
  })

  it('financial OFF is NEVER reported as unsafe — a closed gate is the safe default', async () => {
    const { unsafeExecutionFlags } = await import('@/lib/ai/execution-flags')
    const clean = unsafeExecutionFlags({
      fencing: true, cancel: true, policy_gate: true,
      unified_executor: true, spend_gate: true, financial_execution: false,
    })
    expect(clean).toEqual([])
  })

  it('the surface reads the flag through the ONE canonical predicate, never the env var', () => {
    const src = readFileSync(join(APP, 'lib', 'ai', 'execution-flags.ts'), 'utf8')
    expect(src).toContain("from '@/lib/governance/financial-execution-flag'")
    expect(src).toMatch(/financial_execution:\s*isFinancialExecutionEnabled\(\)/)
    expect(src).not.toMatch(/process\.env\.H1_FINANCIAL_EXECUTION/)
  })
})
