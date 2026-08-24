import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Responsive table contract — /projects/[slug]/runs.
 *
 * A `w-full` auto-layout table whose min-content width exceeds its container
 * grows past that container. If the container clips both axes, the overflowing
 * columns are not merely cramped — they are invisible and unreachable, with no
 * scrollbar to hint that anything is missing. On this route the last column is
 * the only link to a run's log, so clipping it removes a navigation path.
 *
 * What this suite pins is the SEMANTIC requirement, not one spelling of it:
 * the wrapper may not clip horizontally without offering a way to reach the
 * clipped content. Any equivalent affordance satisfies it.
 *
 * Class tokens are matched by pattern rather than spelled out. Tailwind scans
 * lib/**\/*.ts including comments and string literals, so a literal arbitrary
 * value written here would be emitted into the bundle whether or not the page
 * still uses it. That has bitten this project three times.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const RUNS = read('app/(platform)/projects/[slug]/runs/page.tsx')

/** Class list of the nearest element wrapping the table. */
function wrapperClasses(): string[] {
  const idx = RUNS.indexOf('<table')
  expect(idx).toBeGreaterThan(-1)
  const preceding = [...RUNS.slice(0, idx).matchAll(/<div\s+className="([^"]*)"\s*>/g)]
  const nearest = preceding.at(-1)
  if (!nearest) throw new Error('no wrapper element found above the runs table')
  return nearest[1].split(/\s+/).filter(Boolean)
}

function tableClasses(): string[] {
  const match = RUNS.match(/<table\s+className="([^"]*)"/)
  if (!match) throw new Error('runs table className not found')
  return match[1].split(/\s+/).filter(Boolean)
}

/** The table's min-width floor in px, or null when it declares none. */
function minWidthFloor(): number | null {
  const token = tableClasses().find((c) => new RegExp('^min-w-' + '\\[\\d+px\\]$').test(c))
  return token ? Number(token.match(/\d+/)![0]) : null
}

describe('responsive table · project runs stays reachable', () => {
  it('does not clip horizontal overflow', () => {
    // The both-axes form takes the columns away with no way to get them back.
    expect(wrapperClasses()).not.toContain('overflow-' + 'hidden')
  })

  it('offers a horizontal scroll affordance', () => {
    const scrolls = wrapperClasses().some((c) =>
      new RegExp('^overflow-x-' + '(auto|scroll)$').test(c),
    )
    expect(scrolls).toBe(true)
  })

  it('keeps clipping the other axis so the rounded frame still holds', () => {
    // The frame is what makes this read as a panel; losing the clip would be a
    // visible desktop change, which this slice is not allowed to make.
    const cls = wrapperClasses()
    expect(cls).toContain('rounded-xl')
    expect(cls.some((c) => new RegExp('^overflow-y-' + '(hidden|clip)$').test(c))).toBe(true)
  })

  it('puts the floor on the table, never on the scroll container', () => {
    // This is what keeps the overflow local. The wrapper takes its width from
    // the page canvas; if IT carried the floor instead, the 640px would push the
    // whole canvas wide and trade a clipped table for a horizontally scrolling
    // page — a worse defect than the one being fixed.
    const wrapper = wrapperClasses()
    expect(wrapper.some((c) => new RegExp('^min-w-').test(c))).toBe(false)
    expect(wrapper.some((c) => new RegExp('^w-\\[').test(c))).toBe(false)
    expect(tableClasses().some((c) => new RegExp('^min-w-').test(c))).toBe(true)
  })

  it('pins a min-width floor so columns cannot compress into illegibility', () => {
    // Without a floor the table squeezes toward min-content before it scrolls,
    // which wraps every cell to one word per line first.
    expect(minWidthFloor()).not.toBeNull()
    expect(minWidthFloor()!).toBeGreaterThanOrEqual(560)
  })
})

describe('responsive table · desktop presentation is untouched', () => {
  /**
   * Parity here is arithmetic, not observation. `min-width` only binds when the
   * container is narrower than the floor, so proving the floor sits below the
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

  it('leaves the floor non-binding at every width md and above', () => {
    // Narrowest md+ canvas is at exactly lg, where the sidebar first appears.
    const narrowestDesktopCanvas = LG_PX - SIDEBAR_PX - OSPAGE_LG_PAD_PX
    expect(narrowestDesktopCanvas).toBe(684)
    expect(minWidthFloor()!).toBeLessThan(narrowestDesktopCanvas)
  })

  it('still sizes the table to its container', () => {
    expect(tableClasses()).toContain('w-full')
    expect(tableClasses()).toContain('text-sm')
  })

  it('adds no responsive variant that could alter one breakpoint only', () => {
    // A prefixed utility would make mobile and desktop diverge structurally.
    // This route had none before M3.1 and must still have none.
    expect(RUNS).not.toMatch(/\b(sm|md|lg|xl):/)
  })
})

describe('responsive table · nothing but reachability changed', () => {
  it('keeps all five columns', () => {
    const block = RUNS.slice(RUNS.indexOf('<table'), RUNS.indexOf('</table>'))
    expect((block.match(/<th\b/g) ?? []).length).toBe(5)
    expect((block.match(/<td\b/g) ?? []).length).toBe(5)
  })

  it('keeps the column headers and their order', () => {
    const headers = [...RUNS.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1])
    expect(headers).toEqual(['Workflow', 'Status', 'Startad', 'Varaktighet'])
  })

  it('keeps the run log link reachable and unchanged', () => {
    expect(RUNS).toContain('Visa logg')
    expect(RUNS).toContain('/runs/${run.id}')
  })

  it('keeps status rendering, ordering and duration logic', () => {
    for (const token of [
      'RunStatusBadge',
      'formatDistanceToNow',
      'divide-y divide-border',
      'run.finished_at',
      'run.started_at',
    ]) {
      expect(RUNS).toContain(token)
    }
  })

  it('did not reach into any other table surface', () => {
    // M3.1 is the proof slice. The other three tables stay clipped until their
    // own slices, so finding them already converged would mean scope was jumped.
    for (const rel of [
      'app/(platform)/agent-activity/page.tsx',
      'app/(platform)/system/page.tsx',
      'app/(platform)/projects/[slug]/page.tsx',
    ]) {
      expect(read(rel)).not.toContain('overflow-x-' + 'auto')
    }
  })
})
