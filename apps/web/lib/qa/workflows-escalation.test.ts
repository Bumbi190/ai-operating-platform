/**
 * Workflow escalation and failure semantics.
 *
 * Two properties carry the weight here. First, that nothing which is not a pass
 * can become one — the scheduler must never reach `ready_for_transition` through
 * a failure, an error, a stale attestation or an absent check. Second, that a
 * once-a-minute tick produces at most one open condition, because an escalation
 * layer that spams is one that gets muted.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CRITICAL_CHECK_KEYS, FAILURE_SEVERITY, NOTIFY_COOLDOWN_MINUTES, WORKFLOW_SIGNAL_KIND,
  decideNotification, deriveWorkflowHealth, deriveWorkflowSignalKey, escalationEmail,
  isEscalationEmailEnabled, severityFor, shouldNotify,
  type ActiveWorkflowSignal, type WorkflowFailureClass, type WorkflowSignalPayload,
} from '@/lib/workflows/escalation'
import { conditionForVerdict, evaluateWorkflowTick } from '@/lib/workflows/schedule'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '@/lib/workflows/adapters/familje-stunden/checks'
import type { CheckVerdict } from '@/lib/workflows/evidence-consumption'
import type { WorkflowInstance, WorkflowSpec, WorkflowTransition } from '@/lib/workflows/types'
import type { WorkflowGateState } from '@/lib/workflows/gate'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec
const NOW = '2026-10-20T12:00:00.000Z'

afterEach(() => { delete process.env.WORKFLOW_ESCALATION_EMAIL })

const ALL_CLASSES: WorkflowFailureClass[] = [
  'verification_failed', 'verification_blocked', 'verification_error', 'verification_stale',
  'workflow_integrity_failure', 'authorization_blocked', 'prerequisite_blocked',
  'scheduler_error', 'external_dependency_unavailable',
]

// ── B/C. Taxonomy and severity ───────────────────────────────────────────────

describe('failure taxonomy', () => {
  it('keeps nine distinct classes — never one generic "failed"', () => {
    expect(new Set(ALL_CLASSES).size).toBe(9)
    for (const c of ALL_CLASSES) expect(FAILURE_SEVERITY[c], c).toBeDefined()
  })

  it('uses the severity vocabulary the Action Center already ranks by', () => {
    for (const c of ALL_CLASSES) {
      expect(['critical', 'high', 'normal'], c).toContain(FAILURE_SEVERITY[c])
    }
  })

  it('ranks integrity corruption critical', () => {
    expect(FAILURE_SEVERITY.workflow_integrity_failure).toBe('critical')
  })

  it('ranks a real finding above an inability to look', () => {
    expect(FAILURE_SEVERITY.verification_failed).toBe('high')
    expect(FAILURE_SEVERITY.verification_blocked).toBe('normal')
    expect(FAILURE_SEVERITY.verification_stale).toBe('normal')
  })

  it('promotes safety checks to critical whatever their class', () => {
    // Protected material reachable without a session is not a QA result.
    expect(severityFor('verification_failed', 'anonymous_protected_access_denied')).toBe('critical')
    expect(severityFor('verification_blocked', 'release_gate_exists')).toBe('critical')
    expect(severityFor('verification_failed', 'audio_file_count')).toBe('high')
  })

  it('names the critical checks explicitly rather than pattern-matching', () => {
    expect(CRITICAL_CHECK_KEYS).toContain('anonymous_protected_access_denied')
  })
})

// ── E. Signal identity ───────────────────────────────────────────────────────

describe('signal identity and dedupe', () => {
  const key = (over = {}) => deriveWorkflowSignalKey({
    instanceId: 'i1', state: 'local_qa', failureClass: 'verification_failed',
    checkKey: 'audio_file_count', targetHash: 'a'.repeat(64), ...over,
  })

  it('is stable for the same condition', () => {
    expect(key()).toBe(key())
  })

  it.each([
    ['instance', { instanceId: 'i2' }],
    ['state', { state: 'ebook_build' }],
    ['failure class', { failureClass: 'verification_blocked' as WorkflowFailureClass }],
    ['check', { checkKey: 'audio_decode_ok' }],
    ['target', { targetHash: 'b'.repeat(64) }],
  ])('a different %s is a different condition', (_l, over) => {
    expect(key(over)).not.toBe(key())
  })

  it('a moved target makes the SAME failure a NEW condition', () => {
    // The operator needs to know it happened again, to something different.
    expect(key({ targetHash: 'c'.repeat(64) })).not.toBe(key())
  })
})

// ── F. Lifecycle and health ──────────────────────────────────────────────────

const sig = (over: Partial<WorkflowSignalPayload> = {}, kind = WORKFLOW_SIGNAL_KIND.raised): ActiveWorkflowSignal => ({
  signalKey: 'k', kind, producedAt: NOW,
  payload: {
    signal_key: 'k', failure_class: 'verification_blocked', severity: 'normal',
    instance_id: 'i1', instance_key: '2026-11', def_key: 'd', def_version: 1,
    def_hash: 'a'.repeat(64), state: 'local_qa', check_key: null, target_hash: null,
    observed_at: NOW, provenance: null, evidence_refs: [], summary: 's', remediation: 'r',
    ...over,
  },
})

describe('instance health', () => {
  it('is healthy only when nothing is open', () => {
    expect(deriveWorkflowHealth([], false)).toBe('healthy')
  })

  it('reports waiting rather than healthy at a human gate', () => {
    expect(deriveWorkflowHealth([], true)).toBe('waiting')
  })

  it('any critical condition dominates', () => {
    expect(deriveWorkflowHealth([sig({ severity: 'normal' }), sig({ severity: 'critical' })], true))
      .toBe('critical')
  })

  it('a real finding reports failed, not merely blocked', () => {
    expect(deriveWorkflowHealth([sig({ failure_class: 'verification_failed', severity: 'high' })], false))
      .toBe('failed')
  })

  it('anything else open reports blocked', () => {
    expect(deriveWorkflowHealth([sig()], false)).toBe('blocked')
  })

  it('a gate never masks an open condition', () => {
    expect(deriveWorkflowHealth([sig()], true)).toBe('blocked')
  })
})

// ── D. Scheduler integration ─────────────────────────────────────────────────

const INSTANCE: WorkflowInstance = {
  id: 'i1', def_id: 'd1', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1,
  def_hash: 'a'.repeat(64), project_id: 'p1', instance_key: '2026-11',
  current_state: 'local_qa', status: 'active', wake_at: null,
  last_tick_at: null, last_tick_outcome: null, created_at: NOW, closed_at: null,
}
let seq = 0
const tx = (from: string | null, to: string): WorkflowTransition => ({
  id: `t${++seq}`, seq, instance_id: 'i1', from_state: from, to_state: to,
  reason: 'r', actor: 'a', evidence_ref: null, authorization_id: 'auth',
  occurred_at: new Date(2026, 0, seq).toISOString(),
})
function historyTo(target: string): WorkflowTransition[] {
  seq = 0
  const out = [tx(null, SPEC.initial_state)]
  let cursor = SPEC.initial_state
  while (cursor !== target) {
    const next = SPEC.states.find(s => s.id === cursor)!.next_state!
    out.push(tx(cursor, next)); cursor = next
  }
  return out
}
const gate = (status: WorkflowGateState['status']): WorkflowGateState => ({
  required: true, status, canAdvance: status === 'authorized', target: null,
  authorizationId: 'a', expiresAt: null, approver: 'editor', decision: 'd', gateRef: null,
})
const verdict = (satisfaction: CheckVerdict['satisfaction'], key = 'audio_file_count'): CheckVerdict => ({
  check_key: key, satisfaction, satisfies: satisfaction === 'satisfied',
  binding: 'current', source: 'attested', producer: 'cred-1', observed_at: NOW, reason: 'r',
})
const evaluate = (over: Partial<Parameters<typeof evaluateWorkflowTick>[0]> = {}) =>
  evaluateWorkflowTick({
    instance: INSTANCE, spec: SPEC, transitions: historyTo('local_qa'),
    gate: gate('authorized'), projectPaused: false, now: NOW,
    requiredChecks: new Set(['audio_file_count']), ...over,
  })

describe('evidence blocks the scheduler', () => {
  it.each([
    ['failed', 'verification_failed'],
    ['errored', 'verification_error'],
    ['stale', 'verification_stale'],
  ])('an evidence %s blocks and classifies as %s', (satisfaction, cls) => {
    const e = evaluate({ evidence: [verdict(satisfaction as CheckVerdict['satisfaction'])] })
    expect(e.outcome).toBe('blocked')
    expect(e.conditions.map(c => c.failureClass)).toContain(cls)
  })

  it('a REQUIRED absent check blocks — absence is never a pass', () => {
    const e = evaluate({ evidence: [verdict('absent')] })
    expect(e.outcome).toBe('blocked')
    expect(e.conditions[0].failureClass).toBe('verification_blocked')
  })

  it('an INFORMATIONAL blocked check does not hold the workflow', () => {
    const e = evaluate({ evidence: [verdict('blocked')], requiredChecks: new Set() })
    expect(e.conditions).toEqual([])
    expect(e.outcome).toBe('authorized_ready')
  })

  it('provenance-refused evidence cannot satisfy', () => {
    const e = evaluate({ evidence: [verdict('provenance_refused')] })
    expect(e.outcome).toBe('blocked')
  })

  it('a satisfied check produces no condition and no upgrade', () => {
    const e = evaluate({ evidence: [verdict('satisfied')] })
    expect(e.conditions).toEqual([])
    // Still not ready_for_transition: the state declares external work.
    expect(e.outcome).toBe('authorized_ready')
  })

  it('NO combination of evidence ever reaches ready_for_transition', () => {
    for (const s of ['satisfied', 'failed', 'blocked', 'errored', 'stale',
      'unbound', 'provenance_refused', 'undeclared', 'absent'] as const) {
      expect(evaluate({ evidence: [verdict(s)] }).outcome, s).not.toBe('ready_for_transition')
    }
  })

  it('a closed gate raises an authorization_blocked condition', () => {
    const e = evaluate({ gate: gate('expired') })
    expect(e.outcome).toBe('blocked')
    expect(e.conditions.map(c => c.failureClass)).toContain('authorization_blocked')
  })

  it('a corrupt history raises integrity and DISCARDS derived findings', () => {
    seq = 0
    const corrupt = [tx(null, 'planning'), { ...tx('planning', 'protected_upload') }]
    const e = evaluate({
      transitions: corrupt, instance: { ...INSTANCE, current_state: 'protected_upload' },
      evidence: [verdict('failed')],
    })
    expect(e.outcome).toBe('failed')
    // Findings derived from a history we cannot trust are not independent facts.
    expect(e.conditions).toHaveLength(1)
    expect(e.conditions[0].failureClass).toBe('workflow_integrity_failure')
  })
})

describe('conditionForVerdict', () => {
  it('returns nothing for a satisfied check', () => {
    expect(conditionForVerdict(verdict('satisfied'), true)).toBeNull()
  })

  it('maps each unsatisfied verdict to a distinct class', () => {
    expect(conditionForVerdict(verdict('failed'), true)!.failureClass).toBe('verification_failed')
    expect(conditionForVerdict(verdict('errored'), true)!.failureClass).toBe('verification_error')
    expect(conditionForVerdict(verdict('stale'), true)!.failureClass).toBe('verification_stale')
    expect(conditionForVerdict(verdict('absent'), true)!.failureClass).toBe('verification_blocked')
  })

  it('an informational unsatisfied check is not a condition', () => {
    for (const s of ['blocked', 'absent', 'unbound', 'provenance_refused', 'undeclared'] as const) {
      expect(conditionForVerdict(verdict(s), false), s).toBeNull()
    }
  })

  it('but a FAIL is a condition whether required or not', () => {
    // "The producer said no" is a fact about the world regardless of policy.
    expect(conditionForVerdict(verdict('failed'), false)).not.toBeNull()
    expect(conditionForVerdict(verdict('errored'), false)).not.toBeNull()
  })
})

// ── G. Notification ──────────────────────────────────────────────────────────

describe('notification policy', () => {
  it('is DEFAULT OFF', () => {
    expect(isEscalationEmailEnabled()).toBe(false)
    expect(decideNotification({ severity: 'critical', outcome: 'raised', now: NOW }).reason)
      .toBe('disabled')
  })

  it('never notifies on a repeated detection', () => {
    process.env.WORKFLOW_ESCALATION_EMAIL = '1'
    expect(decideNotification({ severity: 'critical', outcome: 'unchanged', now: NOW }).notify)
      .toBe(false)
  })

  it('never notifies for normal severity — UI only', () => {
    process.env.WORKFLOW_ESCALATION_EMAIL = '1'
    expect(decideNotification({ severity: 'normal', outcome: 'raised', now: NOW }).reason)
      .toBe('severity')
    expect(NOTIFY_COOLDOWN_MINUTES.normal).toBe(Number.POSITIVE_INFINITY)
  })

  it('notifies critical and high on a lifecycle change', () => {
    process.env.WORKFLOW_ESCALATION_EMAIL = '1'
    expect(decideNotification({ severity: 'critical', outcome: 'raised', now: NOW }).notify).toBe(true)
    expect(decideNotification({ severity: 'high', outcome: 'regressed', now: NOW }).notify).toBe(true)
  })

  it('respects a cooldown so a flapping condition cannot storm', () => {
    process.env.WORKFLOW_ESCALATION_EMAIL = '1'
    const recent = new Date(Date.parse(NOW) - 5 * 60_000).toISOString()
    expect(decideNotification({ severity: 'critical', outcome: 'regressed', now: NOW, previousEventAt: recent }).reason)
      .toBe('cooldown')
    const old = new Date(Date.parse(NOW) - 60 * 60_000).toISOString()
    expect(decideNotification({ severity: 'critical', outcome: 'regressed', now: NOW, previousEventAt: old }).notify)
      .toBe(true)
  })

  it('gives critical a shorter window than high', () => {
    expect(NOTIFY_COOLDOWN_MINUTES.critical).toBeLessThan(NOTIFY_COOLDOWN_MINUTES.high)
  })

  it('shouldNotify is severity-gated and change-gated', () => {
    expect(shouldNotify('normal', 'raised')).toBe(false)
    expect(shouldNotify('critical', 'unchanged')).toBe(false)
    expect(shouldNotify('critical', 'raised')).toBe(true)
  })

  it('the email carries what an operator needs and no payload dump', () => {
    const { subject, html } = escalationEmail(sig({
      severity: 'critical', failure_class: 'verification_failed',
      check_key: 'anonymous_protected_access_denied', summary: 'unauthenticated request ALLOWED',
    }).payload)
    expect(subject).toMatch(/\[CRITICAL\]/)
    expect(html).toMatch(/anonymous_protected_access_denied/)
    expect(html).toMatch(/Next step/)
    expect(html).toMatch(/Nothing has been published, uploaded or sent/)
    expect(html).not.toMatch(/evidence_refs|signal_key|def_hash/)
  })
})

// ── Structural ───────────────────────────────────────────────────────────────

const CODE = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('structural — escalation cannot reach a customer', () => {
  it('no customer-facing send path exists in the escalation layer', () => {
    for (const f of ['../workflows/escalation.ts', '../workflows/tick.ts', '../workflows/schedule.ts']) {
      const code = CODE(f)
      expect(code, f).not.toMatch(/newsletter|sendCampaign|social|subscriber|broadcast/i)
      // Only the ADMIN notification path is reachable.
      expect(code, f).not.toMatch(/sendEmail\(/)
    }
  })

  it('escalation writes through the Signal Platform, never the table', () => {
    expect(CODE('../workflows/escalation.ts')).not.toMatch(/from\('atlas_signals'\)\s*\n?\s*\.insert/)
  })

  it('never updates or deletes a signal — history is not rewritten', () => {
    const code = CODE('../workflows/escalation.ts')
    expect(code).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/)
  })

  it('the tick still advances nothing', () => {
    expect(CODE('../workflows/tick.ts')).not.toMatch(/appendTransition|workflow_append_transition/)
  })
})

// ── J. Familje-Stunden mapping ───────────────────────────────────────────────

describe('Familje-Stunden failure mapping stays in the catalogue', () => {
  it('the engine hardcodes no Familje-Stunden check except the declared critical set', () => {
    const code = CODE('../workflows/schedule.ts')
    expect(code).not.toMatch(/audio_file_count|ebook_page_count|month_releases|can_access_month/)
  })

  it('every declared check can be graded by the generic policy', () => {
    for (const c of FAMILJE_STUNDEN_CHECKS) {
      const s = severityFor('verification_failed', c.check_key)
      expect(['critical', 'high'], c.check_key).toContain(s)
    }
  })

  it('the anonymous-denial check is the one graded critical', () => {
    expect(severityFor('verification_failed', 'anonymous_protected_access_denied')).toBe('critical')
    expect(severityFor('verification_failed', 'audio_decode_ok')).toBe('high')
  })
})

// ── Mutation tests ───────────────────────────────────────────────────────────

describe('mutant — an evaluator that only blocks on explicit failures', () => {
  it('would let stale, absent and refused evidence through', () => {
    const mutant = (v: CheckVerdict) => v.satisfaction === 'failed'
    for (const s of ['stale', 'absent', 'unbound', 'provenance_refused'] as const) {
      expect(mutant(verdict(s))).toBe(false)
      expect(evaluate({ evidence: [verdict(s)] }).outcome).toBe('blocked')
    }
  })
})

describe('mutant — escalation that appends on every detection', () => {
  it('the real severity map is total, so no class escapes grading', () => {
    // A mutant with a partial map would return undefined for a new class and
    // silently rank it below everything.
    for (const c of ALL_CLASSES) {
      expect(typeof FAILURE_SEVERITY[c], c).toBe('string')
    }
  })
})
