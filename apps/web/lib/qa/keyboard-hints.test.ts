/**
 * Keyboard hints — view → hint set, and the ownership boundary.
 *
 * Two risks are worth guarding, and the second is the real one.
 *
 * The first is ordinary: showing a shortcut that does not exist on this view.
 * A hint that is sometimes a lie is worse than no hint, so every entry is
 * asserted against the route it claims and against the absence of the others.
 *
 * The second is architectural. This phase deliberately did NOT build a central
 * keyboard router — the specialist surfaces already own their keys and are
 * already guarded. The tests below therefore assert that the hint layer stays a
 * description: no listener, no `preventDefault`, no key comparison. If a future
 * change starts handling keys here, that is the moment Omnira grows a fifth
 * keyboard system, and this is where it should fail.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  keyboardHintsFor,
  shouldRenderKeyboardHints,
  visibleKeyboardHints,
  type KeyboardHint,
} from '@/lib/nav/keyboard-hints'
import { capacityForRemWidth } from '@/components/platform/os/KeyboardHints'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const HINTS_SRC = read('lib/nav/keyboard-hints.ts')
const COMPONENT = read('components/platform/os/KeyboardHints.tsx')
const LAYOUT = read('app/(platform)/layout.tsx')

/** Executable source only — these files document the keys other surfaces own. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const caps = (hints: readonly KeyboardHint[]) => hints.map((h) => h.keys.join('+'))
const labels = (hints: readonly KeyboardHint[]) => hints.map((h) => h.label)

// ─────────────────────────────────────────────────────────────────────────────
// Route → hint set
// ─────────────────────────────────────────────────────────────────────────────

describe('keyboard hints · route mapping', () => {
  it('offers the global palette shortcut on every route', () => {
    for (const path of ['/approvals', '/memory', '/projects/trading', '/trading', '/nonsense']) {
      expect(caps(keyboardHintsFor(path)), path).toContain('⌘+K')
    }
  })

  it('describes the trading keys the market view actually binds', () => {
    // components/platform/trading/AtlasMarketView.tsx → market-view/keyboard.ts
    const hints = keyboardHintsFor('/trading')
    expect(caps(hints)).toContain('←+→')
    expect(labels(hints)).toContain('byt instrument')
    expect(caps(hints)).toContain('Esc')
  })

  it('describes the graph canvas keys', () => {
    // components/platform/intelligence/GraphCanvas.tsx — handleCanvasKeyDown
    const hints = keyboardHintsFor('/intelligence/graph')
    const keys = caps(hints)
    expect(keys).toContain('←+→+↑+↓')
    expect(keys).toContain('/')
    expect(keys).toContain('F')
    expect(keys).toContain('0')
    // '+' is both a key and the join separator, so this one is asserted on the
    // key array rather than on a joined string.
    expect(hints.map((h) => [...h.keys])).toContainEqual(['+', '−'])
    expect(keys).toContain('Enter')
  })

  it('does not leak one view\'s keys onto another', () => {
    // The graph's zoom keys exist only on the graph; trading's instrument keys
    // only in the market view.
    const approvals = caps(keyboardHintsFor('/approvals'))
    expect(approvals).not.toContain('F')
    expect(approvals).not.toContain('0')
    expect(approvals).not.toContain('←+→')
    expect(caps(keyboardHintsFor('/trading'))).not.toContain('F')
    expect(caps(keyboardHintsFor('/intelligence/graph'))).not.toContain('byt instrument')
  })

  it('lists no shortcut on a project route beyond the global ones', () => {
    // AtlasProjectReturnShortcut binds Esc ONLY when the route was opened from
    // the rail — it reads a session marker first. Listing "Esc tillbaka" here
    // would be wrong for anyone who arrived by link, bookmark or reload.
    const hints = keyboardHintsFor('/projects/trading/agents')
    expect(caps(hints)).toEqual(['⌘+K', 'Alt+Space'])
  })

  it('matches the longest route prefix', () => {
    expect(caps(keyboardHintsFor('/intelligence/graph'))).toContain('F')
    expect(caps(keyboardHintsFor('/intelligence/graph/anything'))).toContain('F')
    // A sibling that is not the graph gets only the global set.
    expect(caps(keyboardHintsFor('/intelligence'))).toEqual(['⌘+K', 'Alt+Space'])
  })

  it('normalizes query strings and trailing slashes', () => {
    const canonical = caps(keyboardHintsFor('/trading'))
    expect(caps(keyboardHintsFor('/trading/'))).toEqual(canonical)
    expect(caps(keyboardHintsFor('/trading?instrument=ES'))).toEqual(canonical)
  })

  it('never emits an empty or unlabelled hint', () => {
    for (const path of ['/trading', '/intelligence/graph', '/approvals']) {
      for (const hint of keyboardHintsFor(path)) {
        expect(hint.keys.length, path).toBeGreaterThan(0)
        expect(hint.label.trim(), path).not.toBe('')
        expect(Number.isFinite(hint.priority), path).toBe(true)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Responsive priority
// ─────────────────────────────────────────────────────────────────────────────

describe('keyboard hints · drop by priority, never wrap', () => {
  const GRAPH = keyboardHintsFor('/intelligence/graph')

  it('keeps navigation longest and drops the global voice hint first', () => {
    const kept = visibleKeyboardHints(GRAPH, 2)
    expect(caps(kept)).toContain('←+→+↑+↓')
    expect(caps(kept)).not.toContain('Alt+Space')
  })

  it('shrinks monotonically — a hint never reappears as space is removed', () => {
    let previous = new Set(caps(visibleKeyboardHints(GRAPH, GRAPH.length)))
    for (let capacity = GRAPH.length - 1; capacity >= 0; capacity -= 1) {
      const current = new Set(caps(visibleKeyboardHints(GRAPH, capacity)))
      for (const key of current) expect([...previous], `capacity ${capacity}`).toContain(key)
      previous = current
    }
  })

  it('preserves declared order among the survivors', () => {
    const kept = visibleKeyboardHints(GRAPH, 4)
    const order = kept.map((hint) => GRAPH.indexOf(hint))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('measures capacity in rem, so display scale changes it', () => {
    // The bar's hints are sized in rem, so at Large every hint is ~15% wider
    // while the viewport is unchanged. A px threshold would keep the same count
    // and the overflow would be CLIPPED by the bar rather than dropped by
    // priority. Measured in the browser at 1440px: Large resolves to 78.3rem
    // → 5 hints and no clipping, where a px budget kept 8 and clipped.
    const remWidth = (px: number, rootFontSize: number) => px / rootFontSize
    expect(capacityForRemWidth(remWidth(1440, 14.4))).toBe(8) // compact
    expect(capacityForRemWidth(remWidth(1440, 16))).toBe(8)   // default
    expect(capacityForRemWidth(remWidth(1440, 18.4))).toBe(5) // large — fewer
    // Narrow keeps only the critical navigation hints.
    expect(capacityForRemWidth(remWidth(375, 16))).toBe(2)
  })

  it('capacity never increases as the budget shrinks', () => {
    let previous = Infinity
    for (let rem = 120; rem >= 0; rem -= 1) {
      const capacity = capacityForRemWidth(rem)
      expect(capacity, `${rem}rem`).toBeLessThanOrEqual(previous)
      previous = capacity
    }
  })

  it('handles the degenerate capacities', () => {
    expect(visibleKeyboardHints(GRAPH, 0)).toEqual([])
    expect(visibleKeyboardHints(GRAPH, -1)).toEqual([])
    expect(visibleKeyboardHints(GRAPH, 999)).toHaveLength(GRAPH.length)
    expect(visibleKeyboardHints([], 3)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('keyboard hints · visibility', () => {
  it('renders on vNext routes', () => {
    expect(shouldRenderKeyboardHints('/trading', 'vnext')).toBe(true)
    expect(shouldRenderKeyboardHints('/approvals', 'vnext')).toBe(true)
  })

  it('never renders in legacy — CommandBar already shows its own ⌘K', () => {
    for (const path of ['/trading', '/approvals', '/intelligence/graph']) {
      expect(shouldRenderKeyboardHints(path, 'legacy'), path).toBe(false)
    }
  })

  it('stands down on Atlas Home, which carries its own composer hint', () => {
    expect(shouldRenderKeyboardHints('/atlas', 'vnext')).toBe(false)
    expect(shouldRenderKeyboardHints('/atlas/', 'vnext')).toBe(false)
    expect(shouldRenderKeyboardHints('/atlas?ui=vnext', 'vnext')).toBe(false)
    // A sub-route of Atlas is a different page and does get the bar.
    expect(shouldRenderKeyboardHints('/atlas/content', 'vnext')).toBe(true)
  })

  it('Atlas Home still owns that hint, so the bar is not duplicating it', () => {
    expect(read('components/platform/vnext/AtlasCommandCore.tsx'))
      .toContain('Enter skickar · Skift + Enter ger ny rad')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The ownership boundary — the assertion that matters most
// ─────────────────────────────────────────────────────────────────────────────

describe('keyboard hints · describe behaviour, never take it over', () => {
  it('registers no keyboard listener anywhere in the hint layer', () => {
    for (const [name, src] of [['module', HINTS_SRC], ['component', COMPONENT]] as const) {
      expect(src, name).not.toMatch(/addEventListener\(\s*['"]key(down|up|press)['"]/)
      expect(src, name).not.toContain('onKeyDown')
      expect(src, name).not.toContain('KeyboardEvent')
    }
  })

  it('never handles or swallows a key', () => {
    for (const src of [codeOnly(HINTS_SRC), codeOnly(COMPONENT)]) {
      expect(src).not.toContain('preventDefault')
      expect(src).not.toContain('stopPropagation')
      expect(src).not.toMatch(/\bevent\.key\b|\be\.key\b/)
    }
  })

  it('the specialist owners still own their keys', () => {
    // The shared resolver, and the three surfaces that call it.
    expect(read('lib/atlas/project-rail-keyboard.ts'))
      .toContain('export function resolveProjectRailKeyAction')
    for (const path of [
      'components/platform/vnext/ProjectRail.tsx',
      'components/platform/vnext/AtlasProjectReturnShortcut.tsx',
      'lib/trading/market-view/keyboard.ts',
    ]) {
      expect(read(path), path).toContain('resolveProjectRailKeyAction')
    }
    // And the ones that are legitimately their own.
    expect(read('components/platform/intelligence/GraphCanvas.tsx')).toContain('handleCanvasKeyDown')
    expect(read('components/platform/os/CommandPaletteHost.tsx')).toContain("addEventListener('keydown'")
  })

  it('introduces no second global listener', () => {
    // ⌘K has two owners, but they are mutually exclusive by generation: the
    // layout renders CommandPaletteHost for vNext and CommandBar for legacy.
    expect(LAYOUT).toMatch(/isVNext\(uiGeneration\) \? \(\s*<CommandPaletteHost/)
    expect([...LAYOUT.matchAll(/<CommandPaletteHost\b/g)]).toHaveLength(1)
    expect([...LAYOUT.matchAll(/<CommandBar\b/g)]).toHaveLength(1)
  })

  it('does not re-implement safe-back semantics', () => {
    // Esc / Backspace stay with the resolver and the surfaces that call it.
    // Naming them in a comment is the module's job; only code is scanned.
    for (const src of [codeOnly(HINTS_SRC), codeOnly(COMPONENT)]) {
      expect(src).not.toContain('router.back')
      expect(src).not.toContain('history.')
      expect(src).not.toContain('Backspace')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Presentation contract
// ─────────────────────────────────────────────────────────────────────────────

describe('keyboard hints · presentation', () => {
  const CSS = read('components/platform/os/KeyboardHints.module.css')

  it('is mounted exactly once, by the platform layout', () => {
    expect([...LAYOUT.matchAll(/<KeyboardHints\b/g)]).toHaveLength(1)
    expect(LAYOUT).toMatch(/<KeyboardHints uiGeneration=\{uiGeneration\} \/>/)
  })

  it('is supplemental, so it is hidden from assistive technology', () => {
    // Nothing is keyboard-only because of this bar, and nothing depends on it
    // being visible — the controls themselves carry the semantics.
    expect(COMPONENT).toContain('aria-hidden="true"')
    expect(COMPONENT).toContain('styles.bar')
    expect(CSS).toContain('pointer-events: none')
  })

  it('never wraps and never scrolls sideways', () => {
    expect(CSS).toContain('white-space: nowrap')
    expect(CSS).toContain('overflow: hidden')
    expect(CSS).not.toMatch(/overflow-x:\s*(auto|scroll)/)
    expect(CSS).not.toContain('flex-wrap: wrap')
  })

  it('scales with the display-scale preference', () => {
    // px font sizes would ignore the root scale Phase 3 established.
    expect(CSS).not.toMatch(/font-size:\s*[0-9.]+px/)
    expect(CSS).toMatch(/font-size: 0\.5625rem/) // caps — 9px @ default
    expect(CSS).toMatch(/font-size: 0\.625rem/)  // labels — 10px @ default
  })

  it('uses tokens for colour and the loaded mono face', () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CSS).toContain('var(--omnira-cyan-rgb)')
    expect(CSS).toContain('var(--font-geist-mono)')
  })

  it('leaves the global .kbd utility untouched', () => {
    // .kbd is a fixed 10px and sets SF Mono; both are legacy-affecting changes
    // that belong to the deferred token decisions, not to this phase.
    const globals = read('app/globals.css')
    expect(globals).toContain('.kbd {')
    expect(globals).toMatch(/\.kbd \{[^}]*font-size: 10px/)
  })
})
