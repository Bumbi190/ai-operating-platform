/**
 * Phase 6.5 — sidebar IA, return origin, and Atlas Home's rail hints.
 *
 * Three deferred gaps, and each carries a different risk.
 *
 * The SIDEBAR risk is silent IA drift: an approved change is fine, an unnoticed
 * reorder is not, so the untouched groups are pinned alongside the new item.
 *
 * The RETURN risk is a wrong destination. Sending someone who came from the
 * spiral back to Atlas Home is worse than not returning at all, which is why
 * Phase 5 marked nothing until the marker could carry an origin. The round trip
 * is exercised against a stubbed sessionStorage rather than asserted from
 * source, because the shape of what gets stored is the whole point.
 *
 * The ATLAS HINT risk is a second hint system. The rail must render the SAME
 * metadata through the SAME caps as the shell bar — one system, two mounting
 * points — and it must not disturb the locked composition.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  markAtlasProjectRailOpen,
  projectReturnHref,
  PROJECT_RETURN_ORIGINS,
} from '@/components/platform/vnext/AtlasProjectReturnShortcut'
import { VNEXT_NAV, vnextNavItems, vnextNavItemsFor } from '@/lib/nav/vnext-nav'
import { LEGACY_GLOBAL_NAV } from '@/lib/nav/legacy-nav'
import { destinationBasePath, pathToDestination, resolveDestination } from '@/lib/nav/registry'
import { keyboardHintsFor, routeKeyboardHintsFor, shouldRenderKeyboardHints } from '@/lib/nav/keyboard-hints'
import { ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const RETURN_SRC = read('components/platform/vnext/AtlasProjectReturnShortcut.tsx')
const RAIL = read('components/platform/vnext/ProjectRail.tsx')
const SPIRAL = read('components/platform/vnext/ProjectSpiral.tsx')
const HINT_LIST = read('components/platform/os/KeyboardHintList.tsx')
const HINT_BAR = read('components/platform/os/KeyboardHints.tsx')
const HINT_CSS = read('components/platform/os/KeyboardHints.module.css')

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** One CSS rule's declarations, comments stripped — these blocks explain what
 *  they deliberately avoid, so a raw substring scan reads the prose. */
const cssRule = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`)
  return codeOnly(css.slice(start, css.indexOf('}', start)))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Sidebar
// ─────────────────────────────────────────────────────────────────────────────

describe('sidebar · Organisation joins the approved IA', () => {
  it('appears in the vNext nav, in the Atlas group', () => {
    const atlas = VNEXT_NAV.find((group) => group.id === 'atlas')!
    expect(atlas.items.map((item) => item.label)).toEqual(['Atlas', 'Chat', 'Organisation'])
  })

  it('uses the registry path rather than a literal', () => {
    const item = vnextNavItems().find((i) => i.label === 'Organisation')!
    expect(item.href).toBe(destinationBasePath('organisation'))
    expect(item.href).toBe(resolveDestination('organisation')?.href)
    expect(item.id).toBe('organisation')
  })

  it('the active route resolves back to the same destination', () => {
    // This is what the sidebar's active-state logic and the breadcrumb both
    // rely on: forward and reverse resolution agreeing.
    expect(pathToDestination('/organisation')).toBe('organisation')
    expect(pathToDestination('/organisation/')).toBe('organisation')
  })

  it('reorders nothing else', () => {
    const byGroup = Object.fromEntries(VNEXT_NAV.map((g) => [g.id, g.items.map((i) => i.label)]))
    expect(VNEXT_NAV.map((g) => g.id)).toEqual(['atlas', 'arbete', 'intelligens', 'system'])
    expect(byGroup.arbete).toEqual([
      'Granskningar', 'Aktivitet', 'Planering', 'Marknadsgranskning', 'Content Center',
    ])
    expect(byGroup.intelligens).toEqual(['Minne', 'Intelligence Graph', 'Pengar'])
    expect(byGroup.system).toEqual(['System', 'Inställningar'])
  })

  it('keeps Atlas the single primary entry', () => {
    expect(vnextNavItems().filter((i) => i.primary).map((i) => i.href)).toEqual(['/atlas'])
  })

  it('is desktop-only — the mobile sheet stays a quick-jump surface', () => {
    expect(vnextNavItemsFor('mobile').some((i) => i.href === '/organisation')).toBe(false)
    expect(vnextNavItemsFor('desktop').some((i) => i.href === '/organisation')).toBe(true)
  })

  it('leaves legacy navigation untouched', () => {
    expect(LEGACY_GLOBAL_NAV).toHaveLength(9)
    expect(LEGACY_GLOBAL_NAV.map((i) => i.href)).not.toContain('/organisation')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Return origin
// ─────────────────────────────────────────────────────────────────────────────

describe('project return · the marker carries where you came from', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    ;(globalThis as any).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  })
  afterEach(() => { delete (globalThis as any).sessionStorage })

  const marker = () => JSON.parse(store.get('omnira.atlas.project-rail.open')!)

  it('supports exactly the two real origins', () => {
    expect([...PROJECT_RETURN_ORIGINS]).toEqual(['atlas-home', 'projects-index'])
  })

  it('Atlas Home writes the atlas-home origin', () => {
    markAtlasProjectRailOpen('trading', 'atlas-home')
    expect(marker()).toMatchObject({ slug: 'trading', origin: 'atlas-home' })
    expect(typeof marker().openedAt).toBe('number')
  })

  it('the spiral writes the projects-index origin', () => {
    markAtlasProjectRailOpen('trading', 'projects-index')
    expect(marker()).toMatchObject({ slug: 'trading', origin: 'projects-index' })
  })

  it('defaults to atlas-home, so a caller that omits it behaves as before', () => {
    markAtlasProjectRailOpen('trading')
    expect(marker().origin).toBe('atlas-home')
  })

  it('a direct arrival writes nothing at all', () => {
    // Nothing marks on navigation the operator did not start from a rail or the
    // spiral — no bookmark, reload or deep link gains invented back behaviour.
    expect(store.size).toBe(0)
  })
})

describe('project return · each origin resolves to its own surface', () => {
  it('atlas-home returns to Atlas Home, carrying the slug for reselection', () => {
    const href = projectReturnHref('atlas-home', 'familje-stunden')!
    expect(href.startsWith(ATLAS_HOME_PATH)).toBe(true)
    expect(href).toContain('project=familje-stunden')
  })

  it('projects-index returns to the spiral', () => {
    expect(projectReturnHref('projects-index', 'trading')).toBe('/projects')
    expect(projectReturnHref('projects-index', 'trading'))
      .toBe(destinationBasePath('project_home'))
  })

  it('encodes the slug rather than interpolating it raw', () => {
    expect(projectReturnHref('atlas-home', 'a b&c')).toContain('a%20b%26c')
  })

  it('both destinations come from the registry, not from literals', () => {
    const code = codeOnly(RETURN_SRC)
    expect(code).toContain("destinationBasePath('project_home')")
    expect(code).toContain("resolveDestination('atlas')")
    expect([...code.matchAll(/['"`]\/[a-z]/g)]).toHaveLength(0)
  })
})

describe('project return · the guards and the owner are unchanged', () => {
  it('still asks the shared resolver what Esc and Backspace mean', () => {
    expect(RETURN_SRC).toContain("resolveProjectRailKeyAction(event, 'project-detail', document)")
    // No key comparison of its own — the editable-target and
    // higher-priority-surface guards live in the resolver and stay there.
    expect(codeOnly(RETURN_SRC)).not.toMatch(/event\.key\s*===/)
    expect(codeOnly(RETURN_SRC)).not.toContain('Backspace')
  })

  it('introduces no new global keyboard listener', () => {
    // Exactly one, the same one it always had, still scoped to a project route.
    expect([...RETURN_SRC.matchAll(/addEventListener\('keydown'/g)]).toHaveLength(1)
    expect(RETURN_SRC).toContain("pathname.match(/^\\/projects\\/([^/]+)(?:\\/|$)/)")
  })

  it('does not act when the marker is missing or for another project', () => {
    expect(RETURN_SRC).toContain('if (!marker || marker.slug !== slug) return')
  })

  it('restores rail focus only for the origin that has a rail', () => {
    expect(RETURN_SRC).toContain("if (marker.origin === 'atlas-home') sessionStorage.setItem(RESTORE_MARKER, slug)")
  })

  it('an old marker with no origin reads as atlas-home', () => {
    // A marker written before this phase must not lose its behaviour.
    expect(RETURN_SRC).toContain("parseOrigin(parsed.origin) ?? 'atlas-home'")
  })

  it('both surfaces mark on the keyboard AND the pointer path', () => {
    // Clicking a card navigates through the link itself, so the marker has to
    // be written there too or a pointer user gets no return.
    for (const [name, src, origin] of [
      ['rail', RAIL, 'atlas-home'],
      ['spiral', SPIRAL, 'projects-index'],
    ] as const) {
      const marks = [...src.matchAll(/markAtlasProjectRailOpen\([^)]*\)/g)].map((m) => m[0])
      expect(marks.length, name).toBeGreaterThanOrEqual(2)
      for (const call of marks) expect(call, name).toContain(`'${origin}'`)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Atlas Home rail hints
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas home hints · real shortcuts, one hint system', () => {
  it('describes exactly the two keys the rail binds', () => {
    const hints = routeKeyboardHintsFor(ATLAS_HOME_PATH)
    expect(hints.map((h) => h.keys.join('+'))).toEqual(['←+→', 'Enter'])
    expect(hints.map((h) => h.label)).toEqual(['bläddra projekt', 'öppna projekt'])
  })

  it('invents no extra Atlas shortcut', () => {
    const keys = routeKeyboardHintsFor(ATLAS_HOME_PATH).map((h) => h.keys.join('+'))
    for (const absent of ['Esc', '/', 'Alt+Space', '⌘+K', 'Backspace']) {
      expect(keys, absent).not.toContain(absent)
    }
  })

  it('the rail binds precisely those keys through the shared resolver', () => {
    expect(RAIL).toContain("resolveProjectRailKeyAction(event, 'atlas', document)")
    expect(RAIL).toContain("action === 'previous'")
    expect(RAIL).toContain("action === 'next'")
    expect(RAIL).toContain("action === 'open'")
  })

  it('does not leak onto Atlas sub-routes, which bind nothing of the kind', () => {
    expect(routeKeyboardHintsFor('/atlas/content')).toEqual([])
    expect(keyboardHintsFor('/atlas/content').map((h) => h.keys.join('+')))
      .toEqual(['⌘+K', 'Alt+Space'])
  })

  it('the shell bar still stands down on Atlas Home — exactly one hint surface', () => {
    expect(shouldRenderKeyboardHints(ATLAS_HOME_PATH, 'vnext')).toBe(false)
    expect(RAIL).toContain('<KeyboardHintList')
  })

  it('renders through the SAME component and CSS as the shell bar', () => {
    // The thing that would make this a second hint system is its own markup.
    expect(HINT_BAR).toContain('<KeyboardHintList')
    expect(RAIL).toContain("from '@/components/platform/os/KeyboardHintList'")
    expect(RAIL).toContain("hintStyles from '@/components/platform/os/KeyboardHints.module.css'")
    expect(HINT_LIST).toContain('styles.cap')
    expect(HINT_LIST).toContain('styles.label')
  })

  it('reads the shared metadata, and only the route-specific part of it', () => {
    // ⌘K and Alt+Space are shell facts; inside a page's own chrome they are noise.
    expect(RAIL).toContain('routeKeyboardHintsFor(ATLAS_HOME_PATH)')
    expect(RAIL).not.toContain('keyboardHintsFor(')
  })

  it('stays supplemental — hidden from assistive tech, inert to the pointer', () => {
    expect(RAIL).toMatch(/className=\{hintStyles\.inline\} aria-hidden="true"/)
    expect(HINT_CSS).toMatch(/\.inline \{[^}]*pointer-events: none/)
  })

  it('never wraps to a second row and never scrolls sideways', () => {
    const inline = cssRule(HINT_CSS, '.inline')
    expect(inline).toContain('flex-wrap: nowrap')
    expect(inline).toContain('overflow: hidden')
    expect(inline).not.toMatch(/overflow-x:\s*(auto|scroll)/)
  })

  it('drops its labels at the same width the bar does', () => {
    expect(HINT_CSS).toMatch(/@media \(max-width: 640px\) \{\s*\.inline \.label \{\s*display: none/)
  })

  it('drops whole hints below the label breakpoint, rather than clipping them', () => {
    // The bar drops by priority in JS after measuring the viewport. The inline
    // variant sits inside someone else's heading and cannot measure the space
    // it is given, so it drops positionally — which is priority order, because
    // the route's hints are declared most important first.
    expect(HINT_CSS).toMatch(/@media \(max-width: 520px\) \{\s*\.inline \.hint:not\(:first-child\) \{\s*display: none/)
    const [first] = routeKeyboardHintsFor(ATLAS_HOME_PATH)
    expect(first.priority).toBe(Math.min(...routeKeyboardHintsFor(ATLAS_HOME_PATH).map((h) => h.priority)))
  })

  it('never shrinks below its caps inside the heading row', () => {
    // With `min-width: 0` the flex heading squeezed it under its content width
    // and `overflow: hidden` clipped the last cap — measured at 375px, 53px of
    // box for 63px of caps. The heading's text is the flexible part.
    const inline = cssRule(HINT_CSS, '.inline')
    expect(inline).toContain('flex: none')
    expect(inline).not.toContain('min-width: 0')
  })

  it('scales with the display preference, like every other cap', () => {
    expect(HINT_CSS).not.toMatch(/font-size:\s*[0-9.]+px/)
  })
})

describe('atlas home hints · the visual lock is not weakened', () => {
  const HOME_CSS = read('components/platform/vnext/AtlasHomeVNext.module.css')

  it('the locked stylesheet gains no hint styling of its own', () => {
    // The inline variant lives in the shared hint stylesheet, so Atlas Home's
    // own CSS gains nothing. Asserted as SELECTORS, not as substrings — the
    // file legitimately contains `display: inline-flex` all over.
    expect(HOME_CSS).not.toMatch(/^\s*\.inline\s*[,{]/m)
    for (const cls of ['.cap', '.keys', '.hint ']) {
      expect(HOME_CSS, cls).not.toMatch(new RegExp(`^\\s*\\${cls}\\s*[,{]`, 'm'))
    }
    // And its accent insulation — the Phase 1 invariant — still holds.
    expect(HOME_CSS).not.toMatch(/var\(--os-accent/)
  })

  it('the hint sits in the rail heading, not in the hero', () => {
    // Nothing near the orb, the command core or the composer moves.
    const heading = RAIL.slice(RAIL.indexOf('styles.sectionHeading'))
    expect(heading.indexOf('KeyboardHintList')).toBeGreaterThan(0)
    expect(heading.indexOf('KeyboardHintList')).toBeLessThan(heading.indexOf('styles.projectRail'))
  })

  it('changes no Atlas runtime, state or composition', () => {
    const code = codeOnly(RAIL)
    for (const forbidden of ['resolveAtlasOrbState', 'voicePhase', 'AtlasOrbCanvas', 'useAtlas(']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })
})
