import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CaptionGroup, WordTiming } from '../lib/types'

interface Props {
  captions: CaptionGroup[]
  words?: WordTiming[]
  accentColor?: string
  /** @deprecated — captions start from frame 0 */
  hideBeforeFrame?: number
}

const FADE_FRAMES = 12  // slightly slower fade = editorial calm

/**
 * Warm documentary amber — softer than pure yellow.
 * Closer to Bloomberg/Apple documentary palette.
 */
const HIGHLIGHT_COLOR = '#E8B93A'
const HIGHLIGHT_GLOW  = 'rgba(232, 185, 58, 0.20)'

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '')
}

/**
 * CaptionOverlay — premium editorial word-tracking captions.
 *
 * Design (Bloomberg QuickTake / Apple documentary):
 * - Lighter glass panel — 50% opacity, barely there
 * - Active word: warm amber, very subtle glow
 * - No border — clean integration with the image
 * - 1.40 line-height — editorial breathing room
 * - Calm fade (12 frames) — never jumpy
 * - Generous lower-third placement
 */
export function CaptionOverlay({ captions, words = [] }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const active = captions.find(c => frame >= c.startFrame && frame < c.endFrame)
  if (!active) return null

  const frameMs = (frame / fps) * 1000
  const activeWord = words.find(w => frameMs >= w.startMs && frameMs <= w.endMs)
  const activeWordNorm = activeWord ? normalizeWord(activeWord.word) : null

  // Calm editorial fade — robust to short captions.
  // A single 4-point range [start, start+F, end-F, end] breaks when the caption
  // is short enough that start+F >= end-F: Remotion's interpolate() requires a
  // STRICTLY increasing inputRange and throws otherwise (this crashed the whole
  // render on any caption ≤ 2*FADE_FRAMES long). Instead we fade in and out as
  // two independent 2-point ranges and take the minimum, clamping the fade
  // length to half the caption duration so the keyframes can never collide.
  const duration = Math.max(2, active.endFrame - active.startFrame)
  const fade = Math.max(1, Math.min(FADE_FRAMES, Math.floor(duration / 2)))
  const fadeIn = interpolate(
    frame,
    [active.startFrame, active.startFrame + fade],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const fadeOut = interpolate(
    frame,
    [active.endFrame - fade, active.endFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const opacity = Math.min(fadeIn, fadeOut)

  // Barely perceptible upward settle
  const translateY = interpolate(
    frame,
    [active.startFrame, active.startFrame + FADE_FRAMES],
    [5, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const tokens = active.text.split(/(\s+)/)

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 200,
        paddingLeft: 44,
        paddingRight: 44,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: 'center',
          maxWidth: 820,
        }}
      >
        {/* Lighter glass panel — integrated, not heavy */}
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(2, 2, 6, 0.50)',
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
            borderRadius: 14,
            paddingTop: 16,
            paddingBottom: 20,
            paddingLeft: 28,
            paddingRight: 28,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 62,   // +30% — mobil-först läsbarhet
              fontWeight: 700,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
              lineHeight: 1.40,
              letterSpacing: '-0.3px',
              textShadow: '0 1px 6px rgba(0,0,0,0.45)',
            }}
          >
            {tokens.map((token, i) => {
              if (/^\s+$/.test(token)) return <span key={i}> </span>

              const isActive =
                activeWordNorm !== null &&
                normalizeWord(token) === activeWordNorm

              return (
                <span
                  key={i}
                  style={{
                    color: isActive ? HIGHLIGHT_COLOR : 'rgba(255, 255, 255, 0.90)',
                    textShadow: isActive
                      ? `0 0 16px ${HIGHLIGHT_GLOW}, 0 1px 6px rgba(0,0,0,0.45)`
                      : '0 1px 6px rgba(0,0,0,0.45)',
                    display: 'inline',
                    fontWeight: isActive ? 700 : 600,
                  }}
                >
                  {token}
                </span>
              )
            })}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  )
}
