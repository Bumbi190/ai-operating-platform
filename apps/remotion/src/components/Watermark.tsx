import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

interface WatermarkProps {
  /** Delay before fading in — default 30 frames (1s) so it doesn't clash with hook */
  fadeInFrame?: number
  /** Opacity at full visibility — default 0.55 (subtle, not distracting) */
  maxOpacity?: number
}

/**
 * Watermark — "THE PROMPT" editorial logo, bottom-right corner.
 *
 * Design principles:
 * - Fades in after hook period so it doesn't fight for attention at the start
 * - Semi-transparent: present but never dominant
 * - Matches the editorial visual language (thin rules + bold condensed type)
 * - Pure CSS/SVG — no external assets needed in Lambda
 */
export function Watermark({ fadeInFrame = 30, maxOpacity = 0.55 }: WatermarkProps) {
  const frame = useCurrentFrame()

  const opacity = interpolate(
    frame,
    [fadeInFrame, fadeInFrame + 20],
    [0, maxOpacity],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        paddingBottom: 52,
        paddingRight: 36,
        pointerEvents: 'none',
      }}
    >
      <div style={{ opacity }}>
        {/* Top rule */}
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginBottom: 6,
        }}>
          <div style={{ height: 2, background: 'white', borderRadius: 1 }} />
          <div style={{ height: 0.7, background: 'white', borderRadius: 1 }} />
        </div>

        {/* Wordmark */}
        <p style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Arial Narrow", Arial, sans-serif',
          color: 'white',
          letterSpacing: '0.18em',
          lineHeight: 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          THE PROMPT
        </p>

        {/* Bottom rule */}
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginTop: 6,
        }}>
          <div style={{ height: 0.7, background: 'white', borderRadius: 1 }} />
          <div style={{ height: 2, background: 'white', borderRadius: 1 }} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
