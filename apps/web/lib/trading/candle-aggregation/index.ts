/**
 * Omnira Trading — canonical candle aggregation, public surface.
 *
 * Import from `@/lib/trading/candle-aggregation`, not from the modules beneath it.
 *
 * Canonical authority:
 *   docs/trading-system/specifications/market-data/
 *   Omnira Trading System – Market Data & Contract Lifecycle – Canonical v1.0.md
 *
 * WHAT THIS PACKAGE IS
 * ────────────────────
 * The provider-neutral step that turns accepted canonical 1m observations into
 * one derived higher-timeframe candle:
 *
 *     NominalBucket + SessionExpectation      (GATE-08C-2A)
 *         +  accepted 1m MarketCandle run  +  source state
 *         ↓
 *     DerivedCanonicalCandle
 *         candle body        — six fields, exactly as a 1m observation has
 *         nominalTo          — the grid's end
 *         effectiveTo        — the session's end (§19)
 *         sessionTruncated   — derived, never stored beside the other two
 *         completeness       — GATE-08C-2A's verdict, not a second one
 *
 * WHAT IT IS NOT
 * ──────────────
 * It accepts no provider-native 5m, 15m or 4H bar as input — §12 permits only
 * derivation from accepted 1m observations, and the input type makes anything
 * else inexpressible. It normalises no provider convention; that boundary is
 * upstream. It repairs no unordered or duplicated input; §16 assigns those
 * semantics to `mergeOlderCandles`, which is untouched by this slice.
 *
 * It reads no clock, no environment and no network, and it mints no authority.
 * It detects nothing: no iFVG, CISD, SMT, FVG, liquidity, setup grade or
 * proposal exists here, and GATE-04 stays open.
 *
 * It defines no second completeness vocabulary, no second `SessionExpectation`
 * and no second truncation rule — every one of those is asked of GATE-08C-2A
 * and carried through on the result, so `fourHourStrategyStanding` can be
 * applied to it unchanged.
 *
 * NO FLOAT TOUCHES A PRICE OR A VOLUME. High and low are chosen by exact
 * decimal comparison; volume is summed as a scaled bigint.
 *
 * NOT YET HERE — GATE-08C-3
 * ─────────────────────────
 * `ContractCandleSegment`, contract-scoped sources, `ContractSelectionDecision`
 * and any contract provenance on a candle are later work. GATE-08 stays
 * DELVIS STÄNGD.
 */

export {
  AGGREGATION_REFUSALS,
  DERIVED_MARKET_TIMEFRAMES,
  aggregateCanonicalCandle,
  isDerivedMarketTimeframe,
} from './aggregation'
export type {
  AcceptedMinuteObservations,
  AggregationRefusal,
  CandleAggregation,
  DerivedCanonicalCandle,
  DerivedMarketTimeframe,
} from './aggregation'

/*
 * `exact-sum.ts` is deliberately NOT re-exported.
 *
 * It exists to add up one bucket's volumes and nothing else. Exposing it would
 * make it the general exact-arithmetic API that `decimal.ts` deliberately does
 * not ship — and the first caller to reach for it would be doing risk
 * arithmetic outside the Risk Engine's rules.
 */
