import { describe, expect, it } from 'vitest'
import {
  centeringScrollLeft,
  nearestCardIndex,
  wrapIndex,
  type RailBox,
} from '@/lib/atlas/project-rail-geometry'

/**
 * ProjectRail centring contract.
 *
 * This suite exists because of a real, shipped failure: the rail measured cards
 * through their button, which is `position: absolute; inset: 0` inside the
 * relatively-positioned card, so `offsetLeft` was 0 for every card. Every
 * centring target collapsed to the same constant, selection moved and the rail
 * did not.
 *
 * The first test below is the one that would have caught it: distinct cards must
 * produce DISTINCT scroll targets. A test that only asserted "centerCard was
 * called" would have passed against the broken code.
 */

/** Four 720px cards, 28px apart, in a 1512px rail scrolled to the start. */
function railFixture(scrollLeft = 0) {
  const CARD = 720
  const GAP = 28
  const RAIL_WIDTH = 1512
  const PAD = (RAIL_WIDTH - CARD) / 2
  const rail: RailBox = { left: 0, width: RAIL_WIDTH }
  // Viewport-relative: as the rail scrolls right, card rects move left.
  const cards: RailBox[] = [0, 1, 2, 3].map((i) => ({
    left: PAD + i * (CARD + GAP) - scrollLeft,
    width: CARD,
  }))
  return {
    rail,
    cards,
    railScrollLeft: scrollLeft,
    railScrollWidth: PAD * 2 + 4 * CARD + 3 * GAP,
  }
}

describe('project rail · centring targets are per-card', () => {
  it('produces a DISTINCT scroll target for every card', () => {
    const f = railFixture()
    const targets = f.cards.map((card) =>
      centeringScrollLeft({
        railScrollLeft: f.railScrollLeft,
        railScrollWidth: f.railScrollWidth,
        rail: f.rail,
        card,
      }),
    )
    // The regression: all four collapsed to one value.
    expect(new Set(targets).size).toBe(4)
    // And they must increase left-to-right.
    expect(targets).toEqual([...targets].sort((a, b) => a - b))
  })

  it('centres the requested card, not merely some card', () => {
    const f = railFixture()
    for (const [index, card] of f.cards.entries()) {
      const left = centeringScrollLeft({
        railScrollLeft: f.railScrollLeft,
        railScrollWidth: f.railScrollWidth,
        rail: f.rail,
        card,
      })
      // After scrolling to `left`, that card's centre sits on the rail centre.
      const after = railFixture(left)
      const centre = after.cards[index].left + after.cards[index].width / 2
      expect(centre).toBeCloseTo(after.rail.left + after.rail.width / 2, 5)
    }
  })

  it('is a no-op for a card already centred', () => {
    const f = railFixture()
    const first = centeringScrollLeft({ ...f, card: f.cards[0] })
    expect(first).toBe(0)
  })

  it('never scrolls out of range', () => {
    const f = railFixture()
    const last = centeringScrollLeft({ ...f, card: f.cards[3] })
    expect(last).toBeGreaterThan(0)
    expect(last).toBeLessThanOrEqual(f.railScrollWidth - f.rail.width)
  })

  it('is independent of offsetParent — identical rects give identical targets', () => {
    // Rail translated 400px right; geometry is relative, so nothing changes.
    const a = railFixture()
    const shifted = {
      ...a,
      rail: { left: a.rail.left + 400, width: a.rail.width },
      cards: a.cards.map((c) => ({ left: c.left + 400, width: c.width })),
    }
    expect(centeringScrollLeft({ ...shifted, card: shifted.cards[2] }))
      .toBe(centeringScrollLeft({ ...a, card: a.cards[2] }))
  })
})

describe('project rail · selection N -> N+1 moves the rail', () => {
  it('each step to the next card yields a strictly larger target', () => {
    const f = railFixture()
    let previous = -1
    for (let n = 0; n < f.cards.length; n += 1) {
      const target = centeringScrollLeft({ ...f, card: f.cards[n] })
      expect(target).toBeGreaterThan(previous)
      previous = target
    }
  })

  it('a selected slug maps to that slug\'s centring target', () => {
    const slugs = ['ai-media-automation', 'familje-stunden', 'gainpilot', 'studieos']
    const f = railFixture()
    const bySlug = Object.fromEntries(
      slugs.map((slug, i) => [slug, centeringScrollLeft({ ...f, card: f.cards[i] })]),
    )
    // Every project must be reachable as a distinct centred position — the owner
    // report was that only one card could ever hold the centre.
    expect(new Set(Object.values(bySlug)).size).toBe(slugs.length)
    expect(bySlug['gainpilot']).toBeGreaterThan(bySlug['familje-stunden'])
    expect(bySlug['studieos']).toBeGreaterThan(bySlug['gainpilot'])
  })
})

describe('project rail · nearest-card resolution', () => {
  it('reports the centred card at each scroll position', () => {
    for (const index of [0, 1, 2, 3]) {
      const base = railFixture()
      const left = centeringScrollLeft({ ...base, card: base.cards[index] })
      const f = railFixture(left)
      expect(nearestCardIndex({ rail: f.rail, cards: f.cards, fallback: -1 })).toBe(index)
    }
  })

  it('falls back rather than snapping to 0 when nothing is measurable', () => {
    const f = railFixture()
    expect(nearestCardIndex({ rail: f.rail, cards: [null, null], fallback: 2 })).toBe(2)
    expect(nearestCardIndex({
      rail: f.rail,
      cards: [{ left: 0, width: 0 }],
      fallback: 3,
    })).toBe(3)
  })
})

describe('project rail · index wrapping', () => {
  it('cycles at both ends', () => {
    expect(wrapIndex(4, 4)).toBe(0)
    expect(wrapIndex(-1, 4)).toBe(3)
    expect(wrapIndex(5, 4)).toBe(1)
    expect(wrapIndex(0, 0)).toBe(0)
  })
})
