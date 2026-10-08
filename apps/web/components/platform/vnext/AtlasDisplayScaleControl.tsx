'use client'

import { useDisplayPreferences } from '@/components/platform/os'
import { DISPLAY_SCALES, DISPLAY_SCALE_LABELS } from '@/lib/ui/display-preferences'
import styles from './AtlasHomeVNext.module.css'

/**
 * The mockup's "Visningsstorlek  A A A" control. A real radio group over the
 * same preference Inställningar edits — the provider owns storage and the
 * root attribute; this only reads and sets.
 */
export function AtlasDisplayScaleControl() {
  const { displayScale, setDisplayScale, displayScaleAvailable } = useDisplayPreferences()
  if (!displayScaleAvailable) return null

  return (
    <div className={styles.scaleControl} role="radiogroup" aria-label="Visningsstorlek">
      <span className={styles.scaleLabel} aria-hidden="true">Visningsstorlek</span>
      {DISPLAY_SCALES.map((scale) => (
        <button
          key={scale}
          type="button"
          role="radio"
          aria-checked={scale === displayScale}
          aria-label={DISPLAY_SCALE_LABELS[scale]}
          data-scale={scale}
          className={styles.scaleOption}
          onClick={() => setDisplayScale(scale)}
        >
          A
        </button>
      ))}
    </div>
  )
}
