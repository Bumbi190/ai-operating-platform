/**
 * The pure workflow state machine.
 *
 * Driven against the REAL Familje-Stunden definition wherever possible: a
 * fixture can be made to agree with a buggy engine, whereas the shipped
 * 19-state graph cannot.
 */

import { describe, expect, it } from 'vitest'
import {
  checkPrerequisites,
  deriveCurrentState,
  deriveWorkflowStatus,
  getFailureTransition,
  getNextState,
  isTerminal,
  validateTransition,
} from '@/lib/workflows/machine'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowSpec, WorkflowTransition } from '@/lib/workflows/types'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec

// ── In-memory driver ─────────────────────────────────────────────────────────

let seq = 0
function tx(from: string | null, to: string, over: Partial<WorkflowTransition> = {}): WorkflowTransition {
  return {
    id: `t${++seq}`,
    seq,
    instance_id: 'i1',
    from_state: from,
    to_state: to,
    reason: 'test',
    actor: 'test',
    evidence_ref: null,
    authorization_id: null,
    occurred_at: new Date(2026, 0, seq).toISOString(),
    ...over,
  }
}

/** Opening transition, as workflow_instantiate would write it. */
function opened(spec: WorkflowSpec = SPEC): WorkflowTransition[] {
  seq = 0
  return [tx(null, spec.initial_state)]
}

/**
 * Apply a move through validateTransition, failing the test if the engine
 * rejects it. Every legal path in these tests therefore has to survive the same
 * gate the store uses — no test may hand-write a history the engine would refuse.
 */
function move(
  history: WorkflowTransition[],
  to: string,
  opts: { authorization?: string } = {},
): WorkflowTransition[] {
  const from = deriveCurrentState(SPEC, history).current_state!
  const decision = validateTransition(SPEC, history, {
    from, to, authorization_id: opts.authorization ?? null,
  })
  if (!decision.ok) {
    throw new Error(`engine refused a move the test expected to be legal: ${from} → ${to}: ${decision.errors.join('; ')}`)
  }
  return [...history, tx(from, to, { authorization_id: opts.authorization ?? null })]
}

/** Walk the whole success path, supplying an authorization at every gate. */
function walkToComplete(): WorkflowTransition[] {
  let h = opened()
  let cursor: string | null = SPEC.initial_state
  while (cursor !== null) {
    const next: string | null = getNextState(SPEC, cursor)
    if (next === null) break
    const gated = SPEC.states.find(s => s.id === cursor)!.human_gate.required
    h = move(h, next, gated ? { authorization: `auth-${cursor}` } : {})
    cursor = next
  }
  return h
}

// ── Lookups ──────────────────────────────────────────────────────────────────

describe('machine — lookups', () => {
  it('reads next_state and failure_transition from the definition', () => {
    expect(getNextState(SPEC, 'planning')).toBe('content_generation')
    expect(getFailureTransition(SPEC, 'local_qa')).toBe('audio_generation')
    expect(getNextState(SPEC, 'complete')).toBeNull()
  })

  it('identifies the terminal state', () => {
    expect(isTerminal(SPEC, 'complete')).toBe(true)
    expect(isTerminal(SPEC, 'social')).toBe(false)
    expect(isTerminal(SPEC, 'nonexistent')).toBe(false)
  })
})

// ── Derivation ───────────────────────────────────────────────────────────────

describe('machine — state derived from history', () => {
  it('an empty history has no current state', () => {
    expect(deriveCurrentState(SPEC, []).current_state).toBeNull()
  })

  it('the opening transition puts the instance in the entry state', () => {
    const d = deriveCurrentState(SPEC, opened())
    expect(d.current_state).toBe('planning')
    expect([...d.completed]).toEqual([])
  })

  it('advancing completes the state it left', () => {
    const h = move(opened(), 'content_generation', { authorization: 'a1' })
    const d = deriveCurrentState(SPEC, h)
    expect(d.current_state).toBe('content_generation')
    expect([...d.completed]).toEqual(['planning'])
  })

  it('is order-independent — unordered rows derive the same state', () => {
    const h = walkToComplete()
    const shuffled = [...h].reverse()
    expect(deriveCurrentState(SPEC, shuffled).current_state)
      .toBe(deriveCurrentState(SPEC, h).current_state)
    expect([...deriveCurrentState(SPEC, shuffled).completed].sort())
      .toEqual([...deriveCurrentState(SPEC, h).completed].sort())
  })

  it('walks the entire 19-state definition to complete', () => {
    const h = walkToComplete()
    const d = deriveCurrentState(SPEC, h)
    expect(d.current_state).toBe('complete')
    // 19 states: 18 advances plus the opening transition.
    expect(h).toHaveLength(19)
    // Every state except the terminal one has been earned.
    expect(d.completed.size).toBe(18)
    expect(d.completed.has('complete')).toBe(false)
  })
})

// ── The completion rule ──────────────────────────────────────────────────────

describe('machine — re-entering a state revokes its completion', () => {
  it('a failure loop un-completes the state it returns to', () => {
    let h = opened()
    h = move(h, 'content_generation', { authorization: 'a1' })
    expect(deriveCurrentState(SPEC, h).completed.has('planning')).toBe(true)

    // content_generation fails back onto itself; planning stays earned.
    h = move(h, 'content_generation')
    expect(deriveCurrentState(SPEC, h).completed.has('planning')).toBe(true)
    expect(deriveCurrentState(SPEC, h).completed.has('content_generation')).toBe(false)
  })

  it('a deep failure forces every intervening state to be earned again', () => {
    // This is KFM 6 encoded: a PASS from an earlier attempt must not carry over.
    let h = walkTo('approval_release')
    expect(deriveCurrentState(SPEC, h).completed.has('admin_qa')).toBe(true)

    h = move(h, 'backend_release_gate')          // approval_release fails backwards
    const after = deriveCurrentState(SPEC, h)
    expect(after.current_state).toBe('backend_release_gate')
    // Re-entering backend_release_gate revoked its own completion...
    expect(after.completed.has('backend_release_gate')).toBe(false)
    // ...and walking forward must re-enter and re-earn admin_qa.
    h = move(h, 'protected_upload', { authorization: 'a-gate' })
    expect(deriveCurrentState(SPEC, h).completed.has('protected_upload')).toBe(false)
  })
})

/** Walk the success path up to (and into) `target`. */
function walkTo(target: string): WorkflowTransition[] {
  let h = opened()
  let cursor: string = SPEC.initial_state
  while (cursor !== target) {
    const next = getNextState(SPEC, cursor)
    if (next === null) throw new Error(`"${target}" is not on the success path`)
    const gated = SPEC.states.find(s => s.id === cursor)!.human_gate.required
    h = move(h, next, gated ? { authorization: `auth-${cursor}` } : {})
    cursor = next
  }
  return h
}

// ── Prerequisites ────────────────────────────────────────────────────────────

describe('machine — prerequisites', () => {
  it('reports what is missing', () => {
    const check = checkPrerequisites(SPEC, 'protected_upload', new Set())
    expect(check.satisfied).toBe(false)
    expect(check.missing).toEqual(['backend_release_gate'])
  })

  it('is satisfied once the prerequisite is complete', () => {
    const check = checkPrerequisites(SPEC, 'protected_upload', new Set(['backend_release_gate']))
    expect(check.satisfied).toBe(true)
    expect(check.missing).toEqual([])
  })

  it('an unknown state is never satisfied', () => {
    expect(checkPrerequisites(SPEC, 'ghost', new Set()).satisfied).toBe(false)
  })

  it('every state on the real success path satisfies its prerequisites in order', () => {
    // Proves the definition and the completion rule agree end to end: if any
    // state's prerequisites could not be met by the states before it, the walk
    // would throw.
    expect(() => walkToComplete()).not.toThrow()
  })
})

// ── Transition validation ────────────────────────────────────────────────────

describe('machine — validateTransition refuses what is not declared', () => {
  it('rejects a jump that skips states', () => {
    const d = validateTransition(SPEC, opened(), { from: 'planning', to: 'protected_upload' })
    expect(d.ok).toBe(false)
    expect(d.errors.join()).toMatch(/is not declared/)
  })

  it('rejects a move from a state the instance is not in', () => {
    const d = validateTransition(SPEC, opened(), { from: 'edge_deploy', to: 'frontend_deploy' })
    expect(d.ok).toBe(false)
    expect(d.errors.join()).toMatch(/stale transition: instance is in "planning"/)
  })

  it('rejects an unknown from_state and an unknown to_state', () => {
    expect(validateTransition(SPEC, opened(), { from: 'ghost', to: 'planning' }).errors.join())
      .toMatch(/unknown from_state/)
    expect(validateTransition(SPEC, opened(), { from: 'planning', to: 'ghost' }).errors.join())
      .toMatch(/unknown to_state/)
  })

  it('rejects any transition on an instance with no history', () => {
    const d = validateTransition(SPEC, [], { from: 'planning', to: 'content_generation' })
    expect(d.ok).toBe(false)
    expect(d.errors.join()).toMatch(/no opening transition/)
  })

  it('rejects every transition once the instance is not active', () => {
    const h = walkTo('social')
    for (const status of ['complete', 'abandoned'] as const) {
      const d = validateTransition(SPEC, h, { from: 'social', to: 'complete' }, status)
      expect(d.ok).toBe(false)
      expect(d.errors.join()).toMatch(new RegExp(`instance is ${status}`))
    }
  })

  it('classifies advance and failure moves', () => {
    const h = walkTo('local_qa')
    expect(validateTransition(SPEC, h, { from: 'local_qa', to: 'approval_content' }).kind).toBe('advance')
    expect(validateTransition(SPEC, h, { from: 'local_qa', to: 'audio_generation' }).kind).toBe('fail')
  })
})

describe('machine — the terminal state is terminal', () => {
  it('accepts no transition out of complete', () => {
    const h = walkToComplete()
    const d = validateTransition(SPEC, h, { from: 'complete', to: 'social' })
    expect(d.ok).toBe(false)
    expect(d.errors.join()).toMatch(/is terminal — the definition declares no transition out of it/)
  })

  it('refuses even a self-transition on complete', () => {
    const h = walkToComplete()
    expect(validateTransition(SPEC, h, { from: 'complete', to: 'complete' }).ok).toBe(false)
  })
})

describe('machine — human gates', () => {
  it('an advance across a required gate needs an authorization reference', () => {
    const d = validateTransition(SPEC, opened(), { from: 'planning', to: 'content_generation' })
    expect(d.ok).toBe(false)
    expect(d.requires_authorization).toBe(true)
    expect(d.errors.join()).toMatch(/crosses a required human gate .*editor.*an authorization reference is required/)
  })

  it('the same advance is accepted once an authorization is named', () => {
    const d = validateTransition(
      SPEC, opened(), { from: 'planning', to: 'content_generation', authorization_id: 'auth-1' },
    )
    expect(d.ok).toBe(true)
    expect(d.requires_authorization).toBe(true)
  })

  it('failing backwards out of a gated state needs no authorization', () => {
    // Rejecting your own work and redoing it is not an exercise of authority.
    const h = walkTo('content_generation')
    const d = validateTransition(SPEC, h, { from: 'content_generation', to: 'content_generation' })
    expect(d.ok).toBe(true)
    expect(d.requires_authorization).toBe(false)
  })

  it('an ungated advance needs no authorization', () => {
    const h = walkTo('pdf_build')          // pdf_build.human_gate.required === false
    const d = validateTransition(SPEC, h, { from: 'pdf_build', to: 'ebook_build' })
    expect(d.ok).toBe(true)
    expect(d.requires_authorization).toBe(false)
  })

  it('every gated state in the definition refuses an unauthorized advance', () => {
    for (const state of SPEC.states.filter(s => s.human_gate.required)) {
      const h = walkTo(state.id)
      const d = validateTransition(SPEC, h, { from: state.id, to: state.next_state! })
      expect(d.ok, `${state.id} advanced without an authorization`).toBe(false)
      expect(d.requires_authorization).toBe(true)
    }
  })
})

// ── Status projection ────────────────────────────────────────────────────────

describe('machine — deriveWorkflowStatus', () => {
  it('reports the gate and who it waits on', () => {
    const s = deriveWorkflowStatus(SPEC, opened())
    expect(s.current_state).toBe('planning')
    expect(s.status).toBe('active')
    expect(s.awaiting_human_gate).toBe(true)
    expect(s.waiting_on).toBe('editor')
    expect(s.next_state).toBe('content_generation')
    expect(s.is_terminal).toBe(false)
  })

  it('reports system as the owner of an unattended state', () => {
    const s = deriveWorkflowStatus(SPEC, walkTo('pdf_build'))
    expect(s.awaiting_human_gate).toBe(false)
    expect(s.waiting_on).toBe('system')
  })

  it('reports complete at the terminal state', () => {
    const s = deriveWorkflowStatus(SPEC, walkToComplete())
    expect(s.status).toBe('complete')
    expect(s.is_terminal).toBe(true)
    expect(s.awaiting_human_gate).toBe(false)
    expect(s.waiting_on).toBeNull()
    expect(s.next_state).toBeNull()
  })

  it('reports abandoned regardless of position', () => {
    const s = deriveWorkflowStatus(SPEC, walkTo('edge_deploy'), 'abandoned')
    expect(s.status).toBe('abandoned')
    expect(s.awaiting_human_gate).toBe(false)
  })

  it('never reports an unsatisfied prerequisite on a legally-reached state', () => {
    let h = opened()
    let cursor: string = SPEC.initial_state
    while (cursor !== 'complete') {
      expect(deriveWorkflowStatus(SPEC, h).unsatisfied_prerequisites, cursor).toEqual([])
      const next = getNextState(SPEC, cursor)!
      const gated = SPEC.states.find(s => s.id === cursor)!.human_gate.required
      h = move(h, next, gated ? { authorization: `auth-${cursor}` } : {})
      cursor = next
    }
  })
})
