/**
 * lib/workflows/schedule.ts — when an instance is due, and what a tick may do
 * about it. Pure: no I/O, no clock read (`now` is always injected).
 *
 * ── THE CLASSIFICATION PROBLEM, AND HOW IT IS ANSWERED ───────────────────────
 * PR3 may auto-advance only states that are PURE ORCHESTRATION — states where
 * moving on implies no material or external act. The workflow definition format
 * does not say this directly: there is no `external: true` field, and adding one
 * would change the vendored document and therefore its def_hash.
 *
 * So the classification is DERIVED from what the definition already declares,
 * and it fails closed. A state is auto-advanceable only when ALL hold:
 *
 *   • it has a successor at all
 *   • it declares no human gate
 *   • it declares NO automated_actions — every entry there is work someone must
 *     actually perform (encode a video, call a TTS provider, apply a migration)
 *   • it declares NO verification — a verification is a claim about the world
 *     that PR3 cannot check, and asserting it passed would be a lie
 *
 * For familje-stunden.monthly-release this yields ZERO states, which is the
 * honest answer: every one of its nineteen states either waits on a human, does
 * external work, or must be verified against systems this PR is not allowed to
 * reach. The scheduler therefore EVALUATES and REPORTS; it does not advance.
 * The classifier exists so that a definition which genuinely has an
 * orchestration-only step is handled correctly rather than specially.
 */

import { checkPrerequisites, deriveCurrentState, getState } from './machine'
import type { VerificationEvidence } from './adapters/types'
import type { CheckVerdict } from './evidence-consumption'
import type { WorkflowFailureClass } from './escalation'
import type { WorkflowInstance, WorkflowSpec, WorkflowStateSpec, WorkflowTransition } from './types'
import type { WorkflowGateState } from './gate'

// ── Due semantics ────────────────────────────────────────────────────────────

export type WakeState = 'not_scheduled' | 'sleeping' | 'due'

/**
 * `null` is not scheduled; a future instant is sleeping; anything at or before
 * `now` is due.
 *
 * A wake in the PAST is due, not an error. Clock skew, a paused project, a
 * missed tick or a crash all produce one, and treating it as invalid would
 * strand the instance exactly when it most needs attention.
 */
export function wakeState(wakeAt: string | null, now: string): WakeState {
  if (wakeAt === null) return 'not_scheduled'
  return Date.parse(wakeAt) <= Date.parse(now) ? 'due' : 'sleeping'
}

/** Terminal and abandoned instances are never eligible, whatever wake_at says. */
export function isSchedulable(instance: Pick<WorkflowInstance, 'status'>): boolean {
  return instance.status === 'active'
}

// ── Auto-advance classification ──────────────────────────────────────────────

/**
 * May the scheduler move THROUGH this state unattended?
 *
 * Default deny. See the header for why each clause is required.
 */
export function isAutoAdvanceable(state: WorkflowStateSpec | null): boolean {
  if (state === null) return false
  return state.next_state !== null
    && state.human_gate.required === false
    && state.automated_actions.length === 0
    && state.verification.length === 0
}

/** Every state in a definition the scheduler could advance unattended. */
export function autoAdvanceableStates(spec: WorkflowSpec): string[] {
  return spec.states.filter(isAutoAdvanceable).map(s => s.id)
}

// ── Outcomes ─────────────────────────────────────────────────────────────────

/**
 * What a tick concluded. Ordered roughly from "nothing to do" to "someone must
 * look at this".
 */
export type WorkflowTickOutcome =
  /** Not due after all — defensive; a claimed instance should not report this. */
  | 'sleeping'
  /** Terminal or abandoned. Never eligible again. */
  | 'terminal'
  /** The project kill switch is on. */
  | 'paused'
  /** The stored history contains a move this definition never allowed. */
  | 'failed'
  /** Prerequisites unmet, or a gate that a human has closed. */
  | 'blocked'
  /** A gate is open and nobody has been asked yet. */
  | 'waiting_for_authorization'
  /**
   * A human granted authority and the grant is still valid for this exact pin —
   * but the state's own work is external, so the scheduler stops here. This is
   * the "permission to act is not the act" boundary, made visible.
   */
  | 'authorized_ready'
  /** Pure orchestration, prerequisites met: the scheduler could advance this. */
  | 'ready_for_transition'

/**
 * What read-only verification said, if an adapter ran any.
 *
 * `null` means no adapter, or nothing verifiable for this state — NOT "verified
 * clean". The distinction matters: absence of a finding is not a finding.
 */
export type VerificationSummary =
  | 'verification_passed'
  | 'verification_failed'
  | 'verification_blocked'
  | 'verification_error'

export interface WorkflowTickEvaluation {
  outcome: WorkflowTickOutcome
  state: string | null
  /** Human-readable, safe to store and display. */
  reason: string
  /** True only when `outcome === 'failed'` — surfaced as a signal. */
  escalate: boolean
  gateStatus: WorkflowGateState['status'] | null
  missingPrerequisites: string[]
  autoAdvanceable: boolean
  verification: VerificationSummary | null
  /** Check keys that did not pass, for the audit record. Never their payloads. */
  verificationFindings: string[]
  /**
   * Conditions this evaluation found, each ready to become a signal. Empty when
   * nothing is wrong — an absence here is not a claim that anything passed.
   */
  conditions: WorkflowCondition[]
}

/** One thing that is wrong, classified rather than flattened into "failed". */
export interface WorkflowCondition {
  failureClass: WorkflowFailureClass
  checkKey: string | null
  targetHash: string | null
  provenance: string | null
  summary: string
}

/**
 * Map an evidence verdict to a failure class.
 *
 * `satisfied` returns null. Everything else is a distinct condition, because
 * "the producer said no", "we could not look", "the answer was unusable" and
 * "this was verified against different artefacts" need different responses.
 */
export function conditionForVerdict(
  verdict: CheckVerdict, required: boolean,
): WorkflowCondition | null {
  const base = {
    checkKey: verdict.check_key,
    targetHash: null as string | null,
    provenance: verdict.source,
  }
  switch (verdict.satisfaction) {
    case 'satisfied':
      return null
    case 'failed':
      return { ...base, failureClass: 'verification_failed', summary: verdict.reason }
    case 'errored':
      return { ...base, failureClass: 'verification_error', summary: verdict.reason }
    case 'stale':
      return { ...base, failureClass: 'verification_stale', summary: verdict.reason }
    // Not a finding about the world — a finding about our ability to look. Only
    // a REQUIRED check turns that into a condition; an informational one is
    // recorded and shown without holding anything up.
    case 'blocked':
    case 'absent':
    case 'unbound':
    case 'provenance_refused':
    case 'undeclared':
      return required
        ? { ...base, failureClass: 'verification_blocked', summary: `${verdict.satisfaction}: ${verdict.reason}` }
        : null
  }
}

/**
 * Reduce a set of verification records to one summary, worst-first.
 *
 * `fail` outranks `error` outranks `blocked`: a real authoritative NO is the most
 * important thing that can be in this list, and must never be hidden behind a
 * timeout that happened to be evaluated first.
 */
export function summarizeVerification(
  evidence: readonly VerificationEvidence[],
): { summary: VerificationSummary | null; findings: string[] } {
  if (evidence.length === 0) return { summary: null, findings: [] }
  const worst = (r: VerificationEvidence['result']) =>
    r === 'fail' ? 3 : r === 'error' ? 2 : r === 'blocked' ? 1 : 0
  const top = evidence.reduce((a, b) => (worst(b.result) > worst(a.result) ? b : a))
  const findings = evidence.filter(e => e.result !== 'pass').map(e => `${e.check_key}:${e.result}`)
  const summary: VerificationSummary =
    top.result === 'fail' ? 'verification_failed'
    : top.result === 'error' ? 'verification_error'
    : top.result === 'blocked' ? 'verification_blocked'
    : 'verification_passed'
  return { summary, findings }
}

export interface EvaluateInput {
  instance: Pick<WorkflowInstance, 'status' | 'wake_at' | 'current_state'>
  spec: WorkflowSpec
  transitions: readonly WorkflowTransition[]
  /** Resolved by the caller — deriving it needs the ledger. */
  gate: WorkflowGateState | null
  projectPaused: boolean
  now: string
  /** Read-only verification gathered by the caller. Empty when none ran. */
  verification?: readonly VerificationEvidence[]
  /**
   * Verdicts for the checks this state DECLARES, judged against recorded
   * evidence (PR5). Empty when the definition declares none.
   */
  evidence?: readonly CheckVerdict[]
  /** Which declared checks must be satisfied for safe advancement. */
  requiredChecks?: ReadonlySet<string>
}

/**
 * Decide what a due instance's situation is. Pure, total, and fail-closed: any
 * condition this function cannot positively establish resolves to a state that
 * does NOT advance.
 *
 * The order of the checks is the safety order. Terminal and paused come before
 * anything else so a finished or frozen workflow is never reasoned about;
 * integrity comes before prerequisites so a corrupt history is never used to
 * justify a move; the gate comes last so its verdict is reported against a
 * history already known to be sound.
 */
export function evaluateWorkflowTick(input: EvaluateInput): WorkflowTickEvaluation {
  const { summary, findings } = summarizeVerification(input.verification ?? [])
  const required = input.requiredChecks ?? new Set<string>()
  const evidenceConditions = (input.evidence ?? [])
    .map(v => conditionForVerdict(v, required.has(v.check_key)))
    .filter((c): c is WorkflowCondition => c !== null)
  const base = {
    state: input.instance.current_state,
    gateStatus: input.gate?.status ?? null,
    missingPrerequisites: [] as string[],
    autoAdvanceable: false,
    escalate: false,
    verification: summary,
    verificationFindings: findings,
    conditions: evidenceConditions,
  }

  if (!isSchedulable(input.instance)) {
    return { ...base, outcome: 'terminal', reason: `instance is ${input.instance.status}` }
  }
  if (input.projectPaused) {
    return { ...base, outcome: 'paused', reason: 'project execution is paused' }
  }

  const derived = deriveCurrentState(input.spec, input.transitions)
  if (!derived.integrity.ok) {
    return {
      ...base,
      outcome: 'failed',
      escalate: true,
      reason: `transition history is not well-formed: ${derived.integrity.violations.join('; ')}`,
      conditions: [{
        failureClass: 'workflow_integrity_failure', checkKey: null, targetHash: null,
        provenance: null,
        summary: `transition history is not well-formed: ${derived.integrity.violations.join('; ')}`,
      }],
    }
  }
  if (derived.current_state === null) {
    return {
      ...base, outcome: 'failed', escalate: true, reason: 'instance has no transition history',
      // An integrity failure REPLACES the evidence conditions rather than adding
      // to them: when the history cannot be trusted, findings derived from it
      // are not independent facts worth escalating separately.
      conditions: [{
        failureClass: 'workflow_integrity_failure', checkKey: null, targetHash: null,
        provenance: null, summary: 'instance has no transition history',
      }],
    }
  }
  // The projection disagreeing with history is a corruption signal, not a
  // rounding error — the guard in the database exists to make it impossible.
  if (derived.current_state !== input.instance.current_state) {
    const driftReason =
      `projection drift: stored "${input.instance.current_state}", derived "${derived.current_state}"`
    return {
      ...base, outcome: 'failed', escalate: true, reason: driftReason,
      conditions: [{
        failureClass: 'workflow_integrity_failure', checkKey: null, targetHash: null,
        provenance: null, summary: driftReason,
      }],
    }
  }

  const state = getState(input.spec, derived.current_state)
  if (state === null) {
    return {
      ...base, outcome: 'failed', escalate: true,
      reason: 'current state is not declared by the pinned definition',
      conditions: [{
        failureClass: 'workflow_integrity_failure', checkKey: null, targetHash: null,
        provenance: null, summary: 'current state is not declared by the pinned definition',
      }],
    }
  }
  if (state.next_state === null) {
    return { ...base, outcome: 'terminal', reason: 'terminal state' }
  }

  const autoAdvanceable = isAutoAdvanceable(state)

  // Judged against the world an advance would create, exactly as the machine does.
  const completedAfter = new Set(derived.completed)
  completedAfter.add(state.id)
  completedAfter.delete(state.next_state)
  const prereq = checkPrerequisites(input.spec, state.next_state, completedAfter)
  if (!prereq.satisfied) {
    const prereqReason =
      `"${state.next_state}" requires ${prereq.missing.map(m => `"${m}"`).join(', ')} to be complete first`
    return {
      ...base,
      outcome: 'blocked',
      autoAdvanceable,
      missingPrerequisites: prereq.missing,
      reason: prereqReason,
      conditions: [...base.conditions, {
        failureClass: 'prerequisite_blocked', checkKey: null, targetHash: null,
        provenance: null, summary: prereqReason,
      }],
    }
  }

  if (state.human_gate.required) {
    const status = input.gate?.status ?? null
    if (status === null) {
      return { ...base, outcome: 'blocked', autoAdvanceable, reason: 'gate status could not be resolved' }
    }
    if (status === 'waiting_for_authorization') {
      return {
        ...base, outcome: 'waiting_for_authorization', autoAdvanceable,
        reason: `awaiting ${state.human_gate.approver ?? 'approval'}: ${state.human_gate.decision ?? 'decision unspecified'}`,
      }
    }
    if (status !== 'authorized') {
      return {
        ...base, outcome: 'blocked', autoAdvanceable, reason: `gate is ${status}`,
        conditions: [...base.conditions, {
          failureClass: 'authorization_blocked', checkKey: null, targetHash: null,
          provenance: null, summary: `gate is ${status}`,
        }],
      }
    }
    // Authorized — but authority is not the act.
    return applyVerification({
      ...base,
      outcome: autoAdvanceable ? 'ready_for_transition' : 'authorized_ready',
      autoAdvanceable,
      reason: autoAdvanceable
        ? 'authorized and orchestration-only'
        : `authorized; "${state.id}" declares work the scheduler does not perform`,
    })
  }

  return applyVerification({
    ...base,
    outcome: autoAdvanceable ? 'ready_for_transition' : 'authorized_ready',
    autoAdvanceable,
    reason: autoAdvanceable
      ? 'orchestration-only and unblocked'
      : `"${state.id}" declares work the scheduler does not perform`,
  })
}

/**
 * Verification may only ever make an outcome WORSE.
 *
 * An authoritative FAIL or an unusable response blocks. A `blocked` verification
 * — we could not look — is recorded but does not itself stop the workflow: it is
 * evidence about our reach, not about the world, and treating it as a finding
 * would let a missing credential masquerade as a release problem. What it can
 * never do, in any branch, is turn something into an advance.
 */
function applyVerification(evaluation: WorkflowTickEvaluation): WorkflowTickEvaluation {
  if (evaluation.verification === 'verification_failed' || evaluation.verification === 'verification_error') {
    return {
      ...evaluation,
      outcome: 'blocked',
      reason: `verification ${evaluation.verification === 'verification_failed' ? 'failed' : 'errored'}: ` +
              evaluation.verificationFindings.join(', '),
    }
  }
  // Recorded evidence (PR5) blocks on exactly the same terms. A required check
  // that failed, errored, went stale or was never satisfied cannot be advanced
  // past, and no combination of other passing checks changes that.
  const blocking = evaluation.conditions.filter(c =>
    c.failureClass === 'verification_failed' || c.failureClass === 'verification_error' ||
    c.failureClass === 'verification_stale'  || c.failureClass === 'verification_blocked')
  if (blocking.length > 0) {
    return {
      ...evaluation,
      outcome: 'blocked',
      reason: `evidence: ${blocking.map(c => `${c.checkKey}:${c.failureClass}`).join(', ')}`,
    }
  }
  return evaluation
}

/**
 * When should this instance be looked at again?
 *
 * `null` means "do not re-arm": the situation now needs a human, and re-checking
 * every minute would burn ticks and fill the evidence log without changing
 * anything. Re-arming is then an explicit act (a decision, or a manual reschedule).
 */
export function nextWakeAfter(outcome: WorkflowTickOutcome): number | null {
  switch (outcome) {
    case 'sleeping':                  return 60          // defensive: look again shortly
    case 'ready_for_transition':      return 60
    case 'authorized_ready':          return null        // needs a later PR to act
    case 'waiting_for_authorization': return null        // needs a human
    case 'blocked':                   return null        // needs a human
    case 'failed':                    return null        // escalated
    case 'terminal':                  return null
    case 'paused':                    return null
  }
}
