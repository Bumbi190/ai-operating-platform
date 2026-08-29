/**
 * Omnira Trading — deterministic fixture scenarios for the Atlas Market View.
 *
 * WHAT THESE ARE
 * ──────────────
 * Six hand-authored states that between them exercise every branch of the view:
 * a developing setup in each direction, a fully confirmed one, a blocked risk
 * state, an empty market, and a stale/unknown feed. They exist so the surface
 * can be built and regression-tested before any provider is connected.
 *
 * WHAT THESE ARE NOT
 * ──────────────────
 * Not market data. Not a backtest. Not evidence of anything. The candles are
 * synthesised by a seeded generator and the annotations are written by hand to
 * sit on top of them. No scenario here demonstrates that any setup, grade or
 * strategy is profitable, and none should ever be cited as if it did.
 *
 * NO DETECTION LOGIC LIVES HERE.
 *
 * iFVG, CISD, equal-high/low tolerance and SMT correspondence are unresolved
 * deterministic gates. These fixtures therefore *assert* annotation values the
 * way a provider would hand them over; they never derive one from the candles.
 * Where a level is positioned relative to the series high or low, that is
 * fixture layout — putting the drawing somewhere sensible on the canvas — and
 * carries no claim about what the market did.
 */

import { asTimestamp, type Timestamp } from '../time'
import { buildCandleSeries, candleTimeAt, seedFrom, ticksToPriceText, type CandleSeries } from './candles'
import type { MarketViewDataSource, MarketViewQuery } from './data-source'
import { buildSessionDisplayState } from './session'
import {
  MARKET_INSTRUMENTS,
  MARKET_TIMEFRAMES,
  priceText,
  type MarketInstrument,
  type MarketTimeframe,
  type TradingMarketViewSnapshot,
} from './snapshot'

// ─── Scenario identity ────────────────────────────────────────────────────────

export const MARKET_VIEW_SCENARIO_IDS = [
  'long-developing',
  'short-developing',
  'a-plus-confirmed',
  'risk-blocked',
  'neutral-no-setup',
  'unknown-stale',
] as const
export type MarketViewScenarioId = (typeof MARKET_VIEW_SCENARIO_IDS)[number]

export interface MarketViewScenario {
  readonly id: MarketViewScenarioId
  readonly label: string
  readonly summary: string
}

export const MARKET_VIEW_SCENARIOS: readonly MarketViewScenario[] = [
  { id: 'long-developing', label: 'Long utvecklas', summary: 'Sweep bekräftad, 1m-bekräftelse ofullständig.' },
  { id: 'short-developing', label: 'Short utvecklas', summary: 'Highs svepta, CISD ännu okänd.' },
  { id: 'a-plus-confirmed', label: 'A+ bekräftad', summary: 'Alla fyra bekräftelser på plats.' },
  { id: 'risk-blocked', label: 'Risk blockerad', summary: 'Daglig förlustgräns nådd, försök uttömda.' },
  { id: 'neutral-no-setup', label: 'Ingen setup', summary: 'Neutral bias, inget att agera på.' },
  { id: 'unknown-stale', label: 'Okänd / inaktuell', summary: 'Feeden är inaktuell — inget tillstånd kan bekräftas.' },
]

export function isMarketViewScenarioId(raw: unknown): raw is MarketViewScenarioId {
  return typeof raw === 'string' && (MARKET_VIEW_SCENARIO_IDS as readonly string[]).includes(raw)
}

export function parseMarketViewScenarioId(raw: unknown): MarketViewScenarioId | null {
  return isMarketViewScenarioId(raw) ? raw : null
}

// ─── Fixed instants ───────────────────────────────────────────────────────────

/**
 * Every scenario is pinned to one instant so the whole model is reproducible.
 *
 * 2026-08-28T15:30:00Z is 11:30 in America/New_York on that date — inside the
 * canonical New York window (10:00–12:00), which is where most of these states
 * are interesting. The stale scenario keeps the same clock and moves only its
 * `observedAt` backwards, so staleness is visible as a gap rather than as a
 * different day.
 */
const NOW_ISO = '2026-08-28T15:30:00Z'
const LAST_BAR_ISO = '2026-08-28T15:25:00Z'
const STALE_OBSERVED_ISO = '2026-08-28T13:52:00Z'

const NOW = asTimestamp(NOW_ISO)

/** Opening tick price per instrument. Roughly realistic, exactly reproducible. */
const INSTRUMENT_START_TICKS: Readonly<Record<MarketInstrument, number>> = {
  NQ: 80_600, // 20150.00
  MNQ: 80_600, // 20150.00 — same index, different contract size
  ES: 23_210, // 5802.50
}

const CANDLE_COUNT = 90

// ─── Series construction ──────────────────────────────────────────────────────

interface SeriesShape {
  readonly drift: number
  readonly volatility: number
}

const SERIES_SHAPE: Readonly<Record<MarketViewScenarioId, SeriesShape>> = {
  'long-developing': { drift: 0.9, volatility: 26 },
  'short-developing': { drift: -0.9, volatility: 26 },
  'a-plus-confirmed': { drift: 1.4, volatility: 30 },
  'risk-blocked': { drift: -1.6, volatility: 34 },
  'neutral-no-setup': { drift: 0, volatility: 14 },
  'unknown-stale': { drift: 0.2, volatility: 20 },
}

function buildSeries(
  scenario: MarketViewScenarioId,
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): CandleSeries {
  const shape = SERIES_SHAPE[scenario]
  return buildCandleSeries({
    seed: seedFrom(`${scenario}:${instrument}:${timeframe}`),
    count: CANDLE_COUNT,
    startTicks: INSTRUMENT_START_TICKS[instrument],
    timeframe,
    endTime: LAST_BAR_ISO,
    drift: shape.drift,
    volatility: shape.volatility,
  })
}

// ─── Shared annotation layout ─────────────────────────────────────────────────

/**
 * Structural drawings positioned against the series extremes.
 *
 * Layout only. Which levels matter, and whether a gap is inverted, is asserted
 * by each scenario below — this just decides where on the canvas the shapes sit
 * so they do not stack on top of each other or fall outside the visible range.
 */
function annotationAnchors(series: CandleSeries) {
  const span = Math.max(40, series.highTicks - series.lowTicks)
  return {
    span,
    aboveHigh: series.highTicks + Math.round(span * 0.04),
    atHigh: series.highTicks,
    belowLow: series.lowTicks - Math.round(span * 0.04),
    atLow: series.lowTicks,
    mid: series.lowTicks + Math.round(span * 0.5),
    last: series.lastTicks,
  }
}

// ─── Scenario assembly ────────────────────────────────────────────────────────

function baseSnapshot(
  scenario: MarketViewScenarioId,
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
  series: CandleSeries,
): Pick<
  TradingMarketViewSnapshot,
  'instrument' | 'timeframe' | 'generatedAt' | 'environment' | 'candles' | 'sessionState'
> {
  return {
    instrument,
    timeframe,
    generatedAt: NOW,
    // Stage 1 is never broker-facing. 'development' is the canonical vocabulary
    // for that, and 'live' is never reachable as a fallback from here.
    environment: 'development',
    candles: series.candles,
    sessionState: buildSessionDisplayState(new Date(NOW_ISO)),
  }
}

function fixtureProvenance(scenario: MarketViewScenarioId, stale: boolean) {
  const label = MARKET_VIEW_SCENARIOS.find((entry) => entry.id === scenario)?.label ?? scenario
  return {
    origin: 'FIXTURE' as const,
    freshness: stale ? ('STALE' as const) : ('FRESH' as const),
    sourceLabel: `Fixtur · ${label}`,
    // No provider is connected. Null, never a placeholder name that could be
    // mistaken for a live session.
    providerLabel: null,
    observedAt: stale ? (asTimestamp(STALE_OBSERVED_ISO) as Timestamp) : NOW,
  }
}

function fourHourOpen(series: CandleSeries, session: 'LONDON' | 'NEW_YORK', ticks: number) {
  return {
    label: session === 'NEW_YORK' ? '10:00 NY 4H open' : '02:00 London 4H open',
    price: ticksToPriceText(ticks),
    openedAt: candleTimeAt(series, session === 'NEW_YORK' ? 42 : 6),
    session,
  }
}

// ─── The six scenarios ────────────────────────────────────────────────────────

function longDeveloping(
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  const series = buildSeries('long-developing', instrument, timeframe)
  const anchor = annotationAnchors(series)
  const entry = anchor.last
  const stop = anchor.atLow - 8
  const target = entry + (entry - stop) * 2

  return {
    ...baseSnapshot('long-developing', instrument, timeframe, series),
    provenance: fixtureProvenance('long-developing', false),
    selectedFourHourOpen: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    liquidity: [
      {
        id: 'liq-pdl',
        kind: 'PREVIOUS_DAY_LOW',
        price: ticksToPriceText(anchor.belowLow),
        status: 'SWEPT',
        label: 'Föregående dagslägsta',
        timeframe: '15m',
      },
      {
        id: 'liq-eqh',
        kind: 'EQUAL_HIGHS',
        price: ticksToPriceText(anchor.aboveHigh),
        status: 'INTACT',
        label: 'Lika toppar',
        timeframe: '15m',
      },
    ],
    liquidityZones: [
      {
        id: 'zone-sweep',
        kind: 'SESSION_LOW',
        upper: ticksToPriceText(anchor.atLow + 10),
        lower: ticksToPriceText(anchor.belowLow),
        fromTime: candleTimeAt(series, 48),
        toTime: candleTimeAt(series, 62),
        status: 'SWEPT',
        label: 'Sessionslägsta svept',
      },
    ],
    fairValueGaps: [
      {
        id: 'fvg-1',
        direction: 'LONG',
        upper: ticksToPriceText(anchor.mid + 22),
        lower: ticksToPriceText(anchor.mid - 6),
        fromTime: candleTimeAt(series, 64),
        toTime: candleTimeAt(series, 89),
        state: 'OPEN',
        timeframe: '5m',
        label: 'Bullish FVG',
      },
    ],
    manipulation: [
      {
        id: 'manip-1',
        kind: 'LIQUIDITY_SWEEP_LOW',
        at: candleTimeAt(series, 58),
        price: ticksToPriceText(anchor.belowLow),
        timeframe: '5m',
        label: 'Sweep under sessionslägsta',
      },
    ],
    thesis: {
      bias: 'LONG',
      headline: 'Long-bias över vald 4H-open',
      detail:
        'Priset handlade under den valda 10:00 NY 4H-openen, svepte 5m-likviditet och '
        + 'återvände in i föregående range. Bias är long så länge återtaget håller.',
      anchoredTo: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    },
    setup: {
      direction: 'LONG',
      grade: 'B',
      stage: 'DEVELOPING',
      session: 'NEW_YORK',
      confirmations: {
        liquiditySweep: 'CONFIRMED',
        iFvg: 'UNKNOWN',
        cisd: 'ABSENT',
        smt: 'UNKNOWN',
      },
      note: '1m-bekräftelse är ofullständig.',
    },
    tradeProposal: {
      status: 'OBSERVATION_ONLY',
      direction: 'LONG',
      grade: 'B',
      entry: ticksToPriceText(entry),
      stopLoss: ticksToPriceText(stop),
      takeProfit: ticksToPriceText(target),
      breakEven: null,
      riskReward: priceText('2.0'),
      reason: 'Observation. Ingen execution provider är ansluten och setupen är inte bekräftad.',
    },
    riskState: {
      status: 'CLEAR',
      proposedRisk: priceText('142.50'),
      riskPercent: priceText('0.95'),
      stopDistance: ticksToPriceText(entry - stop),
      dailyRealizedLoss: priceText('0.00'),
      reservedRisk: priceText('0.00'),
      dailyLossLimit: priceText('450.00'),
      maxRiskPerTrade: priceText('150.00'),
      attemptsUsed: 0,
      maxAttempts: 3,
      note: null,
    },
    propState: {
      status: 'NOT_CONFIGURED',
      note: 'Ingen prop-profil är konfigurerad (GATE-09 öppen).',
    },
    positionState: {
      state: 'FLAT',
      direction: 'NEUTRAL',
      quantity: 0,
      averagePrice: null,
      note: null,
    },
    explanation: {
      headline: '1m-bekräftelse saknas',
      body:
        'Priset handlade under den valda 10:00 NY 4H-openen och svepte 5m-likviditet innan '
        + 'det återvände in i föregående range. 1m-bekräftelse är för närvarande ofullständig. '
        + 'Inget trade proposal är körbart.',
      timeline: [
        { id: 'ev-1', at: candleTimeAt(series, 42), text: 'Vald 4H-open registrerad.' },
        { id: 'ev-2', at: candleTimeAt(series, 58), text: 'Sweep under sessionslägsta.' },
        { id: 'ev-3', at: candleTimeAt(series, 64), text: 'Bullish FVG lämnad öppen.' },
        { id: 'ev-4', at: NOW, text: 'Väntar på CISD på 1m.' },
      ],
    },
  }
}

function shortDeveloping(
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  const series = buildSeries('short-developing', instrument, timeframe)
  const anchor = annotationAnchors(series)
  const entry = anchor.last
  const stop = anchor.atHigh + 8
  const target = entry - (stop - entry) * 2

  return {
    ...baseSnapshot('short-developing', instrument, timeframe, series),
    provenance: fixtureProvenance('short-developing', false),
    selectedFourHourOpen: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    liquidity: [
      {
        id: 'liq-pdh',
        kind: 'PREVIOUS_DAY_HIGH',
        price: ticksToPriceText(anchor.aboveHigh),
        status: 'SWEPT',
        label: 'Föregående dagshögsta',
        timeframe: '15m',
      },
      {
        id: 'liq-eql',
        kind: 'EQUAL_LOWS',
        price: ticksToPriceText(anchor.belowLow),
        status: 'INTACT',
        label: 'Lika bottnar',
        timeframe: '15m',
      },
    ],
    liquidityZones: [
      {
        id: 'zone-sweep',
        kind: 'SESSION_HIGH',
        upper: ticksToPriceText(anchor.aboveHigh),
        lower: ticksToPriceText(anchor.atHigh - 10),
        fromTime: candleTimeAt(series, 46),
        toTime: candleTimeAt(series, 60),
        status: 'SWEPT',
        label: 'Sessionshögsta svept',
      },
    ],
    fairValueGaps: [
      {
        id: 'fvg-1',
        direction: 'SHORT',
        upper: ticksToPriceText(anchor.mid + 8),
        lower: ticksToPriceText(anchor.mid - 20),
        fromTime: candleTimeAt(series, 62),
        toTime: candleTimeAt(series, 89),
        state: 'OPEN',
        timeframe: '5m',
        label: 'Bearish FVG',
      },
    ],
    manipulation: [
      {
        id: 'manip-1',
        kind: 'LIQUIDITY_SWEEP_HIGH',
        at: candleTimeAt(series, 56),
        price: ticksToPriceText(anchor.aboveHigh),
        timeframe: '5m',
        label: 'Sweep över sessionshögsta',
      },
    ],
    thesis: {
      bias: 'SHORT',
      headline: 'Short-bias under vald 4H-open',
      detail:
        'Priset drev över den valda 4H-openen, tog ut lika toppar och avvisades tillbaka '
        + 'under nivån. Bias är short så länge avvisningen håller.',
      anchoredTo: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    },
    setup: {
      direction: 'SHORT',
      grade: 'B',
      stage: 'DEVELOPING',
      session: 'NEW_YORK',
      confirmations: {
        liquiditySweep: 'CONFIRMED',
        iFvg: 'ABSENT',
        cisd: 'UNKNOWN',
        smt: 'UNKNOWN',
      },
      note: 'CISD ännu inte utvärderad.',
    },
    tradeProposal: {
      status: 'OBSERVATION_ONLY',
      direction: 'SHORT',
      grade: 'B',
      entry: ticksToPriceText(entry),
      stopLoss: ticksToPriceText(stop),
      takeProfit: ticksToPriceText(target),
      breakEven: null,
      riskReward: priceText('2.0'),
      reason: 'Observation. Ingen execution provider är ansluten och setupen är inte bekräftad.',
    },
    riskState: {
      status: 'CLEAR',
      proposedRisk: priceText('138.00'),
      riskPercent: priceText('0.92'),
      stopDistance: ticksToPriceText(stop - entry),
      dailyRealizedLoss: priceText('0.00'),
      reservedRisk: priceText('0.00'),
      dailyLossLimit: priceText('450.00'),
      maxRiskPerTrade: priceText('150.00'),
      attemptsUsed: 0,
      maxAttempts: 3,
      note: null,
    },
    propState: {
      status: 'NOT_CONFIGURED',
      note: 'Ingen prop-profil är konfigurerad (GATE-09 öppen).',
    },
    positionState: {
      state: 'FLAT',
      direction: 'NEUTRAL',
      quantity: 0,
      averagePrice: null,
      note: null,
    },
    explanation: {
      headline: 'Avvaktar CISD',
      body:
        'Lika toppar togs ut och priset avvisades tillbaka under den valda 4H-openen. '
        + 'CISD är ännu inte utvärderad på 1m. Inget trade proposal är körbart.',
      timeline: [
        { id: 'ev-1', at: candleTimeAt(series, 42), text: 'Vald 4H-open registrerad.' },
        { id: 'ev-2', at: candleTimeAt(series, 56), text: 'Sweep över lika toppar.' },
        { id: 'ev-3', at: candleTimeAt(series, 62), text: 'Bearish FVG lämnad öppen.' },
        { id: 'ev-4', at: NOW, text: 'Väntar på CISD på 1m.' },
      ],
    },
  }
}

function aPlusConfirmed(
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  const series = buildSeries('a-plus-confirmed', instrument, timeframe)
  const anchor = annotationAnchors(series)
  const entry = anchor.last
  const stop = anchor.mid - 24
  const target = entry + (entry - stop) * 3

  return {
    ...baseSnapshot('a-plus-confirmed', instrument, timeframe, series),
    provenance: fixtureProvenance('a-plus-confirmed', false),
    selectedFourHourOpen: fourHourOpen(series, 'NEW_YORK', anchor.mid - 12),
    liquidity: [
      {
        id: 'liq-eql',
        kind: 'EQUAL_LOWS',
        price: ticksToPriceText(anchor.belowLow),
        status: 'SWEPT',
        label: 'Lika bottnar',
        timeframe: '15m',
      },
      {
        id: 'liq-sh',
        kind: 'SESSION_HIGH',
        price: ticksToPriceText(anchor.aboveHigh),
        status: 'INTACT',
        label: 'Sessionshögsta',
        timeframe: '15m',
      },
    ],
    liquidityZones: [
      {
        id: 'zone-1',
        kind: 'EQUAL_LOWS',
        upper: ticksToPriceText(anchor.atLow + 12),
        lower: ticksToPriceText(anchor.belowLow),
        fromTime: candleTimeAt(series, 40),
        toTime: candleTimeAt(series, 58),
        status: 'SWEPT',
        label: 'Likviditetspool under lika bottnar',
      },
    ],
    fairValueGaps: [
      {
        id: 'fvg-1',
        direction: 'LONG',
        upper: ticksToPriceText(anchor.mid + 4),
        lower: ticksToPriceText(anchor.mid - 26),
        fromTime: candleTimeAt(series, 60),
        toTime: candleTimeAt(series, 74),
        state: 'INVERTED',
        timeframe: '1m',
        label: 'iFVG — inverterad',
      },
      {
        id: 'fvg-2',
        direction: 'LONG',
        upper: ticksToPriceText(anchor.mid + 34),
        lower: ticksToPriceText(anchor.mid + 10),
        fromTime: candleTimeAt(series, 74),
        toTime: candleTimeAt(series, 89),
        state: 'OPEN',
        timeframe: '5m',
        label: 'Bullish FVG',
      },
    ],
    manipulation: [
      {
        id: 'manip-1',
        kind: 'LIQUIDITY_SWEEP_LOW',
        at: candleTimeAt(series, 56),
        price: ticksToPriceText(anchor.belowLow),
        timeframe: '1m',
        label: 'Sweep under lika bottnar',
      },
      {
        id: 'manip-2',
        kind: 'DISPLACEMENT',
        at: candleTimeAt(series, 66),
        price: ticksToPriceText(anchor.mid + 16),
        timeframe: '1m',
        label: 'Displacement upp',
      },
    ],
    thesis: {
      bias: 'LONG',
      headline: 'A+ long — samtliga bekräftelser rapporterade',
      detail:
        'Likviditet under lika bottnar togs, priset displacerade upp genom den valda '
        + '4H-openen och invertade FVG:n håller som stöd. SMT rapporteras som TRUE.',
      anchoredTo: fourHourOpen(series, 'NEW_YORK', anchor.mid - 12),
    },
    setup: {
      direction: 'LONG',
      grade: 'A+',
      stage: 'CONFIRMED',
      session: 'NEW_YORK',
      confirmations: {
        liquiditySweep: 'CONFIRMED',
        iFvg: 'CONFIRMED',
        cisd: 'CONFIRMED',
        smt: 'TRUE',
      },
      note: 'Samtliga fyra bekräftelser rapporterade.',
    },
    tradeProposal: {
      // The strongest possible statement of the Stage 1 boundary: even a fully
      // confirmed A+ setup cannot be executed, because there is no provider to
      // execute it against and no order path in this build.
      status: 'NO_EXECUTION_PROVIDER',
      direction: 'LONG',
      grade: 'A+',
      entry: ticksToPriceText(entry),
      stopLoss: ticksToPriceText(stop),
      takeProfit: ticksToPriceText(target),
      breakEven: ticksToPriceText(entry),
      riskReward: priceText('3.0'),
      reason:
        'Ingen execution provider är ansluten. Förslaget visas som observation och kan inte skickas.',
    },
    riskState: {
      status: 'CLEAR',
      proposedRisk: priceText('148.00'),
      riskPercent: priceText('0.99'),
      stopDistance: ticksToPriceText(entry - stop),
      dailyRealizedLoss: priceText('0.00'),
      reservedRisk: priceText('148.00'),
      dailyLossLimit: priceText('450.00'),
      maxRiskPerTrade: priceText('150.00'),
      attemptsUsed: 1,
      maxAttempts: 3,
      note: 'Reserverad risk är en pre-entry-kontroll, inte en realiserad förlust.',
    },
    propState: {
      status: 'NOT_CONFIGURED',
      note: 'Ingen prop-profil är konfigurerad (GATE-09 öppen).',
    },
    positionState: {
      state: 'FLAT',
      direction: 'NEUTRAL',
      quantity: 0,
      averagePrice: null,
      note: null,
    },
    explanation: {
      headline: 'Bekräftad setup — fortfarande inte körbar',
      body:
        'Samtliga fyra bekräftelser rapporteras som på plats och graden är A+. '
        + 'Detta ändrar ingenting om körbarhet: ingen execution provider är ansluten, '
        + 'och Atlas Market View kan inte skicka en order oavsett vad den visar.',
      timeline: [
        { id: 'ev-1', at: candleTimeAt(series, 42), text: 'Vald 4H-open registrerad.' },
        { id: 'ev-2', at: candleTimeAt(series, 56), text: 'Sweep under lika bottnar.' },
        { id: 'ev-3', at: candleTimeAt(series, 60), text: 'FVG inverterad — iFVG rapporterad.' },
        { id: 'ev-4', at: candleTimeAt(series, 66), text: 'Displacement upp, CISD rapporterad.' },
        { id: 'ev-5', at: NOW, text: 'SMT rapporterad TRUE. Grad A+.' },
      ],
    },
  }
}

function riskBlocked(
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  const series = buildSeries('risk-blocked', instrument, timeframe)
  const anchor = annotationAnchors(series)
  const entry = anchor.last
  const stop = anchor.atLow - 6
  const target = entry + (entry - stop) * 2

  return {
    ...baseSnapshot('risk-blocked', instrument, timeframe, series),
    provenance: fixtureProvenance('risk-blocked', false),
    selectedFourHourOpen: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    liquidity: [
      {
        id: 'liq-sl',
        kind: 'SESSION_LOW',
        price: ticksToPriceText(anchor.belowLow),
        status: 'SWEPT',
        label: 'Sessionslägsta',
        timeframe: '15m',
      },
    ],
    liquidityZones: [],
    fairValueGaps: [
      {
        id: 'fvg-1',
        direction: 'LONG',
        upper: ticksToPriceText(anchor.mid + 10),
        lower: ticksToPriceText(anchor.mid - 14),
        fromTime: candleTimeAt(series, 70),
        toTime: candleTimeAt(series, 89),
        state: 'OPEN',
        timeframe: '5m',
        label: 'Bullish FVG',
      },
    ],
    manipulation: [
      {
        id: 'manip-1',
        kind: 'LIQUIDITY_SWEEP_LOW',
        at: candleTimeAt(series, 64),
        price: ticksToPriceText(anchor.belowLow),
        timeframe: '5m',
        label: 'Sweep under sessionslägsta',
      },
    ],
    thesis: {
      bias: 'LONG',
      headline: 'Setup finns — risken tillåter den inte',
      detail:
        'Strukturen skulle stödja en long, men den dagliga förlustgränsen är nådd och '
        + 'samtliga försök är förbrukade. Setupens kvalitet ändrar inte det.',
      anchoredTo: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    },
    setup: {
      direction: 'LONG',
      grade: 'A',
      stage: 'CONFIRMED',
      session: 'NEW_YORK',
      confirmations: {
        liquiditySweep: 'CONFIRMED',
        iFvg: 'CONFIRMED',
        cisd: 'CONFIRMED',
        smt: 'UNKNOWN',
      },
      note: 'Setupen är bekräftad men blockeras av riskläget.',
    },
    tradeProposal: {
      status: 'OBSERVATION_ONLY',
      direction: 'LONG',
      grade: 'A',
      entry: ticksToPriceText(entry),
      stopLoss: ticksToPriceText(stop),
      takeProfit: ticksToPriceText(target),
      breakEven: null,
      riskReward: priceText('2.0'),
      reason: 'Risk Engine rapporterar BLOCKED. Förslaget visas endast som observation.',
    },
    riskState: {
      status: 'BLOCKED',
      proposedRisk: priceText('150.00'),
      riskPercent: priceText('1.00'),
      stopDistance: ticksToPriceText(entry - stop),
      dailyRealizedLoss: priceText('450.00'),
      reservedRisk: priceText('0.00'),
      dailyLossLimit: priceText('450.00'),
      maxRiskPerTrade: priceText('150.00'),
      attemptsUsed: 3,
      maxAttempts: 3,
      note: 'Daglig förlustgräns nådd och samtliga tre försök förbrukade.',
    },
    propState: {
      status: 'NOT_CONFIGURED',
      note: 'Ingen prop-profil är konfigurerad (GATE-09 öppen).',
    },
    positionState: {
      state: 'FLAT',
      direction: 'NEUTRAL',
      quantity: 0,
      averagePrice: null,
      note: null,
    },
    explanation: {
      headline: 'Riskläget blockerar',
      body:
        'Den realiserade dagliga förlusten har nått gränsen på 450 USD och samtliga tre '
        + 'försök är förbrukade. Strukturen på skärmen är fortfarande synlig, men ingenting '
        + 'i den kan leda till en order.',
      timeline: [
        { id: 'ev-1', at: candleTimeAt(series, 20), text: 'Försök 1 avslutat med förlust.' },
        { id: 'ev-2', at: candleTimeAt(series, 44), text: 'Försök 2 avslutat med förlust.' },
        { id: 'ev-3', at: candleTimeAt(series, 68), text: 'Försök 3 avslutat med förlust.' },
        { id: 'ev-4', at: NOW, text: 'Daglig gräns nådd — Risk Engine rapporterar BLOCKED.' },
      ],
    },
  }
}

function neutralNoSetup(
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  const series = buildSeries('neutral-no-setup', instrument, timeframe)
  const anchor = annotationAnchors(series)

  return {
    ...baseSnapshot('neutral-no-setup', instrument, timeframe, series),
    provenance: fixtureProvenance('neutral-no-setup', false),
    selectedFourHourOpen: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    liquidity: [
      {
        id: 'liq-sh',
        kind: 'SESSION_HIGH',
        price: ticksToPriceText(anchor.aboveHigh),
        status: 'INTACT',
        label: 'Sessionshögsta',
        timeframe: '15m',
      },
      {
        id: 'liq-sl',
        kind: 'SESSION_LOW',
        price: ticksToPriceText(anchor.belowLow),
        status: 'INTACT',
        label: 'Sessionslägsta',
        timeframe: '15m',
      },
    ],
    liquidityZones: [],
    fairValueGaps: [],
    manipulation: [],
    thesis: {
      bias: 'NEUTRAL',
      headline: 'Ingen bias',
      detail:
        'Priset ligger i en smal range runt den valda 4H-openen. Ingen likviditet har tagits '
        + 'och ingen riktning är etablerad.',
      anchoredTo: fourHourOpen(series, 'NEW_YORK', anchor.mid),
    },
    setup: {
      direction: 'NEUTRAL',
      grade: 'NONE',
      stage: 'NONE',
      session: 'NEW_YORK',
      confirmations: {
        liquiditySweep: 'ABSENT',
        iFvg: 'ABSENT',
        cisd: 'ABSENT',
        smt: 'UNKNOWN',
      },
      note: 'Ingen setup är under utveckling.',
    },
    tradeProposal: {
      status: 'OBSERVATION_ONLY',
      direction: 'NEUTRAL',
      grade: 'NONE',
      entry: null,
      stopLoss: null,
      takeProfit: null,
      breakEven: null,
      riskReward: null,
      reason: 'Ingen setup. Det finns ingenting att föreslå.',
    },
    riskState: {
      status: 'NOT_EVALUATED',
      proposedRisk: null,
      riskPercent: null,
      stopDistance: null,
      dailyRealizedLoss: priceText('0.00'),
      reservedRisk: priceText('0.00'),
      dailyLossLimit: priceText('450.00'),
      maxRiskPerTrade: priceText('150.00'),
      attemptsUsed: 0,
      maxAttempts: 3,
      note: 'Ingen kandidat att utvärdera.',
    },
    propState: {
      status: 'NOT_CONFIGURED',
      note: 'Ingen prop-profil är konfigurerad (GATE-09 öppen).',
    },
    positionState: {
      state: 'FLAT',
      direction: 'NEUTRAL',
      quantity: 0,
      averagePrice: null,
      note: null,
    },
    explanation: {
      headline: 'Ingenting att agera på',
      body:
        'Priset rör sig i en smal range runt den valda 4H-openen utan att ta likviditet '
        + 'åt något håll. Ingen setup utvecklas och inget förslag finns.',
      timeline: [
        { id: 'ev-1', at: candleTimeAt(series, 42), text: 'Vald 4H-open registrerad.' },
        { id: 'ev-2', at: NOW, text: 'Ingen likviditet tagen. Ingen riktning etablerad.' },
      ],
    },
  }
}

function unknownStale(
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  const series = buildSeries('unknown-stale', instrument, timeframe)

  return {
    ...baseSnapshot('unknown-stale', instrument, timeframe, series),
    provenance: fixtureProvenance('unknown-stale', true),
    // Nothing structural is asserted, because nothing can be. An empty
    // annotation set here means "not asserted", and the view says so in words
    // rather than leaving a clean chart to imply a calm market.
    selectedFourHourOpen: null,
    liquidity: [],
    liquidityZones: [],
    fairValueGaps: [],
    manipulation: [],
    thesis: {
      bias: 'NEUTRAL',
      headline: 'Tillståndet kan inte bekräftas',
      detail:
        'Den senaste observationen är äldre än vad som kan behandlas som aktuell. '
        + 'Ingenting på skärmen får läsas som nuvarande marknadstillstånd.',
      anchoredTo: null,
    },
    setup: {
      direction: 'NEUTRAL',
      grade: 'NONE',
      stage: 'UNKNOWN',
      session: null,
      confirmations: {
        liquiditySweep: 'UNKNOWN',
        iFvg: 'UNKNOWN',
        cisd: 'UNKNOWN',
        smt: 'UNKNOWN',
      },
      note: 'Inget bekräftelsetillstånd kan fastställas från en inaktuell feed.',
    },
    tradeProposal: {
      status: 'NO_EXECUTION_PROVIDER',
      direction: 'NEUTRAL',
      grade: 'NONE',
      entry: null,
      stopLoss: null,
      takeProfit: null,
      breakEven: null,
      riskReward: null,
      reason: 'Inaktuellt tillstånd. Ingenting kan föreslås och ingenting kan skickas.',
    },
    riskState: {
      status: 'UNKNOWN',
      proposedRisk: null,
      riskPercent: null,
      stopDistance: null,
      dailyRealizedLoss: null,
      reservedRisk: null,
      dailyLossLimit: priceText('450.00'),
      maxRiskPerTrade: priceText('150.00'),
      attemptsUsed: null,
      maxAttempts: 3,
      note: 'Riskläget kan inte fastställas. UNKNOWN blir aldrig ALLOW.',
    },
    propState: {
      status: 'UNKNOWN',
      note: 'Prop-läget kan inte fastställas.',
    },
    positionState: {
      state: 'UNKNOWN',
      direction: 'NEUTRAL',
      quantity: null,
      averagePrice: null,
      note: 'Positionstillståndet kan inte bekräftas.',
    },
    explanation: {
      headline: 'Inaktuell feed',
      body:
        'Den senaste bekräftade observationen är äldre än tröskeln för aktuellt tillstånd. '
        + 'Ljusstakarna nedan är det som senast togs emot, inte vad marknaden gör nu. '
        + 'Varje härlett tillstånd rapporteras som UNKNOWN, och UNKNOWN blir aldrig ALLOW.',
      timeline: [
        { id: 'ev-1', at: asTimestamp(STALE_OBSERVED_ISO), text: 'Senaste bekräftade observation.' },
        { id: 'ev-2', at: NOW, text: 'Ingen färsk data. Tillståndet rapporteras som UNKNOWN.' },
      ],
    },
  }
}

const BUILDERS: Readonly<
  Record<
    MarketViewScenarioId,
    (instrument: MarketInstrument, timeframe: MarketTimeframe) => TradingMarketViewSnapshot
  >
> = {
  'long-developing': longDeveloping,
  'short-developing': shortDeveloping,
  'a-plus-confirmed': aPlusConfirmed,
  'risk-blocked': riskBlocked,
  'neutral-no-setup': neutralNoSetup,
  'unknown-stale': unknownStale,
}

/**
 * Build one fixture snapshot.
 *
 * Pure and total: the same three arguments always produce a deeply equal
 * result, with no clock read and no randomness that is not seeded from those
 * arguments.
 */
export function buildFixtureSnapshot(
  scenario: MarketViewScenarioId,
  instrument: MarketInstrument,
  timeframe: MarketTimeframe,
): TradingMarketViewSnapshot {
  return BUILDERS[scenario](instrument, timeframe)
}

// ─── The mock source ──────────────────────────────────────────────────────────

/**
 * A `MarketViewDataSource` backed entirely by fixtures.
 *
 * Declares `origin: 'FIXTURE'`, which is what drives every safety affordance in
 * the view. There is deliberately no option to construct this source with a
 * different origin: the only way to render SIMULATION or LIVE is to write a
 * source that can honestly claim it.
 */
export function createMockMarketViewDataSource(
  scenario: MarketViewScenarioId,
): MarketViewDataSource {
  const label = MARKET_VIEW_SCENARIOS.find((entry) => entry.id === scenario)?.label ?? scenario
  return {
    id: `mock:${scenario}`,
    label: `Fixtur · ${label}`,
    origin: 'FIXTURE',
    instruments: () => MARKET_INSTRUMENTS,
    timeframes: () => MARKET_TIMEFRAMES,
    async load(query: MarketViewQuery) {
      return buildFixtureSnapshot(scenario, query.instrument, query.timeframe)
    },
  }
}
