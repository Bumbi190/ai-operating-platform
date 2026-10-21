import React from 'react'
import {AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame} from 'remotion'

/**
 * Isolated, offline Familje-Stunden marketing preview (NOT a publisher).
 * Only the owner's canonical November assets may be staged and referenced.
 * New Nova/Pling speech is intentionally disabled pending identity/DSP proof.
 */
export interface FamilyNovemberTeaserProps extends Record<string, unknown> {
  heroImagePath?: 'content-studio-local/family-november/hero.png'
  activityImagePath?: 'content-studio-local/family-november/activity.png'
  musicPath?: 'content-studio-local/family-november/music-bed.wav'
}

const PINK = '#F652A0'
const GOLD = '#FAD28D'
const CREAM = '#FFF8F5'
const PLUM = '#230F29'
const safeFile = (path: string) => {
  if (!/^content-studio-local\/family-november\/(hero\.png|activity\.png|music-bed\.wav)$/.test(path)) {
    throw new Error('FAMILY_TEASER_ASSET_NOT_APPROVED: only locally staged canonical art is allowed')
  }
  return staticFile(path)
}
const motion = (frame: number, a: number, b: number, from: number, to: number) =>
  interpolate(frame, [a, b], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
const crossFade = (frame: number, a: number, b: number, c: number, d: number) =>
  interpolate(frame, [a, b, c, d], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})

function Photo({src, frame, offset, height = 690}: {src: string; frame: number; offset: number; height?: number}) {
  return (
    <div style={{
      position: 'absolute', top: 330, left: 63, width: 954, height, overflow: 'hidden',
      borderRadius: 44, boxShadow: '0 38px 110px rgba(10,0,14,.55)',
      border: '3px solid rgba(255,244,231,.78)',
      transform: 'scale(' + motion(frame, offset, offset + 135, 1.015, 1) + ')',
    }}>
      <Img src={safeFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 48%',
        transform: 'scale(' + motion(frame, offset, offset + 155, 1.06, 1.17) + ')',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg,transparent 70%,rgba(21,8,19,.33))',
      }} />
    </div>
  )
}

function Eyebrow({children}: {children: React.ReactNode}) {
  return <div style={{fontSize: 27, fontWeight: 800, letterSpacing: 3.5,
    color: GOLD, textTransform: 'uppercase', marginBottom: 22}}>{children}</div>
}

export function FamilyNovemberTeaser({
  heroImagePath,
  activityImagePath,
  musicPath,
}: FamilyNovemberTeaserProps) {
  const frame = useCurrentFrame()
  // Defaults are still hash-verified by the separate offline staging script.
  // Optional props keep Remotion's generic component contract compatible.
  const heroPath = heroImagePath ?? 'content-studio-local/family-november/hero.png'
  const activityPath = activityImagePath ?? 'content-studio-local/family-november/activity.png'
  const hero = safeFile(heroPath)
  safeFile(activityPath)
  const music = musicPath ? safeFile(musicPath) : null
  const firstOpacity = motion(frame, 122, 139, 1, 0)
  const secondOpacity = crossFade(frame, 125, 140, 286, 310)
  const finalOpacity = motion(frame, 296, 318, 0, 1)

  return (
    <AbsoluteFill style={{backgroundColor: PLUM, color: CREAM, overflow: 'hidden', fontFamily: 'Arial, sans-serif'}}>
      {music && <Audio src={music} volume={0.13}/>}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at 75% 25%,#653349 0%,#29152f 48%,#140c20 100%)',
      }}/>
      <div style={{
        position: 'absolute', width: 1200, height: 1200, borderRadius: '50%',
        border: '3px solid rgba(246,82,160,.23)', left: -550, top: -410,
        transform: 'scale(' + motion(frame, 0, 450, 1, 1.3) + ')',
      }}/>
      {Array.from({length: 13}, (_, i) => (
        <div key={i} style={{
          position: 'absolute', width: i % 3 === 0 ? 9 : 5, height: i % 3 === 0 ? 9 : 5,
          borderRadius: '50%', background: GOLD, opacity: .13 + i % 3 * .11,
          left: 85 + i * 137 % 930, top: 215 + i * 137 % 1180,
          transform: 'translateY(' + Math.sin(frame / 23 + i * .7) * 13 + 'px)',
        }}/>
      ))}

      <div style={{position: 'absolute', top: 96, left: 70, right: 70,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{fontSize: 30, fontWeight: 900, letterSpacing: 3.8}}>FAMILJE-STUNDEN</div>
        <div style={{
          padding: '13px 19px', borderRadius: 22, background: PINK, color: '#fff',
          fontSize: 23, fontWeight: 800, letterSpacing: 1,
        }}>SMYGTITT</div>
      </div>
      <div style={{
        position: 'absolute', top: 168, left: 72, right: 72, height: 4,
        borderRadius: 8, background: 'linear-gradient(90deg,#F652A0,#FAD28D,transparent)',
      }}/>

      <AbsoluteFill style={{opacity: firstOpacity}}>
        <Photo src={heroPath} frame={frame} offset={0} height={717}/>
        <div style={{position: 'absolute', top: 1120, left: 83, right: 90}}>
          <Eyebrow>NOVA & PLING ÄR TILLBAKA</Eyebrow>
          <div style={{fontSize: 91, lineHeight: 1.06, fontWeight: 900, letterSpacing: -3.9}}>
            Ett litet ljus.<br/><span style={{color: '#FFC3DD'}}>Ett stort äventyr.</span>
          </div>
          <div style={{fontSize: 34, marginTop: 35, lineHeight: 1.35}}>
            I november väntar nya magiska stunder tillsammans.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{opacity: secondOpacity}}>
        <Photo src={activityPath} frame={frame} offset={120} height={695}/>
        <div style={{position: 'absolute', top: 1122, left: 82, right: 82}}>
          <Eyebrow>FÖRHANDSTITT • NOVEMBER 2026</Eyebrow>
          <div style={{fontSize: 86, fontWeight: 900, letterSpacing: -4, lineHeight: 1.08}}>
            Följ Pling genom<br/><span style={{color: '#FFC3DD'}}>den magiska skogen.</span>
          </div>
          <div style={{fontSize: 34, marginTop: 34, lineHeight: 1.33}}>
            Upptäck en glimt av månadens lekar och äventyr.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{opacity: finalOpacity}}>
        <div style={{
          position: 'absolute', top: 338, left: 75, width: 930, height: 660,
          overflow: 'hidden', borderRadius: 48, border: '3px solid rgba(250,210,141,.8)',
        }}>
          <Img src={hero} style={{
            width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 48%',
            filter: 'brightness(.83)', transform: 'scale(' + motion(frame, 300, 450, 1.04, 1.13) + ')',
          }}/>
        </div>
        <div style={{position: 'absolute', top: 1085, left: 77, right: 77, textAlign: 'center'}}>
          <Eyebrow>MAGISKA LÄRSTUNDER HEMMA</Eyebrow>
          <div style={{fontSize: 93, fontWeight: 900, letterSpacing: -3.4, lineHeight: 1.08}}>
            Se fram emot<br/><span style={{color: '#FFC3DD'}}>november!</span>
          </div>
          <div style={{
            background: PINK, margin: '56px 42px 0', padding: '37px 24px',
            borderRadius: 27, fontWeight: 900, fontSize: 49,
            boxShadow: '0 20px 55px rgba(246,82,160,.25)',
          }}>Följ @familjestunden</div>
          <div style={{fontSize: 27, marginTop: 26, color: GOLD}}>
            För hela familjens mysiga stunder
          </div>
        </div>
      </AbsoluteFill>

      <div style={{
        position: 'absolute', left: 69, right: 69, bottom: 57, height: 3,
        background: 'rgba(255,241,225,.24)',
      }}>
        <div style={{height: '100%', width: Math.min(100, frame / 449 * 100) + '%', background: PINK}}/>
      </div>
      <div style={{
        position: 'absolute', left: 71, bottom: 17, fontSize: 18,
        fontWeight: 700, letterSpacing: 2, color: '#F6CBDF',
      }}>KREATIV FÖRHANDSVISNING • EJ PUBLICERAD</div>
    </AbsoluteFill>
  )
}
