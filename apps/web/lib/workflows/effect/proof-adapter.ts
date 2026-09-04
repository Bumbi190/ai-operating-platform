/**
 * lib/workflows/effect/proof-adapter.ts — a world that can be governed but not
 * harmed.
 *
 * Every failure mode a governed effect must survive is reachable here
 * deterministically: explicit rejection, a timeout before the remote could have
 * accepted, a timeout after it might have, acceptance followed by a local crash,
 * and each reconciliation answer. None of them touches anything.
 *
 * ── WHY A FAKE WORLD RATHER THAN A SANDBOX PROVIDER ─────────────────────────
 * The interesting cases are the ones a real provider will not produce on demand.
 * "The remote accepted and then we crashed before persisting" is the single most
 * dangerous state in the whole design, and no sandbox key will reproduce it when
 * asked. A deterministic switch does, every time, in a unit test.
 *
 * The scenario comes from the proof instance's own key, so a caller cannot choose
 * it and neither can a payload — the same rule the read-only handlers follow.
 */

import type { DispatchObservation } from '../action-outcome'
import type { ReconciliationResult } from '../reconciliation'

/** Deterministic fake cost. Not a price, not a rate, never billed. */
export const PROOF_EFFECT_ESTIMATED_SEK = 1.0

export const PROOF_SCENARIOS = [
  'success',
  'local_failure',
  'remote_rejected',
  'timeout_before_acceptance',
  'timeout_after_acceptance',
  'confirmed_then_local_crash',
] as const

export type ProofScenario = (typeof PROOF_SCENARIOS)[number]

export function isProofScenario(value: string): value is ProofScenario {
  return (PROOF_SCENARIOS as readonly string[]).includes(value)
}

/** What the fake world did, in the vocabulary the real certainty model uses. */
export interface ProofDispatchResult {
  readonly observation: DispatchObservation
  /** Did the effect provably NOT happen? Only then may a reservation be released. */
  readonly provablyNotApplied: boolean
  /** Present only where the remote got far enough to name the operation. */
  readonly remoteOperationId: string | null
  readonly detail: string
}

/**
 * One "dispatch".
 *
 * `beforeDispatch` is the caller's last chance to refuse and is awaited before
 * anything is decided — the same shape `observeReleaseGate` uses, so a stop
 * committing mid-handler prevents the act rather than only the next one.
 */
export async function proofDispatch(
  scenario: ProofScenario,
  beforeDispatch?: () => Promise<void> | void,
): Promise<ProofDispatchResult> {
  if (beforeDispatch) await beforeDispatch()

  switch (scenario) {
    case 'success':
      return {
        observation: 'remote_confirmed', provablyNotApplied: false,
        remoteOperationId: 'proof-op-success', detail: 'the remote confirmed the effect',
      }
    case 'local_failure':
      // Refused before anything left the building. The one case that may release.
      return {
        observation: 'not_dispatched', provablyNotApplied: true,
        remoteOperationId: null, detail: 'refused locally; nothing was sent',
      }
    case 'remote_rejected':
      // The remote answered, and its answer was no. Nothing was applied and
      // nothing was billed — a positive claim, not an absence of evidence.
      return {
        observation: 'remote_rejected', provablyNotApplied: true,
        remoteOperationId: null, detail: 'the remote rejected the request',
      }
    case 'timeout_before_acceptance':
      // A deadline fired while the request was still in flight. We do NOT know
      // the remote never saw it, so this is ambiguous — not a safe retry.
      return {
        observation: 'response_lost', provablyNotApplied: false,
        remoteOperationId: null, detail: 'the deadline fired before any answer',
      }
    case 'timeout_after_acceptance':
      return {
        observation: 'response_lost', provablyNotApplied: false,
        remoteOperationId: 'proof-op-maybe',
        detail: 'the remote may have accepted before the answer was lost',
      }
    case 'confirmed_then_local_crash':
      // The worst case: the effect certainly happened and we certainly failed to
      // record it. Confirmed, with evidence still owed.
      return {
        observation: 'confirmed_evidence_failed', provablyNotApplied: false,
        remoteOperationId: 'proof-op-confirmed',
        detail: 'the remote confirmed; persisting the result then failed',
      }
  }
}

/**
 * Asking the fake authority what really happened.
 *
 * Read-only by construction, like the real seam: it answers and never repairs.
 * `timeout_before_acceptance` reconciles to "nothing was applied" — the only
 * answer that may ever permit a fresh attempt — while the two cases that might
 * have applied return CONFIRMED_SUCCESS and STILL_UNKNOWN respectively.
 */
export function proofReconcile(scenario: ProofScenario): ReconciliationResult {
  switch (scenario) {
    case 'timeout_before_acceptance':  return 'CONFIRMED_NOT_APPLIED'
    case 'timeout_after_acceptance':   return 'STILL_UNKNOWN'
    case 'confirmed_then_local_crash': return 'CONFIRMED_SUCCEEDED'
    default:                           return 'STILL_UNKNOWN'
  }
}
