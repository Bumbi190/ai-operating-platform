import type { RateSnapshot } from './spend-ceiling'
export const ATLAS_REALTIME_RATE_KEY = 'elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour'
/**
 * Public evidence 2026-10-17: $0.39/h + max($0.08/h,20%) keyterms < $0.48/h.
 * Account applicability/minimums are still unverified. No fallback or environment
 * switch can turn this into dispatch authority. Record that proof before setting
 * the verified floor and adding a canonical rate.
 */
const evidence: Readonly<{ minimumUsdPerHour: number | null }> = Object.freeze({ minimumUsdPerHour: null })
export function verifiedAtlasRealtimeRate(rates: RateSnapshot): number | null {
  const minimum = evidence.minimumUsdPerHour, value = rates[ATLAS_REALTIME_RATE_KEY]
  return minimum !== null && Number.isFinite(value) && value >= minimum ? value : null
}
