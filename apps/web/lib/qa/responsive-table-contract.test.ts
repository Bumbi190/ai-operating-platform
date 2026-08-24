import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Responsive table contract — project surfaces.
 *
 * A `w-full` auto-layout table whose min-content width exceeds its container
 * grows past that container. If the container clips both axes, the overflowing
 * columns are not merely cramped — they are invisible and unreachable, with no
 * scrollbar to hint that anything is missing. On both routes covered here the
 * last column is a link, so clipping it removes a navigation path.
 *
 * What this suite pins is the SEMANTIC requirement, not one spelling of it:
 * the wrapper may not clip horizontally without offering a way to reach the
 * clipped content, and the width floor must sit on the table rather than on
 * the scroll container. Any equivalent affordance satisfies it.
 *
 * Class tokens are matched by pattern rather than spelled out. Tailwind scans
 * lib/**\/*.ts including comments and string literals, so a literal arbitrary
 * value written here would be emitted into the bundle whether or not any page
 * still uses it. That has bitten this project three times.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

/** Narrowest canvas at md and above — see the desktop-parity block below. */
const NARROWEST_DESKTOP_CANVAS = 684

/**
 * Content budget per column, expressed type-relatively.
 *
 * M3.1 was reviewed at 640px across five columns of `px-4` cells at 14px text:
 * 128px each, of which 32px is padding and 96px is content. 96/14 gives 6.86em
 * of readable content per column, which is the figure every later surface is
 * sized from — so a table with tighter type or wider padding gets its own floor
 * instead of inheriting a number that was never about its geometry.
 */
const CONTENT_BUDGET_EM = 96 / 14

/** Smallest content width per column any floor may imply, whatever the maths. */
const MIN_CONTENT_PX = 60

interface Surface {
  id: string
  rel: string
  columns: number
  /** Total horizontal cell padding, both sides. */
  cellPadPx: number
  /** Mean type size across the columns, weighted by column count. */
  avgTypePx: number
  /** The reviewed floor, in px. */
  floor: number
  /** Whatever gives the wrapper its rounded frame on this surface. */
  frameClass: string
  /** The table's own type scale utility. */
  typeClass: string
  hasHeader: boolean
  /** Link text in the final column, when the surface has one. */
  action: string | null
  /** Row and data semantics that must survive the change untouched. */
  invariants: string[]
}

const SURFACES: Surface[] = [
  {
    id: 'project runs',
    rel: 'app/(platform)/projects/[slug]/runs/page.tsx',
    columns: 5,
    cellPadPx: 32,
    avgTypePx: 14,
    floor: 640,
    frameClass: 'rounded-xl',
    typeClass: 'text-sm',
    hasHeader: true,
    action: 'Visa logg',
    invariants: ['RunStatusBadge', 'formatDistanceToNow', 'divide-y divide-border', 'hover:bg-muted/30'],
  },
  {
    id: 'project home',
    rel: 'app/(platform)/projects/[slug]/page.tsx',
    columns: 4,
    cellPadPx: 32,
    avgTypePx: 14,
    floor: 512,
    frameClass: 'rounded-xl',
    typeClass: 'text-sm',
    hasHeader: true,
    action: 'Visa',
    invariants: ['RunStatusBadge', 'formatDistanceToNow', 'divide-y divide-border', 'hover:bg-muted/30'],
  },
  {
    id: 'agent activity',
    rel: 'app/(platform)/agent-activity/page.tsx',
    columns: 5,
    cellPadPx: 40,
    // Three columns at 12px, two at 10.5px.
    avgTypePx: (3 * 12 + 2 * 10.5) / 5,
    floor: 592,
    // This surface frames itself with the shared panel treatment, which carries
    // its own radius — asserting a utility here would be asserting the wrong thing.
    frameClass: 'panel',
    typeClass: 'text-[12px]',
    // Deliberately headerless. Adding one would be inventing labels.
    hasHeader: false,
    // And it carries no action link; its last column is a duration.
    action: null,
    invariants: ['RunStatusBadge', 'formatDistanceToNow', 'caption-mono', 'r.projectColor'],
  },
]

/** Class list of the nearest element wrapping the table. */
function wrapperClasses(src: string): string[] {
  const idx = src.indexOf('<table')
  expect(idx).toBeGreaterThan(-1)
  // Any element may be the wrapper — /system uses a Panel component, not a div.
  const preceding = [...src.slice(0, idx).matchAll(/<[A-Za-z][\w.]*\s+className="([^"]*)"\s*>/g)]
  const nearest = preceding.at(-1)
  if (!nearest) throw new Error('no wrapper element found above the table')
  return nearest[1].split(/\s+/).filter(Boolean)
}

function tableClasses(src: string): string[] {
  const match = src.match(/<table\s+className="([^"]*)"/)
  if (!match) throw new Error('table className not found')
  return match[1].split(/\s+/).filter(Boolean)
}

/** The table's min-width floor in px, or null when it declares none. */
function minWidthFloor(src: string): number | null {
  const token = tableClasses(src).find((c) => new RegExp('^min-w-' + '\\[\\d+px\\]$').test(c))
  return token ? Number(token.match(/\d+/)![0]) : null
}

describe.each(SURFACES)('responsive table · $id stays reachable', (surface) => {
  const SRC = read(surface.rel)

  it('does not clip horizontal overflow', () => {
    // The both-axes form takes the columns away with no way to get them back.
    expect(wrapperClasses(SRC)).not.toContain('overflow-' + 'hidden')
  })

  it('offers a horizontal scroll affordance', () => {
    const scrolls = wrapperClasses(SRC).some((c) =>
      new RegExp('^overflow-x-' + '(auto|scroll)$').test(c),
    )
    expect(scrolls).toBe(true)
  })

  it('keeps clipping the other axis so the rounded frame still holds', () => {
    // The frame is what makes this read as a panel; losing the clip would be a
    // visible desktop change, which these slices are not allowed to make.
    const cls = wrapperClasses(SRC)
    expect(cls).toContain(surface.frameClass)
    expect(cls.some((c) => new RegExp('^overflow-y-' + '(hidden|clip)$').test(c))).toBe(true)
  })

  it('reuses the established thin scrollbar treatment', () => {
    expect(wrapperClasses(SRC)).toContain('scrollbar-thin')
  })

  it('puts the floor on the table, never on the scroll container', () => {
    // This is what keeps the overflow local. The wrapper takes its width from
    // the page canvas; if IT carried the floor instead, the floor would push the
    // whole canvas wide and trade a clipped table for a horizontally scrolling
    // page — a worse defect than the one being fixed.
    const wrapper = wrapperClasses(SRC)
    expect(wrapper.some((c) => new RegExp('^min-w-').test(c))).toBe(false)
    expect(wrapper.some((c) => new RegExp('^w-\\[').test(c))).toBe(false)
    expect(tableClasses(SRC).some((c) => new RegExp('^min-w-').test(c))).toBe(true)
  })

  it('declares the reviewed floor', () => {
    // Without a floor the table squeezes toward min-content before it scrolls,
    // which wraps every cell to one word per line first.
    expect(minWidthFloor(SRC)).toBe(surface.floor)
  })

  it('sizes that floor by the shared rule, not by copying another table', () => {
    // One formula for every surface: each column gets the same type-relative
    // content budget plus its own cell padding. A floor lifted from a table with
    // different padding or type scale lands outside the rounding tolerance.
    const perColumn = surface.cellPadPx + CONTENT_BUDGET_EM * surface.avgTypePx
    const derived = surface.columns * perColumn
    expect(Math.abs(surface.floor - derived)).toBeLessThanOrEqual(8)
  })

  it('never implies a column narrower than readable', () => {
    const contentPerColumn = surface.floor / surface.columns - surface.cellPadPx
    expect(contentPerColumn).toBeGreaterThanOrEqual(MIN_CONTENT_PX)
  })

  it('leaves the floor non-binding at every width md and above', () => {
    expect(surface.floor).toBeLessThan(NARROWEST_DESKTOP_CANVAS)
  })

  it('still sizes the table to its container at its own type scale', () => {
    expect(tableClasses(SRC)).toContain('w-full')
    expect(tableClasses(SRC)).toContain(surface.typeClass)
  })

  it('keeps its full column count', () => {
    const block = SRC.slice(SRC.indexOf('<table'), SRC.indexOf('</table>'))
    expect((block.match(/<td\b/g) ?? []).length).toBe(surface.columns)
    // A headerless table must stay headerless — adding one would mean inventing
    // labels the surface never had.
    const headers = (block.match(/<th\b/g) ?? []).length
    expect(headers).toBe(surface.hasHeader ? surface.columns : 0)
  })

  it('keeps the final-column link reachable and unchanged', () => {
    if (surface.action === null) {
      // Nothing to preserve, and nothing may be added either.
      const block = SRC.slice(SRC.indexOf('<table'), SRC.indexOf('</table>'))
      expect(block).not.toContain('<Link')
      return
    }
    expect(SRC).toContain(surface.action)
    expect(SRC).toContain('/runs/${run.id}')
  })

  it('keeps status rendering, ordering and row semantics', () => {
    for (const token of surface.invariants) expect(SRC).toContain(token)
  })
})

describe('responsive table · desktop presentation is untouched', () => {
  /**
   * Parity here is arithmetic, not observation. `min-width` only binds when the
   * container is narrower than the floor, so proving every floor sits below the
   * narrowest md+ canvas proves `w-full` still governs everywhere it governed
   * before — no rendering required.
   */
  const SIDEBAR_PX = 260
  const LG_PX = 1024
  const OSPAGE_LG_PAD_PX = 40 * 2

  it('derives the canvas from the real shell rather than a guess', () => {
    // If either of these moves, the arithmetic below is stale and must be redone.
    expect(read('app/(platform)/layout.tsx')).toContain(
      `lg:[grid-template-columns:${SIDEBAR_PX}px_minmax(0,1fr)]`,
    )
    expect(read('components/platform/os/OSPage.tsx')).toContain('lg:px-10')
  })

  it('pins the narrowest md+ canvas the floors are checked against', () => {
    // Narrowest md+ canvas is at exactly lg, where the sidebar first appears.
    expect(LG_PX - SIDEBAR_PX - OSPAGE_LG_PAD_PX).toBe(NARROWEST_DESKTOP_CANVAS)
  })

  it('keeps the runs route free of breakpoint-conditional utilities', () => {
    // A prefixed utility would make mobile and desktop diverge structurally.
    // This route had none before M3.1 and must still have none. Project home
    // carries its own from the stat grid, which is M4 and out of scope here.
    expect(read(SURFACES[0].rel)).not.toMatch(/\b(sm|md|lg|xl):/)
  })

  it('leaves the project-home stat grid untouched — that grid is M4', () => {
    expect(read(SURFACES[1].rel)).toContain('grid grid-cols-3 lg:grid-cols-3 3xl:grid-cols-4')
  })
})

describe('responsive table · unconverted surfaces stay unconverted', () => {
  /**
   * M3.4 has not been authorized. This table must still be in
   * its clipping state — finding it already converged would mean scope
   * was jumped rather than merely that a fix arrived early.
   */
  const REMAINING = ['app/(platform)/system/page.tsx']

  it('still clips, and offers no scroll affordance', () => {
    for (const rel of REMAINING) {
      const src = read(rel)
      expect(wrapperClasses(src)).toContain('overflow-' + 'hidden')
      expect(src).not.toContain('overflow-x-' + 'auto')
    }
  })

  it('carries no width floor yet', () => {
    for (const rel of REMAINING) {
      expect(minWidthFloor(read(rel))).toBeNull()
    }
  })
})
