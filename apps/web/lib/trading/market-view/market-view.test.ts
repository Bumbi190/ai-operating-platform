/**
 * Atlas Market View — domain contract.
 *
 * These tests pin the things that must not drift: determinism of the fixtures,
 * exactness of prices, the honesty of the safety vocabulary, and the fact that
 * no proposal this model can express is executable.
 */

import { describe, expect, it } from 'vitest'
import {
  MARKET_INSTRUMENTS,
  MARKET_PROPOSAL_STATUSES,
  MARKET_TIMEFRAMES,
  MARKET_VIEW_SCENARIOS,
  MARKET_VIEW_SCENARIO_IDS,
  buildFixtureSnapshot,
  buildSessionDisplayState,
  computeChartGeometry,
  createMockMarketViewDataSource,
  isLiveMarketView,
  parseMarketInstrument,
  parseMarketTimeframe,
  parsePriceText,
  priceToY,
  proposalIsExecutable,
  resolveSafetyBanner,
  timeToIndex,
  type MarketProposalStatus,
  type MarketTradeProposal,
  type TradingMarketViewSnapshot,
} from './index'
import { resolveMarketViewKeyAction, stepIndex } from './keyboard'
import { ticksToPriceText } from './candles'

const EVERY_COMBINATION: Array<[typeof MARKET_VIEW_SCENARIO_IDS[number], typeof MARKET_INSTRUMENTS[number], typeof MARKET_TIMEFRAMES[number]]> =
  MARKET_VIEW_SCENARIO_IDS.flatMap((scenario) =>
    MARKET_INSTRUMENTS.flatMap((instrument) =>
      MARKET_TIMEFRAMES.map((timeframe) => [scenario, instrument, timeframe] as const),
    ),
  ).map((entry) => [...entry] as [typeof MARKET_VIEW_SCENARIO_IDS[number], typeof MARKET_INSTRUMENTS[number], typeof MARKET_TIMEFRAMES[number]])

function everySnapshot(): TradingMarketViewSnapshot[] {
  return EVERY_COMBINATION.map(([scenario, instrument, timeframe]) =>
    buildFixtureSnapshot(scenario, instrument, timeframe),
  )
}

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('fixture determinism', () => {
  it('produces a deeply equal snapshot for the same three arguments', () => {
    for (const [scenario, instrument, timeframe] of EVERY_COMBINATION) {
      const first = buildFixtureSnapshot(scenario, instrument, timeframe)
      const second = buildFixtureSnapshot(scenario, instrument, timeframe)
      expect(second).toEqual(first)
    }
  })

  it('serializes identically across two builds', () => {
    // Deep equality can be satisfied by objects that serialize differently once
    // key order or a stray undefined is involved. The rendered surface depends
    // on the serialized form, so pin that too.
    for (const [scenario, instrument, timeframe] of EVERY_COMBINATION.slice(0, 12)) {
      const a = JSON.stringify(buildFixtureSnapshot(scenario, instrument, timeframe))
      const b = JSON.stringify(buildFixtureSnapshot(scenario, instrument, timeframe))
      expect(b).toBe(a)
    }
  })

  it('gives every scenario/instrument/timeframe combination its own candles', () => {
    const seen = new Map<string, string>()
    for (const [scenario, instrument, timeframe] of EVERY_COMBINATION) {
      const snapshot = buildFixtureSnapshot(scenario, instrument, timeframe)
      const key = `${scenario}:${instrument}:${timeframe}`
      const signature = snapshot.candles.map((candle) => candle.close).join('|')
      for (const [otherKey, otherSignature] of seen) {
        // NQ and MNQ deliberately share a start price but not a seed, so even
        // those two must differ.
        expect(signature, `${key} collided with ${otherKey}`).not.toBe(otherSignature)
      }
      seen.set(key, signature)
    }
  })

  it('reads no clock — generatedAt is fixed', () => {
    const snapshot = buildFixtureSnapshot('long-developing', 'NQ', '5m')
    expect(snapshot.generatedAt).toBe('2026-08-28T15:30:00Z')
  })
})

// ─── Exact prices ─────────────────────────────────────────────────────────────

describe('price exactness', () => {
  it('emits only canonical decimal strings', () => {
    for (const snapshot of everySnapshot().slice(0, 24)) {
      for (const candle of snapshot.candles) {
        for (const value of [candle.open, candle.high, candle.low, candle.close]) {
          expect(parsePriceText(value)).toBe(value)
        }
      }
    }
  })

  it('keeps every candle on the quarter-point tick grid', () => {
    const snapshot = buildFixtureSnapshot('a-plus-confirmed', 'NQ', '1m')
    for (const candle of snapshot.candles) {
      for (const value of [candle.open, candle.high, candle.low, candle.close]) {
        expect(value).toMatch(/\.(00|25|50|75)$/)
      }
    }
  })

  it('renders ticks without floating-point drift', () => {
    // 0.1 + 0.2 arithmetic would show up here as 20150.249999999996.
    expect(ticksToPriceText(80_601)).toBe('20150.25')
    expect(ticksToPriceText(80_603)).toBe('20150.75')
    expect(ticksToPriceText(80_604)).toBe('20151.00')
    expect(ticksToPriceText(0)).toBe('0.00')
  })

  it('never lets high fall below low', () => {
    for (const snapshot of everySnapshot().slice(0, 24)) {
      for (const candle of snapshot.candles) {
        expect(Number(candle.high)).toBeGreaterThanOrEqual(Number(candle.low))
        expect(Number(candle.high)).toBeGreaterThanOrEqual(Number(candle.open))
        expect(Number(candle.high)).toBeGreaterThanOrEqual(Number(candle.close))
        expect(Number(candle.low)).toBeLessThanOrEqual(Number(candle.open))
        expect(Number(candle.low)).toBeLessThanOrEqual(Number(candle.close))
      }
    }
  })
})

// ─── The execution boundary ───────────────────────────────────────────────────

describe('non-executability', () => {
  it('reports no fixture proposal as executable', () => {
    for (const snapshot of everySnapshot()) {
      expect(proposalIsExecutable(snapshot.tradeProposal)).toBe(false)
    }
  })

  it('reports every representable proposal status as non-executable', () => {
    // Exhaustive over the union, not just over what the fixtures happen to use.
    // Adding an executable status makes this fail rather than pass silently.
    for (const status of MARKET_PROPOSAL_STATUSES) {
      const proposal = { status, direction: 'LONG', grade: 'A' } as unknown as MarketTradeProposal
      expect(proposalIsExecutable(proposal)).toBe(false)
    }
  })

  it('keeps the proposal status vocabulary free of an executable member', () => {
    const statuses: readonly MarketProposalStatus[] = MARKET_PROPOSAL_STATUSES
    expect([...statuses].sort()).toEqual([
      'NO_EXECUTION_PROVIDER',
      'OBSERVATION_ONLY',
      'SIMULATED',
    ])
  })

  it('never reports a fixture as live, and always as development', () => {
    for (const snapshot of everySnapshot()) {
      expect(isLiveMarketView(snapshot)).toBe(false)
      expect(snapshot.environment).toBe('development')
      expect(snapshot.provenance.origin).toBe('FIXTURE')
      expect(snapshot.provenance.providerLabel).toBeNull()
    }
  })
})

// ─── Safety vocabulary ────────────────────────────────────────────────────────

describe('safety banner', () => {
  it('reports FIXTURE for the healthy fixture scenarios', () => {
    expect(resolveSafetyBanner(buildFixtureSnapshot('long-developing', 'NQ', '5m'))).toBe('FIXTURE')
    expect(resolveSafetyBanner(buildFixtureSnapshot('a-plus-confirmed', 'NQ', '5m'))).toBe('FIXTURE')
    expect(resolveSafetyBanner(buildFixtureSnapshot('neutral-no-setup', 'ES', '15m'))).toBe('FIXTURE')
  })

  it('lets a blocked risk state outrank provenance', () => {
    expect(resolveSafetyBanner(buildFixtureSnapshot('risk-blocked', 'NQ', '5m'))).toBe('BLOCKED')
  })

  it('reports STALE when the feed is stale', () => {
    expect(resolveSafetyBanner(buildFixtureSnapshot('unknown-stale', 'NQ', '5m'))).toBe('STALE')
  })
})

// ─── Scenario states ──────────────────────────────────────────────────────────

describe('scenario states', () => {
  it('covers every declared scenario with a builder', () => {
    expect(MARKET_VIEW_SCENARIOS.map((entry) => entry.id).sort()).toEqual([...MARKET_VIEW_SCENARIO_IDS].sort())
  })

  it('models a developing long', () => {
    const snapshot = buildFixtureSnapshot('long-developing', 'NQ', '5m')
    expect(snapshot.setup.direction).toBe('LONG')
    expect(snapshot.setup.stage).toBe('DEVELOPING')
    expect(snapshot.setup.confirmations.liquiditySweep).toBe('CONFIRMED')
    expect(snapshot.setup.confirmations.cisd).toBe('ABSENT')
    expect(snapshot.setup.confirmations.iFvg).toBe('UNKNOWN')
    expect(snapshot.tradeProposal.status).toBe('OBSERVATION_ONLY')
  })

  it('models a developing short', () => {
    const snapshot = buildFixtureSnapshot('short-developing', 'NQ', '5m')
    expect(snapshot.setup.direction).toBe('SHORT')
    expect(snapshot.setup.stage).toBe('DEVELOPING')
    expect(snapshot.thesis.bias).toBe('SHORT')
  })

  it('models a fully confirmed A+ that is still not executable', () => {
    const snapshot = buildFixtureSnapshot('a-plus-confirmed', 'NQ', '5m')
    expect(snapshot.setup.grade).toBe('A+')
    expect(snapshot.setup.stage).toBe('CONFIRMED')
    expect(snapshot.setup.confirmations).toEqual({
      liquiditySweep: 'CONFIRMED',
      iFvg: 'CONFIRMED',
      cisd: 'CONFIRMED',
      smt: 'TRUE',
    })
    expect(snapshot.tradeProposal.status).toBe('NO_EXECUTION_PROVIDER')
    expect(proposalIsExecutable(snapshot.tradeProposal)).toBe(false)
    // The inverted gap is what the canonical text calls an iFVG.
    expect(snapshot.fairValueGaps.some((gap) => gap.state === 'INVERTED')).toBe(true)
  })

  it('models a blocked risk state at the canonical limits', () => {
    const snapshot = buildFixtureSnapshot('risk-blocked', 'NQ', '5m')
    expect(snapshot.riskState.status).toBe('BLOCKED')
    expect(snapshot.riskState.dailyRealizedLoss).toBe('450.00')
    expect(snapshot.riskState.dailyLossLimit).toBe('450.00')
    expect(snapshot.riskState.attemptsUsed).toBe(3)
    expect(snapshot.riskState.maxAttempts).toBe(3)
    // A blocked risk state does not erase the setup — it overrides it.
    expect(snapshot.setup.stage).toBe('CONFIRMED')
  })

  it('models an empty market without pretending to know more', () => {
    const snapshot = buildFixtureSnapshot('neutral-no-setup', 'NQ', '5m')
    expect(snapshot.setup.direction).toBe('NEUTRAL')
    expect(snapshot.setup.grade).toBe('NONE')
    expect(snapshot.tradeProposal.entry).toBeNull()
    expect(snapshot.tradeProposal.riskReward).toBeNull()
    expect(snapshot.riskState.status).toBe('NOT_EVALUATED')
  })

  it('models an unknown/stale state with nothing asserted', () => {
    const snapshot = buildFixtureSnapshot('unknown-stale', 'NQ', '5m')
    expect(snapshot.provenance.freshness).toBe('STALE')
    expect(snapshot.riskState.status).toBe('UNKNOWN')
    expect(snapshot.propState.status).toBe('UNKNOWN')
    expect(snapshot.positionState.state).toBe('UNKNOWN')
    expect(snapshot.setup.stage).toBe('UNKNOWN')
    expect(Object.values(snapshot.setup.confirmations)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'])
    expect(snapshot.selectedFourHourOpen).toBeNull()
    // Staleness is a fact about the feed, not about the risk figures. The
    // limits stay printed because they are configuration, not observation.
    expect(snapshot.riskState.dailyRealizedLoss).toBeNull()
    expect(snapshot.riskState.dailyLossLimit).toBe('450.00')
  })

  it('reports prop mode as NOT_CONFIGURED wherever it is knowable', () => {
    // GATE-09 is open and no PropFirmProfile exists. Nothing may claim CLEAR.
    for (const snapshot of everySnapshot()) {
      expect(['NOT_CONFIGURED', 'UNKNOWN']).toContain(snapshot.propState.status)
    }
  })
})

// ─── Instrument and timeframe switching ───────────────────────────────────────

describe('instrument and timeframe switching', () => {
  it('answers for every instrument', () => {
    for (const instrument of MARKET_INSTRUMENTS) {
      const snapshot = buildFixtureSnapshot('long-developing', instrument, '5m')
      expect(snapshot.instrument).toBe(instrument)
      expect(snapshot.candles.length).toBeGreaterThan(0)
    }
  })

  it('answers for every timeframe', () => {
    for (const timeframe of MARKET_TIMEFRAMES) {
      const snapshot = buildFixtureSnapshot('long-developing', 'NQ', timeframe)
      expect(snapshot.timeframe).toBe(timeframe)
      expect(snapshot.candles.length).toBeGreaterThan(0)
    }
  })

  it('spaces bars by the timeframe', () => {
    const perTimeframe = {
      '1m': 60_000,
      '5m': 300_000,
      '15m': 900_000,
      '4H': 14_400_000,
    } as const
    for (const timeframe of MARKET_TIMEFRAMES) {
      const { candles } = buildFixtureSnapshot('long-developing', 'NQ', timeframe)
      const delta = Date.parse(candles[1].openTime) - Date.parse(candles[0].openTime)
      expect(delta).toBe(perTimeframe[timeframe])
    }
  })

  it('rejects values outside the vocabularies', () => {
    expect(parseMarketInstrument('NQ')).toBe('NQ')
    expect(parseMarketInstrument('NQZ5')).toBeNull()
    expect(parseMarketInstrument('')).toBeNull()
    expect(parseMarketTimeframe('4H')).toBe('4H')
    expect(parseMarketTimeframe('1h')).toBeNull()
  })
})

// ─── The data-source seam ─────────────────────────────────────────────────────

describe('mock data source', () => {
  it('declares FIXTURE and answers for the full vocabulary', async () => {
    const source = createMockMarketViewDataSource('long-developing')
    expect(source.origin).toBe('FIXTURE')
    expect(source.instruments()).toEqual(MARKET_INSTRUMENTS)
    expect(source.timeframes()).toEqual(MARKET_TIMEFRAMES)

    const snapshot = await source.load({ instrument: 'MNQ', timeframe: '15m' })
    expect(snapshot).not.toBeNull()
    expect(snapshot?.instrument).toBe('MNQ')
    expect(snapshot?.timeframe).toBe('15m')
  })

  it('matches the direct builder exactly', async () => {
    const source = createMockMarketViewDataSource('risk-blocked')
    const viaSource = await source.load({ instrument: 'ES', timeframe: '1m' })
    expect(viaSource).toEqual(buildFixtureSnapshot('risk-blocked', 'ES', '1m'))
  })
})

// ─── Session windows ──────────────────────────────────────────────────────────

describe('session windows', () => {
  it('uses the canonical zone and derives the offset for the instant', () => {
    // August — America/New_York is on EDT, so -04:00.
    const summer = buildSessionDisplayState(new Date('2026-08-28T15:30:00Z'))
    expect(summer.timezone).toBe('America/New_York')
    expect(summer.utcOffset).toBe('-04:00')
    expect(summer.canonicalTime).toBe('11:30')

    // January — EST, so -05:00. A fixed offset would get one of these wrong.
    const winter = buildSessionDisplayState(new Date('2026-01-15T15:30:00Z'))
    expect(winter.utcOffset).toBe('-05:00')
    expect(winter.canonicalTime).toBe('10:30')
  })

  it('reports the New York window open at 11:30 ET', () => {
    const state = buildSessionDisplayState(new Date('2026-08-28T15:30:00Z'))
    expect(state.activeSession).toBe('NEW_YORK')
    expect(state.windows.find((w) => w.session === 'NEW_YORK')?.state).toBe('OPEN')
    expect(state.windows.find((w) => w.session === 'LONDON')?.state).toBe('AFTER')
  })

  it('reports the London window open at 03:30 ET', () => {
    const state = buildSessionDisplayState(new Date('2026-08-28T07:30:00Z'))
    expect(state.activeSession).toBe('LONDON')
    expect(state.windows.find((w) => w.session === 'LONDON')?.state).toBe('OPEN')
    expect(state.windows.find((w) => w.session === 'NEW_YORK')?.state).toBe('BEFORE')
  })

  it('treats the closing instant as outside the window', () => {
    // 05:00 ET is the London window close, and the canonical break-even acts at
    // that instant — it is not another minute of trading.
    const atClose = buildSessionDisplayState(new Date('2026-08-28T09:00:00Z'))
    expect(atClose.canonicalTime).toBe('05:00')
    expect(atClose.windows.find((w) => w.session === 'LONDON')?.state).toBe('AFTER')
  })

  it('reports no active session outside both windows', () => {
    const state = buildSessionDisplayState(new Date('2026-08-28T12:00:00Z')) // 08:00 ET
    expect(state.activeSession).toBeNull()
  })
})

// ─── Chart geometry ───────────────────────────────────────────────────────────

describe('chart geometry', () => {
  const snapshot = buildFixtureSnapshot('long-developing', 'NQ', '5m')

  it('keeps every candle inside the plot area', () => {
    const geometry = computeChartGeometry({
      candles: snapshot.candles,
      width: 1200,
      height: 520,
    })
    const top = geometry.plot.y
    const bottom = geometry.plot.y + geometry.plot.height
    for (const candle of snapshot.candles) {
      expect(priceToY(geometry, candle.high)).toBeGreaterThanOrEqual(top)
      expect(priceToY(geometry, candle.low)).toBeLessThanOrEqual(bottom)
    }
  })

  it('keeps an out-of-range stop visible when it is included', () => {
    const stop = snapshot.tradeProposal.stopLoss
    expect(stop).not.toBeNull()
    const geometry = computeChartGeometry({
      candles: snapshot.candles,
      includePrices: [stop!],
      width: 1200,
      height: 520,
    })
    const y = priceToY(geometry, stop!)
    expect(y).toBeGreaterThanOrEqual(geometry.plot.y)
    expect(y).toBeLessThanOrEqual(geometry.plot.y + geometry.plot.height)
  })

  it('survives an empty series without producing NaN', () => {
    const geometry = computeChartGeometry({ candles: [], width: 1200, height: 520 })
    expect(Number.isFinite(geometry.priceMin)).toBe(true)
    expect(Number.isFinite(geometry.priceMax)).toBe(true)
    expect(geometry.priceMax).toBeGreaterThan(geometry.priceMin)
    expect(geometry.candleCount).toBe(0)
    expect(geometry.timeTicks).toEqual([])
  })

  it('survives a completely flat series', () => {
    const flat = snapshot.candles.map((candle) => ({
      ...candle,
      open: candle.open,
      high: candle.open,
      low: candle.open,
      close: candle.open,
    }))
    const geometry = computeChartGeometry({ candles: flat, width: 1200, height: 520 })
    expect(geometry.priceMax).toBeGreaterThan(geometry.priceMin)
    expect(Number.isFinite(priceToY(geometry, flat[0].open))).toBe(true)
  })

  it('maps an annotation timestamp onto its own bar', () => {
    const index = 37
    const at = snapshot.candles[index].openTime
    expect(timeToIndex(snapshot.candles, at)).toBe(index)
  })

  it('is deterministic across calls', () => {
    const a = computeChartGeometry({ candles: snapshot.candles, width: 1200, height: 520 })
    const b = computeChartGeometry({ candles: snapshot.candles, width: 1200, height: 520 })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})

// ─── Keyboard ─────────────────────────────────────────────────────────────────

function fakeDocument(html = ''): Document {
  return {
    querySelectorAll: () => (html ? [{ hidden: false, getAttribute: () => null }] : []),
  } as unknown as Document
}

describe('keyboard actions', () => {
  const base = {
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
  }

  it('reuses the rail vocabulary: arrows move, Escape and Backspace return', () => {
    expect(resolveMarketViewKeyAction({ ...base, key: 'ArrowLeft' }, fakeDocument())).toBe('previous-instrument')
    expect(resolveMarketViewKeyAction({ ...base, key: 'ArrowRight' }, fakeDocument())).toBe('next-instrument')
    expect(resolveMarketViewKeyAction({ ...base, key: 'Escape' }, fakeDocument())).toBe('return')
    // Safe Backspace is the rail's own second return key, delegated rather than
    // reimplemented — the same guards decide when it is "safe".
    expect(resolveMarketViewKeyAction({ ...base, key: 'Backspace' }, fakeDocument())).toBe('return')
  })

  it('leaves Enter to whatever control has focus', () => {
    // The rail's 'open' has no meaning inside the workspace: there is no card
    // to open, and Enter belongs to the focused button.
    expect(resolveMarketViewKeyAction({ ...base, key: 'Enter' }, fakeDocument())).toBeNull()
  })

  it('claims no other key', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'k', ' ']) {
      expect(resolveMarketViewKeyAction({ ...base, key }, fakeDocument())).toBeNull()
    }
  })

  it('inherits the rail guards for the return keys too', () => {
    expect(resolveMarketViewKeyAction({ ...base, key: 'Backspace', metaKey: true }, fakeDocument())).toBeNull()
    expect(resolveMarketViewKeyAction({ ...base, key: 'Escape' }, fakeDocument('dialog'))).toBeNull()
    expect(resolveMarketViewKeyAction({ ...base, key: 'Backspace', defaultPrevented: true }, fakeDocument())).toBeNull()
  })

  it('yields to modifiers, to a higher-priority surface and to already-handled events', () => {
    expect(resolveMarketViewKeyAction({ ...base, key: 'ArrowLeft', metaKey: true }, fakeDocument())).toBeNull()
    expect(resolveMarketViewKeyAction({ ...base, key: 'ArrowLeft', defaultPrevented: true }, fakeDocument())).toBeNull()
    expect(resolveMarketViewKeyAction({ ...base, key: 'ArrowLeft' }, fakeDocument('dialog'))).toBeNull()
  })

  it('wraps around like the project rail', () => {
    expect(stepIndex(0, -1, 3)).toBe(2)
    expect(stepIndex(2, 1, 3)).toBe(0)
    expect(stepIndex(0, 0, 0)).toBe(0)
  })
})
