/**
 * Recorded-first contract selection orchestration — behaviour.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §10, §24, §26
 *  - Recorded-First Contract Selection Orchestration Canonical v1.0 (Beslut M)
 *
 * Calendars are built through the real `buildContractCalendar`, decisions
 * through the real materializer, and the happy paths run against the real
 * in-memory store — so a passing test describes the genuine composition rather
 * than a hand-shaped lookalike. A scripted store is used only where a real one
 * cannot produce the state under test: a lookup invariant violation, a store
 * that loses a decision it just accepted, or a technically rejected promise.
 *
 * Where a test claims the fallback was NOT read, it supplies a Proxy that throws
 * on any property access. That turns "we did not look" from an assertion about
 * observed outputs into a fact about the run.
 */

import { describe, expect, it } from 'vitest'

import {
  buildContractCalendar,
  resolveContractAt,
  type ContractCalendar,
  type ContractCalendarEntry,
  type ContractCalendarInput,
} from '../contract-calendar'
import { contractCycle, resolvedContract, type QuarterMonth } from '../contract-identity'
import {
  materializeContractSelectionDecision,
  type ContractSelectionDecision,
} from '../contract-selection'
import {
  createInMemoryContractSelectionDecisionStore,
  type ContractSelectionDecisionStore,
  type FindContractSelectionDecisionResult,
  type RecordContractSelectionDecisionResult,
} from '../contract-selection-store'
import { asId, type ContractSelectionDecisionId } from '../ids'
import type { MarketInstrument } from '../market-instrument'
import { asTimestamp, type Timestamp } from '../time'
import {
  orchestrateRecordedFirstContractSelection,
  type HistoricalContractSelectionFallback,
  type RecordedFirstContractSelectionInput,
  type RecordedFirstContractSelectionResult,
} from './orchestration'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const T = (raw: string): Timestamp => asTimestamp(raw)
const id = (raw: string): ContractSelectionDecisionId => asId<'ContractSelectionDecisionId'>(raw)

const ID_A = id('11111111-2222-4333-8444-555555555555')
const ID_B = id('99999999-8888-4777-8666-555555555555')
const DECIDED = T('2026-09-04T08:00:00.250Z')

/** Inside the fixture coverage window, after the H roll and before the M roll. */
const AT = T('2026-02-01T00:00:00Z')
/** Outside any authored coverage window. */
const UNCOVERED = T('2030-01-01T00:00:00Z')

function entry(
  root: MarketInstrument,
  year: number,
  quarterMonth: QuarterMonth,
  rollEffectiveAt: string,
  lastTradeAt: string,
): ContractCalendarEntry {
  return {
    contract: resolvedContract(root, contractCycle(year, quarterMonth)),
    rollEffectiveAt: T(rollEffectiveAt),
    lastTradeAt: T(lastTradeAt),
    finalSettlementRef: `fixture final settlement ${year}-${quarterMonth}`,
    exchange: 'FIXTURE-VENUE',
    sourceRef: 'fixture/authored-for-tests',
  }
}

/** H is selected from 2026-01-05, M from 2026-04-06. At `AT` that means H. */
function baseInput(calendarVersion: string): ContractCalendarInput {
  return {
    calendarVersion,
    entries: [
      entry('NQ', 2026, 3, '2026-01-05T23:00:00Z', '2026-03-20T13:30:00Z'),
      entry('NQ', 2026, 6, '2026-04-06T22:00:00Z', '2026-06-18T13:30:00Z'),
    ],
    coverage: [{ root: 'NQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-07-01T00:00:00Z') }],
  }
}

/** A second authored history where M is already selected at `AT`. */
function earlyRollInput(calendarVersion: string): ContractCalendarInput {
  return {
    calendarVersion,
    entries: [entry('NQ', 2026, 6, '2026-01-05T23:00:00Z', '2026-06-18T13:30:00Z')],
    coverage: [{ root: 'NQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-07-01T00:00:00Z') }],
  }
}

function built(input: ContractCalendarInput): ContractCalendar {
  const outcome = buildContractCalendar(input)
  if (!outcome.ok) throw new Error(`fixture calendar refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.calendar
}

const CALENDAR_A = built(baseInput('fixture-v1'))
const CALENDAR_B = built(earlyRollInput('fixture-v2'))

function fallback(
  calendar: ContractCalendar = CALENDAR_A,
  decisionId: ContractSelectionDecisionId = ID_A,
  decidedAt: Timestamp = DECIDED,
): HistoricalContractSelectionFallback {
  return { calendar, decisionId, decidedAt }
}

/** A fallback that makes any property read an immediate, loud failure. */
function poison(): HistoricalContractSelectionFallback {
  return new Proxy({} as HistoricalContractSelectionFallback, {
    get(_target, property) {
      throw new Error(`the fallback was read: ${String(property)}`)
    },
    has(_target, property) {
      throw new Error(`the fallback was probed: ${String(property)}`)
    },
  })
}

/** A genuine decision, built the way production builds one. */
function decisionFor(
  calendar: ContractCalendar,
  decisionId: ContractSelectionDecisionId = ID_A,
  decidedAt: Timestamp = DECIDED,
): ContractSelectionDecision {
  // Built through the real resolver so the fixture cannot drift from production.
  const resolution = resolveContractAt(calendar, 'NQ', AT)
  if (resolution.outcome !== 'RESOLVED') throw new Error('fixture resolution refused')
  return materializeContractSelectionDecision({ resolution, decisionId, decidedAt })
}

// ─── Stores ───────────────────────────────────────────────────────────────────

const REJECT = 'REJECT' as const

interface Scripted {
  readonly store: ContractSelectionDecisionStore
  readonly calls: string[]
  readonly submitted: ContractSelectionDecision[]
}

/** A store whose every answer is dictated, in order, by the test. */
function scripted(script: {
  readonly finds?: readonly (FindContractSelectionDecisionResult | typeof REJECT)[]
  readonly records?: readonly (RecordContractSelectionDecisionResult | typeof REJECT)[]
}): Scripted {
  const calls: string[] = []
  const submitted: ContractSelectionDecision[] = []
  let findIndex = 0
  let recordIndex = 0

  const store: ContractSelectionDecisionStore = {
    async find(): Promise<FindContractSelectionDecisionResult> {
      calls.push('find')
      const next = script.finds?.[findIndex++]
      if (next === undefined) throw new Error('unscripted find')
      if (next === REJECT) throw new Error('technical lookup failure')
      return next
    },
    async record(decision): Promise<RecordContractSelectionDecisionResult> {
      calls.push('record')
      submitted.push(decision)
      const next = script.records?.[recordIndex++]
      if (next === undefined) throw new Error('unscripted record')
      if (next === REJECT) throw new Error('technical record failure')
      return next
    },
  }

  return { store, calls, submitted }
}

/** The real store, with its call order observed. */
function observed(): Scripted {
  const inner = createInMemoryContractSelectionDecisionStore()
  const calls: string[] = []
  const submitted: ContractSelectionDecision[] = []
  const store: ContractSelectionDecisionStore = {
    async find(root, at) {
      calls.push('find')
      return inner.find(root, at)
    },
    async record(decision) {
      calls.push('record')
      submitted.push(decision)
      return inner.record(decision)
    },
  }
  return { store, calls, submitted }
}

const run = (
  input: RecordedFirstContractSelectionInput,
): Promise<RecordedFirstContractSelectionResult> => orchestrateRecordedFirstContractSelection(input)

// ─── A–E: the recorded decision wins, and nothing else runs ───────────────────

describe('an already recorded decision', () => {
  it('A. initial FOUND returns DECISION', async () => {
    const stored = decisionFor(CALENDAR_A)
    const { store } = scripted({ finds: [{ outcome: 'FOUND', decision: stored }] })

    const result = await run({ store, root: 'NQ', at: AT })

    expect(result.outcome).toBe('DECISION')
    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision.resolvedContract.cycle.quarterMonth).toBe(3)
  })

  it('B. returns the exact object the store returned, not a copy', async () => {
    const stored = decisionFor(CALENDAR_A)
    const { store } = scripted({ finds: [{ outcome: 'FOUND', decision: stored }] })

    const result = await run({ store, root: 'NQ', at: AT })

    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision).toBe(stored)
  })

  it('C. performs exactly one find', async () => {
    const stored = decisionFor(CALENDAR_A)
    const spy = scripted({ finds: [{ outcome: 'FOUND', decision: stored }] })

    await run({ store: spy.store, root: 'NQ', at: AT })

    expect(spy.calls).toEqual(['find'])
    expect(spy.calls.filter((c) => c === 'find')).toHaveLength(1)
  })

  it('D. performs zero record', async () => {
    const stored = decisionFor(CALENDAR_A)
    const spy = scripted({ finds: [{ outcome: 'FOUND', decision: stored }] })

    await run({ store: spy.store, root: 'NQ', at: AT })

    expect(spy.calls).not.toContain('record')
    expect(spy.submitted).toEqual([])
  })

  it('E. never reads a supplied fallback — proven by a throwing proxy', async () => {
    const stored = decisionFor(CALENDAR_A)
    const spy = scripted({ finds: [{ outcome: 'FOUND', decision: stored }] })

    const result = await run({ store: spy.store, root: 'NQ', at: AT, fallback: poison() })

    expect(result.outcome).toBe('DECISION')
    expect(spy.calls).toEqual(['find'])
  })

  it('E2. POSITIVE CONTROL: the poison fallback really does throw when read', () => {
    const p = poison()
    expect(() => p.decidedAt).toThrow(/the fallback was read/)
    expect(() => p.calendar).toThrow(/the fallback was read/)
    expect(() => p.decisionId).toThrow(/the fallback was read/)
  })
})

// ─── F–G: a broken lookup fails closed ───────────────────────────────────────

describe('an initial lookup invariant violation', () => {
  it('F. returns STORE_LOOKUP_INVARIANT_VIOLATION with the store diagnostic', async () => {
    const detail = 'two overlapping decisions matched NQ at 2026-02-01T00:00:00Z'
    const { store } = scripted({ finds: [{ outcome: 'INVARIANT_VIOLATION', detail }] })

    const result = await run({ store, root: 'NQ', at: AT })

    expect(result.outcome).toBe('STORE_LOOKUP_INVARIANT_VIOLATION')
    if (result.outcome !== 'STORE_LOOKUP_INVARIANT_VIOLATION') throw new Error('unreachable')
    expect(result.detail).toBe(detail)
  })

  it('G. does not touch the fallback, resolve, materialize or record', async () => {
    const spy = scripted({ finds: [{ outcome: 'INVARIANT_VIOLATION', detail: 'broken' }] })

    const result = await run({ store: spy.store, root: 'NQ', at: AT, fallback: poison() })

    expect(result.outcome).toBe('STORE_LOOKUP_INVARIANT_VIOLATION')
    expect(spy.calls).toEqual(['find'])
    expect(spy.submitted).toEqual([])
  })
})

// ─── H–K: NOT_FOUND, the optional fallback, and the race ─────────────────────

describe('no recorded decision and no fallback', () => {
  it('H. returns HISTORICAL_FALLBACK_REQUIRED', async () => {
    const { store } = scripted({ finds: [{ outcome: 'NOT_FOUND' }] })

    const result = await run({ store, root: 'NQ', at: AT })

    expect(result).toEqual({ outcome: 'HISTORICAL_FALLBACK_REQUIRED' })
  })

  it('I. performs exactly one find and zero record', async () => {
    const spy = scripted({ finds: [{ outcome: 'NOT_FOUND' }] })

    await run({ store: spy.store, root: 'NQ', at: AT })

    expect(spy.calls).toEqual(['find'])
    expect(spy.submitted).toEqual([])
  })

  it('J. a later call supplying a fallback still re-runs find first', async () => {
    const spy = scripted({
      finds: [
        { outcome: 'NOT_FOUND' },
        { outcome: 'NOT_FOUND' },
        { outcome: 'FOUND', decision: decisionFor(CALENDAR_A) },
      ],
      records: [{ outcome: 'RECORDED' }],
    })

    const first = await run({ store: spy.store, root: 'NQ', at: AT })
    expect(first.outcome).toBe('HISTORICAL_FALLBACK_REQUIRED')
    expect(spy.calls).toEqual(['find'])

    const second = await run({ store: spy.store, root: 'NQ', at: AT, fallback: fallback() })
    expect(second.outcome).toBe('DECISION')

    // The second call opened with a lookup before it consulted the fallback.
    expect(spy.calls).toEqual(['find', 'find', 'record', 'find'])
  })

  it('K. a decision recorded between two calls wins, and the fallback is ignored', async () => {
    const store = createInMemoryContractSelectionDecisionStore()

    const first = await run({ store, root: 'NQ', at: AT })
    expect(first.outcome).toBe('HISTORICAL_FALLBACK_REQUIRED')

    // Another writer records, using a different history and a different identity.
    const byOther = decisionFor(CALENDAR_B, ID_B, T('2026-09-04T09:30:00.000Z'))
    expect((await store.record(byOther)).outcome).toBe('RECORDED')

    const second = await run({ store, root: 'NQ', at: AT, fallback: poison() })

    expect(second.outcome).toBe('DECISION')
    if (second.outcome !== 'DECISION') throw new Error('unreachable')
    expect(second.decision.decisionId).toBe(ID_B)
    expect(second.decision.calendarVersion).toBe('fixture-v2')
    expect(second.decision.resolvedContract.cycle.quarterMonth).toBe(6)
  })
})

// ─── L–M: the resolver's refusal ─────────────────────────────────────────────

describe('a resolution the pinned calendar refuses', () => {
  it('L. returns RESOLUTION_REFUSED carrying the resolver refusal unchanged', async () => {
    const { store } = scripted({ finds: [{ outcome: 'NOT_FOUND' }] })

    const result = await run({ store, root: 'NQ', at: UNCOVERED, fallback: fallback() })

    expect(result.outcome).toBe('RESOLUTION_REFUSED')
    if (result.outcome !== 'RESOLUTION_REFUSED') throw new Error('unreachable')
    expect(result.refusal).toBe('NO_AUTHORITATIVE_COVERAGE')
  })

  it('M. records nothing', async () => {
    const spy = scripted({ finds: [{ outcome: 'NOT_FOUND' }] })

    await run({ store: spy.store, root: 'NQ', at: UNCOVERED, fallback: fallback() })

    expect(spy.calls).toEqual(['find'])
    expect(spy.submitted).toEqual([])
  })
})

// ─── N–R: the full fallback path ─────────────────────────────────────────────

describe('a successful fallback', () => {
  it('N. runs find, record, then find again — in that order', async () => {
    const spy = observed()

    const result = await run({ store: spy.store, root: 'NQ', at: AT, fallback: fallback() })

    expect(result.outcome).toBe('DECISION')
    expect(spy.calls).toEqual(['find', 'record', 'find'])
  })

  it('O. returns the store reread, not the pre-store materialized object', async () => {
    // The store hands back a deliberately different object than the one recorded.
    const sentinel = decisionFor(CALENDAR_B, ID_B, T('2026-09-04T10:00:00.000Z'))
    const spy = scripted({
      finds: [{ outcome: 'NOT_FOUND' }, { outcome: 'FOUND', decision: sentinel }],
      records: [{ outcome: 'RECORDED' }],
    })

    const result = await run({ store: spy.store, root: 'NQ', at: AT, fallback: fallback() })

    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision).toBe(sentinel)
    expect(result.decision).not.toBe(spy.submitted[0])
    expect(spy.submitted[0]?.decisionId).toBe(ID_A)
    expect(result.decision.decisionId).toBe(ID_B)
  })

  it('P. calendarVersion came from the pinned calendar through the resolver', async () => {
    const storeA = createInMemoryContractSelectionDecisionStore()
    const a = await run({ store: storeA, root: 'NQ', at: AT, fallback: fallback(CALENDAR_A) })
    if (a.outcome !== 'DECISION') throw new Error('unreachable')
    expect(a.decision.calendarVersion).toBe('fixture-v1')
    expect(a.decision.resolvedContract.cycle.quarterMonth).toBe(3)

    const storeB = createInMemoryContractSelectionDecisionStore()
    const b = await run({ store: storeB, root: 'NQ', at: AT, fallback: fallback(CALENDAR_B) })
    if (b.outcome !== 'DECISION') throw new Error('unreachable')
    expect(b.decision.calendarVersion).toBe('fixture-v2')
    expect(b.decision.resolvedContract.cycle.quarterMonth).toBe(6)
  })

  it('Q. decisionId is exactly the supplied one', async () => {
    const store = createInMemoryContractSelectionDecisionStore()

    const result = await run({ store, root: 'NQ', at: AT, fallback: fallback(CALENDAR_A, ID_B) })

    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision.decisionId).toBe(ID_B)
  })

  it('R. decidedAt is exactly the supplied instant, never derived from at', async () => {
    const store = createInMemoryContractSelectionDecisionStore()
    const decidedAt = T('2026-09-04T08:00:00.250Z')

    const result = await run({
      store,
      root: 'NQ',
      at: AT,
      fallback: fallback(CALENDAR_A, ID_A, decidedAt),
    })

    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision.decidedAt).toBe(decidedAt)
    expect(result.decision.decidedAt).not.toBe(AT)
    // The exact stored text survives; nothing normalises it.
    expect(String(result.decision.decidedAt)).toBe('2026-09-04T08:00:00.250Z')
  })

  it('R2. the policy version comes from the materializer, not the caller', async () => {
    const store = createInMemoryContractSelectionDecisionStore()
    const result = await run({ store, root: 'NQ', at: AT, fallback: fallback() })
    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision.policyVersion).toBe('market-data-contract-lifecycle-v1.0')
    expect(result.decision.reasons).toEqual([{ code: 'CONTRACT_SELECTED_BY_CANONICAL_CALENDAR' }])
    expect(result.decision.evidence).toEqual([])
  })
})

// ─── S–T: the store refuses to record ────────────────────────────────────────

describe('a store that refuses the record', () => {
  it('S. preserves the refusal and the detail exactly', async () => {
    const detail = 'an overlapping selection interval already exists for NQ'
    const { store } = scripted({
      finds: [{ outcome: 'NOT_FOUND' }],
      records: [{ outcome: 'REFUSED', refusal: 'OVERLAPPING_SELECTION_INTERVAL', detail }],
    })

    const result = await run({ store, root: 'NQ', at: AT, fallback: fallback() })

    expect(result.outcome).toBe('STORE_RECORD_REFUSED')
    if (result.outcome !== 'STORE_RECORD_REFUSED') throw new Error('unreachable')
    expect(result.refusal).toBe('OVERLAPPING_SELECTION_INTERVAL')
    expect(result.detail).toBe(detail)
  })

  it('T. performs no post-record lookup and no retry', async () => {
    const spy = scripted({
      finds: [{ outcome: 'NOT_FOUND' }],
      records: [
        { outcome: 'REFUSED', refusal: 'DECISION_ID_DISAGREEMENT', detail: 'id disagreement' },
      ],
    })

    await run({ store: spy.store, root: 'NQ', at: AT, fallback: fallback() })

    expect(spy.calls).toEqual(['find', 'record'])
    expect(spy.submitted).toHaveLength(1)
  })
})

// ─── U–W: impossible states after RECORDED ───────────────────────────────────

describe('an impossible state after a successful record', () => {
  it('U. NOT_FOUND becomes POST_RECORD_INVARIANT_VIOLATION / NOT_FOUND', async () => {
    const { store } = scripted({
      finds: [{ outcome: 'NOT_FOUND' }, { outcome: 'NOT_FOUND' }],
      records: [{ outcome: 'RECORDED' }],
    })

    const result = await run({ store, root: 'NQ', at: AT, fallback: fallback() })

    expect(result.outcome).toBe('POST_RECORD_INVARIANT_VIOLATION')
    if (result.outcome !== 'POST_RECORD_INVARIANT_VIOLATION') throw new Error('unreachable')
    expect(result.observed).toBe('NOT_FOUND')
    expect(result.detail).toContain('NOT_FOUND')
    expect(result.detail.length).toBeGreaterThan(0)
  })

  it('U2. the NOT_FOUND diagnostic is deterministic across runs', async () => {
    const make = () =>
      scripted({
        finds: [{ outcome: 'NOT_FOUND' }, { outcome: 'NOT_FOUND' }],
        records: [{ outcome: 'RECORDED' }],
      }).store

    const one = await run({ store: make(), root: 'NQ', at: AT, fallback: fallback() })
    const two = await run({ store: make(), root: 'NQ', at: AT, fallback: fallback() })

    expect(one).toEqual(two)
  })

  it('V. INVARIANT_VIOLATION becomes POST_RECORD_INVARIANT_VIOLATION / INVARIANT_VIOLATION', async () => {
    const detail = 'two matches after a single record'
    const { store } = scripted({
      finds: [{ outcome: 'NOT_FOUND' }, { outcome: 'INVARIANT_VIOLATION', detail }],
      records: [{ outcome: 'RECORDED' }],
    })

    const result = await run({ store, root: 'NQ', at: AT, fallback: fallback() })

    if (result.outcome !== 'POST_RECORD_INVARIANT_VIOLATION') throw new Error('unreachable')
    expect(result.observed).toBe('INVARIANT_VIOLATION')
    expect(result.detail).toBe(detail)
  })

  it('W. never returns the materialized decision, and never records twice', async () => {
    const spy = scripted({
      finds: [{ outcome: 'NOT_FOUND' }, { outcome: 'NOT_FOUND' }],
      records: [{ outcome: 'RECORDED' }],
    })

    const result = await run({ store: spy.store, root: 'NQ', at: AT, fallback: fallback() })

    expect(result.outcome).not.toBe('DECISION')
    expect(result).not.toHaveProperty('decision')
    expect(spy.calls).toEqual(['find', 'record', 'find'])
    expect(spy.submitted).toHaveLength(1)
  })
})

// ─── X–Z: technical failure stays technical ──────────────────────────────────

describe('a technically rejected store promise', () => {
  it('X. an initial find rejection propagates as a rejection', async () => {
    const { store } = scripted({ finds: [REJECT] })

    await expect(run({ store, root: 'NQ', at: AT })).rejects.toThrow('technical lookup failure')
  })

  it('Y. a record rejection propagates as a rejection', async () => {
    const { store } = scripted({ finds: [{ outcome: 'NOT_FOUND' }], records: [REJECT] })

    await expect(
      run({ store, root: 'NQ', at: AT, fallback: fallback() }),
    ).rejects.toThrow('technical record failure')
  })

  it('Z. a post-record find rejection propagates as a rejection', async () => {
    const { store } = scripted({
      finds: [{ outcome: 'NOT_FOUND' }, REJECT],
      records: [{ outcome: 'RECORDED' }],
    })

    await expect(
      run({ store, root: 'NQ', at: AT, fallback: fallback() }),
    ).rejects.toThrow('technical lookup failure')
  })

  it('Z2. no rejection is converted into a domain outcome', async () => {
    const { store } = scripted({ finds: [REJECT] })
    const settled = await run({ store, root: 'NQ', at: AT }).then(
      (value) => ({ kind: 'resolved' as const, value }),
      (error: unknown) => ({ kind: 'rejected' as const, error }),
    )
    expect(settled.kind).toBe('rejected')
  })
})

// ─── §37: two independent recording contexts ─────────────────────────────────

describe('two independent historical contexts', () => {
  it('hold different decisions for the same root and instant', async () => {
    const storeA = createInMemoryContractSelectionDecisionStore()
    const storeB = createInMemoryContractSelectionDecisionStore()

    const a = await run({ store: storeA, root: 'NQ', at: AT, fallback: fallback(CALENDAR_A, ID_A) })
    const b = await run({ store: storeB, root: 'NQ', at: AT, fallback: fallback(CALENDAR_B, ID_B) })

    if (a.outcome !== 'DECISION' || b.outcome !== 'DECISION') throw new Error('unreachable')

    expect(a.decision.calendarVersion).toBe('fixture-v1')
    expect(b.decision.calendarVersion).toBe('fixture-v2')
    expect(a.decision.resolvedContract.cycle.quarterMonth).toBe(3)
    expect(b.decision.resolvedContract.cycle.quarterMonth).toBe(6)
    expect(a.decision.decisionId).not.toBe(b.decision.decisionId)
  })

  it('no module state leaks between them — replaying either is stable', async () => {
    const storeA = createInMemoryContractSelectionDecisionStore()
    const storeB = createInMemoryContractSelectionDecisionStore()
    await run({ store: storeA, root: 'NQ', at: AT, fallback: fallback(CALENDAR_A, ID_A) })
    await run({ store: storeB, root: 'NQ', at: AT, fallback: fallback(CALENDAR_B, ID_B) })

    // Re-reading each context, with no fallback at all, still gives its own answer.
    const againA = await run({ store: storeA, root: 'NQ', at: AT })
    const againB = await run({ store: storeB, root: 'NQ', at: AT })

    if (againA.outcome !== 'DECISION' || againB.outcome !== 'DECISION') throw new Error('unreachable')
    expect(againA.decision.calendarVersion).toBe('fixture-v1')
    expect(againB.decision.calendarVersion).toBe('fixture-v2')
  })
})

// ─── Result immutability ─────────────────────────────────────────────────────

describe('the result envelope', () => {
  it('is frozen, and the decision inside it is the store-s own object', async () => {
    const stored = decisionFor(CALENDAR_A)
    const { store } = scripted({ finds: [{ outcome: 'FOUND', decision: stored }] })

    const result = await run({ store, root: 'NQ', at: AT })

    expect(Object.isFrozen(result)).toBe(true)
    if (result.outcome !== 'DECISION') throw new Error('unreachable')
    expect(result.decision).toBe(stored)
    expect(() => {
      ;(result as { outcome: string }).outcome = 'tampered'
    }).toThrow()
  })

  it('every outcome envelope is frozen', async () => {
    const notFound = await run({ store: scripted({ finds: [{ outcome: 'NOT_FOUND' }] }).store, root: 'NQ', at: AT })
    expect(Object.isFrozen(notFound)).toBe(true)

    const refused = await run({
      store: scripted({ finds: [{ outcome: 'NOT_FOUND' }] }).store,
      root: 'NQ',
      at: UNCOVERED,
      fallback: fallback(),
    })
    expect(Object.isFrozen(refused)).toBe(true)

    const broken = await run({
      store: scripted({ finds: [{ outcome: 'INVARIANT_VIOLATION', detail: 'x' }] }).store,
      root: 'NQ',
      at: AT,
    })
    expect(Object.isFrozen(broken)).toBe(true)
  })
})

// ─── §38: type proofs (tsc --noEmit is the authority) ────────────────────────

type Expect<T extends true> = T
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

type FallbackHasExactlyThreeFields = Expect<
  Equals<keyof HistoricalContractSelectionFallback, 'calendar' | 'decisionId' | 'decidedAt'>
>
type InputHasExactlyFourFields = Expect<
  Equals<keyof RecordedFirstContractSelectionInput, 'store' | 'root' | 'at' | 'fallback'>
>
type FallbackIsOptional = Expect<
  Equals<RecordedFirstContractSelectionInput['fallback'], HistoricalContractSelectionFallback | undefined>
>
type TakesExactlyOneInputObject = Expect<
  Equals<Parameters<typeof orchestrateRecordedFirstContractSelection>, [RecordedFirstContractSelectionInput]>
>
type ReturnsAPromisedResult = Expect<
  Equals<
    ReturnType<typeof orchestrateRecordedFirstContractSelection>,
    Promise<RecordedFirstContractSelectionResult>
  >
>
type ResultHasExactlySixOutcomes = Expect<
  Equals<
    RecordedFirstContractSelectionResult['outcome'],
    | 'DECISION'
    | 'HISTORICAL_FALLBACK_REQUIRED'
    | 'RESOLUTION_REFUSED'
    | 'STORE_RECORD_REFUSED'
    | 'STORE_LOOKUP_INVARIANT_VIOLATION'
    | 'POST_RECORD_INVARIANT_VIOLATION'
  >
>
type CalendarIsTheOnlyPin = Expect<
  Equals<HistoricalContractSelectionFallback['calendar'], ContractCalendar>
>
type ObservedIsTheTwoImpossibleReads = Expect<
  Equals<
    Extract<RecordedFirstContractSelectionResult, { outcome: 'POST_RECORD_INVARIANT_VIOLATION' }>['observed'],
    'NOT_FOUND' | 'INVARIANT_VIOLATION'
  >
>

describe('the shape refuses what canon forbids', () => {
  it('rejects a callable fallback, a duplicated version and a content override', () => {
    const aStore: ContractSelectionDecisionStore = createInMemoryContractSelectionDecisionStore()
    const anInstant: Timestamp = AT
    const aCalendar: ContractCalendar = CALENDAR_A

    const notCallable: RecordedFirstContractSelectionInput = {
      store: aStore,
      root: 'NQ',
      at: anInstant,
      // @ts-expect-error — the fallback is an inert value object, never a supplier (Beslut M §27)
      fallback: () => ({ calendar: aCalendar, decisionId: ID_A, decidedAt: DECIDED }),
    }

    const noCalendarVersion: HistoricalContractSelectionFallback = {
      calendar: aCalendar,
      decisionId: ID_A,
      decidedAt: DECIDED,
      // @ts-expect-error — calendarVersion flows through the resolution (Beslut M §18)
      calendarVersion: 'fixture-v1',
    }

    const noPolicyVersion: HistoricalContractSelectionFallback = {
      calendar: aCalendar,
      decisionId: ID_A,
      decidedAt: DECIDED,
      // @ts-expect-error — policyVersion is materializer-owned (Beslut M §32)
      policyVersion: 'market-data-contract-lifecycle-v1.0',
    }

    const noContentOverride: HistoricalContractSelectionFallback = {
      calendar: aCalendar,
      decisionId: ID_A,
      decidedAt: DECIDED,
      // @ts-expect-error — resolvedContract is resolver-owned (Beslut M §31)
      resolvedContract: resolvedContract('NQ', contractCycle(2026, 6)),
    }

    const noClock: RecordedFirstContractSelectionInput = {
      store: aStore,
      root: 'NQ',
      at: anInstant,
      // @ts-expect-error — C3B.3 is clock-free; no clock may be injected (Beslut M §13)
      clock: { now: () => anInstant },
    }

    expect([notCallable, noCalendarVersion, noPolicyVersion, noContentOverride, noClock]).toHaveLength(5)
  })
})
