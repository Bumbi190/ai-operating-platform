/**
 * PR9c — workflow action binding + idempotency.
 *
 * The invariant this file defends: a run cannot change what it was authorized to
 * do. That has to hold at the DATABASE, because the service role writes this
 * table directly and TypeScript is not in the path. So the migration text is
 * asserted as carefully as the code is.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260830_workflow_action_binding.sql')
const sql = readFileSync(MIGRATION, 'utf8')
const sqlCode = sql.replace(/--.*$/gm, '')

const target = readFileSync(join(process.cwd(), 'lib/workflows/action-target.ts'), 'utf8')
const runSrc = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')

const BINDING = [
  'workflow_instance_id', 'workflow_def_hash', 'workflow_from_state', 'action_kind',
  'action_class', 'target_version_hash', 'authorization_id', 'idempotency_key',
  'attempt_group', 'authorized_at',
]

// ── Binding shape ───────────────────────────────────────────────────────────

describe('binding schema', () => {
  it('adds every binding column as nullable so 1251 legacy runs stay valid', () => {
    for (const col of BINDING) {
      expect(sqlCode).toMatch(new RegExp(`add column if not exists ${col}\\s`))
      expect(sqlCode).not.toMatch(new RegExp(`add column if not exists ${col}[^;]*not null`))
    }
  })

  it('MUTATION — partial binding must be impossible', () => {
    // A run with an authorization_id but no target hash LOOKS authorized. The
    // all-or-nothing CHECK is the only thing standing between nullable columns
    // and that state.
    const c = sqlCode.slice(sqlCode.indexOf('runs_action_binding_complete'))
    for (const col of BINDING) {
      expect(c).toMatch(new RegExp(`${col} is null`))
      expect(c).toMatch(new RegExp(`${col} is not null`))
    }
    expect(c).toMatch(/\)\s*or\s*\(/)     // exactly two admissible shapes
  })

  it('pins hash shape — a truncated hash would read as "stale", not "bug"', () => {
    expect(sqlCode).toMatch(/target_version_hash ~ '\^\[0-9a-f\]\{64\}\$'/)
    expect(sqlCode).toMatch(/idempotency_key ~ '\^\[0-9a-f\]\{64\}\$'/)
  })

  it('constrains action_class to the six classes', () => {
    for (const cls of ['READ_ONLY','REVERSIBLE_WRITE','MATERIAL_WRITE','FINANCIAL',
                       'EXTERNAL_COMMUNICATION','DESTRUCTIVE']) {
      expect(sqlCode).toMatch(new RegExp(`'${cls}'`))
    }
  })

  it('derives project, def_hash and state from the instance rather than trusting the row', () => {
    const guard = sqlCode.slice(sqlCode.indexOf('function public.runs_action_binding_guard'))
    expect(guard).toMatch(/new\.project_id is distinct from inst\.project_id/)
    expect(guard).toMatch(/new\.workflow_def_hash is distinct from inst\.def_hash/)
    expect(guard).toMatch(/new\.workflow_from_state is distinct from inst\.current_state/)
  })
})

// ── Immutability ────────────────────────────────────────────────────────────

describe('immutability is enforced in the database, not only in TypeScript', () => {
  // The guard aligns its comparisons across columns, so collapse runs of spaces
  // before matching rather than encoding one file's formatting into the test.
  const guard = sqlCode.slice(sqlCode.indexOf('function public.runs_action_binding_guard'))
    .replace(/[ \t]+/g, ' ')

  it('rejects an UPDATE to every binding field', () => {
    for (const col of BINDING) {
      expect(guard).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`))
    }
    expect(guard).toMatch(/raise exception/)
  })

  it('MUTATION — a trigger that only fired on INSERT would be useless', () => {
    // The whole risk is post-approval mutation, which is an UPDATE.
    expect(sqlCode).toMatch(/before insert or update on public\.runs/)
    expect(sqlCode).not.toMatch(/before insert on public\.runs\s+for each row/)
  })

  it('leaves the fields an executor legitimately needs writable', () => {
    for (const writable of ['status', 'attempts', 'lease_until', 'claim_id', 'last_error', 'error_history']) {
      expect(guard).not.toMatch(new RegExp(`new\\.${writable} is distinct from old\\.${writable}`))
    }
  })
})

// ── Idempotency ─────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('MUTATION — without the unique index, a retry storm creates many runs', () => {
    expect(sqlCode).toMatch(/create unique index runs_action_identity_uniq/)
    expect(sqlCode).toMatch(/on public\.runs \(idempotency_key\)/)
  })

  it('is partial, so legacy runs are unaffected and terminal runs free the identity', () => {
    const idx = sqlCode.slice(sqlCode.indexOf('runs_action_identity_uniq'))
    expect(idx).toMatch(/where idempotency_key is not null and status not in \('cancelled','rejected'\)/)
  })

  it('hashes exactly the six fields, via the existing canonicalizer', async () => {
    const { computeActionIdempotencyKey } = await import('../workflows/action-target')
    const base = {
      workflowInstanceId: 'i', defHash: 'd', fromState: 's',
      actionKind: 'k', targetVersionHash: 't', attemptGroup: 'g',
    }
    const key = computeActionIdempotencyKey(base)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    // Same inputs → same identity (a retry).
    expect(computeActionIdempotencyKey({ ...base })).toBe(key)
    // Every field is load-bearing.
    for (const field of Object.keys(base) as (keyof typeof base)[]) {
      expect(computeActionIdempotencyKey({ ...base, [field]: 'CHANGED' })).not.toBe(key)
    }
  })

  it('a new attempt_group is a NEW act; retries reuse the old one', () => {
    // attemptGroup is stamped once at creation and never incremented, which is
    // what makes a retry hash identically rather than becoming a second action.
    expect(runSrc).toMatch(/const attemptGroup = input\.attemptGroup \?\? uuid\(\)/)
    expect(runSrc).not.toMatch(/attemptGroup\s*\+\+|attempt_group\s*=\s*.*\+\s*1/)
  })

  it('reports a duplicate identity distinctly from a generic insert failure', () => {
    expect(runSrc).toMatch(/'23505'/)
    expect(runSrc).toMatch(/duplicate_action_identity/)
    expect(runSrc).toMatch(/retry it, do not create a second/)
  })
})

// ── Action classes ──────────────────────────────────────────────────────────

describe('action class policy', () => {
  it('MUTATION — material actions must not carry max_attempts 3', async () => {
    const { ACTION_CLASS_POLICY } = await import('../workflows/action-target')
    for (const cls of ['MATERIAL_WRITE','FINANCIAL','EXTERNAL_COMMUNICATION','DESTRUCTIVE'] as const) {
      expect(ACTION_CLASS_POLICY[cls].maxAttempts).toBe(1)
      expect(ACTION_CLASS_POLICY[cls].requiresPreCommitRevalidation).toBe(true)
      expect(ACTION_CLASS_POLICY[cls].requiresIdempotency).toBe(true)
      expect(ACTION_CLASS_POLICY[cls].requiresAuthorization).toBe(true)
    }
    // …and the database refuses it independently of the table above.
    expect(sqlCode).toMatch(/runs_material_actions_single_attempt/)
    expect(sqlCode).toMatch(/action_class in \('READ_ONLY','REVERSIBLE_WRITE'\)\s*or max_attempts = 1/)
  })

  it('READ_ONLY may retry and needs no approval', async () => {
    const { ACTION_CLASS_POLICY } = await import('../workflows/action-target')
    expect(ACTION_CLASS_POLICY.READ_ONLY.maxAttempts).toBeGreaterThan(1)
    expect(ACTION_CLASS_POLICY.READ_ONLY.requiresAuthorization).toBe(false)
  })

  it('does not create a vocabulary that conflicts with policy_class', async () => {
    const { policyClassForActionClass } = await import('../workflows/action-target')
    // Maps INTO the existing default-deny gate rather than competing with it.
    expect(policyClassForActionClass('READ_ONLY')).toBe('non_destructive')
    for (const cls of ['REVERSIBLE_WRITE','MATERIAL_WRITE','FINANCIAL',
                       'EXTERNAL_COMMUNICATION','DESTRUCTIVE'] as const) {
      expect(policyClassForActionClass(cls)).toBe('approval_required')
    }
  })
})

// ── Target model ────────────────────────────────────────────────────────────

describe('action target', () => {
  it('is its own target type, not a reused gate', () => {
    expect(target).toMatch(/WORKFLOW_ACTION_TARGET_TYPE = 'workflow_action'/)
    // A gate approves an ADVANCE; one state can host several actions with
    // different blast radii, so reusing it would let one approval cover them all.
    expect(target).not.toMatch(/WORKFLOW_GATE_TARGET_TYPE\s*=/)
  })

  it('adds no fourth canonicalizer', () => {
    expect(target).toMatch(/canonicalTargetVersionHash/)
    expect(target).not.toMatch(/function canonicalJson/)
    expect(target).not.toMatch(/JSON\.stringify\(/)
  })

  it('binds everything a change to which should invalidate the approval', () => {
    for (const field of ['instance_id', 'project_id', 'def_key', 'def_version', 'def_hash',
                         'current_state', 'state_inputs', 'side_effect_target', 'evidence']) {
      expect(target).toMatch(new RegExp(`${field}:`))
    }
    expect(target).toMatch(/kind: input\.actionKind/)
    // Still bound into the hash — but PR9e-0 makes the value DERIVED, so the
    // builder's input can no longer carry a caller-chosen class.
    expect(target).toMatch(/class: input\.actionClass/)
    const runSrcNow = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    expect(runSrcNow).toMatch(/actionKind: input\.actionKind, actionClass,/)
  })

  it('sorts evidence and side-effect keys so an equal set hashes equally', () => {
    expect(target).toMatch(/\.sort\(/)
    expect(target).toMatch(/Object\.entries\(input\.sideEffectTarget\)\.sort/)
  })
})

// ── Creation contract ───────────────────────────────────────────────────────

describe('the caller requests; the server derives', () => {
  it('MUTATION — a caller-supplied target hash would defeat the whole pin', () => {
    const inputType = runSrc.slice(runSrc.indexOf('interface CreateWorkflowActionRunInput'),
                                   runSrc.indexOf('export type CreateWorkflowActionRunResult'))
    for (const forbidden of ['targetVersionHash', 'projectId', 'fromState', 'defHash',
                             'idempotencyKey', 'actionClass']) {
      expect(inputType).not.toMatch(new RegExp(`${forbidden}\\s*[?:]`))
    }
    // …and the hash is computed, never read from input.
    expect(runSrc).toMatch(/target = computeWorkflowActionTarget\(\{/)
  })

  it('MUTATION — accepting any authorization UUID must fail the pin', () => {
    // Not just "is it valid" but "does it pin exactly what we derived".
    expect(runSrc).toMatch(/pinned\.versionHash !== target\.versionHash/)
    expect(runSrc).toMatch(/pinned\.targetId !== target\.targetId/)
    expect(runSrc).toMatch(/pinned\.targetType !== WORKFLOW_ACTION_TARGET_TYPE/)
    expect(runSrc).toMatch(/target_hash_mismatch/)
  })

  it('refuses a paused project, an inactive instance and unmet required evidence', () => {
    for (const refusal of ['project_paused', 'instance_not_active', 'evidence_not_satisfied']) {
      expect(runSrc).toMatch(new RegExp(refusal))
    }
  })

  it('only definition-declared REQUIRED checks may block', () => {
    // `required` is a property of the declaration, not the verdict.
    expect(runSrc).toMatch(/c\.state === instance\.current_state && c\.required/)
  })
})

// ── Claim-time + pre-commit ─────────────────────────────────────────────────

describe('revalidation', () => {
  it('treats drift as terminal, never as a transient retry', () => {
    // Retrying drift means repeatedly attempting something nobody approved.
    const drift = runSrc.slice(runSrc.indexOf('const DRIFT'), runSrc.indexOf('export async function assertWorkflowActionReady'))
    for (const b of ['instance_missing','instance_not_active','project_mismatch','state_drifted',
                     'authorization_not_effective','target_drifted','evidence_drifted']) {
      expect(drift).toMatch(new RegExp(b))
    }
    expect(runSrc).toMatch(/terminal = blockers\.some\(b => DRIFT\.includes\(b\)\)/)
  })

  it('claim-time re-derives the target instead of trusting the stored hash', () => {
    expect(runSrc).toMatch(/target\.versionHash !== run\.target_version_hash/)
    expect(runSrc).toMatch(/blockers\.push\('target_drifted'\)/)
  })

  it('pre-commit checks fencing FIRST', () => {
    // A rotated claim means another owner has this run; nothing this invocation
    // believes about it can be trusted, including its own earlier checks.
    const pre = runSrc.slice(runSrc.indexOf('export async function assertWorkflowActionStillAuthorized'))
    // Compare the GUARDS, not the select list — which necessarily names
    // cancel_requested before any of them.
    const fenceGuard = pre.indexOf('run.claim_id !== claimId')
    const cancelGuard = pre.indexOf('run.cancel_requested === true')
    expect(fenceGuard).toBeGreaterThan(-1)
    expect(fenceGuard).toBeLessThan(cancelGuard)
  })

  it('pre-commit performs no side effect of its own', () => {
    const from = runSrc.indexOf('export async function assertWorkflowActionStillAuthorized')
    // Bounded to the function itself: slicing to EOF swept in unrelated helpers.
    const pre = runSrc.slice(from, runSrc.indexOf('\n}', from))
    expect(pre).toMatch(/allowed: true/)                       // the slice is the real body
    for (const w of [/\.update\(/, /\.insert\(/, /\.delete\(/, /\.rpc\(/]) expect(pre).not.toMatch(w)
  })
})

// ── Gate interactions ───────────────────────────────────────────────────────

describe('a bound action is not a permission to execute', () => {
  it('FINANCIAL cannot be bound while spend enforcement is advisory', () => {
    // PR9b records refusals but does not honour them, so "budget checked" would
    // be a claim we cannot back.
    expect(runSrc).toMatch(/policy\.requiresSpendEnforcement && !isSpendGateEnforced\(\)/)
    expect(runSrc).toMatch(/spend_enforcement_required/)
  })

  it('does not treat PR2 authorization as a replacement for the policy gate', () => {
    // action_class maps INTO policy_class; it does not bypass it, and this PR
    // does not touch H1_POLICY_GATE.
    expect(runSrc).toMatch(/policy_class: policyClassForActionClass/)
    expect(runSrc).not.toMatch(/H1_POLICY_GATE/)
    expect(sqlCode).not.toMatch(/H1_POLICY_GATE/)
  })

  it('executes nothing', () => {
    for (const forbidden of [/fetch\(/, /appendTransition/, /executeRunSteps/, /reserveSpend/,
                             /generateVoiceover/, /claim_runs/]) {
      expect(runSrc).not.toMatch(forbidden)
    }
  })
})

// ── Lease default (section J) ───────────────────────────────────────────────

describe('claim_runs lease default', () => {
  it('is raised to a value that outlives the drain invocation', () => {
    // PR9a carried this: DEFAULT was 280 while maxDuration is 300, so a caller
    // relying on the default would get a lease expiring while its function is
    // still alive. Safe to raise because there is exactly ONE caller and it
    // passes 320 explicitly — proven in the audit, not assumed.
    expect(sqlCode).toMatch(/p_lease_seconds int default 320/)
  })

  it('preserves both PR9a properties while changing the default', () => {
    const body = sqlCode.slice(sqlCode.indexOf('create or replace function public.claim_runs'))
    expect(body).toMatch(/claim_id\s*=\s*gen_random_uuid\(\)/)
    expect(body).toMatch(/p\.execution_paused = true/)
    expect(body).toMatch(/for update skip locked/)
  })

  it('the sole caller still passes an explicit lease', () => {
    const drain = readFileSync(join(process.cwd(), 'app/api/runs/drain/route.ts'), 'utf8')
    expect(drain).toMatch(/p_lease_seconds: LEASE_SECONDS/)
    expect(drain).toMatch(/LEASE_SECONDS = 320/)
  })
})
