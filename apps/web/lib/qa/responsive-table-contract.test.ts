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

/** Per-column allowance owner-verified as readable at M3.1. */
const COLUMN_ALLOWANCE = 128

interface Surface {
  id: string
  rel: string
  columns: number
  /** Link text in the final column; clipping it is the defect being fixed. */
  action: string
}

const SURFACES: Surface[] = [
  {
    id: 'project runs',
    rel: 'app/(platform)/projects/[slug]/runs/page.tsx',
    columns: 5,
    action: 'Visa logg',
  },
  {
    id: 'project home',
    rel: 'app/(platform)/projects/[slug]/page.tsx',
    columns: 4,
    action: 'Visa',
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
    expect(cls).toContain('rounded-xl')
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

  it('pins a min-width floor so columns cannot compress into illegibility', () => {
    // Without a floor the table squeezes toward min-content before it scrolls,
    // which wraps every cell to one word per line first.
    expect(minWidthFloor(SRC)).not.toBeNull()
  })

  it('sizes the floor to its own column count, not a copied constant', () => {
    // Both tables share cell padding and type scale, so the readable width per
    // column is the same on each; only the number of columns differs. A floor
    // carried over unchanged from a wider table would scroll more than needed.
    expect(minWidthFloor(SRC)).toBe(surface.columns * COLUMN_ALLOWANCE)
  })

  it('leaves the floor non-binding at every width md and above', () => {
    expect(minWidthFloor(SRC)!).toBeLessThan(NARROWEST_DESKTOP_CANVAS)
  })

  it('still sizes the table to its container', () => {
    expect(tableClasses(SRC)).toContain('w-full')
    expect(tableClasses(SRC)).toContain('text-sm')
  })

  it('keeps its full column count', () => {
    const block = SRC.slice(SRC.indexOf('<table'), SRC.indexOf('</table>'))
    expect((block.match(/<th\b/g) ?? []).length).toBe(surface.columns)
    expect((block.match(/<td\b/g) ?? []).length).toBe(surface.columns)
  })

  it('keeps the final-column link reachable and unchanged', () => {
    expect(SRC).toContain(surface.action)
    expect(SRC).toContain('/runs/${run.id}')
  })

  it('keeps status rendering, ordering and row semantics', () => {
    for (const token of [
      'RunStatusBadge',
      'formatDistanceToNow',
      'divide-y divide-border',
      'hover:bg-muted/30',
    ]) {
      expect(SRC).toContain(token)
    }
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
   * M3.3 and M3.4 have not been authorized. These two tables must still be in
   * their clipping state — finding either already converged would mean scope
   * was jumped rather than merely that a fix arrived early.
   */
  const REMAINING = [
    'app/(platform)/agent-activity/page.tsx',
    'app/(platform)/system/page.tsx',
  ]

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
