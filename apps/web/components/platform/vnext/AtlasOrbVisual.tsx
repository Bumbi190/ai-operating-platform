'use client'

import { useCallback, useState } from 'react'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import type { AtlasOrbCompletionEvent, AtlasOrbState } from '@/lib/atlas/orb-state'
import { AtlasOrbCanvas } from './AtlasOrbCanvas'
import styles from './AtlasHomeVNext.module.css'

interface AtlasOrbVisualProps {
  state: AtlasOrbState
  label: string
  stateDescription: string
  audioLevel: number
  completionEvent: AtlasOrbCompletionEvent | null
  onActivate: () => void
}

export function AtlasOrbVisual({
  state,
  label,
  stateDescription,
  audioLevel,
  completionEvent,
  onActivate,
}: AtlasOrbVisualProps) {
  const [rendererFailed, setRendererFailed] = useState(false)
  const handleRendererFailure = useCallback(() => setRendererFailed(true), [])

  return (
    <button
      type="button"
      className={styles.orbButton}
      data-state={state}
      data-renderer={rendererFailed ? 'fallback' : 'enhanced'}
      style={{ '--atlas-audio-level': audioLevel } as React.CSSProperties}
      onClick={onActivate}
      aria-label={label}
      aria-describedby="atlas-orb-state-description"
    >
      {!rendererFailed ? (
        <AtlasOrbCanvas
          state={state}
          audioLevel={audioLevel}
          completionEvent={completionEvent}
          onFailure={handleRendererFailure}
        />
      ) : null}
      <span className={styles.orbEnergyField} aria-hidden="true" />
      <span className={styles.orbHalo} aria-hidden="true" />
      <span className={styles.orbAxisHorizontal} aria-hidden="true" />
      <span className={styles.orbAxisVertical} aria-hidden="true" />
      <span className={styles.orbOrbitOuter} aria-hidden="true" />
      <span className={styles.orbOrbitInner} aria-hidden="true" />
      <span className={styles.orbOrbitTilted} aria-hidden="true" />
      <span className={styles.orbParticleField} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className={styles.orbGlass}>
        <span className={styles.orbReflection} aria-hidden="true" />
        <span className={styles.orbCore} aria-hidden="true" />
        <span className={styles.orbMark}>
          <OmniraMark size={120} />
        </span>
      </span>
      <span id="atlas-orb-state-description" className={styles.visuallyHidden}>
        Atlas status: {stateDescription}.
      </span>
    </button>
  )
}
