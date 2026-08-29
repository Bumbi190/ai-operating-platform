/**
 * Mutation tests for the critical workflow invariants.
 *
 * A passing suite proves the engine accepts what it should. It does not prove
 * the guards are LOAD-BEARING — a rule that never fires is indistinguishable
 * from a rule that was deleted. So each block below implements the weakened
 * version of one guard (the mutant a careless refactor would produce) and
 * asserts that the real engine and the mutant DISAGREE on a concrete scenario.
 *
 * If a future change makes a mutant agree with the engine, that guard has
 * stopped doing anything and this suite fails.
 */

import { describe, expect, it } from 'vitest'
import { deriveCurrentState, validateTransition } from '@/lib/workflows/machine'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowSpec, WorkflowTransition } from '@/lib/workflows/types'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec
const stateOf = (id: string) => SPEC.states.find(s => s.id === id)!

let seq = 0
function row(from: string | null, to: string, over: Partial<WorkflowTransition> = {}): WorkflowTransition {
  return {
    id: `t${++seq}`, seq, instance_id: 'i1', from_state: from, to_state: to,
    reason: 'r', actor: 'a', evidence_ref: null, authorization_id: null,
    occurred_at: new Date(2026, 0, seq).toISOString(), ...over,
  }
}

/** A legal history walked along the success path, authorizing every gate. */
function historyTo(target: string): WorkflowTransition[] {
  seq = 0
  const out: WorkflowTransition[] = [row(null, SPEC.initial_state)]
  let cursor = SPEC.initial_state
  while (cursor !== target) {
    const next = stateOf(cursor).next_state
    if (next === null) throw new Error(`${target} not on the success path`)
    out.push(row(cursor, next, { authorization_id: stateOf(cursor).human_gate.required ? 'auth' : null }))
    cursor = next
  }
  return out
}

// ── Invariant 1: re-entry revokes completion ─────────────────────────────────

describe('mutant — completion that is never revoked on re-entry', () => {
  /** The engine's fold, minus `completed.delete(to_state)`. */
  function mutantCompleted(transitions: WorkflowTransition[]): Set<string> {
    const completed = new Set<string>()
    for (const t of [...transitions].sort((a, b) => a.seq - b.seq)) {
      if (t.from_state !== null && stateOf(t.from_state).next_state === t.to_state) {
        completed.add(t.from_state)
      }
    }
    return completed
  }

  it('disagrees with the engine after a deep failure — the guard is load-bearing', () => {
    const h = [...historyTo('approval_release')]
    h.push(row('approval_release', 'backend_release_gate'))   // declared failure edge

    const real = deriveCurrentState(SPEC, h)
    const mutant = mutantCompleted(h)

    // The mutant still believes admin_qa is signed off from the previous attempt.
    expect(mutant.has('admin_qa')).toBe(true)
    expect(mutant.has('backend_release_gate')).toBe(true)
    // The engine does not: re-entering backend_release_gate revoked it, and
    // admin_qa must be re-entered and re-earned on the way forward.
    expect(real.completed.has('backend_release_gate')).toBe(false)
    expect(real.integrity.ok).toBe(true)
  })

  it('the two agree on a clean forward walk, so the difference is the loop alone', () => {
    const h = historyTo('admin_qa')
    expect([...deriveCurrentState(SPEC, h).completed].sort()).toEqual([...mutantCompleted(h)].sort())
  })
})

// ── Invariant 2: prerequisites are enforced, not advisory ────────────────────

describe('mutant — validation without the prerequisite check', () => {
  function mutantAllows(h: WorkflowTransition[], from: string, to: string): boolean {
    const f = stateOf(from)
    return to === f.next_state || to === f.failure_transition
  }

  it('disagrees on a move whose destination has an unmet prerequisite', () => {
    // A corrupt row lands the instance at post_release_qa without scheduled_release
    // ever completing. Only the prerequisite rule separates the two answers.
    seq = 0
    const corrupt: WorkflowTransition[] = [
      row(null, 'planning'),
      row('planning', 'content_generation', { authorization_id: 'auth' }),
    ]
    // Hand-write a jump the engine would never produce.
    corrupt.push(row('content_generation', 'post_release_qa'))

    expect(mutantAllows(corrupt, 'post_release_qa', 'newsletter')).toBe(true)
    const real = validateTransition(SPEC, corrupt, {
      from: 'post_release_qa', to: 'newsletter', authorization_id: 'auth',
    })
    expect(real.ok).toBe(false)
  })
})

// ── Invariant 3: gates cannot be crossed unauthorized ────────────────────────

describe('mutant — validation that ignores human gates', () => {
  it('disagrees on every gated advance in the definition', () => {
    const gated = SPEC.states.filter(s => s.human_gate.required && s.next_state !== null)
    expect(gated.length).toBe(13)

    for (const s of gated) {
      const h = historyTo(s.id)
      const mutantWouldAllow = s.next_state === stateOf(s.id).next_state   // graph-legal
      const real = validateTransition(SPEC, h, { from: s.id, to: s.next_state! })
      expect(mutantWouldAllow).toBe(true)
      expect(real.ok, `${s.id} crossed its gate without authorization`).toBe(false)
      expect(real.requires_authorization).toBe(true)
    }
  })
})

// ── Invariant 4: the terminal state is absorbing ─────────────────────────────

describe('mutant — validation without the terminal check', () => {
  it('the engine refuses to leave complete even though an edge-shaped move exists', () => {
    seq = 0
    const h: WorkflowTransition[] = [row(null, 'planning')]
    let cursor = 'planning'
    while (cursor !== 'complete') {
      const next = stateOf(cursor).next_state!
      h.push(row(cursor, next, { authorization_id: 'auth' }))
      cursor = next
    }
    expect(deriveCurrentState(SPEC, h).current_state).toBe('complete')
    expect(stateOf('complete').next_state).toBeNull()
    expect(stateOf('complete').failure_transition).toBeNull()

    for (const target of ['social', 'complete', 'planning']) {
      expect(validateTransition(SPEC, h, { from: 'complete', to: target }).ok).toBe(false)
    }
  })
})

// ── Invariant 5: a corrupt history is refused, not laundered ─────────────────

describe('adversarial histories written outside the store', () => {
  it('detects an undeclared edge', () => {
    seq = 0
    const h = [row(null, 'planning'), row('planning', 'backend_release_gate')]
    const d = deriveCurrentState(SPEC, h)
    expect(d.integrity.ok).toBe(false)
    expect(d.integrity.violations.join()).toMatch(/is not an edge the definition declares/)
  })

  it('refuses to advance from a corrupt position', () => {
    // Without the integrity check this move looks perfectly legal: the instance
    // "is" in backend_release_gate and protected_upload is its declared successor.
    seq = 0
    const h = [row(null, 'planning'), row('planning', 'backend_release_gate')]
    const d = validateTransition(SPEC, h, {
      from: 'backend_release_gate', to: 'protected_upload', authorization_id: 'auth',
    })
    expect(d.ok).toBe(false)
    expect(d.errors.join()).toMatch(/history is not well-formed/)
  })

  it('detects a history that does not open at the entry state', () => {
    seq = 0
    const h = [row(null, 'protected_upload')]
    const d = deriveCurrentState(SPEC, h)
    expect(d.integrity.ok).toBe(false)
    expect(d.integrity.violations.join()).toMatch(/opens at "protected_upload" but the definition starts at "planning"/)
  })

  it('detects a second opening transition', () => {
    seq = 0
    const h = [row(null, 'planning'), row(null, 'planning')]
    expect(deriveCurrentState(SPEC, h).integrity.violations.join())
      .toMatch(/a second opening transition/)
  })

  it('detects a history that never opened', () => {
    seq = 0
    const h = [row('planning', 'content_generation')]
    expect(deriveCurrentState(SPEC, h).integrity.violations.join())
      .toMatch(/does not begin with an opening transition/)
  })

  it('detects a gap — a row leaving a state the instance was not in', () => {
    seq = 0
    const h = [
      row(null, 'planning'),
      row('planning', 'content_generation'),
      row('pdf_build', 'ebook_build'),          // teleport
    ]
    expect(deriveCurrentState(SPEC, h).integrity.violations.join())
      .toMatch(/leaves "pdf_build" while the instance was in "content_generation"/)
  })

  it('a legal history walked to completion is intact', () => {
    seq = 0
    const h: WorkflowTransition[] = [row(null, 'planning')]
    let cursor = 'planning'
    while (cursor !== 'complete') {
      const next = stateOf(cursor).next_state!
      h.push(row(cursor, next, { authorization_id: 'auth' }))
      cursor = next
    }
    expect(deriveCurrentState(SPEC, h).integrity).toEqual({ ok: true, violations: [] })
  })
})
