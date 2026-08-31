/**
 * lib/workflows/adapters/probe-validation/index.ts — the adapter for Omnira's
 * own capability-validation workflow.
 *
 * It exists so the probe's result is a DECLARED check rather than an
 * undeclared row. Without a catalogue the evidence would still be written, but
 * it would sit outside target and evidence semantics entirely: invisible to
 * `summarizeStateEvidence`, unable to satisfy anything, and unable to move the
 * action target when it changes. A validation that cannot be seen by the
 * machinery it is validating proves very little.
 *
 * It reuses `checkAnonymousProtectedAccessDenied` unchanged — the same function
 * the Familje-Stunden adapter calls. There is no second implementation of the
 * probe, and therefore no way for the two to drift.
 */

import 'server-only'

import {
  checkAnonymousProtectedAccessDenied,
  FAMILJE_STUNDEN_SYSTEM,
} from '../familje-stunden'
import type { AttestableCheck } from '../../attestation'
import type { VerificationEvidence, WorkflowAdapter } from '../types'

export const PROBE_VALIDATION_DEF_KEY = 'omnira.probe-validation'
export const PROBE_VALIDATION_STATE = 'probe'
export const PROBE_CHECK = 'anonymous_protected_access_denied'

/**
 * One check, automated-only. No human can attest what an endpoint returned to
 * an anonymous caller, and `required: true` is honest here: the whole point of
 * this state is that observation.
 */
export const PROBE_VALIDATION_CHECKS: readonly AttestableCheck[] = [
  {
    check_key: PROBE_CHECK,
    state: PROBE_VALIDATION_STATE,
    allowed_provenance: ['automated'],
    description: 'Unauthenticated callers are refused by every protected endpoint',
    binds_artifacts: false,
    required: true,
  },
]

/**
 * The instance key is not a month here — this definition has no calendar. It is
 * passed through unchanged because `checkAnonymousProtectedAccessDenied` only
 * echoes it into the probe body and the audit detail; the URL comes from
 * configuration and never from the instance.
 */
export const probeValidationAdapter: WorkflowAdapter = {
  defKey: PROBE_VALIDATION_DEF_KEY,
  authoritativeSystem: FAMILJE_STUNDEN_SYSTEM,
  verifiableStates: () => [PROBE_VALIDATION_STATE],
  attestableChecks: () => PROBE_VALIDATION_CHECKS,
  verifyState: async ({ state, instanceKey, now }): Promise<VerificationEvidence[]> => {
    if (state !== PROBE_VALIDATION_STATE) return []
    return [await checkAnonymousProtectedAccessDenied(instanceKey, now)]
  },
}
