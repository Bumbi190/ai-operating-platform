/**
 * vNext has touch navigation below 1024px.
 *
 * THE DEFECT THIS PINS. Under vNext, every platform route except `/atlas` lost
 * all shell navigation below `lg`: the sidebar is `hidden lg:flex`, vNext mounts
 * no `CommandBar`, `AtlasMiniOrb` is `hidden lg:block`, and `CommandPaletteHost`
 * is a keydown listener, so ⌘K has no touch affordance. `AtlasMobileNav` existed
 * but was mounted inside `AtlasHomeVNext`, so it only ever appeared on Atlas
 * Home. A touch operator could open `/revenue` and then had no way out except
 * browser back. The gap opened with PR #95: before it, `CommandBar` was mounted
 * for BOTH generations at every width.
 *
 * The risk in fixing it is the opposite failure — mounting a second nav on the
 * one page that already has one. So the load-bearing assertions here are the
 * counting ones: exactly one instance per page, derived from both owners rather
 * than eyeballed from two render sites.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  shouldRenderShellMobileNav,
  mobileNavInstanceCount,
} from '@/lib/nav/mobile-shell-visibility'
import { ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'
import { vnextNavItemsFor, vnextNavItems } from '@/lib/nav/vnext-nav'
import { resolveDestination } from '@/lib/nav/registry'
import { OMNIRA_UI_GENERATIONS, isVNext } from '@/lib/ui/generation'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

/**
 * Negative source assertions must look at code, not prose — these modules
 * explain the defect they fix, so the words naturally appear in their comments.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const LAYOUT = read('app/(platform)/layout.tsx')
const SHELL = read('components/platform/os/ShellMobileNav.tsx')
const ATLAS_HOME = read('components/platform/vnext/AtlasHomeVNext.tsx')
const MOBILE_NAV = read('components/platform/vnext/AtlasMobileNav.tsx')
const HOME_CSS = read('components/platform/vnext/AtlasHomeVNext.module.css')
const MINI = read('components/platform/os/AtlasMiniOrb.tsx')
const SIDEBAR = read('components/platform/Sidebar.tsx')

/** The routes the review named as stranded, plus Atlas Home for contrast. */
const STRANDED_ROUTES = ['/revenue', '/memory', '/approvals', '/planning', '/agent-activity']
const OTHER_ROUTES = ['/chat', '/settings', '/system', '/projects/gainpilot', '/atlas/content']

describe('CASE B/C — stranded routes get a shell nav under vNext', () => {
  it('mounts on every route the review found stranded', () => {
    for (const route of STRANDED_ROUTES) {
      expect(shouldRenderShellMobileNav(route, 'vnext'), route).toBe(true)
    }
  })

  it('mounts on the rest of the platform too, including project routes', () => {
    for (const route of OTHER_ROUTES) {
      expect(shouldRenderShellMobileNav(route, 'vnext'), route).toBe(true)
    }
  })

  it('gives those routes a real way out — the nav reaches other destinations', () => {
    const hrefs = vnextNavItemsFor('mobile').map((item) => item.href)
    for (const route of STRANDED_ROUTES) {
      const escapes = hrefs.filter((href) => href !== route)
      expect(escapes.length, route).toBeGreaterThan(0)
      expect(hrefs, route).toContain(ATLAS_HOME_PATH)   // always a way home
    }
  })
})

describe('CASE A — Atlas Home has exactly one, not two', () => {
  it('the shell stands down on Atlas Home', () => {
    expect(shouldRenderShellMobileNav(ATLAS_HOME_PATH, 'vnext')).toBe(false)
  })

  it('because Atlas Home renders its own', () => {
    expect(ATLAS_HOME).toContain('<AtlasMobileNav />')
    expect((ATLAS_HOME.match(/<AtlasMobileNav\b/g) ?? []).length).toBe(1)
  })

  it('EXACTLY ONE instance on every vNext route, counting both owners', () => {
    for (const route of [ATLAS_HOME_PATH, ...STRANDED_ROUTES, ...OTHER_ROUTES]) {
      expect(mobileNavInstanceCount(route, 'vnext'), route).toBe(1)
    }
  })

  it('Atlas sub-routes are ordinary pages — the shell owns them', () => {
    // AtlasHomeVNext renders on /atlas only, so /atlas/content is NOT covered by
    // it. A prefix match here would have left those routes with zero navs.
    for (const route of ['/atlas/content', '/atlas/marketing', '/atlas/operations']) {
      expect(shouldRenderShellMobileNav(route, 'vnext'), route).toBe(true)
      expect(mobileNavInstanceCount(route, 'vnext'), route).toBe(1)
    }
  })

  it('a trailing slash does not smuggle in a second nav', () => {
    expect(mobileNavInstanceCount('/atlas/', 'vnext')).toBe(1)
  })
})

describe('CASE E — legacy mounts no vNext mobile shell at all', () => {
  it('the shell never renders under legacy', () => {
    for (const route of [ATLAS_HOME_PATH, ...STRANDED_ROUTES, ...OTHER_ROUTES]) {
      expect(shouldRenderShellMobileNav(route, 'legacy'), route).toBe(false)
    }
  })

  it('and legacy ends up with zero vNext navs, on every route', () => {
    for (const route of [ATLAS_HOME_PATH, ...STRANDED_ROUTES, ...OTHER_ROUTES]) {
      expect(mobileNavInstanceCount(route, 'legacy'), route).toBe(0)
    }
  })

  it('legacy keeps CommandBar as its own shell surface', () => {
    expect(LAYOUT).toContain('<CommandBar')
    const branch = LAYOUT.slice(LAYOUT.indexOf('isVNext(uiGeneration) ? ('))
    const [vnextArm, legacyArm] = branch.split(/\)\s*:\s*\(/)
    expect(vnextArm).not.toContain('CommandBar')
    expect(legacyArm).toContain('CommandBar')
  })

  it('is default-proof: presence tracks isVNext for every generation', () => {
    for (const generation of OMNIRA_UI_GENERATIONS) {
      expect(shouldRenderShellMobileNav('/revenue', generation), generation)
        .toBe(isVNext(generation))
    }
  })
})

describe('CASE D — desktop is untouched', () => {
  it('CSS alone hides the nav from 1024px up — no JS breakpoint', () => {
    // Base rule is display:none; it only becomes flex under the mobile query.
    expect(HOME_CSS).toMatch(/\.mobileHeader\s*\{[^}]*display:\s*none/)
    const block = HOME_CSS.match(/@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(block).toContain('.mobileHeader { display: flex; }')
  })

  it('the shell wrapper decides presence only, never a width', () => {
    const code = codeOnly(SHELL)
    for (const forbidden of ['lg:', 'md:', 'matchMedia', 'innerWidth', '1024', 'hidden']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })

  it('the desktop sidebar is unchanged and still takes over at lg', () => {
    expect(SIDEBAR).toContain('hidden lg:flex')
  })

  it('cannot collide with the Atlas launcher — the two never coexist', () => {
    // Launcher is `hidden lg:block` (>=1024) and the header only exists <1024,
    // so the bands are disjoint. This is the collision class that has already
    // bitten this corner of the UI twice.
    expect(MINI).toContain('hidden lg:block fixed z-50')
  })

  it('cannot overlap the activity peek — it is in flow, not fixed', () => {
    // The peek is fixed bottom-right; the header sits in normal flow at the top
    // and pushes content down, so nothing is obscured and no safe-area or
    // z-index accommodation is needed.
    expect(HOME_CSS).toMatch(/\.mobileHeader\s*\{[^}]*position:\s*relative/)
    expect(HOME_CSS).not.toMatch(/\.mobileHeader\s*\{[^}]*position:\s*fixed/)
  })
})

describe('NAVIGATION CONTRACT — the canonical model is the only source', () => {
  const mobile = vnextNavItemsFor('mobile')

  it('the nav renders the canonical mobile model, not a private list', () => {
    expect(MOBILE_NAV).toContain("vnextNavItemsFor('mobile')")
    expect(MOBILE_NAV).toContain("from '@/lib/nav/vnext-nav'")
  })

  it('the shell adds no list, no hrefs and no destinations of its own', () => {
    const code = codeOnly(SHELL)
    expect(code).not.toContain('href')
    expect(code).not.toMatch(/['"]\/[a-z]/)
  })

  it('invents no route — every mobile href resolves in the registry', () => {
    for (const item of mobile) {
      const known = vnextNavItems().some((i) => i.href === item.href)
      expect(known, item.href).toBe(true)
    }
    expect(resolveDestination('atlas')?.href).toBe(ATLAS_HOME_PATH)
  })

  it('did not widen the approved mobile IA', () => {
    // Exactly the five owner-approved entries. /revenue and /planning are
    // deliberately desktop-only and must NOT be added just because the review
    // named them as stranded routes.
    expect(mobile.map((i) => i.href)).toEqual([
      '/atlas', '/chat', '/approvals', '/agent-activity', '/memory',
    ])
    expect(mobile.map((i) => i.href)).not.toContain('/revenue')
    expect(mobile.map((i) => i.href)).not.toContain('/planning')
  })

  it('stays a strict subset of desktop', () => {
    const desktop = new Set(vnextNavItemsFor('desktop').map((i) => i.id))
    for (const item of mobile) expect(desktop.has(item.id), String(item.id)).toBe(true)
  })

  it('keeps its accessible labels and a real tap target', () => {
    expect(MOBILE_NAV).toContain('aria-label="Öppna huvudnavigation"')
    expect(MOBILE_NAV).toContain('aria-label="Huvudnavigation"')
    expect(MOBILE_NAV).toContain('aria-label="Omnira Atlas hem"')
    // <details>/<summary> is keyboard- and touch-operable without JS, which
    // matters because this is the surface for people who have neither ⌘K nor a
    // sidebar.
    expect(MOBILE_NAV).toContain('<details')
    expect(MOBILE_NAV).toContain('<summary')
  })
})

describe('WIRING — the shell mounts it once, with the resolved generation', () => {
  it('the layout mounts the wrapper exactly once', () => {
    expect((LAYOUT.match(/<ShellMobileNav\b/g) ?? []).length).toBe(1)
    expect((LAYOUT.match(/<AtlasMobileNav\s*\/>/g) ?? []).length).toBe(1)
  })

  it('hands it the same resolved generation the rest of the shell gets', () => {
    expect(LAYOUT).toContain('<ShellMobileNav uiGeneration={uiGeneration}>')
    expect(LAYOUT).toContain('resolveUiGeneration')
  })

  it('the wrapper reads no query, no cookie and no default', () => {
    // Blocker 1 was exactly this mistake in the activity peek.
    const code = codeOnly(SHELL)
    for (const forbidden of ['searchParams', 'useSearchParams', 'OMNIRA_UI_COOKIE', 'DEFAULT_UI_GENERATION', 'resolveUiGeneration']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })

  it('renders above the page canvas, so it cannot cover content', () => {
    expect(LAYOUT.indexOf('<ShellMobileNav')).toBeLessThan(LAYOUT.indexOf('relative z-content'))
  })

  it('keeps AtlasMobileNav a server component — the wrapper takes it as children', () => {
    expect(MOBILE_NAV).not.toContain("'use client'")
    expect(SHELL).toContain("'use client'")
    expect(SHELL).toContain('children')
  })
})
