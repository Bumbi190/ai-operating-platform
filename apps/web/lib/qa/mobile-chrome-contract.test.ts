import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Mobile floating-chrome contract.
 *
 * Two `position: fixed` controls sat in the same corner at the same z-index on
 * every page except /atlas:
 *
 *   AtlasMiniOrb      bottom-6 right-6 z-50   orb 52px   → 24-76px from each edge
 *   MobileRailToggle  bottom-5 right-5 z-50   h-11 44px  → 20-64px bottom, 20-140px right
 *
 * They overlapped in roughly 52x40px, and AtlasMiniOrb painted last. M1 makes
 * the orb desktop-only so MobileRailToggle owns that corner below lg.
 *
 * UPDATE: that only moved the collision rather than ending it. MobileRailToggle
 * is not mobile-only — it hides on desktop solely on /atlas?ui=vnext, and the
 * orb never renders on /atlas at all, so the two still shared the corner at
 * every desktop width. The orb is now stacked above the peek (see the derived
 * offsets in AtlasMiniOrb), which is why the assertions below pin the stack
 * constants instead of the original bottom-6/right-6 literals.
 *
 * These are source assertions — the geometry above is arithmetic from the
 * emitted CSS, not something a unit test can observe. They exist to stop the
 * responsive gate being dropped again, not to prove pixels.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const ORB = read('components/platform/os/AtlasMiniOrb.tsx')
const RAIL = read('components/platform/os/MobileRailToggle.tsx')

describe('mobile chrome · AtlasMiniOrb is desktop-only', () => {
  it('gates every fixed layer it renders on lg', () => {
    // Both the orb button and its conversation panel are `fixed`; if either
    // lost the gate the collision would come back for that layer alone.
    const fixedLayers = ORB.match(/'?fixed[^'"\n]*'?/g) ?? []
    expect(fixedLayers.length).toBeGreaterThanOrEqual(2)
    expect((ORB.match(/hidden lg:block/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('hides the orb container below lg', () => {
    // The offsets moved out of the class string into derived constants when the
    // launcher was stacked above the activity peek. The desktop-only gate —
    // which is what this test exists to protect — is unchanged.
    expect(ORB).toMatch(/className="hidden lg:block fixed z-50"/)
  })

  it('hides the conversation panel below lg', () => {
    expect(ORB).toContain("'hidden lg:block',")
  })

  it('keeps the desktop footprint, and anchors the geometry deliberately', () => {
    // M1 asserted the desktop geometry must not move, because M1 changed
    // visibility only. That geometry has since been moved ON PURPOSE: the
    // launcher shared the corner with the activity peek and overlapped it, so
    // the two are now a vertical stack. What M1 was really protecting — a
    // single 52px control, both fixed layers gated to desktop — still holds.
    expect(ORB).toContain('const MINI_SIZE = 52')
    expect(ORB).toContain('const LAUNCHER_BOTTOM = ACTIVITY_PEEK_BOTTOM + ACTIVITY_PEEK_HEIGHT + STACK_GAP')
    expect(ORB).toContain('const PANEL_BOTTOM = LAUNCHER_BOTTOM + MINI_SIZE + PANEL_GAP')
    // The old colliding offsets must not come back.
    expect(ORB).not.toContain('fixed bottom-6 right-6')
  })

  it('did not invent a mobile replacement', () => {
    // Nothing in this component may be visible below lg. A `lg:hidden` would be
    // a mobile-only branch — i.e. a replacement UI — which M1 explicitly forbids.
    expect(ORB).not.toMatch(/lg:hidden/)
    // And every fixed layer is gated, so none can render on its own below lg.
    // Counted inside quoted class strings only — prose mentioning "fixed" in a
    // comment is not a rendered layer, and matching it made this assertion lie.
    const fixedLayers = (ORB.match(/['"][^'"\n]*\bfixed\b/g) ?? []).length
    const gated = (ORB.match(/hidden lg:block/g) ?? []).length
    expect(fixedLayers).toBe(2)
    expect(gated).toBe(fixedLayers)
  })

  it('leaves the /atlas suppression in place', () => {
    expect(ORB).toContain("if (pathname === '/atlas') return null")
  })

  it('changes no component logic', () => {
    for (const token of ['useAtlas', 'handleOrbClick', 'panelOpen', 'AtlasOrb']) {
      expect(ORB).toContain(token)
    }
  })
})

describe('mobile chrome · MobileRailToggle is untouched', () => {
  it('still owns the bottom-right corner on mobile', () => {
    expect(RAIL).toContain('fixed z-50 bottom-5 right-5')
  })

  it('keeps its own desktop-rail suppression', () => {
    // It hides at lg only when the vNext desktop rail exists — unrelated to M1.
    expect(RAIL).toContain("atlasVNextHasDesktopRail ? 'lg:hidden' : ''")
  })

  it('is not gated on lg the way the orb now is', () => {
    expect(RAIL).not.toContain('hidden lg:block')
  })
})

describe('mobile chrome · M1 stayed in scope', () => {
  it('left the /chat route as it was', () => {
    // M1 is a global chrome fix and makes NO claim about /chat horizontal
    // overflow — that cause is still unidentified and belongs to later work.
    const chat = read('app/(platform)/chat/page.tsx')
    expect(chat).toContain('ExecutiveAssistant')
    expect(chat).toContain('ConversationList')
    expect(chat).toContain('max-w-2xl mx-auto w-full')
  })

  it('did not start M2 typography work', () => {
    const globals = read('app/globals.css')
    // The gradient-clip fix and the /system hero override belong to M2.
    expect(globals).toContain('-webkit-text-fill-color: transparent')
    expect(globals).toContain('font-size: clamp(40px, 5.2vw, 68px)')
  })
})
