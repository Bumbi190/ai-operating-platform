/**
 * Omnira Trading — the market-view data seam.
 *
 *      MockMarketViewDataSource ──┐
 *                                 ├──▶ TradingMarketViewSnapshot ──▶ Atlas Market View
 *      Real market data source ───┘
 *
 * The view is written against the snapshot, never against a source. Swapping
 * the implementation therefore changes what is on screen and nothing about how
 * it is drawn.
 *
 * DELIBERATELY NOT COUPLED TO `ExecutionProviderAdapter`.
 *
 * Market-data presentation and execution state are separate concerns and this
 * interface must never grow a method that reaches an execution provider. The
 * Level 1 adapter contract answers "what does the broker say my account, my
 * positions and my working orders are"; this seam answers "what does the market
 * look like". A source implementing both would make the Atlas Market View a
 * consumer of execution authority, and it is not one.
 *
 * Concretely, the following belong to the adapter and must not appear here:
 * accounts, positions, working orders, fills, credentials, connection health of
 * a broker session, and any provider contract identifier.
 */

import type {
  MarketInstrument,
  MarketDataOrigin,
  MarketTimeframe,
  TradingMarketViewSnapshot,
} from './snapshot'

/** What the view is asking to see. Instrument and timeframe, nothing else. */
export interface MarketViewQuery {
  readonly instrument: MarketInstrument
  readonly timeframe: MarketTimeframe
}

/**
 * A source of market-view snapshots.
 *
 * `origin` is declared by the source itself rather than inferred by the view.
 * A source that cannot honestly claim LIVE must not claim it, and the view
 * shows whatever is declared — it never upgrades a source's own claim.
 */
export interface MarketViewDataSource {
  /** Stable identity for logging and for showing which source is in use. */
  readonly id: string
  /** Operator-facing name, rendered in the provenance chip. */
  readonly label: string
  readonly origin: MarketDataOrigin
  /** Instruments this source can answer for. */
  instruments(): readonly MarketInstrument[]
  /** Timeframes this source can answer for. */
  timeframes(): readonly MarketTimeframe[]
  /**
   * Load one snapshot.
   *
   * Async because every real source will be. Returns null when the source
   * cannot answer for this instrument/timeframe pair — the caller renders that
   * as an explicit unavailability, never as an empty chart that looks calm.
   */
  load(query: MarketViewQuery): Promise<TradingMarketViewSnapshot | null>
}
