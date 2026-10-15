import type { OfficialCandidateEvidence } from './handlarborsen-competitor-discovery-core'

/**
 * Operator-reviewed research leads from independently visited official sites.
 * This is a static seed list, not a live search result or a persisted scan.
 * Keep the observation date, source URL and provenance explicit.
 */
export const MANUALLY_REVIEWED_DISCOVERY_LEADS: readonly OfficialCandidateEvidence[] = Object.freeze([
  Object.freeze({
    name: 'TradingSolutions D2D',
    officialUrl: 'https://www.tradingsolutions.se/d2d/',
    observedOn: '2026-10-15',
    relevance: 'Officiell sida beskriver en digital bilauktion för bilhandlare med köp och försäljning.',
    provenance: 'independently_checked_official_website',
  }),
])
