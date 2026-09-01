'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { TradingMarketViewSnapshot } from '@/lib/trading/market-view'
import { MarketChart } from './MarketChart'
import { BoxPrimitive, MarkerPrimitive, type BoxStyle } from './chart-overlays'
import {
  chartCandlesOf,
  chartGapsOf,
  chartLevelsOf,
  chartMarkersOf,
  chartZonesOf,
  shouldFitViewport,
  type ChartLevelKind,
  type ViewportKey,
  type ViewportState,
} from './chart-presentation'
import {
  createFixtureHistoricalSource,
  shouldLoadOlder,
  type HistoricalCandleSource,
} from '@/lib/trading/market-data'
import { useHistoricalCandles } from './useHistoricalCandles'
import { ChartHistoryStatus } from './ChartHistoryStatus'
import styles from './AtlasMarketView.module.css'

/**
 * Omnira Trading — the interactive market chart.
 *
 * WHAT CHANGED, AND WHAT DID NOT
 * ──────────────────────────────
 * The chart is now a real financial chart: it pans, zooms, has independent time
 * and price scales, and carries a crosshair. What did NOT change is who owns the
 * truth. `TradingMarketViewSnapshot` is still the source of presentation truth;
 * Lightweight Charts is only the renderer and the interaction engine.
 *
 * It detects nothing. No liquidity, no fair value gap, no manipulation, no
 * grade, no entry, no stop, no target, no contract. Every annotation arrives
 * already decided, and this component draws what it was handed.
 *
 * SSR AND THE FALLBACK
 * ────────────────────
 * The library is loaded with a dynamic `import()` inside the mount effect, so
 * nothing from it is ever evaluated during a server render and no browser API is
 * touched without a DOM. Until the chart exists, the deterministic SVG
 * `MarketChart` renders in its place — which also means the server produces the
 * same markup it always did, and the existing `renderToStaticMarkup` regression
 * tests keep working against the same component they always tested.
 *
 * MEASUREMENT COMES FROM THE SHELL
 * ────────────────────────────────
 * `ChartShell` already owns a `ResizeObserver` and already owns fullscreen.
 * This component takes the measured box as props and resizes the chart to it —
 * so there is exactly one observer, one fullscreen implementation, and
 * fullscreen reflow is automatic because the shell's box is what changes.
 */

/** Resolve an Omnira design token to a concrete colour for the canvas. */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

interface Palette {
  readonly aqua: string
  readonly rose: string
  readonly emerald: string
  readonly gold: string
  readonly goldSoft: string
  readonly violet: string
  readonly accent: string
  readonly text2: string
  readonly text3: string
  readonly edge: string
}

function readPalette(): Palette {
  return {
    aqua: token('--omnira-aqua', '#a5f3fc'),
    rose: token('--omnira-rose', '#f87171'),
    emerald: token('--omnira-emerald', '#34d399'),
    gold: token('--omnira-gold', '#d4a574'),
    goldSoft: token('--omnira-gold-soft', '#e8c89a'),
    violet: token('--omnira-violet', '#8b5cf6'),
    accent: token('--os-accent', '#22d3ee'),
    text2: token('--omnira-text-2', 'rgba(255,255,255,0.72)'),
    text3: token('--omnira-text-3', 'rgba(255,255,255,0.60)'),
    edge: token('--omnira-edge', 'rgba(255,255,255,0.10)'),
  }
}

/** Atlas level styling. One place, so a level cannot acquire a colour by accident. */
function levelStyle(kind: ChartLevelKind, palette: Palette): {
  color: string
  lineStyle: number
} {
  // 0 Solid · 1 Dotted · 2 Dashed · 3 LargeDashed · 4 SparseDotted
  switch (kind) {
    case 'FOUR_HOUR_OPEN': return { color: palette.accent, lineStyle: 0 }
    case 'LIQUIDITY': return { color: palette.gold, lineStyle: 2 }
    case 'ENTRY': return { color: palette.aqua, lineStyle: 0 }
    case 'STOP_LOSS': return { color: palette.rose, lineStyle: 2 }
    case 'TAKE_PROFIT': return { color: palette.emerald, lineStyle: 2 }
    case 'BREAK_EVEN': return { color: palette.goldSoft, lineStyle: 1 }
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

/** Zones are gold; gaps are violet. The model's own state decides the emphasis. */
function zoneStyle(palette: Palette) {
  return (box: { state: string; label: string }): BoxStyle => ({
    fill: box.state === 'SWEPT' ? 'rgba(212,165,116,0.06)' : 'rgba(212,165,116,0.13)',
    stroke: box.state === 'SWEPT' ? 'rgba(212,165,116,0.35)' : palette.gold,
    label: box.label,
  })
}

function gapStyle(palette: Palette) {
  return (box: { state: string; variant: string; label: string }): BoxStyle => ({
    fill: box.state === 'FILLED' ? 'rgba(139,92,246,0.05)' : 'rgba(139,92,246,0.12)',
    stroke: box.state === 'FILLED' ? 'rgba(139,92,246,0.32)' : palette.violet,
    label: box.label,
  })
}

export interface InteractiveMarketChartProps {
  readonly snapshot: TradingMarketViewSnapshot
  /** Measured container box from `ChartShell`. Absent on the server. */
  readonly width?: number
  readonly height?: number
  /**
   * Where older candles come from.
   *
   * Provider-neutral by type. Defaults to the deterministic fixture history so
   * the chart has something to page through today; a real Market Data Provider
   * replaces this argument and nothing else.
   */
  readonly historySource?: HistoricalCandleSource
}

/** One shared fixture source, so a re-render does not rebuild the generator. */
const DEFAULT_HISTORY_SOURCE = createFixtureHistoricalSource()

export function InteractiveMarketChart({
  snapshot,
  width,
  height,
  historySource = DEFAULT_HISTORY_SOURCE,
}: InteractiveMarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const zonesRef = useRef<BoxPrimitive | null>(null)
  const gapsRef = useRef<BoxPrimitive | null>(null)
  const markersRef = useRef<MarkerPrimitive | null>(null)
  const paletteRef = useRef<Palette | null>(null)
  /** What the current viewport was fitted for, and whether data existed. */
  const viewportRef = useRef<ViewportState | null>(null)
  const [ready, setReady] = useState(false)

  /*
   * Paged history. The chart renders `history.model.candles`, which starts as
   * the snapshot's own candles and grows BACKWARDS as older pages arrive — so
   * every Atlas annotation stays anchored to the bars it was authored against.
   */
  const history = useHistoricalCandles({
    source: historySource,
    instrument: snapshot.instrument,
    timeframe: snapshot.timeframe,
    baseCandles: snapshot.candles,
  })
  const historyRef = useRef(history)
  historyRef.current = history
  /** How many bars the previous render had, so a prepend can be measured. */
  const renderedCountRef = useRef(0)
  /** The pending arming frame, so it can be dropped if the chart goes away. */
  const armFrameRef = useRef<number | null>(null)

  // ─── Create the chart exactly once ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    let disposed = false
    let chart: IChartApi | null = null

    void (async () => {
      /*
       * Dynamic import: the library is never evaluated on the server, and never
       * before there is a DOM to attach to.
       */
      const lib = await import('lightweight-charts')
      if (disposed) return

      const palette = readPalette()
      paletteRef.current = palette

      chart = lib.createChart(container, {
        layout: {
          background: { type: lib.ColorType.Solid, color: 'transparent' },
          textColor: palette.text3,
          fontSize: 10,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        rightPriceScale: { borderColor: palette.edge, scaleMargins: { top: 0.12, bottom: 0.12 } },
        timeScale: {
          borderColor: palette.edge,
          timeVisible: true,
          secondsVisible: false,
          /*
           * Room to the right of the newest bar, in bar widths.
           *
           * This is WHITESPACE, not invented candles — the library scrolls into
           * empty space by design. Without it the newest bar is welded to the
           * right edge and a drag has nowhere to go, which reads as "panning is
           * broken" rather than "you are already at the end".
           */
          rightOffset: 6,
          /* Neither edge is pinned, so history is freely reachable. */
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        crosshair: {
          mode: lib.CrosshairMode.Normal,
          vertLine: { color: palette.text3, width: 1, style: 2, labelBackgroundColor: '#0b1020' },
          horzLine: { color: palette.text3, width: 1, style: 2, labelBackgroundColor: '#0b1020' },
        },
        localization: {
          /*
           * UTC, explicitly. The market instant is absolute; formatting it in
           * the viewer's local zone would make two people reading the same
           * candle disagree about when it happened. This matches the axis the
           * SVG chart has always drawn.
           */
          timeFormatter: (time: unknown) =>
            new Date((time as number) * 1000).toISOString().slice(11, 16) + ' UTC',
        },
        handleScroll: true,
        handleScale: true,
        autoSize: false,
        /*
         * Created at the measured size, never at a default one. A chart born
         * at the wrong width computes its first layout for that width, and
         * the fit that follows is then thrown away by the corrective resize.
         */
        ...(width !== undefined && height !== undefined && width > 0 && height > 0
          ? { width, height }
          : {}),
      })

      const series = chart.addSeries(lib.CandlestickSeries, {
        upColor: palette.emerald,
        downColor: palette.rose,
        borderUpColor: palette.emerald,
        borderDownColor: palette.rose,
        wickUpColor: palette.emerald,
        wickDownColor: palette.rose,
        priceLineVisible: false,
        lastValueVisible: false,
      })

      const zones = new BoxPrimitive([], zoneStyle(palette))
      const gaps = new BoxPrimitive([], gapStyle(palette))
      const markers = new MarkerPrimitive([], { fill: palette.violet, text: palette.text2 })
      series.attachPrimitive(zones)
      series.attachPrimitive(gaps)
      series.attachPrimitive(markers)

      chartRef.current = chart
      seriesRef.current = series
      zonesRef.current = zones
      gapsRef.current = gaps
      markersRef.current = markers
      setReady(true)
    })()

    return () => {
      disposed = true
      /*
       * One teardown for everything the chart owns. `chart.remove()` disposes
       * the series, its attached primitives, its price lines and every internal
       * subscription, so there is no orphan left behind and no second chart can
       * accumulate across a remount.
       */
      priceLinesRef.current = []
      zonesRef.current = null
      gapsRef.current = null
      markersRef.current = null
      seriesRef.current = null
      const existing = chartRef.current ?? chart
      chartRef.current = null
      if (existing !== null) existing.remove()
      setReady(false)
    }
  }, [])

  /*
   * ─── Resize to the shell's measured box ───────────────────────────────────
   *
   * DECLARED BEFORE THE DATA EFFECT ON PURPOSE. React runs effects in
   * declaration order, and the fit below must be computed against the size the
   * chart will actually have. With the order reversed the chart fits at one
   * width and the corrective resize then discards that range, leaving the
   * library's default bar spacing and the candles crammed into part of the
   * plot — which reads to an operator as "panning does not work".
   */
  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) return
    if (width === undefined || height === undefined) return
    if (width <= 0 || height <= 0) return
    /*
     * Resizing preserves the logical viewport: the chart keeps the bar range it
     * was showing. Entering and leaving fullscreen therefore reflows without
     * discarding where the operator had navigated to.
     */
    chart.resize(width, height)
  }, [width, height, ready])

  // ─── Data, overlays, and the fit policy ─────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    const palette = paletteRef.current
    if (chart === null || series === null || palette === null) return

    const candles = history.model.candles

    /*
     * VIEWPORT PRESERVATION ACROSS A PREPEND — the load-bearing UX rule.
     *
     * Prepending bars shifts every logical index by the number added, so the
     * range the operator was looking at now names DIFFERENT bars. Reading the
     * range before the write and shifting it by exactly that many afterwards
     * leaves the same candles under the same pixels.
     *
     * There is deliberately no `fitContent()` and no `scrollToRealTime()` on
     * this path: either would throw the operator back to the newest bar, which
     * is precisely what someone scrolling into history does not want.
     */
    const timeScale = chart.timeScale()
    const prepended = history.model.lastPrepended
    const rangeBefore = prepended > 0 ? timeScale.getVisibleLogicalRange() : null

    series.setData(
      chartCandlesOf(candles).map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    )

    if (rangeBefore !== null) {
      timeScale.setVisibleLogicalRange({
        from: rangeBefore.from + prepended,
        to: rangeBefore.to + prepended,
      })
    }
    renderedCountRef.current = candles.length

    // Price lines are recreated wholesale: a level that disappeared from the
    // snapshot must disappear from the chart, and a stale line is a lie.
    for (const line of priceLinesRef.current) series.removePriceLine(line)
    priceLinesRef.current = chartLevelsOf(snapshot).map((level) => {
      const style = levelStyle(level.kind, palette)
      return series.createPriceLine({
        price: level.price,
        color: style.color,
        lineWidth: 1,
        lineStyle: style.lineStyle,
        axisLabelVisible: true,
        title: level.label,
      })
    })

    zonesRef.current?.setBoxes(chartZonesOf(snapshot.liquidityZones))
    gapsRef.current?.setBoxes(chartGapsOf(snapshot.fairValueGaps))
    markersRef.current?.setMarkers(chartMarkersOf(snapshot.manipulation))

    /*
     * THE VIEWPORT POLICY, IN ONE PLACE.
     *
     * Fit on first mount and when the thing being looked at changes. Do NOT fit
     * on ordinary data updates — replay advancing one candle must not yank an
     * operator back from wherever they were inspecting.
     */
    /*
     * THE KEY COMES FROM THE MODEL, NOT THE SNAPSHOT, and the difference is not
     * cosmetic. A new snapshot reaches this effect one render before the model
     * has switched to it — the hook dispatches SUBJECT_CHANGED in the same
     * commit, so this pass still holds the previous subject's candles. Keyed on
     * the snapshot, that pass would "fit" the old data under the new key and
     * claim the fit; the pass that actually draws the new data would then find
     * the key unchanged, skip its fit, and — since arming happens only with a
     * fit — leave the trigger disarmed for good.
     *
     * The model's subject and its candles are set by the same action, so they
     * cannot disagree. Keying on it means the chart fits the data it is drawing.
     */
    const key: ViewportKey = {
      instrument: history.model.subject.instrument,
      timeframe: history.model.subject.timeframe,
    }
    const hasCandles = candles.length > 0
    if (shouldFitViewport(viewportRef.current, key, hasCandles)) {
      chart.timeScale().fitContent()
      /*
       * ARMING THE HISTORY TRIGGER — one frame after the fit, and only here.
       *
       * `fitContent()` does not take effect synchronously; the chart applies it
       * when it next paints. Until then `getVisibleLogicalRange()` still
       * reports the library's startup default, which is deeply negative and
       * therefore looks exactly like an operator who has dragged far into the
       * whitespace before the oldest bar. Reading that range as navigation is
       * how a chart loads its entire history on mount without being asked.
       *
       * So the trigger is armed from a frame scheduled AFTER the fit was
       * requested: by the time it runs, the fit it is vouching for has been
       * applied. Reaching this branch already means a non-empty dataset —
       * `shouldFitViewport` refuses to fit an empty series — so "rendered,
       * fitted, settled" are all established before any range is trusted.
       *
       * IF THE FRAME NEVER RUNS, THE TRIGGER NEVER ARMS. A hidden page
       * suspends `requestAnimationFrame`, and a suspended callback leaves the
       * chart inert rather than guessing. That is the safe failure, and it is
       * the reason this is a frame and not a timeout: a timer would fire on a
       * hidden page and arm a viewport that was never painted.
       */
      const armingGeneration = history.model.generation
      armFrameRef.current = window.requestAnimationFrame(() => {
        armFrameRef.current = null
        historyRef.current.armViewport(armingGeneration)
      })
    }
    /*
     * Record whether this pass actually had data to fit. Replay's first frames
     * are legitimately empty, and a fit performed then must not count as the
     * one fit this chart is allowed before the operator takes over.
     */
    viewportRef.current = {
      key,
      fittedWithData: (viewportRef.current?.fittedWithData ?? false) || hasCandles,
    }
  }, [snapshot, history.model, ready])

  /*
   * Only on unmount. Deliberately NOT cleanup of the effect above: that effect
   * re-runs on every data update, and cancelling there would let an ordinary
   * replay tick between the fit and its frame leave the chart disarmed forever.
   * Staleness is handled by the generation the frame carries, not by cancelling.
   */
  useEffect(() => () => {
    if (armFrameRef.current !== null) {
      cancelAnimationFrame(armFrameRef.current)
      armFrameRef.current = null
    }
  }, [])

  /*
   * ─── The load-older trigger ───────────────────────────────────────────────
   *
   * Subscribed once, to the library's own visible-logical-range event. The
   * decision itself lives in `shouldLoadOlder`, which is pure and tested at its
   * boundary — this effect only forwards the range to it.
   *
   * The subscription exists from the moment the chart does, but it is INERT
   * until the viewport has been armed: `shouldLoadOlder` checks arming before
   * it looks at any coordinate. Mount, hydration, the initial `setData`, the
   * initial fit, the corrective resize and fullscreen all move the visible
   * range and all reach this handler — and none of them can request history,
   * because none of them arms the trigger.
   *
   * No request storm is possible on a pan either: the machine refuses a second
   * request while one is in flight, after exhaustion, and after a failure until
   * an explicit retry. So the handler may fire on every frame of a drag and
   * still issue at most one request.
   */
  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) return

    const timeScale = chart.timeScale()
    const onRangeChange = (range: { from: number; to: number } | null) => {
      if (range === null) return
      const current = historyRef.current
      if (!shouldLoadOlder(current.model, range.from)) return
      current.requestOlder()
    }

    timeScale.subscribeVisibleLogicalRangeChange(onRangeChange)
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(onRangeChange)
    }
  }, [ready])

  const resetView = useCallback(() => {
    chartRef.current?.timeScale().fitContent()
  }, [])

  return (
    <div className={styles.interactiveChart} data-testid="interactive-chart">
      <div
        ref={containerRef}
        className={styles.interactiveChartCanvas}
        data-ready={ready || undefined}
        role="application"
        aria-label={
          `Interaktiv marknadsgraf, ${snapshot.instrument} ${snapshot.timeframe}. `
          + 'Dra för att panorera, rulla för att zooma.'
        }
      />

      <ChartHistoryStatus
        state={history.model.state}
        detail={history.model.detail}
        loadedCount={history.model.candles.length}
        onRetry={history.retry}
      />

      {/*
        The deterministic fallback. It is what the server renders and what a
        browser shows for the moment before the engine is ready, so the chart
        area is never blank and never non-deterministic in a static render.
      */}
      {ready ? null : (
        <div className={styles.interactiveChartFallback} aria-hidden="true">
          <MarketChart snapshot={snapshot} width={width} height={height} />
        </div>
      )}

      <button
        type="button"
        className={styles.chartShellButton}
        onClick={resetView}
        aria-label="Återställ vy"
        title="Återställ vy"
        data-testid="chart-reset-view"
      >
        <span aria-hidden="true">⤾</span>
      </button>

      {/*
        Lightweight Charts is Apache-2.0 and its licence requires TradingView to
        be identified as the product's creator with a link. The built-in logo is
        disabled above and replaced by this, which is the same attribution in
        Omnira's own type — compliant, and not a pasted third-party badge.
      */}
      <a
        className={styles.chartAttribution}
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="chart-attribution"
      >
        Charts by TradingView
      </a>
    </div>
  )
}
