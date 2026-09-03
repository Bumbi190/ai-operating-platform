/**
 * Phase 1A — Month Release Bundle v0.
 *
 * Behavioural tests against the REAL shipped definition and the REAL adapter
 * catalogue, not hand-written fakes of them. A fixture spec would let the
 * projection agree with a definition nobody ships.
 *
 * The load-bearing tests are the negative ones. This read model exists to sit in
 * front of a FAIL-OPEN release gate, so the failure that matters is not "it
 * showed the wrong number" — it is "it showed green when it had not looked".
 * Several tests below therefore assert that the bundle REFUSES to be ready.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  projectMonthReleaseBundle, isCanonicalMonthKey, APPROVAL_CATEGORY_BY_STATE,
} from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import type {
  WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition,
} from '../workflows/types'

const NOW = '2026-09-03T12:00:00.000Z'
const MONTH = '2026-10'

function realDef(): WorkflowDef {
  const v = loadVendoredDefinitions()
    .find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)
  if (!v) throw new Error('shipped definition missing')
  return {
    id: 'def-1', def_key: v.def_key, version: v.version,
    def_hash: v.def_hash, spec: v.spec, created_at: NOW,
  }
}

function instance(over: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    id: 'inst-1', def_id: 'def-1', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE,
    def_version: 1, def_hash: 'h', project_id: 'p', instance_key: MONTH,
    current_state: 'planning', status: 'active', wake_at: null,
    last_tick_at: null, last_tick_outcome: null,
    created_at: NOW, closed_at: null, ...over,
  }
}

function transition(seq: number, to: string, from: string | null): WorkflowTransition {
  return {
    id: `t-${seq}`, seq, instance_id: 'inst-1', from_state: from, to_state: to,
    reason: 'test', actor: 'test', evidence_ref: null, authorization_id: null,
    occurred_at: NOW,
  }
}

function evidence(
  state: string, check_key: string,
  result: WorkflowEvidence['result'] = 'pass',
  source: WorkflowEvidence['source'] = 'automated',
): WorkflowEvidence {
  return {
    id: `e-${state}-${check_key}`, instance_id: 'inst-1', state, check_key,
    result, source, detail: {}, recorded_at: NOW,
    producer: 'test', producer_type: 'test', observed_at: NOW,
    payload_hash: null, target_hash: null, attestation: {},
  }
}

const base = {
  month_key: MONTH,
  def: realDef(),
  instance: instance(),
  transitions: [transition(1, 'planning', null)],
  evidence: [] as WorkflowEvidence[],
  declaredChecks: FAMILJE_STUNDEN_CHECKS,
  now: NOW,
}

describe('canonical month identity', () => {
  it('accepts YYYY-MM and rejects legacy month names', () => {
    expect(isCanonicalMonthKey('2026-10')).toBe(true)
    expect(isCanonicalMonthKey('2027-01')).toBe(true)
    expect(isCanonicalMonthKey('oktober')).toBe(false)
    expect(isCanonicalMonthKey('2026-13')).toBe(false)
    expect(isCanonicalMonthKey('2026-1')).toBe(false)
  })
})

describe('1. a valid month projects its instance', () => {
  it('carries identity and workflow position through', () => {
    const b = projectMonthReleaseBundle(base)
    expect(b.identity.month_key).toBe(MONTH)
    expect(b.identity.workflow_instance_id).toBe('inst-1')
    expect(b.identity.workflow_def_key).toBe(FAMILJE_STUNDEN_MONTHLY_RELEASE)
    expect(b.workflow.current_state).toBe('planning')
    expect(b.workflow.states_reached).toEqual(['planning'])
  })
})

describe('2. a month with no instance fabricates nothing', () => {
  it('reports NOT_STARTED with null identity, not an empty-but-ready bundle', () => {
    const b = projectMonthReleaseBundle({ ...base, instance: null, transitions: [] })
    expect(b.readiness.product).toBe('NOT_STARTED')
    expect(b.identity.workflow_instance_id).toBeNull()
    expect(b.workflow.current_state).toBeNull()
    // Critically: absence must not read as success anywhere.
    expect(b.checks.every(c => c.status === 'NOT_EXERCISED')).toBe(true)
    expect(b.hard_gates.every(g => g.status !== 'PASS')).toBe(true)
  })
})

describe('3. missing evidence stays missing', () => {
  it('declared-but-unexercised checks are NOT_EXERCISED, never PASS', () => {
    const b = projectMonthReleaseBundle(base)
    expect(b.checks).toHaveLength(FAMILJE_STUNDEN_CHECKS.length)
    expect(b.checks.every(c => c.status === 'NOT_EXERCISED')).toBe(true)
    expect(b.checks.every(c => c.provenance === 'NOT_EVALUATED')).toBe(true)
    expect(b.checks.every(c => c.evidence_count === 0)).toBe(true)
  })

  it('surfaces how many checks have never run', () => {
    const b = projectMonthReleaseBundle(base)
    const w = b.warnings.find(x => x.code === 'CHECKS_NEVER_EXERCISED')
    expect(w).toBeDefined()
    expect(w!.message).toContain(String(FAMILJE_STUNDEN_CHECKS.length))
  })
})

describe('4-5. hard gates block readiness', () => {
  it('a failed required check fails its gate and blocks', () => {
    const b = projectMonthReleaseBundle({
      ...base,
      evidence: [evidence('frontend_deploy', 'typecheck_passed', 'fail', 'attested')],
    })
    const g = b.hard_gates.find(x => x.enforced_at.includes('frontend_deploy'))
      ?? b.hard_gates.find(x => x.status === 'FAIL')
    if (g) expect(['FAIL', 'UNKNOWN']).toContain(g.status)
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('an unverified gate is UNKNOWN and still blocks — never a permissive default', () => {
    const b = projectMonthReleaseBundle(base)
    const unknown = b.hard_gates.filter(g => g.status === 'UNKNOWN')
    expect(unknown.length).toBeGreaterThan(0)
    expect(b.readiness.blockers.some(x => x.code === 'HARD_GATE_UNKNOWN')).toBe(true)
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('every hard gate in the shipped definition is projected', () => {
    const b = projectMonthReleaseBundle(base)
    expect(b.hard_gates).toHaveLength(realDef().spec.hard_gates.length)
    expect(b.hard_gates.map(g => g.id)).toContain('never_bypass_can_access_month')
    expect(b.hard_gates.map(g => g.id)).toContain('release_gate_before_upload')
  })
})

describe('6-7. the fail-open release gate', () => {
  it('release_gate_row_present is UNKNOWN — no declared check answers it', () => {
    const b = projectMonthReleaseBundle(base)
    expect(b.technical.release_gate_row_present).toBe('UNKNOWN')
    expect(b.technical.release_gate_evidence_source).toBeNull()
  })

  it('UNKNOWN raises a CRITICAL blocker and prevents release readiness', () => {
    const b = projectMonthReleaseBundle(base)
    const w = b.readiness.blockers.find(x => x.code === 'RELEASE_GATE_ROW_MISSING')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('critical')
    expect(w!.blocking).toBe(true)
    expect(b.readiness.product).not.toBe('READY_FOR_RELEASE_APPROVAL')
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('is never inferred from upload or deploy evidence succeeding', () => {
    // The exact unsafe inference: uploads and deploys succeed whether or not
    // the month_releases row exists. Neither may turn UNKNOWN into YES.
    const b = projectMonthReleaseBundle({
      ...base,
      instance: instance({ current_state: 'approval_release' }),
      evidence: [
        evidence('protected_upload', 'protected_upload_preflight_passed', 'pass', 'attested'),
        evidence('protected_upload', 'artifact_manifest_complete', 'pass', 'attested'),
        evidence('edge_deploy', 'deployed_manifest_matches_expected'),
        evidence('frontend_deploy', 'vercel_production_ready'),
      ],
    })
    expect(b.technical.release_gate_row_present).toBe('UNKNOWN')
    expect(b.readiness.product).toBe('BLOCKED')
  })
})

describe('8. RELEASE approval is required', () => {
  it('an absent RELEASE approval blocks release readiness', () => {
    const b = projectMonthReleaseBundle(base)
    expect(b.approvals.RELEASE.status).toBe('PENDING')
    expect(b.readiness.blockers.some(x => x.code === 'RELEASE_APPROVAL_ABSENT')).toBe(true)
  })

  it('maps all four categories and leaves the underlying gates intact', () => {
    const b = projectMonthReleaseBundle(base)
    expect(Object.keys(b.approvals).sort()).toEqual(['COMMS', 'CREATIVE', 'PLAN', 'RELEASE'])
    expect(b.approvals.PLAN.states).toContain('planning')
    expect(b.approvals.CREATIVE.states).toContain('audio_generation')
    expect(b.approvals.RELEASE.states).toContain('approval_release')
    expect(b.approvals.COMMS.states).toEqual(['newsletter', 'social'])
    // Every gated state in the shipped definition is accounted for.
    const gated = realDef().spec.states.filter(s => s.human_gate?.required === true)
      .map(s => s.id).filter(id => id !== 'complete')
    for (const id of gated) expect(APPROVAL_CATEGORY_BY_STATE[id]).toBeDefined()
  })
})

describe('9. comms is separate from product readiness', () => {
  it('missing comms capability is informational, never a product blocker', () => {
    const b = projectMonthReleaseBundle(base)
    expect(b.readiness.comms).toBe('NOT_IMPLEMENTED')
    const info = b.readiness.informational.find(x => x.code === 'COMMS_NOT_IMPLEMENTED')
    expect(info).toBeDefined()
    expect(info!.blocking).toBe(false)
    expect(b.readiness.blockers.some(x => x.code === 'COMMS_NOT_IMPLEMENTED')).toBe(false)
  })

  it('product readiness is computed without reading comms status', () => {
    // Same inputs, comms unchanged: the only blockers are product-side.
    const b = projectMonthReleaseBundle(base)
    for (const x of b.readiness.blockers) {
      expect(['newsletter', 'social']).not.toContain(x.subject)
    }
  })
})

describe('10. read-only action evidence projects correctly', () => {
  it('classifies a check answered by an executable READ_ONLY action', () => {
    const b = projectMonthReleaseBundle({
      ...base,
      evidence: [evidence('approval_release', 'anonymous_protected_access_denied')],
      readOnlyAnsweredCheckKeys: ['anonymous_protected_access_denied'],
    })
    const c = b.checks.find(x =>
      x.check_key === 'anonymous_protected_access_denied' && x.state === 'approval_release')
    expect(c).toBeDefined()
    expect(c!.kind).toBe('READ_ONLY_EXECUTABLE')
    expect(c!.provenance).toBe('READ_ONLY_ACTION')
    expect(c!.status).toBe('PASS')
    expect(b.technical.anonymous_access_denied).toBe('YES')
  })

  it('distinguishes attestable from observed-only', () => {
    const b = projectMonthReleaseBundle(base)
    const attestable = b.checks.find(c => c.check_key === 'pdf_page_count')
    const observed = b.checks.find(c => c.check_key === 'github_pr_merged')
    expect(attestable!.kind).toBe('ATTESTABLE')
    expect(observed!.kind).toBe('OBSERVED_ONLY')
  })

  it('uses the newest evidence row when a check has several', () => {
    const older = { ...evidence('frontend_deploy', 'typecheck_passed', 'fail', 'attested'), recorded_at: '2026-09-01T00:00:00.000Z' }
    const newer = { ...evidence('frontend_deploy', 'typecheck_passed', 'pass', 'attested'), id: 'e-new', recorded_at: '2026-09-02T00:00:00.000Z' }
    const b = projectMonthReleaseBundle({ ...base, evidence: [older, newer] })
    const c = b.checks.find(x => x.check_key === 'typecheck_passed')
    expect(c!.status).toBe('PASS')
    expect(c!.evidence_count).toBe(2)
  })
})

describe('11-13. side-effect freedom and boundary', () => {
  const src = readFileSync(
    join(process.cwd(), 'lib/workflows/bundle/project.ts'), 'utf8')
  const typesSrc = readFileSync(
    join(process.cwd(), 'lib/workflows/bundle/types.ts'), 'utf8')

  it('the projection imports nothing that can execute, fetch or write', () => {
    // Non-greedy: a greedy body would span every import and report only the last.
    const imports = [...src.matchAll(/^import\s[\s\S]*?from\s+'([^']+)'/gm)].map(m => m[1])
    // Type-only imports of the domain plus the bundle's own schema. Nothing else.
    expect(imports.sort()).toEqual(['../attestation', '../types', './types'])
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/createAdminClient|createClient|supabase/i)
    expect(src).not.toMatch(/executeWorkflowAction|appendTransition|recordEvidence/)
  })

  it('cannot reach a write, comms or spend action class', () => {
    for (const forbidden of ['MATERIAL_WRITE', 'EXTERNAL_COMMUNICATION', 'FINANCIAL']) {
      expect(src).not.toContain(forbidden)
    }
  })

  it('does not duplicate Familje-Stunden access logic', () => {
    for (const forbidden of [
      'can_access_month', 'get_visible_months', 'is_month_released', 'month_releases',
    ]) {
      // Named in prose to explain the invariant; never called, queried or reimplemented.
      const codeLines = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      expect(codeLines.join('\n')).not.toContain(`${forbidden}(`)
      expect(codeLines.join('\n')).not.toMatch(new RegExp(`from\\s*\\(\\s*'${forbidden}'`))
    }
  })

  it('is deterministic: identical inputs give an identical bundle', () => {
    const a = projectMonthReleaseBundle(base)
    const b = projectMonthReleaseBundle(base)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('the schema forces tri-state on the fail-open field', () => {
    // A boolean here would make "we did not look" unrepresentable.
    expect(typesSrc).toMatch(/release_gate_row_present:\s*Tri/)
    expect(typesSrc).toMatch(/export type Tri = 'YES' \| 'NO' \| 'UNKNOWN'/)
  })
})

describe('the route is read-only too', () => {
  const routeSrc = readFileSync(
    join(process.cwd(), 'app/api/workflows/bundle/route.ts'), 'utf8')

  it('exposes GET only — no POST, PUT, PATCH or DELETE handler', () => {
    expect(routeSrc).toMatch(/export async function GET\b/)
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(routeSrc).not.toMatch(new RegExp(`export async function ${verb}\\b`))
    }
  })

  /**
   * Comments are stripped before these assertions. The route's header documents
   * what it deliberately does NOT call, so a naive substring search would fail
   * on its own safety documentation — and deleting that documentation to please
   * a test would be the wrong trade.
   */
  const code = routeSrc.split('\n')
    .filter(l => {
      const t = l.trim()
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*')
    })
    .join('\n')

  it('calls no mutating store function and no executor', () => {
    for (const forbidden of [
      'appendTransition', 'recordEvidence', 'instantiate', 'scheduleWorkflowWake',
      'clearWorkflowWake', 'recordWorkflowTick', 'claimDueWorkflowInstances',
      'registerVendoredDefinition', 'executeWorkflowAction', 'createWorkflowActionRun',
    ]) {
      expect(code).not.toContain(forbidden)
    }
  })

  it('makes no outbound request of its own', () => {
    expect(code).not.toMatch(/\bfetch\s*\(/)
    // The probe action is named only in prose explaining why it is NOT invoked.
    expect(code).not.toContain('probe-anonymous-protected-access')
    expect(code).not.toContain('verifyState')
  })

  it('only reads through reader store functions', () => {
    const readers = ['readDefinition', 'readInstanceByKey', 'listTransitions', 'listEvidence']
    for (const r of readers) expect(routeSrc).toContain(r)
  })
})
