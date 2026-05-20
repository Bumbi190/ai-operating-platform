import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { CaptionGroup } from '../lib/types'

interface Props {
  captions: CaptionGroup[]
  accentColor?: string
}

const FADE_FRAMES = 6

/**
 * CaptionOverlay — sentence-level captions with clean fade-in/out.
 *
 * Design principles:
 * - Max 2 lines, large readable text
 * - No word-by-word spam — full sentence shown at once
 * - Smooth 6-frame fade at sentence boundaries
 * - Positioned at 68% from top (lower-third, above the very bottom)
 * - Pure white text, heavy weight, drop-shadow for readability on any bg
 */
export function CaptionOverlay({ captions, accentColor = '#6366f1' }: Props) {
  const frame = useCurrentFrame()

  // Find the active caption for this frame
  const active = captions.find(c => frame >= c.startFrame && frame < c.endFrame)
  if (!active) return null

  // Fade in at start, fade out at end
  const opacity = interpolate(
    frame,
    [
      active.startFrame,
      active.startFrame + FADE_FRAMES,
      active.endFrame - FADE_FRAMES,
      active.endFrame,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Subtle upward slide on fade-in
  const translateY = interpolate(
    frame,
    [active.startFrame, active.startFrame + FADE_FRAMES],
    [12, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 160,
        paddingLeft: 56,
        paddingRight: 56,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: 'center',
          maxWidth: 880,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 58,
            fontWeight: 800,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
            color: '#ffffff',
            lineHeight: 1.25,
            letterSpacing: '-0.5px',
            textShadow: [
              '0 2px 20px rgba(0,0,0,0.9)',
              '0 1px 4px rgba(0,0,0,0.8)',
            ].join(', '),
          }}
        >
          {active.text}
        </p>
      </div>
    </AbsoluteFill>
  )
}
