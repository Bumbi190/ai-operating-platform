import { describe, expect, it } from 'vitest'
import {
  canonicalJson, causationChain, eventsForCorrelation, orderEvents, tradingEvent,
  type TradingEvent,
} from './events'
import { asId } from './ids'
import type { AccountId, CorrelationId, EventId } from './ids'
import { asTimestamp } from './time'
import { tradeProposal, withStatus, type TradeProposal } from './proposal'
import { riskDecision } from './contracts'
import { asDecimal } from './decimal'
import { strategyVersionRef } from './versions'
import type {
  InstrumentId, ProposalId, RiskDecisionId, RiskProfileId, SignalId, StrategyId, StrategyVersionId,
} from './ids'

const CORR = asId<'CorrelationId'>('corr-1') as CorrelationId
const ACCOUNT = asId<'AccountId'>('acct-1') as AccountId

/** Test ids are literals we control, so `asId` is the right constructor here. */
function eid(value: string): EventId {
  return asId<'EventId'>(value) as EventId
}

interface EvOverrides extends Partial<Omit<TradingEvent, 'eventId' | 'causationId'>> {
  eventId: string
  causationId?: string | null
}

function ev(over: EvOverrides): TradingEvent {
  const { eventId, causationId, ...rest } = over
  return tradingEvent({
    eventType: 'SIGNAL_CREATED',
    entityType: 'SIGNAL',
    entityId: 'sig-1',
    occurredAt: asTimestamp('2026-08-27T10:00:00Z'),
    recordedAt: asTimestamp('2026-08-27T10:00:00Z'),
    correlationId: CORR,
    causationId: causationId === undefined || causationId === null ? null : eid(causationId),
    environment: 'demo',
    accountId: ACCOUNT,
    strategyVersionId: null,
    sourceComponent: 'test',
    severity: 'INFO',
    payloadVersion: 'v1',
    payload: {},
    ...rest,
    eventId: eid(eventId),
  })
}

describe('event envelope', () => {
  it('freezes events — the trail is append-only', () => {
    const e = ev({ eventId: 'e1' })
    expect(Object.isFrozen(e)).toBe(true)
  })

  it('keeps occurredAt separate from recordedAt', () => {
    const delayed = ev({
      eventId: 'e1',
      occurredAt: asTimestamp('2026-08-27T10:00:00Z'),
      recordedAt: asTimestamp('2026-08-27T10:00:30Z'),
    })
    expect(delayed.occurredAt).not.toBe(delayed.recordedAt)
  })

  it('always carries an environment', () => {
    expect(ev({ eventId: 'e1' }).environment).toBe('demo')
  })
})

describe('reconstruction order', () => {
  it('orders by occurredAt', () => {
    const out = orderEvents([
      ev({ eventId: 'b', occurredAt: asTimestamp('2026-08-27T10:00:02Z') }),
      ev({ eventId: 'a', occurredAt: asTimestamp('2026-08-27T10:00:01Z') }),
    ])
    expect(out.map((e) => e.eventId)).toEqual(['a', 'b'])
  })

  it('breaks ties deterministically so replay is reproducible', () => {
    const same = asTimestamp('2026-08-27T10:00:00Z')
    const first = orderEvents([
      ev({ eventId: 'z', occurredAt: same, recordedAt: same }),
      ev({ eventId: 'a', occurredAt: same, recordedAt: same }),
    ])
    const second = orderEvents([
      ev({ eventId: 'a', occurredAt: same, recordedAt: same }),
      ev({ eventId: 'z', occurredAt: same, recordedAt: same }),
    ])
    expect(first.map((e) => e.eventId)).toEqual(['a', 'z'])
    expect(first.map((e) => e.eventId)).toEqual(second.map((e) => e.eventId))
  })

  it('does not mutate the input array', () => {
    const input = [
      ev({ eventId: 'b', occurredAt: asTimestamp('2026-08-27T10:00:02Z') }),
      ev({ eventId: 'a', occurredAt: asTimestamp('2026-08-27T10:00:01Z') }),
    ]
    orderEvents(input)
    expect(input.map((e) => e.eventId)).toEqual(['b', 'a'])
  })

  it('selects one lifecycle by correlation id', () => {
    const other = asId<'CorrelationId'>('corr-2') as CorrelationId
    const out = eventsForCorrelation(
      [ev({ eventId: 'a' }), ev({ eventId: 'b', correlationId: other })],
      CORR,
    )
    expect(out.map((e) => e.eventId)).toEqual(['a'])
  })
})

describe('causation chain', () => {
  it('walks back to the origin, oldest first', () => {
    const events = [
      ev({ eventId: 'signal', causationId: null }),
      ev({ eventId: 'risk', causationId: 'signal' }),
      ev({ eventId: 'proposal', causationId: 'risk' }),
    ]
    const chain = causationChain(events, eid('proposal'))
    expect(chain.map((e) => e.eventId)).toEqual(['signal', 'risk', 'proposal'])
  })

  it('terminates on a self-referential chain instead of hanging', () => {
    const events = [ev({ eventId: 'x', causationId: 'x' })]
    expect(causationChain(events, eid('x')).map((e) => e.eventId)).toEqual(['x'])
  })

  it('stops cleanly at a missing predecessor', () => {
    const events = [ev({ eventId: 'b', causationId: 'missing' })]
    expect(causationChain(events, eid('b')).map((e) => e.eventId)).toEqual(['b'])
  })
})

describe('deterministic serialization', () => {
  it('produces identical output regardless of key order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } })
    const b = canonicalJson({ c: { y: 2, z: 1 }, a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('preserves array order — arrays are sequences, not sets', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })

  it('drops undefined and keeps null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}')
  })

  it('serializes bigint rather than throwing', () => {
    expect(canonicalJson({ units: BigInt(125) })).toBe('{"units":"125"}')
  })

  it('rejects cycles instead of truncating silently', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => canonicalJson(cyclic)).toThrow(/circular/)
  })

  /*
   * A repeated reference is not a cycle.
   *
   * The cycle guard tracks the ACTIVE RECURSION PATH, so membership means "this
   * object is currently its own ancestor". An earlier implementation used a
   * grow-only visited set, which made every second sighting of the same object
   * look like a cycle and rejected structures that serialize perfectly well —
   * `{ a: shared, b: shared }` threw. These cases pin the distinction.
   */
  describe('shared references are a DAG, not a cycle', () => {
    it('serializes a shared sibling reference at each occurrence', () => {
      const shared = { value: 1 }
      expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"value":1},"b":{"value":1}}')
    })

    it('serializes a deeply nested shared reference', () => {
      const shared = { v: 1 }
      expect(canonicalJson({ a: { deep: { shared } }, b: { other: { shared } } }))
        .toBe('{"a":{"deep":{"shared":{"v":1}}},"b":{"other":{"shared":{"v":1}}}}')
    })

    it('serializes the same object reached through an object and an array', () => {
      const shared = { v: 1 }
      expect(canonicalJson({ obj: shared, list: [shared] }))
        .toBe('{"list":[{"v":1}],"obj":{"v":1}}')
    })

    it('serializes a repeated shared array', () => {
      const shared = [1, 2]
      expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":[1,2],"b":[1,2]}')
    })

    it('serializes the same reference many times over', () => {
      const shared = { v: 1 }
      expect(canonicalJson([shared, shared, shared])).toBe('[{"v":1},{"v":1},{"v":1}]')
    })

    it('keeps a shared reference byte-identical to an inlined copy', () => {
      // The point of the whole fix: sharing is a memory detail, not a semantic
      // one, so it must not be observable in the output.
      const shared = { v: 1 }
      expect(canonicalJson({ a: shared, b: shared }))
        .toBe(canonicalJson({ a: { v: 1 }, b: { v: 1 } }))
    })
  })

  describe('true cycles still throw', () => {
    it('rejects a self cycle', () => {
      const value: Record<string, unknown> = {}
      value.self = value
      expect(() => canonicalJson(value)).toThrow(/circular/)
    })

    it('rejects an indirect object cycle', () => {
      const a: Record<string, unknown> = {}
      const b: Record<string, unknown> = { a }
      a.b = b
      expect(() => canonicalJson(a)).toThrow(/circular/)
    })

    it('rejects an array cycle', () => {
      const arr: unknown[] = []
      arr.push(arr)
      expect(() => canonicalJson(arr)).toThrow(/circular/)
    })

    it('rejects a mixed object/array cycle', () => {
      const obj: Record<string, unknown> = {}
      obj.list = [obj]
      expect(() => canonicalJson(obj)).toThrow(/circular/)
    })

    it('rejects a cycle that is only reachable below a shared reference', () => {
      // Both behaviours at once: the shared branch must serialize, and the cycle
      // beneath it must still be caught.
      const shared: Record<string, unknown> = { v: 1 }
      const cyclic: Record<string, unknown> = { shared }
      cyclic.back = cyclic
      expect(() => canonicalJson({ a: shared, b: cyclic })).toThrow(/circular/)
    })

    it('does not let a thrown call affect a later independent one', () => {
      // An API-level regression, and deliberately not more than that: each
      // top-level `canonicalJson` builds its own ancestry, so this would pass
      // even without the `finally`. It guards the public behaviour — throwing
      // once must not leave the serializer unusable — rather than proving
      // anything about how the ancestry path is unwound.
      const cyclic: Record<string, unknown> = {}
      cyclic.self = cyclic
      expect(() => canonicalJson(cyclic)).toThrow(/circular/)

      const shared = { v: 1 }
      expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}')
    })
  })

  it('gives two structurally identical events the same bytes', () => {
    const base = { eventId: 'e1', severity: 'INFO', payload: { x: 1, y: 2 } }
    const shuffled = { payload: { y: 2, x: 1 }, severity: 'INFO', eventId: 'e1' }
    expect(canonicalJson(base)).toBe(canonicalJson(shuffled))
  })
})

// ─── Snapshot semantics ───────────────────────────────────────────────────────

describe('snapshot and immutability', () => {
  const proposal: TradeProposal = tradeProposal({
    proposalId: asId<'ProposalId'>('prop-1') as ProposalId,
    signalId: asId<'SignalId'>('sig-1') as SignalId,
    accountId: ACCOUNT,
    instrumentId: asId<'InstrumentId'>('MNQ') as InstrumentId,
    environment: 'demo',
    strategyVersion: strategyVersionRef(
      asId<'StrategyId'>('s') as StrategyId,
      asId<'StrategyVersionId'>('sv-1') as StrategyVersionId,
      'v1.0',
    )!,
    direction: 'LONG',
    setupGrade: 'A',
    entry: asDecimal('20150.25'),
    stopLoss: asDecimal('20140.00'),
    takeProfit: asDecimal('20171.00'),
    rr: asDecimal('2.02'),
    quantity: asDecimal('1'),
    riskAmount: asDecimal('102.50'),
    riskPercentage: asDecimal('0.21'),
    aiAnalysisId: null,
    riskDecisionId: null,
    propDecisionId: null,
    status: 'CREATED',
    createdAt: asTimestamp('2026-08-27T10:00:00Z'),
    expiresAt: asTimestamp('2026-08-27T10:05:00Z'),
    reasons: [],
  })

  it('freezes the proposal and its reason array', () => {
    expect(Object.isFrozen(proposal)).toBe(true)
    expect(Object.isFrozen(proposal.reasons)).toBe(true)
  })

  it('produces a new value on status change, leaving the original intact', () => {
    const approved = withStatus(proposal, 'APPROVED')
    expect(approved.status).toBe('APPROVED')
    expect(proposal.status).toBe('CREATED')
    expect(approved).not.toBe(proposal)
  })

  it('freezes decision arrays so codes cannot be appended after the fact', () => {
    const decision = riskDecision({
      riskDecisionId: asId<'RiskDecisionId'>('rd-1') as RiskDecisionId,
      signalId: asId<'SignalId'>('sig-1') as SignalId,
      accountId: ACCOUNT,
      riskProfileId: asId<'RiskProfileId'>('rp-1') as RiskProfileId,
      riskProfileVersion: 'v1.0',
      evaluatedAt: asTimestamp('2026-08-27T10:00:00Z'),
      result: 'DENY',
      proposedQuantity: null,
      riskAmount: null,
      riskPercentage: null,
      dailyLossRemaining: null,
      drawdownRemaining: null,
      rulesEvaluated: [],
      reasonCodes: ['DAILY_LOSS_LIMIT'],
    })
    expect(Object.isFrozen(decision)).toBe(true)
    expect(Object.isFrozen(decision.reasonCodes)).toBe(true)
    expect(Object.isFrozen(decision.rulesEvaluated)).toBe(true)
  })
})
