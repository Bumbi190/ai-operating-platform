/**
 * H1.P4 PR2 — policy gate (pure decision, no I/O).
 *
 * Reads PR1's immutable per-run snapshot `runs.policy_class` and decides the run's
 * terminal outcome on the drain path:
 *   - 'non_destructive'                 → 'done'              (no approval)
 *   - 'approval_required' | null | other → 'awaiting_approval' (Default Deny, fail-safe)
 *
 * Default Deny is deliberate: an unclassified (NULL) or unknown class must NOT auto-run
 * to completion. The decision is taken against the per-run snapshot, so a mid-run
 * re-classification of the workflow cannot change an in-flight run's gate — same
 * immutability philosophy as H1.P3's steps_snapshot.
 *
 * Behind H1_POLICY_GATE (default OFF) and, per PR2 scope, only exercised on the
 * unified-executor agent-step path; marketing and legacy runSteps paths stay ungated.
 */

export type GateOutcome = 'done' | 'awaiting_approval'

export function decideGate(policyClass: string | null | undefined): GateOutcome {
  return policyClass === 'non_destructive' ? 'done' : 'awaiting_approval'
}
