import React from 'react'
import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion' // eslint-disable-line @typescript-eslint/no-unused-vars
import { BackgroundSlide } from '../components/BackgroundSlide'
import { CaptionOverlay } from '../components/CaptionOverlay'
import type { VideoInputProps } from '../lib/types'

const DEFAULT_HOOK_FRAMES = 135  // 4.5s at 30fps — overridden by hookDurationFrames prop
const HOOK_FADE_IN_F      = 15   // frames
const HOOK_FADE_OUT_F     = 12   // frames
const SCENE_OVERLAP_F     = 20   // cross-fade overlap between scenes

/**
 * HookOverlay — bold opening statement, first HOOK_DURATION_S seconds.
 * Fades in from slightly below, fades out cleanly.
 */
function HookOverlay({ text, durationFrames }: { text: string; durationFrames: number }) {
  const frame = useCurrentFrame()

  const opacity = interpolate(
    frame,
    [0, HOOK_FADE_IN_F, durationFrames - HOOK_FADE_OUT_F, durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const translateY = interpolate(
    frame,
    [0, HOOK_FADE_IN_F],
    [16, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const scale = interpolate(
    frame,
    [0, HOOK_FADE_IN_F],
    [0.96, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 64,
        paddingRight: 64,
        paddingBottom: 80, // Slightly above center for visual balance
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale}) translateY(${translateY}px)`,
          textAlign: 'center',
        }}
      >
        {/* Dark backdrop behind hook for legibility */}
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 24,
            paddingTop: 28,
            paddingBottom: 32,
            paddingLeft: 48,
            paddingRight: 48,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 72,
              fontWeight: 900,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
              color: '#ffffff',
              lineHeight: 1.18,
              letterSpacing: '-1.5px',
              textShadow: '0 2px 24px rgba(0,0,0,0.7)',
            }}
          >
            {text}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  )
}

/**
 * Fallback gradient background — used when no images are provided.
 */
function GradientBackground({ accentColor }: { accentColor: string }) {
  const frame = useCurrentFrame()
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
 * Layer order (bottom → top):
 *   1. Background slides — cinematic images with Ken Burns + varied cross-fades
 *   2. Audio track
 *   3. Hook overlay — bold statement for first 4s, fades in/out
 *   4. Caption overlay — sentence-level captions with frosted backdrop
 *
 * Key fix: CaptionOverlay is NOT wrapped in <Sequence> — it uses global frame
 * so that caption startFrame/endFrame (built from word timing) are correct.
 * The hideBeforeFrame prop suppresses captions during the hook period.
 */
export function ShortFormVideo({
  hook,
  audioUrl,
  captions,
  images,
  accentColor = '#6366f1',
  hookDurationFrames: hookDurationFramesProp,
}: VideoInputProps) {
  const { durationInFrames } = useVideoConfig()
  const frame = useCurrentFrame()

  const hookDurationFrames = hookDurationFramesProp ?? DEFAULT_HOOK_FRAMES
  const hasImages = images && images.length > 0

  // Each scene gets equal screen time, extended by overlap for cross-fade
  const sceneDuration = hasImages
    ? Math.ceil(durationInFrames / images.length)
    : durationInFrames

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080f' }}>

      {/* ── Layer 1: Cinematic background scenes ── */}
      {hasImages ? (
        images.map((url, idx) => {
          const sceneStart = idx * sceneDuration
          // Start rendering the overlap period early for seamless cross-fade
          const renderStart = Math.max(0, sceneStart - SCENE_OVERLAP_F)
          const localFrame   = frame - renderStart
          // Each scene (except the first) gets extra OVERLAP frames at start for fade-in
          const localDuration = sceneDuration + (idx > 0 ? SCENE_OVERLAP_F : 0)

          // Skip scenes outside their rendering window
          if (frame < renderStart || frame >= sceneStart + sceneDuration) return null

          return (
            <BackgroundSlide
              key={idx}
              imageUrl={url}
              localFrame={localFrame}
              duration={localDuration}
              sceneIndex={idx}         // passed through for per-scene motion variety
              fadeFrames={SCENE_OVERLAP_F}
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

      {/* ── Layer 4: Captions — global frame, NOT wrapped in Sequence ── */}
      <CaptionOverlay
        captions={captions}
        words={words}
        accentColor={accentColor}
        hideBeforeFrame={hookDurationFrames}
      />

    </AbsoluteFill>
  )
}
