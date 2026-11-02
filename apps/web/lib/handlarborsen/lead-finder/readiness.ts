/** Verified official OpenAPI and owner-run local SCB reads 2026-10-27; no live SERVER search approved. */
export const SCB_CONTRACT_VERIFIED = true

/** Live SCB requests need explicit human approval; flip this deliberately, never via env. */
export const SCB_LIVE_SEARCH_APPROVED = false

export interface LeadFinderReadiness {
  scbKeyConfigured: boolean
  scbContractVerified: boolean
  scbLiveSearchApproved: boolean
  liveSearchAvailable: boolean
  googlePlaces: 'disabled'
  persistence: 'not_applied' | 'schema_created_import_disabled'
  outreach: 'never_triggered_by_import'
}

/** Booleans only — the key itself is never returned. */
export function getReadiness(env: Record<string, string | undefined> = process.env): LeadFinderReadiness {
  const scbKeyConfigured = Boolean(env.SCB_API_KEY?.trim())
  return {
    scbKeyConfigured,
    scbContractVerified: SCB_CONTRACT_VERIFIED,
    scbLiveSearchApproved: SCB_LIVE_SEARCH_APPROVED,
    liveSearchAvailable: scbKeyConfigured && SCB_CONTRACT_VERIFIED && SCB_LIVE_SEARCH_APPROVED,
    googlePlaces: 'disabled',
    persistence: 'schema_created_import_disabled',
    outreach: 'never_triggered_by_import',
  }
}
