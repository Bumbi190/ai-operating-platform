/**
 * Emergency release fence for the historical local-text DISPATCH_UNKNOWN.
 *
 * This is deliberately a SOURCE-controlled hold, not another environment flag.
 * Setting ATLAS_LOCAL_TEXT_ENABLED=true cannot enable a local worker until a
 * separately reviewed code change removes this hold, AFTER the authoritative
 * project-wide SQL incident gate in security issue #533 has shipped.
 *
 * Reads, owner revocations and incident inspection remain available elsewhere.
 */
export const LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD: boolean = true

export function localTextDispatchEnabled(): boolean {
  return !LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD
    && process.env.ATLAS_LOCAL_TEXT_ENABLED === 'true'
}
