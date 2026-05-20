import React from 'react'
import { AbsoluteFill, Audio, useVideoConfig } from 'remotion'
import { Background } from '../components/Background'
import { Hook } from '../components/Hook'
import { SubtitleTrack } from '../components/SubtitleTrack'
import type { VideoInputProps } from '../lib/types'

/**
 * ShortFormVideo — 9:16 short-form video composition.
 *
 * Structure:
 *   0–90 frames (0–3s):    Hook text (bold centered statement)
 *   90–end:                Subtitle track synced to voiceover
 *   0–end:                 Background + Audio (full duration)
 */
export function ShortFormVideo({
  hook,
  audioUrl,
  words,
  caption,
  accentColor = '#6366f1',
}: VideoInputProps) {
  const { fps } = useVideoConfig()
  const hookDuration = Math.round(fps * 3)  // 3 seconds

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0f' }}>
      {/* Layer 1: Animated background */}
      <Background accentColor={accentColor} />

      {/* Layer 2: Audio track */}
      <Audio src={audioUrl} />

      {/* Layer 3: Hook (first 3 seconds) */}
      <Hook
        text={hook}
        accentColor={accentColor}
        durationFrames={hookDuration}
      />

      {/* Layer 4: Subtitle track (after hook) */}
      <SubtitleTrack
        words={words}
        accentColor={accentColor}
        startFrame={hookDuration}
      />

      {/* Layer 5: Caption overlay (bottom, always visible) */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 48,
        }}
      >
        <p
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 500,
            letterSpacing: '0.5px',
            textAlign: 'center',
            padding: '0 60px',
          }}
        >
          {caption}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
