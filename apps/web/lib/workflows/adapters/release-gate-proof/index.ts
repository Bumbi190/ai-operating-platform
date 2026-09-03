/**
 * lib/workflows/adapters/release-gate-proof/index.ts — the adapter for Omnira's
 * release-gate verification workflow.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE PROBE ADAPTER ──────────────────────
 * `probe-validation/index.ts` says of its own instance key: "The instance key is
 * not a month here — this definition has no calendar." `observe_release_gate`
 * requires the opposite: `input.instanceKey` IS the canonical YYYY-MM month the
 * observation is about. Hosting both on one definition would make a single
 * instance key mean two incompatible things, and would force every generic
 * capability probe to carry a required check it can never satisfy.
 *
 * So the two verification workflows stay apart, and this adapter exists only to
 * declare the one check the proof workflow obtains.
 *
 * ── ONE PROOF EXECUTION, ONE AUTHENTICATED REMOTE READ ────────────────────
 * `verifyState` deliberately performs NO remote observation here, and returns
 * no evidence at all. That is not a shortcut — it follows from what the two
 * inputs mean to the scheduler, which `schedule.ts` states plainly:
 *
 *   "Verification may only ever make an outcome WORSE. … What it can never do,
 *    in any branch, is turn something into an advance."
 *
 * `verifyState` output travels as `verification`, which can only DOWNGRADE an
 * outcome. What SATISFIES a required check is recorded `workflow_evidence`,
 * summarised from rows the tick reads but never writes — `recordEvidence` is
 * called from exactly one place, `action-executor.ts`, after a bound and fenced
 * action run. So an observation made here could never complete this workflow;
 * it would only be a second authenticated request whose answer nothing reads.
 *
 * The proof is therefore exactly one credentialed read, made by the executor,
 * bound to a run and recorded as evidence — which is also the only form in which
 * it is worth anything as proof.
 *
 * NOTHING IS MANUFACTURED. Returning `[]` asserts no result:
 * `summarizeVerification([])` yields a null summary, so the scheduler is told
 * nothing rather than told "pass". This adapter cannot fabricate
 * `release_gate_exists`, and the credential-match answer can only come from the
 * real remote response.
 *
 * ── NO SECOND IMPLEMENTATION ───────────────────────────────────────────────
 * The observation itself is `observeReleaseGate`, reached through
 * `observeReleaseGateHandler` — the same function the Familje-Stunden adapter
 * calls at `backend_release_gate`. There is one release-gate observation in this
 * repository and therefore no way for the proof and the release check to drift.
 *
 * ── WHAT THIS ADAPTER CANNOT DO ────────────────────────────────────────────
 * It declares one READ_ONLY check and answers one state. It writes nothing,
 * advances no Familje-Stunden state, and its authoritative system is
 * Familje-Stunden's — the observation is only ever a report about someone
 * else's row.
 */

import 'server-only'

import { FAMILJE_STUNDEN_SYSTEM } from '../familje-stunden'
import type { AttestableCheck } from '../../attestation'
import type { VerificationEvidence, WorkflowAdapter } from '../types'

export const RELEASE_GATE_PROOF_DEF_KEY = 'omnira.release-gate-proof'
export const RELEASE_GATE_PROOF_STATE = 'proof'
/**
 * The canonical check, reused by key rather than renamed.
 *
 * `ANSWERS_CHECK` maps `observe_release_gate → release_gate_exists` for every
 * placement, so a proof-specific alias would simply not be discovered. Sharing
 * the key is what makes the same action usable in both definitions.
 */
export const RELEASE_GATE_PROOF_CHECK = 'release_gate_exists'

/**
 * One check, automated-only, and REQUIRED.
 *
 * Required because this workflow exists for exactly this evidence: a proof that
 * completed without obtaining it would be a workflow that proved nothing. No
 * human can attest what Familje-Stunden returned to a credentialed reader, so
 * `allowed_provenance` is automated alone.
 */
export const RELEASE_GATE_PROOF_CHECKS: readonly AttestableCheck[] = [
  {
    check_key: RELEASE_GATE_PROOF_CHECK,
    state: RELEASE_GATE_PROOF_STATE,
    allowed_provenance: ['automated'],
    description: 'The authoritative month_releases row was read with the scoped verification credential',
    binds_artifacts: false,
    required: true,
  },
]

/**
 * The instance key IS the month key here — the inverse of the probe adapter's
 * contract, and the reason these are two definitions.
 *
 * It is passed through unchanged. `observeReleaseGate` validates it against the
 * canonical YYYY-MM pattern and refuses locally, before reading the credential
 * or opening a connection, so a malformed instance key can never become a
 * production request.
 */
export const releaseGateProofAdapter: WorkflowAdapter = {
  defKey: RELEASE_GATE_PROOF_DEF_KEY,
  authoritativeSystem: FAMILJE_STUNDEN_SYSTEM,
  /**
   * EMPTY, and consistent with `verifyState` below: this adapter declares a
   * check but cannot answer it at scheduler time. `attestableChecks` says what
   * the definition requires; this says what the tick can observe, and for a
   * proof whose whole point is one credentialed read, the honest answer is
   * nothing.
   */
  verifiableStates: () => [],
  attestableChecks: () => RELEASE_GATE_PROOF_CHECKS,
  /**
   * No remote read, no evidence, no assertion — see the header. The single
   * authoritative observation is made by the executor through
   * `observeReleaseGateHandler`, where it is bound, fenced and recorded.
   */
  verifyState: async (): Promise<VerificationEvidence[]> => [],
}
