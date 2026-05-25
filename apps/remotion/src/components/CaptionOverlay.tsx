import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CaptionGroup, WordTiming } from '../lib/types'

interface Props {
  captions: CaptionGroup[]
  words?: WordTiming[]
  accentColor?: string
  /** @deprecated — no longer used, captions start from frame 0 */
  hideBeforeFrame?: number
}

const FADE_FRAMES = 10  // slightly slower fade = more editorial, less karaoke

/**
 * Warm documentary amber — used for the currently-spoken word.
 * Subtle enough to feel editorial, distinct enough to track.
 */
const HIGHLIGHT_COLOR = '#F5C842'
const HIGHLIGHT_GLOW  = 'rgba(245, 200, 66, 0.25)'

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '')
}

/**
 * CaptionOverlay — premium editorial word-tracking captions.
 *
 * Design principles (Bloomberg QuickTake / documentary style):
 * - Clean, minimal glass panel — barely there, highly readable
 * - Active word: warm amber, very subtle glow — not a spotlight
 * - No borders on glass — cleaner, more integrated with image
 * - Generous line-height — editorial breathing room
 * - Slower fade (10 frames) — calm transitions, not jumpy
 * - Positioned in lower third, generous padding from edge
 */
export function CaptionOverlay({ captions, words = [] }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const active = captions.find(c => frame >= c.startFrame && frame < c.endFrame)
  if (!active) return null

  const frameMs = (frame / fps) * 1000
  const activeWord = words.find(w => frameMs >= w.startMs && frameMs <= w.endMs)
  const activeWordNorm = activeWord ? normalizeWord(activeWord.word) : null

  // Slow, calm fade — editorial not animated
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

  // Minimal upward slide — barely perceptible, just adds polish
  const translateY = interpolate(
    frame,
    [active.startFrame, active.startFrame + FADE_FRAMES],
    [6, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const tokens = active.text.split(/(\s+)/)

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 180,  // generous bottom spacing
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
        {/* Minimal glass panel — more subtle than before */}
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(2, 2, 6, 0.58)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 14,
            // No border — cleaner, more integrated with image
            paddingTop: 18,
            paddingBottom: 20,
            paddingLeft: 30,
            paddingRight: 30,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 50,
              fontWeight: 650,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
              lineHeight: 1.38,  // editorial breathing room
              letterSpacing: '-0.3px',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',  // subtle only
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
                    color: isActive ? HIGHLIGHT_COLOR : 'rgba(255, 255, 255, 0.92)',
                    textShadow: isActive
                      ? `0 0 18px ${HIGHLIGHT_GLOW}, 0 1px 8px rgba(0,0,0,0.5)`
                      : '0 1px 8px rgba(0,0,0,0.5)',
                    display: 'inline',
                    // Subtle weight boost on active word only
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
