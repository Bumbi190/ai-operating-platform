/**
 * PR9f-1 — target hash scope + refusal finalization.
 *
 * Two defects, both proven in production against instance a6ecf16a / run 82e899e0:
 *
 *   A. workflowActionTargetPayload included EVERY workflow_evidence row for the
 *      state. The scheduler writes its own bookkeeping there
 *      (scheduler.wake_scheduled, scheduler.evaluation), so the tick drifted the
 *      target of the run it had just created — 333 ms earlier, in the same tick.
 *      Stored adf1d4a9…, readiness recomputed 8a6da517…, refused forever.
 *
 *   B. A refusal wrote nothing, leaving the run `running` and holding its claim
 *      until the lease expired — then the reaper requeued it and it churned.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { workflowActionTargetPayload } from '../workflows/action-target'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import { loadVendoredDefinitions } from '../workflows/definitions'
import { familjeStundenAdapter } from '../workflows/adapters/familje-stunden'
import { REFUSAL_DISPOSITION } from '../workflows/action-executor'

const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
const target = readFileSync(join(process.cwd(), 'lib/workflows/action-target.ts'), 'utf8')
const runSrc = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')

/**
 * Guards below judge CODE. These modules' own doc comments deliberately NAME the
 * scheduler keys and the dispatch boundary in order to explain the bug being
 * fixed; a guard that fired on the explanation would push a future author to
 * delete the warning rather than keep the property.
 */
const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const targetCode = stripComments(target)
const execCode = stripComments(exec)

const spec = loadVendoredDefinitions().find(d => d.def_key === 'familje-stunden.monthly-release')!.spec
const instance = {
  id: 'a6ecf16a-770e-4cd8-b78f-fb846f8098f7',
  project_id: '77cda551-57c9-4dc0-b019-1bb6438777f7',
  instance_key: '2099-01', def_key: 'familje-stunden.monthly-release',
  def_version: 1, def_hash: 'eef18502d2de6aa9017b63a7b174f00638fd3dbc9ae74575d13f3040b0dd5f2c',
} as never
const DECLARED = familjeStundenAdapter.attestableChecks()
  .filter(c => c.state === 'planning').map(c => c.check_key)

const ev = (k: string, r: string, t: string, state = 'planning') =>
  ({ state, check_key: k, result: r, source: 'automated', recorded_at: t }) as never
const WAKE = ev('scheduler.wake_scheduled', 'pass', '2026-08-30T17:49:09.204465+00:00')
const TICK = ev('scheduler.evaluation', 'pass', '2026-08-30T17:50:03.938394+00:00')
const REAL = ev('release_instant_computed', 'pass', '2026-08-30T17:52:00Z')

function hash(evidence: never[], declaredCheckKeys: readonly string[] = DECLARED): string {
  return canonicalTargetVersionHash(workflowActionTargetPayload({
    instance, spec, state: 'planning', actionKind: 'compute_release_instant',
    actionClass: 'READ_ONLY', sideEffectTarget: null, evidence, declaredCheckKeys,
  }))
}

// ── Target scope ────────────────────────────────────────────────────────────

describe('scheduler bookkeeping cannot move the target', () => {
  const base = hash([WAKE])

  it('MUTATION — reproduces the exact production bug under old behaviour', () => {
    // Old behaviour == treating the scheduler keys as if declared.
    const old = hash([WAKE, TICK], ['scheduler.wake_scheduled', 'scheduler.evaluation', ...DECLARED])
    expect(old).toBe('8a6da5170055f96540b2874a997fb75697d1ece37794ced18a0864bc3c81cfb4')
    expect(old).not.toBe(hash([WAKE, TICK]))     // …and the fix changes it
  })

  it('scheduler.wake_scheduled does not change the hash', () => {
    expect(hash([WAKE])).toBe(hash([]))
  })

  it('scheduler.evaluation does not change the hash', () => {
    expect(hash([WAKE, TICK])).toBe(base)
  })

  it('MUTATION — an arbitrary undeclared audit row is ignored too', () => {
    // The rule is "declared", not "not scheduler.*" — a hardcoded scheduler
    // exclusion would let any other audit key drift the pin.
    expect(hash([WAKE, TICK, ev('some.other.audit', 'pass', '2026-08-30T18:00:00Z')])).toBe(base)
    expect(hash([ev('anything.at.all', 'fail', '2026-08-30T18:00:00Z')])).toBe(base)
  })

  it('the filter is by declared catalogue, not by string prefix', () => {
    expect(targetCode).toMatch(/declared\.has\(e\.check_key\)/)
    expect(targetCode).not.toMatch(/scheduler\./)      // no hardcoded key list in CODE
    expect(targetCode).not.toMatch(/startsWith\(/)
    // …and the explanation survives in the prose.
    expect(target).toMatch(/scheduler\.wake_scheduled/)
  })
})

describe('declared evidence still pins the target', () => {
  const base = hash([WAKE, TICK])

  it('adding a declared PASS changes the hash', () => {
    expect(hash([WAKE, TICK, REAL])).not.toBe(base)
  })

  it('changing a declared result changes the hash', () => {
    expect(hash([ev('release_instant_computed', 'fail', '2026-08-30T17:52:00Z')]))
      .not.toBe(hash([REAL]))
  })

  it('changing a declared timestamp changes the hash', () => {
    expect(hash([ev('release_instant_computed', 'pass', '2026-08-30T19:00:00Z')]))
      .not.toBe(hash([REAL]))
  })

  it('MUTATION — declared evidence must not be accidentally excluded', () => {
    expect(DECLARED).toContain('release_instant_computed')
    expect(hash([REAL])).not.toBe(hash([]))
  })

  it('evidence for another state does not drift this state', () => {
    expect(hash([ev('release_instant_computed', 'pass', '2026-08-30T17:52:00Z', 'pdf_build')]))
      .toBe(hash([]))
  })

  it('insertion order does not matter', () => {
    expect(hash([REAL, WAKE, TICK])).toBe(hash([TICK, REAL, WAKE]))
  })
})

describe('both target call sites use the declared catalogue', () => {
  it('creation and readiness derive it the same way', () => {
    const uses = [...runSrc.matchAll(
      /adapter\s*\n?\s*\?\s*adapter\.attestableChecks\(\)\s*\n?\s*\.filter\(c => c\.state === instance\.current_state\)\.map\(c => c\.check_key\)/g)]
    expect(uses.length).toBe(2)
    expect([...runSrc.matchAll(/declaredCheckKeys/g)].length).toBeGreaterThanOrEqual(4)
  })

  it('introduces no second evidence catalogue', () => {
    expect(runSrc).toMatch(/attestableChecks\(\)/)
    expect(targetCode).not.toMatch(/attestableChecks|FAMILJE_STUNDEN_CHECKS|findAdapter/)
  })
})

// ── Refusal finalization ────────────────────────────────────────────────────

describe('a refusal never leaves a claimed run running', () => {
  it('MUTATION — every pre-dispatch refusal path finalizes', () => {
    // The bug was `return {executed:false}` with no DB write.
    const preDispatch = execCode.slice(0, execCode.indexOf("action_phase: 'DISPATCH_STARTED'"))
    const returns = [...preDispatch.matchAll(/return \{ executed: false, refusal: '(\w+)'/g)].map(m => m[1])
    expect(returns.length).toBe(8)
    for (const r of returns) {
      expect(REFUSAL_DISPOSITION[r as keyof typeof REFUSAL_DISPOSITION], r).toBeDefined()
    }
    // Each has a finalizer. `await finalizeRefusal(` matches invocations only —
    // the declaration is `async function finalizeRefusal(` — and tolerates the
    // line-wrapped call.
    expect([...preDispatch.matchAll(/await finalizeRefusal\(/g)].length).toBe(returns.length)
  })

  it('target drift is PERMANENT, never transient', () => {
    // Retrying a drifted pin attempts something nobody approved.
    expect(exec).toMatch(/const TEMPORARY_BLOCKERS = \['project_paused', 'spend_enforcement_required'\]/)
    expect(exec).not.toMatch(/TEMPORARY_BLOCKERS[^\n]*target_drifted/)
  })

  it('permanent refusals go terminal and clear the claim', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'))
    expect(fin).toMatch(/status: cancelled \? 'cancelled' : 'rejected'/)
    expect(fin).toMatch(/action_outcome: cancelled \? 'CANCELLED' : 'REJECTED'/)
    expect(fin).toMatch(/claimed_at: null/)
    expect(fin).toMatch(/lease_until: null/)
    expect(fin).toMatch(/side_effect_summary: \{ refusal, disposition, blockers \}/)
  })

  it('a pre-dispatch cancel becomes CANCELLED, not REJECTED', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'))
    expect(fin).toMatch(/blockers\.includes\('cancel_requested'\)\) disposition = 'cancelled'/)
  })

  it('a temporary blocker requeues instead of rejecting', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'))
    expect(fin).toMatch(/disposition === 'temporary'/)
    expect(fin).toMatch(/status: 'pending'/)
  })

  it('phase stays pre-dispatch — a refusal never claims dispatch', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'),
                           exec.indexOf('export async function executeWorkflowAction'))
    expect(fin).not.toMatch(/action_phase:/)
    expect(fin).not.toMatch(/dispatch_started_at/)
  })

  it('MUTATION — a fenced refusal writes NOTHING', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'))
    expect(fin).toMatch(/if \(refusal === 'fenced'\) return 'temporary'/)
    expect(fin.indexOf("refusal === 'fenced'")).toBeLessThan(fin.indexOf('fencedActionUpdate'))
  })

  it('no evidence is fabricated by a refusal', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'),
                           exec.indexOf('export async function executeWorkflowAction'))
    expect(fin).not.toMatch(/recordEvidence/)
  })
})

// ── Fencing ─────────────────────────────────────────────────────────────────

describe('refusal writes are fenced', () => {
  it('MUTATION — removing the claim_id predicate must break this', () => {
    expect(exec).toMatch(/\.eq\('claim_id', claimId\)/)
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'),
                           exec.indexOf('export async function executeWorkflowAction'))
    // Every write in the finalizer goes through the fenced helper.
    expect([...fin.matchAll(/fencedActionUpdate\(/g)].length).toBeGreaterThanOrEqual(2)
    expect(fin).not.toMatch(/db\.from\('runs'\)\.update/)
  })

  it('a run with no claim is refused rather than written unconditionally', () => {
    expect(exec).toMatch(/if \(!claimId\) \{[\s\S]{0,200}return \{ fenced: true \}/)
  })
})

// ── PR9d interaction ────────────────────────────────────────────────────────

describe('the post-dispatch failure model is untouched', () => {
  it('the handler-threw path does NOT use the refusal finalizer', () => {
    const post = execCode.slice(execCode.indexOf("action_phase: 'DISPATCH_STARTED'"))
    expect(post).toMatch(/outcomeForObservation\('response_lost', 'DISPATCH_STARTED'\)/)
    expect(post).not.toMatch(/finalizeRefusal/)
    // The prose explaining WHY it must not be used there is kept.
    expect(exec).toMatch(/Deliberately NOT finalizeRefusal/)
  })

  it('finalizeRefusal is documented and used only before the boundary', () => {
    expect(exec).toMatch(/Only ever called BEFORE dispatch/)
    const boundary = execCode.indexOf("action_phase: 'DISPATCH_STARTED'")
    for (const m of execCode.matchAll(/await finalizeRefusal\(/g)) {
      expect(m.index!, 'finalizeRefusal call after dispatch boundary').toBeLessThan(boundary)
    }
  })

  it('UNKNOWN/PARTIAL semantics are not touched', () => {
    const fin = exec.slice(exec.indexOf('async function finalizeRefusal'),
                           exec.indexOf('export async function executeWorkflowAction'))
    expect(fin).not.toMatch(/UNKNOWN|PARTIAL|reconciliation_required: true/)
  })
})
