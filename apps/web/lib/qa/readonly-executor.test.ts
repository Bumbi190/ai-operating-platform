/**
 * PR9e — the first executable workflow action.
 *
 * The property this file defends: the execution surface is CLOSED. Exactly one
 * kind can reach a handler, four independent gates stand in front of it, and
 * nothing here can transition a workflow.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeReleaseInstantHandler, COMPUTE_RELEASE_INSTANT_CHECK }
  from '../workflows/handlers/compute-release-instant'
import { executableActionKinds, nonExecutableActionKinds } from '../workflows/action-executor'
import { ACTION_REGISTRY } from '../workflows/action-registry'

const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
const handler = readFileSync(join(process.cwd(), 'lib/workflows/handlers/compute-release-instant.ts'), 'utf8')
const drain = readFileSync(join(process.cwd(), 'app/api/runs/drain/route.ts'), 'utf8')
const NOW = '2026-08-30T12:00:00.000Z'

const base = { state: 'planning', defKey: 'familje-stunden.monthly-release', defVersion: 1, now: NOW }

// ── Closed surface ──────────────────────────────────────────────────────────

describe('the execution surface is closed', () => {
  it('exactly one kind is executable today', () => {
    expect(executableActionKinds()).toEqual(['compute_release_instant'])
  })

  it('MUTATION — every other known kind is declared non-executable', () => {
    expect(nonExecutableActionKinds().sort()).toEqual([
      'apply_release_gate_migration', 'generate_page_audio',
      'probe_anonymous_protected_access', 'send_release_newsletter',
      'upload_protected_artifacts',
    ])
    for (const k of nonExecutableActionKinds()) {
      expect(executableActionKinds()).not.toContain(k)
    }
  })

  it('MUTATION — no generic HTTP, shell, dynamic import or provider routing', () => {
    for (const forbidden of [/fetch\(/, /child_process/, /import\(/, /new Function/,
                             /eval\(/, /axios/, /\$\{[^}]*url/i]) {
      expect(exec).not.toMatch(forbidden)
      expect(handler).not.toMatch(forbidden)
    }
  })

  it('MUTATION — the handler map is keyed by the narrowed type', () => {
    // A MATERIAL_WRITE entry here is a TYPE ERROR, so this file would not build.
    expect(exec).toMatch(/Record<ExecutableReadOnlyActionKind, ReadOnlyHandler>/)
  })

  it('four independent gates stand before any handler', () => {
    for (const refusal of ['unknown_action_kind', 'not_executable_family',
                           'class_mismatch', 'not_read_only']) {
      expect(exec).toMatch(new RegExp(refusal))
    }
    // Gate order: every refusal precedes the handler lookup.
    expect(exec.indexOf("refusal: 'not_read_only'")).toBeLessThan(exec.indexOf('const handler = HANDLERS['))
  })

  it('MUTATION — the stored class is compared to the registry, not trusted', () => {
    expect(exec).toMatch(/run\.action_class !== canonical\.action_class/)
  })

  it('readiness is re-derived before execution', () => {
    expect(exec.indexOf('assertWorkflowActionReady')).toBeLessThan(exec.indexOf('await handler({'))
  })
})

// ── Execution is not advancement ────────────────────────────────────────────

describe('completing an action does not move the workflow', () => {
  it('MUTATION — the executor cannot transition anything', () => {
    for (const forbidden of [/appendTransition/, /workflow_append_transition/,
                             /workflow_transitions/, /current_state:/]) {
      expect(exec).not.toMatch(forbidden)
    }
  })

  it('re-arms instead — the tick still re-derives everything', () => {
    expect(exec).toMatch(/rearmForAuthorization|wake_at: now/)
    expect(exec).toMatch(/Re-arm, never advance/)
  })
})

// ── Handler ─────────────────────────────────────────────────────────────────

describe('compute_release_instant', () => {
  it('computes the DST-correct instant for the validation month', async () => {
    const out = await computeReleaseInstantHandler({ ...base, instanceKey: '2099-01' })
    expect(out.result).toBe('pass')
    expect(out.checkKey).toBe(COMPUTE_RELEASE_INSTANT_CHECK)
    expect(out.detail.timezone).toBe('Europe/Stockholm')
    // January is winter time: +01:00, so 00:00 local is 23:00 UTC the day before.
    expect(out.detail.computed_utc).toBe('2098-12-31T23:00:00.000Z')
    expect(out.detail.utc_offset).toBe('+01:00')
  })

  it('handles both DST sides deterministically', async () => {
    // The PR4 cases: October is +02:00, November is +01:00. Derived per month
    // via Intl, never by adding a month to a previous instant.
    const oct = await computeReleaseInstantHandler({ ...base, instanceKey: '2026-10' })
    const nov = await computeReleaseInstantHandler({ ...base, instanceKey: '2026-11' })
    expect(oct.detail.computed_utc).toBe('2026-09-30T22:00:00.000Z')
    expect(oct.detail.utc_offset).toBe('+02:00')
    expect(nov.detail.computed_utc).toBe('2026-10-31T23:00:00.000Z')
    expect(nov.detail.utc_offset).toBe('+01:00')
  })

  it('MUTATION — a malformed month fails closed, never PASS', async () => {
    for (const bad of ['not-a-month', '2026-13', '2026', '', 'validation-1']) {
      const out = await computeReleaseInstantHandler({ ...base, instanceKey: bad })
      expect(out.result, `"${bad}" must not pass`).toBe('error')
      expect(out.result).not.toBe('pass')
    }
  })

  it('consults nothing external and reads no credential', () => {
    expect(handler).not.toMatch(/process\.env/)
    expect(handler).not.toMatch(/createAdminClient|from\('/)
    // authoritativeSystem null is the honest answer for pure computation.
    expect(handler).toMatch(/authoritativeSystem: null/)
  })

  it('reports safe structured detail only', async () => {
    const out = await computeReleaseInstantHandler({ ...base, instanceKey: '2099-01' })
    expect(Object.keys(out.detail).sort()).toEqual([
      'computed_at', 'computed_utc', 'local_release_time', 'month_key', 'timezone', 'utc_offset',
    ])
    for (const v of Object.values(out.detail)) {
      expect(['string', 'number', 'boolean', 'object']).toContain(typeof v)
    }
  })
})

// ── Evidence ────────────────────────────────────────────────────────────────

describe('evidence', () => {
  it('MUTATION — a run cannot be marked succeeded with evidence omitted', () => {
    // Evidence is written BEFORE the outcome, and a failed write downgrades the
    // outcome rather than being ignored.
    expect(exec.indexOf('recordEvidence(db, {')).toBeLessThan(exec.indexOf('const outcome: ActionOutcome'))
    expect(exec).toMatch(/evidenceRecorded\s*\?\s*\(output\.result === 'pass' \? 'SUCCEEDED' : 'FAILED'\)\s*:\s*'SUCCEEDED_EVIDENCE_PENDING'/)
  })

  it('provenance is hardcoded automated — a handler cannot claim attestation', () => {
    expect(exec).toMatch(/source: 'automated'/)
    expect(exec).not.toMatch(/source: 'attested'/)
    expect(exec).not.toMatch(/attestation:/)
  })

  it('binds the check the adapter actually declares', async () => {
    const { FAMILJE_STUNDEN_CHECKS } = await import('../workflows/adapters/familje-stunden/checks')
    const declared = FAMILJE_STUNDEN_CHECKS.filter(c => c.check_key === COMPUTE_RELEASE_INSTANT_CHECK)
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.some(c => c.state === ACTION_REGISTRY.compute_release_instant.state)).toBe(true)
  })

  it('an evidence-write failure never repeats the observation', () => {
    expect(exec).toMatch(/record the evidence, do not repeat the action/)
  })
})

// ── Fencing ─────────────────────────────────────────────────────────────────

describe('fencing', () => {
  it('every executing write is conditioned on claim_id', () => {
    expect(exec).toMatch(/\.eq\('claim_id', claimId\)/)
    // A run with no claim is refused rather than written unconditionally.
    expect(exec).toMatch(/if \(!claimId\) \{[\s\S]{0,200}return \{ fenced: true \}/)
  })

  it('a rotated claim aborts before and after the handler', () => {
    const before = exec.indexOf("refusal: 'fenced', detail: 'claim rotated before dispatch'")
    const after = exec.indexOf("refusal: 'fenced', detail: 'claim rotated before finalize'")
    expect(before).toBeGreaterThan(-1)
    expect(after).toBeGreaterThan(before)
  })
})

// ── Legacy isolation ────────────────────────────────────────────────────────

describe('legacy runs are untouched', () => {
  it('the drain branches on workflow_instance_id, which is null on all 1251 legacy runs', () => {
    expect(drain).toMatch(/if \(isWorkflowActionRun\(run\)\)/)
    // …and the branch precedes any agent-step or marketing handling.
    expect(drain.indexOf('isWorkflowActionRun(run)')).toBeLessThan(drain.indexOf('isMarketingRun(kind)'))
  })

  it('MUTATION — a workflow action never reaches an LLM agent step', () => {
    const from = drain.indexOf('if (isWorkflowActionRun(run))')
    const branch = drain.slice(from, drain.indexOf('const kind = run.kind', from))
    for (const forbidden of [/executeRunSteps/, /runSteps/, /MARKETING_HANDLERS/, /computeCheckpoint/]) {
      expect(branch).not.toMatch(forbidden)
    }
    expect(branch).toMatch(/executeWorkflowAction/)
    expect(branch).toMatch(/continue/)         // and it stops there
  })

  it('the legacy cancel and fencing paths still precede it', () => {
    expect(drain.indexOf('isCancelEnabled() && run.cancel_requested'))
      .toBeLessThan(drain.indexOf('isWorkflowActionRun(run)'))
  })
})

// ── Operator paths ──────────────────────────────────────────────────────────

describe('registration and instance creation are deliberate operator acts', () => {
  const admin = readFileSync(join(process.cwd(), 'app/api/workflows/admin/route.ts'), 'utf8')

  it('neither runs at deploy time — both are POST actions', () => {
    // PR9f adds schedule_readonly_evaluation — which also runs only on POST and
    // cannot name what will execute.
    expect(admin).toMatch(/const ACTIONS = \['register_definition', 'create_instance', 'schedule_readonly_evaluation'\]/)
    expect(admin).toMatch(/resolveProjectAccess/)
  })

  it('registration creates no instance and no run', () => {
    const block = admin.slice(admin.indexOf("if (action === 'register_definition')"),
                              admin.indexOf('// ── create_instance ──'))
    expect(block).not.toMatch(/instantiate\(/)
    expect(block).not.toMatch(/from\('runs'\)/)
  })

  it('instance creation schedules nothing and runs nothing', () => {
    // Behaviour, not prose: the route never schedules a wake and never reaches
    // an executor. `summarize` REPORTS wake_at, which is why the check targets
    // the scheduling calls rather than the identifier.
    const block = admin.slice(admin.indexOf('// ── create_instance ──'))
    expect(block).not.toMatch(/scheduleWorkflowWake/)
    expect(block).not.toMatch(/wake_at:\s*(now|new Date)/)
    expect(block).not.toMatch(/executeWorkflowAction|createWorkflowActionRun/)
    expect(block).not.toMatch(/from\('runs'\)/)
    // The instantiate call carries no scheduling argument at all.
    const call = block.slice(block.indexOf('instantiate(db, {'), block.indexOf('})', block.indexOf('instantiate(db, {')))
    expect(call).not.toMatch(/wake/i)
    expect(call).toMatch(/defKey, version, projectId, instanceKey/)
  })

  it('an instance cannot be created before its definition is registered', () => {
    expect(admin).toMatch(/definition_not_registered/)
  })

  it('only vendored definitions are registerable', () => {
    expect(admin).toMatch(/REGISTERABLE\.has\(defKey\)/)
  })
})
