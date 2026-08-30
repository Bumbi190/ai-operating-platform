import React from 'react'
import {
  computeChartGeometry,
  indexToLeftX,
  indexToX,
  priceToY,
  timeToIndex,
  type ChartGeometry,
  type PriceText,
  type TradingMarketViewSnapshot,
} from '@/lib/trading/market-view'
import styles from './AtlasMarketView.module.css'

/**
 * The Atlas Market View chart.
 *
 * A pure renderer. It receives structured annotations and draws them; it does
 * not detect, derive or infer any of them. iFVG, CISD, equal-high/low tolerance
 * and SMT correspondence are unresolved deterministic gates, and a chart that
 * quietly computed one of them would be inventing canon in a component.
 *
 * WHY BESPOKE SVG RATHER THAN A CHART LIBRARY
 * ───────────────────────────────────────────
 * The repository has no chart dependency at all, so there was no existing one
 * to prove unsuitable — the choice was to add a dependency or to draw. Drawing
 * won on three counts:
 *
 *  1. The work here is the annotation layer, not the candles. Liquidity bands,
 *     FVG lifecycle states, manipulation markers, 4H opens and proposal levels
 *     are all custom overlays that a candlestick library would constrain rather
 *     than provide.
 *  2. Deterministic markup. `renderToStaticMarkup` over a fixed viewBox gives a
 *     real regression test, which is this repository's established pattern for
 *     visual components. A canvas or WebGL renderer produces nothing a unit
 *     test can assert against.
 *  3. No runtime dependency enters the Next build for a Stage 1 fixture
 *     surface.
 *
 * SIZING
 * ──────
 * The chart draws into whatever box it is given. `width` and `height` are
 * optional and fall back to a fixed design size, which matters for two reasons:
 * `renderToStaticMarkup` has no layout to measure, and a server render has no
 * DOM at all. Both therefore produce the same deterministic markup they always
 * did, while a mounted browser passes the measured container box and the plot
 * genuinely fills it.
 *
 * The viewBox tracks those same numbers, so one SVG unit is one CSS pixel and
 * nothing is stretched: candle bodies keep their proportions and only the plot
 * area grows. That is what lets a wide display gain chart WIDTH rather than
 * proportionally more height.
 */

const VIEW_WIDTH = 1200
const VIEW_HEIGHT = 520

/** Every price that must stay inside the visible range. */
function visiblePrices(snapshot: TradingMarketViewSnapshot): PriceText[] {
  const prices: PriceText[] = []
  const push = (value: PriceText | null) => {
    if (value !== null) prices.push(value)
  }

  push(snapshot.selectedFourHourOpen?.price ?? null)
  for (const level of snapshot.liquidity) prices.push(level.price)
  for (const zone of snapshot.liquidityZones) prices.push(zone.upper, zone.lower)
  for (const gap of snapshot.fairValueGaps) prices.push(gap.upper, gap.lower)
  for (const marker of snapshot.manipulation) prices.push(marker.price)
  push(snapshot.tradeProposal.entry)
  push(snapshot.tradeProposal.stopLoss)
  push(snapshot.tradeProposal.takeProfit)
  push(snapshot.tradeProposal.breakEven)

  return prices
}

interface LevelLineProps {
  geometry: ChartGeometry
  price: PriceText
  label: string
  tone: string
  dash?: string
}

function LevelLine({ geometry, price, label, tone, dash }: LevelLineProps) {
  const y = priceToY(geometry, price)
  const right = geometry.plot.x + geometry.plot.width
  return (
    <g>
      <line
        x1={geometry.plot.x}
        y1={y}
        x2={right}
        y2={y}
        stroke={tone}
        strokeWidth={1}
        strokeDasharray={dash}
        opacity={0.85}
      />
      <text x={geometry.plot.x + 8} y={y - 5} className={styles.chartLevelLabel} fill={tone}>
        {label}
      </text>
      {/*
        The level's own price badge sits in the price scale and must cover the
        gridline label underneath it — otherwise two different numbers overlap
        at the same y and neither is readable. Solid backing first, tinted
        badge on top.
      */}
      <rect x={right + 1} y={y - 8} width={64} height={16} className={styles.chartBadgeBacking} />
      <rect x={right + 2} y={y - 8} width={62} height={16} rx={3} fill={tone} opacity={0.18} />
      <text x={right + 6} y={y + 4} className={styles.chartAxisValue} fill={tone}>
        {price}
      </text>
    </g>
  )
}

export function MarketChart({
  snapshot,
  width = VIEW_WIDTH,
  height = VIEW_HEIGHT,
}: {
  snapshot: TradingMarketViewSnapshot
  /** Measured container box. Omitted on the server and in static markup. */
  width?: number
  height?: number
}) {
  const geometry = computeChartGeometry({
    candles: snapshot.candles,
    includePrices: visiblePrices(snapshot),
    width,
    height,
  })

  const { plot } = geometry
  const right = plot.x + plot.width
  const bottom = plot.y + plot.height
  const empty = snapshot.candles.length === 0

  const chartLabel =
    `${snapshot.instrument} ${snapshot.timeframe} — `
    + `${snapshot.candles.length} staplar, ${snapshot.provenance.sourceLabel}`

  return (
    <div className={styles.chartFrame} data-stale={snapshot.provenance.freshness === 'STALE' || undefined}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label={chartLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{chartLabel}</title>

        {/* ── Gridlines ───────────────────────────────────────────────────── */}
        <g aria-hidden="true">
          {geometry.priceTicks.map((tick) => (
            <line
              key={`grid-${tick.value}`}
              x1={plot.x}
              y1={tick.y}
              x2={right}
              y2={tick.y}
              className={styles.chartGrid}
            />
          ))}
          {geometry.timeTicks.map((tick) => (
            <line
              key={`gridx-${tick.index}`}
              x1={tick.x}
              y1={plot.y}
              x2={tick.x}
              y2={bottom}
              className={styles.chartGrid}
            />
          ))}
        </g>

        {/* ── Liquidity zones ─────────────────────────────────────────────── */}
        <g data-layer="liquidity-zones">
          {snapshot.liquidityZones.map((zone) => {
            const yTop = priceToY(geometry, zone.upper)
            const yBottom = priceToY(geometry, zone.lower)
            const xFrom = indexToLeftX(geometry, timeToIndex(snapshot.candles, zone.fromTime))
            const xTo = indexToX(geometry, timeToIndex(snapshot.candles, zone.toTime))
            return (
              <g key={zone.id} data-zone-status={zone.status}>
                <rect
                  x={xFrom}
                  y={yTop}
                  width={Math.max(2, xTo - xFrom)}
                  height={Math.max(2, yBottom - yTop)}
                  className={styles.chartLiquidityZone}
                  data-status={zone.status}
                />
                <text x={xFrom + 6} y={yTop + 13} className={styles.chartZoneLabel}>
                  {zone.label}
                </text>
              </g>
            )
          })}
        </g>

        {/* ── Fair value gaps ─────────────────────────────────────────────── */}
        <g data-layer="fair-value-gaps">
          {snapshot.fairValueGaps.map((gap) => {
            const yTop = priceToY(geometry, gap.upper)
            const yBottom = priceToY(geometry, gap.lower)
            const xFrom = indexToLeftX(geometry, timeToIndex(snapshot.candles, gap.fromTime))
            const xTo = indexToX(geometry, timeToIndex(snapshot.candles, gap.toTime))
            return (
              <g key={gap.id} data-fvg-state={gap.state}>
                <rect
                  x={xFrom}
                  y={yTop}
                  width={Math.max(2, xTo - xFrom)}
                  height={Math.max(2, yBottom - yTop)}
                  className={styles.chartFvg}
                  data-direction={gap.direction}
                  data-state={gap.state}
                />
                <text x={xFrom + 6} y={yBottom - 6} className={styles.chartZoneLabel}>
                  {gap.label}
                </text>
              </g>
            )
          })}
        </g>

        {/* ── Candles ─────────────────────────────────────────────────────── */}
        <g data-layer="candles">
          {snapshot.candles.map((candle, index) => {
            const x = indexToX(geometry, index)
            const openY = priceToY(geometry, candle.open)
            const closeY = priceToY(geometry, candle.close)
            const highY = priceToY(geometry, candle.high)
            const lowY = priceToY(geometry, candle.low)
            const rising = closeY <= openY
            const bodyTop = Math.min(openY, closeY)
            // A doji would otherwise render as a zero-height rect and vanish.
            const bodyHeight = Math.max(1, Math.abs(closeY - openY))
            return (
              <g key={candle.openTime} className={styles.chartCandle} data-rising={rising || undefined}>
                <line x1={x} y1={highY} x2={x} y2={lowY} strokeWidth={1} />
                <rect
                  x={x - geometry.bodyWidth / 2}
                  y={bodyTop}
                  width={geometry.bodyWidth}
                  height={bodyHeight}
                />
              </g>
            )
          })}
        </g>

        {/* ── Horizontal liquidity levels ─────────────────────────────────── */}
        <g data-layer="liquidity-levels">
          {snapshot.liquidity.map((level) => (
            <g key={level.id} data-liquidity-status={level.status}>
              <LevelLine
                geometry={geometry}
                price={level.price}
                label={`${level.label}${level.status === 'SWEPT' ? ' · svept' : ''}`}
                tone="var(--omnira-gold)"
                dash={level.status === 'SWEPT' ? '2 4' : '6 4'}
              />
            </g>
          ))}
        </g>

        {/* ── Selected 4H open ────────────────────────────────────────────── */}
        {snapshot.selectedFourHourOpen ? (
          <g data-layer="four-hour-open">
            <LevelLine
              geometry={geometry}
              price={snapshot.selectedFourHourOpen.price}
              label={snapshot.selectedFourHourOpen.label}
              tone="var(--os-accent)"
            />
          </g>
        ) : null}

        {/* ── Proposal levels ─────────────────────────────────────────────── */}
        <g data-layer="proposal-levels">
          {snapshot.tradeProposal.entry ? (
            <LevelLine
              geometry={geometry}
              price={snapshot.tradeProposal.entry}
              label="Entry"
              tone="var(--omnira-aqua)"
            />
          ) : null}
          {snapshot.tradeProposal.stopLoss ? (
            <LevelLine
              geometry={geometry}
              price={snapshot.tradeProposal.stopLoss}
              label="SL"
              tone="var(--omnira-rose)"
              dash="5 3"
            />
          ) : null}
          {snapshot.tradeProposal.takeProfit ? (
            <LevelLine
              geometry={geometry}
              price={snapshot.tradeProposal.takeProfit}
              label="TP"
              tone="var(--omnira-emerald)"
              dash="5 3"
            />
          ) : null}
          {snapshot.tradeProposal.breakEven ? (
            <LevelLine
              geometry={geometry}
              price={snapshot.tradeProposal.breakEven}
              label="BE"
              tone="var(--omnira-gold-soft)"
              dash="1 4"
            />
          ) : null}
        </g>

        {/* ── Manipulation markers ────────────────────────────────────────── */}
        <g data-layer="manipulation">
          {snapshot.manipulation.map((marker) => {
            const x = indexToX(geometry, timeToIndex(snapshot.candles, marker.at))
            const y = priceToY(geometry, marker.price)
            const down = marker.kind === 'LIQUIDITY_SWEEP_HIGH'
            const tip = down ? y + 9 : y - 9
            return (
              <g key={marker.id} data-manipulation-kind={marker.kind}>
                <polygon
                  points={`${x},${tip} ${x - 6},${down ? tip - 10 : tip + 10} ${x + 6},${down ? tip - 10 : tip + 10}`}
                  className={styles.chartManipulation}
                />
                <text
                  x={x}
                  y={down ? tip + 14 : tip - 12}
                  textAnchor="middle"
                  className={styles.chartMarkerLabel}
                >
                  {marker.label}
                </text>
              </g>
            )
          })}
        </g>

        {/* ── Axes ────────────────────────────────────────────────────────── */}
        <g aria-hidden="true">
          <line x1={right} y1={plot.y} x2={right} y2={bottom} className={styles.chartAxis} />
          <line x1={plot.x} y1={bottom} x2={right} y2={bottom} className={styles.chartAxis} />
          {geometry.priceTicks.map((tick) => (
            <text
              key={`pt-${tick.value}`}
              x={right + 6}
              y={tick.y + 3}
              className={styles.chartAxisLabel}
            >
              {tick.label}
            </text>
          ))}
          {geometry.timeTicks.map((tick) => (
            <text
              key={`tt-${tick.index}`}
              x={tick.x}
              y={bottom + 16}
              textAnchor="middle"
              className={styles.chartAxisLabel}
            >
              {tick.label}
            </text>
          ))}
        </g>

        {empty ? (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            className={styles.chartEmpty}
          >
            Inga staplar tillgängliga för detta urval.
          </text>
        ) : null}
      </svg>
    </div>
  )
}