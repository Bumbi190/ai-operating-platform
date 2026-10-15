import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The approved Overview/Messenger design supersedes the old desktop-only orb.
 * Pixel collision, 44px targets, viewport bounds and text-first opening are
 * exercised against the real components in atlas-overview-messenger.spec.ts.
 * Keep unrelated activity-rail and legacy-page contracts below unchanged.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const ORB = read('components/platform/os/AtlasMiniOrb.tsx')
const RAIL = read('components/platform/os/MobileRailToggle.tsx')

describe('mobile chrome · shared Atlas messenger', () => {
  it('preserves one shell state across hidden full-chat surfaces', () => {
    expect(ORB).toContain('useMiniChatState(atlas.deactivate)')
    expect(ORB).toContain("pathname === '/atlas'")
    expect(ORB).toContain("pathname === '/chat'")
    expect(ORB).toContain("pathname.startsWith('/chat/')")
    expect(ORB).toContain('hidden={hidden}')
  })

  it('opens the text panel through the shared state', () => {
    expect(ORB).toContain('onClick={state.openPanel}')
    expect(ORB).toContain('<AtlasMiniChatPanel')
    expect(ORB).not.toContain('hidden lg:block')
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
    // vNext Chat moved that body verbatim into ChatLegacy (`?ui=legacy`), so the
    // claim follows it there.
    const chat = read('app/(platform)/chat/ChatLegacy.tsx')
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
