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

/** Column count a class list declares at a breakpoint; empty prefix = base. */
function columnsAt(classes: string[], prefix: string): number | null {
  const pattern = new RegExp(`^${prefix}grid-cols-` + '(\\d+)$')
  const hit = classes.find((c) => pattern.test(c))
  return hit ? Number(hit.match(/\d+$/)![0]) : null
}

/** Every breakpoint at which a class list declares a column count. */
function columnBreakpoints(classes: string[]): string[] {
  return classes
    .filter((c) => new RegExp('(^|:)grid-cols-' + '\\d+$').test(c))
    .map((c) => (c.includes(':') ? c.split(':')[0] : 'base'))
}

/** Gap utilities a class list declares, at any breakpoint, sorted. */
function gapsOf(classes: string[]): string[] {
  return classes.filter((c) => new RegExp('(^|:)gap(-x|-y)?-').test(c)).sort()
}

const PROJECT_HOME = read('app/(platform)/projects/[slug]/page.tsx')

/**
 * The project-home stat grid. Anchored on the map that renders it: this file
 * has seven links and one grid, so counting links would be wrong and matching
 * a class string would be needlessly brittle.
 */
function statGrid(): { classes: string[]; block: string } {
  const anchor = PROJECT_HOME.indexOf('stats.map(')
  expect(anchor).toBeGreaterThan(-1)
  const grids = [...PROJECT_HOME.slice(0, anchor).matchAll(/<div className="([^"]*\bgrid\b[^"]*)"\s*>/g)]
  const nearest = grids.at(-1)
  if (!nearest) throw new Error('stat grid container not found')
  const start = nearest.index!
  const end = PROJECT_HOME.indexOf('</div>', PROJECT_HOME.indexOf('})}', start))
  return { classes: nearest[1].split(/\s+/).filter(Boolean), block: PROJECT_HOME.slice(start, end) }
}

/** The stat entries the grid renders, from the array that feeds it. */
function statEntries(): { label: string; href: string }[] {
  const at = PROJECT_HOME.indexOf('const stats = [')
  const arr = PROJECT_HOME.slice(at, PROJECT_HOME.indexOf(']', at))
  return [...arr.matchAll(/label: '([^']*)'[^}]*href: '([^']*)'/g)].map((m) => ({
    label: m[1],
    href: m[2],
  }))
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
    expect(columnsAt(instrumentGroupClasses(), '')).toBe(1)
  })

  it('restores exactly three columns at md', () => {
    expect(columnsAt(instrumentGroupClasses(), 'md:')).toBe(3)
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

describe('responsive layout · project home stat grid', () => {
  it('is the container that actually renders the stat cards', () => {
    // Guards the locator. The cards come from a map, so there is one Link in
    // source and three on screen; anything counting source links would be
    // describing the wrong thing.
    const { block } = statGrid()
    expect(block).toContain('stats.map(')
    expect(statEntries()).toHaveLength(3)
  })

  it('gives each card the full row below sm', () => {
    expect(columnsAt(statGrid().classes, '')).toBe(1)
  })

  it('restores exactly three columns at sm', () => {
    expect(columnsAt(statGrid().classes, 'sm:')).toBe(3)
  })

  it('still widens to four columns at 3xl', () => {
    expect(columnsAt(statGrid().classes, '3xl:')).toBe(4)
  })

  it('drops the redundant lg restatement rather than carrying it forward', () => {
    // `lg:grid-cols-3` only ever restated the base. Once sm restores three it is
    // dead responsive debt, and leaving it would imply a step that does nothing.
    expect(columnsAt(statGrid().classes, 'lg:')).toBeNull()
    expect(columnBreakpoints(statGrid().classes)).toEqual(['base', 'sm', '3xl'])
  })

  it('leaves the gaps exactly as they were', () => {
    expect(gapsOf(statGrid().classes)).toEqual(['gap-4', 'lg:gap-5'])
  })

  it('keeps the cards as links, with their hrefs and order unchanged', () => {
    expect(statEntries().map((s) => s.label)).toEqual(['Agenter', 'Workflows', 'Utdata'])
    expect(statEntries().map((s) => s.href)).toEqual(['agents', 'workflows', 'outputs'])
    const { block } = statGrid()
    expect(block).toContain('<Link')
    expect(block).toContain('href={`/projects/${slug}/${stat.href}`}')
  })

  it('does not redesign the card itself', () => {
    const { block } = statGrid()
    for (const token of [
      'p-5',
      'group',
      'rounded-xl border border-border bg-card',
      'hover:border-border/80',
      'group-hover:' + OP100,
      'text-3xl font-bold',
    ]) {
      expect(block).toContain(token)
    }
  })

  it('leaves the M3.2 table conversion intact', () => {
    expect(PROJECT_HOME).toContain('min-w-[512px]')
    const wrapper = PROJECT_HOME.match(/<div className="([^"]*)"\s*>\s*<table/)
    expect(wrapper).not.toBeNull()
    expect(wrapper![1]).toContain('overflow-x-' + 'auto')
    expect(wrapper![1]).not.toContain('overflow-' + 'hidden')
  })
})

const PLANNING = read('app/(platform)/planning/PlanningBoard.tsx')

/** The board container — the element that lays the four stage columns out. */
function boardClasses(): string[] {
  const anchor = PLANNING.indexOf('COLUMNS.map(')
  expect(anchor).toBeGreaterThan(-1)
  const containers = [...PLANNING.slice(0, anchor).matchAll(/<div className="([^"]*)"\s*>/g)]
  const nearest = containers.at(-1)
  if (!nearest) throw new Error('board container not found')
  return nearest[1].split(/\s+/).filter(Boolean)
}

/** The per-column wrapper, which is where any mobile width floor belongs. */
function columnClasses(): string[] {
  const at = PLANNING.indexOf('onDrop={(e) => handleDrop(e, col.id)}')
  expect(at).toBeGreaterThan(-1)
  const open = PLANNING.lastIndexOf('<div', at)
  const cls = PLANNING.slice(open, at).match(/className="([^"]*)"/)
  if (!cls) throw new Error('column wrapper className not found')
  return cls[1].split(/\s+/).filter(Boolean)
}

/** Explicit mobile min-width floor in px, or null. */
function columnFloor(): number | null {
  const hit = columnClasses().find((c) => new RegExp('^min-w-' + '\\[\\d+px\\]$').test(c))
  return hit ? Number(hit.match(/\d+/)![0]) : null
}

describe('responsive layout · planning board', () => {
  const STAGES = ['backlog', 'todo', 'in_progress', 'done']

  it('keeps all four canonical stages, in order', () => {
    const at = PLANNING.indexOf('const COLUMNS')
    const arr = PLANNING.slice(at, PLANNING.indexOf('\n]', at))
    expect([...arr.matchAll(/id: '([^']*)'/g)].map((m) => m[1])).toEqual(STAGES)
    expect([...arr.matchAll(/label: '([^']*)'/g)].map((m) => m[1])).toEqual([
      'Backlog', 'Att göra', 'Pågår', 'Klart',
    ])
  })

  it('lays the stages out side by side below md rather than stacking them', () => {
    // Stacking would discard the board metaphor. The columns stay in a row and
    // the row scrolls.
    const cls = boardClasses()
    expect(cls).toContain('flex')
    expect(cls.some((c) => new RegExp('^grid-cols-').test(c))).toBe(false)
  })

  it('makes that row horizontally scrollable', () => {
    const cls = boardClasses()
    expect(cls.some((c) => new RegExp('^overflow-x-' + '(auto|scroll)$').test(c))).toBe(true)
    expect(cls).toContain('scrollbar-thin')
  })

  it('gives each column an explicit readable floor', () => {
    expect(columnFloor()).not.toBeNull()
    // Derived from the widest card content: a Förbättring badge beside a
    // priority marker, plus grip and remove button, plus both paddings.
    expect(columnFloor()!).toBeGreaterThanOrEqual(180)
  })

  it('puts the floor on the columns, never on the board itself', () => {
    // A floor on the scroll container would push the page wide instead of
    // scrolling inside it.
    expect(boardClasses().some((c) => new RegExp('^min-w-').test(c))).toBe(false)
  })

  it('restores exactly the four-column grid at md', () => {
    const cls = boardClasses()
    expect(cls).toContain('md:gr' + 'id')
    expect(columnsAt(cls, 'md:')).toBe(4)
  })

  it('releases the mobile floor at md — which is required, not cosmetic', () => {
    // At md the canvas is 704px, so a four-column grid gives 167px per column,
    // and at lg it gives 162px. Both sit BELOW the mobile floor, so leaving the
    // floor in place would make the board scroll on desktop.
    const canvasAtMd = 768 - 32 * 2
    const gridColumnAtMd = (canvasAtMd - 3 * 12) / 4
    expect(gridColumnAtMd).toBeLessThan(columnFloor()!)
    // Released to `auto`, not to 0. The column had no min-width before, and for
    // a grid item that means the automatic minimum size — not zero. At lg the
    // tracks are about 162px while a card's min-content is about 180px, so the
    // two values genuinely differ in how the overflow lands. `auto` restores the
    // pre-change computed value exactly; 0 would have been a quiet change.
    expect(columnClasses()).toContain('md:min-w-' + '[auto]')
    expect(columnClasses()).not.toContain('md:min-w-' + '0')
  })

  it('releases the scroll container at md so desktop overflow is untouched', () => {
    expect(boardClasses().some((c) => new RegExp('^md:overflow-x-' + 'visible$').test(c))).toBe(true)
  })

  it('leaves drag and drop exactly as it was', () => {
    // M4.3 is layout only. Touch DnD remains unresolved and out of scope.
    for (const token of [
      'draggable',
      'onDragStart={(e) => onDragStart(e, item.id)}',
      'onDragOver={(e) => e.preventDefault()}',
      'onDrop={(e) => handleDrop(e, col.id)}',
      // The move pipeline itself, by signature rather than by name alone.
      'function moveItem(id: string, newStatus: ItemStatus)',
      'function handleDragStart(e: React.DragEvent, id: string)',
      'function handleDrop(e: React.DragEvent, status: ItemStatus)',
      'if (id) moveItem(id, status)',
    ]) {
      expect(PLANNING).toContain(token)
    }
  })

  it('adds no touch sensor, pointer handler or tap-to-move affordance', () => {
    for (const forbidden of ['onPointer', 'onTouch', 'touch-action', 'useSensor', 'DndContext']) {
      expect(PLANNING).not.toContain(forbidden)
    }
  })
})

/**
 * M5 — planning card actions on touch and focus.
 *
 * The quick-move and remove controls were revealed by hover alone. `opacity: 0`
 * does not remove an element from hit-testing, so a touch user could technically
 * activate them — invisibly, by accident. That is not an interaction contract.
 *
 * The reveal is now three additive triggers on the same elements: hover for
 * pointer devices (unchanged), focus-within for keyboard, and a coarse-pointer
 * media query for touch. `pointer-coarse:` does not exist in this Tailwind, which
 * was verified against the toolchain rather than assumed, so the coarse branch is
 * written as an arbitrary variant scoped to these class attributes — it adds no
 * global responsive system and globals.css is untouched.
 *
 * Class tokens are assembled from fragments; a literal here would emit the
 * utility from test source alone, which happened during M4.3.
 */

const COARSE = '[@me' + 'dia(pointer:coarse)]:'
/**
 * Assembled, never spelled. Tailwind's extractor pulls candidates out of test
 * source — comments included — and a standalone literal here emitted a dead
 * full-opacity rule into the bundle that no component uses. The comment that
 * first described that leak was itself spelling the name, and so was causing it.
 */
const OP100 = 'opa' + 'city-100'

/** The quick-move control row on a planning card. */
function quickMoveRowClasses(): string[] {
  const at = PLANNING.indexOf('{otherStatuses.map(')
  expect(at).toBeGreaterThan(-1)
  const open = PLANNING.lastIndexOf('<div className="', at)
  return PLANNING.slice(open, at).match(/className="([^"]*)"/)![1].split(/\s+/).filter(Boolean)
}

/**
 * The individual quick-move buttons. Their classes are composed through `cn()`
 * across several string arguments, so every literal in the call has to be
 * collected — reading only the first argument silently misses the rest.
 */
function quickMoveButtonClasses(): string[] {
  const at = PLANNING.indexOf('onClick={() => onMove(item.id, s.id)}')
  expect(at).toBeGreaterThan(-1)
  // Bound the call from the `cn(` position, not the anchor: the first `)}`
  // after the anchor closes the onClick handler, which inverted the range.
  const open = PLANNING.indexOf('cn(', at)
  const call = PLANNING.slice(open, PLANNING.indexOf(')}', open))
  const literals = [...call.matchAll(/'([^']*)'/g)].map((m) => m[1])
  expect(literals.length).toBeGreaterThan(1)
  return literals.join(' ').split(/\s+/).filter(Boolean)
}

/** The remove (X) control. */
function removeButtonClasses(): string[] {
  const at = PLANNING.indexOf('onClick={() => onRemove(item.id)}')
  expect(at).toBeGreaterThan(-1)
  const cls = PLANNING.slice(at).match(/className="([^"]*)"/)![1]
  return cls.split(/\s+/).filter(Boolean)
}

/** Smallest touch dimension a class list guarantees on coarse pointers, in px. */
function coarseMinPx(classes: string[]): number | null {
  const vals = classes
    .filter((c) => c.startsWith(COARSE) && /min-[hw]-/.test(c))
    .map((c) => {
      const arb = c.match(/min-[hw]-\[(\d+)px\]$/)
      if (arb) return Number(arb[1])
      const step = c.match(/min-[hw]-(\d+)$/)
      return step ? Number(step[1]) * 4 : null
    })
    .filter((v): v is number => v !== null)
  return vals.length ? Math.min(...vals) : null
}

describe('planning cards · actions are reachable on touch and focus', () => {
  const REVEALED = [
    ['quick-move row', quickMoveRowClasses],
    ['remove button', removeButtonClasses],
  ] as const

  it.each(REVEALED)('%s is no longer hover-only', (_label, get) => {
    const cls = get()
    // Still starts hidden — the compact desktop card is preserved.
    expect(cls).toContain('opacity-0')
    // But hover is no longer the only way back.
    const reveals = cls.filter((c) => c.endsWith(OP100))
    expect(reveals.length).toBeGreaterThanOrEqual(3)
  })

  it.each(REVEALED)('%s reveals on keyboard focus anywhere in the card', (_label, get) => {
    expect(get()).toContain('group-focus-within:' + OP100)
  })

  it.each(REVEALED)('%s reveals on coarse pointers', (_label, get) => {
    expect(get()).toContain(COARSE + OP100)
  })

  it.each(REVEALED)('%s keeps the existing hover reveal for pointer devices', (_label, get) => {
    expect(get()).toContain('group-hover:' + OP100)
  })

  it('sizes both controls to a real touch target, coarse pointers only', () => {
    // Visible-but-16px would not be a fix. Desktop keeps its compact sizing
    // because the growth is inside the coarse branch.
    expect(coarseMinPx(quickMoveButtonClasses())).toBeGreaterThanOrEqual(44)
    expect(coarseMinPx(removeButtonClasses())).toBeGreaterThanOrEqual(44)
    for (const cls of [quickMoveButtonClasses(), removeButtonClasses()]) {
      expect(cls.some((c) => !c.startsWith(COARSE) && /^min-[hw]-/.test(c))).toBe(false)
    }
  })

  it('makes the focused control itself discoverable', () => {
    expect(quickMoveButtonClasses().some((c) => c.startsWith('focus-visible:'))).toBe(true)
    expect(removeButtonClasses().some((c) => c.startsWith('focus-visible:'))).toBe(true)
  })

  it('routes through the existing move and remove pipelines, unchanged', () => {
    for (const token of [
      'onClick={() => onMove(item.id, s.id)}',
      'onClick={() => onRemove(item.id)}',
      'function moveItem(id: string, newStatus: ItemStatus)',
      'const otherStatuses = COLUMNS.filter((c) => c.id !== item.status)',
    ]) {
      expect(PLANNING).toContain(token)
    }
  })

  it('adds no touch drag implementation', () => {
    // M5 exposes what already existed. It does not become a DnD slice.
    for (const forbidden of ['onPointer', 'onTouch', 'useSensor', 'DndContext', 'touchAction']) {
      expect(PLANNING).not.toContain(forbidden)
    }
    expect(PLANNING).toContain('draggable')
    expect(PLANNING).toContain('onDrop={(e) => handleDrop(e, col.id)}')
  })

  it('leaves the M4.3 layout untouched', () => {
    expect(boardClasses()).toContain('flex')
    expect(columnsAt(boardClasses(), 'md:')).toBe(4)
    expect(columnFloor()).toBe(200)
    expect(columnClasses()).toContain('md:min-w-' + '[auto]')
  })

  it('introduces no global stylesheet change', () => {
    // The coarse branch is a scoped arbitrary variant, not a new global system.
    const globals = read('app/globals.css')
    expect(globals).not.toContain('pointer: coarse')
    expect(globals).not.toContain('pointer:coarse')
  })
})
