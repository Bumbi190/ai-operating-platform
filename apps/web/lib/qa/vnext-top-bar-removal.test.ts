/**
 * vNext has no permanent top bar.
 *
 * The owner does not want the persistent top utility strip in the new UI. The
 * risk in a removal like this is not the removal — it is what quietly leaves
 * with it. `CommandBar` did not merely *display* ⌘K; it owned the global
 * keydown listener and was the only thing in the platform that mounted
 * `CommandPalette`. Dropping the bar without care would have deleted
 * jump-to-page, jump-to-project and "ask Atlas" along with the chrome.
 *
 * So the assertions here come in two halves: the bar is gone from vNext, and
 * the capability that was hiding inside it is not.
 *
 * Legacy is the rollback path until PR #82 merges, so its rendering must be
 * provably untouched.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const LAYOUT = read('app/(platform)/layout.tsx')
const BAR = read('components/platform/os/CommandBar.tsx')
const HOST = read('components/platform/os/CommandPaletteHost.tsx')
const PALETTE = read('components/platform/os/CommandPalette.tsx')
const GENERATION = read('lib/ui/generation.ts')

describe('generation split — the bar renders for legacy only', () => {
  it('branches on the generation the shell already resolved', () => {
    expect(LAYOUT).toContain('isVNext(uiGeneration) ? (')
    expect(LAYOUT).toContain('<CommandPaletteHost')
    expect(LAYOUT).toContain('<CommandBar')
  })

  it('puts CommandBar strictly inside the non-vNext branch', () => {
    // The bar and its sticky wrapper must live after the `:` of the ternary.
    const branch = LAYOUT.slice(LAYOUT.indexOf('isVNext(uiGeneration) ? ('))
    const [vnextArm, legacyArm] = branch.split(/\)\s*:\s*\(/)
    expect(vnextArm).toContain('CommandPaletteHost')
    expect(vnextArm).not.toContain('CommandBar')
    expect(legacyArm).toContain('CommandBar')
  })

  it('mounts the bar exactly once, so nothing renders it a second time', () => {
    expect((LAYOUT.match(/<CommandBar/g) ?? []).length).toBe(1)
  })

  it('uses the existing resolver rather than a second generation detector', () => {
    expect(LAYOUT).toContain("from '@/lib/ui/generation'")
    expect(LAYOUT).toContain('resolveUiGeneration')
    // No hand-rolled cookie/query sniffing for the generation in the layout.
    expect(LAYOUT).not.toMatch(/searchParams.*\bui\b.*===\s*['"]vnext/)
  })
})

describe('no leftover space where the bar was', () => {
  it('drops the sticky wrapper too, not just its contents', () => {
    // An empty `relative z-bar` band would still be a node in flow and could
    // intercept clicks; it exists only in the legacy arm.
    const branch = LAYOUT.slice(LAYOUT.indexOf('isVNext(uiGeneration) ? ('))
    const [vnextArm] = branch.split(/\)\s*:\s*\(/)
    expect(vnextArm).not.toContain('z-bar')
    expect((LAYOUT.match(/className="relative z-bar"/g) ?? []).length).toBe(1)
  })

  it('leaves no height reserved for a bar that is not there', () => {
    // The bar sat in normal flow, so nothing offset the canvas to clear it.
    // If any of these appear, removing the bar would open a blank band.
    for (const stale of ['calc(100vh - 48px)', 'calc(100vh - 3rem)', 'pt-12', 'top-12', 'mt-12']) {
      expect(LAYOUT, stale).not.toContain(stale)
    }
  })

  it('keeps the page canvas immediately after the command layer', () => {
    const canvasAt = LAYOUT.indexOf('relative z-content')
    const branchAt = LAYOUT.indexOf('isVNext(uiGeneration) ? (')
    expect(branchAt).toBeGreaterThan(0)
    expect(canvasAt).toBeGreaterThan(branchAt)
  })
})

describe('⌘K survives the bar', () => {
  it('the host owns the shortcut', () => {
    expect(HOST).toContain('(e.metaKey || e.ctrlKey)')
    expect(HOST).toMatch(/e\.key === 'k' \|\| e\.key === 'K'/)
    expect(HOST).toContain("window.addEventListener('keydown', onKey)")
    expect(HOST).toContain("window.removeEventListener('keydown', onKey)")
  })

  it('the host actually mounts the palette', () => {
    expect(HOST).toContain('<CommandPalette')
    expect(HOST).toContain('projects={projects}')
  })

  it('the host renders no chrome of its own', () => {
    // It must not reintroduce a bar, a strip, or a floating button.
    for (const forbidden of ['sticky', 'fixed', 'z-bar', '<button', '<nav', 'className="h-']) {
      expect(HOST, forbidden).not.toContain(forbidden)
    }
  })

  it('the palette still owns its own in-surface keys', () => {
    // Escape / arrows / Enter live on the palette input, so they are unaffected
    // by where the palette is mounted.
    for (const key of ['Escape', 'ArrowDown', 'ArrowUp', 'Enter']) {
      expect(PALETTE, key).toContain(`e.key === '${key}'`)
    }
  })

  it('the palette keeps the navigation capability it always had', () => {
    expect(PALETTE).toContain('searchDestinations')
    expect(PALETTE).toContain('useRouter')
  })

  it('exactly one ⌘K listener exists per generation', () => {
    // vNext gets the host's; legacy gets CommandBar's. The layout never mounts
    // both at once, so the shortcut can never double-fire.
    expect((HOST.match(/addEventListener\('keydown'/g) ?? []).length).toBe(1)
    expect((BAR.match(/addEventListener\('keydown'/g) ?? []).length).toBe(1)
  })
})

describe('LEGACY INVARIANT — the bar itself is untouched', () => {
  it('CommandBar still owns its shortcut and palette', () => {
    expect(BAR).toContain("window.addEventListener('keydown', onKey)")
    expect(BAR).toContain('<CommandPalette')
  })

  it('CommandBar still renders every control it did', () => {
    for (const control of [
      'sticky top-0 z-bar',      // the bar itself
      'OperatorModeSwitcher',    // mode switcher
      'Search · jump · command', // ⌘K trigger
      'Notifications',           // bell
      '/projects/new',           // deploy
      'Omnira OS',               // breadcrumb root
    ]) {
      expect(BAR, control).toContain(control)
    }
  })

  it('keeps its own /atlas suppression', () => {
    expect(BAR).toContain("const isAtlas = pathname === '/atlas'")
  })
})

describe('the generation selector is not part of this slice', () => {
  it('keeps the generation selector contract intact', () => {
    // This slice removed the top bar from vNext; it did not remove, absorb or
    // take ownership of the generation selector. That is the whole invariant.
    //
    // It used to be spelled by requiring the literal
    // `DEFAULT_UI_GENERATION: OmniraUiGeneration = 'legacy'`, which quietly
    // froze the production default in a test about chrome. Flipping the default
    // is a legitimate, planned change (PR #82) and this test would have been its
    // only failure — so the value is deliberately NOT asserted here. What the
    // default IS belongs to lib/qa/ui-generation.test.ts, which owns that policy.
    expect(GENERATION).toContain('export const DEFAULT_UI_GENERATION: OmniraUiGeneration')
    expect(GENERATION).toContain('export function isVNext')
  })
})
