/**
 * Omnira Trading — the fixture position-observation source.
 *
 * WHAT MOVED HERE, AND WHY
 * ────────────────────────
 * Until Stage 1.6 the synthetic observed positions were authored inside the
 * replay scenario machinery, beside the thesis, the confirmations and the risk
 * report. That put two different kinds of claim in one hand:
 *
 *   APPLICATION ASSERTIONS  — what Omnira thought, planned and reported.
 *   PROVIDER REALITY        — what someone else says is actually open.
 *
 * They are not the same kind of statement and they will not arrive from the
 * same place, so they no longer come from the same file. Everything in the
 * first list stays in `timelines.ts`; only the second list lives here.
 *
 * A FIXTURE, AND HONEST ABOUT IT
 * ──────────────────────────────
 * There is no provider. Nothing here connects to anything, and the numbers are
 * authored. `calibration` supplies the same deterministic series the timeline
 * is replaying, so the synthetic entry and last price agree with the chart the
 * operator is looking at — a fixture convenience, and the one thing a real
 * source would not have or need. A real position-observation source reports the
 * provider's own values and takes nothing but the query.
 *
 * No scenario here demonstrates that anything is profitable, and none should
 * ever be cited as if it did.
 */

import {
  buildFixtureSnapshot,
  type MarketInstrument,
  type MarketTimeframe,
  type MarketViewScenarioId,
  type PriceText,
  type Timestamp,
  type TradingMarketViewSnapshot,
} from '../market-view'
import { present, unavailable, unknownValue, type ObservedPosition } from './observed-position'
import {
  observationSourceOf,
  type PositionObservation,
  type PositionObservationBatch,
  type PositionObservationQuery,
  type PositionObservationSource,
} from './position-observation'

/** The provider a fixture claims to be. Display metadata, nothing more. */
const FIXTURE_PROVIDER_LABEL = 'Fixtur'

/**
 * Which authored bar each scenario's observation is pinned to.
 *
 * Only these two scenarios have anything open. THE OTHER FOUR ARE KNOWN FLAT,
 * which is a positive statement — the provider was observed and reported no
 * position — and not the same thing as the provider being unreachable.
 */
const OBSERVED_AT_CANDLE: Partial<Record<MarketViewScenarioId, number>> = {
  'neutral-no-setup': 86,
  'unknown-stale': 84,
}

// ─── Position authoring ───────────────────────────────────────────────────────

/** Read a candle instant, clamped. The fixture's only notion of market time. */
function instantAt(base: TradingMarketViewSnapshot, index: number): Timestamp {
  return base.candles[Math.min(index, base.candles.length - 1)].openTime
}

/** Shift an instant forward. Pure arithmetic on the value — no clock is read. */
function laterBy(instant: Timestamp, deltaMs: number): Timestamp {
  if (deltaMs === 0) return instant
  // `Timestamp` is a branded string; the cast is the same one the market-view
  // fixtures use when they mint one from an ISO value.
  return new Date(Date.parse(instant) + deltaMs).toISOString() as unknown as Timestamp
}

/**
 * An observed position that Omnira did not plan.
 *
 * Deliberately unattributed and deliberately incomplete: this provider does not
 * report unrealized P/L or a target, which is the normal case worth rendering.
 * Those stay UNAVAILABLE rather than becoming zero — a zero would be a claim,
 * and the provider has not made one.
 */
function observedPosition(
  base: TradingMarketViewSnapshot,
  source: PositionObservationSource,
  at: Timestamp,
  overrides: Partial<ObservedPosition> = {},
): ObservedPosition {
  const entry = base.tradeProposal.entry ?? (base.candles[0].close as PriceText)
  return {
    positionId: `pos:${base.instrument}:1`,
    // Built from the source's own declaration, so a position can never claim a
    // provenance the batch does not. The validator cross-checks exactly this.
    source: observationSourceOf(source),
    instrument: base.instrument,
    state: 'OPEN',
    direction: 'LONG',
    quantity: present(1),
    averageEntry: present(entry),
    lastPrice: present(base.candles[base.candles.length - 1].close),
    unrealizedPnl: unavailable(),
    stopLoss: present(base.tradeProposal.stopLoss ?? entry),
    takeProfit: unavailable(),
    openedAt: present(at),
    lastObservedAt: at,
    freshness: 'FRESH',
    unattributed: true,
    note: 'Observerad position utan motsvarande plan.',
    ...overrides,
  }
}

// ─── Observation authoring ────────────────────────────────────────────────────

export interface FixtureObservationOptions {
  /**
   * How long after the fact Omnira learns about it, in milliseconds.
   *
   * Zero by default, which is what a fixture that reports instantly looks like.
   * A real provider reports late, and the gap between `occurredAt` and
   * `recordedAt` is the only thing that reveals the lag — so the model carries
   * both and this knob exists to exercise the case deterministically.
   */
  readonly recordingDelayMs?: number
}

/**
 * The observations this scenario's provider reports, synchronously.
 *
 * Pure: the same scenario and base always give a deeply equal answer, with no
 * clock read and no randomness. Shared by the async source below and by the
 * synchronous fixture path in `timelines.ts`, so there is ONE authoring step
 * and two ways to reach it — and a test proves the two agree.
 *
 * An empty result means the provider reported nothing. It is a real answer.
 * Unavailability is not expressible here on purpose: it is a property of the
 * attempt, which only the source can know.
 */
export function fixturePositionObservations(
  scenario: MarketViewScenarioId,
  base: TradingMarketViewSnapshot,
  source: PositionObservationSource,
  options: FixtureObservationOptions = {},
): readonly PositionObservation[] {
  const candleIndex = OBSERVED_AT_CANDLE[scenario]
  if (candleIndex === undefined) return []

  const delay = options.recordingDelayMs ?? 0
  const at = instantAt(base, candleIndex)
  const observationId = `obs:${scenario}:0001`

  if (scenario === 'unknown-stale') {
    return [{
      observationId,
      localSequence: 0,
      instrument: base.instrument,
      kind: 'UPDATED',
      occurredAt: at,
      recordedAt: laterBy(at, delay),
      position: observedPosition(base, source, at, {
        freshness: 'UNKNOWN',
        quantity: unknownValue(),
        lastPrice: unknownValue(),
        averageEntry: unknownValue(),
        stopLoss: unknownValue(),
        openedAt: unknownValue(),
        state: 'UNKNOWN',
        note: 'Positionstillståndet kan inte bekräftas.',
      }),
      summary: 'Positionstillståndet kan inte bekräftas.',
    }]
  }

  return [{
    observationId,
    localSequence: 0,
    instrument: base.instrument,
    kind: 'OPENED',
    occurredAt: at,
    recordedAt: laterBy(at, delay),
    position: observedPosition(base, source, at),
    summary: 'Observerad position utan motsvarande plan.',
  }]
}

// ─── The source ───────────────────────────────────────────────────────────────

export interface FixturePositionObservationConfig {
  /**
   * Which authored scenario this source observes.
   *
   * CONFIGURATION OF THE SOURCE, deliberately not a field on
   * `PositionObservationQuery`. A scenario is a fixture concept; a real provider
   * has no such thing, and putting it on the shared query would leak the
   * fixture's shape into a contract that must stay provider-neutral.
   */
  readonly scenario: MarketViewScenarioId
  /**
   * The deterministic series the synthetic numbers are calibrated against.
   *
   * Fixture-only, and the reason it is injected rather than reached for: a test
   * can pin any series, and the replay source hands over the same one it is
   * replaying so the position's prices agree with the visible chart.
   */
  readonly calibration: (instrument: MarketInstrument) => TradingMarketViewSnapshot
  /** Opaque, already-redacted display label. Never an addressable account id. */
  readonly accountLabel?: string | null
  readonly recordingDelayMs?: number
  /**
   * Make this source report that it could not establish provider state.
   *
   * For proving the distinction that matters most: a source configured this way
   * returns UNAVAILABLE, which must never be treated as an empty batch. There
   * is no way to configure "return an empty list to mean failure", because that
   * translation is the bug this whole seam exists to prevent.
   */
  readonly unavailableDetail?: string
}

/**
 * A position-observation source backed by authored fixtures.
 *
 * Declares FIXTURE and cannot declare anything else: a fixture that could claim
 * LIVE would be able to mislabel authored data as real exposure, and no
 * configuration knob is worth that.
 */
export function createFixturePositionObservationSource(
  config: FixturePositionObservationConfig,
): PositionObservationSource {
  const scenario = config.scenario
  const accountLabel = config.accountLabel ?? null

  const source: PositionObservationSource = {
    id: `observation:fixture:${scenario}`,
    label: `Fixturobservation · ${scenario}`,
    origin: 'FIXTURE',
    providerLabel: FIXTURE_PROVIDER_LABEL,
    accountLabel,
    instruments: () => ['NQ', 'MNQ', 'ES'],

    async observe(query: PositionObservationQuery): Promise<PositionObservationBatch> {
      if (config.unavailableDetail !== undefined) {
        return { status: 'UNAVAILABLE', sourceId: source.id, detail: config.unavailableDetail }
      }

      const base = config.calibration(query.instrument)
      const observations = fixturePositionObservations(scenario, base, source, {
        recordingDelayMs: config.recordingDelayMs,
      })

      return {
        status: 'OBSERVED',
        sourceId: source.id,
        origin: 'FIXTURE',
        providerLabel: FIXTURE_PROVIDER_LABEL,
        accountLabel,
        observedAt: instantAt(base, base.candles.length - 1),
        observations,
      }
    },
  }

  return source
}

/**
 * The default fixture observation source for one replay selection.
 *
 * Calibrated against the very series being replayed, which is why it is built
 * per selection rather than once: an observation pinned to a bar of a different
 * series would land at an instant the replay never reaches.
 */
export function defaultFixtureObservationSource(
  scenario: MarketViewScenarioId,
  timeframe: MarketTimeframe,
): PositionObservationSource {
  return createFixturePositionObservationSource({
    scenario,
    calibration: (instrument) => buildFixtureSnapshot(scenario, instrument, timeframe),
  })
}
