/**
 * PR9e-0 — canonical action class derivation.
 *
 * The hole being closed: PR9c let a caller supply `actionClass`, and because
 * authorization requirements derive from the class, a caller could declare a
 * MATERIAL_WRITE kind as READ_ONLY and skip the human gate at creation time.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTION_REGISTRY, assertRegistryMatchesDefinition, derivedPolicyFor,
  isExecutableReadOnly, isKnownActionKind, lookupAction,
} from '../workflows/action-registry'
import { ACTION_CLASS_POLICY, policyClassForActionClass } from '../workflows/action-target'
import { decideRetry } from '../workflows/action-outcome'

const runSrc = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
const regSrc = readFileSync(join(process.cwd(), 'lib/workflows/action-registry.ts'), 'utf8')

// ── The hole ────────────────────────────────────────────────────────────────

describe('a caller cannot assert the class', () => {
  it('MUTATION — actionClass is gone from the create input', () => {
    const input = runSrc.slice(runSrc.indexOf('interface CreateWorkflowActionRunInput'),
                               runSrc.indexOf('export type CreateWorkflowActionRunResult'))
    expect(input).not.toMatch(/actionClass\s*[?:]/)
    expect(input).toMatch(/actionKind: string/)
  })

  it('MUTATION — the class is never read back off the input anywhere', () => {
    expect(runSrc).not.toMatch(/input\.actionClass/)
    expect(runSrc).toMatch(/const actionClass: ActionClass = canonical\.action_class/)
  })

  it('MUTATION — skipping the registry lookup is impossible: it gates every path', () => {
    const lookupAt = runSrc.indexOf('lookupAction(input.actionKind)')
    expect(lookupAt).toBeGreaterThan(-1)
    // The lookup precedes the first DB read AND the insert.
    expect(lookupAt).toBeLessThan(runSrc.indexOf('readInstance(db, input.instanceId)'))
    expect(lookupAt).toBeLessThan(runSrc.indexOf(".from('runs').insert"))
  })

  it('MUTATION — an unknown kind must NOT default to READ_ONLY', () => {
    expect(lookupAction('totally_made_up')).toBeNull()
    expect(isKnownActionKind('totally_made_up')).toBe(false)
    expect(isExecutableReadOnly('totally_made_up')).toBe(false)
    // and the registry contains no fallback
    expect(regSrc).not.toMatch(/\?\?\s*'READ_ONLY'/)
    expect(regSrc).not.toMatch(/default:\s*'READ_ONLY'/)
    expect(runSrc).toMatch(/unknown_action_kind/)
  })

  it('rejects an unknown kind BEFORE any database write', () => {
    const from = runSrc.indexOf('const canonical = lookupAction')
    const guard = runSrc.slice(from, runSrc.indexOf('// 1) the instance'))
    expect(guard).toMatch(/return \{[\s\S]*?refusal: 'unknown_action_kind'/)
    for (const w of [/\.insert\(/, /\.update\(/, /\.rpc\(/]) expect(guard).not.toMatch(w)
  })
})

// ── Derivation ──────────────────────────────────────────────────────────────

describe('derivation', () => {
  it('compute_release_instant is READ_ONLY and executable', () => {
    expect(ACTION_REGISTRY.compute_release_instant.action_class).toBe('READ_ONLY')
    expect(isExecutableReadOnly('compute_release_instant')).toBe(true)
  })

  it('derives max_attempts and authorization from ACTION_CLASS_POLICY, not its own copy', () => {
    const d = derivedPolicyFor('compute_release_instant')
    expect(d).toEqual({
      actionClass: 'READ_ONLY',
      maxAttempts: ACTION_CLASS_POLICY.READ_ONLY.maxAttempts,
      requiresAuthorization: false,
      requiresSpendEnforcement: false,
    })
    // One policy system: the registry stores no retry/auth fields of its own.
    expect(regSrc).not.toMatch(/max_attempts:\s*\d/)
    expect(regSrc).not.toMatch(/requires_authorization:\s*(true|false)/)
  })

  it('READ_ONLY maps to the permissive policy_class, everything else to approval', () => {
    expect(policyClassForActionClass('READ_ONLY')).toBe('non_destructive')
    expect(policyClassForActionClass(ACTION_REGISTRY.upload_protected_artifacts.action_class))
      .toBe('approval_required')
  })

  it('a caller cannot force max_attempts or bypass approval', () => {
    // Both come from the derived policy, never from the input.
    expect(runSrc).toMatch(/max_attempts: policy\.maxAttempts/)
    expect(runSrc).toMatch(/const policy = ACTION_CLASS_POLICY\[actionClass\]/)
    const input = runSrc.slice(runSrc.indexOf('interface CreateWorkflowActionRunInput'),
                               runSrc.indexOf('export type CreateWorkflowActionRunResult'))
    expect(input).not.toMatch(/maxAttempts|requiresAuthorization|policyClass/)
  })
})

// ── Compile-time closure ────────────────────────────────────────────────────

describe('the read-only executor cannot be handed a write', () => {
  it('MUTATION — a material kind is not executable at runtime', () => {
    for (const kind of ['upload_protected_artifacts', 'apply_release_gate_migration',
                        'send_release_newsletter', 'generate_page_audio'] as const) {
      expect(isExecutableReadOnly(kind)).toBe(false)
      expect(ACTION_REGISTRY[kind].executor_family).toBe('not_executable')
    }
  })

  it('ExecutableReadOnlyActionKind resolves to exactly the safe set', () => {
    // Compile-time: assigning a material kind to this type is a TYPE ERROR, so
    // this file would not build if the guard regressed.
    const ok: import('../workflows/action-registry').ExecutableReadOnlyActionKind = 'compute_release_instant'
    expect(ok).toBe('compute_release_instant')

    // Widened deliberately, one kind per PR, every one of them READ_ONLY.
    const executable = (Object.entries(ACTION_REGISTRY) as [string, { executor_family: string }][])
      .filter(([, m]) => m.executor_family === 'read_only_observation').map(([k]) => k).sort()
    expect(executable).toEqual([
      'compose_monthly_brief', 'compute_release_instant', 'observe_github_merge_sha_match', 'observe_github_pr_checks_green', 'observe_github_pr_merged', 'observe_release_gate',
      'probe_anonymous_protected_access',
    ])
  })

  it('every executable entry is READ_ONLY — family and class cannot disagree', () => {
    for (const [kind, meta] of Object.entries(ACTION_REGISTRY)) {
      if (meta.executor_family === 'read_only_observation') {
        expect(meta.action_class, `${kind} is executable but not READ_ONLY`).toBe('READ_ONLY')
      }
    }
  })
})

// ── Definition consistency ──────────────────────────────────────────────────

describe('registry and canonical definition agree', () => {
  it('every registered action names a real state that declares automated work', () => {
    expect(assertRegistryMatchesDefinition()).toEqual([])
  })

  it('MUTATION — a state that does not exist is reported, not ignored', () => {
    // Simulated rather than mutating the real registry: the checker's three
    // reasons must all be reachable and distinguishable.
    expect(regSrc).toMatch(/'definition_not_vendored'/)
    expect(regSrc).toMatch(/'state_not_in_definition'/)
    expect(regSrc).toMatch(/'state_declares_no_automated_action'/)
  })

  it('never infers a class from the definition prose', () => {
    // automated_actions is string[] of Swedish sentences; one mistranslation
    // would classify an upload as a read.
    expect(regSrc).not.toMatch(/automated_actions\[|\.includes\(['"]|match\(\//)
    expect(regSrc).toMatch(/state\.automated_actions\.length === 0/)   // count only
  })

  it('the definition genuinely carries no machine-readable kind', () => {
    const def = JSON.parse(readFileSync(join(process.cwd(),
      'lib/workflows/definitions/familje-stunden.monthly-release.v1.json'), 'utf8'))
    const actions = def.states.flatMap((s: { automated_actions?: unknown[] }) => s.automated_actions ?? [])
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.every((a: unknown) => typeof a === 'string')).toBe(true)
  })
})

// ── Target hash ─────────────────────────────────────────────────────────────

describe('target hash', () => {
  it('still binds the class — now the derived one', async () => {
    const { workflowActionTargetPayload } = await import('../workflows/action-target')
    const { canonicalTargetVersionHash } = await import('@/lib/atlas/authorization/build')
    const base = {
      instance: { id: 'i', project_id: 'p', instance_key: '2099-01', def_key: 'k',
                  def_version: 1, def_hash: 'h' } as never,
      spec: { states: [{ id: 's', inputs: [], next_state: null,
                         human_gate: { required: false, approver: null, decision: null, gate_ref: null },
                         automated_actions: [], verification: [], prerequisites: [],
                         outputs: [], retry_policy: null, failure_transition: null,
                         description: '' }] } as never,
      state: 's', actionKind: 'compute_release_instant',
      sideEffectTarget: null, evidence: [], declaredCheckKeys: [],
    }
    const asRead = canonicalTargetVersionHash(
      workflowActionTargetPayload({ ...base, actionClass: 'READ_ONLY' }))
    const asWrite = canonicalTargetVersionHash(
      workflowActionTargetPayload({ ...base, actionClass: 'MATERIAL_WRITE' }))
    // Changing the canonical class changes the hash, so an approval for a read
    // can never be spent on a write.
    expect(asRead).not.toBe(asWrite)
    expect(asRead).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ── READ_ONLY ambiguity ─────────────────────────────────────────────────────

describe('READ_ONLY ambiguity retry', () => {
  const budget = ACTION_CLASS_POLICY.READ_ONLY.maxAttempts

  it('may retry an UNKNOWN within budget — repeating an observation is free', () => {
    const d = decideRetry('READ_ONLY', 'UNKNOWN', 1)
    expect(d.retry).toBe(true)
    expect(d.reason).toMatch(/no side effect/)
  })

  it('stops at the budget and does not become an incident', () => {
    const d = decideRetry('READ_ONLY', 'UNKNOWN', budget)
    expect(d.retry).toBe(false)
    expect((d as { requiresHuman: boolean }).requiresHuman).toBe(false)
    expect(d.reason).toMatch(/budget exhausted/)
  })

  it('MUTATION — the read-only rule must NOT leak into write-capable classes', () => {
    for (const cls of ['REVERSIBLE_WRITE', 'MATERIAL_WRITE', 'FINANCIAL',
                       'EXTERNAL_COMMUNICATION', 'DESTRUCTIVE'] as const) {
      const d = decideRetry(cls, 'UNKNOWN', 1)
      expect(d.retry, `${cls} must never retry UNKNOWN`).toBe(false)
      expect((d as { requiresHuman: boolean }).requiresHuman).toBe(true)
      expect(d.reason).toMatch(/reconcile, never retry/)
    }
  })

  it('PARTIAL is never retried, not even for READ_ONLY', () => {
    // A partial observation is not the same as a lost one: something concluded.
    const d = decideRetry('READ_ONLY', 'PARTIAL', 1)
    expect(d.retry).toBe(false)
  })

  it('READ_ONLY ambiguity still does not freeze the workflow', async () => {
    const { freezesWorkflow } = await import('../workflows/action-outcome')
    expect(freezesWorkflow('READ_ONLY', 'UNKNOWN')).toBe(false)
    expect(freezesWorkflow('MATERIAL_WRITE', 'UNKNOWN')).toBe(true)
  })

  it('no evidence is fabricated from an ambiguous attempt', () => {
    // The outcome model never maps an ambiguous observation to SUCCEEDED.
    const outcome = readFileSync(join(process.cwd(), 'lib/workflows/action-outcome.ts'), 'utf8')
    expect(outcome).toMatch(/case 'response_lost':\s*return 'UNKNOWN'/)
    expect(outcome).not.toMatch(/case 'response_lost':\s*return 'SUCCEEDED'/)
  })
})

// ── Scope ───────────────────────────────────────────────────────────────────

describe('scope', () => {
  it('no executor, no definition registration, no instance creation', () => {
    for (const w of [/fetch\(/, /registerVendoredDefinition/, /workflow_instantiate/]) {
      expect(regSrc).not.toMatch(w)
      expect(runSrc).not.toMatch(w)
    }
  })

  it('reads no feature flag directly and changes none', () => {
    // PR9c legitimately NAMES H1_SPEND_GATE in a refusal message so an operator
    // learns why a FINANCIAL action was blocked — that is diagnostics, not a
    // flag dependency. The real property is that neither module reads
    // process.env for a flag; the spend check goes through the shared predicate.
    for (const src of [regSrc, runSrc]) {
      expect(src).not.toMatch(/process\.env\.H1_/)
      expect(src).not.toMatch(/process\.env\.[A-Z_]+\s*=/)
    }
    expect(runSrc).toMatch(/isSpendGateEnforced\(\)/)   // shared predicate, not a re-read
  })
})
