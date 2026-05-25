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

const OUTRO_FRAMES      = 75  // 2.5s branded end-card
const TRANSITION_FRAMES = 22  // 0.73s cross-dissolve between scenes

// ─── Multi-scene background ───────────────────────────────────────────────────

/**
 * MultiSceneBackground — cinematic scene progression with cross-dissolve transitions.
 *
 * Supports 1–5 images. Each scene gets:
 *   - Smooth cross-dissolve fade (TRANSITION_FRAMES)
 *   - Subtle Ken Burns zoom, alternating direction per scene (4% scale shift)
 *
 * Falls back to dark gradient when no images are provided.
 */
function MultiSceneBackground({
  images,
  totalFrames,
  outroFrames,
}: {
  images: string[]
  totalFrames: number
  outroFrames: number
}) {
  const frame = useCurrentFrame()
  const contentFrames = totalFrames - outroFrames

  if (!images || images.length === 0) {
    return (
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse at 30% 35%, #1e1b4b 0%, #07080f 70%)' }}
      />
    )
  }

  const n = images.length
  const sceneDuration = contentFrames / n
  const HALF_T = TRANSITION_FRAMES / 2

  return (
    <AbsoluteFill>
      {images.map((url, i) => {
        const sceneStart = i * sceneDuration
        const sceneEnd   = (i + 1) * sceneDuration

        // ── Cross-dissolve opacity ──────────────────────────────────────────
        let opacity: number
        if (n === 1) {
          opacity = 1
        } else if (i === 0) {
          // First: instant on from frame 0, dissolves out at boundary
          opacity = interpolate(
            frame,
            [sceneEnd - HALF_T, sceneEnd + HALF_T],
            [1, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          )
        } else if (i === n - 1) {
          // Last: dissolves in, stays visible through outro
          opacity = interpolate(
            frame,
            [sceneStart - HALF_T, sceneStart + HALF_T],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          )
        } else {
          // Middle: dissolve in → hold → dissolve out
          opacity = interpolate(
            frame,
            [
              sceneStart - HALF_T, sceneStart + HALF_T,
              sceneEnd   - HALF_T, sceneEnd   + HALF_T,
            ],
            [0, 1, 1, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          )
        }

        // ── Subtle Ken Burns — 4% zoom, alternating direction ──────────────
        // Even scenes: zoom in (1.00 → 1.04), odd scenes: zoom out (1.04 → 1.00)
        const zoomFrom = i % 2 === 0 ? 1.00 : 1.04
        const zoomTo   = i % 2 === 0 ? 1.04 : 1.00
        const scale = interpolate(
          frame,
          [sceneStart, sceneEnd],
          [zoomFrom, zoomTo],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )

        return (
          <AbsoluteFill key={i} style={{ opacity }}>
            <Img
              src={url}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
              }}
            />
          </AbsoluteFill>
        )
      })}

      {/* Bottom gradient — caption readability */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(4,4,8,0.92) 0%, rgba(4,4,8,0.45) 30%, rgba(4,4,8,0.10) 55%, transparent 75%)',
        }}
      />
      {/* Top vignette — subtle darkening */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to bottom, rgba(4,4,8,0.38) 0%, transparent 28%)',
        }}
      />
    </AbsoluteFill>
  )
}

// ─── Logo outro ───────────────────────────────────────────────────────────────

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
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div style={{ width: 220, marginBottom: 16 }}>
          <div style={{ height: 3, background: 'white', borderRadius: 2, marginBottom: 3 }} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
        </div>
        <p style={{
          margin: 0, fontSize: 64, fontWeight: 800,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
          color: '#ffffff', letterSpacing: '0.20em', lineHeight: 1,
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          textShadow: '0 0 40px rgba(255,255,255,0.15)',
        }}>
          THE PROMPT
        </p>
        <div style={{ width: 220, marginTop: 16 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 1, marginBottom: 3 }} />
          <div style={{ height: 3, background: 'white', borderRadius: 2 }} />
        </div>
        <p style={{
          margin: 0, marginTop: 24, fontSize: 22, fontWeight: 400,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          color: 'rgba(255,255,255,0.55)', letterSpacing: '0.10em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          AI news. Daily. No fluff.
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ─── Main composition ─────────────────────────────────────────────────────────

/**
 * SimpleNewsReel — premium cinematic 9:16 editorial composition.
 *
 * Design principles (Bloomberg QuickTake / documentary):
 * - Instant immersion: image + voice + captions from frame 0
 * - NO hook overlay — captions ARE the hook from the first word
 * - Multi-scene: 1–5 images with smooth cross-dissolve + Ken Burns
 * - Branded logo outro at the end
 *
 * Layer order (bottom → top):
 *   1. Multi-scene background (cross-dissolve + Ken Burns per scene)
 *   2. Voice-over audio
 *   3. Background music (optional, very low volume)
 *   4. Caption overlay — from frame 0, editorial typography
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

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080f' }}>

      {/* ── Layer 1: Multi-scene background with cross-dissolve + Ken Burns ── */}
      <MultiSceneBackground
        images={images ?? []}
        totalFrames={durationInFrames}
        outroFrames={OUTRO_FRAMES}
      />

      {/* ── Layer 2: Voice-over ── */}
      <Audio src={audioUrl} />

      {/* ── Layer 3: Background music — atmospheric, very low volume ── */}
      {backgroundMusicUrl && (
        <Audio src={backgroundMusicUrl} volume={0.06} loop />
      )}

      {/* ── Layer 4: Captions — from frame 0, documentary-style ── */}
      <CaptionOverlay
        captions={captions}
        words={words}
        accentColor={accentColor}
      />

      {/* ── Layer 5: The Prompt watermark — subtle, bottom-right ── */}
      <Watermark fadeInFrame={0} maxOpacity={0.40} />

      {/* ── Layer 6: Logo outro — last 2.5s ── */}
      <Sequence from={durationInFrames - OUTRO_FRAMES} durationInFrames={OUTRO_FRAMES}>
        <LogoOutro durationFrames={OUTRO_FRAMES} />
      </Sequence>

    </AbsoluteFill>
  )
}
