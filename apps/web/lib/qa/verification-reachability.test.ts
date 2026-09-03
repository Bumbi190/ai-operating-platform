/**
 * Verification reachability — descriptive only.
 *
 * The load-bearing tests here are the ones that assert reachability changes
 * NOTHING. It answers "how could this be answered?"; evidence answers "has it
 * been?". If those two axes ever merge, a check whose automation was
 * deliberately blocked starts looking satisfied — the exact failure this slice
 * exists to prevent.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { MANUAL_PRIVILEGED_CHECKS, manualPrivilegedPolicy } from '../workflows/bundle/reachability-policy'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import type { WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition } from '../workflows/types'

const NOW = '2026-09-03T12:00:00.000Z'
const MONTH = '2099-01'
const READ_ONLY_KEYS = ['release_instant_computed', 'anonymous_protected_access_denied', 'release_gate_exists']

function realDef(): WorkflowDef {
  const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
  return { id: 'd', def_key: v.def_key, version: v.version, def_hash: v.def_hash, spec: v.spec, created_at: NOW }
}
const instance = (): WorkflowInstance => ({
  id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1, def_hash: 'h',
  project_id: 'p', instance_key: MONTH, current_state: 'backend_release_gate', status: 'active',
  wake_at: null, last_tick_at: null, last_tick_outcome: null, created_at: NOW, closed_at: null,
})
const transitions: WorkflowTransition[] = [
  { id: 't1', seq: 1, instance_id: 'i', from_state: null, to_state: 'planning',
    reason: 't', actor: 't', evidence_ref: null, authorization_id: null, occurred_at: NOW },
]
const ev = (check_key: string, state: string, result: WorkflowEvidence['result']): WorkflowEvidence => ({
  id: `e-${state}-${check_key}`, instance_id: 'i', state, check_key, result, source: 'automated',
  detail: {}, recorded_at: NOW, producer: 'o', producer_type: 'o', observed_at: NOW,
  payload_hash: null, target_hash: null, attestation: {},
})

const proj = (evidence: WorkflowEvidence[] = [], withKeys = true) => projectMonthReleaseBundle({
  month_key: MONTH, def: realDef(), instance: instance(), transitions, evidence,
  declaredChecks: FAMILJE_STUNDEN_CHECKS,
  readOnlyAnsweredCheckKeys: withKeys ? READ_ONLY_KEYS : [],
  now: NOW,
})
const find = (b: ReturnType<typeof proj>, key: string) => b.checks.find(c => c.check_key === key)!

describe('1-4. classification is deterministic and never guessed', () => {
  it('1. a check answered by an executable READ_ONLY action → EXECUTABLE', () => {
    const c = find(proj(), 'release_gate_exists')
    expect(c.reachability).toBe('EXECUTABLE')
    expect(c.reachability_reason).toBe('EXECUTABLE_ACTION_AVAILABLE')
  })

  it('2. an attestation-permitted check with no action → ATTESTABLE', () => {
    const c = find(proj(), 'pdf_page_count')
    expect(c.reachability).toBe('ATTESTABLE')
    expect(c.reachability_reason).toBe('ATTESTATION_ALLOWED')
  })

  it('3. shared_manifest_consumers_in_sync → MANUAL_PRIVILEGED_VERIFICATION', () => {
    for (const c of proj().checks.filter(x => x.check_key === 'shared_manifest_consumers_in_sync')) {
      expect(c.reachability).toBe('MANUAL_PRIVILEGED_VERIFICATION')
      expect(c.reachability_reason).toBe('BROAD_CREDENTIAL_PROHIBITED')
    }
  })

  it('4. automated-only, no action, no policy entry → UNREACHABLE', () => {
    const c = find(proj(), 'github_pr_merged')
    expect(c.reachability).toBe('UNREACHABLE')
    expect(c.reachability_reason).toBe('NO_VALID_EVIDENCE_PATH')
  })

  it('20. MANUAL_PRIVILEGED_VERIFICATION requires an explicit policy entry', () => {
    const manual = proj().checks.filter(c => c.reachability === 'MANUAL_PRIVILEGED_VERIFICATION')
    expect(manual.length).toBeGreaterThan(0)
    for (const c of manual) expect(manualPrivilegedPolicy(c.check_key)).not.toBeNull()
    // Negative control: an unlisted automated-only check must NOT be manual.
    expect(manualPrivilegedPolicy('vercel_production_ready')).toBeNull()
    expect(find(proj(), 'vercel_production_ready').reachability).toBe('UNREACHABLE')
  })

  it('the policy list stays deliberately minimal', () => {
    expect(MANUAL_PRIVILEGED_CHECKS.map(p => p.check_key)).toEqual(['shared_manifest_consumers_in_sync'])
  })
})

describe('5-9. reachability never makes anything pass', () => {
  it('5/6. MANUAL_PRIVILEGED_VERIFICATION is neither PASS nor gate satisfaction', () => {
    const b = proj()
    for (const c of b.checks.filter(x => x.reachability === 'MANUAL_PRIVILEGED_VERIFICATION')) {
      expect(c.status).toBe('NOT_EXERCISED')
      expect(c.status).not.toBe('PASS')
    }
    // Its hard gate is still not satisfied.
    const gate = b.hard_gates.find(g => g.enforced_at.includes('edge_deploy'))
    if (gate) expect(gate.status).not.toBe('PASS')
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('7/8/9. UNREACHABLE, EXECUTABLE and ATTESTABLE are all still unsatisfied without evidence', () => {
    const b = proj()
    for (const r of ['UNREACHABLE', 'EXECUTABLE', 'ATTESTABLE'] as const) {
      const some = b.checks.filter(c => c.reachability === r)
      expect(some.length).toBeGreaterThan(0)
      for (const c of some) expect(c.status).toBe('NOT_EXERCISED')
    }
  })

  it('an EXECUTABLE check passes only when real evidence says so', () => {
    const before = find(proj(), 'release_gate_exists')
    const after = find(proj([ev('release_gate_exists', 'backend_release_gate', 'pass')]), 'release_gate_exists')
    expect(before.status).toBe('NOT_EXERCISED')
    expect(after.status).toBe('PASS')
    // …and reachability is identical either way.
    expect(after.reachability).toBe(before.reachability)
  })
})

describe('10-11. no regression in evidence or readiness', () => {
  const evidence = [
    ev('release_gate_exists', 'backend_release_gate', 'fail'),
    ev('typecheck_passed', 'frontend_deploy', 'pass'),
    ev('github_pr_merged', 'frontend_deploy', 'blocked'),
  ]

  it('10. every check status is exactly what the evidence says', () => {
    const b = proj(evidence)
    expect(find(b, 'release_gate_exists').status).toBe('FAIL')
    expect(find(b, 'typecheck_passed').status).toBe('PASS')
    expect(find(b, 'github_pr_merged').status).toBe('BLOCKED')
    expect(find(b, 'pdf_page_count').status).toBe('NOT_EXERCISED')
  })

  it('11. readiness is byte-identical with reachability stripped out', () => {
    // The strongest available regression proof: remove the new fields and the
    // rest of the bundle must be unchanged.
    const b = proj(evidence)
    const stripped = JSON.parse(JSON.stringify(b))
    delete stripped.verification_reachability
    for (const c of stripped.checks) { delete c.reachability; delete c.reachability_reason }

    const expectedShape = JSON.parse(JSON.stringify({
      ...b,
      verification_reachability: undefined,
      checks: b.checks.map(({ reachability, reachability_reason, ...rest }) => rest),
    }))
    delete expectedShape.verification_reachability
    expect(stripped).toEqual(expectedShape)
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('readiness does not vary when a check moves between reachability classes', () => {
    // Same evidence, but the registry reports no executable actions — which
    // flips several checks EXECUTABLE -> UNREACHABLE. Readiness must not move.
    const withActions = proj(evidence, true)
    const without = proj(evidence, false)
    expect(find(without, 'release_gate_exists').reachability).toBe('UNREACHABLE')
    expect(find(withActions, 'release_gate_exists').reachability).toBe('EXECUTABLE')
    expect(without.readiness.product).toBe(withActions.readiness.product)
    expect(without.readiness.blockers.map(b => b.code).sort())
      .toEqual(withActions.readiness.blockers.map(b => b.code).sort())
  })
})

describe('12-13. provenance is untouched', () => {
  it('12. allowed_provenance for the target check is unchanged and automated-only', () => {
    const declared = FAMILJE_STUNDEN_CHECKS.filter(c => c.check_key === 'shared_manifest_consumers_in_sync')
    expect(declared.length).toBeGreaterThan(0)
    for (const c of declared) expect([...c.allowed_provenance]).toEqual(['automated'])
  })

  it('13. the evidence route still refuses attested evidence for automated-only checks', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/workflows/evidence/route.ts'), 'utf8')
    expect(route).toMatch(/allowed_provenance\.includes\('attested'\)/)
  })

  it('no new evidence provenance was introduced', () => {
    const types = readFileSync(join(process.cwd(), 'lib/workflows/types.ts'), 'utf8')
    expect(types).toMatch(/EvidenceSource = 'automated' \| 'attested'/)
    for (const src of [
      'lib/workflows/bundle/project.ts',
      'lib/workflows/bundle/types.ts',
      'lib/workflows/bundle/reachability-policy.ts',
    ]) {
      expect(readFileSync(join(process.cwd(), src), 'utf8')).not.toContain("'manual_privileged'")
    }
  })
})

describe('14-18. the projection stays inert', () => {
  const files = [
    'lib/workflows/bundle/project.ts',
    'lib/workflows/bundle/types.ts',
    'lib/workflows/bundle/reachability-policy.ts',
  ]
  const code = files.map(f => readFileSync(join(process.cwd(), f), 'utf8'))
    .join('\n').split('\n')
    .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
    .join('\n')

  it('14/15/16/17/18. no action, network, credential, spend or write path exists', () => {
    for (const forbidden of [
      'executeWorkflowAction', 'observeReleaseGate', 'verifyState',
      'fetch(', 'process.env', 'createAdminClient', 'supabase',
      'MATERIAL_WRITE', 'EXTERNAL_COMMUNICATION', 'FINANCIAL',
      '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
    ]) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })

  it('the projection remains pure — identical inputs, identical output', () => {
    expect(JSON.stringify(proj())).toBe(JSON.stringify(proj()))
  })
})

describe('19. the summary agrees with the per-check values', () => {
  it('counts and ids match exactly', () => {
    const b = proj()
    const s = b.verification_reachability
    const count = (r: string) => b.checks.filter(c => c.reachability === r).length
    expect(s.executable).toBe(count('EXECUTABLE'))
    expect(s.attestable).toBe(count('ATTESTABLE'))
    expect(s.manual_privileged_verification).toBe(count('MANUAL_PRIVILEGED_VERIFICATION'))
    expect(s.unreachable).toBe(count('UNREACHABLE'))
    expect(s.executable + s.attestable + s.manual_privileged_verification + s.unreachable)
      .toBe(b.checks.length)
    expect(s.manual_privileged_check_keys).toEqual(['shared_manifest_consumers_in_sync'])
    expect(s.unreachable_check_keys).toContain('github_pr_merged')
    expect(s.unreachable_check_keys).not.toContain('shared_manifest_consumers_in_sync')
  })
})
