import Image from 'next/image'
import type { AtlasOrbState } from '@/lib/atlas/orb-state'
import styles from './AtlasHomeVNext.module.css'

/**
 * Atlas's face — the hero presence of Atlas Home.
 *
 * Geometry is measured, not estimated. The face asset (`public/atlas/
 * atlas-face.png`, 560×665, exported with the frozen design handoff) sits in
 * the canonical mockup at exactly 1:1 scale with its top-left at (650, 60).
 * Everything below is expressed in that mockup's canvas coordinates — the
 * 1299×926 area right of the sidebar and under the top bar — and the stage
 * scales those units to the viewport.
 *
 * The orbit is a tilted ellipse traced from the mockup. As in the mockup, the
 * ring is only ever seen OUTSIDE the head: the whole ellipse is drawn behind
 * the face, and only its nodes sit in front.
 *
 * STATE. `state` arrives already resolved from the runtime owner,
 * AtlasCommandCore. This component never computes or advances a state; in this
 * static pass it only exposes it as `data-state` for the styles.
 */

const ORBIT = { cx: 663, cy: 259, rx: 345, ry: 125, rotate: 14 }

function orbitPoint(degrees: number) {
  const t = (degrees * Math.PI) / 180
  const r = (ORBIT.rotate * Math.PI) / 180
  const x = ORBIT.rx * Math.cos(t)
  const y = ORBIT.ry * Math.sin(t)
  return {
    x: Math.round((ORBIT.cx + x * Math.cos(r) - y * Math.sin(r)) * 10) / 10,
    y: Math.round((ORBIT.cy + x * Math.sin(r) + y * Math.cos(r)) * 10) / 10,
  }
}

const LEFT_NODE = orbitPoint(150)
const RIGHT_NODE = orbitPoint(20)
const ORBIT_TRANSFORM = `rotate(${ORBIT.rotate} ${ORBIT.cx} ${ORBIT.cy})`
// Far (upper) and near (lower) halves of the same ellipse, in its own frame.
const FAR_ARC = `M ${ORBIT.cx - ORBIT.rx} ${ORBIT.cy} A ${ORBIT.rx} ${ORBIT.ry} 0 0 1 ${ORBIT.cx + ORBIT.rx} ${ORBIT.cy}`
const NEAR_ARC = `M ${ORBIT.cx + ORBIT.rx} ${ORBIT.cy} A ${ORBIT.rx} ${ORBIT.ry} 0 0 1 ${ORBIT.cx - ORBIT.rx} ${ORBIT.cy}`

/*
 * LOWER THIRD — TEMPORARY APPROXIMATION (owner ruling 2026-10-07).
 *
 * The face asset ends at the neck; the mockup continues into glowing neck,
 * shoulders and a central light beam down to the composer. Until a taller
 * master exists, these strokes are traced from the mockup's lower third
 * (stage y 494–760) so the composition can be judged. They are drawn BEHIND
 * the face, never over it, and change nothing about the face itself. Replace
 * this block when the new master lands.
 *
 * Mirrored about the face's true axis, x = 627 (forehead core and beam), not
 * the asset's box centre.
 */
const AXIS2 = 1254
// [path, strength 0..1]
const SHOULDER_LINES: Array<[string, number]> = [
  ['M 488 476 C 430 500, 330 540, 214 664', 1],
  ['M 500 500 C 446 522, 352 560, 250 676', 0.8],
  ['M 514 520 C 466 542, 384 578, 292 690', 0.7],
  ['M 528 538 C 488 560, 418 594, 340 700', 0.62],
  ['M 474 458 C 410 476, 300 512, 150 640', 0.55],
  ['M 544 556 C 512 578, 458 610, 392 708', 0.55],
  ['M 460 444 C 386 456, 268 484, 96 600', 0.38],
  ['M 558 572 C 536 596, 498 628, 446 712', 0.5],
]
// Small bright nodes along the shoulders, as in the mockup.
const SHOULDER_NODES: Array<[number, number, number]> = [
  [372, 600, 1.8], [300, 628, 1.4], [452, 556, 1.6], [250, 652, 1.2], [418, 640, 1.3],
]

// Fine filaments between the contour strokes: seeded, so server and client
// render the same mesh. Each fans from the neck toward the shoulder line.
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}
const FILAMENTS: Array<[string, number]> = (() => {
  const rand = seeded(0x5ad01d)
  const out: Array<[string, number]> = []
  for (let i = 0; i < 26; i++) {
    const t = i / 25
    const sx = 470 + t * 92 + rand() * 8
    const sy = 448 + t * 128 + rand() * 10
    const ex = 120 + t * 300 + rand() * 40
    const ey = 628 + t * 80 + rand() * 24
    // Bulging outward like the shoulder contours: first control runs out
    // nearly level, the second drops toward the end point.
    const c1x = sx - 60 - rand() * 40
    const c1y = sy + 14 + rand() * 16
    const c2x = ex + 70 + rand() * 50
    const c2y = ey - 90 - rand() * 30
    out.push([`M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`, 0.28 + rand() * 0.4])
  }
  return out
})()
const SPARKS: Array<[number, number, number, number]> = (() => {
  const rand = seeded(0x0a71a5)
  const out: Array<[number, number, number, number]> = []
  for (let i = 0; i < 46; i++) {
    const x = 180 + rand() * 400
    const y = 520 + rand() * 170 + (580 - x) * 0.12
    out.push([Math.round(x), Math.round(y), 0.6 + rand() * 1.3, 0.35 + rand() * 0.6])
  }
  return out
})()

function mirror(path: string) {
  return path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${AXIS2 - Number(x)} ${y}`)
}

export function AtlasFace({ state }: { state: AtlasOrbState }) {
  return (
    <div className={styles.faceStage} data-state={state} aria-hidden="true">
      <div className={styles.faceAura} />
      <div className={styles.faceNebula} />

      <svg className={styles.faceOrbitBack} viewBox="0 0 1299 926" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="atlas-orbit-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8b9cff" stopOpacity="0.85" />
            <stop offset="0.45" stopColor="#5ee7ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.8" />
          </linearGradient>
          <filter id="atlas-orbit-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="atlas-node-glow-back" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={ORBIT_TRANSFORM} filter="url(#atlas-orbit-glow)">
          <path d={FAR_ARC} fill="none" stroke="url(#atlas-orbit-stroke)" strokeWidth="1.3" opacity="0.72" />
          <path d={NEAR_ARC} fill="none" stroke="url(#atlas-orbit-stroke)" strokeWidth="1.3" opacity="0.6" />
        </g>
        <defs>
          <radialGradient id="atlas-torso-haze" cx="627" cy="640" r="440" gradientUnits="userSpaceOnUse" gradientTransform="translate(627 640) scale(1 0.32) translate(-627 -640)">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#1d6fd0" stopOpacity="0.18" />
            <stop offset="1" stopColor="#0b2a5a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="atlas-shoulder-left" gradientUnits="userSpaceOnUse" x1="560" y1="0" x2="120" y2="0">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.9" />
            <stop offset="0.6" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="atlas-shoulder-right" gradientUnits="userSpaceOnUse" x1="694" y1="0" x2="1134" y2="0">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.9" />
            <stop offset="0.6" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="atlas-beam" gradientUnits="userSpaceOnUse" x1="0" y1="540" x2="0" y2="690">
            <stop offset="0" stopColor="#e0fbff" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="#5ee7ff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className={styles.faceLowerThird}>
          <ellipse cx="627" cy="620" rx="470" ry="170" fill="url(#atlas-torso-haze)" />
          <g filter="url(#atlas-orbit-glow)">
            {FILAMENTS.map(([d, o], i) => (
              <g key={i} opacity={o}>
                <path d={d} fill="none" stroke="url(#atlas-shoulder-left)" strokeWidth="0.8" />
                <path d={mirror(d)} fill="none" stroke="url(#atlas-shoulder-right)" strokeWidth="0.8" />
              </g>
            ))}
          </g>
          {SPARKS.map(([x, y, r, o], i) => (
            <g key={i} opacity={o}>
              <circle cx={x} cy={y} r={r} fill="#a5f3fc" />
              <circle cx={AXIS2 - x} cy={y} r={r} fill={i % 3 === 0 ? '#c4b5fd' : '#a5f3fc'} />
            </g>
          ))}
          {SHOULDER_LINES.map(([d, strength], i) => (
            <g key={i} opacity={strength} filter="url(#atlas-orbit-glow)">
              <path d={d} fill="none" stroke="url(#atlas-shoulder-left)" strokeWidth={strength > 0.9 ? 2 : 1.3} />
              <path d={mirror(d)} fill="none" stroke="url(#atlas-shoulder-right)" strokeWidth={strength > 0.9 ? 2 : 1.3} />
            </g>
          ))}
          {SHOULDER_NODES.map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill="#bff4ff" />
              <circle cx={AXIS2 - x} cy={y} r={r} fill="#d8ccff" />
            </g>
          ))}
          <rect x="626" y="540" width="2" height="150" fill="url(#atlas-beam)" filter="url(#atlas-orbit-glow)" />
          <circle cx="627" cy="606" r="3.2" fill="#e0fbff" filter="url(#atlas-node-glow-back)" />
        </g>
      </svg>

      <div className={styles.faceImage}>
        <Image
          src="/atlas/atlas-face.png"
          alt=""
          fill
          priority
          unoptimized
          sizes="560px"
        />
      </div>

      <svg className={styles.faceOrbitFront} viewBox="0 0 1299 926" preserveAspectRatio="none" focusable="false">
        <defs>
          <radialGradient id="atlas-node-violet" cx="0.35" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#e0e7ff" />
            <stop offset="0.45" stopColor="#8b8cf6" />
            <stop offset="1" stopColor="#312e81" />
          </radialGradient>
          <radialGradient id="atlas-node-cyan" cx="0.35" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#e0fbff" />
            <stop offset="0.45" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0c3a66" />
          </radialGradient>
          <filter id="atlas-node-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g filter="url(#atlas-node-glow)">
          <circle cx={LEFT_NODE.x} cy={LEFT_NODE.y} r="11" fill="url(#atlas-node-violet)" stroke="#c7d2fe" strokeOpacity="0.75" strokeWidth="1" />
          <circle cx={RIGHT_NODE.x} cy={RIGHT_NODE.y} r="15" fill="url(#atlas-node-cyan)" stroke="#a5f3fc" strokeOpacity="0.8" strokeWidth="1" />
          <circle cx="926" cy="317" r="3.4" fill="#c4b5fd" />
        </g>
      </svg>
    </div>
  )
}
