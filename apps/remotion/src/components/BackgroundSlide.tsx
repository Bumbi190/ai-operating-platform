import React from 'react'
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion'

interface Props {
  imageUrl: string
  /** Frame within this slide's local timeline (0 = slide start) */
  localFrame: number
  /** Total frames for this slide */
  duration: number
  /** How many frames to fade in/out */
  fadeFrames?: number
}

/**
 * BackgroundSlide — a single image scene with Ken Burns zoom and cross-fade.
 *
 * Ken Burns: slow zoom 1.00 → 1.06 over the full slide duration.
 * Fade: fade-in over fadeFrames at start, fade-out over fadeFrames at end.
 */
export function BackgroundSlide({ imageUrl, localFrame, duration, fadeFrames = 18 }: Props) {
  // Cross-fade opacity
  const opacity = interpolate(
    localFrame,
    [0, fadeFrames, duration - fadeFrames, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Ken Burns: slow zoom from center
  const scale = interpolate(
    localFrame,
    [0, duration],
    [1.0, 1.06],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Subtle pan: drift slightly upward
  const translateY = interpolate(
    localFrame,
    [0, duration],
    [0, -20],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translateY(${translateY}px)`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        <Img
          src={imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      {/* Cinematic vignette + bottom gradient for caption readability */}
      <AbsoluteFill
        style={{
          background: [
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)',
            'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.75) 100%)',
          ].join(', '),
        }}
      />
    </AbsoluteFill>
  )
}
