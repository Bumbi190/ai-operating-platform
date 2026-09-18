import { describe, expect, it } from 'vitest'
import type { GraphViewBox } from './graph-readability'
import { cameraViewIsSafe, guardManualCamera, type CameraGuardCircle } from './graph-camera-guard'

const viewport = { width: 1000, height: 700 }
const chrome = [
  { x: 12, y: 12, width: 300, height: 56 },
  { x: 760, y: 610, width: 228, height: 78 },
]
const circles: CameraGuardCircle[] = [
  { id: 'selected', x: 120, y: 40, r: 24 },
  { id: 'search-result', x: 860, y: 650, r: 22 },
  { id: 'ordinary', x: 500, y: 350, r: 22 },
]
const fitted: GraphViewBox = { x: 0, y: 0, w: 1000, h: 700 }

describe('T3b G-27 manual camera guard', () => {
  it('minimally translates a colliding candidate without changing its zoom', () => {
    const result = guardManualCamera({ candidate: fitted, lastSafe: { ...fitted, y: -100 }, viewport, circles, chromeRects: chrome })

    expect(result.outcome).toBe('corrected')
    expect(result.view.w).toBe(fitted.w)
    expect(result.view.h).toBe(fitted.h)
    expect(Math.hypot(result.translationPx.x, result.translationPx.y)).toBeGreaterThan(0)
    expect(cameraViewIsSafe(result.view, viewport, circles, undefined, chrome)).toBe(true)
  })

  it('keeps every accepted state safe through repeated pan and wheel-zoom candidates', () => {
    const original = structuredClone(circles)
    const candidates: GraphViewBox[] = [
      { x: -80, y: 0, w: 1000, h: 700 },
      { x: 80, y: 0, w: 1000, h: 700 },
      { x: 0, y: -70, w: 1000, h: 700 },
      { x: 0, y: 70, w: 1000, h: 700 },
      { x: 70, y: 35, w: 820, h: 574 },
      { x: -120, y: -84, w: 1200, h: 840 },
      { x: 35, y: 25, w: 700, h: 490 },
    ]
    let lastSafe = { x: -200, y: -140, w: 1000, h: 700 }
    for (const candidate of candidates) {
      const result = guardManualCamera({
        candidate,
        lastSafe,
        viewport,
        circles,
        overlayInsets: { top: 72, bottom: 64 },
        chromeRects: chrome,
      })
      expect(cameraViewIsSafe(result.view, viewport, circles, { top: 72, bottom: 64 }, chrome)).toBe(true)
      if (result.outcome !== 'last-safe') lastSafe = result.view
    }
    expect(circles).toEqual(original)
  })

  it('falls back to last-safe when no bounded translation can clear the chrome', () => {
    const lastSafe = { x: -1000, y: -700, w: 1000, h: 700 }
    const result = guardManualCamera({
      candidate: fitted,
      lastSafe,
      viewport,
      circles: [{ id: 'selected', x: 500, y: 350, r: 40 }],
      chromeRects: [{ x: 0, y: 0, width: 1000, height: 700 }],
      maxCorrectionPx: 44,
    })

    expect(result).toEqual({ view: lastSafe, outcome: 'last-safe', translationPx: { x: 0, y: 0 } })
  })

  it('is a no-op with no overlays or chrome', () => {
    expect(guardManualCamera({ candidate: fitted, lastSafe: { ...fitted, x: -1 }, viewport, circles }))
      .toEqual({ view: fitted, outcome: 'accepted', translationPx: { x: 0, y: 0 } })
  })
})
