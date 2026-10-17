import React from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'

/**
 * Creative previews only. No outbound calls, credentials, analytics,
 * automatic uploads or fabricated screenshots. Original project imagery
 * can be provided as optional imageUrls.
 */
export interface ContentGrowthReelProps {
  brand: 'familje-stunden' | 'the-prompt'
  imageUrls?: string[]
}
const PRESETS = {
  'familje-stunden': {
    eyebrow: 'FAMILJE-STUNDEN', badge: '3–7 ÅR',
    hook: 'Kvällens mysstund utan planering?',
    benefit: 'Sagor, pyssel och ljudsagor',
    detail: 'Ett nytt månadsäventyr med Nova & Pling.',
    cta: 'Prova gratis',
    subline: 'Skärmfri kvalitetstid tillsammans',
    color: '#F652A0', soft: '#FFE9F5', bg: '#241530',
  },
  'the-prompt': {
    eyebrow: 'THE PROMPT', badge: 'AI NEWS',
    hook: 'Vill du förstå AI på 30 sekunder?',
    benefit: 'Nyheter utan allt brus',
    detail: 'Det viktigaste inom AI. Kort och konkret.',
    cta: 'Följ The Prompt',
    subline: 'AI news. Daily. No fluff.',
    color: '#59DAF9', soft: '#DAF7FF', bg: '#071522',
  },
} as const

const tween = (frame: number, a: number, b: number, x: number, y: number) =>
  interpolate(frame, [a, b], [x, y], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

export function ContentGrowthReel({ brand, imageUrls = [] }: ContentGrowthReelProps) {
  const frame = useCurrentFrame()
  const p = PRESETS[brand]
  const family = brand === 'familje-stunden'
  // Crisp scene cuts: each of the three sequences owns the full frame.
  // Cross-fading both layers down at once created an empty-looking 3s seam.
  const start = frame < 90 ? 1 : 0
  const middle = frame >= 90 && frame < 255 ? 1 : 0
  const finish = frame >= 255 ? 1 : 0
  const float = Math.sin(frame / 12) * 17
  const outer = tween(frame, 0, 360, 0.96, 1.28)
  return (
    <AbsoluteFill style={{ backgroundColor: p.bg, color: 'white', overflow: 'hidden', fontFamily: 'Arial, sans-serif' }}>
      <AbsoluteFill style={{
        background: family
          ? 'radial-gradient(ellipse at 40% 30%,#79365f 0%,#241530 72%)'
          : 'radial-gradient(ellipse at 40% 30%,#16425b 0%,#071522 72%)',
      }}/>
      <div style={{
        position: 'absolute', top: -400, left: -185, width: 1440, height: 1440,
        borderRadius: 800, border: '5px solid ' + p.color + '55',
        transform: 'scale(' + outer + ') rotate(' + frame * 0.12 + 'deg)',
      }}/>
      <div style={{ position: 'absolute', top: 100, left: 70, color: p.soft, letterSpacing: 4, fontSize: 31, fontWeight: 900 }}>
        {p.eyebrow}
      </div>
      <div style={{
        position: 'absolute', top: 96, right: 65, borderRadius: 50,
        padding: '14px 23px', fontSize: 28, color: p.bg, backgroundColor: p.color, fontWeight: 900,
      }}>{p.badge}</div>

      <AbsoluteFill style={{ opacity: start }}>
        {family && imageUrls.length > 0 ? (
          <div style={{ position: 'absolute', top: 385, width: 1080, height: 650 }}>
            {imageUrls.slice(0, 2).map((src, i) => (
              <Img key={src} src={src.startsWith('/') ? staticFile(src) : src} style={{
                position: 'absolute', objectFit: 'contain',
                left: i === 0 ? 80 : 520, top: i === 0 ? 0 : 60,
                width: i === 0 ? 475 : 420, height: 620,
                filter: 'drop-shadow(0 25px 28px rgba(0,0,0,0.25))',
                transform: 'translateY(' + (float * (i === 0 ? 1 : -1)) + 'px) rotate(' + (Math.sin((frame + i * 10) / 19) * 2.5) + 'deg)',
              }}/>
            ))}
          </div>
        ) : (
          <div style={{
            position: 'absolute', top: 430, left: 200, width: 680, height: 590,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 100, border: '3px solid ' + p.color,
            background: 'linear-gradient(125deg,' + p.color + '44,transparent)',
            transform: 'translateY(' + float + 'px) rotate(' + (frame / 18 - 6) + 'deg)',
            fontSize: 235, fontWeight: 900, letterSpacing: -12,
          }}>{family ? '♥' : 'AI'}</div>
        )}
        <div style={{
          position: 'absolute', top: 1120, left: 70, width: 940, padding: '48px 44px',
          borderRadius: 40, border: '2px solid ' + p.color + '88',
          background: 'rgba(8,9,22,.8)',
          transform: 'translateY(' + tween(frame, 0, 21, 42, 0) + 'px) scale(' + tween(frame, 0, 21, 1.05, 1) + ')',
        }}>
          <div style={{
            height: 11, width: 80 + 800 * tween(frame, 0, 60, 0, 1),
            borderRadius: 25, background: p.color, marginBottom: 33,
          }}/>
          <div style={{ fontSize: 73, lineHeight: 1.12, fontWeight: 900, letterSpacing: -2 }}>
            {p.hook}
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: middle, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{
          width: 940, padding: '68px 54px', borderRadius: 42,
          background: 'rgba(0,0,0,.42)', border: '2px solid ' + p.color,
          transform: 'translateY(' + tween(frame, 92, 128, 65, 0) + 'px)',
        }}>
          <div style={{ color: p.color, fontWeight: 900, fontSize: 31, letterSpacing: 4, marginBottom: 34 }}>DET HÄR FÅR DU</div>
          <div style={{ fontWeight: 900, fontSize: 77, lineHeight: 1.14, marginBottom: 44 }}>{p.benefit}</div>
          <div style={{ color: p.soft, fontSize: 45, lineHeight: 1.35 }}>{p.detail}</div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: finish, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: 70, transform: 'scale(' + tween(frame, 255, 284, 0.9, 1) + ')' }}>
          <div style={{ fontSize: 47, marginBottom: 55, color: p.soft }}>{p.subline}</div>
          <div style={{
            padding: '43px 57px', borderRadius: 28, background: p.color,
            color: p.bg, fontSize: 69, fontWeight: 900,
            boxShadow: '0 12px 80px ' + p.color + '77',
          }}>{p.cta}</div>
        </div>
      </AbsoluteFill>
      <div style={{
        position: 'absolute', bottom: 54, left: 68, color: p.soft,
        fontSize: 24, letterSpacing: 2, opacity: .9,
      }}>KREATIVT UTKAST • EJ PUBLICERAT</div>
    </AbsoluteFill>
  )
}
