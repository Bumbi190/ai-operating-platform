export type AtlasOrbQualityTier = 'enhanced' | 'balanced' | 'fallback' | 'reduced'

export interface AtlasOrbQualitySignals {
  reducedMotion: boolean
  canvasSupported: boolean
  viewportWidth: number
  devicePixelRatio: number
  hardwareConcurrency?: number
  saveData?: boolean
}

export function resolveAtlasOrbQuality(signals: AtlasOrbQualitySignals): AtlasOrbQualityTier {
  if (signals.reducedMotion) return 'reduced'
  if (!signals.canvasSupported) return 'fallback'
  if (
    signals.saveData ||
    signals.viewportWidth < 760 ||
    signals.devicePixelRatio > 2.25 ||
    (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 4)
  ) return 'balanced'
  return 'enhanced'
}

export const ATLAS_ORB_DPR_CAP: Record<AtlasOrbQualityTier, number> = {
  enhanced: 1.75,
  balanced: 1.25,
  fallback: 1,
  reduced: 1,
}
