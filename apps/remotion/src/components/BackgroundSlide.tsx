import React from 'react'
import { AbsoluteFill, Img, interpolate } from 'remotion'

interface Props {
  imageUrl: string
  /** Frame within this slide's local timeline (0 = slide start) */
  localFrame: number
  /** Total frames for this slide (including overlap) */
  duration: number
  /** Scene index — used to pick a varied motion profile */
  sceneIndex: number
  /** How many frames to fade in/out at boundaries */
  fadeFrames?: number
}

/**
 * Motion profiles for Ken Burns effect.
 * Alternating zoom/pan directions give the "editorial photography" feel —
 * no two consecutive scenes have identical motion.
 */
const MOTION_PROFILES = [
  // 0: Zoom in, drift up        — establish, expansive
  { zoomFrom: 1.00, zoomTo: 1.07, panXFrom:   0, panXTo:   0, panYFrom:   0, panYTo: -18 },
  // 1: Zoom out, drift right    — reveal, spacious
  { zoomFrom: 1.06, zoomTo: 1.00, panXFrom:   0, panXTo:  14, panYFrom:   0, panYTo:   0 },
  // 2: Zoom in, drift down-left — detail, intimate
  { zoomFrom: 1.00, zoomTo: 1.08, panXFrom:   0, panXTo:  -8, panYFrom:   0, panYTo:  12 },
  // 3: Zoom out, drift left     — cinematic pull-back
  { zoomFrom: 1.07, zoomTo: 1.01, panXFrom:   8, panXTo:  -6, panYFrom:   0, panYTo:   0 },
  // 4: Zoom in, gentle drift up-right — payoff shot
  { zoomFrom: 1.00, zoomTo: 1.06, panXFrom:   0, panXTo:   6, panYFrom:   4, panYTo: -10 },
] as const

/**
 * BackgroundSlide — a single image scene with:
 * - Varied Ken Burns motion (per-scene profile, no two scenes look the same)
 * - Smooth cross-fade at start and end
 * - Cinematic vignette + bottom gradient overlay for caption readability
 */
export function BackgroundSlide({
  imageUrl,
  localFrame,
  duration,
  sceneIndex,
  fadeFrames = 20,
}: Props) {
  const profile = MOTION_PROFILES[sceneIndex % MOTION_PROFILES.length]

  // Cross-fade opacity — fade in at start, fade out at end
  const opacity = interpolate(
    localFrame,
    [0, fadeFrames, duration - fadeFrames, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Ken Burns zoom
  const scale = interpolate(
    localFrame,
    [0, duration],
    [profile.zoomFrom, profile.zoomTo],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Pan X
  const translateX = interpolate(
    localFrame,
    [0, duration],
    [profile.panXFrom, profile.panXTo],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Pan Y
  const translateY = interpolate(
    localFrame,
    [0, duration],
    [profile.panYFrom, profile.panYTo],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Image layer with Ken Burns transform */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        <Img
          src={imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Cinematic overlays:
          1. Radial vignette — darkens edges, focuses eye to center
          2. Top gradient — subtle header dark band (optional status bar feel)
          3. Bottom gradient — ensures caption readability */}
      <AbsoluteFill
        style={{
          background: [
            // Vignette
            'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.52) 100%)',
            // Top bar
            'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 18%)',
            // Bottom band for captions
            'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.60) 85%, rgba(0,0,0,0.80) 100%)',
          ].join(', '),
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  )
}
