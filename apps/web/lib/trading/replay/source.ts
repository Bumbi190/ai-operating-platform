/**
 * Omnira Trading — the replay timeline source seam.
 *
 * WHY THIS IS A DIFFERENT SEAM FROM `MarketViewDataSource`
 * ───────────────────────────────────────────────────────
 * `MarketViewDataSource` answers one question: *what does the market look
 * like*. It is deliberately forbidden from owning accounts, positions, working
 * orders, fills, credentials or provider health, and that boundary is load
 * bearing — it is what keeps market presentation separate from execution state.
 *
 * A `ReplayTimeline` is broader than that. It carries market observations AND
 * setup lifecycle, planned trades, reported risk/prop state, and positions
 * observed at a provider. So it cannot be something a market-data source
 * returns without destroying the very boundary that makes that source safe.
 *
 * This is therefore an APPLICATION-level source. It sits one layer above:
 *
 *     MarketViewDataSource ──────────┐
 *     (future) provider observations ├──▶ ReplayTimelineSource ──▶ ReplayTimeline
 *     (future) strategy/app state ───┘
 *
 * Today only the first input exists and the rest are authored fixtures. When
 * real observation sources arrive they join here, and neither the replay engine
 * nor the view changes shape.
 *
 * It is NOT an execution adapter. Nothing here reaches a broker, and the query
 * it accepts is the same provider-neutral `MarketViewQuery` — instrument and
 * timeframe, nothing else.
 */

import type {
  MarketInstrument,
  MarketTimeframe,
  MarketViewDataSource,
  MarketViewQuery,
  MarketViewScenarioId,
} from '../market-view'
import { MARKET_INSTRUMENTS, MARKET_TIMEFRAMES, MARKET_VIEW_SCENARIOS, createMockMarketViewDataSource } from '../market-view'
import type { EventOrigin } from './events'
import { assembleReplayTimeline, type ReplayTimeline } from './timelines'

/**
 * A source of complete application replay timelines.
 *
 * `load` returns null when the source cannot answer for this instrument and
 * timeframe. Null is a real answer the caller must render as unavailability —
 * never as an empty chart, which would look like a calm market.
 */
export interface ReplayTimelineSource {
  /** Stable identity, for logging and for showing which source is in use. */
  readonly id: string
  /** Operator-facing name. */
  readonly label: string
  /**
   * What this source's data actually is.
   *
   * Declared by the source itself, never inferred by the caller, and never
   * upgraded by a fallback. A source that cannot honestly claim LIVE must not
   * claim it — and `load` verifies the timeline it returns agrees.
   */
  readonly origin: EventOrigin
  instruments(): readonly MarketInstrument[]
  timeframes(): readonly MarketTimeframe[]
  load(query: MarketViewQuery): Promise<ReplayTimeline | null>
}

export interface FixtureReplaySourceConfig {
  /**
   * Which authored scenario this source replays.
   *
   * Configuration of the SOURCE, deliberately not a field on `MarketViewQuery`.
   * Scenario is a fixture concept; a real market-data source has no such thing,
   * and putting it on the shared query would leak the fixture's shape into a
   * contract that must stay provider-neutral.
   */
  readonly scenario: MarketViewScenarioId
  /**
   * The market-data seam this source reads its base observations through.
   *
   * Injectable so a test can prove the seam is actually on the path — and so a
   * future real market feed can be substituted without touching the authoring.
   * Defaults to the Stage 1 fixture source.
   */
  readonly marketData?: MarketViewDataSource
}

/**
 * A replay source backed by authored fixtures.
 *
 * The base market observations come **through** `MarketViewDataSource` rather
 * than from a second call to the fixture generator. That is the entire point of
 * this class: one generator, one seam, and the Stage 1 boundary genuinely on
 * the path instead of sitting unused beside it.
 *
 * Everything above the market data — lifecycle, planned trades, risk and prop
 * reports, observed positions — is authored by `assembleReplayTimeline`. Those
 * are fixture assertions, exactly as they were in Stage 1.5. This bridge
 * changes how data arrives, not how much the fixtures know.
 */
export function createFixtureReplayTimelineSource(
  config: FixtureReplaySourceConfig,
): ReplayTimelineSource {
  const scenario = config.scenario
  const marketData = config.marketData ?? createMockMarketViewDataSource(scenario)
  const label = MARKET_VIEW_SCENARIOS.find((entry) => entry.id === scenario)?.label ?? scenario

  return {
    id: `replay:fixture:${scenario}`,
    label: `Fixturreplay · ${label}`,
    origin: 'FIXTURE',
    // Delegated, not restated: what the source can answer for is exactly what
    // its market-data seam can answer for.
    instruments: () => marketData.instruments(),
    timeframes: () => marketData.timeframes(),

    async load(query: MarketViewQuery): Promise<ReplayTimeline | null> {
      const base = await marketData.load(query)
      // The market-data seam could not answer. That propagates as
      // unavailability rather than becoming an empty timeline.
      if (base === null) return null

      /*
       * The answer must be an answer to the question that was asked.
       *
       * A source that returns NQ when ES was requested, or 1m when 5m was
       * requested, is a wiring fault — and a silent one, because the chart
       * would render perfectly while the header said something else. Refusing
       * is the only safe response: rewriting the instrument or timeframe onto
       * the snapshot would make the mismatch invisible and the data wrong.
       */
      if (base.instrument !== query.instrument) {
        throw new Error(
          `ReplayTimelineSource ${this.id} requested instrument ${query.instrument} `
          + `but the market-data source returned ${base.instrument}`,
        )
      }
      if (base.timeframe !== query.timeframe) {
        throw new Error(
          `ReplayTimelineSource ${this.id} requested timeframe ${query.timeframe} `
          + `but the market-data source returned ${base.timeframe}`,
        )
      }

      /*
       * Provenance must agree end to end.
       *
       * The source declares an origin and the snapshot carries one. If they
       * ever diverge — a fixture source handed live data, or the reverse — that
       * is a wiring fault, and the safe response is to refuse rather than to
       * render something whose provenance chip would be a lie. Failing closed
       * here is cheap; a mislabelled LIVE banner is not.
       */
      if (base.provenance.origin !== this.origin) {
        throw new Error(
          `ReplayTimelineSource ${this.id} declares origin ${this.origin} `
          + `but loaded a timeline with origin ${base.provenance.origin}`,
        )
      }

      return assembleReplayTimeline(scenario, base)
    },
  }
}

/** Every instrument this source supports, for a UI that lists them. */
export function sourceSupports(
  source: ReplayTimelineSource,
  query: MarketViewQuery,
): boolean {
  return (
    source.instruments().includes(query.instrument)
    && source.timeframes().includes(query.timeframe)
  )
}

/** The full instrument/timeframe vocabulary, for callers that need it. */
export const ALL_INSTRUMENTS = MARKET_INSTRUMENTS
export const ALL_TIMEFRAMES = MARKET_TIMEFRAMES
