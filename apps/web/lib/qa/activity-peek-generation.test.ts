/**
 * The Activity peek reads the resolved generation, not the URL.
 *
 * THE DEFECT THIS PINS. `MobileRailToggle` decided whether Atlas Home already
 * had a desktop activity rail with `searchParams.get('ui') === 'vnext'`. That
 * asks the wrong question. `resolveUiGeneration` reads `?ui=` first, then the
 * `omnira_ui` cookie, then the default — so a request is constantly vNext with
 * no `?ui=` in the URL at all. Every registry link to Atlas Home is a bare
 * `/atlas`, and the root, `/dashboard` and `/action-center` all redirect there.
 * The peek therefore rendered on top of `ActivitySystemRail`, and the same
 * screen wore different chrome depending only on how it was reached.
 *
 * The old tests pinned the literal source string, so they passed throughout.
 * These exercise the decision itself, and the last block pins the coupling:
 * without it, the semantics below could stay green while the shell did
 * something else entirely.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hasDesktopActivityRail, ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'
import { resolveUiGeneration } from '@/lib/ui/generation'
import { resolveDestination } from '@/lib/nav/registry'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

/**
 * Negative source assertions must look at code, not prose — these modules
 * explain the defect they fix, so the words naturally appear in their comments.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PEEK = read('components/platform/os/MobileRailToggle.tsx')
const LAYOUT = read('app/(platform)/layout.tsx')

describe('CASE A — resolved vNext on Atlas Home with NO query at all', () => {
  it('suppresses the desktop peek', () => {
    expect(hasDesktopActivityRail('/atlas', 'vnext')).toBe(true)
  })

  it('does so when vNext came from the cookie and the URL carries no ?ui=', () => {
    // The exact regression: this resolved to vNext, and the old check —
    // reading the raw query — would have seen null and kept the peek on screen.
    const generation = resolveUiGeneration({ query: undefined, cookie: 'vnext' })
    expect(generation).toBe('vnext')
    expect(hasDesktopActivityRail('/atlas', generation)).toBe(true)
  })

  it('covers the href the registry actually links to', () => {
    // Atlas Home is reached as a bare '/atlas'. If that ever gains a query the
    // peek must still not depend on it.
    expect(resolveDestination('atlas')?.href).toBe('/atlas')
    expect(resolveDestination('atlas')?.href).toBe(ATLAS_HOME_PATH)
  })
})

describe('CASE B — explicit ?ui=vnext behaves identically to case A', () => {
  it('is the same decision, reached through the canonical resolver', () => {
    const fromQuery = resolveUiGeneration({ query: 'vnext', cookie: null })
    const fromCookie = resolveUiGeneration({ query: undefined, cookie: 'vnext' })
    expect(fromQuery).toBe(fromCookie)
    expect(hasDesktopActivityRail('/atlas', fromQuery))
      .toBe(hasDesktopActivityRail('/atlas', fromCookie))
  })

  it('gives one answer per resolved generation, however it was reached', () => {
    // The invariant that makes this defect impossible to reintroduce: the peek
    // is a pure function of the RESOLVED generation. Query, cookie and the
    // default are interchangeable once resolved — which is also why this stays
    // correct when PR #82 flips the default to vNext.
    const routes = ['vnext' as const, 'legacy' as const]
    for (const generation of routes) {
      const viaQuery = resolveUiGeneration({ query: generation, cookie: null })
      const viaCookie = resolveUiGeneration({ query: undefined, cookie: generation })
      expect(viaQuery).toBe(generation)
      expect(viaCookie).toBe(generation)
      expect(hasDesktopActivityRail('/atlas', viaQuery))
        .toBe(hasDesktopActivityRail('/atlas', viaCookie))
    }
  })
})

describe('CASE C — resolved legacy is untouched', () => {
  it('gets no vNext desktop-rail suppression on Atlas Home', () => {
    expect(hasDesktopActivityRail('/atlas', 'legacy')).toBe(false)
  })

  it('stays legacy however legacy was reached, including ?ui=legacy', () => {
    expect(hasDesktopActivityRail('/atlas', resolveUiGeneration({ query: 'legacy' }))).toBe(false)
    expect(hasDesktopActivityRail('/atlas', resolveUiGeneration({ cookie: 'legacy' }))).toBe(false)
    // Junk input is "no opinion" and falls through to the default, never vNext.
    expect(hasDesktopActivityRail('/atlas', resolveUiGeneration({ query: 'VNEXT' }))).toBe(false)
    expect(hasDesktopActivityRail('/atlas', resolveUiGeneration({ query: 'nonsense' }))).toBe(false)
  })
})

describe('CASE D — every other route keeps the shared peek', () => {
  it('does not suppress on non-Atlas routes under vNext', () => {
    for (const route of ['/revenue', '/memory', '/approvals', '/planning', '/agent-activity', '/chat', '/settings']) {
      expect(hasDesktopActivityRail(route, 'vnext'), route).toBe(false)
    }
  })

  it('treats Atlas sub-routes as ordinary pages — only Atlas Home has the rail', () => {
    // AtlasHomeVNext (and so ActivitySystemRail) mounts on /atlas only.
    for (const route of ['/atlas/content', '/atlas/marketing', '/atlas/operations', '/atlas/activity']) {
      expect(hasDesktopActivityRail(route, 'vnext'), route).toBe(false)
    }
  })

  it('does not match on a prefix or a trailing slash', () => {
    expect(hasDesktopActivityRail('/atlas/', 'vnext')).toBe(false)
    expect(hasDesktopActivityRail('/atlas-home', 'vnext')).toBe(false)
  })
})

describe('COUPLING — the component consumes the resolved value', () => {
  it('no longer derives the generation from raw URL state', () => {
    const code = codeOnly(PEEK)
    expect(code).not.toContain("searchParams.get('ui')")
    expect(code).not.toContain('useSearchParams')
  })

  it('never reimplements precedence: no cookie parsing, no default knowledge', () => {
    const code = codeOnly(PEEK)
    expect(code).not.toContain('OMNIRA_UI_COOKIE')
    expect(code).not.toContain('DEFAULT_UI_GENERATION')
    expect(code).not.toContain('resolveUiGeneration')
    expect(code).not.toContain('omnira_ui')
  })

  it('calls the shared decision rather than restating it inline', () => {
    expect(PEEK).toContain('hasDesktopActivityRail(pathname, uiGeneration)')
    expect(PEEK).toContain("from '@/lib/nav/activity-peek-visibility'")
  })

  it('takes the generation as a required prop, so no mount can guess it', () => {
    expect(PEEK).toMatch(/uiGeneration:\s*OmniraUiGeneration/)
    // A default value here would resurrect the guess this slice removed.
    expect(PEEK).not.toMatch(/uiGeneration\s*=\s*['"]/)
  })

  it('the layout hands it the same value it gives the rest of the shell', () => {
    expect(LAYOUT).toContain('uiGeneration={uiGeneration}')
    expect(LAYOUT).toContain('<MobileRailToggle liveCount={liveCount} uiGeneration={uiGeneration}>')
    expect(LAYOUT).toContain('resolveUiGeneration')
  })

  it('keeps applying the decision as lg:hidden, not an outright hide', () => {
    // Below lg the peek is the ONLY activity surface — .insightRail is
    // display:none under 1024px — so suppression must remain desktop-scoped.
    expect(PEEK).toContain("atlasVNextHasDesktopRail ? 'lg:hidden' : ''")
    expect(PEEK).toContain('fixed z-50 bottom-5 right-5 h-11')
  })
})

describe('AUTHORITY — generation precedence lives in exactly one module', () => {
  it('the visibility helper defers to isVNext and parses nothing itself', () => {
    const HELPER = read('lib/nav/activity-peek-visibility.ts')
    const code = codeOnly(HELPER)
    expect(HELPER).toContain("from '@/lib/ui/generation'")
    expect(code).toContain('isVNext(generation)')
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('cookie')
    expect(code).not.toContain('DEFAULT_UI_GENERATION')
  })
})
