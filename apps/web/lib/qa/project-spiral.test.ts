/**
 * Project Spiral — the `/projects` index.
 *
 * The route did not exist before this phase, which makes the risks specific:
 * inventing a project list beside the authorized one, inventing data to fill
 * cards with, introducing a second project destination, or reimplementing the
 * keyboard. Each of those is asserted against here.
 *
 * Geometry is pure, so its properties — one frontmost card, symmetric depth,
 * nothing off-stage at any spread — are asserted directly rather than inferred
 * from a rendered page. The wiring is a source contract, the same approach
 * atlas-launcher-vnext.test.ts uses.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  spiralPlacement,
  spiralPlacements,
  spiralSpreadForWidth,
  spineRings,
} from '@/lib/atlas/project-spiral-geometry'
import { buildBreadcrumbs } from '@/lib/nav/breadcrumbs'
import { keyboardHintsFor } from '@/lib/nav/keyboard-hints'
import { destinationBasePath, resolveDestination } from '@/lib/nav/registry'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const PAGE = read('app/(platform)/projects/page.tsx')
const SPIRAL = read('components/platform/vnext/ProjectSpiral.tsx')
const SPIRAL_CSS = read('components/platform/vnext/ProjectSpiral.module.css')
const LEGACY = read('app/(platform)/projects/ProjectsIndexLegacy.tsx')

const SPREAD = { x: 300, y: 200 }

/**
 * Executable source only.
 *
 * These files document what they deliberately do NOT do — the scoping helper
 * they never call, the route shape they never restate, the rail marker they
 * never claim — so naming those in a comment is the point. Only code is
 * scanned for them.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ─────────────────────────────────────────────────────────────────────────────
// The route exists
// ─────────────────────────────────────────────────────────────────────────────

describe('projects index · the route is real', () => {
  it('/projects has a page', () => {
    expect(PAGE).toContain('export default async function ProjectsIndexPage')
  })

  it('the registry already pointed here, and now resolves to a page', () => {
    expect(destinationBasePath('project_home')).toBe('/projects')
  })

  it('renders the spiral for vNext and a plain list for legacy', () => {
    // A 404 on rollback would be worse than a plain page.
    expect(PAGE).toContain('isVNext(generation)')
    expect(PAGE).toContain('<ProjectsIndexLegacy')
    expect(PAGE).toContain('<ProjectSpiral')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Data: scoped, real, and not invented
// ─────────────────────────────────────────────────────────────────────────────

describe('projects index · data', () => {
  it('uses the same scoped loader Atlas Home renders its rail from', () => {
    expect(PAGE).toContain('loadAtlasHomeViewModel')
    expect(PAGE).toContain('composeAtlasRailCards')
  })

  it('builds no project list of its own', () => {
    // Any query here would be a second, unscoped source of projects.
    for (const [name, src] of [['page', codeOnly(PAGE)], ['spiral', codeOnly(SPIRAL)]] as const) {
      expect(src, name).not.toContain("from('projects')")
      expect(src, name).not.toContain('getAllowedProjectIds')
      expect(src, name).not.toContain('createAdminClient')
    }
  })

  it('invents no project, status, metric or count', () => {
    // Cards read only fields the model actually carries. A fabricated KPI would
    // show up here as a literal.
    for (const src of [codeOnly(SPIRAL), codeOnly(LEGACY)]) {
      expect(src).not.toMatch(/\b(Aktiv|Frisk|Optimal|Hälsa)\b/)
      expect(src).not.toMatch(/\bagents\.length\b/)
      expect(src).not.toMatch(/Math\.(random|floor\(Math)/)
    }
  })

  it('shows a count only when the model actually has one', () => {
    // runningRuns / pendingApprovals are nullable — null means "could not be
    // read", and a fabricated 0 would read as "nothing is running".
    expect(SPIRAL).toContain('card.project.runningRuns !== null')
    expect(SPIRAL).toContain('card.project.pendingApprovals !== null')
  })

  it('says so when the projects query failed rather than showing an empty list', () => {
    expect(PAGE).toContain('model?.availability.projects')
    expect(SPIRAL).toContain('projectsAvailable')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Opening a project uses the existing destination
// ─────────────────────────────────────────────────────────────────────────────

describe('projects index · opening a project', () => {
  it('navigates to the href the card already carries', () => {
    expect(SPIRAL).toContain('router.push(card.href)')
    expect(SPIRAL).toContain('href={card.href}')
  })

  it('introduces no second project route', () => {
    // The only project URL shape is the registry's.
    expect(resolveDestination('project_home', { project: 'trading' })?.href)
      .toBe('/projects/trading')
    for (const src of [codeOnly(SPIRAL), codeOnly(LEGACY), codeOnly(PAGE)]) {
      expect(src).not.toMatch(/['"`]\/projects\/[a-z[]/)
    }
  })

  it('does not claim the rail\'s return marker', () => {
    // markAtlasProjectRailOpen makes Esc on a project page return to ATLAS
    // HOME. That is the wrong destination for a spiral entry, and redirecting
    // it would be new back-behaviour this phase does not invent.
    expect(codeOnly(SPIRAL)).not.toContain('markAtlasProjectRailOpen')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard: reused, not reimplemented
// ─────────────────────────────────────────────────────────────────────────────

describe('projects index · keyboard ownership', () => {
  it('asks the existing resolver rather than comparing keys', () => {
    expect(SPIRAL).toContain("resolveProjectRailKeyAction(event, 'atlas', document)")
    const code = codeOnly(SPIRAL)
    expect(code).not.toMatch(/event\.key\s*===/)
    expect(code).not.toContain('ArrowLeft')
    expect(code).not.toContain('ArrowRight')
  })

  it('adds no new key meaning', () => {
    // The resolver's 'atlas' context is exactly ← → Enter. Esc/Backspace belong
    // to 'project-detail' and are not claimed here.
    const code = codeOnly(SPIRAL)
    expect(code).not.toContain('Escape')
    expect(code).not.toContain('Backspace')
    expect(code).not.toContain('router.back')
  })

  it('reuses the rail\'s wraparound rather than its own modulo', () => {
    expect(SPIRAL).toContain('wrapIndex')
  })

  it('the hint layer describes exactly what the spiral binds', () => {
    const keys = keyboardHintsFor('/projects').map((h) => h.keys.join('+'))
    expect(keys).toContain('←+→')
    expect(keys).toContain('Enter')
    expect(keys).not.toContain('Esc')
  })

  it('those hints do not leak onto project pages, where nothing binds them', () => {
    const onProject = keyboardHintsFor('/projects/trading').map((h) => h.keys.join('+'))
    expect(onProject).toEqual(['⌘+K', 'Alt+Space'])
    expect(keyboardHintsFor('/projects/trading/agents').map((h) => h.keys.join('+')))
      .toEqual(['⌘+K', 'Alt+Space'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

describe('project spiral · geometry', () => {
  it('puts the selected card at the front, centred', () => {
    const p = spiralPlacement(2, 2, 6, SPREAD)
    expect(p).toMatchObject({ x: 0, y: 0, scale: 1, opacity: 1, focused: true })
    expect(p.depth).toBe(1)
  })

  it('has exactly one frontmost card', () => {
    for (const count of [1, 2, 3, 5, 8]) {
      for (let selected = 0; selected < count; selected += 1) {
        const focused = spiralPlacements(count, selected, SPREAD).filter((p) => p.focused)
        expect(focused, `count ${count}, selected ${selected}`).toHaveLength(1)
      }
    }
  })

  it('paints the selected card above every other', () => {
    const placements = spiralPlacements(7, 3, SPREAD)
    const front = placements[3]
    for (const [index, p] of placements.entries()) {
      if (index === 3) continue
      expect(p.z).toBeLessThan(front.z)
      expect(p.scale).toBeLessThanOrEqual(front.scale)
      expect(p.opacity).toBeLessThanOrEqual(front.opacity)
    }
  })

  it('keeps every card inside the spread it was given', () => {
    // Nothing may land off-stage at any count or selection — that is what would
    // make the composition clip.
    for (const count of [1, 2, 4, 9, 16]) {
      for (let selected = 0; selected < count; selected += 1) {
        for (const p of spiralPlacements(count, selected, SPREAD)) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(SPREAD.x)
          expect(Math.abs(p.y)).toBeLessThanOrEqual(SPREAD.y)
          expect(p.scale).toBeGreaterThanOrEqual(0.7)
          expect(p.scale).toBeLessThanOrEqual(1)
          expect(p.opacity).toBeGreaterThanOrEqual(0.32)
          expect(p.opacity).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is symmetric around the selection', () => {
    const placements = spiralPlacements(8, 0, SPREAD)
    // The card one step ahead and one step behind sit at the same depth.
    expect(placements[1].depth).toBe(placements[7].depth)
    expect(placements[1].x).toBe(-placements[7].x)
  })

  it('handles a single card without dividing by zero', () => {
    expect(spiralPlacement(0, 0, 1, SPREAD))
      .toMatchObject({ x: 0, y: 0, scale: 1, opacity: 1, focused: true })
    expect(spiralPlacements(0, 0, SPREAD)).toEqual([])
  })

  it('narrows toward a stacked rail rather than shrinking the desktop sweep', () => {
    const wide = spiralSpreadForWidth(1600)
    const narrow = spiralSpreadForWidth(375)
    expect(narrow.x).toBeLessThan(wide.x)
    // Horizontal collapses much harder than vertical — the composition leans
    // vertical instead of losing its depth.
    expect(narrow.x / wide.x).toBeLessThan(narrow.y / wide.y)
  })

  it('never widens as the viewport narrows', () => {
    let previous = { x: Infinity, y: Infinity }
    for (let width = 1920; width >= 320; width -= 40) {
      const spread = spiralSpreadForWidth(width)
      expect(spread.x, `${width}px`).toBeLessThanOrEqual(previous.x)
      expect(spread.y, `${width}px`).toBeLessThanOrEqual(previous.y)
      previous = spread
    }
  })

  it('describes seven spine rings, each slower than the last', () => {
    const rings = spineRings()
    expect(rings).toHaveLength(7)
    for (let i = 1; i < rings.length; i += 1) {
      expect(rings[i].durationSeconds).toBeGreaterThan(rings[i - 1].durationSeconds)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Motion, scale and accessibility
// ─────────────────────────────────────────────────────────────────────────────

describe('project spiral · motion and presentation', () => {
  it('honours the resolved reduced-motion signal, not the media query alone', () => {
    expect(SPIRAL_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(SPIRAL_CSS).toContain(":where(html:not([data-motion='full']))")
  })

  it('the focused card settles while the others keep drifting', () => {
    expect(SPIRAL_CSS).toContain('spiral-card-drift')
    expect(SPIRAL_CSS).toMatch(/\.slot\[data-focused\] > \*\s*\{\s*animation: none/)
  })

  it('reduced motion removes movement but keeps the composition', () => {
    // Depth, scale and opacity are inline transforms from the geometry, so the
    // spatial arrangement survives. Only animation and transition are dropped.
    const block = SPIRAL_CSS.slice(SPIRAL_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toMatch(/animation: none/)
    expect(block).toMatch(/transition: none/)
    expect(block).not.toMatch(/display:\s*none|visibility:\s*hidden|opacity:\s*0\b/)
  })

  it('focus is not carried by glow alone', () => {
    // Scale comes from the geometry; border and outline come from here.
    expect(SPIRAL_CSS).toMatch(/\.card\[data-focused\][^}]*border-color/)
    expect(SPIRAL_CSS).toContain(':focus-visible')
    expect(SPIRAL_CSS).toMatch(/outline: 2px solid/)
  })

  it('scales with the display-scale preference and never uses zoom', () => {
    expect(SPIRAL_CSS).not.toMatch(/^\s*zoom:/m)
    expect(SPIRAL_CSS).not.toMatch(/font-size:\s*[0-9.]+px/)
    expect(SPIRAL_CSS).toMatch(/font-size: [0-9.]+rem/)
  })

  it('cannot overflow the page horizontally', () => {
    expect(SPIRAL_CSS).toContain('max-width: 100%')
    expect(SPIRAL_CSS).toContain('overflow: hidden')
    expect(SPIRAL_CSS).toMatch(/width: min\(/)
  })

  it('is a real list of links, however it is arranged visually', () => {
    expect(SPIRAL).toContain('<ul')
    expect(SPIRAL).toContain('<li')
    expect(SPIRAL).toContain('<Link')
    expect(SPIRAL).toContain('aria-live="polite"')
    expect(SPIRAL).toContain('aria-hidden="true"') // the decorative spine
  })

  it('is a navigation surface, not a second Atlas Home', () => {
    const code = codeOnly(SPIRAL)
    for (const forbidden of ['AtlasOrb', 'AtlasCommandCore', 'ActivitySystemRail', 'useAtlas']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Breadcrumbs now link the level
// ─────────────────────────────────────────────────────────────────────────────

describe('projects index · breadcrumb', () => {
  it('"Projekt" is clickable now that the index exists', () => {
    const projekt = buildBreadcrumbs('/projects/trading', {
      projects: [{ slug: 'trading', name: 'Trading' }],
    })[1]
    expect(projekt.label).toBe('Projekt')
    expect(projekt.href).toBe('/projects')
    expect(projekt.current).toBe(false)
  })

  it('takes that path from the registry rather than restating it', () => {
    expect(read('lib/nav/breadcrumbs.ts')).toContain("destinationBasePath('project_home')")
  })

  it('the index itself is the current crumb, and not a link to itself', () => {
    const trail = buildBreadcrumbs('/projects')
    expect(trail.map((c) => c.label)).toEqual(['Omnira', 'Projekt'])
    expect(trail.at(-1)).toMatchObject({ label: 'Projekt', current: true })
    expect(trail.at(-1)!.href).toBeUndefined()
  })

  it('nothing else about breadcrumbs changed', () => {
    expect(buildBreadcrumbs('/approvals').map((c) => c.label)).toEqual(['Omnira', 'Granskningar'])
    expect(buildBreadcrumbs('/projects/new').map((c) => c.label))
      .toEqual(['Omnira', 'Projekt', 'Nytt projekt'])
  })
})
