import React from 'react'
import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion' // eslint-disable-line @typescript-eslint/no-unused-vars
import { BackgroundSlide } from '../components/BackgroundSlide'
import { CaptionOverlay } from '../components/CaptionOverlay'
import { Watermark } from '../components/Watermark'
import type { VideoInputProps } from '../lib/types'

const DEFAULT_HOOK_FRAMES = 135  // 4.5s at 30fps — overridden by hookDurationFrames prop
const HOOK_FADE_IN_F      = 15   // frames
const HOOK_FADE_OUT_F     = 12   // frames
const SCENE_OVERLAP_F     = 20   // cross-fade overlap between scenes
const OUTRO_FRAMES        = 75   // 2.5s branded logo end-card

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
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px) scale(${scale})`,
          textAlign: 'center',
          width: '100%',
          maxWidth: 860,
        }}
      >
        {/* Glass backdrop — same visual language as CaptionOverlay */}
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(4, 4, 8, 0.52)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 18,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: 24,
            paddingBottom: 28,
            paddingLeft: 36,
            paddingRight: 36,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 58,
              fontWeight: 800,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
              color: '#ffffff',
              lineHeight: 1.22,
              letterSpacing: '-0.8px',
              textShadow: '0 2px 20px rgba(0,0,0,0.7)',
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
 * LogoOutro — 2.5-second branded end-card.
 *
 * Fades in over a solid black background. Shows THE PROMPT wordmark
 * with double editorial rules above/below, plus the tagline.
 * Sits as the very last layer so it always plays at the end of every video.
 */
function LogoOutro({ durationFrames }: { durationFrames: number }) {
  const frame = useCurrentFrame()

  // Background fades to black over first 18 frames
  const bgOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Content fades in after bg is mostly settled
  const contentOpacity = interpolate(frame, [12, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Subtle scale-up on content entry
  const scale = interpolate(frame, [12, 32], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Fade out in final 10 frames
  const fadeOut = interpolate(
    frame,
    [durationFrames - 10, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const opacity = contentOpacity * fadeOut

  return (
    <AbsoluteFill>
      {/* Solid black background */}
      <AbsoluteFill style={{ backgroundColor: `rgba(4,4,8,${bgOpacity})` }} />

      {/* Centered brand mark */}
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        {/* Double rule — top */}
        <div style={{ width: 220, marginBottom: 16 }}>
          <div style={{ height: 3, background: 'white', borderRadius: 2, marginBottom: 3 }} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
        </div>

        {/* Wordmark */}
        <p style={{
          margin: 0,
          fontSize: 64,
          fontWeight: 800,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
          color: '#ffffff',
          letterSpacing: '0.20em',
          lineHeight: 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          textShadow: '0 0 40px rgba(255,255,255,0.15)',
        }}>
          THE PROMPT
        </p>

        {/* Double rule — bottom */}
        <div style={{ width: 220, marginTop: 16 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 1, marginBottom: 3 }} />
          <div style={{ height: 3, background: 'white', borderRadius: 2 }} />
        </div>

        {/* Tagline */}
        <p style={{
          margin: 0,
          marginTop: 24,
          fontSize: 22,
          fontWeight: 400,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          AI news. Daily. No fluff.
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
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
  words,
  images,
  sceneStartFrames,
  accentColor = '#6366f1',
  hookDurationFrames: hookDurationFramesProp,
  backgroundMusicUrl,
}: VideoInputProps) {
  const { durationInFrames } = useVideoConfig()
  const frame = useCurrentFrame()

  const hookDurationFrames = hookDurationFramesProp ?? DEFAULT_HOOK_FRAMES
  const hasImages = images && images.length > 0

  // Build per-scene timing: use sceneStartFrames if provided (synced to narration),
  // otherwise fall back to equal-time split.
  const equalDuration = hasImages ? Math.ceil(durationInFrames / images.length) : durationInFrames
  const sceneStarts: number[] = hasImages
    ? (sceneStartFrames && sceneStartFrames.length === images.length
        ? sceneStartFrames
        : images.map((_, i) => i * equalDuration))
    : []

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080f' }}>

      {/* ── Layer 1: Cinematic background scenes ── */}
      {hasImages ? (
        images.map((url, idx) => {
          const sceneStart = sceneStarts[idx]
          const sceneEnd   = idx < images.length - 1 ? sceneStarts[idx + 1] : durationInFrames
          const sceneDuration = sceneEnd - sceneStart

          // Start rendering slightly early to allow cross-fade overlap
          const renderStart   = Math.max(0, sceneStart - SCENE_OVERLAP_F)
          const localFrame    = frame - renderStart
          const localDuration = sceneDuration + (idx > 0 ? SCENE_OVERLAP_F : 0)

          // Skip scenes outside their rendering window
          if (frame < renderStart || frame >= sceneEnd) return null

          return (
            <BackgroundSlide
              key={idx}
              imageUrl={url}
              localFrame={localFrame}
              duration={localDuration}
              sceneIndex={idx}
              fadeFrames={SCENE_OVERLAP_F}
            />
          )
        })
      ) : (
        <GradientBackground accentColor={accentColor} />
      )}

      {/* ── Layer 2a: Background music — looped at low volume ── */}
      {backgroundMusicUrl && (
        <Audio src={backgroundMusicUrl} volume={0.08} loop />
      )}

      {/* ── Layer 2b: Voice-over ── */}
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
      />

      {/* ── Layer 5: The Prompt watermark — bottom-right, fades in after hook ── */}
      <Watermark fadeInFrame={hookDurationFrames} maxOpacity={0.55} />

      {/* ── Layer 6: Logo outro — last 2.5s, fades to black then shows brand mark ── */}
      <Sequence from={durationInFrames - OUTRO_FRAMES} durationInFrames={OUTRO_FRAMES}>
        <LogoOutro durationFrames={OUTRO_FRAMES} />
      </Sequence>

    </AbsoluteFill>
  )
}
