/**
 * Chart colours: which scope they are read from, and how a fair value gap's
 * lifecycle state is painted.
 *
 * Two defects this file pins (Phase 17):
 *
 * 1. The palette was read from `document.documentElement`, but the generation
 *    tokens live on the shell's `<main data-ui-generation>`. `--os-accent` is
 *    indigo at the root and cyan in vNext, so the chart painted legacy indigo
 *    inside the vNext workspace.
 * 2. The gap resolver compared against `'FILLED'`, a state the model does not
 *    have, so OPEN, MITIGATED and INVERTED gaps painted identically.
 *
 * The renderer is exercised through a recording canvas context rather than a
 * DOM, in the style of the rest of this directory.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FVG_STATES } from '@/lib/trading/market-view'
import {
  CHART_PALETTE_TOKENS,
  fairValueGapStyle,
  readChartPalette,
  type ChartPalette,
} from './chart-palette'
import { BoxPrimitive } from './chart-overlays'
import type { ChartBox } from './chart-presentation'

const read = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')

/** Source with comments stripped — prose legitimately names what it forbids. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const PALETTE = readChartPalette(null)

const box = (state: string, variant = 'LONG'): { state: string; variant: string; label: string } => ({
  state,
  variant,
  label: `${state} · ${variant}`,
})

/** The parts of a style that make two gaps look different. */
const appearance = (state: string, variant = 'LONG') => {
  const style = fairValueGapStyle(box(state, variant), PALETTE)
  return JSON.stringify({ fill: style.fill, stroke: style.stroke, dash: style.dash ?? null })
}

const alpha = (rgba: string): number => {
  const match = rgba.match(/rgba\([^)]*,\s*([\d.]+)\)/)
  return match ? Number(match[1]) : 1
}

// ─── Fair value gap lifecycle ─────────────────────────────────────────────────

describe('fair value gap styling follows the lifecycle state', () => {
  it('paints OPEN, MITIGATED, INVERTED and UNKNOWN as four different objects', () => {
    const looks = FVG_STATES.map((state) => appearance(state))
    expect(new Set(looks).size).toBe(FVG_STATES.length)
  })

  it('covers every declared state, and passes the model label through untouched', () => {
    for (const state of FVG_STATES) {
      const style = fairValueGapStyle(box(state), PALETTE)
      expect(style.label).toBe(`${state} · LONG`)
      expect(style.fill.length).toBeGreaterThan(0)
      expect(style.stroke.length).toBeGreaterThan(0)
    }
  })

  it('colours an OPEN gap by its direction', () => {
    expect(appearance('OPEN', 'LONG')).not.toBe(appearance('OPEN', 'SHORT'))
    expect(fairValueGapStyle(box('OPEN', 'LONG'), PALETTE).stroke).toBe(PALETTE.violet)
    expect(fairValueGapStyle(box('OPEN', 'SHORT'), PALETTE).stroke).toBe(PALETTE.rose)
  })

  it('draws the iFVG (INVERTED) dashed and an OPEN gap solid', () => {
    expect(fairValueGapStyle(box('INVERTED'), PALETTE).dash?.length ?? 0).toBeGreaterThan(0)
    expect(fairValueGapStyle(box('OPEN'), PALETTE).dash).toBeUndefined()
  })

  it('fades a MITIGATED gap below an OPEN one', () => {
    const open = fairValueGapStyle(box('OPEN'), PALETTE)
    const mitigated = fairValueGapStyle(box('MITIGATED'), PALETTE)
    expect(alpha(mitigated.fill)).toBeLessThan(alpha(open.fill))
    expect(mitigated.dash).toBeUndefined()
  })

  it('never lends an UNKNOWN gap an OPEN gap\'s appearance', () => {
    expect(appearance('UNKNOWN')).not.toBe(appearance('OPEN', 'LONG'))
    expect(appearance('UNKNOWN')).not.toBe(appearance('OPEN', 'SHORT'))
    expect(fairValueGapStyle(box('UNKNOWN'), PALETTE).dash?.length ?? 0).toBeGreaterThan(0)
  })

  it('treats a state the resolver has not learned as UNKNOWN, not as OPEN', () => {
    expect(appearance('SOMETHING_NEW')).toBe(appearance('UNKNOWN'))
  })

  it('compares against no state the model does not declare', () => {
    // The original defect: `box.state === 'FILLED'` could never be true.
    for (const file of ['./chart-palette.ts', './InteractiveMarketChart.tsx']) {
      expect(code(file), `${file} still names FILLED`).not.toMatch(/'FILLED'/)
    }
  })

  it('agrees with the deterministic SVG chart, which marks the same states', () => {
    const css = read('./AtlasMarketView.module.css')
    for (const state of ['INVERTED', 'MITIGATED', 'UNKNOWN']) {
      expect(css, `no SVG rule for ${state}`).toMatch(new RegExp(`\\.chartFvg\\[data-state='${state}'\\]`))
    }
    expect(css).toMatch(/\.chartFvg\[data-direction='SHORT'\]/)
    // Dashed in both renderers: an iFVG and an unknown gap.
    expect(css).toMatch(/\.chartFvg\[data-state='INVERTED'\] \{[^}]*stroke-dasharray/)
    expect(css).toMatch(/\.chartFvg\[data-state='UNKNOWN'\] \{[^}]*stroke-dasharray/)
  })
})

// ─── Palette scope ────────────────────────────────────────────────────────────

describe('the chart palette is read from the chart\'s own scope', () => {
  it('maps every palette entry to its own token', () => {
    const values = Object.fromEntries(
      Object.values(CHART_PALETTE_TOKENS).map(([name], index) => [name, `value-${index}`]),
    )
    const palette = readChartPalette({ getPropertyValue: (name) => values[name] ?? '' })
    const keys = Object.keys(CHART_PALETTE_TOKENS) as (keyof ChartPalette)[]
    keys.forEach((key) => {
      expect(palette[key], key).toBe(values[CHART_PALETTE_TOKENS[key][0]])
    })
    expect(keys.sort()).toEqual(Object.keys(palette).sort())
  })

  it('takes the accent from --os-accent, so the generation scope decides it', () => {
    expect(CHART_PALETTE_TOKENS.accent[0]).toBe('--os-accent')
    const vnext = readChartPalette({ getPropertyValue: (n) => (n === '--os-accent' ? ' #22d3ee ' : '') })
    const legacy = readChartPalette({ getPropertyValue: (n) => (n === '--os-accent' ? '#6366f1' : '') })
    expect(vnext.accent).toBe('#22d3ee')
    expect(legacy.accent).toBe('#6366f1')
  })

  it('falls back to the design value for a missing or blank token, never to an empty colour', () => {
    const blank = readChartPalette({ getPropertyValue: () => '   ' })
    const none = readChartPalette(null)
    for (const key of Object.keys(CHART_PALETTE_TOKENS) as (keyof ChartPalette)[]) {
      expect(blank[key]).toBe(CHART_PALETTE_TOKENS[key][1])
      expect(none[key]).toBe(CHART_PALETTE_TOKENS[key][1])
    }
  })

  it('reads computed style from the chart container, not from the document root', () => {
    const source = code('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/readChartPalette\(tokenSourceOf\(container\)\)/)
    expect(source).toMatch(/getComputedStyle\(element\)/)
    expect(source).not.toMatch(/document\.documentElement/)
  })

  it('confirms the premise: the accent differs between the root and the vNext scope', () => {
    const globals = readFileSync(
      fileURLToPath(new URL('../../../app/globals.css', import.meta.url)),
      'utf8',
    )
    const root = globals.match(/:root \{[\s\S]*?--os-accent:\s*([^;]+);/)?.[1].trim()
    const vnext = globals.match(/\[data-ui-generation='vnext'\] \{[\s\S]*?--os-accent:\s*([^;]+);/)?.[1].trim()
    expect(root).toBeDefined()
    expect(vnext).toBeDefined()
    expect(root).not.toBe(vnext)
  })
})

// ─── The box renderer honours the style ───────────────────────────────────────

interface Recorded {
  readonly op: string
  readonly value?: unknown
}

/** A canvas context that records what the renderer asked for, in order. */
function recordingTarget(log: Recorded[]) {
  const context = {
    set fillStyle(value: string) { log.push({ op: 'fillStyle', value }) },
    set strokeStyle(value: string) { log.push({ op: 'strokeStyle', value }) },
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set textBaseline(_value: string) {},
    fillRect: () => log.push({ op: 'fillRect' }),
    strokeRect: () => log.push({ op: 'strokeRect' }),
    setLineDash: (value: number[]) => log.push({ op: 'setLineDash', value: [...value] }),
    fillText: (value: string) => log.push({ op: 'fillText', value }),
  }
  return {
    useMediaCoordinateSpace: (draw: (scope: { context: unknown; mediaSize: { width: number; height: number } }) => void) =>
      draw({ context, mediaSize: { width: 1000, height: 500 } }),
  }
}

function drawBox(style: ReturnType<typeof fairValueGapStyle>): Recorded[] {
  const chartBox: ChartBox = {
    id: 'g', fromTime: 100, toTime: 200, upper: 10, lower: 5, label: style.label, variant: 'LONG', state: 'X',
  }
  const primitive = new BoxPrimitive([chartBox], () => style)
  primitive.attached({
    chart: { timeScale: () => ({ timeToCoordinate: (t: number) => t }) },
    series: { priceToCoordinate: (p: number) => 400 - p * 20 },
  } as never)
  const log: Recorded[] = []
  const renderer = primitive.paneViews()[0].renderer()
  renderer?.draw(recordingTarget(log) as never)
  return log
}

describe('the box renderer paints the resolved style', () => {
  it('dashes the edge for a dashed style and resets the dash afterwards', () => {
    const log = drawBox(fairValueGapStyle(box('INVERTED'), PALETTE))
    const stroke = log.findIndex((entry) => entry.op === 'strokeRect')
    const dashBefore = log.slice(0, stroke).filter((entry) => entry.op === 'setLineDash').at(-1)
    const dashAfter = log.slice(stroke).find((entry) => entry.op === 'setLineDash')
    expect(dashBefore?.value).toEqual([4, 2])
    expect(dashAfter?.value).toEqual([])
  })

  it('draws a solid edge for a solid style', () => {
    const log = drawBox(fairValueGapStyle(box('OPEN'), PALETTE))
    const stroke = log.findIndex((entry) => entry.op === 'strokeRect')
    const dashBefore = log.slice(0, stroke).filter((entry) => entry.op === 'setLineDash').at(-1)
    expect(dashBefore?.value).toEqual([])
  })

  it('writes the label in the label colour when one is given', () => {
    const style = fairValueGapStyle(box('MITIGATED'), PALETTE)
    expect(style.labelColor).toBeDefined()
    const log = drawBox(style)
    const text = log.findIndex((entry) => entry.op === 'fillText')
    const colour = log.slice(0, text).filter((entry) => entry.op === 'fillStyle').at(-1)
    expect(colour?.value).toBe(style.labelColor)
  })

  it('writes the label in the stroke colour otherwise', () => {
    const style = fairValueGapStyle(box('OPEN'), PALETTE)
    const log = drawBox(style)
    const text = log.findIndex((entry) => entry.op === 'fillText')
    const colour = log.slice(0, text).filter((entry) => entry.op === 'fillStyle').at(-1)
    expect(colour?.value).toBe(style.stroke)
  })
})
