/**
 * lib/workflows/machine.ts — the state machine. Pure functions, zero I/O.
 *
 * Shaped after `lib/ai/policy-gate.ts` and `lib/atlas/delegation/classify.ts`,
 * which are this repository's precedent for an authority question answered by a
 * small total function: no I/O, so no code path can "helpfully" fetch something
 * that changes the answer, and every rule is exhaustively testable.
 *
 * ── THE COMPLETION RULE ──────────────────────────────────────────────────────
 * Whether a state is COMPLETE is derived from history, never stored:
 *
 *   advancing out of S (to S.next_state)  → S becomes complete
 *   entering S from anywhere              → S stops being complete
 *
 * The second half is what makes a retry loop honest. When approval_release fails
 * back to backend_release_gate, every state between them is re-entered on the
 * way forward and must be earned again — admin_qa's PASS from the previous
 * attempt does not carry over. Without that rule, a failure deep in the release
 * would silently inherit stale verification, which is precisely KFM 6.
 *
 * ── THE AMBIGUOUS EDGE ───────────────────────────────────────────────────────
 * One state declares `failure_transition == next_state`: scheduled_release
 * routes a missed release instant into post_release_qa, which is also its
 * success path. A transition row records from/to, not intent, so the rule is
 * positional and deterministic: `to === from.next_state` counts as an advance.
 * It must, because post_release_qa lists scheduled_release as a prerequisite —
 * reading that move as a failure would strand the instance permanently.
 */

import type {
  WorkflowHumanGate,
  WorkflowInstanceStatus,
  WorkflowSpec,
  WorkflowStateSpec,
  WorkflowTransition,
} from './types'

// ── Lookups ──────────────────────────────────────────────────────────────────

export function getState(spec: WorkflowSpec, stateId: string): WorkflowStateSpec | null {
  return spec.states.find(s => s.id === stateId) ?? null
}

export function getNextState(spec: WorkflowSpec, stateId: string): string | null {
  return getState(spec, stateId)?.next_state ?? null
}

export function getFailureTransition(spec: WorkflowSpec, stateId: string): string | null {
  return getState(spec, stateId)?.failure_transition ?? null
}

export function isTerminal(spec: WorkflowSpec, stateId: string): boolean {
  const s = getState(spec, stateId)
  return s !== null && s.next_state === null
}

// ── Derivation from history ──────────────────────────────────────────────────

export interface HistoryIntegrity {
  ok: boolean
  violations: string[]
}

export interface DerivedHistory {
  /** The state the instance is in. `null` only when there is no history at all. */
  current_state: string | null
  /** States earned on the CURRENT pass — see the completion rule above. */
  completed: ReadonlySet<string>
  /** Transitions applied, in order. */
  applied: number
  /**
   * Whether every row in the history is an edge the definition declares.
   *
   * The store cannot write a corrupt history — but `workflow_append_transition`
   * is a service-role RPC that checks state MEMBERSHIP, not graph legality, so a
   * caller bypassing the store could. Re-deriving legality on read means a
   * corrupt history is refused rather than silently built upon: without it, one
   * hand-written row could land an instance at `backend_release_gate` having
   * never passed content approval, and every later move would look legitimate.
   */
  integrity: HistoryIntegrity
}

/**
 * Fold the transition history into the current state and completion set.
 *
 * Transitions are expected in `seq` order; the fold sorts defensively so a
 * caller that reads them back unordered cannot produce a different answer than
 * one that does. This function is the authority — `workflow_instances.current_state`
 * is only a cache of its result, and `workflow_projection_drift()` compares the two.
 */
export function deriveCurrentState(
  spec: WorkflowSpec,
  transitions: readonly WorkflowTransition[],
): DerivedHistory {
  const ordered = [...transitions].sort((a, b) => a.seq - b.seq)
  const completed = new Set<string>()
  const violations: string[] = []
  let current: string | null = null

  ordered.forEach((t, i) => {
    if (t.from_state === null) {
      // The opening act: it may only appear first, and only into the entry state.
      if (i !== 0) violations.push(`transition ${t.seq}: a second opening transition`)
      if (t.to_state !== spec.initial_state) {
        violations.push(
          `transition ${t.seq}: opens at "${t.to_state}" but the definition starts at "${spec.initial_state}"`,
        )
      }
    } else {
      if (i === 0) violations.push(`transition ${t.seq}: history does not begin with an opening transition`)
      if (current !== null && t.from_state !== current) {
        violations.push(`transition ${t.seq}: leaves "${t.from_state}" while the instance was in "${current}"`)
      }
      const from = getState(spec, t.from_state)
      if (from === null) {
        violations.push(`transition ${t.seq}: unknown state "${t.from_state}"`)
      } else if (t.to_state !== from.next_state && t.to_state !== from.failure_transition) {
        violations.push(
          `transition ${t.seq}: "${t.from_state}" → "${t.to_state}" is not an edge the definition declares`,
        )
      }
      if (getNextState(spec, t.from_state) === t.to_state) completed.add(t.from_state)
    }
    // Re-entering a state invalidates any completion it previously earned.
    completed.delete(t.to_state)
    current = t.to_state
  })

  return {
    current_state: current,
    completed,
    applied: ordered.length,
    integrity: { ok: violations.length === 0, violations },
  }
}

// ── Prerequisites ────────────────────────────────────────────────────────────

export interface PrerequisiteCheck {
  satisfied: boolean
  missing: string[]
}

/**
 * Are `stateId`'s prerequisites met, given the set of completed states?
 *
 * The caller supplies the completion set explicitly so that a prospective move
 * can be judged against the world AFTER it is applied — advancing out of S both
 * completes S and enters S.next_state, and those cannot be evaluated separately
 * without rejecting every legal advance in the definition.
 */
export function checkPrerequisites(
  spec: WorkflowSpec,
  stateId: string,
  completed: ReadonlySet<string>,
): PrerequisiteCheck {
  const state = getState(spec, stateId)
  if (state === null) return { satisfied: false, missing: [] }
  const missing = state.prerequisites.filter(p => !completed.has(p))
  return { satisfied: missing.length === 0, missing }
}

// ── Transition validation ────────────────────────────────────────────────────

export type TransitionKind = 'advance' | 'fail'

export interface TransitionIntent {
  from: string
  to: string
  /** Present when the move exercises a human gate. */
  authorization_id?: string | null
}

export interface TransitionDecision {
  ok: boolean
  errors: string[]
  /** 'advance' when `to` is `from`'s successor; otherwise the failure route. */
  kind: TransitionKind | null
  /** True when leaving `from` crosses a required human gate. */
  requires_authorization: boolean
}

/**
 * Decide whether one proposed move is legal. This is the function that makes an
 * illegal or prerequisite-skipping transition IMPOSSIBLE rather than merely
 * discouraged: the store refuses to write anything this rejects, and the
 * database independently refuses a move whose `from` is not the live state.
 *
 * Default deny — an unrecognised state, an unrecognised edge, or a proposal this
 * function cannot positively prove legal is rejected.
 */
export function validateTransition(
  spec: WorkflowSpec,
  transitions: readonly WorkflowTransition[],
  intent: TransitionIntent,
  instanceStatus: WorkflowInstanceStatus = 'active',
): TransitionDecision {
  const errors: string[] = []
  const deny = (kind: TransitionKind | null = null, requires = false): TransitionDecision =>
    ({ ok: false, errors, kind, requires_authorization: requires })

  if (instanceStatus !== 'active') {
    errors.push(`instance is ${instanceStatus} and accepts no further transitions`)
    return deny()
  }

  const from = getState(spec, intent.from)
  if (from === null) {
    errors.push(`unknown from_state "${intent.from}"`)
    return deny()
  }
  if (getState(spec, intent.to) === null) {
    errors.push(`unknown to_state "${intent.to}"`)
    return deny()
  }

  const derived = deriveCurrentState(spec, transitions)
  if (derived.current_state === null) {
    errors.push('instance has no opening transition — it was not created through workflow_instantiate')
    return deny()
  }
  // Refuse to build on a history that could not have been produced by this
  // engine. Advancing from a corrupt position would launder the corruption into
  // a chain of moves that each look individually legal.
  if (!derived.integrity.ok) {
    errors.push(`transition history is not well-formed: ${derived.integrity.violations.join('; ')}`)
    return deny()
  }
  if (derived.current_state !== intent.from) {
    errors.push(`stale transition: instance is in "${derived.current_state}", not "${intent.from}"`)
    return deny()
  }

  // A terminal state has no successor and no failure route. Nothing may follow it
  // unless a future definition explicitly declares an edge out of it.
  if (from.next_state === null && from.failure_transition === null) {
    errors.push(`"${from.id}" is terminal — the definition declares no transition out of it`)
    return deny()
  }

  const isAdvance = intent.to === from.next_state
  const isFailure = intent.to === from.failure_transition
  if (!isAdvance && !isFailure) {
    errors.push(
      `"${intent.from}" → "${intent.to}" is not declared: next_state is ` +
      `"${from.next_state ?? 'null'}", failure_transition is "${from.failure_transition ?? 'null'}"`,
    )
    return deny()
  }
  const kind: TransitionKind = isAdvance ? 'advance' : 'fail'

  // Judge the destination's prerequisites against the world this move creates.
  const completedAfter = new Set(derived.completed)
  if (isAdvance) completedAfter.add(from.id)
  completedAfter.delete(intent.to)

  const prereq = checkPrerequisites(spec, intent.to, completedAfter)
  if (!prereq.satisfied) {
    errors.push(
      `"${intent.to}" requires ${prereq.missing.map(m => `"${m}"`).join(', ')} to be complete first`,
    )
    return deny(kind)
  }

  // Crossing a required gate on the way FORWARD is an authority act. Looping back
  // on failure is not: redoing your own work needs no permission.
  const requires_authorization = isAdvance && from.human_gate.required
  if (requires_authorization && !intent.authorization_id) {
    errors.push(
      `leaving "${from.id}" crosses a required human gate ` +
      `(${from.human_gate.approver ?? 'approver unspecified'}: ` +
      `${from.human_gate.decision ?? 'decision unspecified'}) — an authorization reference is required`,
    )
    return deny(kind, true)
  }

  return { ok: true, errors: [], kind, requires_authorization }
}

// ── Status projection for readers ────────────────────────────────────────────

export interface DerivedWorkflowStatus {
  current_state: string | null
  /** False when the stored history contains a move this definition never allowed. */
  history_intact: boolean
  status: WorkflowInstanceStatus
  is_terminal: boolean
  /** The state is at rest waiting for a human decision. */
  awaiting_human_gate: boolean
  gate: WorkflowHumanGate | null
  /** Who the instance is waiting on: the gate's approver, or 'system'. */
  waiting_on: string | null
  next_state: string | null
  failure_transition: string | null
  completed_states: string[]
  /** Prerequisites of the CURRENT state that are not satisfied. Should be empty. */
  unsatisfied_prerequisites: string[]
}

/**
 * Everything a status surface needs, derived from history alone. Takes the
 * stored status only to report `abandoned`, which no transition can express.
 */
export function deriveWorkflowStatus(
  spec: WorkflowSpec,
  transitions: readonly WorkflowTransition[],
  storedStatus: WorkflowInstanceStatus = 'active',
): DerivedWorkflowStatus {
  const derived = deriveCurrentState(spec, transitions)
  const current = derived.current_state
  const state = current !== null ? getState(spec, current) : null
  const terminal = current !== null && isTerminal(spec, current)

  const status: WorkflowInstanceStatus =
    storedStatus === 'abandoned' ? 'abandoned' : terminal ? 'complete' : 'active'

  const gate = state?.human_gate ?? null
  const awaiting = !terminal && status === 'active' && gate?.required === true

  return {
    current_state: current,
    history_intact: derived.integrity.ok,
    status,
    is_terminal: terminal,
    awaiting_human_gate: awaiting,
    gate,
    waiting_on: awaiting ? (gate?.approver ?? 'human') : terminal ? null : 'system',
    next_state: state?.next_state ?? null,
    failure_transition: state?.failure_transition ?? null,
    completed_states: [...derived.completed].sort(),
    unsatisfied_prerequisites:
      current !== null ? checkPrerequisites(spec, current, derived.completed).missing : [],
  }
}
