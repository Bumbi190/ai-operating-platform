/**
 * Global breadcrumbs — route → trail contract.
 *
 * The breadcrumb's whole job is to answer "where am I" from a pathname, so
 * every interesting case is a path shape: dynamic ids, project routes, levels
 * with no page behind them, destinations whose base path spans two segments,
 * and paths nothing owns. Those are asserted directly against the builder here.
 *
 * What these tests are guarding against, specifically, is a second route
 * taxonomy. The trail must keep deriving from `lib/nav/registry` and
 * `VNEXT_NAV`; the moment it starts carrying its own table of routes it has
 * become the thing the vNext plan exists to prevent.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBreadcrumbs, shouldRenderBreadcrumbs } from '@/lib/nav/breadcrumbs'
import { vnextNavItems } from '@/lib/nav/vnext-nav'
import { resolveDestination } from '@/lib/nav/registry'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const BUILDER_SRC = read('lib/nav/breadcrumbs.ts')
const COMPONENT_SRC = read('components/platform/os/Breadcrumbs.tsx')

/** The trail as "A / B / C", for readable assertions. */
const trail = (path: string, projects?: { slug: string; name: string }[]) =>
  buildBreadcrumbs(path, projects ? { projects } : {})
    .map((item) => item.label)
    .join(' / ')

const PROJECTS = [
  { slug: 'trading', name: 'Trading' },
  { slug: 'familje-stunden', name: 'Familje-Stunden' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Route → breadcrumb mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · route mapping', () => {
  it('always starts at the root crumb', () => {
    for (const path of ['/approvals', '/memory', '/projects/trading', '/nonsense']) {
      expect(buildBreadcrumbs(path)[0].label).toBe('Omnira')
    }
  })

  it('labels top-level destinations with the approved vNext IA', () => {
    // These labels come from VNEXT_NAV, not from a table in the breadcrumb.
    expect(trail('/approvals')).toBe('Omnira / Granskningar')
    expect(trail('/agent-activity')).toBe('Omnira / Aktivitet')
    expect(trail('/memory')).toBe('Omnira / Minne')
    expect(trail('/planning')).toBe('Omnira / Planering')
    expect(trail('/settings')).toBe('Omnira / Inställningar')
    expect(trail('/chat')).toBe('Omnira / Chat')
  })

  it('collapses a multi-segment destination into one crumb', () => {
    // /intelligence has no page of its own — inventing an "Intelligence" level
    // would offer a link to a 404.
    expect(trail('/intelligence/graph')).toBe('Omnira / Intelligence Graph')
  })

  it('falls back to the registry label where the nav does not carry one', () => {
    // Trading is a real destination that VNEXT_NAV deliberately does not list.
    expect(trail('/trading')).toBe('Omnira / Trading')
  })

  it('names a route exactly as the sidebar names it', () => {
    // /system canonicalises to the `health` destination ("Health") while the
    // nav item for that same URL reads "System". The breadcrumb follows the
    // nav, so one route never wears two names in one shell.
    expect(trail('/system')).toBe('Omnira / System')

    for (const item of vnextNavItems()) {
      if (item.href === '/atlas') continue
      const last = buildBreadcrumbs(item.href).at(-1)!
      expect(last.label, `${item.href} should read as "${item.label}"`).toBe(item.label)
    }
  })

  it('keeps sub-routes under their destination', () => {
    expect(trail('/atlas/content')).toBe('Omnira / Content Center')
    expect(trail('/atlas/marketing')).toBe('Omnira / Marknadsgranskning')
    expect(trail('/atlas/operations')).toBe('Omnira / Atlas / Operations Center')
  })

  it('every VNEXT_NAV destination produces a trail past the root', () => {
    // If a navigation item ever routed somewhere the breadcrumb could not
    // describe, the operator would land on a page with no orientation at all.
    for (const item of vnextNavItems()) {
      if (item.href === '/atlas') continue // Atlas Home renders no trail, by design
      const built = buildBreadcrumbs(item.href)
      expect(built.length, `${item.label} (${item.href})`).toBeGreaterThan(1)
      expect(built[built.length - 1].label, item.href).not.toBe('Omnira')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Current-item semantics
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · current item', () => {
  it('marks exactly one item current, and it is the last', () => {
    for (const path of ['/approvals', '/projects/trading/agents', '/intelligence/graph']) {
      const built = buildBreadcrumbs(path)
      const currents = built.filter((i) => i.current)
      expect(currents, path).toHaveLength(1)
      expect(built[built.length - 1].current, path).toBe(true)
    }
  })

  it('never links the current page to itself', () => {
    for (const path of ['/approvals', '/projects/trading', '/projects/trading/runs']) {
      const last = buildBreadcrumbs(path).at(-1)!
      expect(last.href, path).toBeUndefined()
    }
  })

  it('marks the root current when it is the only crumb', () => {
    const built = buildBreadcrumbs('/')
    expect(built).toHaveLength(1)
    expect(built[0]).toEqual({ label: 'Omnira', current: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Clickable ancestors — only where a destination really exists
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · ancestors link only to real destinations', () => {
  it('the root points at Atlas Home', () => {
    expect(buildBreadcrumbs('/approvals')[0].href).toBe('/atlas')
  })

  it('"Projekt" carries no href — /projects has no index page', () => {
    // Confirmed against the route tree: only /projects/[slug] and /projects/new
    // exist. A link here would be a dead destination.
    const projekt = buildBreadcrumbs('/projects/trading', { projects: PROJECTS })[1]
    expect(projekt.label).toBe('Projekt')
    expect(projekt.href).toBeUndefined()
    expect(projekt.current).toBe(false)
  })

  it('links each project sub-level to its own cumulative path', () => {
    const built = buildBreadcrumbs('/projects/trading/agents/a1b2c3d4-0000-4000-8000-000000000000', {
      projects: PROJECTS,
    })
    expect(built.map((i) => i.href)).toEqual([
      '/atlas',
      undefined, // Projekt
      '/projects/trading',
      '/projects/trading/agents',
      undefined, // current
    ])
  })

  it('every href it emits is a path the registry or the route tree owns', () => {
    const built = buildBreadcrumbs('/projects/familje-stunden/workflows', { projects: PROJECTS })
    for (const item of built) {
      if (!item.href) continue
      expect(item.href.startsWith('/'), item.href).toBe(true)
      expect(item.href).not.toContain('undefined')
    }
    expect(resolveDestination('atlas')?.href).toBe('/atlas')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic and unknown routes
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · dynamic and unknown routes are safe', () => {
  it('truncates record ids rather than printing a raw uuid', () => {
    expect(trail('/projects/trading/runs/a1b2c3d4-1111-4111-8111-111111111111', PROJECTS))
      .toBe('Omnira / Projekt / Trading / Körningar / a1b2c3d4…')
  })

  it('treats a short slug-like segment as a route, not an id', () => {
    // Over-eager id detection would hide a real label behind an ellipsis.
    expect(trail('/projects/trading/outputs', PROJECTS))
      .toBe('Omnira / Projekt / Trading / Utdata')
  })

  it('names a creation route after its parent', () => {
    expect(trail('/projects/new')).toBe('Omnira / Projekt / Nytt projekt')
    expect(trail('/projects/trading/agents/new', PROJECTS))
      .toBe('Omnira / Projekt / Trading / Agenter / Ny agent')
  })

  it('humanizes a path nothing owns instead of failing', () => {
    expect(trail('/some-unknown-page')).toBe('Omnira / Some Unknown Page')
    expect(() => buildBreadcrumbs('')).not.toThrow()
    expect(() => buildBreadcrumbs('/')).not.toThrow()
  })

  it('normalizes query strings and trailing slashes to one trail', () => {
    const canonical = trail('/approvals')
    expect(trail('/approvals/')).toBe(canonical)
    expect(trail('/approvals?state=pending')).toBe(canonical)
    expect(trail('/approvals/?state=pending#x')).toBe(canonical)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Project labels respect the scope the shell supplied
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · project labels', () => {
  it('names a project from the scoped list the layout passes down', () => {
    expect(trail('/projects/familje-stunden', PROJECTS))
      .toBe('Omnira / Projekt / Familje-Stunden')
  })

  it('falls back to the slug for a project outside that list', () => {
    // The list the shell supplied is the whole truth. A name must never come
    // from anywhere the operator's allow-list did not reach.
    expect(trail('/projects/someone-elses-project', PROJECTS))
      .toBe('Omnira / Projekt / someone-elses-project')
  })

  it('an empty scoped list still names nothing', () => {
    expect(trail('/projects/trading', [])).toBe('Omnira / Projekt / trading')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · visibility', () => {
  it('renders for vNext routes', () => {
    expect(shouldRenderBreadcrumbs('/approvals', 'vnext')).toBe(true)
    expect(shouldRenderBreadcrumbs('/projects/trading', 'vnext')).toBe(true)
  })

  it('never renders in legacy — the rollback path keeps its own chrome', () => {
    for (const path of ['/approvals', '/projects/trading', '/memory']) {
      expect(shouldRenderBreadcrumbs(path, 'legacy'), path).toBe(false)
    }
  })

  it('stands down on Atlas Home, which is the locked surface', () => {
    expect(shouldRenderBreadcrumbs('/atlas', 'vnext')).toBe(false)
    expect(shouldRenderBreadcrumbs('/atlas/', 'vnext')).toBe(false)
    expect(shouldRenderBreadcrumbs('/atlas?ui=vnext', 'vnext')).toBe(false)
    // A sub-route of Atlas is a different page and does get a trail.
    expect(shouldRenderBreadcrumbs('/atlas/content', 'vnext')).toBe(true)
  })

  it('never renders a lone root crumb', () => {
    expect(shouldRenderBreadcrumbs('/', 'vnext')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// No second navigation model
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · derive from the existing model, never restate it', () => {
  it('reads routes from the registry rather than hard-coding them', () => {
    expect(BUILDER_SRC).toContain("from '@/lib/nav/registry'")
    expect(BUILDER_SRC).toContain('pathToDestination')
    expect(BUILDER_SRC).toContain('resolveDestination')
    expect(BUILDER_SRC).toContain("from '@/lib/nav/vnext-nav'")
  })

  it('carries no route table of its own', () => {
    // Segment LABELS are fine — they name a level. Segment → PATH pairs are not:
    // that is a route table, and the registry already owns one. The builder
    // holds ZERO literal route paths: Atlas Home arrives as ATLAS_HOME_PATH,
    // the project URL shape comes from the `project_home` destination, and
    // every other href is built by cumulating the pathname it was handed.
    // Comments quote route paths freely — that is documentation, not a table.
    // Only executable code is scanned.
    const code = BUILDER_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    const literalPaths = [...code.matchAll(/['"`](\/[a-z0-9][a-z0-9/-]*)['"`]/g)].map((m) => m[1])
    expect(literalPaths).toEqual([])
  })

  it('takes the project URL shape from the registry, not from a template', () => {
    expect(BUILDER_SRC).toContain("resolveDestination('project_home'")
    // A path deep enough that the project crumb is an ancestor and keeps its href.
    const projectCrumb = buildBreadcrumbs('/projects/trading/agents', { projects: PROJECTS })[2]
    expect(projectCrumb.label).toBe('Trading')
    expect(projectCrumb.href).toBe(resolveDestination('project_home', { project: 'trading' })?.href)
  })

  it('does not re-implement the generation resolver', () => {
    expect(BUILDER_SRC).toContain("from '@/lib/ui/generation'")
    for (const src of [BUILDER_SRC, COMPONENT_SRC]) {
      expect(src).not.toContain('omnira_ui')
      expect(src).not.toContain("searchParams.get('ui')")
    }
  })

  it('decides nothing in the component that the builder should decide', () => {
    expect(COMPONENT_SRC).toContain('shouldRenderBreadcrumbs')
    expect(COMPONENT_SRC).toContain('buildBreadcrumbs')
    // No route knowledge in the view layer.
    expect(COMPONENT_SRC).not.toContain('pathToDestination')
    expect(COMPONENT_SRC).not.toMatch(/'\/(?!atlas')[a-z-]+'/)
  })

  it('does not touch browser history', () => {
    // Ancestors are ordinary forward navigations. Back must still mean back.
    expect(COMPONENT_SRC).not.toMatch(/router\.(back|replace|push)|history\./)
    expect(COMPONENT_SRC).toContain('next/link')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility contract
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · accessibility', () => {
  it('uses semantic breadcrumb markup', () => {
    expect(COMPONENT_SRC).toMatch(/<nav\s+aria-label=/)
    expect(COMPONENT_SRC).toContain('<ol')
    expect(COMPONENT_SRC).toContain('<li')
    expect(COMPONENT_SRC).toContain('aria-current="page"')
  })

  it('hides decorative separators from assistive tech', () => {
    // The "/" glyphs and the collapsed-middle ellipsis are visual only; a
    // screen reader should hear the labels, not the punctuation.
    const separatorUses = [...COMPONENT_SRC.matchAll(/styles\.separator/g)]
    expect(separatorUses.length).toBeGreaterThan(0)
    expect(COMPONENT_SRC).toMatch(/data-position="ellipsis"[^>]*aria-hidden="true"/)
  })

  it('keeps keyboard focus visible', () => {
    const CSS = read('components/platform/os/Breadcrumbs.module.css')
    expect(CSS).toContain(':focus-visible')
    expect(CSS).toMatch(/outline:/)
  })

  it('truncates on one line rather than wrapping', () => {
    const CSS = read('components/platform/os/Breadcrumbs.module.css')
    expect(CSS).toContain('flex-wrap: nowrap')
    expect(CSS).toContain('text-overflow: ellipsis')
    expect(CSS).toContain('white-space: nowrap')
  })

  it('uses tokens for colour, never raw hex', () => {
    const CSS = read('components/platform/os/Breadcrumbs.module.css')
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CSS).toMatch(/var\(--omnira-|hsl\(var\(--foreground/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mounted exactly once, by the shell
// ─────────────────────────────────────────────────────────────────────────────

describe('breadcrumbs · mounted once by the platform layout', () => {
  const LAYOUT = read('app/(platform)/layout.tsx')

  it('the layout renders it and hands down the scoped projects', () => {
    expect(LAYOUT).toContain('<Breadcrumbs')
    expect(LAYOUT).toMatch(/uiGeneration=\{uiGeneration\}/)
    expect(LAYOUT).toMatch(/projects=\{projects\.map/)
  })

  it('exactly one mount site exists in the app', () => {
    expect([...LAYOUT.matchAll(/<Breadcrumbs\b/g)]).toHaveLength(1)
  })
})
