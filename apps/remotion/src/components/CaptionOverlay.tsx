import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CaptionGroup, WordTiming } from '../lib/types'

interface Props {
  captions: CaptionGroup[]
  /** Individual word timing — enables per-word highlight synced to Victoria's voice */
  words?: WordTiming[]
  accentColor?: string
  /**
   * Suppress captions before this absolute frame (hook period).
   * NOTE: Must NOT be wrapped in <Sequence> — uses global useCurrentFrame().
   */
  hideBeforeFrame?: number
}

const FADE_FRAMES = 6

/**
 * Warm documentary gold — the highlighted word color.
 * Not flashy, not neon. Reads clean on dark backgrounds.
 * Reference: Bloomberg QuickTake word-tracking, Apple Keynote captions.
 */
const HIGHLIGHT_COLOR = '#FFD060'
const HIGHLIGHT_GLOW  = 'rgba(255, 208, 96, 0.35)'

/**
 * Strip punctuation for word comparison.
 * Handles: "significant." → "significant", "AI," → "ai"
 */
function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '')
}

/**
 * CaptionOverlay — premium word-level highlighting synced to voice.
 *
 * Design principles:
 * - Word groups (4–8 words) — never single word karaoke
 * - Currently spoken word: warm gold (#FFD060) with subtle glow
 * - Unspoken words in group: near-white (92% opacity)
 * - Glass backdrop: refined pill, faint border, deep blur
 * - Entry: 6-frame fade + 8px upward slide — imperceptible, not animated-feeling
 * - Typography: SF Pro Display / Helvetica — neutral, documentary
 */
export function CaptionOverlay({ captions, words = [], hideBeforeFrame = 0 }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (frame < hideBeforeFrame) return null

  const active = captions.find(c => frame >= c.startFrame && frame < c.endFrame)
  if (!active) return null

  // Convert current frame to milliseconds for word timing lookup
  const frameMs = (frame / fps) * 1000

  // Find the word Victoria is currently speaking
  const activeWord = words.find(w => frameMs >= w.startMs && frameMs <= w.endMs)
  const activeWordNorm = activeWord ? normalizeWord(activeWord.word) : null

  // Caption fade in/out at boundaries
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

  // Subtle 8px upward entry — not noticeable as animation, just polish
  const translateY = interpolate(
    frame,
    [active.startFrame, active.startFrame + FADE_FRAMES],
    [8, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Split text into word tokens (preserve spaces separately for proper rendering)
  const tokens = active.text.split(/(\s+)/)

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 164,
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: 'center',
          maxWidth: 860,
        }}
      >
        {/* Premium glass backdrop — refined from frosted panel to editorial pill */}
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(4, 4, 8, 0.52)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 18,
            // Faint luminous border — premium glass material feel
            border: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: 20,
            paddingBottom: 22,
            paddingLeft: 34,
            paddingRight: 34,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 54,
              fontWeight: 700,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
              lineHeight: 1.30,
              letterSpacing: '-0.4px',
              // Base shadow for all words
              textShadow: '0 1px 10px rgba(0,0,0,0.65)',
            }}
          >
            {tokens.map((token, i) => {
              // Preserve whitespace as-is
              if (/^\s+$/.test(token)) {
                return <span key={i}> </span>
              }

              const isActive =
                activeWordNorm !== null &&
                normalizeWord(token) === activeWordNorm

              return (
                <span
                  key={i}
                  style={{
                    // Active word: warm documentary gold with subtle ambient glow
                    // Inactive words: near-white, slightly dimmed for visual hierarchy
                    color: isActive ? HIGHLIGHT_COLOR : 'rgba(255, 255, 255, 0.88)',
                    textShadow: isActive
                      ? `0 0 22px ${HIGHLIGHT_GLOW}, 0 1px 10px rgba(0,0,0,0.65)`
                      : '0 1px 10px rgba(0,0,0,0.65)',
                    display: 'inline',
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
