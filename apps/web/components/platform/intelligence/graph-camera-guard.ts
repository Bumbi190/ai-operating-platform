import type { GraphOverlayInsets, GraphViewBox } from './graph-readability'

export interface CameraGuardRect { x: number; y: number; width: number; height: number }
export interface CameraGuardCircle { id: string; x: number; y: number; r: number }

export interface CameraGuardInput {
  candidate: GraphViewBox
  lastSafe: GraphViewBox
  viewport: { width: number; height: number }
  circles: readonly CameraGuardCircle[]
  overlayInsets?: GraphOverlayInsets
  chromeRects?: readonly CameraGuardRect[]
  /** Limits a correction so a bad gesture cannot jump the camera across the graph. */
  maxCorrectionPx?: number
}

export interface CameraGuardResult {
  view: GraphViewBox
  outcome: 'accepted' | 'corrected' | 'last-safe'
  translationPx: { x: number; y: number }
}

interface ProjectedCircle { id: string; x: number; y: number; rx: number; ry: number }
interface Offset { x: number; y: number }

/**
 * G-27: accept a manual camera only when every on-screen hit circle clears the
 * page chrome. A breadth-first boundary search finds the smallest translation;
 * if the bounded search cannot find one, the previous safe camera wins.
 */
export function guardManualCamera(input: CameraGuardInput): CameraGuardResult {
  const { candidate, lastSafe, viewport, circles } = input
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const rects = cameraGuardRects(viewport, input.overlayInsets, input.chromeRects)
  if (rects.length === 0 || circles.length === 0) {
    return { view: candidate, outcome: 'accepted', translationPx: { x: 0, y: 0 } }
  }
  const scaleX = width / Math.max(1, candidate.w)
  const scaleY = height / Math.max(1, candidate.h)
  const projected = circles.map(circle => ({
    id: circle.id,
    x: (circle.x - candidate.x) * scaleX,
    y: (circle.y - candidate.y) * scaleY,
    rx: circle.r * scaleX,
    ry: circle.r * scaleY,
  }))
  if (cameraConflicts(projected, rects, { x: 0, y: 0 }, viewport).length === 0) {
    return { view: candidate, outcome: 'accepted', translationPx: { x: 0, y: 0 } }
  }

  const limit = Math.max(44, input.maxCorrectionPx ?? Math.min(240, Math.min(width, height) * 0.36))
  const queue: Offset[] = [{ x: 0, y: 0 }]
  const seen = new Set(['0:0'])
  let attempts = 0
  while (queue.length > 0 && attempts < 512) {
    queue.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.y - b.y || a.x - b.x)
    const offset = queue.shift()!
    attempts += 1
    const conflicts = cameraConflicts(projected, rects, offset, viewport)
    if (conflicts.length === 0) {
      return {
        view: {
          ...candidate,
          x: candidate.x - offset.x / scaleX,
          y: candidate.y - offset.y / scaleY,
        },
        outcome: offset.x === 0 && offset.y === 0 ? 'accepted' : 'corrected',
        translationPx: offset,
      }
    }
    const { circle, rect } = conflicts[0]
    const gap = 1
    const moves = [
      { x: rect.x - (circle.x + offset.x + circle.rx) - gap, y: 0 },
      { x: rect.x + rect.width - (circle.x + offset.x - circle.rx) + gap, y: 0 },
      { x: 0, y: rect.y - (circle.y + offset.y + circle.ry) - gap },
      { x: 0, y: rect.y + rect.height - (circle.y + offset.y - circle.ry) + gap },
    ]
    for (const move of moves) {
      const next = { x: offset.x + move.x, y: offset.y + move.y }
      if (Math.abs(next.x) > limit || Math.abs(next.y) > limit) continue
      const key = `${Math.round(next.x * 100) / 100}:${Math.round(next.y * 100) / 100}`
      if (!seen.has(key)) {
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return { view: lastSafe, outcome: 'last-safe', translationPx: { x: 0, y: 0 } }
}

export function cameraViewIsSafe(
  view: GraphViewBox,
  viewport: { width: number; height: number },
  circles: readonly CameraGuardCircle[],
  overlayInsets?: GraphOverlayInsets,
  chromeRects?: readonly CameraGuardRect[],
): boolean {
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const scaleX = width / Math.max(1, view.w)
  const scaleY = height / Math.max(1, view.h)
  const projected = circles.map(circle => ({
    id: circle.id,
    x: (circle.x - view.x) * scaleX,
    y: (circle.y - view.y) * scaleY,
    rx: circle.r * scaleX,
    ry: circle.r * scaleY,
  }))
  return cameraConflicts(projected, cameraGuardRects(viewport, overlayInsets, chromeRects), { x: 0, y: 0 }, viewport).length === 0
}

function cameraGuardRects(
  viewport: { width: number; height: number },
  overlayInsets?: GraphOverlayInsets,
  chromeRects: readonly CameraGuardRect[] = [],
): CameraGuardRect[] {
  const top = Math.max(0, overlayInsets?.top ?? 0)
  const bottom = Math.max(0, overlayInsets?.bottom ?? 0)
  return [
    ...(top > 0 ? [{ x: 0, y: 0, width: viewport.width, height: top }] : []),
    ...(bottom > 0 ? [{ x: 0, y: viewport.height - bottom, width: viewport.width, height: bottom }] : []),
    ...chromeRects.filter(rect => rect.width > 0 && rect.height > 0),
  ]
}

function cameraConflicts(
  circles: readonly ProjectedCircle[],
  rects: readonly CameraGuardRect[],
  offset: Offset,
  viewport: { width: number; height: number },
): Array<{ circle: ProjectedCircle; rect: CameraGuardRect }> {
  const conflicts: Array<{ circle: ProjectedCircle; rect: CameraGuardRect }> = []
  for (const circle of circles) {
    const x = circle.x + offset.x
    const y = circle.y + offset.y
    if (x + circle.rx <= 0 || y + circle.ry <= 0 || x - circle.rx >= viewport.width || y - circle.ry >= viewport.height) continue
    for (const rect of rects) {
      const nearestX = Math.min(Math.max(x, rect.x), rect.x + rect.width)
      const nearestY = Math.min(Math.max(y, rect.y), rect.y + rect.height)
      const dx = (x - nearestX) / Math.max(0.001, circle.rx)
      const dy = (y - nearestY) / Math.max(0.001, circle.ry)
      if (dx * dx + dy * dy < 1) conflicts.push({ circle, rect })
    }
  }
  return conflicts.sort((a, b) => a.circle.id.localeCompare(b.circle.id)
    || a.rect.y - b.rect.y || a.rect.x - b.rect.x)
}
