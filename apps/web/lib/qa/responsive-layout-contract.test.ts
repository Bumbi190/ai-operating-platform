import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Responsive layout contract — /system instrument group.
 *
 * Narrow in scope on purpose. This is not a general responsive framework; it
 * pins one container whose column count disagreed with its own children.
 *
 * The three instruments are separated by `md:border-l` and `md:pl-6` on the
 * second and third children, and the container sets `gap-x-0` because those
 * dividers are what do the separating. Both only make sense if the group stacks
 * below `md` — but the container was a flat three columns at every width, so on
 * a 327px canvas each instrument got about 101px and its caption wrapped to one
 * word per line. The pattern came from the instrument row higher up the same
 * file, which does carry the breakpoint; the column count was lost in transit.
 *
 * Class tokens are matched by pattern rather than spelled out. Tailwind scans
 * lib/**\/*.ts including comments and string literals, so a literal utility
 * written here would be emitted into the bundle whether or not the page uses it.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const SYSTEM = read('app/(platform)/system/page.tsx')

/** The three instruments in this group, in render order. */
const INSTRUMENTS = ['Snittkörning', 'Tokens · 24h', 'Kölängd']

/**
 * Locate the group by its contents rather than by position. /system has three
 * other grids; anchoring on a class string would be ambiguous and anchoring on
 * a line number would rot on the next edit above it.
 */
function instrumentGroup(): { classes: string[]; block: string } {
  const anchor = SYSTEM.indexOf(`label="${INSTRUMENTS[0]}"`)
  expect(anchor).toBeGreaterThan(-1)
  const grids = [...SYSTEM.slice(0, anchor).matchAll(/<div className="([^"]*\bgrid\b[^"]*)"\s*>/g)]
  const nearest = grids.at(-1)
  if (!nearest) throw new Error('instrument group container not found')
  const start = nearest.index!
  // Bound the group by its own last instrument. `Tokens · 24h` also labels an
  // instrument elsewhere on this page, so any file-wide lookup for these labels
  // silently reads the wrong element — which it did while this was being written.
  const lastLabel = SYSTEM.indexOf(`label="${INSTRUMENTS[2]}"`, start)
  expect(lastLabel).toBeGreaterThan(start)
  const end = SYSTEM.indexOf('/>', lastLabel) + 2
  return { classes: nearest[1].split(/\s+/).filter(Boolean), block: SYSTEM.slice(start, end) }
}

function instrumentGroupClasses(): string[] {
  return instrumentGroup().classes
}

/** Column count declared at a breakpoint, or at base when prefix is empty. */
function columnsAt(prefix: string): number | null {
  const pattern = new RegExp(`^${prefix}grid-cols-` + '(\\d+)$')
  const hit = instrumentGroupClasses().find((c) => pattern.test(c))
  return hit ? Number(hit.match(/\d+$/)![0]) : null
}

describe('responsive layout · system instrument group', () => {
  it('is the container that actually holds the three instruments', () => {
    // Guards the locator: if this ever selects a different grid, every
    // assertion below would be describing the wrong element.
    const { classes, block } = instrumentGroup()
    expect(classes.join(' ')).toContain('gap-y-5')
    // Exactly these three, and no fourth swept in by a mis-scoped block.
    expect((block.match(/<Instrument/g) ?? []).length).toBe(3)
    for (const label of INSTRUMENTS) expect(block).toContain(`label="${label}"`)
  })

  it('stacks to a single column below md', () => {
    expect(columnsAt('')).toBe(1)
  })

  it('restores exactly three columns at md', () => {
    expect(columnsAt('md:')).toBe(3)
  })

  it('steps at md and nowhere else', () => {
    // A second breakpoint would mean the container and its dividers disagree
    // again, just at a different width.
    const others = instrumentGroupClasses().filter((c) =>
      new RegExp('^(sm|lg|xl|2xl|3xl|4xl|5xl):grid-cols-').test(c),
    )
    expect(others).toEqual([])
  })

  it('leaves the gaps exactly as they were', () => {
    // gap-x-0 is load-bearing: the md dividers provide the horizontal
    // separation, so a horizontal gap would double it up at md and above.
    const cls = instrumentGroupClasses()
    expect(cls).toContain('gap-x-0')
    expect(cls).toContain('gap-y-5')
    const gaps = cls.filter((c) => new RegExp('^(gap|gap-x|gap-y)-').test(c))
    expect(gaps.sort()).toEqual(['gap-x-0', 'gap-y-5'])
  })
})

describe('responsive layout · the children are untouched', () => {
  it('keeps the md divider and padding on the second and third instruments', () => {
    // These already expressed the stacking intent; M4.1 makes the container
    // agree with them rather than changing them.
    const { block } = instrumentGroup()
    expect([...block.matchAll(/className="md:pl-6 md:border-l"/g)]).toHaveLength(2)
  })

  it('leaves the first instrument without a divider', () => {
    const { block } = instrumentGroup()
    const anchor = block.indexOf(`label="${INSTRUMENTS[0]}"`)
    const openingDiv = block.lastIndexOf('<div', anchor)
    expect(block.slice(openingDiv, anchor)).not.toContain('border-l')
  })

  it('does not retune instrument spacing, size or typography', () => {
    const { block } = instrumentGroup()
    for (const label of INSTRUMENTS) {
      const at = block.indexOf(`label="${label}"`)
      const end = block.indexOf('/>', at)
      expect(end).toBeGreaterThan(at)
      expect(block.slice(at, end)).toContain('size="md"')
    }
    // Captions and values carry the real data; none of it is layout's business.
    for (const caption of [
      'senaste 24h, slutförda körningar',
      'prompt + komplettering',
      'körs just nu',
    ]) {
      expect(block).toContain(`caption="${caption}"`)
    }
  })
})

describe('responsive layout · the rest of /system is out of scope', () => {
  it('leaves the legend grid alone — that is M4.5 and deferred', () => {
    expect(SYSTEM).toContain('relative mt-5 pt-4 grid grid-cols-3 gap-3')
  })

  it('leaves the hero alone — that is M4.4 and measurement-gated', () => {
    expect(SYSTEM).toContain(
      'display-hero text-gradient-instrument max-w-[42rem] 3xl:max-w-[56rem]',
    )
  })

  it('leaves the M3.4 table conversion intact', () => {
    expect(SYSTEM).toContain('min-w-[656px]')
    const scroll = SYSTEM.match(/<Panel className="([^"]*)"\s*>\s*<table/)
    expect(scroll).not.toBeNull()
    expect(scroll![1]).toContain('overflow-x-' + 'auto')
    expect(scroll![1]).not.toContain('overflow-' + 'hidden')
  })

  it('does not reach into the reference instrument row higher up the file', () => {
    // The row this pattern was copied from is already correct and stays as is.
    expect(SYSTEM).toContain('grid grid-cols-2 md:grid-cols-4 panel p-7 2xl:p-9')
  })
})
