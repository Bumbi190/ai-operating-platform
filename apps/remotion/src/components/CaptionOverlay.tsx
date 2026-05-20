import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { CaptionGroup } from '../lib/types'

interface Props {
  captions: CaptionGroup[]
  accentColor?: string
  /**
   * Suppress captions before this absolute frame (used to hide them during
   * the hook overlay period). Defaults to 0 (always show).
   *
   * NOTE: CaptionOverlay must NOT be wrapped in a <Sequence> — it uses the
   * global frame from useCurrentFrame() so that startFrame/endFrame values
   * built from word timing are correctly compared.
   */
  hideBeforeFrame?: number
}

const FADE_FRAMES = 8

/**
 * CaptionOverlay — sentence-level captions with clean fade-in/out.
 *
 * Design principles:
 * - Grouped captions (max 7 words) — never word-by-word
 * - Frosted semi-transparent backdrop pill for readability on any background
 * - Smooth 8-frame fade at sentence boundaries with subtle slide-up
 * - Positioned at lower third (paddingBottom 180px) — comfortable mobile read
 * - Pure white text, heavy weight
 */
export function CaptionOverlay({ captions, hideBeforeFrame = 0 }: Props) {
  // Use GLOBAL frame — do NOT wrap this component in <Sequence>
  const frame = useCurrentFrame()

  // Hide during hook period
  if (frame < hideBeforeFrame) return null

  // Find the active caption for this frame (using absolute frame numbers)
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

  // Subtle upward slide on fade-in only
  const translateY = interpolate(
    frame,
    [active.startFrame, active.startFrame + FADE_FRAMES],
    [14, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 180,
        paddingLeft: 52,
        paddingRight: 52,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: 'center',
          maxWidth: 900,
        }}
      >
        {/* Frosted backdrop — readability on any background */}
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(0, 0, 0, 0.52)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: 20,
            paddingTop: 20,
            paddingBottom: 22,
            paddingLeft: 36,
            paddingRight: 36,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 56,
              fontWeight: 800,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
              color: '#ffffff',
              lineHeight: 1.28,
              letterSpacing: '-0.3px',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          >
            {active.text}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  )
}
