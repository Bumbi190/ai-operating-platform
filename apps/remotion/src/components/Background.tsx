import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

interface Props {
  accentColor: string
}

/**
 * Subtle animated gradient background.
 * Slow vertical drift + soft glow — gives motion without distraction.
 */
export function Background({ accentColor }: Props) {
  const frame = useCurrentFrame()

  // Very slow drift — nearly imperceptible but adds life
  const yShift = interpolate(frame, [0, 900], [0, -40], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0f', overflow: 'hidden' }}>
      {/* Ambient glow blobs */}
      <div
        style={{
          position: 'absolute',
          top: `${15 + yShift * 0.3}%`,
          left: '10%',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}22 0%, transparent 70%)`,
          filter: 'blur(80px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: `${10 + yShift * 0.2}%`,
          right: '5%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, #8b5cf622 0%, transparent 70%)`,
          filter: 'blur(100px)',
        }}
      />
      {/* Subtle grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          transform: `translateY(${yShift}px)`,
        }}
      />
    </AbsoluteFill>
  )
}
