/**
 * Scheduled continuation.
 *
 * The scheduler's whole job is to be safe while nobody is watching, so most of
 * this suite is about what it REFUSES: to advance through a gate, to act on a
 * corrupt history, to touch a paused project, to double-process an instance, or
 * to lose a wake when it crashes.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  autoAdvanceableStates,
  evaluateWorkflowTick,
  isAutoAdvanceable,
  isSchedulable,
  nextWakeAfter,
  wakeState,
  type WorkflowTickOutcome,
} from '@/lib/workflows/schedule'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowInstance, WorkflowSpec, WorkflowTransition } from '@/lib/workflows/types'
import type { WorkflowGateState } from '@/lib/workflows/gate'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec
const NOW = '2026-08-10T12:00:00.000Z'
const PAST = '2026-08-09T12:00:00.000Z'
const FUTURE = '2026-08-11T12:00:00.000Z'

const INSTANCE = (over: Partial<WorkflowInstance> = {}): WorkflowInstance => ({
  id: 'i1', def_id: 'd1', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1,
  def_hash: 'a'.repeat(64), project_id: 'p1', instance_key: '2026-11',
  current_state: 'planning', status: 'active', wake_at: PAST,
  last_tick_at: null, last_tick_outcome: null,
  created_at: '2026-08-01T00:00:00.000Z', closed_at: null, ...over,
})

let seq = 0
const tx = (from: string | null, to: string, over: Partial<WorkflowTransition> = {}): WorkflowTransition => ({
  id: `t${++seq}`, seq, instance_id: 'i1', from_state: from, to_state: to,
  reason: 'r', actor: 'a', evidence_ref: null, authorization_id: null,
  occurred_at: new Date(2026, 0, seq).toISOString(), ...over,
})

/** A legal history walked to `target` along the success path. */
function historyTo(target: string): WorkflowTransition[] {
  seq = 0
  const out = [tx(null, SPEC.initial_state)]
  let cursor = SPEC.initial_state
  while (cursor !== target) {
    const next = SPEC.states.find(s => s.id === cursor)!.next_state!
    out.push(tx(cursor, next, { authorization_id: 'auth' }))
    cursor = next
  }
  return out
}

const gate = (status: WorkflowGateState['status']): WorkflowGateState => ({
  required: true, status, canAdvance: status === 'authorized', target: null,
  authorizationId: 'auth-1', expiresAt: null, approver: 'editor',
  decision: 'Tema och datum bekräftade', gateRef: null,
})

const evaluate = (over: Partial<Parameters<typeof evaluateWorkflowTick>[0]> = {}) =>
  evaluateWorkflowTick({
    instance: INSTANCE(), spec: SPEC, transitions: historyTo('planning'),
    gate: gate('waiting_for_authorization'), projectPaused: false, now: NOW, ...over,
  })

// ── Wake semantics ───────────────────────────────────────────────────────────

describe('wake semantics', () => {
  it('null is not scheduled', () => {
    expect(wakeState(null, NOW)).toBe('not_scheduled')
  })

  it('a future wake is sleeping and must not be processed', () => {
    expect(wakeState(FUTURE, NOW)).toBe('sleeping')
  })

  it('a wake at exactly now is due', () => {
    expect(wakeState(NOW, NOW)).toBe('due')
  })

  it('a wake in the PAST is due, not an error', () => {
    // Clock skew, a paused project and a missed tick all produce one; treating
    // it as invalid would strand the instance when it most needs attention.
    expect(wakeState(PAST, NOW)).toBe('due')
  })

  it('only active instances are schedulable', () => {
    expect(isSchedulable({ status: 'active' })).toBe(true)
    expect(isSchedulable({ status: 'complete' })).toBe(false)
    expect(isSchedulable({ status: 'abandoned' })).toBe(false)
  })
})

// ── The classification layer ─────────────────────────────────────────────────

describe('auto-advance classification is fail-closed', () => {
  it('the shipped definition has ZERO auto-advanceable states', () => {
    // The honest answer: every one of the nineteen states either waits on a
    // human, does external work, or must be verified against systems PR3 may
    // not reach. The scheduler therefore evaluates and reports, never advances.
    expect(autoAdvanceableStates(SPEC)).toEqual([])
  })

  it('refuses a state with a human gate', () => {
    expect(isAutoAdvanceable({
      ...SPEC.states[0], human_gate: { required: true, approver: null, decision: null, gate_ref: null },
      automated_actions: [], verification: [],
    })).toBe(false)
  })

  it('refuses a state that declares automated_actions — that is real work', () => {
    expect(isAutoAdvanceable({
      ...SPEC.states[0], human_gate: { required: false, approver: null, decision: null, gate_ref: null },
      automated_actions: ['Encode the hero video'], verification: [],
    })).toBe(false)
  })

  it('refuses a state that declares verification — PR3 cannot check the world', () => {
    expect(isAutoAdvanceable({
      ...SPEC.states[0], human_gate: { required: false, approver: null, decision: null, gate_ref: null },
      automated_actions: [], verification: ['is_month_released(month_key) == true'],
    })).toBe(false)
  })

  it('refuses a terminal state', () => {
    expect(isAutoAdvanceable({
      ...SPEC.states[0], next_state: null,
      human_gate: { required: false, approver: null, decision: null, gate_ref: null },
      automated_actions: [], verification: [],
    })).toBe(false)
  })

  it('accepts ONLY a pure orchestration state', () => {
    expect(isAutoAdvanceable({
      ...SPEC.states[0], next_state: 'content_generation',
      human_gate: { required: false, approver: null, decision: null, gate_ref: null },
      automated_actions: [], verification: [],
    })).toBe(true)
  })

  it('refuses null', () => {
    expect(isAutoAdvanceable(null)).toBe(false)
  })
})

// ── Evaluation ───────────────────────────────────────────────────────────────

describe('evaluation — nothing runs that should not', () => {
  it('a terminal instance is ignored', () => {
    const e = evaluate({ instance: INSTANCE({ status: 'complete' }) })
    expect(e.outcome).toBe('terminal')
  })

  it('an abandoned instance is ignored', () => {
    expect(evaluate({ instance: INSTANCE({ status: 'abandoned' }) }).outcome).toBe('terminal')
  })

  it('a paused project is ignored, before anything else is considered', () => {
    const e = evaluate({ projectPaused: true })
    expect(e.outcome).toBe('paused')
    expect(e.reason).toMatch(/execution is paused/)
  })

  it('a corrupt history FAILS CLOSED and escalates', () => {
    seq = 0
    const corrupt = [tx(null, 'planning'), tx('planning', 'backend_release_gate')]
    const e = evaluate({
      transitions: corrupt, instance: INSTANCE({ current_state: 'backend_release_gate' }),
    })
    expect(e.outcome).toBe('failed')
    expect(e.escalate).toBe(true)
    expect(e.reason).toMatch(/not well-formed/)
  })

  it('an empty history fails closed', () => {
    const e = evaluate({ transitions: [] })
    expect(e.outcome).toBe('failed')
    expect(e.escalate).toBe(true)
  })

  it('projection drift fails closed and escalates', () => {
    const e = evaluate({
      transitions: historyTo('planning'), instance: INSTANCE({ current_state: 'pdf_build' }),
    })
    expect(e.outcome).toBe('failed')
    expect(e.escalate).toBe(true)
    expect(e.reason).toMatch(/projection drift/)
  })

  it('reaching the terminal state reports terminal', () => {
    seq = 0
    const full = [tx(null, 'planning')]
    let cursor = 'planning'
    while (cursor !== 'complete') {
      const next = SPEC.states.find(s => s.id === cursor)!.next_state!
      full.push(tx(cursor, next, { authorization_id: 'auth' }))
      cursor = next
    }
    const e = evaluate({ transitions: full, instance: INSTANCE({ current_state: 'complete' }), gate: null })
    expect(e.outcome).toBe('terminal')
  })
})

describe('evaluation — gates are never crossed unattended', () => {
  it('a gated state with no grant waits, and does not advance', () => {
    const e = evaluate({ gate: gate('waiting_for_authorization') })
    expect(e.outcome).toBe('waiting_for_authorization')
    expect(e.reason).toMatch(/awaiting editor/)
  })

  it.each(['denied', 'expired', 'revoked', 'superseded', 'stale', 'conditions_unverified', 'malformed'] as const)
  ('a %s gate blocks', status => {
    const e = evaluate({ gate: gate(status) })
    expect(e.outcome).toBe('blocked')
    expect(e.reason).toBe(`gate is ${status}`)
  })

  it('an unresolvable gate blocks rather than defaulting open', () => {
    const e = evaluate({ gate: null })
    expect(e.outcome).toBe('blocked')
    expect(e.reason).toMatch(/could not be resolved/)
  })

  it('a VALID grant permits continuation but still does not act', () => {
    // planning is gated AND declares automated_actions, so authority is
    // established and the scheduler stops: permission to act is not the act.
    const e = evaluate({ gate: gate('authorized') })
    expect(e.outcome).toBe('authorized_ready')
    expect(e.autoAdvanceable).toBe(false)
    expect(e.reason).toMatch(/declares work the scheduler does not perform/)
  })

  it('every gated state in the definition stops at authorized_ready, never ready_for_transition', () => {
    for (const s of SPEC.states.filter(x => x.human_gate.required && x.next_state)) {
      const e = evaluate({
        transitions: historyTo(s.id), instance: INSTANCE({ current_state: s.id }), gate: gate('authorized'),
      })
      expect(e.outcome, s.id).toBe('authorized_ready')
    }
  })

  it('NO state in the shipped definition ever reaches ready_for_transition', () => {
    for (const s of SPEC.states.filter(x => x.next_state)) {
      const e = evaluate({
        transitions: historyTo(s.id), instance: INSTANCE({ current_state: s.id }),
        gate: s.human_gate.required ? gate('authorized') : null,
      })
      expect(e.outcome, s.id).not.toBe('ready_for_transition')
    }
  })
})

describe('evaluation — prerequisites', () => {
  it('an unmet prerequisite blocks', () => {
    // Hand-built history that reaches admin_qa without earning edge_deploy.
    const spec: WorkflowSpec = {
      ...SPEC,
      states: SPEC.states.map(s =>
        s.id === 'content_generation'
          ? { ...s, prerequisites: ['planning', 'visual_generation'] }
          : s),
    }
    const e = evaluate({ spec, gate: gate('authorized') })
    expect(e.outcome).toBe('blocked')
    expect(e.missingPrerequisites).toEqual(['visual_generation'])
  })
})

// ── Re-arming ────────────────────────────────────────────────────────────────

describe('next wake', () => {
  it('does NOT re-arm anything that needs a human', () => {
    for (const o of ['waiting_for_authorization', 'blocked', 'failed', 'terminal', 'paused', 'authorized_ready'] as const) {
      expect(nextWakeAfter(o), o).toBeNull()
    }
  })

  it('re-arms only where another tick could change something', () => {
    expect(nextWakeAfter('ready_for_transition')).toBe(60)
    expect(nextWakeAfter('sleeping')).toBe(60)
  })

  it('covers every outcome', () => {
    const all: WorkflowTickOutcome[] = ['sleeping', 'terminal', 'paused', 'failed', 'blocked',
      'waiting_for_authorization', 'authorized_ready', 'ready_for_transition']
    for (const o of all) expect(() => nextWakeAfter(o)).not.toThrow()
  })
})

// ── Structural guarantees ────────────────────────────────────────────────────

const SRC = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/**
 * Source with comments stripped. These guards are about what the code DOES, and
 * a file that documents "this never imports principal-write" must not fail its
 * own assertion for saying so.
 */
const CODE = (rel: string) =>
  SRC(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('structural — the scheduler cannot become an authority', () => {
  it('the system verifier never imports the authorization WRITE boundary', () => {
    expect(CODE('../workflows/system-authorization.ts')).not.toMatch(/principal-write/)
  })

  it('the system verifier holds only a read-only ledger capability', () => {
    // `append` is absent from the accepted type, so widening it is the only way
    // to write — and that widening is what this assertion pins.
    expect(SRC('../workflows/system-authorization.ts'))
      .toMatch(/Pick<AuthorizationEventStore, 'history' \| 'byTarget'>/)
    expect(CODE('../workflows/system-authorization.ts')).not.toMatch(/\.append\(/)
  })

  it('the scheduler never authors, grants or denies', () => {
    for (const f of ['../workflows/system-authorization.ts', '../workflows/tick.ts', '../workflows/schedule.ts']) {
      const code = CODE(f)
      expect(code, f).not.toMatch(/requestAuthorization|grantAuthorization|denyAuthorization|revokeAuthorization/)
      expect(code, f).not.toMatch(/principalId/)
      expect(code, f).not.toMatch(/founder_owner/)
    }
  })

  it('the scheduler never writes to the authority ledger', () => {
    for (const f of ['../workflows/system-authorization.ts', '../workflows/tick.ts']) {
      expect(CODE(f), f).not.toMatch(/from\(['"]atlas_authorizations['"]\)/)
    }
  })

  it('the scheduler never advances a transition in PR3', () => {
    for (const f of ['../workflows/tick.ts', '../workflows/schedule.ts']) {
      expect(CODE(f), f).not.toMatch(/appendTransition|workflow_append_transition/)
    }
  })

  it('the tick route is cron-secret protected, exactly like the drain', () => {
    const src = SRC('../../app/api/workflows/tick/route.ts')
    expect(src).toMatch(/CRON_SECRET/)
    expect(src).toMatch(/Bearer \$\{cronSecret\}/)
  })

  it('the claim pushes the wake forward rather than clearing it — no lost wake', () => {
    const sql = SRC('../../supabase/migrations/20260829_workflow_scheduled_continuation.sql')
    expect(sql).toMatch(/for update skip locked/)
    expect(sql).toMatch(/wake_at\s*=\s*now\(\) \+ make_interval\(secs => p_visibility_seconds\)/)
  })

  it('the claim filters paused projects at the lowest level', () => {
    const sql = SRC('../../supabase/migrations/20260829_workflow_scheduled_continuation.sql')
    expect(sql).toMatch(/execution_paused = true/)
  })

  it('the guardian is taught to restore the workflow tick', () => {
    const sql = SRC('../../supabase/migrations/20260829_workflow_scheduled_continuation.sql')
    expect(sql).toMatch(/ensure_core_schedules/)
    expect(sql).toMatch(/omnira_workflow_tick/)
    // All three core jobs must be in the self-healing set.
    for (const job of ['omnira_runs_drain', 'omnira_runs_reaper', 'omnira_workflow_tick']) {
      expect(sql, job).toMatch(new RegExp(`jobname = '${job}'`))
    }
  })
})

// ── Verification can only ever make things worse (PR4) ───────────────────────

const verif = (result: 'pass' | 'fail' | 'blocked' | 'error', key = 'c') => ({
  check_key: key, result, observed_at: NOW, source: 'omnira.workflow.adapter',
  authoritative_system: 'familje-stunden', expected: 'e', observed: 'o',
  failure_kind: result === 'pass' ? null : ('authoritative_fail' as const), detail: {},
})

describe('read-only verification never produces an advance', () => {
  it('a verification FAIL blocks an otherwise-authorized state', () => {
    const e = evaluate({ gate: gate('authorized'), verification: [verif('fail', 'anonymous_protected_access_denied')] })
    expect(e.outcome).toBe('blocked')
    expect(e.verification).toBe('verification_failed')
    expect(e.reason).toMatch(/verification failed: anonymous_protected_access_denied:fail/)
  })

  it('a verification ERROR blocks — "could not understand" is never "fine"', () => {
    const e = evaluate({ gate: gate('authorized'), verification: [verif('error')] })
    expect(e.outcome).toBe('blocked')
    expect(e.verification).toBe('verification_error')
  })

  it('a BLOCKED verification is reported but does not itself stop the workflow', () => {
    // Evidence about our reach, not about the world. A missing credential must
    // not masquerade as a release problem.
    const e = evaluate({ gate: gate('authorized'), verification: [verif('blocked')] })
    expect(e.outcome).toBe('authorized_ready')
    expect(e.verification).toBe('verification_blocked')
  })

  it('a passing verification does NOT upgrade anything', () => {
    // The state still declares external work; verification cannot make it
    // orchestration-only.
    const e = evaluate({ gate: gate('authorized'), verification: [verif('pass')] })
    expect(e.outcome).toBe('authorized_ready')
    expect(e.outcome).not.toBe('ready_for_transition')
  })

  it('verification cannot open a closed gate', () => {
    for (const status of ['denied', 'expired', 'revoked', 'stale'] as const) {
      const e = evaluate({ gate: gate(status), verification: [verif('pass')] })
      expect(e.outcome, status).toBe('blocked')
    }
  })

  it('verification cannot rescue a corrupt history', () => {
    seq = 0
    const corrupt = [tx(null, 'planning'), tx('planning', 'backend_release_gate')]
    const e = evaluate({
      transitions: corrupt, instance: INSTANCE({ current_state: 'backend_release_gate' }),
      gate: gate('authorized'), verification: [verif('pass')],
    })
    expect(e.outcome).toBe('failed')
  })

  it('no verification outcome is ever ready_for_transition for this definition', () => {
    for (const r of ['pass', 'fail', 'blocked', 'error'] as const) {
      const e = evaluate({ gate: gate('authorized'), verification: [verif(r)] })
      expect(e.outcome, r).not.toBe('ready_for_transition')
    }
  })
})

// ── Mutation tests ───────────────────────────────────────────────────────────

describe('mutant — an evaluator that treats a resolvable gate as open', () => {
  it('disagrees on every non-authorized gate status', () => {
    const mutant = (g: WorkflowGateState | null) => g !== null   // "we got a gate, proceed"
    for (const status of ['waiting_for_authorization', 'denied', 'expired', 'revoked',
      'superseded', 'stale', 'conditions_unverified', 'malformed'] as const) {
      expect(mutant(gate(status))).toBe(true)
      expect(evaluate({ gate: gate(status) }).outcome).not.toBe('ready_for_transition')
      expect(evaluate({ gate: gate(status) }).outcome).not.toBe('authorized_ready')
    }
  })
})

describe('mutant — a classifier that only checks the human gate', () => {
  it('would auto-advance states that do external work; the real one does not', () => {
    const mutant = (id: string) => {
      const s = SPEC.states.find(x => x.id === id)!
      return s.next_state !== null && !s.human_gate.required
    }
    // pdf_build, ebook_build, edge_deploy, scheduled_release, post_release_qa are
    // ungated but all do external work or external verification.
    for (const id of ['pdf_build', 'ebook_build', 'edge_deploy', 'scheduled_release', 'post_release_qa']) {
      expect(mutant(id), id).toBe(true)
      expect(isAutoAdvanceable(SPEC.states.find(s => s.id === id)!), id).toBe(false)
    }
  })
})

describe('mutant — a scheduler that clears the wake on claim', () => {
  it('the shipped claim does not clear it, so a crash cannot lose the wake', () => {
    const sql = SRC('../../supabase/migrations/20260829_workflow_scheduled_continuation.sql')
    const claim = sql.slice(sql.indexOf('function public.workflow_claim_due'))
      .slice(0, sql.slice(sql.indexOf('function public.workflow_claim_due')).indexOf('$$;'))
    expect(claim).not.toMatch(/wake_at\s*=\s*null/)
  })
})
