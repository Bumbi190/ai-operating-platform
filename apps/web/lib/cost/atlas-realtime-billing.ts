import type { RateSnapshot } from './spend-ceiling'
export const ATLAS_REALTIME_RATE_KEY = 'elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour'
/**
 * Public evidence 2026-10-17: $0.39/h + max($0.08/h,20%) keyterms < $0.48/h.
 * Standard Starter confirmed by the operator's subscription screenshot.
 * Public self-serve API table uses the same audio-duration tariff across tiers.
 * Transcript editing (with its per-commit minimum) is not enabled.
 * See docs/architecture/atlas-voice/2026-10-17-streaming-stt-verification.md.
 * Re-verify if provider account/terms change; flags cannot lower this floor.
 */
const evidence: Readonly<{ minimumUsdPerHour: number | null }> = Object.freeze({ minimumUsdPerHour: 0.48 })
export function verifiedAtlasRealtimeRate(rates: RateSnapshot): number | null {
  const minimum = evidence.minimumUsdPerHour, value = rates[ATLAS_REALTIME_RATE_KEY]
  return minimum !== null && Number.isFinite(value) && value >= minimum ? value : null
}
