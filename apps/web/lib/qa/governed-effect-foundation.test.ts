/**
 * lib/qa/governed-effect-foundation.test.ts — Phase 2B-1.
 *
 * The engine can now, in principle, change the world. These are the guards that
 * decide whether that is safe.
 *
 * The load-bearing ones are negative: what the path REFUSES to do, and what
 * widening the executor did NOT quietly enable.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  ACTION_REGISTRY, GOVERNED_EFFECT_ENABLED_KINDS, isGovernedEffectEnabled,
  isExecutableReadOnly, assertRegistryMatchesDefinition,
} from '@/lib/workflows/action-registry'
import { executableActionKinds } from '@/lib/workflows/action-executor'
import { ACTION_CLASS_POLICY, type ActionClass } from '@/lib/workflows/action-target'
import {
  governedEffectRequirements, isEffectfulClass, mayRecordSuccessEvidence,
  refusalMeansNothingHappened, GOVERNED_EFFECT_REFUSALS,
} from '@/lib/workflows/effect/governed-effect'
import {
  computeExecutionAuthorizationTarget, executionAuthorizationTargetPayload,
  WORKFLOW_EXECUTION_TARGET_TYPE, WORKFLOW_EXECUTION_ACTION_KIND,
} from '@/lib/workflows/effect/execution-authorization'
import {
  proofDispatch, proofReconcile, PROOF_SCENARIOS, PROOF_EFFECT_ESTIMATED_SEK,
  type ProofScenario,
} from '@/lib/workflows/effect/proof-adapter'
import { WORKFLOW_GATE_TARGET_TYPE } from '@/lib/workflows/gate'
import { decideRetry, outcomeForObservation, hasDispatched, isAmbiguous }
  from '@/lib/workflows/action-outcome'
import { permitsFreshAttempt, resolutionFor } from '@/lib/workflows/reconciliation'
import { findVendoredDefinition } from '@/lib/workflows/definitions'

const H = (s: string) => require('crypto').createHash('sha256').update(s).digest('hex')
const AUTH = {
  instanceId: 'inst-1', defKey: 'omnira.execution-proof', defVersion: 1,
  defHash: H('def'), state: 'effect', actionKind: 'proof_governed_effect',
  actionClass: 'FINANCIAL' as ActionClass, targetVersionHash: H('target'),
  attemptGroup: 'grp-1',
}

// ── A. Enablement is per kind, never per class ──────────────────────────────

describe('widening the family enabled exactly one thing', () => {
  it('the enabled list holds only the proof action', () => {
    expect([...GOVERNED_EFFECT_ENABLED_KINDS]).toEqual(['proof_governed_effect'])
  })

  it('MUTATION — no Familje-Stunden effectful action became executable', () => {
    for (const kind of ['generate_page_audio', 'apply_release_gate_migration',
                        'upload_protected_artifacts', 'send_release_newsletter'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family, kind).toBe('not_executable')
      expect(isGovernedEffectEnabled(kind), kind).toBe(false)
    }
  })

  it('MUTATION — carrying an effectful CLASS is not enablement', () => {
    // The four above are FINANCIAL / MATERIAL_WRITE / EXTERNAL_COMMUNICATION.
    // If the gate keyed on class they would all be live.
    for (const kind of ['generate_page_audio', 'upload_protected_artifacts'] as const) {
      expect(isEffectfulClass(ACTION_REGISTRY[kind].action_class), kind).toBe(true)
      expect(isGovernedEffectEnabled(kind), kind).toBe(false)
    }
  })

  it('the proof action is the only ENABLED governed-effect kind', () => {
    // Phase 2B-2 declared `generate_monthly_story` in the same family without
    // enabling it. That is the distinction this suite exists to protect: family
    // membership describes what a kind WOULD need; the allowlist decides whether
    // it may run. A kind can sit in the family indefinitely and never act.
    const fam = Object.entries(ACTION_REGISTRY)
      .filter(([, m]) => (m as { executor_family: string }).executor_family === 'governed_effect')
      .map(([k]) => k).sort()
    expect(fam).toEqual(['generate_monthly_story', 'proof_governed_effect'])
    expect(fam.filter(isGovernedEffectEnabled)).toEqual(['proof_governed_effect'])
  })

  it('it is placed only on the Omnira proof definition', () => {
    expect(ACTION_REGISTRY.proof_governed_effect.placements).toEqual([
      { def_key: 'omnira.execution-proof', state: 'effect' },
    ])
  })

  it('the registry still matches every definition', () => {
    expect(assertRegistryMatchesDefinition()).toEqual([])
  })
})

// ── B. READ_ONLY is untouched ───────────────────────────────────────────────

describe('the READ_ONLY path did not move', () => {
  it('MUTATION — the same four kinds are read-only executable', () => {
    expect(executableActionKinds()).toEqual([
      'compose_monthly_brief', 'compute_release_instant', 'observe_release_gate',
      'probe_anonymous_protected_access',
    ])
  })

  it('MUTATION — the proof action is NOT read-only executable', () => {
    expect(isExecutableReadOnly('proof_governed_effect')).toBe(false)
    expect(executableActionKinds()).not.toContain('proof_governed_effect')
  })

  it('READ_ONLY requires neither authorization nor spend', () => {
    const r = governedEffectRequirements('READ_ONLY')
    expect(r.requiresExecutionAuthorization).toBe(false)
    expect(r.requiresSpendReservation).toBe(false)
  })

  it('the read-only executor still refuses anything not READ_ONLY', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    expect(src).toMatch(/action_class !== 'READ_ONLY' \|\| !isExecutableReadOnly/)
    expect(src).toMatch(/HANDLERS: Record<ExecutableReadOnlyActionKind/)
  })
})

// ── C. Requirements come from the class table ───────────────────────────────

describe('policy is read, never restated', () => {
  it('every effectful class requires authorization', () => {
    for (const cls of ['FINANCIAL', 'MATERIAL_WRITE', 'EXTERNAL_COMMUNICATION',
                       'REVERSIBLE_WRITE', 'DESTRUCTIVE'] as ActionClass[]) {
      expect(governedEffectRequirements(cls).requiresExecutionAuthorization, cls).toBe(true)
    }
  })

  it('MUTATION — only FINANCIAL requires a spend reservation', () => {
    expect(governedEffectRequirements('FINANCIAL').requiresSpendReservation).toBe(true)
    for (const cls of ['MATERIAL_WRITE', 'EXTERNAL_COMMUNICATION', 'READ_ONLY',
                       'REVERSIBLE_WRITE'] as ActionClass[]) {
      expect(governedEffectRequirements(cls).requiresSpendReservation, cls).toBe(false)
    }
  })

  it('requirements mirror ACTION_CLASS_POLICY exactly', () => {
    for (const cls of Object.keys(ACTION_CLASS_POLICY) as ActionClass[]) {
      const r = governedEffectRequirements(cls)
      const p = ACTION_CLASS_POLICY[cls]
      expect(r.requiresExecutionAuthorization, cls).toBe(p.requiresAuthorization)
      expect(r.requiresSpendReservation, cls).toBe(p.requiresSpendEnforcement)
      expect(r.requiresIdempotency, cls).toBe(p.requiresIdempotency)
      expect(r.maxAttempts, cls).toBe(p.maxAttempts)
    }
  })

  it('effectful classes do not inherit the READ_ONLY attempt budget', () => {
    expect(governedEffectRequirements('READ_ONLY').maxAttempts).toBe(5)
    expect(governedEffectRequirements('FINANCIAL').maxAttempts).toBe(1)
  })
})

// ── D. Execution authorization ──────────────────────────────────────────────

describe('permission to act is not permission to advance', () => {
  it('MUTATION — the execution target type is distinct from the gate type', () => {
    expect(WORKFLOW_EXECUTION_TARGET_TYPE).toBe('workflow_execution')
    expect(WORKFLOW_EXECUTION_TARGET_TYPE).not.toBe(WORKFLOW_GATE_TARGET_TYPE)
    expect(WORKFLOW_EXECUTION_ACTION_KIND).toBe('workflow.action.execute')
    expect(WORKFLOW_EXECUTION_ACTION_KIND).not.toBe('workflow.gate.advance')
  })

  it('MUTATION — a legacy gate grant can never satisfy an execution check', async () => {
    const { sameTarget } = await import('@/lib/atlas/authorization/derive') as
      { sameTarget?: (a: unknown, b: unknown) => boolean }
    const exec = computeExecutionAuthorizationTarget(AUTH)
    const gate = { targetType: WORKFLOW_GATE_TARGET_TYPE, targetId: 'inst-1:effect',
                   versionHash: exec.versionHash }
    if (typeof sameTarget === 'function') expect(sameTarget(exec, gate)).toBe(false)
    expect(exec.targetType).not.toBe(gate.targetType)
  })

  it('MUTATION — a changed input identity needs a new authorization', () => {
    const a = computeExecutionAuthorizationTarget(AUTH)
    const b = computeExecutionAuthorizationTarget({ ...AUTH, targetVersionHash: H('other') })
    expect(a.versionHash).not.toBe(b.versionHash)
  })

  it('MUTATION — a fresh attempt group needs a new authorization', () => {
    // This is what stops one grant funding two distinct dispatches.
    const a = computeExecutionAuthorizationTarget(AUTH)
    const b = computeExecutionAuthorizationTarget({ ...AUTH, attemptGroup: 'grp-2' })
    expect(a.versionHash).not.toBe(b.versionHash)
    expect(a.targetId).not.toBe(b.targetId)
  })

  it('a retry of the SAME intent reuses the same target', () => {
    expect(computeExecutionAuthorizationTarget(AUTH).versionHash)
      .toBe(computeExecutionAuthorizationTarget(AUTH).versionHash)
  })

  it('a different action kind or class is a different target', () => {
    const base = computeExecutionAuthorizationTarget(AUTH).versionHash
    expect(computeExecutionAuthorizationTarget({ ...AUTH, actionKind: 'other' }).versionHash)
      .not.toBe(base)
    expect(computeExecutionAuthorizationTarget(
      { ...AUTH, actionClass: 'MATERIAL_WRITE' }).versionHash).not.toBe(base)
  })

  it('MUTATION — no timestamp reaches the payload', () => {
    const p = executionAuthorizationTargetPayload(AUTH)
    expect(JSON.stringify(p)).not.toMatch(/recorded_at|timestamp|_at"/)
  })

  it('refuses malformed identity rather than hashing it', () => {
    expect(() => computeExecutionAuthorizationTarget({ ...AUTH, defHash: 'nope' })).toThrow()
    expect(() => computeExecutionAuthorizationTarget({ ...AUTH, attemptGroup: '' })).toThrow()
  })
})

// ── E. Dispatch certainty, retry and reconciliation ─────────────────────────

describe('certainty decides retry, not the exception', () => {
  // The phase the executor would be in at the moment it classifies: it has
  // started dispatching. Passing it matters — `outcomeForObservation` refuses to
  // call something FAILED-not-sent when the phase says it went out.
  const outcomeOf = async (s: ProofScenario) =>
    outcomeForObservation((await proofDispatch(s)).observation, 'DISPATCH_STARTED')

  it('every scenario maps to a real outcome', async () => {
    for (const s of PROOF_SCENARIOS) expect(await outcomeOf(s), s).toBeTruthy()
  })

  it('MUTATION — an ambiguous FINANCIAL dispatch is never retried', async () => {
    for (const s of ['timeout_before_acceptance', 'timeout_after_acceptance'] as ProofScenario[]) {
      const outcome = await outcomeOf(s)
      expect(isAmbiguous(outcome), s).toBe(true)
      const d = decideRetry('FINANCIAL', outcome, 0)
      expect(d.retry, s).toBe(false)
      if (d.retry === false) expect(d.requiresHuman, s).toBe(true)
    }
  })

  it('MUTATION — a confirmed effect is never redispatched', async () => {
    for (const s of ['success', 'confirmed_then_local_crash'] as ProofScenario[]) {
      expect(decideRetry('FINANCIAL', await outcomeOf(s), 0).retry, s).toBe(false)
    }
  })

  it('only a provable non-dispatch may release', async () => {
    expect((await proofDispatch('local_failure')).provablyNotApplied).toBe(true)
    expect((await proofDispatch('remote_rejected')).provablyNotApplied).toBe(true)
    for (const s of ['timeout_before_acceptance', 'timeout_after_acceptance',
                     'confirmed_then_local_crash', 'success'] as ProofScenario[]) {
      expect((await proofDispatch(s)).provablyNotApplied, s).toBe(false)
    }
  })

  it('the dispatch boundary is where certainty starts mattering', async () => {
    expect(hasDispatched('PREPARED')).toBe(false)
    expect(hasDispatched('PRE_COMMIT_VERIFIED')).toBe(false)
    expect(hasDispatched('DISPATCH_STARTED')).toBe(true)
    expect(hasDispatched('COMPLETE')).toBe(true)
  })

  it('MUTATION — only a confirmed non-application permits a fresh attempt', () => {
    expect(permitsFreshAttempt('CONFIRMED_NOT_APPLIED')).toBe(true)
    for (const r of ['CONFIRMED_SUCCEEDED', 'CONFIRMED_PARTIAL', 'STILL_UNKNOWN'] as const) {
      expect(permitsFreshAttempt(r), r).toBe(false)
    }
  })

  it('unknown stays unknown — reconciliation never guesses', () => {
    // Not knowing leaves the incident exactly where it was, for either ambiguity.
    expect(resolutionFor('STILL_UNKNOWN', 'UNKNOWN')).toBeNull()
    expect(resolutionFor('STILL_UNKNOWN', 'PARTIAL')).toBeNull()
    // And PARTIAL never widens into a clean success.
    expect(resolutionFor('CONFIRMED_SUCCEEDED', 'PARTIAL')).toBeNull()
    expect(proofReconcile('timeout_after_acceptance')).toBe('STILL_UNKNOWN')
    expect(proofReconcile('confirmed_then_local_crash')).toBe('CONFIRMED_SUCCEEDED')
    expect(proofReconcile('timeout_before_acceptance')).toBe('CONFIRMED_NOT_APPLIED')
  })

  it('the last refusal chance is awaited before anything is decided', async () => {
    let called = false
    await proofDispatch('success', () => { called = true })
    expect(called).toBe(true)
    await expect(proofDispatch('success', () => { throw new Error('stopped') }))
      .rejects.toThrow('stopped')
  })
})

// ── F. Evidence ─────────────────────────────────────────────────────────────

describe('evidence may not claim more than is known', () => {
  it('MUTATION — success is refused while reconciliation is required', () => {
    expect(mayRecordSuccessEvidence({
      outcome: 'SUCCEEDED', reconciliationRequired: true,
      spendSettled: true, requiresSpend: true })).toBe(false)
  })

  it('MUTATION — a FINANCIAL success is refused while spend is unsettled', () => {
    expect(mayRecordSuccessEvidence({
      outcome: 'SUCCEEDED', reconciliationRequired: false,
      spendSettled: false, requiresSpend: true })).toBe(false)
  })

  it('a clean, settled success is allowed', () => {
    expect(mayRecordSuccessEvidence({
      outcome: 'SUCCEEDED', reconciliationRequired: false,
      spendSettled: true, requiresSpend: true })).toBe(true)
  })

  it('a non-success outcome never records success', () => {
    for (const o of ['FAILED', 'UNKNOWN', 'PARTIAL', 'SUCCEEDED_EVIDENCE_PENDING']) {
      expect(mayRecordSuccessEvidence({
        outcome: o, reconciliationRequired: false,
        spendSettled: true, requiresSpend: false }), o).toBe(false)
    }
  })

  it('every pre-dispatch refusal means nothing happened, so all of them release', () => {
    for (const r of GOVERNED_EFFECT_REFUSALS) {
      expect(refusalMeansNothingHappened(r), r).toBe(true)
    }
  })
})

// ── G. The proof world touches nothing ──────────────────────────────────────

describe('the proof adapter is inert', () => {
  const src = () => readFileSync(
    join(process.cwd(), 'lib/workflows/effect/proof-adapter.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('MUTATION — names no network, provider, credential or database', () => {
    for (const forbidden of [/fetch\(/, /process\.env/, /createClient|createAdminClient/,
                             /from\('/, /anthropic|openai|muapi|elevenlabs/i]) {
      expect(src(), String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('its cost is a deterministic constant, not a rate lookup', () => {
    expect(PROOF_EFFECT_ESTIMATED_SEK).toBe(1.0)
    expect(src()).not.toMatch(/cost_rates|estimateImageSek|rates/)
  })

  it('the proof definition owns no product process', () => {
    const def = findVendoredDefinition('omnira.execution-proof', 1)!
    expect(def.provenance).toBe('authored_here')
    expect(def.spec.states.map(s => s.id)).toEqual(['effect', 'complete'])
    const canon = def.spec.canonical as Record<string, unknown>
    expect(String(canon.not_a_release)).toMatch(/owns no release/)
    // It NAMES Familje-Stunden only to forbid touching it. What matters is that
    // it declares none of that workflow's states and cannot be placed there.
    const fsStates = ['planning', 'content_generation', 'audio_generation',
                      'protected_upload', 'backend_release_gate', 'newsletter']
    for (const id of def.spec.states.map(s => s.id)) {
      expect(fsStates, id).not.toContain(id)
    }
    expect(def.spec.def_key).toBe('omnira.execution-proof')
    const gate = def.spec.hard_gates.find(g => g.id === 'never_advances_a_product_workflow')
    expect(gate, 'the prohibition must be declared').toBeDefined()
  })

  it('no human gate, because nothing is at stake', () => {
    const def = findVendoredDefinition('omnira.execution-proof', 1)!
    for (const s of def.spec.states) expect(s.human_gate.required, s.id).toBe(false)
  })
})
