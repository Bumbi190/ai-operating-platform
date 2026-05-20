import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { WordTiming } from '../lib/types'

interface Props {
  words: WordTiming[]
  accentColor: string
  startFrame?: number   // frame when subtitles begin (after hook)
}

/**
 * Word-by-word subtitle track synced to ElevenLabs word timing.
 *
 * Shows a rolling window of ~8 words.
 * The currently-speaking word is highlighted in the accent color.
 * Previous words appear dimmer. Upcoming words are hidden.
 */
export function SubtitleTrack({ words, accentColor, startFrame = 90 }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (frame < startFrame) return null

  // Convert frame to ms (relative to subtitle start)
  const elapsedMs = ((frame - startFrame) / fps) * 1000

  // Find current word index
  const currentIndex = words.findIndex(
    (w) => elapsedMs >= w.startMs && elapsedMs <= w.endMs,
  )

  // If between words, show last spoken word as current
  const activeIndex =
    currentIndex === -1
      ? words.findLastIndex((w) => elapsedMs > w.endMs)
      : currentIndex

  if (activeIndex < 0) return null

  // Show a window: 3 words before current + current + 4 after
  const windowStart = Math.max(0, activeIndex - 3)
  const windowEnd = Math.min(words.length - 1, activeIndex + 4)
  const visibleWords = words.slice(windowStart, windowEnd + 1)

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 140,
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0 16px',
          maxWidth: 900,
        }}
      >
        {visibleWords.map((w, i) => {
          const globalIndex = windowStart + i
          const isActive = globalIndex === activeIndex
          const isPast = globalIndex < activeIndex

          return (
            <span
              key={globalIndex}
              style={{
                fontSize: 52,
                fontWeight: isActive ? 800 : 600,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: isActive ? accentColor : isPast ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)',
                textShadow: isActive
                  ? `0 0 30px ${accentColor}66`
                  : '0 1px 8px rgba(0,0,0,0.6)',
                transition: 'color 0.1s',
                lineHeight: 1.4,
              }}
            >
              {w.word}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
