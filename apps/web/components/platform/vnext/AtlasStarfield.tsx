/**
 * Atlas Home starfield — the deep-space field behind the face.
 *
 * Deterministic: a small seeded generator places every star, so server and
 * client render identical markup and the field never reshuffles between
 * visits. Static by design; nothing here animates.
 */

const FIELD_WIDTH = 1600
const FIELD_HEIGHT = 1000

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

interface Star { x: number; y: number; r: number; o: number; tint: string; glow: boolean }

const TINTS = ['#cfefff', '#9fdcff', '#7dd3fc', '#a5b4fc', '#5eead4']

function buildStars(): Star[] {
  const rand = seeded(0x0a71a5)
  const stars: Star[] = []
  for (let i = 0; i < 260; i++) {
    const glow = rand() < 0.07
    stars.push({
      x: Math.round(rand() * FIELD_WIDTH * 10) / 10,
      y: Math.round(rand() * FIELD_HEIGHT * 10) / 10,
      r: glow ? 1.1 + rand() * 0.9 : 0.35 + rand() * 0.7,
      o: glow ? 0.75 + rand() * 0.25 : 0.18 + rand() * 0.5,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
      glow,
    })
  }
  return stars
}

const STARS = buildStars()

export function AtlasStarfield({ className }: { className?: string }) {
  // One 1600×1000 tile in CSS pixels, repeated. Stars keep their size at every
  // viewport instead of being magnified with it.
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <defs>
        <filter id="atlas-star-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <pattern id="atlas-star-tile" width={FIELD_WIDTH} height={FIELD_HEIGHT} patternUnits="userSpaceOnUse">
          {STARS.map((star, index) => (
            <g key={index} opacity={star.o}>
              {star.glow ? (
                <circle cx={star.x} cy={star.y} r={star.r * 3.2} fill={star.tint} filter="url(#atlas-star-glow)" opacity={0.6} />
              ) : null}
              <circle cx={star.x} cy={star.y} r={star.r} fill={star.tint} />
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#atlas-star-tile)" />
    </svg>
  )
}
