/**
 * Omnira Trading — the presentation boundary between Atlas truth and a chart engine.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ───────────────────────────
 * A chart engine wants numbers and epoch seconds. Omnira's market view holds
 * exact decimal `PriceText` and branded ISO `Timestamp`, and those are the
 * canonical values that panels display and that risk arithmetic would one day
 * read. If the conversion were scattered across a React component, every render
 * site would be a place where a float could quietly become trading truth.
 *
 * So there is exactly one door, it is pure, it has no DOM and no library
 * import, and it is unit-tested. `InteractiveMarketChart` may not convert
 * anything itself; it maps what this module already produced.
 *
 * DIRECTION IS ONE-WAY, AND THAT IS THE WHOLE POINT
 * ────────────────────────────────────────────────
 *     PriceText  →  number        (presentation only)
 *     Timestamp  →  epoch seconds (presentation only)
 *
 * There is deliberately no inverse. Nothing here converts a chart coordinate,
 * a crosshair reading or a pixel back into `PriceText`, `Timestamp` or any
 * canonical field, because a float that re-entered the model would be
 * indistinguishable from an exact value that had always been there.
 *
 * DELIBERATELY LIBRARY-AGNOSTIC
 * ─────────────────────────────
 * Nothing here imports Lightweight Charts. It returns plain records, so the
 * boundary can be tested without a chart, a canvas or a browser — and so the
 * market model never acquires a dependency on a renderer.
 */

import {
  priceMagnitude,
  type FairValueGap,
  type LiquidityZone,
  type ManipulationMarker,
  type MarketCandle,
  type PriceText,
  type Timestamp,
  type TradingMarketViewSnapshot,
} from '@/lib/trading/market-view'

// ─── Time ─────────────────────────────────────────────────────────────────────

/**
 * Seconds since the Unix epoch. What chart engines call a UTC timestamp.
 *
 * A presentation type, and named so nobody mistakes it for `Timestamp`.
 */
export type ChartTime = number

/**
 * A market instant, as chart time.
 *
 * `Date.parse` on an ISO-8601 value with an explicit offset yields the correct
 * UTC epoch regardless of where the browser is — the machine's timezone cannot
 * move the instant. That matters: a candle that shifted by the viewer's offset
 * would silently disagree with the panels beside it.
 *
 * Display timezone is a separate, explicit decision made in the chart options —
 * axis labels are formatted in UTC, matching the existing SVG axis. This
 * function converts an instant; it does not choose how it is shown.
 */
export function chartTimeOf(instant: Timestamp): ChartTime {
  return Math.floor(Date.parse(instant) / 1000)
}

// ─── Price ────────────────────────────────────────────────────────────────────

/**
 * A price, as a chart coordinate input.
 *
 * Delegates to `priceMagnitude`, the market model's single documented door from
 * exact decimals into geometry. This wrapper exists so the chart path has one
 * named caller a reviewer can grep, not so there is a second conversion: adding
 * a competing `Number(price)` anywhere in the UI is what this prevents.
 */
export function chartPriceOf(price: PriceText): number {
  return priceMagnitude(price)
}

/** A price that may legitimately be absent. Null stays null — never 0. */
export function chartPriceOrNull(price: PriceText | null): number | null {
  return price === null ? null : chartPriceOf(price)
}

// ─── Candles ──────────────────────────────────────────────────────────────────

export interface ChartCandle {
  readonly time: ChartTime
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
}

/**
 * The snapshot's candles, as chart input.
 *
 * A pure projection: it reads and never writes. The snapshot's own candles keep
 * their exact `PriceText` and branded `Timestamp` untouched, which a test
 * asserts by deep-comparing the input before and after.
 */
export function chartCandlesOf(candles: readonly MarketCandle[]): readonly ChartCandle[] {
  return candles.map((candle) => ({
    time: chartTimeOf(candle.openTime),
    open: chartPriceOf(candle.open),
    high: chartPriceOf(candle.high),
    low: chartPriceOf(candle.low),
    close: chartPriceOf(candle.close),
  }))
}

// ─── Horizontal levels ────────────────────────────────────────────────────────

/**
 * The Atlas level vocabulary, closed.
 *
 * Each kind carries its own styling and label in the chart layer. A closed
 * union means adding a level type is a compile error at every renderer rather
 * than an annotation that silently fails to draw.
 */
export const CHART_LEVEL_KINDS = [
  'FOUR_HOUR_OPEN', 'LIQUIDITY', 'ENTRY', 'STOP_LOSS', 'TAKE_PROFIT', 'BREAK_EVEN',
] as const
export type ChartLevelKind = (typeof CHART_LEVEL_KINDS)[number]

export interface ChartLevel {
  readonly id: string
  readonly kind: ChartLevelKind
  readonly price: number
  readonly label: string
  /** The exact value, for any operator-facing text. Never re-derived from `price`. */
  readonly exact: PriceText
}

/**
 * Every horizontal level the snapshot declares.
 *
 * A NULL PRICE PRODUCES NO LEVEL. It does not produce a level at zero, and it
 * does not produce a level at the last close: an absent stop must be visibly
 * absent, because a stop drawn at 0 reads as a stop that exists.
 */
export function chartLevelsOf(snapshot: TradingMarketViewSnapshot): readonly ChartLevel[] {
  const levels: ChartLevel[] = []

  const push = (
    id: string, kind: ChartLevelKind, price: PriceText | null, label: string,
  ) => {
    if (price === null) return
    levels.push({ id, kind, price: chartPriceOf(price), label, exact: price })
  }

  const fourHour = snapshot.selectedFourHourOpen
  if (fourHour !== null) {
    push('four-hour-open', 'FOUR_HOUR_OPEN', fourHour.price, fourHour.label)
  }

  for (const level of snapshot.liquidity) {
    push(
      level.id, 'LIQUIDITY', level.price,
      `${level.label}${level.status === 'SWEPT' ? ' · svept' : ''}`,
    )
  }

  const proposal = snapshot.tradeProposal
  push('proposal-entry', 'ENTRY', proposal.entry, 'Entry')
  push('proposal-stop', 'STOP_LOSS', proposal.stopLoss, 'SL')
  push('proposal-target', 'TAKE_PROFIT', proposal.takeProfit, 'TP')
  push('proposal-break-even', 'BREAK_EVEN', proposal.breakEven, 'BE')

  return levels
}

// ─── Zones and gaps ───────────────────────────────────────────────────────────

/**
 * A rectangle anchored to TIME AND PRICE, never to pixels.
 *
 * The coordinates here are the anchors; the renderer converts them to pixels on
 * every frame through the chart's own scales. That is what keeps a zone welded
 * to its prices while the user pans and zooms, instead of floating as screen
 * decoration.
 */
export interface ChartBox {
  readonly id: string
  readonly fromTime: ChartTime
  readonly toTime: ChartTime
  readonly upper: number
  readonly lower: number
  readonly label: string
  /** Drives styling. Kept as the model's own vocabulary, not a colour. */
  readonly variant: string
  readonly state: string
}

export function chartZonesOf(zones: readonly LiquidityZone[]): readonly ChartBox[] {
  return zones.map((zone) => ({
    id: zone.id,
    fromTime: chartTimeOf(zone.fromTime),
    toTime: chartTimeOf(zone.toTime),
    upper: chartPriceOf(zone.upper),
    lower: chartPriceOf(zone.lower),
    label: zone.label,
    variant: zone.kind,
    state: zone.status,
  }))
}

export function chartGapsOf(gaps: readonly FairValueGap[]): readonly ChartBox[] {
  return gaps.map((gap) => ({
    id: gap.id,
    fromTime: chartTimeOf(gap.fromTime),
    toTime: chartTimeOf(gap.toTime),
    upper: chartPriceOf(gap.upper),
    lower: chartPriceOf(gap.lower),
    label: gap.label,
    variant: gap.direction,
    state: gap.state,
  }))
}

// ─── Manipulation markers ─────────────────────────────────────────────────────

export interface ChartMarker {
  readonly id: string
  readonly time: ChartTime
  readonly price: number
  readonly label: string
  readonly kind: string
  /** Sweeps of highs sit above the bar; sweeps of lows sit below it. */
  readonly above: boolean
}

export function chartMarkersOf(markers: readonly ManipulationMarker[]): readonly ChartMarker[] {
  return markers.map((marker) => ({
    id: marker.id,
    time: chartTimeOf(marker.at),
    price: chartPriceOf(marker.price),
    label: marker.label,
    kind: marker.kind,
    above: marker.kind === 'LIQUIDITY_SWEEP_HIGH',
  }))
}

// ─── Safety badges ────────────────────────────────────────────────────────────

/**
 * The data-provenance badge.
 *
 * READ FROM `provenance.origin`, THE MACHINE-READABLE FIELD. Never inferred
 * from `sourceLabel`, which is operator prose that a fixture could word to look
 * like anything. A closed mapping means fixture data has no path to claiming
 * LIVE: there is no option, no flag and no fallback that produces it.
 */
export const CHART_ORIGIN_BADGES: Readonly<Record<
  TradingMarketViewSnapshot['provenance']['origin'],
  { readonly text: string; readonly tone: 'fixture' | 'simulation' | 'live' }
>> = {
  FIXTURE: { text: 'DATA · FIXTUR', tone: 'fixture' },
  SIMULATION: { text: 'DATA · SIMULERING', tone: 'simulation' },
  LIVE: { text: 'DATA · LIVE', tone: 'live' },
}

export function originBadgeOf(snapshot: TradingMarketViewSnapshot) {
  return CHART_ORIGIN_BADGES[snapshot.provenance.origin]
}

/**
 * The proposal badge.
 *
 * The model's status vocabulary is deliberately non-executable, and this
 * mapping is total over it. There is no `APPROVED`, `SUBMITTED` or `FILLED`
 * here, and there cannot be: those belong to a real execution state this model
 * does not have, and offering them as presentation would let a fixture's
 * Entry/SL/TP read as an order resting at a broker.
 */
export const CHART_PROPOSAL_BADGES: Readonly<Record<
  TradingMarketViewSnapshot['tradeProposal']['status'],
  { readonly text: string }
>> = {
  OBSERVATION_ONLY: { text: 'FÖRSLAG · ENDAST OBSERVATION' },
  SIMULATED: { text: 'FÖRSLAG · SIMULERAT' },
  NO_EXECUTION_PROVIDER: { text: 'FÖRSLAG · INGEN EXECUTION-PROVIDER' },
}

export function proposalBadgeOf(snapshot: TradingMarketViewSnapshot) {
  return CHART_PROPOSAL_BADGES[snapshot.tradeProposal.status]
}

// ─── Viewport ownership ───────────────────────────────────────────────────────

/**
 * Whether the view should be re-fitted for this update.
 *
 * THE USER OWNS THE VIEWPORT ONCE THEY TOUCH IT. Re-fitting on every data
 * update would yank an operator back to the latest candle mid-inspection, which
 * is the single most irritating thing an interactive chart can do.
 *
 * A fit is warranted only when the thing being looked AT changed — first mount,
 * a different instrument, a different timeframe — or when the operator asked
 * for one. Replay progress is not one of those: the same instrument on the same
 * timeframe with one more candle is the case where the view must be left alone.
 */
export interface ViewportKey {
  readonly instrument: string
  readonly timeframe: string
}

/**
 * What the current viewport was last fitted for.
 *
 * `fittedWithData` is the half that is easy to miss and expensive to get wrong.
 * Replay begins before its first candle, so the chart's first render legitimately
 * carries an EMPTY series. Fitting then produces a viewport fitted to nothing —
 * and because the policy correctly refuses to re-fit on ordinary updates, that
 * empty fit would survive for the whole session, leaving the candles crammed
 * against one edge with dead space beside them.
 *
 * So a fit only counts once there was something to fit to.
 */
export interface ViewportState {
  readonly key: ViewportKey
  readonly fittedWithData: boolean
}

export function shouldFitViewport(
  previous: ViewportState | null,
  next: ViewportKey,
  hasCandles: boolean,
): boolean {
  // Nothing to fit to. Fitting an empty series sets a viewport that means nothing.
  if (!hasCandles) return false
  // First data this chart has ever seen.
  if (previous === null) return true
  // An earlier pass ran before the data arrived; this is the real first fit.
  if (!previous.fittedWithData) return true
  // Otherwise only a change of subject earns a fit — never mere replay progress.
  return previous.key.instrument !== next.instrument
    || previous.key.timeframe !== next.timeframe
}
