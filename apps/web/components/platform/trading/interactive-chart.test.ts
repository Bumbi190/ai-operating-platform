/**
 * Stage 1.9A — the interactive chart's presentation boundary and its limits.
 *
 * The valuable assertions here are about the BOUNDARY, not about pixels. A
 * chart engine's rendering is its own business; what is ours is that exact
 * decimals convert one way and never come back, that a null level draws
 * nothing, that a fixture cannot dress itself as live, and that the operator
 * keeps the viewport once they touch it.
 *
 * The repository's frontend tests run in a node environment with no DOM
 * library, so these follow the established pattern: pure functions tested
 * directly, `renderToStaticMarkup` for markup, and source-structural
 * assertions only where a runtime behaviour cannot express the claim.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MARKET_DATA_ORIGINS,
  MARKET_PROPOSAL_STATUSES,
  buildFixtureSnapshot,
  priceText,
  type TradingMarketViewSnapshot,
} from '@/lib/trading/market-view'
import { ChartStatusBadges } from './ChartStatusBadges'
import {
  CHART_LEVEL_KINDS,
  CHART_ORIGIN_BADGES,
  CHART_PROPOSAL_BADGES,
  chartCandlesOf,
  chartGapsOf,
  chartLevelsOf,
  chartMarkersOf,
  chartPriceOf,
  chartPriceOrNull,
  chartTimeOf,
  chartZonesOf,
  originBadgeOf,
  proposalBadgeOf,
  shouldFitViewport,
} from './chart-presentation'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(HERE, name), 'utf8')

/**
 * Source with comments stripped.
 *
 * Several rules below are about what the CODE does, and the prose that
 * explains a rule necessarily names the thing it forbids — a comment saying
 * "the shell already owns a ResizeObserver" must not read as a second
 * observer. Executable text only.
 */
const executable = (name: string) => read(name)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

function snapshot(scenario = 'long-developing' as const): TradingMarketViewSnapshot {
  return buildFixtureSnapshot(scenario, 'NQ', '5m')
}

// ─── PriceText → chart number ─────────────────────────────────────────────────

describe('PriceText converts for presentation only', () => {
  it('routes through the market model\'s single documented door', () => {
    expect(chartPriceOf(priceText('20172.25'))).toBe(20172.25)
    expect(chartPriceOf(priceText('-3.75'))).toBe(-3.75)
  })

  it('keeps a null price null — never zero', () => {
    expect(chartPriceOrNull(null)).toBeNull()
    expect(chartPriceOrNull(null)).not.toBe(0)
    expect(chartPriceOrNull(priceText('1.50'))).toBe(1.5)
  })

  it('offers no inverse — a coordinate cannot become trading truth', () => {
    const source = read('./chart-presentation.ts')
    for (const forbidden of [
      /export function \w*ToPriceText/, /export function \w*ToTimestamp/,
      /coordinateToPrice/, /parsePriceText/,
    ]) {
      expect(source, `exposes an inverse: ${forbidden}`).not.toMatch(forbidden)
    }
  })

  it('is the only place the UI converts a price', () => {
    // Number()/parseFloat on a price anywhere else would be a second door.
    for (const file of ['./InteractiveMarketChart.tsx', './chart-overlays.ts', './ChartStatusBadges.tsx']) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const pattern of [/\bparseFloat\s*\(/, /\bparseInt\s*\(/, /priceMagnitude/]) {
        expect(code, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── Timestamp → chart time ───────────────────────────────────────────────────

describe('Timestamp converts to chart time', () => {
  it('produces epoch seconds for a UTC instant', () => {
    const base = snapshot()
    const first = base.candles[0]
    expect(chartTimeOf(first.openTime)).toBe(Math.floor(Date.parse(first.openTime) / 1000))
  })

  it('does not depend on the machine\'s timezone', () => {
    // An explicit-offset ISO value denotes one absolute instant; the same
    // instant written two ways must convert identically.
    const utc = '2026-03-02T14:30:00.000Z' as never
    const offset = '2026-03-02T15:30:00.000+01:00' as never
    expect(chartTimeOf(utc)).toBe(chartTimeOf(offset))
  })

  it('is monotonic across the fixture series', () => {
    const times = chartCandlesOf(snapshot().candles).map((c) => c.time)
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
  })

  it('formats the axis in UTC, not in the viewer\'s zone', () => {
    expect(read('./InteractiveMarketChart.tsx')).toMatch(/toISOString\(\)[\s\S]{0,40}UTC/)
  })
})

// ─── The snapshot is never mutated ────────────────────────────────────────────

describe('conversion never mutates the source snapshot', () => {
  it('leaves every candle, level, zone, gap and marker untouched', () => {
    const base = snapshot()
    const before = structuredClone(base)

    chartCandlesOf(base.candles)
    chartLevelsOf(base)
    chartZonesOf(base.liquidityZones)
    chartGapsOf(base.fairValueGaps)
    chartMarkersOf(base.manipulation)

    expect(base).toEqual(before)
  })

  it('keeps exact PriceText on the model even after conversion', () => {
    const base = snapshot()
    const entry = base.tradeProposal.entry
    chartLevelsOf(base)
    expect(base.tradeProposal.entry).toBe(entry)
    expect(typeof base.candles[0].open).toBe('string')
  })
})

// ─── Levels ───────────────────────────────────────────────────────────────────

describe('horizontal levels', () => {
  it('carries the exact text alongside the numeric coordinate', () => {
    const base = snapshot()
    for (const level of chartLevelsOf(base)) {
      expect(typeof level.exact).toBe('string')
      expect(Number.isFinite(level.price)).toBe(true)
    }
  })

  it('produces no level for a null Entry, SL, TP or BE', () => {
    const base = snapshot()
    const stripped: TradingMarketViewSnapshot = {
      ...base,
      selectedFourHourOpen: null,
      liquidity: [],
      tradeProposal: {
        ...base.tradeProposal,
        entry: null, stopLoss: null, takeProfit: null, breakEven: null,
      },
    }
    expect(chartLevelsOf(stripped)).toEqual([])
  })

  it('never substitutes zero for an absent level', () => {
    const base = snapshot()
    const stripped: TradingMarketViewSnapshot = {
      ...base,
      tradeProposal: { ...base.tradeProposal, stopLoss: null },
    }
    const kinds = chartLevelsOf(stripped).map((l) => l.kind)
    expect(kinds).not.toContain('STOP_LOSS')
    for (const level of chartLevelsOf(stripped)) {
      expect(level.price).not.toBe(0)
    }
  })

  it('emits a level for each present proposal field', () => {
    const base = snapshot()
    const kinds = new Set(chartLevelsOf(base).map((l) => l.kind))
    if (base.tradeProposal.entry !== null) expect(kinds.has('ENTRY')).toBe(true)
    if (base.tradeProposal.stopLoss !== null) expect(kinds.has('STOP_LOSS')).toBe(true)
    if (base.tradeProposal.takeProfit !== null) expect(kinds.has('TAKE_PROFIT')).toBe(true)
  })

  it('gives every declared level kind a styling branch', () => {
    const source = read('./InteractiveMarketChart.tsx')
    for (const kind of CHART_LEVEL_KINDS) {
      expect(source, `no styling branch for ${kind}`).toMatch(new RegExp(`case '${kind}'`))
    }
  })
})

// ─── Overlay mapping completeness ─────────────────────────────────────────────

describe('every annotation category has a renderer path', () => {
  it('maps zones, gaps and markers to time-and-price anchors', () => {
    const base = snapshot()
    for (const box of [...chartZonesOf(base.liquidityZones), ...chartGapsOf(base.fairValueGaps)]) {
      expect(Number.isFinite(box.fromTime)).toBe(true)
      expect(Number.isFinite(box.toTime)).toBe(true)
      expect(Number.isFinite(box.upper)).toBe(true)
      expect(Number.isFinite(box.lower)).toBe(true)
    }
    for (const marker of chartMarkersOf(base.manipulation)) {
      expect(Number.isFinite(marker.time)).toBe(true)
      expect(Number.isFinite(marker.price)).toBe(true)
    }
  })

  it('maps one overlay per model entry — none dropped', () => {
    const base = snapshot()
    expect(chartZonesOf(base.liquidityZones)).toHaveLength(base.liquidityZones.length)
    expect(chartGapsOf(base.fairValueGaps)).toHaveLength(base.fairValueGaps.length)
    expect(chartMarkersOf(base.manipulation)).toHaveLength(base.manipulation.length)
    expect(chartCandlesOf(base.candles)).toHaveLength(base.candles.length)
  })

  it('anchors overlays to coordinates the renderer converts per frame', () => {
    const overlays = read('./chart-overlays.ts')
    // Conversion happens inside draw, from the chart's own scales.
    expect(overlays).toMatch(/timeToCoordinate/)
    expect(overlays).toMatch(/priceToCoordinate/)
    // And no pixel value is cached across frames.
    expect(overlays).not.toMatch(/this\.(cachedX|cachedY|lastPixel)/)
  })

  it('uses only officially supported primitive APIs', () => {
    const overlays = read('./chart-overlays.ts')
    for (const api of ['ISeriesPrimitive', 'IPrimitivePaneView', 'IPrimitivePaneRenderer']) {
      expect(overlays).toMatch(new RegExp(api))
    }
    // No reaching into internals.
    expect(overlays).not.toMatch(/\b_private|\bunstable_|\b__internal/)
  })
})

// ─── Viewport ownership ───────────────────────────────────────────────────────

describe('the operator owns the viewport', () => {
  const NQ5 = { instrument: 'NQ', timeframe: '5m' }
  const fitted = { key: NQ5, fittedWithData: true }

  it('fits on the first frame that actually has candles', () => {
    expect(shouldFitViewport(null, NQ5, true)).toBe(true)
  })

  it('does NOT fit an empty series — replay starts before its first candle', () => {
    // Fitting nothing produces a viewport fitted to nothing, and the policy
    // below would then protect that meaningless viewport for the whole session.
    expect(shouldFitViewport(null, NQ5, false)).toBe(false)
  })

  it('still fits once data arrives after an empty first frame', () => {
    const afterEmpty = { key: NQ5, fittedWithData: false }
    expect(shouldFitViewport(afterEmpty, NQ5, true)).toBe(true)
  })

  it('fits when the instrument changes', () => {
    expect(shouldFitViewport(fitted, { instrument: 'ES', timeframe: '5m' }, true)).toBe(true)
  })

  it('fits when the timeframe changes', () => {
    expect(shouldFitViewport(fitted, { instrument: 'NQ', timeframe: '15m' }, true)).toBe(true)
  })

  it('does NOT fit on an ordinary data update — replay must not yank the view', () => {
    expect(shouldFitViewport(fitted, NQ5, true)).toBe(false)
  })

  it('does not re-fit repeatedly as replay advances', () => {
    let state = null as Parameters<typeof shouldFitViewport>[0]
    let fits = 0
    // One empty frame, then twenty frames of advancing replay.
    for (const hasCandles of [false, ...Array.from({ length: 20 }, () => true)]) {
      if (shouldFitViewport(state, NQ5, hasCandles)) fits += 1
      state = { key: NQ5, fittedWithData: (state?.fittedWithData ?? false) || hasCandles }
    }
    expect(fits).toBe(1)
  })

  it('calls fitContent only behind that policy', () => {
    // Executable code only: prose that explains the rule necessarily names
    // `fitContent()`, and a comment saying "there is deliberately no fitContent
    // on the prepend path" must not read as a third call site.
    const source = executable('./InteractiveMarketChart.tsx')
    const fits = source.match(/fitContent\(\)/g) ?? []
    // Exactly two: the guarded data effect, and the explicit reset control.
    expect(fits).toHaveLength(2)
    expect(source).toMatch(/if \(shouldFitViewport\([\s\S]{0,80}fitContent\(\)/)
  })

  it('resizes without re-fitting, so fullscreen keeps the logical viewport', () => {
    const source = executable('./InteractiveMarketChart.tsx')
    const start = source.indexOf('chart.resize(')
    // The effect ends at its dependency array; anything after it is other code.
    const end = source.indexOf('}, [width, height, ready])', start)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).not.toMatch(/fitContent/)
  })
})

// ─── The two defects manual testing caught ────────────────────────────────────

describe('the chart is sized before it is fitted', () => {
  /*
   * The bug this pins: React runs effects in declaration order. When the fit ran
   * first, it was computed for one width and then discarded by the corrective
   * resize, leaving the library's DEFAULT bar spacing — 90 candles crammed into
   * part of the plot with dead space beside them, which reads as "pan is broken".
   */
  it('declares the resize effect before the data/fit effect', () => {
    const source = executable('./InteractiveMarketChart.tsx')
    const resize = source.indexOf('chart.resize(')
    const fit = source.indexOf('fitContent()')
    expect(resize).toBeGreaterThan(-1)
    expect(fit).toBeGreaterThan(-1)
    expect(resize, 'resize must be declared before the fit').toBeLessThan(fit)
  })

  it('creates the chart at the measured size rather than a default one', () => {
    const source = executable('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/\{ width, height \}/)
  })

  it('leaves room to scroll past the newest bar', () => {
    // Whitespace, not invented candles — the library scrolls into empty space.
    expect(executable('./InteractiveMarketChart.tsx')).toMatch(/rightOffset: \d+/)
  })

  it('pins neither edge, so loaded history stays reachable', () => {
    const source = executable('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/fixLeftEdge: false/)
    expect(source).toMatch(/fixRightEdge: false/)
  })
})

describe('chart controls are actually visible', () => {
  const css = readFileSync(join(HERE, 'AtlasMarketView.module.css'), 'utf8')
  const executableCss = css.replace(/\/\*[\s\S]*?\*\//g, '')

  /*
   * The bug this pins: `--omnira-bg-1` is not a defined token anywhere. Every
   * declaration referencing it was therefore invalid and dropped, so the
   * controls computed to a fully transparent background — present, on top and
   * clickable, but invisible on a candlestick chart.
   */
  it('references no undefined design token', () => {
    expect(executableCss).not.toMatch(/--omnira-bg-1/)
  })

  it('gives the chart controls an opaque background', () => {
    const rule = executableCss.slice(executableCss.indexOf('.chartShellButton {'))
      .slice(0, 500)
    expect(rule).toMatch(/background: rgba\(/)
    // Legible at rest, not only on hover.
    expect(rule).toMatch(/opacity: 0\.9/)
  })

  it('gives keyboard focus a visible ring', () => {
    expect(executableCss).toMatch(/\.chartShellButton:focus-visible \{[\s\S]*?outline:/)
  })

  it('keeps reset and fullscreen as two separate controls', () => {
    const chart = executable('./InteractiveMarketChart.tsx')
    const shell = executable('./ChartShell.tsx')
    expect(chart).toMatch(/data-testid="chart-reset-view"/)
    expect(shell).toMatch(/data-testid="chart-fullscreen-toggle"/)
    expect(chart).not.toMatch(/chart-fullscreen-toggle/)
  })
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('chart lifecycle', () => {
  it('creates the chart once, in a mount-only effect', () => {
    const source = read('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/createChart\(/)
    // The creation effect has an empty dependency array.
    const creation = source.indexOf('createChart(')
    const closing = source.indexOf('}, [])', creation)
    expect(closing).toBeGreaterThan(creation)
  })

  it('removes the chart on unmount', () => {
    expect(read('./InteractiveMarketChart.tsx')).toMatch(/existing\.remove\(\)/)
  })

  it('clears every retained handle on teardown', () => {
    const source = read('./InteractiveMarketChart.tsx')
    for (const ref of ['priceLinesRef', 'zonesRef', 'gapsRef', 'markersRef', 'seriesRef', 'chartRef']) {
      expect(source, `${ref} not cleared`).toMatch(new RegExp(`${ref}\\.current = (null|\\[\\])`))
    }
  })

  it('adds no second ResizeObserver — the shell already owns one', () => {
    expect(executable('./InteractiveMarketChart.tsx')).not.toMatch(/ResizeObserver/)
    expect(executable('./ChartShell.tsx')).toMatch(/ResizeObserver/)
  })

  it('loads the library only after mount, never at module scope', () => {
    const source = read('./InteractiveMarketChart.tsx')
    // Types may be imported statically; the runtime module must be dynamic.
    expect(source).toMatch(/await import\('lightweight-charts'\)/)
    expect(source).not.toMatch(/^import \{[^}]*createChart/m)
  })

  it('touches no browser API at module scope', () => {
    const source = read('./InteractiveMarketChart.tsx')
    const beforeComponent = source.slice(0, source.indexOf('export function InteractiveMarketChart'))
    // The one token reader is guarded and only called from inside the effect.
    expect(beforeComponent).toMatch(/typeof window === 'undefined'/)
  })
})

// ─── Provenance badge ─────────────────────────────────────────────────────────

describe('the provenance badge reads the machine-readable field', () => {
  it('covers every declared origin', () => {
    for (const origin of MARKET_DATA_ORIGINS) {
      expect(CHART_ORIGIN_BADGES[origin]).toBeDefined()
    }
    expect(Object.keys(CHART_ORIGIN_BADGES).sort()).toEqual([...MARKET_DATA_ORIGINS].sort())
  })

  it('derives the badge from origin, not from sourceLabel prose', () => {
    const base = snapshot()
    const misleading: TradingMarketViewSnapshot = {
      ...base,
      provenance: { ...base.provenance, origin: 'FIXTURE', sourceLabel: 'LIVE Rithmic feed' },
    }
    expect(originBadgeOf(misleading).tone).toBe('fixture')
    expect(originBadgeOf(misleading).text).not.toContain('LIVE')
  })

  it('has no path from FIXTURE to a LIVE badge', () => {
    const source = executable('./chart-presentation.ts')
    // No option, flag or fallback — the mapping's only input is `origin`.
    expect(source).toMatch(/CHART_ORIGIN_BADGES\[snapshot\.provenance\.origin\]/)
    expect(source).not.toMatch(/sourceLabel/)
  })

  it('renders the fixture badge visibly in markup', () => {
    const markup = renderToStaticMarkup(createElement(ChartStatusBadges, { snapshot: snapshot() }))
    expect(markup).toContain('FIXTUR')
    expect(markup).toContain('chart-origin-badge')
  })
})

// ─── Proposal badge ───────────────────────────────────────────────────────────

describe('the proposal stays visibly non-executable', () => {
  it('covers every declared proposal status', () => {
    for (const status of MARKET_PROPOSAL_STATUSES) {
      expect(CHART_PROPOSAL_BADGES[status]).toBeDefined()
    }
    expect(Object.keys(CHART_PROPOSAL_BADGES).sort()).toEqual([...MARKET_PROPOSAL_STATUSES].sort())
  })

  it('offers no executable vocabulary', () => {
    const rendered = Object.values(CHART_PROPOSAL_BADGES).map((b) => b.text).join(' ')
    for (const forbidden of ['APPROVED', 'SUBMITTED', 'FILLED', 'ORDER', 'BUY', 'SELL']) {
      expect(rendered.toUpperCase()).not.toContain(forbidden)
    }
  })

  it('renders the fixture proposal state in markup', () => {
    const base = snapshot()
    const markup = renderToStaticMarkup(createElement(ChartStatusBadges, { snapshot: base }))
    expect(markup).toContain(proposalBadgeOf(base).text)
    expect(markup).toContain('FÖRSLAG')
  })
})

// ─── Reset control ────────────────────────────────────────────────────────────

describe('the reset control', () => {
  it('exists with an accessible label and its own test id', () => {
    const source = read('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/aria-label="Återställ vy"/)
    expect(source).toMatch(/data-testid="chart-reset-view"/)
  })

  it('does not overload the fullscreen control', () => {
    const shell = read('./ChartShell.tsx')
    expect(shell).toMatch(/data-testid="chart-fullscreen-toggle"/)
    expect(read('./InteractiveMarketChart.tsx')).not.toMatch(/chart-fullscreen-toggle/)
  })

  it('fits content rather than reloading data', () => {
    const source = read('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/resetView[\s\S]{0,120}fitContent\(\)/)
  })
})

// ─── Fullscreen is unchanged ──────────────────────────────────────────────────

describe('fullscreen remains the existing shell implementation', () => {
  it('keeps ChartShell as the only fullscreen owner', () => {
    const shell = read('./ChartShell.tsx')
    expect(shell).toMatch(/requestFullscreen/)
    expect(shell).toMatch(/fullscreenOwnsEscape/)
    // The chart component must not grow a second implementation.
    const chart = read('./InteractiveMarketChart.tsx')
    expect(chart).not.toMatch(/requestFullscreen|exitFullscreen|fullscreenElement/)
  })
})

// ─── Stage 1.9B: historical paging in the chart ───────────────────────────────

describe('historical prepend preserves the viewport', () => {
  const source = executable('./InteractiveMarketChart.tsx')

  it('reads the visible range before writing data and shifts it after', () => {
    // The whole rule: prepending shifts every logical index, so the range must
    // be shifted by exactly the number of bars added or the operator jumps.
    expect(source).toMatch(/getVisibleLogicalRange\(\)/)
    expect(source).toMatch(/setVisibleLogicalRange\(\{[\s\S]{0,120}rangeBefore\.from \+ prepended/)
    expect(source).toMatch(/rangeBefore\.to \+ prepended/)
  })

  it('shifts by the model\'s own count rather than recomputing one', () => {
    // The view and the machine cannot disagree if only one of them counts.
    expect(source).toMatch(/history\.model\.lastPrepended/)
  })

  it('never calls fitContent on the prepend path', () => {
    const start = source.indexOf('const rangeBefore')
    const end = source.indexOf('renderedCountRef.current')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(source.slice(start, end)).not.toMatch(/fitContent/)
  })

  it('never calls scrollToRealTime anywhere', () => {
    // Snapping to the newest bar is the exact opposite of reading history.
    expect(source).not.toMatch(/scrollToRealTime/)
    expect(source).not.toMatch(/scrollToPosition/)
  })

  it('subscribes and unsubscribes the visible-range listener', () => {
    expect(source).toMatch(/subscribeVisibleLogicalRangeChange/)
    expect(source).toMatch(/unsubscribeVisibleLogicalRangeChange/)
  })

  it('asks the machine whether to load rather than deciding itself', () => {
    expect(source).toMatch(/shouldLoadOlder\(/)
    // No ad-hoc threshold comparison in the component.
    expect(source).not.toMatch(/range\.from\s*[<>]=?\s*\d/)
  })

  it('takes its history source by prop, provider-neutrally', () => {
    expect(source).toMatch(/historySource/)
    expect(source).toMatch(/HistoricalCandleSource/)
    for (const provider of [/rithmic/i, /tradovate/i, /projectx/i]) {
      expect(source, String(provider)).not.toMatch(provider)
    }
  })
})

describe('the history trigger is armed, never inferred', () => {
  const source = executable('./InteractiveMarketChart.tsx')

  it('arms only after the initial fit, one frame later', () => {
    /*
     * Order is the entire mechanism: fit, then a frame, then arm. A chart that
     * armed before the fit landed would read the library's unfitted startup
     * range — deeply negative — as an operator who had dragged into history.
     */
    const branch = source.slice(source.indexOf('shouldFitViewport('))
    const fit = branch.indexOf('fitContent()')
    const frame = branch.indexOf('requestAnimationFrame(')
    const armed = branch.indexOf('armViewport(')

    expect(fit).toBeGreaterThan(-1)
    expect(frame).toBeGreaterThan(fit)
    expect(armed).toBeGreaterThan(frame)
  })

  it('never arms on a timer', () => {
    /*
     * A frame is suspended on a hidden page; a timer is not. Arming on a timer
     * would vouch for a fit that was never painted — which is precisely the
     * hidden-page case, and the one where staying disarmed is correct.
     */
    expect(source).not.toMatch(/setTimeout|setInterval|requestIdleCallback/)
  })

  it('drops a pending arming frame when the chart goes away', () => {
    expect(source).toMatch(/cancelAnimationFrame/)
  })

  it('captures the generation before the frame, not inside it', () => {
    const branch = source.slice(source.indexOf('shouldFitViewport('))
    const captured = branch.indexOf('history.model.generation')
    const frame = branch.indexOf('requestAnimationFrame(')
    expect(captured).toBeGreaterThan(-1)
    expect(captured).toBeLessThan(frame)
  })

  it('keys the fit on the model\'s subject, not on the incoming snapshot', () => {
    /*
     * The snapshot changes one render before the model does. Keyed on it, the
     * pass holding the OLD candles claims the new subject's fit, the pass that
     * actually draws the new data skips it — and since arming rides on the fit,
     * the trigger would never re-arm after a switch.
     */
    const key = source.slice(source.indexOf('const key: ViewportKey'), source.indexOf('const hasCandles'))
    expect(key).toMatch(/history\.model\.subject\.instrument/)
    expect(key).toMatch(/history\.model\.subject\.timeframe/)
    expect(key).not.toMatch(/snapshot\./)
  })

  it('leaves the range handler with no arming logic of its own', () => {
    /*
     * One gate, in the machine. A handler that also consulted arming could
     * eventually consult it differently.
     */
    const start = source.indexOf('const onRangeChange')
    const end = source.indexOf('subscribeVisibleLogicalRangeChange', start)
    const handler = source.slice(start, end)
    expect(handler).toMatch(/shouldLoadOlder\(/)
    expect(handler).not.toMatch(/triggerArmed|armViewport|requestAnimationFrame/)
  })

  it('does not disarm on resize or fullscreen', () => {
    /*
     * Resizing reflows a viewport that is already established; it is not a new
     * subject and must not cost the operator their armed trigger.
     */
    const resize = source.slice(source.indexOf('chart.resize(width, height)') - 400,
      source.indexOf('chart.resize(width, height)') + 200)
    expect(resize).not.toMatch(/armViewport|triggerArmed|VIEWPORT_ARMED/)
    expect(executable('./ChartShell.tsx')).not.toMatch(/armViewport|triggerArmed|VIEWPORT_ARMED/)
  })
})

describe('the history status surface', () => {
  const status = executable('./ChartHistoryStatus.tsx')

  it('covers every history state exactly once', () => {
    for (const state of [
      'IDLE', 'LOADING_INITIAL', 'READY', 'LOADING_OLDER',
      'EXHAUSTED', 'UNAVAILABLE', 'ERROR',
    ]) {
      expect(status, `no branch for ${state}`).toMatch(new RegExp(`${state}:`))
    }
  })

  it('offers retry only for failures, never for exhaustion', () => {
    expect(status).toMatch(/EXHAUSTED: \{[^}]*retryable: false/)
    expect(status).toMatch(/UNAVAILABLE: \{[^}]*retryable: true/)
    expect(status).toMatch(/ERROR: \{[^}]*retryable: true/)
  })

  it('does not block the chart while loading', () => {
    // A marker, not a spinner that replaces the plot.
    expect(status).not.toMatch(/Spinner|overlay|backdrop-filter: blur\(2/)
    const css = readFileSync(join(HERE, 'AtlasMarketView.module.css'), 'utf8')
    expect(css).toMatch(/\.chartHistoryStatus \{[\s\S]*?pointer-events: none/)
  })

  it('shows the loaded count, so a failure cannot read as data loss', () => {
    expect(status).toMatch(/loadedCount/)
  })
})

// ─── Boundaries ───────────────────────────────────────────────────────────────

describe('Stage 1.9A boundaries', () => {
  const FILES = [
    './InteractiveMarketChart.tsx', './chart-overlays.ts',
    './chart-presentation.ts', './ChartStatusBadges.tsx',
  ]
  const code = (f: string) => read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('imports no provider or internal authority module', () => {
    for (const file of FILES) {
      expect(code(file), file).not.toMatch(/lib\/trading\/provider/)
      expect(code(file), file).not.toMatch(/(^|\/)internal(\/|')/)
    }
  })

  it('declares no order path', () => {
    for (const file of FILES) {
      for (const pattern of [
        /submitOrder/, /cancelOrder/, /modifyOrder/, /placeOrder/, /closePosition/,
        /\bflatten\b/, /buyButton/i, /sellButton/i,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('makes no network call and names no market-data provider', () => {
    for (const file of FILES) {
      for (const pattern of [
        /\bfetch\s*\(/, /new\s+WebSocket/, /XMLHttpRequest/,
        /rithmic/i, /tradovate/i, /projectx/i,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('integrates no TradingView account, session or broker path', () => {
    for (const file of FILES) {
      for (const pattern of [
        /oauth/i, /\bcookie/i, /tradingview\.com\/(?!$)[a-z]*\/?(chart|u|broker)/i,
        /widget\.tradingview/i, /savedLayout/i, /brokerAuth/i,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('creates no authority', () => {
    for (const file of FILES) {
      for (const pattern of [
        /RiskClearance/, /PropClearance/, /ApprovalGrant/, /ExecutionIntent/,
        /openExecutionGate/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('keeps the required TradingView attribution visible', () => {
    const source = read('./InteractiveMarketChart.tsx')
    expect(source).toMatch(/Charts by TradingView/)
    expect(source).toMatch(/https:\/\/www\.tradingview\.com/)
    // The built-in logo is disabled, so the attribution must be ours and present.
    expect(source).toMatch(/attributionLogo: false/)
  })
})
