/**
 * Omnira Trading — deterministic candle synthesis for fixtures.
 *
 * Fixture candles must be byte-identical on every run, on every machine, so a
 * rendered snapshot test asserts a real regression rather than today's random
 * walk. Everything here is therefore seeded and integer-only.
 *
 * ALL ARITHMETIC IS IN WHOLE TICKS.
 *
 * A price is an integer count of ticks, and the decimal string is assembled
 * from that integer by division and remainder — never by formatting a float.
 * `(20150.25).toFixed(2)` is fine in isolation and wrong in aggregate: a few
 * thousand accumulated float additions drift, and the drift is invisible until
 * two runs disagree in the last digit and a snapshot test starts flapping.
 *
 * This is fixture data. It is not market data, it is not a simulation of market
 * behaviour, and nothing about it should be read as evidence of how any
 * instrument moves or of whether any strategy is profitable.
 */

import { asTimestamp, type Timestamp } from '../time'
import { priceText, type PriceText } from './snapshot'
import type { MarketCandle, MarketTimeframe } from './snapshot'

/** Minutes per bar for each timeframe. */
export const TIMEFRAME_MINUTES: Readonly<Record<MarketTimeframe, number>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '4H': 240,
}

/**
 * Ticks per whole point, by instrument family.
 *
 * NQ, MNQ and ES all quote in quarter points, so one tick is 1/4 and every
 * price lands on .00 / .25 / .50 / .75. Expressed as a divisor rather than as
 * 0.25 so the value stays an integer through every calculation.
 */
const TICKS_PER_POINT = 4

/**
 * A 32-bit linear congruential generator.
 *
 * Numerical Recipes constants. Chosen for being trivially reproducible across
 * engines rather than for statistical quality — this drives the shape of a
 * fixture chart, not anything that must be unpredictable.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/** Stable seed from a string, so scenario ids can drive the generator. */
export function seedFrom(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Render an integer tick count as an exact decimal string.
 *
 * Integer division and remainder only. The fractional part is looked up rather
 * than computed, which is what keeps the output exact.
 */
const FRACTIONS = ['.00', '.25', '.50', '.75'] as const

export function ticksToPriceText(ticks: number): PriceText {
  const whole = Math.floor(ticks / TICKS_PER_POINT)
  const remainder = ticks - whole * TICKS_PER_POINT
  return priceText(`${whole}${FRACTIONS[remainder]}`)
}

export interface CandleSeriesOptions {
  readonly seed: number
  readonly count: number
  /** Opening price of the first bar, in whole ticks. */
  readonly startTicks: number
  readonly timeframe: MarketTimeframe
  /** Opening instant of the LAST bar. The series is built backwards from here. */
  readonly endTime: string
  /** Average per-bar drift in ticks. Positive trends up. */
  readonly drift: number
  /** Maximum per-bar body movement in ticks. */
  readonly volatility: number
}

export interface CandleSeries {
  readonly candles: readonly MarketCandle[]
  /** Highest high in the series, in ticks. */
  readonly highTicks: number
  /** Lowest low in the series, in ticks. */
  readonly lowTicks: number
  /** Closing price of the final bar, in ticks. */
  readonly lastTicks: number
}

/**
 * Build a deterministic OHLC series.
 *
 * Bars are keyed by open time and spaced exactly one timeframe apart, with no
 * gaps for weekends or maintenance windows. A fixture chart is a drawing
 * surface, and inventing a session calendar here would be inventing market
 * structure the fixtures are not entitled to assert.
 */
export function buildCandleSeries(options: CandleSeriesOptions): CandleSeries {
  const random = createRandom(options.seed)
  const stepMs = TIMEFRAME_MINUTES[options.timeframe] * 60_000
  const endMs = Date.parse(options.endTime)
  const firstMs = endMs - (options.count - 1) * stepMs

  const candles: MarketCandle[] = []
  let openTicks = options.startTicks
  let highTicks = openTicks
  let lowTicks = openTicks

  for (let index = 0; index < options.count; index += 1) {
    // Body: a drifted, centred move. Rounded to a whole tick so no price can
    // land between the ticks the instrument actually trades on.
    const body = Math.round((random() - 0.5) * 2 * options.volatility + options.drift)
    const closeTicks = openTicks + body

    // Wicks extend beyond the body on both sides, never inside it.
    const upperWick = Math.round(random() * options.volatility * 0.6)
    const lowerWick = Math.round(random() * options.volatility * 0.6)
    const barHigh = Math.max(openTicks, closeTicks) + upperWick
    const barLow = Math.min(openTicks, closeTicks) - lowerWick

    // Volume is synthetic and correlated with range, purely so the fixture does
    // not read as a flat line. It carries no market meaning.
    const range = Math.max(1, barHigh - barLow)
    const volume = 400 + range * 37 + Math.round(random() * 200)

    candles.push({
      openTime: asTimestamp(new Date(firstMs + index * stepMs).toISOString()) as Timestamp,
      open: ticksToPriceText(openTicks),
      high: ticksToPriceText(barHigh),
      low: ticksToPriceText(barLow),
      close: ticksToPriceText(closeTicks),
      volume: priceText(String(volume)),
    })

    if (barHigh > highTicks) highTicks = barHigh
    if (barLow < lowTicks) lowTicks = barLow
    openTicks = closeTicks
  }

  return {
    candles,
    highTicks,
    lowTicks,
    lastTicks: openTicks,
  }
}

/** Opening instant of the bar at `index`, for anchoring annotations. */
export function candleTimeAt(series: CandleSeries, index: number): Timestamp {
  const clamped = Math.min(Math.max(index, 0), series.candles.length - 1)
  return series.candles[clamped].openTime
}
