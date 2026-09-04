/**
 * ContractSelectionDecision store — recording and replay behaviour.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §10
 *  - Contract Selection Decision Recording & Replay Canonical v1.0 (Beslut L)
 *
 * Fixtures are built through the real materializer, so every recorded decision
 * is a genuine canonical record rather than a hand-shaped lookalike. Where a
 * test needs a deliberately malformed or mutable decision — a null
 * `effectiveTo`, a backwards interval, a caller object that changes afterwards —
 * it builds that explicitly, because the materializer cannot produce one.
 */

import { describe, expect, it } from 'vitest'

import type { ContractLifecycle } from '../contract-calendar'
import { contractCycle, resolvedContract, type QuarterMonth } from '../contract-identity'
import {
  materializeContractSelectionDecision,
  type ContractSelectionDecision,
  type ResolvedContractResolution,
} from '../contract-selection'
import { asId } from '../ids'
import type { ContractSelectionDecisionId } from '../ids'
import type { MarketInstrument } from '../market-instrument'
import { asTimestamp, type Timestamp } from '../time'
import {
  CONTRACT_SELECTION_STORE_REFUSALS,
  createInMemoryContractSelectionDecisionStore,
  type ContractSelectionDecisionStore,
  type ContractSelectionStoreRefusal,
  type FindContractSelectionDecisionResult,
  type RecordContractSelectionDecisionResult,
} from './store'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MAR = asTimestamp('2026-03-13T18:00:00Z')
const JUN = asTimestamp('2026-06-12T18:00:00Z')
const SEP = asTimestamp('2026-09-11T18:00:00Z')
const DECIDED = asTimestamp('2026-09-04T08:00:00.250Z')

const id = (s: string): ContractSelectionDecisionId => asId<'ContractSelectionDecisionId'>(s)
const ID_A = id('11111111-2222-4333-8444-555555555555')
const ID_B = id('99999999-8888-4777-8666-555555555555')

interface MutableCycle { year: number; quarterMonth: QuarterMonth }
interface MutableContract { root: MarketInstrument; cycle: MutableCycle }
interface MutableResolution {
  outcome: 'RESOLVED'
  contract: MutableContract
  lifecycle: ContractLifecycle
  effectiveFrom: Timestamp
  effectiveTo: Timestamp
  calendarVersion: string
}

function resolution(
  root: MarketInstrument = 'NQ',
  from: Timestamp = MAR,
  to: Timestamp = JUN,
  year = 2026,
  quarterMonth: QuarterMonth = 6,
  calendarVersion = 'fixture-v1',
): MutableResolution {
  return {
    outcome: 'RESOLVED',
    contract: { root, cycle: { year, quarterMonth } },
    lifecycle: {
      contract: resolvedContract(root, contractCycle(year, quarterMonth)),
      lastTradeAt: asTimestamp('2026-06-18T13:30:00Z'),
      finalSettlementRef: 'CME final settlement 2026-06-18',
      rollEffectiveAt: from,
      calendarVersion,
    },
    effectiveFrom: from,
    effectiveTo: to,
    calendarVersion,
  }
}

function decide(
  r: MutableResolution = resolution(),
  decisionId: ContractSelectionDecisionId = ID_A,
  decidedAt: Timestamp = DECIDED,
): ContractSelectionDecision {
  return materializeContractSelectionDecision({
    resolution: r as unknown as ResolvedContractResolution,
    decisionId,
    decidedAt,
  })
}

const store = (): ContractSelectionDecisionStore => createInMemoryContractSelectionDecisionStore()

/** A deliberately mutable decision — the materializer cannot produce one. */
function mutableDecision(over: Partial<Record<string, unknown>> = {}): ContractSelectionDecision {
  return {
    decisionId: ID_A,
    root: 'NQ',
    resolvedContract: { root: 'NQ', cycle: { year: 2026, quarterMonth: 6 } },
    effectiveFrom: MAR,
    effectiveTo: JUN,
    policyVersion: 'market-data-contract-lifecycle-v1.0',
    calendarVersion: 'fixture-v1',
    evidence: [],
    reasons: [{ code: 'CONTRACT_SELECTED_BY_CANONICAL_CALENDAR' }],
    decidedAt: DECIDED,
    ...over,
  } as unknown as ContractSelectionDecision
}

// ─── Recording and contextual lookup ──────────────────────────────────────────

describe('recording and lookup', () => {
  it('A. records a finite decision', async () => {
    expect(await store().record(decide())).toEqual({ outcome: 'RECORDED' })
  })

  it('B. finds at effectiveFrom (inclusive lower bound)', async () => {
    const s = store()
    await s.record(decide())
    const r = await s.find('NQ', MAR)
    expect(r.outcome).toBe('FOUND')
    if (r.outcome === 'FOUND') expect(r.decision.decisionId).toBe(ID_A)
  })

  it('C. finds immediately before effectiveTo', async () => {
    const s = store()
    await s.record(decide())
    expect((await s.find('NQ', asTimestamp('2026-06-12T17:59:59.999Z'))).outcome).toBe('FOUND')
  })

  it('D. does not find exactly at effectiveTo (half-open upper bound)', async () => {
    const s = store()
    await s.record(decide())
    expect(await s.find('NQ', JUN)).toEqual({ outcome: 'NOT_FOUND' })
  })

  it('E. does not find before effectiveFrom', async () => {
    const s = store()
    await s.record(decide())
    expect(await s.find('NQ', asTimestamp('2026-03-13T17:59:59.999Z'))).toEqual({ outcome: 'NOT_FOUND' })
  })

  it('F. does not find on a different root, even inside the interval', async () => {
    const s = store()
    await s.record(decide())
    expect(await s.find('MNQ', asTimestamp('2026-04-01T00:00:00Z'))).toEqual({ outcome: 'NOT_FOUND' })
    expect(await s.find('ES', asTimestamp('2026-04-01T00:00:00Z'))).toEqual({ outcome: 'NOT_FOUND' })
  })

  it('W. a NOT_FOUND is terminal — no fallback decision appears', async () => {
    const s = store()
    const before = await s.find('NQ', MAR)
    expect(before).toEqual({ outcome: 'NOT_FOUND' })
    // Asking again cannot conjure one: the store never resolves.
    expect(await s.find('NQ', MAR)).toEqual({ outcome: 'NOT_FOUND' })
  })
})

// ─── Interval uniqueness ──────────────────────────────────────────────────────

describe('interval uniqueness within one context', () => {
  it('G. accepts adjacent non-overlapping intervals for one root', async () => {
    const s = store()
    expect(await s.record(decide(resolution('NQ', MAR, JUN), ID_A))).toEqual({ outcome: 'RECORDED' })
    expect(await s.record(decide(resolution('NQ', JUN, SEP, 2026, 9), ID_B))).toEqual({ outcome: 'RECORDED' })
    const first = await s.find('NQ', asTimestamp('2026-04-01T00:00:00Z'))
    const second = await s.find('NQ', asTimestamp('2026-07-01T00:00:00Z'))
    expect(first.outcome === 'FOUND' && first.decision.decisionId).toBe(ID_A)
    expect(second.outcome === 'FOUND' && second.decision.decisionId).toBe(ID_B)
  })

  it('H. refuses an overlapping interval for the same root', async () => {
    const s = store()
    await s.record(decide(resolution('NQ', MAR, SEP), ID_A))
    const r = await s.record(decide(resolution('NQ', JUN, asTimestamp('2026-12-11T18:00:00Z'), 2026, 12), ID_B))
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('OVERLAPPING_SELECTION_INTERVAL')
  })

  it('I. accepts overlapping intervals on different roots', async () => {
    const s = store()
    expect(await s.record(decide(resolution('NQ', MAR, JUN), ID_A))).toEqual({ outcome: 'RECORDED' })
    expect(await s.record(decide(resolution('MNQ', MAR, JUN), ID_B))).toEqual({ outcome: 'RECORDED' })
    const nq = await s.find('NQ', asTimestamp('2026-04-01T00:00:00Z'))
    const mnq = await s.find('MNQ', asTimestamp('2026-04-01T00:00:00Z'))
    expect(nq.outcome === 'FOUND' && nq.decision.root).toBe('NQ')
    expect(mnq.outcome === 'FOUND' && mnq.decision.root).toBe('MNQ')
  })

  it('V. record order does not change the lookup result', async () => {
    const forward = store()
    await forward.record(decide(resolution('NQ', MAR, JUN), ID_A))
    await forward.record(decide(resolution('NQ', JUN, SEP, 2026, 9), ID_B))
    const reverse = store()
    await reverse.record(decide(resolution('NQ', JUN, SEP, 2026, 9), ID_B))
    await reverse.record(decide(resolution('NQ', MAR, JUN), ID_A))
    for (const at of [MAR, asTimestamp('2026-05-01T00:00:00Z'), JUN, asTimestamp('2026-08-01T00:00:00Z')]) {
      expect(await forward.find('NQ', at)).toEqual(await reverse.find('NQ', at))
    }
  })
})

// ─── Duplicate and disagreement ───────────────────────────────────────────────

describe('duplicate and disagreement', () => {
  it('J. an identical re-record is idempotent', async () => {
    const s = store()
    expect(await s.record(decide())).toEqual({ outcome: 'RECORDED' })
    expect(await s.record(decide())).toEqual({ outcome: 'RECORDED' })
    // Still exactly one record: a second copy would make the lookup ambiguous.
    expect((await s.find('NQ', MAR)).outcome).toBe('FOUND')
  })

  it('K. the same decisionId with different contents is refused', async () => {
    const s = store()
    await s.record(decide())
    const r = await s.record(decide(resolution('NQ', MAR, JUN, 2026, 6, 'other-calendar'), ID_A))
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('DECISION_ID_DISAGREEMENT')
  })

  it('K2. a refused disagreement never overwrites the stored record', async () => {
    const s = store()
    await s.record(decide())
    await s.record(decide(resolution('NQ', MAR, JUN, 2026, 6, 'other-calendar'), ID_A))
    const r = await s.find('NQ', MAR)
    expect(r.outcome === 'FOUND' && r.decision.calendarVersion).toBe('fixture-v1')
  })
})

// ─── Malformed intervals ──────────────────────────────────────────────────────

describe('malformed intervals fail closed', () => {
  it('L. a null effectiveTo is unsupported, never read as infinity', async () => {
    const r = await store().record(mutableDecision({ effectiveTo: null }))
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('OPEN_ENDED_DECISION_UNSUPPORTED')
  })

  it('L2. a null-effectiveTo decision is not stored at all', async () => {
    const s = store()
    await s.record(mutableDecision({ effectiveTo: null }))
    expect(await s.find('NQ', MAR)).toEqual({ outcome: 'NOT_FOUND' })
  })

  it('M. an empty interval is refused', async () => {
    const r = await store().record(mutableDecision({ effectiveFrom: MAR, effectiveTo: MAR }))
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('INVALID_SELECTION_INTERVAL')
  })

  it('N. a backwards interval is refused', async () => {
    const r = await store().record(mutableDecision({ effectiveFrom: JUN, effectiveTo: MAR }))
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('INVALID_SELECTION_INTERVAL')
  })

  it('M2. an equal-instant interval spelled differently is still empty', async () => {
    // '…18:00:00Z' and '…18:00:00.000Z' are one instant; text comparison would
    // wrongly accept this as a non-empty interval.
    const r = await store().record(
      mutableDecision({ effectiveFrom: asTimestamp('2026-03-13T18:00:00Z'), effectiveTo: asTimestamp('2026-03-13T18:00:00.000Z') }),
    )
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('INVALID_SELECTION_INTERVAL')
  })
})

// ─── Instant semantics, not lexical ───────────────────────────────────────────

describe('instant semantics', () => {
  it('O. ordering follows the instant, not lexical string order', async () => {
    // '.' < 'Z', so '…00:00:00.500Z' sorts BEFORE '…00:00:00Z' as text while
    // being 500 ms later as an instant.
    const s = store()
    await s.record(decide(resolution('NQ', asTimestamp('2026-03-13T18:00:00Z'), asTimestamp('2026-03-13T18:00:01Z'))))
    expect((await s.find('NQ', asTimestamp('2026-03-13T18:00:00.500Z'))).outcome).toBe('FOUND')
    expect((await s.find('NQ', asTimestamp('2026-03-13T18:00:01.000Z'))).outcome).toBe('NOT_FOUND')
  })

  it('P. stored Timestamp spelling is preserved exactly, never normalised', async () => {
    const s = store()
    const from = asTimestamp('2026-03-13T18:00:00.000Z')
    await s.record(decide(resolution('NQ', from, JUN)))
    const r = await s.find('NQ', asTimestamp('2026-04-01T00:00:00Z'))
    expect(r.outcome === 'FOUND' && r.decision.effectiveFrom).toBe('2026-03-13T18:00:00.000Z')
    expect(r.outcome === 'FOUND' && r.decision.decidedAt).toBe('2026-09-04T08:00:00.250Z')
  })

  it('P2. an identical-instant, differently-spelled record is a disagreement', async () => {
    const s = store()
    await s.record(decide(resolution('NQ', asTimestamp('2026-03-13T18:00:00Z'), JUN)))
    const r = await s.record(decide(resolution('NQ', asTimestamp('2026-03-13T18:00:00.000Z'), JUN)))
    expect(r.outcome).toBe('REFUSED')
    if (r.outcome === 'REFUSED') expect(r.refusal).toBe('DECISION_ID_DISAGREEMENT')
  })
})

// ─── Detachment and immutability ──────────────────────────────────────────────

describe('the store is detached from the caller', () => {
  it('Q. a later caller mutation cannot alter the stored decision', async () => {
    const s = store()
    const caller = mutableDecision()
    await s.record(caller)
    ;(caller as { root: MarketInstrument }).root = 'ES'
    ;(caller.resolvedContract.cycle as { year: number }).year = 2099
    ;(caller.reasons as { code: string }[])[0].code = 'TAMPERED'
    const r = await s.find('NQ', MAR)
    expect(r.outcome).toBe('FOUND')
    if (r.outcome === 'FOUND') {
      expect(r.decision.root).toBe('NQ')
      expect(r.decision.resolvedContract.cycle.year).toBe(2026)
      expect(r.decision.reasons[0].code).toBe('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')
    }
  })

  it('R. the store does not freeze the caller input as a side effect', async () => {
    const caller = mutableDecision()
    await store().record(caller)
    expect(Object.isFrozen(caller)).toBe(false)
    expect(Object.isFrozen(caller.resolvedContract)).toBe(false)
    expect(Object.isFrozen(caller.resolvedContract.cycle)).toBe(false)
    expect(Object.isFrozen(caller.reasons)).toBe(false)
  })

  it('S. a FOUND decision is frozen at every level', async () => {
    const s = store()
    await s.record(decide())
    const r = await s.find('NQ', MAR)
    expect(r.outcome).toBe('FOUND')
    if (r.outcome === 'FOUND') {
      const d = r.decision
      expect(Object.isFrozen(d)).toBe(true)
      expect(Object.isFrozen(d.resolvedContract)).toBe(true)
      expect(Object.isFrozen(d.resolvedContract.cycle)).toBe(true)
      expect(Object.isFrozen(d.evidence)).toBe(true)
      expect(Object.isFrozen(d.reasons)).toBe(true)
      for (const reason of d.reasons) expect(Object.isFrozen(reason)).toBe(true)
    }
  })

  it('S2. the stored record keeps exactly the ten canonical fields', async () => {
    const s = store()
    await s.record(decide())
    const r = await s.find('NQ', MAR)
    expect(r.outcome).toBe('FOUND')
    if (r.outcome === 'FOUND') {
      expect(Object.keys(r.decision).sort()).toEqual(
        ['calendarVersion', 'decidedAt', 'decisionId', 'effectiveFrom', 'effectiveTo',
         'evidence', 'policyVersion', 'reasons', 'resolvedContract', 'root'].sort(),
      )
      expect(r.decision.evidence).toEqual([])
      expect(r.decision.reasons).toHaveLength(1)
    }
  })
})

// ─── Context isolation ────────────────────────────────────────────────────────

describe('recording contexts are independent', () => {
  it('T. two stores do not share records', async () => {
    const a = store()
    const b = store()
    await a.record(decide())
    expect((await a.find('NQ', MAR)).outcome).toBe('FOUND')
    expect(await b.find('NQ', MAR)).toEqual({ outcome: 'NOT_FOUND' })
  })

  it('U. two contexts may hold different decisions for the same root and instant', async () => {
    const runOne = store()
    const runTwo = store()
    await runOne.record(decide(resolution('NQ', MAR, JUN, 2026, 6, 'calendar-2026a'), ID_A))
    await runTwo.record(decide(resolution('NQ', MAR, JUN, 2026, 9, 'calendar-2026b'), ID_B))
    const one = await runOne.find('NQ', asTimestamp('2026-04-01T00:00:00Z'))
    const two = await runTwo.find('NQ', asTimestamp('2026-04-01T00:00:00Z'))
    expect(one.outcome === 'FOUND' && one.decision.calendarVersion).toBe('calendar-2026a')
    expect(two.outcome === 'FOUND' && two.decision.calendarVersion).toBe('calendar-2026b')
    expect(one.outcome === 'FOUND' && one.decision.resolvedContract.cycle.quarterMonth).toBe(6)
    expect(two.outcome === 'FOUND' && two.decision.resolvedContract.cycle.quarterMonth).toBe(9)
  })

  it('X. no module-global state leaks between freshly created stores', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await store().find('NQ', MAR)).toEqual({ outcome: 'NOT_FOUND' })
    }
  })
})

// ─── Field-by-field disagreement coverage ─────────────────────────────────────

describe('the disagreement check observes every canonical field', () => {
  const CASES: readonly (readonly [string, Record<string, unknown>])[] = [
    ['root', { root: 'MNQ', resolvedContract: { root: 'MNQ', cycle: { year: 2026, quarterMonth: 6 } } }],
    ['cycle.year', { resolvedContract: { root: 'NQ', cycle: { year: 2027, quarterMonth: 6 } } }],
    ['cycle.quarterMonth', { resolvedContract: { root: 'NQ', cycle: { year: 2026, quarterMonth: 9 } } }],
    ['effectiveFrom', { effectiveFrom: asTimestamp('2026-03-14T18:00:00Z') }],
    ['effectiveTo', { effectiveTo: asTimestamp('2026-06-13T18:00:00Z') }],
    ['policyVersion', { policyVersion: 'market-data-contract-lifecycle-v9.9' }],
    ['calendarVersion', { calendarVersion: 'other-calendar' }],
    ['decidedAt', { decidedAt: asTimestamp('2026-09-04T09:00:00.250Z') }],
    ['reasons[0].detail', { reasons: [{ code: 'CONTRACT_SELECTED_BY_CANONICAL_CALENDAR', detail: 'added' }] }],
    ['reasons length', { reasons: [] }],
  ]

  for (const [field, over] of CASES) {
    it(`refuses a differing ${field} under the same decisionId`, async () => {
      const s = store()
      await s.record(mutableDecision())
      const r = await s.record(mutableDecision(over))
      expect(r.outcome, `${field} was not detected`).toBe('REFUSED')
      if (r.outcome === 'REFUSED') expect(r.refusal).toBe('DECISION_ID_DISAGREEMENT')
    })
  }

  it('POSITIVE CONTROL: an unchanged decision is still idempotent', async () => {
    const s = store()
    await s.record(mutableDecision())
    expect(await s.record(mutableDecision())).toEqual({ outcome: 'RECORDED' })
  })
})

// ─── Refusal vocabulary ───────────────────────────────────────────────────────

describe('the refusal vocabulary is exactly four local codes', () => {
  it('carries no fifth code', () => {
    expect([...CONTRACT_SELECTION_STORE_REFUSALS]).toEqual([
      'DECISION_ID_DISAGREEMENT',
      'OVERLAPPING_SELECTION_INTERVAL',
      'OPEN_ENDED_DECISION_UNSUPPORTED',
      'INVALID_SELECTION_INTERVAL',
    ])
    expect(new Set(CONTRACT_SELECTION_STORE_REFUSALS).size).toBe(4)
  })
})

// ─── Type-level guarantees ────────────────────────────────────────────────────

/*
 * Enforced by `tsc --noEmit`. tsconfig includes every .ts file, this one among
 * them, so a wrong type here fails the typecheck — NOT vitest. `expectTypeOf`
 * is deliberately not used: this project has no `typecheck` block in
 * vitest.config.ts, so its assertions would be erased at runtime.
 */
type Expect<T extends true> = T
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

type RecordTakesADecision = Expect<
  Equals<Parameters<ContractSelectionDecisionStore['record']>, [ContractSelectionDecision]>
>
type FindTakesRootAndInstantOnly = Expect<
  Equals<Parameters<ContractSelectionDecisionStore['find']>, [MarketInstrument, Timestamp]>
>
type PortHasExactlyTwoOperations = Expect<Equals<keyof ContractSelectionDecisionStore, 'record' | 'find'>>
type RefusalIsTheFourCodes = Expect<
  Equals<
    ContractSelectionStoreRefusal,
    'DECISION_ID_DISAGREEMENT' | 'OVERLAPPING_SELECTION_INTERVAL' | 'OPEN_ENDED_DECISION_UNSUPPORTED' | 'INVALID_SELECTION_INTERVAL'
  >
>
type RecordOutcomes = Expect<Equals<RecordContractSelectionDecisionResult['outcome'], 'RECORDED' | 'REFUSED'>>
type FindOutcomes = Expect<
  Equals<FindContractSelectionDecisionResult['outcome'], 'FOUND' | 'NOT_FOUND' | 'INVARIANT_VIOLATION'>
>

describe('type-level guarantees (enforced by tsc --noEmit)', () => {
  it('the port is record + find only, with a root/instant lookup', () => {
    const proof: [
      RecordTakesADecision,
      FindTakesRootAndInstantOnly,
      PortHasExactlyTwoOperations,
      RefusalIsTheFourCodes,
      RecordOutcomes,
      FindOutcomes,
    ] = [true, true, true, true, true, true]
    expect(proof).toHaveLength(6)
  })

  it('the v1 port exposes no getByDecisionId', () => {
    const s = store()
    // @ts-expect-error — getByDecisionId is not part of the v1 port
    expect(s.getByDecisionId).toBeUndefined()
  })

  it('find rejects a calendarVersion argument', async () => {
    const s = store()
    // @ts-expect-error — find takes exactly (root, at)
    await s.find('NQ', MAR, 'fixture-v1')
    expect(true).toBe(true)
  })

  it('find rejects a decisionId as the discovery key', async () => {
    const s = store()
    // @ts-expect-error — a ContractSelectionDecisionId is not a MarketInstrument
    await s.find(ID_A, MAR)
    expect(true).toBe(true)
  })
})
