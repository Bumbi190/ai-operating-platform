import { wrapIndex } from '@/lib/atlas/project-rail-geometry'

/**
 * Project Spiral — where each card sits.
 *
 * The formulas are taken from the frozen design prototype rather than invented:
 * cards are placed on a circle in angle-space around the selected one, and the
 * cosine of that angle drives depth, so the selected card is nearest and the
 * one opposite it is furthest. What the prototype hard-coded as pixel constants
 * is a `spread` here, because the same geometry has to hold at 1440px, at
 * 375px, and at every display scale without the composition clipping.
 *
 * Pure: no DOM, no clock, no React. The interesting properties — that exactly
 * one card is frontmost, that depth is symmetric, that nothing lands off-stage
 * at any spread — are all assertable directly.
 *
 * This module places cards. It does not decide WHICH cards exist (that is
 * `composeAtlasRailCards`), and it does not own any keyboard behaviour (that is
 * `resolveProjectRailKeyAction`).
 */

export interface SpiralSpread {
  /** Half-width of the horizontal sweep, in px. */
  x: number
  /** Half-height of the vertical sweep, in px. */
  y: number
}

export interface SpiralPlacement {
  /** Horizontal offset from the spine, in px. */
  x: number
  /** Vertical offset from centre, in px. */
  y: number
  /** 0.7 (furthest) … 1 (frontmost). */
  scale: number
  /** 0.32 (furthest) … 1 (frontmost). */
  opacity: number
  /** Paint order. Higher is nearer the viewer. */
  z: number
  /** 0 (furthest) … 1 (frontmost) — the raw depth the rest is derived from. */
  depth: number
  /** True for the single card at the front of the spiral. */
  focused: boolean
}

/**
 * The spread for a stage of a given width.
 *
 * Narrow viewports do not get the desktop sweep scaled down — they get a
 * shallower, more vertical composition, which is what keeps the cards readable
 * instead of merely smaller. The horizontal sweep collapses faster than the
 * vertical one, so the spiral leans toward a stacked spatial rail rather than
 * losing its depth entirely.
 */
export function spiralSpreadForWidth(width: number): SpiralSpread {
  if (width < 640) return { x: 46, y: 150 }
  if (width < 1024) return { x: 150, y: 180 }
  if (width < 1440) return { x: 240, y: 195 }
  return { x: 300, y: 200 }
}

/**
 * Where card `index` sits when `selectedIndex` is at the front.
 *
 * `count` of 1 is the degenerate case the angle maths cannot express — a single
 * card is simply centred and frontmost.
 */
export function spiralPlacement(
  index: number,
  selectedIndex: number,
  count: number,
  spread: SpiralSpread,
): SpiralPlacement {
  if (count <= 1) {
    return { x: 0, y: 0, scale: 1, opacity: 1, z: 200, depth: 1, focused: index === 0 }
  }

  const step = (Math.PI * 2) / count
  // Angle relative to the front of the spiral, normalised to (-π, π] so the
  // vertical offset is continuous as the selection wraps around the circle.
  const raw = (index - selectedIndex) * step
  const theta = Math.atan2(Math.sin(raw), Math.cos(raw))
  const cos = Math.cos(theta)
  // 0 at the back, 1 at the front.
  const depth = (cos + 1) / 2

  return {
    x: Math.round(Math.sin(theta) * spread.x),
    y: Math.round((theta / Math.PI) * spread.y),
    scale: round3(0.7 + 0.3 * depth),
    opacity: round3(0.32 + 0.68 * depth),
    z: Math.round(cos * 100) + 100,
    depth: round3(depth),
    focused: wrapIndex(index, count) === wrapIndex(selectedIndex, count),
  }
}

/** Every card's placement, in card order. */
export function spiralPlacements(
  count: number,
  selectedIndex: number,
  spread: SpiralSpread,
): SpiralPlacement[] {
  return Array.from({ length: count }, (_, index) =>
    spiralPlacement(index, selectedIndex, count, spread))
}

/**
 * The luminous spine behind the cards.
 *
 * Ring positions and sizes come from the prototype. Kept here rather than in
 * CSS so the drift durations stay data — a stylesheet cannot express "each ring
 * slower than the last" without seven hand-written rules that can drift apart.
 */
export interface SpineRing {
  /** Vertical position as a percentage of the stage. */
  top: number
  /** Ellipse width and height, in px. */
  width: number
  height: number
  opacity: number
  /** Drift duration in seconds. Ignored entirely under reduced motion. */
  durationSeconds: number
}

const RING_TOPS = [10, 24, 38, 52, 66, 80, 92] as const

export function spineRings(): SpineRing[] {
  return RING_TOPS.map((top, index) => ({
    top,
    width: 220 + (index % 3) * 90,
    height: 44 + (index % 3) * 18,
    opacity: round3(0.12 + (index % 2) * 0.1),
    durationSeconds: round3(9 + index * 2.5),
  }))
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
