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

const OUTRO_FRAMES = 75   // 2.5s branded logo end-card

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

      {/* Bottom gradient — improves caption contrast */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(4,4,8,0.92) 0%, rgba(4,4,8,0.45) 30%, rgba(4,4,8,0.10) 55%, transparent 75%)',
        }}
      />

      {/* Top vignette — subtle darkening */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to bottom, rgba(4,4,8,0.45) 0%, transparent 35%)',
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * LogoOutro — 2.5-second branded end-card.
 */
function LogoOutro({ durationFrames }: { durationFrames: number }) {
  const frame = useCurrentFrame()

  const bgOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const contentOpacity = interpolate(frame, [12, 32], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const scale = interpolate(frame, [12, 32], [0.92, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const fadeOut = interpolate(
    frame,
    [durationFrames - 10, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const opacity = contentOpacity * fadeOut

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(4,4,8,${bgOpacity})` }} />
      <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'center', opacity, transform: `scale(${scale})` }}>
        <div style={{ width: 220, marginBottom: 16 }}>
          <div style={{ height: 3, background: 'white', borderRadius: 2, marginBottom: 3 }} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
        </div>
        <p style={{ margin: 0, fontSize: 64, fontWeight: 800, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif', color: '#ffffff', letterSpacing: '0.20em', lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', textShadow: '0 0 40px rgba(255,255,255,0.15)' }}>
          THE PROMPT
        </p>
        <div style={{ width: 220, marginTop: 16 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 1, marginBottom: 3 }} />
          <div style={{ height: 3, background: 'white', borderRadius: 2 }} />
        </div>
        <p style={{ margin: 0, marginTop: 24, fontSize: 22, fontWeight: 400, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          AI news. Daily. No fluff.
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/**
 * SimpleNewsReel — instant-immersion 9:16 short-form composition.
 *
 * Editorial design principles:
 * - NO opening hook title — captions ARE the hook from frame 0
 * - Instant immersion: image + voice + captions visible within 0.5s
 * - Caption-first experience: premium documentary feel, not karaoke
 * - Logo outro at end for brand recall
 *
 * Layer order (bottom → top):
 *   1. Static background image + gradient overlays
 *   2. Voice-over audio
 *   3. Background music (optional)
 *   4. Caption overlay — from frame 0, premium typography
 *   5. The Prompt watermark — subtle, bottom-right
 *   6. Logo outro — last 2.5s
 */
export function SimpleNewsReel({
  audioUrl,
  captions,
  words,
  images,
  accentColor = '#6366f1',
  backgroundMusicUrl,
}: VideoInputProps) {
  const { durationInFrames } = useVideoConfig()

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

      {/* ── Layer 4: Captions — from frame 0, caption-first experience ── */}
      <CaptionOverlay
        captions={captions}
        words={words}
        accentColor={accentColor}
      />

      {/* ── Layer 5: The Prompt watermark — subtle, bottom-right ── */}
      <Watermark fadeInFrame={0} maxOpacity={0.45} />

      {/* ── Layer 6: Logo outro — last 2.5s ── */}
      <Sequence from={durationInFrames - OUTRO_FRAMES} durationInFrames={OUTRO_FRAMES}>
        <LogoOutro durationFrames={OUTRO_FRAMES} />
      </Sequence>

    </AbsoluteFill>
  )
}
