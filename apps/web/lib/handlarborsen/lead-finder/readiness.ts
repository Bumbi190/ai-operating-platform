/** Verified official OpenAPI and owner-run local SCB reads 2026-10-27. */
export const SCB_CONTRACT_VERIFIED = true

/** General live search remains off. Preview probing is a separate, explicit owner-controlled gate. */
export const SCB_LIVE_SEARCH_APPROVED = false
export const SCB_PREVIEW_SEARCH_FLAG = 'HB_LEADFINDER_SCB_PREVIEW_ENABLED' as const

/** Preview/development only. Production can never be enabled by this flag. */
export function scbPreviewSearchApproved(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== 'production' && env[SCB_PREVIEW_SEARCH_FLAG] === 'true'
}

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
  const scbLiveSearchApproved = SCB_LIVE_SEARCH_APPROVED || scbPreviewSearchApproved(env)
  return {
    scbKeyConfigured,
    scbContractVerified: SCB_CONTRACT_VERIFIED,
    scbLiveSearchApproved,
    liveSearchAvailable: scbKeyConfigured && SCB_CONTRACT_VERIFIED && scbLiveSearchApproved,
    googlePlaces: 'disabled',
    persistence: 'schema_created_import_disabled',
    outreach: 'never_triggered_by_import',
  }
}
