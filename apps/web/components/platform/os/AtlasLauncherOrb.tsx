'use client'

/**
 * AtlasLauncherOrb — the floating Atlas launcher, in vNext material.
 *
 * WHY THIS IS ITS OWN COMPONENT rather than a restyle of `AtlasOrb`:
 * `AtlasOrb` is the LEGACY orb and is still the centrepiece of the legacy Atlas
 * home (`AtlasVoiceHome`). Recolouring it would silently redesign that page,
 * which is out of scope. The launcher therefore gets its own presentation while
 * the legacy orb is left exactly as it is.
 *
 * The identity is not invented either: the crystal is the canonical Omnira
 * four-point mark, imported from `OmniraLogo` so the shape has one source of
 * truth. Only the material differs — dark glass and cyan energy instead of
 * chrome — which is what makes this read as Atlas rather than as a second logo.
 *
 * PRESENTATION ONLY. This component owns no runtime state, performs no
 * navigation and makes no decisions: it renders what it is given and calls
 * `onClick` straight through.
 */

import { cn } from '@/lib/utils'
import { OMNIRA_MARK_POINTS } from '@/components/platform/OmniraLogo'
import type { OrbPhase } from './AtlasOrb'
import styles from './AtlasLauncherOrb.module.css'

interface AtlasLauncherOrbProps {
  /** Voice phase the launcher already receives — drives the state ring only. */
  phase: OrbPhase
  onClick?: () => void
  /** Diameter in px. */
  size?: number
  /** Visible hover/focus label, also the accessible name. */
  label?: string
  /** Supplementary state text for assistive tech (e.g. "Talar…"). */
  stateDescription?: string
  className?: string
}

export function AtlasLauncherOrb({
  phase,
  onClick,
  size = 52,
  label = 'Öppna Atlas',
  stateDescription,
  className,
}: AtlasLauncherOrbProps) {
  const descriptionId = stateDescription ? 'atlas-launcher-state' : undefined

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={onClick}
        className={styles.launcher}
        style={{ width: size, height: size }}
        data-phase={phase}
        /* The accessible name matches the visible tooltip (WCAG "Label in
           Name"); the phase travels separately so it is announced without
           competing with the label. */
        aria-label={label}
        aria-describedby={descriptionId}
      >
        <span className={styles.aura} aria-hidden="true" />
        <span className={styles.stateRing} aria-hidden="true" />
        <span className={styles.sheen} aria-hidden="true" />

        <svg
          className={styles.crystal}
          width={Math.round(size * 0.46)}
          height={Math.round(size * 0.46)}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="atlas-launcher-crystal" x1="28%" y1="12%" x2="76%" y2="92%">
              <stop offset="0%" stopColor="var(--omnira-aqua-bright, #ecfeff)" stopOpacity="0.98" />
              <stop offset="42%" stopColor="var(--omnira-cyan-soft, #67e8f9)" stopOpacity="0.92" />
              <stop offset="100%" stopColor="var(--omnira-teal, #2dd4bf)" stopOpacity="0.72" />
            </linearGradient>
          </defs>

          {/* The canonical four-point crystal, cyan-lit. */}
          <polygon points={OMNIRA_MARK_POINTS} fill="url(#atlas-launcher-crystal)" />
          {/* Hairline edge — keeps the points crisp at 24px. */}
          <polygon
            points={OMNIRA_MARK_POINTS}
            fill="none"
            stroke="rgba(236,254,255,0.55)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <span className={styles.tooltip} role="presentation" aria-hidden="true">
        {label}
      </span>

      {stateDescription ? (
        <span id={descriptionId} className="sr-only">
          {stateDescription}
        </span>
      ) : null}
    </div>
  )
}
