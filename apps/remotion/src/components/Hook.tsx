import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

interface Props {
  text: string
  accentColor: string
  // Hook shows for the first ~90 frames (3s at 30fps), then fades out
  durationFrames?: number
}

/**
 * Animated hook text — the first 3 seconds of the video.
 * Bold, centered, slides up with a spring + fades out before subtitle track starts.
 */
export function Hook({ text, accentColor, durationFrames = 90 }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Slide up + fade in
  const slideUp = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  })

  const translateY = interpolate(slideUp, [0, 1], [60, 0])
  const opacity = interpolate(frame, [0, 10, durationFrames - 15, durationFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  if (frame > durationFrames) return null

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 60px',
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: 'center',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            width: 48,
            height: 4,
            borderRadius: 2,
            backgroundColor: accentColor,
            margin: '0 auto 28px',
          }}
        />
        <p
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.1,
            letterSpacing: '-1px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            textShadow: '0 2px 40px rgba(0,0,0,0.6)',
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  )
}
