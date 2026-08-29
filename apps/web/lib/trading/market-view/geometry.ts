/**
 * Omnira Trading — chart projection.
 *
 * Pure functions mapping a snapshot's prices and times onto SVG coordinates.
 * No React, no DOM, no side effects — which is what makes the chart's layout
 * testable without rendering it.
 *
 * ON FLOATING POINT
 * ─────────────────
 * This module works in `number`, and that is correct here. Its output is a
 * pixel coordinate inside a fixed viewBox; no hard limit is ever compared
 * against one, and no money is ever derived from one. Prices arrive as exact
 * `PriceText` and are converted through `priceMagnitude`, the single documented
 * door from exact decimals into geometry.
 *
 * The exact values remain untouched on the snapshot and are what the panels
 * display. A price is rendered as text from `PriceText`, never re-formatted
 * from a coordinate.
 */

import { priceMagnitude, type MarketCandle, type PriceText } from './snapshot'

export interface ChartPadding {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export const DEFAULT_CHART_PADDING: ChartPadding = {
  top: 16,
  // Room for the price scale, which sits on the right like every trading chart.
  right: 68,
  // Room for the time scale.
  bottom: 28,
  left: 8,
}

export interface ChartPlotArea {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PriceTick {
  readonly value: number
  readonly y: number
  readonly label: string
}

export interface TimeTick {
  readonly index: number
  readonly x: number
  readonly label: string
}

export interface ChartGeometry {
  readonly width: number
  readonly height: number
  readonly plot: ChartPlotArea
  readonly priceMin: number
  readonly priceMax: number
  readonly candleCount: number
  readonly slotWidth: number
  readonly bodyWidth: number
  readonly priceTicks: readonly PriceTick[]
  readonly timeTicks: readonly TimeTick[]
}

export interface ChartGeometryInput {
  readonly candles: readonly MarketCandle[]
  /**
   * Prices that must stay visible even when outside the candle range — entry,
   * stop, target, liquidity levels, the selected 4H open.
   *
   * Included in the range so a stop just below the low is never clipped off the
   * bottom of the chart, which would make it look as though there is no stop.
   */
  readonly includePrices?: readonly PriceText[]
  readonly width: number
  readonly height: number
  readonly padding?: ChartPadding
  /** Roughly how many horizontal price gridlines to draw. */
  readonly priceTickCount?: number
  /** Roughly how many vertical time gridlines to draw. */
  readonly timeTickCount?: number
}

/** Round to a fixed number of decimals, so SVG output is stable across engines. */
function fixed(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * A "nice" step near `rough` — 1, 2, 2.5 or 5 times a power of ten.
 *
 * Gridlines land on numbers a person reads without effort. The alternative,
 * dividing the range by the tick count, produces labels like 20147.3333.
 */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const normalized = rough / magnitude
  const step = normalized >= 5 ? 10 : normalized >= 2.5 ? 5 : normalized >= 2 ? 2.5 : normalized >= 1 ? 2 : 1
  return step * magnitude
}

function formatPrice(value: number, step: number): string {
  const decimals = step >= 10 ? 0 : step >= 1 ? 1 : 2
  return value.toFixed(decimals)
}

/** HH:MM in UTC. The axis is a relative reading aid, not a session clock. */
function formatAxisTime(iso: string): string {
  const date = new Date(iso)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function computeChartGeometry(input: ChartGeometryInput): ChartGeometry {
  const padding = input.padding ?? DEFAULT_CHART_PADDING
  const plot: ChartPlotArea = {
    x: padding.left,
    y: padding.top,
    width: Math.max(1, input.width - padding.left - padding.right),
    height: Math.max(1, input.height - padding.top - padding.bottom),
  }

  const values: number[] = []
  for (const candle of input.candles) {
    values.push(priceMagnitude(candle.high), priceMagnitude(candle.low))
  }
  for (const price of input.includePrices ?? []) {
    values.push(priceMagnitude(price))
  }

  // An empty series still produces a valid, drawable geometry rather than NaN
  // coordinates. The view renders an explicit "no data" state over it.
  const rawMin = values.length > 0 ? Math.min(...values) : 0
  const rawMax = values.length > 0 ? Math.max(...values) : 1
  const rawSpan = rawMax - rawMin
  // A flat series would divide by zero. Give it an arbitrary but stable span.
  const span = rawSpan > 0 ? rawSpan : Math.max(1, Math.abs(rawMax) * 0.001)
  const headroom = span * 0.08

  const priceMin = rawMin - headroom
  const priceMax = rawMax + headroom
  const priceSpan = priceMax - priceMin

  const candleCount = input.candles.length
  const slotWidth = candleCount > 0 ? plot.width / candleCount : plot.width
  // Bodies leave a gap between bars; never thinner than a hairline.
  const bodyWidth = Math.max(1, slotWidth * 0.62)

  const priceTickCount = input.priceTickCount ?? 6
  const step = niceStep(priceSpan / priceTickCount)
  const firstTick = Math.ceil(priceMin / step) * step
  const priceTicks: PriceTick[] = []
  for (let value = firstTick; value <= priceMax; value += step) {
    priceTicks.push({
      value,
      y: fixed(plot.y + ((priceMax - value) / priceSpan) * plot.height),
      label: formatPrice(value, step),
    })
  }

  const timeTickCount = input.timeTickCount ?? 6
  const timeTicks: TimeTick[] = []
  if (candleCount > 0) {
    const stride = Math.max(1, Math.floor(candleCount / timeTickCount))
    for (let index = 0; index < candleCount; index += stride) {
      timeTicks.push({
        index,
        x: fixed(plot.x + index * slotWidth + slotWidth / 2),
        label: formatAxisTime(input.candles[index].openTime),
      })
    }
  }

  return {
    width: input.width,
    height: input.height,
    plot,
    priceMin,
    priceMax,
    candleCount,
    slotWidth: fixed(slotWidth),
    bodyWidth: fixed(bodyWidth),
    priceTicks,
    timeTicks,
  }
}

/** SVG y for an exact price. */
export function priceToY(geometry: ChartGeometry, price: PriceText): number {
  return priceValueToY(geometry, priceMagnitude(price))
}

/** SVG y for a raw numeric price, used for gridlines already in number form. */
export function priceValueToY(geometry: ChartGeometry, value: number): number {
  const span = geometry.priceMax - geometry.priceMin
  return fixed(geometry.plot.y + ((geometry.priceMax - value) / span) * geometry.plot.height)
}

/** SVG x for the centre of the candle at `index`. */
export function indexToX(geometry: ChartGeometry, index: number): number {
  return fixed(geometry.plot.x + index * geometry.slotWidth + geometry.slotWidth / 2)
}

/** SVG x for the left edge of the candle at `index`. */
export function indexToLeftX(geometry: ChartGeometry, index: number): number {
  return fixed(geometry.plot.x + index * geometry.slotWidth)
}

/**
 * The candle index nearest an instant, clamped into the series.
 *
 * Annotations carry timestamps, not indices, because a real source will emit
 * times. Clamping rather than dropping keeps an annotation slightly outside the
 * window visible at the edge, which is the honest rendering: the level exists,
 * the chart just does not reach it.
 */
export function timeToIndex(candles: readonly MarketCandle[], iso: string): number {
  if (candles.length === 0) return 0
  const target = Date.parse(iso)
  let best = 0
  let bestDelta = Number.POSITIVE_INFINITY
  for (let index = 0; index < candles.length; index += 1) {
    const delta = Math.abs(Date.parse(candles[index].openTime) - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = index
    }
  }
  return best
}

/** SVG x for an instant. */
export function timeToX(
  geometry: ChartGeometry,
  candles: readonly MarketCandle[],
  iso: string,
): number {
  return indexToX(geometry, timeToIndex(candles, iso))
}
