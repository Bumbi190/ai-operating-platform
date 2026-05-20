import React from 'react'
import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { BackgroundSlide } from '../components/BackgroundSlide'
import { CaptionOverlay } from '../components/CaptionOverlay'
import type { VideoInputProps } from '../lib/types'

const HOOK_DURATION_S = 4     // seconds the hook text is shown
const FADE_IN_FRAMES  = 15    // hook fade-in
const FADE_OUT_FRAMES = 12    // hook fade-out

/**
 * HookOverlay — large centered statement for the first HOOK_DURATION_S seconds.
 */
function HookOverlay({ text, durationFrames }: { text: string; durationFrames: number }) {
  const frame = useCurrentFrame()

  const opacity = interpolate(
    frame,
    [0, FADE_IN_FRAMES, durationFrames - FADE_OUT_FRAMES, durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const scale = interpolate(
    frame,
    [0, FADE_IN_FRAMES],
    [0.94, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 60,
        paddingRight: 60,
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
        <p
          style={{
            margin: 0,
            fontSize: 76,
            fontWeight: 900,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
            color: '#ffffff',
            lineHeight: 1.15,
            letterSpacing: '-1px',
            textShadow: [
              '0 4px 32px rgba(0,0,0,0.85)',
              '0 1px 6px rgba(0,0,0,0.9)',
            ].join(', '),
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  )
}

/**
 * Fallback gradient background — used when no images are provided.
 */
function GradientBackground({ accentColor }: { accentColor: string }) {
  const frame = useCurrentFrame()
  // Slow moving ambient glow
  const glow = interpolate(frame, [0, 120, 240], [0.3, 0.55, 0.3], {
    extrapolateRight: 'extend',
  })
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 40%, ${accentColor}${Math.round(glow * 255).toString(16).padStart(2, '0')} 0%, transparent 60%),
                     radial-gradient(ellipse at 70% 70%, #1e1b4b 0%, transparent 50%),
                     #07080f`,
      }}
    />
  )
}

/**
 * ShortFormVideo — premium 9:16 short-form composition.
 *
 * Structure:
 *   0–end:         Background slides (image per scene, Ken Burns + cross-fade)
 *   0–hookEnd:     HookOverlay (large centered text, fade-in/out)
 *   hookEnd–end:   CaptionOverlay (sentence-level captions, fade at boundaries)
 *   0–end:         Audio
 */
export function ShortFormVideo({
  hook,
  audioUrl,
  captions,
  images,
  accentColor = '#6366f1',
}: VideoInputProps) {
  const { fps, durationInFrames } = useVideoConfig()
  const frame = useCurrentFrame()
  const hookDurationFrames = Math.round(fps * HOOK_DURATION_S)

  // Distribute images evenly across the full video duration
  const hasImages = images && images.length > 0
  const sceneDuration = hasImages
    ? Math.ceil(durationInFrames / images.length)
    : durationInFrames

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080f' }}>

      {/* ── Layer 1: Background ── */}
      {hasImages ? (
        images.map((url, idx) => {
          const sceneStart = idx * sceneDuration
          // Overlap scenes by 18 frames so cross-fade is seamless
          const overlapStart = Math.max(0, sceneStart - 18)
          const localFrame = frame - overlapStart
          const localDuration = sceneDuration + (idx > 0 ? 18 : 0)

          if (frame < overlapStart || frame >= sceneStart + sceneDuration) return null

          return (
            <BackgroundSlide
              key={idx}
              imageUrl={url}
              localFrame={localFrame}
              duration={localDuration}
            />
          )
        })
      ) : (
        <GradientBackground accentColor={accentColor} />
      )}

      {/* ── Layer 2: Audio ── */}
      <Audio src={audioUrl} />

      {/* ── Layer 3: Hook (first HOOK_DURATION_S seconds) ── */}
      <Sequence from={0} durationInFrames={hookDurationFrames}>
        <HookOverlay text={hook} durationFrames={hookDurationFrames} />
      </Sequence>

      {/* ── Layer 4: Captions (after hook) ── */}
      <Sequence from={hookDurationFrames}>
        <CaptionOverlay captions={captions} accentColor={accentColor} />
      </Sequence>

    </AbsoluteFill>
  )
}
