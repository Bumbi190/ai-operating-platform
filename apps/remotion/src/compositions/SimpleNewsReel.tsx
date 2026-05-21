import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { CaptionOverlay } from '../components/CaptionOverlay'
import { Watermark } from '../components/Watermark'
import type { VideoInputProps } from '../lib/types'

const DEFAULT_HOOK_FRAMES = 135  // 4.5s at 30fps
const HOOK_FADE_IN_F      = 15
const HOOK_FADE_OUT_F     = 12

/**
 * HookOverlay — bold opening statement for first ~4s.
 * Same as ShortFormVideo but slightly larger for the single-image format.
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
    [20, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <AbsoluteFill
      style={{
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 56,
        paddingRight: 56,
        paddingTop: 120, // push hook text toward upper-center, above image headline
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: 'center',
          width: '100%',
          maxWidth: 900,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(4, 4, 8, 0.60)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.10)',
            paddingTop: 20,
            paddingBottom: 24,
            paddingLeft: 32,
            paddingRight: 32,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 52,
              fontWeight: 800,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
              color: '#ffffff',
              lineHeight: 1.25,
              letterSpacing: '-0.6px',
              textShadow: '0 2px 24px rgba(0,0,0,0.8)',
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
 * ImageBackground — single static image filling the 9:16 frame.
 * Subtle vignette overlay at bottom for caption readability.
 * Falls back to dark gradient if no image provided.
 */
function ImageBackground({ imageUrl }: { imageUrl?: string }) {
  if (!imageUrl) {
    return (
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at 30% 35%, #1e1b4b 0%, #07080f 70%)',
        }}
      />
    )
  }

  return (
    <AbsoluteFill>
      {/* Full-frame image — object-cover to fill 9:16 */}
      <Img
        src={imageUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />

      {/* Bottom gradient vignette — improves caption contrast */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(4,4,8,0.85) 0%, rgba(4,4,8,0.3) 35%, transparent 60%)',
        }}
      />

      {/* Top gradient — subtle darkening so hook text is readable */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to bottom, rgba(4,4,8,0.55) 0%, transparent 40%)',
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * SimpleNewsReel — single-image 9:16 short-form composition for The Prompt.
 *
 * Layer order (bottom → top):
 *   1. Static background image (full-frame, object-cover) + gradient overlays
 *   2. Voice-over audio
 *   3. Background music (optional, looped at low volume)
 *   4. Hook overlay — bold statement, centered, first ~4s
 *   5. Caption overlay — word-synced, bottom, after hook
 *   6. The Prompt watermark — bottom-right, fades in after hook
 *
 * Format: 1080×1920, 30fps, h264
 * Cost vs ShortFormVideo: ~5× cheaper (1 Ideogram call vs 5)
 */
export function SimpleNewsReel({
  hook,
  audioUrl,
  captions,
  words,
  images,
  accentColor = '#6366f1',
  hookDurationFrames: hookDurationFramesProp,
  backgroundMusicUrl,
}: VideoInputProps) {
  const { durationInFrames } = useVideoConfig()
  const hookDurationFrames = hookDurationFramesProp ?? DEFAULT_HOOK_FRAMES

  // Use first image only — this is the SimpleNewsReel format
  const imageUrl = images?.[0]

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080f' }}>

      {/* ── Layer 1: Static image background ── */}
      <ImageBackground imageUrl={imageUrl} />

      {/* ── Layer 2: Voice-over ── */}
      <Audio src={audioUrl} />

      {/* ── Layer 3: Background music — looped at low volume ── */}
      {backgroundMusicUrl && (
        <Audio src={backgroundMusicUrl} volume={0.07} loop />
      )}

      {/* ── Layer 4: Hook overlay ── */}
      <Sequence from={0} durationInFrames={hookDurationFrames}>
        <HookOverlay text={hook} durationFrames={hookDurationFrames} />
      </Sequence>

      {/* ── Layer 5: Captions — global frame ── */}
      <CaptionOverlay
        captions={captions}
        words={words}
        accentColor={accentColor}
        hideBeforeFrame={hookDurationFrames}
      />

      {/* ── Layer 6: The Prompt watermark ── */}
      <Watermark fadeInFrame={hookDurationFrames} maxOpacity={0.55} />

    </AbsoluteFill>
  )
}
