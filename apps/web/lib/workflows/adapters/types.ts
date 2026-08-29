/**
 * lib/workflows/adapters/types.ts — what a project adapter is allowed to be.
 *
 * An adapter OBSERVES a project's authoritative systems and reports what it saw.
 * It never owns policy. For Familje-Stunden that distinction is the whole design:
 * `can_access_month` is the single source of truth for access and it applies the
 * fail-open release gate, so a copy of its conditions living in Omnira and
 * drifting out of sync would publish material early. An adapter asks; it does not
 * decide.
 *
 * ── FAIL CLOSED, AND SAY WHICH KIND OF CLOSED ────────────────────────────────
 * "Could not verify" must never become PASS. But collapsing every non-pass into
 * FAIL is just as wrong: a missing credential is an operator task, a timeout is
 * worth retrying, and an authoritative NO is a real finding that must stop a
 * release. Those need different handling, so they get different results:
 *
 *   pass     the authority was reached and answered as expected
 *   fail     the authority was reached and answered otherwise — a real finding
 *   blocked  the check could not run (no credential, timeout, service down).
 *            Not evidence about the world; evidence about our ability to look.
 *   error    the check ran and produced something unusable — a malformed body,
 *            an unexpected status. Fail closed and surface it.
 */

import type { AttestableCheck } from '../attestation'

/** The outcome vocabulary written into workflow_evidence. */
export type VerificationResult = 'pass' | 'fail' | 'blocked' | 'error'

/**
 * Why a check did not pass. Kept separate from `result` so the reason survives
 * into the audit record and into a retry decision.
 */
export type VerificationFailureKind =
  /** The authoritative system answered, and the answer was not what was expected. */
  | 'authoritative_fail'
  /** No credential is configured for this check. An operator task, not a defect. */
  | 'credential_missing'
  /** The request did not complete in time. */
  | 'network_timeout'
  /** Reached, but the body could not be understood. */
  | 'malformed_response'
  /** The authoritative system is reachable but not serving. */
  | 'service_unavailable'
  /** A status neither success nor an expected denial. */
  | 'unexpected_status'

/**
 * Which failures are worth retrying, and which are not. A semantic FAIL is not
 * retried — the world would have to change first, and hammering an authoritative
 * NO turns a finding into a load problem. A credential failure is not retried
 * either: retrying a request that was refused for lack of authority is how a
 * retry storm starts.
 */
export function isRetryable(kind: VerificationFailureKind): boolean {
  return kind === 'network_timeout' || kind === 'service_unavailable'
}

/**
 * One verification, shaped for `workflow_evidence`.
 *
 * `expected` and `observed` are strings on purpose: they are read by a human in
 * an audit, and a structured value that needs interpretation to compare is a
 * value someone will misread. `detail` carries safe metadata only — never a
 * token, never a raw row, never a user identifier.
 */
export interface VerificationEvidence {
  check_key: string
  result: VerificationResult
  observed_at: string
  /** Who performed the check. */
  source: string
  /** Whose answer it is. `null` when nothing external was consulted. */
  authoritative_system: string | null
  expected: string
  observed: string
  failure_kind: VerificationFailureKind | null
  detail: Record<string, unknown>
}

export const OMNIRA_VERIFIER = 'omnira.workflow.adapter'

/** Build a passing record. */
export function pass(
  check_key: string,
  input: { expected: string; observed: string; authoritative_system: string | null; observed_at: string; detail?: Record<string, unknown> },
): VerificationEvidence {
  return {
    check_key, result: 'pass', observed_at: input.observed_at, source: OMNIRA_VERIFIER,
    authoritative_system: input.authoritative_system,
    expected: input.expected, observed: input.observed,
    failure_kind: null, detail: input.detail ?? {},
  }
}

/**
 * Build a non-passing record. The result is DERIVED from the failure kind, so a
 * caller cannot label a timeout as a `fail` or — much worse — a real
 * authoritative NO as merely `blocked`.
 */
export function notPass(
  check_key: string,
  kind: VerificationFailureKind,
  input: { expected: string; observed: string; authoritative_system: string | null; observed_at: string; detail?: Record<string, unknown> },
): VerificationEvidence {
  const result: VerificationResult =
    kind === 'authoritative_fail' ? 'fail'
    : kind === 'malformed_response' || kind === 'unexpected_status' ? 'error'
    : 'blocked'
  return {
    check_key, result, observed_at: input.observed_at, source: OMNIRA_VERIFIER,
    authoritative_system: input.authoritative_system,
    expected: input.expected, observed: input.observed,
    failure_kind: kind, detail: input.detail ?? {},
  }
}

// ── Adapter registration ─────────────────────────────────────────────────────

/**
 * A project adapter. Deliberately tiny: one identity, and one read-only
 * verification entry point. There is no `execute`, no `write`, and no `upload` —
 * a capability that does not exist in the type cannot be added by a caller.
 */
export interface WorkflowAdapter {
  /** The definition this adapter serves. */
  defKey: string
  /** The system whose answers it reports. */
  authoritativeSystem: string
  /**
   * Verify what can be verified for one state, read-only.
   * Returns evidence; writing it is the caller's decision (PR4 section E).
   */
  verifyState(input: {
    state: string
    instanceKey: string
    now: string
  }): Promise<VerificationEvidence[]>
  /** Which states this adapter can say anything about. */
  verifiableStates(): string[]
  /**
   * The checks this workflow declares, and which provenance may satisfy each.
   *
   * Ingestion consults this: evidence for a (state, check_key) the definition
   * does not declare is refused, and an attestation for an automated-only check
   * is refused. An adapter with no catalogue accepts no attestations at all —
   * fail closed, not open.
   */
  attestableChecks(): readonly AttestableCheck[]
}
