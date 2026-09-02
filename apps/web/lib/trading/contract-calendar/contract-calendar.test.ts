/**
 * Omnira Trading — contract identity, calendar validity and resolution.
 *
 * Every calendar fact below is SYNTHETIC and invented for this test. None of it
 * is a real CME roll date, and nothing here may be read as operational calendar
 * data — populating the real calendar is a separate, later task.
 */

import { describe, expect, it } from 'vitest'
import { asTimestamp, type Timestamp } from '../time'
import { MARKET_INSTRUMENTS, isMarketInstrument, parseMarketInstrument } from '../market-instrument'
import {
  QUARTER_MONTHS,
  compareContractCycle,
  contractCycle,
  contractKey,
  isQuarterMonth,
  parseContractCycle,
  parseResolvedContract,
  resolvedContract,
  sameContract,
} from '../contract-identity'
import {
  CALENDAR_PROBLEMS,
  CONTRACT_REFUSALS,
  buildContractCalendar,
  resolveContractAt,
  type CalendarProblemCode,
  type ContractCalendar,
  type ContractCalendarEntry,
  type ContractCalendarInput,
} from './index'

const T = (iso: string): Timestamp => asTimestamp(iso)

/** A synthetic entry. The instants are invented, not exchange facts. */
function entry(
  root: 'NQ' | 'MNQ' | 'ES',
  year: number,
  quarterMonth: 3 | 6 | 9 | 12,
  rollEffectiveAt: string,
  lastTradeAt: string,
): ContractCalendarEntry {
  return {
    contract: resolvedContract(root, contractCycle(year, quarterMonth)),
    rollEffectiveAt: T(rollEffectiveAt),
    lastTradeAt: T(lastTradeAt),
    finalSettlementRef: 'fixture/settlement-reference',
    exchange: 'FIXTURE-VENUE',
    sourceRef: 'fixture/authored-for-tests',
  }
}

/**
 * Two NQ contracts and one coverage window.
 *
 * H rolls in at 2026-01-05, M rolls in at 2026-04-06, and authority runs from
 * 2026-01-05 to 2026-07-01. Round instants, chosen so a boundary test reads
 * clearly rather than to imitate any real schedule.
 */
function baseInput(): ContractCalendarInput {
  return {
    calendarVersion: 'fixture-v1',
    entries: [
      entry('NQ', 2026, 3, '2026-01-05T23:00:00Z', '2026-03-20T13:30:00Z'),
      entry('NQ', 2026, 6, '2026-04-06T22:00:00Z', '2026-06-18T13:30:00Z'),
    ],
    coverage: [{ root: 'NQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-07-01T00:00:00Z') }],
  }
}

function built(input: ContractCalendarInput = baseInput()): ContractCalendar {
  const outcome = buildContractCalendar(input)
  if (!outcome.ok) throw new Error(`fixture calendar refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.calendar
}

function problemsOf(input: ContractCalendarInput): readonly CalendarProblemCode[] {
  const outcome = buildContractCalendar(input)
  return outcome.ok ? [] : outcome.problems.map((p) => p.code)
}

// ─── A. B. C. Root vocabulary ─────────────────────────────────────────────────

describe('the root vocabulary is exactly one vocabulary', () => {
  it('A. is exactly NQ, MNQ, ES', () => {
    expect(MARKET_INSTRUMENTS).toEqual(['NQ', 'MNQ', 'ES'])
    expect(isMarketInstrument('NQ')).toBe(true)
    expect(isMarketInstrument('nq')).toBe(false)
    expect(parseMarketInstrument('ES')).toBe('ES')
    expect(parseMarketInstrument('CL')).toBeNull()
    expect(parseMarketInstrument(7)).toBeNull()
  })

  it('B. Market View still exports the same root API, from the same names', async () => {
    const view = await import('../market-view')
    const domain = await import('../market-instrument')

    expect(view.MARKET_INSTRUMENTS).toEqual(['NQ', 'MNQ', 'ES'])
    expect(view.isMarketInstrument('MNQ')).toBe(true)
    expect(view.parseMarketInstrument('MNQ')).toBe('MNQ')

    // Re-exported, not restated: the very same objects and functions.
    expect(view.MARKET_INSTRUMENTS).toBe(domain.MARKET_INSTRUMENTS)
    expect(view.isMarketInstrument).toBe(domain.isMarketInstrument)
    expect(view.parseMarketInstrument).toBe(domain.parseMarketInstrument)

    // Presentation data stays in the presentation package.
    expect(view.INSTRUMENT_LABELS.NQ).toBe('E-mini Nasdaq-100')
  })

  it('C. the public barrel serves the identical vocabulary too', async () => {
    const barrel = await import('../index')
    const domain = await import('../market-instrument')
    expect(barrel.MARKET_INSTRUMENTS).toBe(domain.MARKET_INSTRUMENTS)
    expect(barrel.isMarketInstrument).toBe(domain.isMarketInstrument)
  })
})

// ─── D. E. ContractCycle ──────────────────────────────────────────────────────

describe('a contract cycle is one of four quarter months', () => {
  it('D. accepts 3, 6, 9 and 12', () => {
    expect(QUARTER_MONTHS).toEqual([3, 6, 9, 12])
    for (const month of QUARTER_MONTHS) {
      expect(isQuarterMonth(month)).toBe(true)
      expect(contractCycle(2026, month)).toEqual({ year: 2026, quarterMonth: month })
    }
  })

  it('E. rejects every other month, and a non-integer year', () => {
    for (const bad of [1, 2, 4, 5, 7, 8, 10, 11, 0, 13, '3', null]) {
      expect(isQuarterMonth(bad), String(bad)).toBe(false)
      expect(parseContractCycle({ year: 2026, quarterMonth: bad })).toBeNull()
    }
    expect(parseContractCycle({ year: 2026.5, quarterMonth: 3 })).toBeNull()
    expect(parseContractCycle({ year: Number.NaN, quarterMonth: 3 })).toBeNull()
    expect(parseContractCycle(null)).toBeNull()
    expect(() => contractCycle(2026, 5 as unknown as 3)).toThrow()
  })

  it('orders chronologically, and accepts any integer year without a business bound', () => {
    expect(compareContractCycle(contractCycle(2026, 3), contractCycle(2026, 6))).toBeLessThan(0)
    expect(compareContractCycle(contractCycle(2027, 3), contractCycle(2026, 12))).toBeGreaterThan(0)
    // No `year >= 2020` rule exists in canon, so none exists here.
    expect(parseContractCycle({ year: 1998, quarterMonth: 9 })).not.toBeNull()
    expect(parseContractCycle({ year: 2199, quarterMonth: 9 })).not.toBeNull()
  })
})

// ─── F. G. H. Identity ────────────────────────────────────────────────────────

describe('contract identity is structural on root and cycle', () => {
  const nqH = resolvedContract('NQ', contractCycle(2026, 3))

  it('F. two independently built values are the same contract', () => {
    const again = resolvedContract('NQ', contractCycle(2026, 3))
    expect(nqH).not.toBe(again)          // different objects
    expect(sameContract(nqH, again)).toBe(true)
    expect(contractKey(nqH)).toBe(contractKey(again))
  })

  it('G. different roots with the same cycle are NOT the same contract', () => {
    const mnqH = resolvedContract('MNQ', contractCycle(2026, 3))
    expect(sameContract(nqH, mnqH)).toBe(false)
    // NQ and MNQ share a roll boundary; they are still distinct products.
    expect(nqH.cycle).toEqual(mnqH.cycle)
  })

  it('H. the same root with a different cycle is NOT the same contract', () => {
    expect(sameContract(nqH, resolvedContract('NQ', contractCycle(2026, 6)))).toBe(false)
    expect(sameContract(nqH, resolvedContract('NQ', contractCycle(2027, 3)))).toBe(false)
  })

  it('carries no lifecycle field, and refuses an unsupported root', () => {
    expect(Object.keys(nqH).sort()).toEqual(['cycle', 'root'])
    for (const forbidden of ['exchange', 'expiration', 'lastTradeAt', 'rollEffectiveAt', 'calendarVersion']) {
      expect(nqH).not.toHaveProperty(forbidden)
    }
    expect(() => resolvedContract('CL' as unknown as 'NQ', contractCycle(2026, 3))).toThrow()
    expect(parseResolvedContract({ root: 'CL', cycle: { year: 2026, quarterMonth: 3 } })).toBeNull()
  })
})

// ─── I. J. K. Calendar validity ───────────────────────────────────────────────

describe('an invalid calendar refuses to exist', () => {
  it('I. rejects an entry missing any required fact', () => {
    for (const field of ['finalSettlementRef', 'exchange', 'sourceRef'] as const) {
      const input = baseInput()
      const broken = { ...input.entries[0], [field]: '   ' }
      expect(problemsOf({ ...input, entries: [broken, input.entries[1]] }))
        .toContain('MISSING_FIELD')
    }
    const badTime = { ...baseInput().entries[0], lastTradeAt: 'not-a-timestamp' as Timestamp }
    expect(problemsOf({ ...baseInput(), entries: [badTime] })).toContain('INVALID_TIMESTAMP')

    const badCycle = {
      ...baseInput().entries[0],
      contract: { root: 'NQ' as const, cycle: { year: 2026, quarterMonth: 5 as unknown as 3 } },
    }
    expect(problemsOf({ ...baseInput(), entries: [badCycle] })).toContain('INVALID_CYCLE')

    expect(problemsOf({ ...baseInput(), calendarVersion: '  ' })).toContain('EMPTY_CALENDAR_VERSION')
  })

  it('I2. reports every problem at once, not just the first', () => {
    const codes = problemsOf({
      calendarVersion: '',
      entries: [{ ...baseInput().entries[0], exchange: '', sourceRef: '' }],
      coverage: [],
    })
    expect(codes).toContain('EMPTY_CALENDAR_VERSION')
    expect(codes.filter((c) => c === 'MISSING_FIELD')).toHaveLength(2)
  })

  it('J. rejects a duplicate contract and a conflicting roll boundary', () => {
    const input = baseInput()
    expect(problemsOf({ ...input, entries: [input.entries[0], input.entries[0]] }))
      .toContain('DUPLICATE_CONTRACT')

    // Two DIFFERENT NQ contracts claiming the same roll instant: ambiguous.
    const clash = entry('NQ', 2026, 9, '2026-01-05T23:00:00Z', '2026-09-18T13:30:00Z')
    expect(problemsOf({ ...input, entries: [input.entries[0], clash] }))
      .toContain('CONFLICTING_ROLL_BOUNDARY')
  })

  it('K. rejects malformed, overlapping and unsupported coverage', () => {
    const input = baseInput()
    expect(problemsOf({
      ...input,
      coverage: [{ root: 'NQ', from: T('2026-05-01T00:00:00Z'), to: T('2026-05-01T00:00:00Z') }],
    })).toContain('MALFORMED_COVERAGE')

    expect(problemsOf({
      ...input,
      coverage: [
        { root: 'NQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-07-01T00:00:00Z') },
        { root: 'NQ', from: T('2026-06-01T00:00:00Z'), to: T('2026-08-01T00:00:00Z') },
      ],
    })).toContain('OVERLAPPING_COVERAGE')

    // Authority claimed from before any entry could answer for it.
    expect(problemsOf({
      ...input,
      coverage: [{ root: 'NQ', from: T('2025-01-01T00:00:00Z'), to: T('2026-07-01T00:00:00Z') }],
    })).toContain('COVERAGE_UNSUPPORTED')

    // Coverage for a root with no entries at all.
    expect(problemsOf({ ...input, coverage: [...input.coverage,
      { root: 'ES' as const, from: T('2026-01-01T00:00:00Z'), to: T('2026-02-01T00:00:00Z') }],
    })).toContain('COVERAGE_UNSUPPORTED')
  })

  it('the problem vocabulary stays exactly these ten', () => {
    expect([...CALENDAR_PROBLEMS]).toEqual([
      'EMPTY_CALENDAR_VERSION', 'UNSUPPORTED_ROOT', 'INVALID_CYCLE', 'MISSING_FIELD',
      'INVALID_TIMESTAMP', 'DUPLICATE_CONTRACT', 'CONFLICTING_ROLL_BOUNDARY',
      'MALFORMED_COVERAGE', 'OVERLAPPING_COVERAGE', 'COVERAGE_UNSUPPORTED',
    ])
  })
})

// ─── L. M. N. O. P. Q. Resolution ─────────────────────────────────────────────

describe('the resolver answers only inside authoritative coverage', () => {
  const calendar = built()

  it('L. refuses before coverage begins', () => {
    const out = resolveContractAt(calendar, 'NQ', T('2026-01-05T22:59:59Z'))
    expect(out.outcome).toBe('REFUSED')
    if (out.outcome === 'REFUSED') expect(out.refusal).toBe('NO_AUTHORITATIVE_COVERAGE')
  })

  it('M. refuses at and after the exclusive coverage end', () => {
    expect(resolveContractAt(calendar, 'NQ', T('2026-07-01T00:00:00Z')).outcome).toBe('REFUSED')
    expect(resolveContractAt(calendar, 'NQ', T('2030-01-01T00:00:00Z')).outcome).toBe('REFUSED')
    // The last entry does NOT quietly extend forever.
  })

  it('N. selects the OLD contract one millisecond before the roll instant', () => {
    const out = resolveContractAt(calendar, 'NQ', T('2026-04-06T21:59:59.999Z'))
    expect(out.outcome).toBe('RESOLVED')
    if (out.outcome !== 'RESOLVED') return
    expect(out.contract.cycle.quarterMonth).toBe(3)
    expect(out.effectiveFrom).toBe('2026-01-05T23:00:00Z')
    expect(out.effectiveTo).toBe('2026-04-06T22:00:00Z')
  })

  it('O. selects the NEW contract exactly AT the roll instant', () => {
    const out = resolveContractAt(calendar, 'NQ', T('2026-04-06T22:00:00Z'))
    expect(out.outcome).toBe('RESOLVED')
    if (out.outcome !== 'RESOLVED') return
    expect(out.contract.cycle.quarterMonth).toBe(6)
    expect(out.effectiveFrom).toBe('2026-04-06T22:00:00Z')
    // Clamped to the coverage end, because no later roll is authored.
    expect(out.effectiveTo).toBe('2026-07-01T00:00:00Z')
  })

  it('carries the lifecycle facts and the calendar version', () => {
    const out = resolveContractAt(calendar, 'NQ', T('2026-02-01T00:00:00Z'))
    expect(out.outcome).toBe('RESOLVED')
    if (out.outcome !== 'RESOLVED') return
    expect(out.lifecycle.lastTradeAt).toBe('2026-03-20T13:30:00Z')
    expect(out.lifecycle.rollEffectiveAt).toBe('2026-01-05T23:00:00Z')
    expect(out.lifecycle.finalSettlementRef).toBe('fixture/settlement-reference')
    expect(out.lifecycle.calendarVersion).toBe('fixture-v1')
    expect(out.calendarVersion).toBe('fixture-v1')
    expect(sameContract(out.lifecycle.contract, out.contract)).toBe(true)
  })

  it('P. invents no contract the calendar does not contain', () => {
    /*
     * A calendar whose coverage stops before a later cycle would begin. A
     * front-month rule, a quarterly formula or a "nearest entry" fallback would
     * all answer here. The resolver declines instead.
     */
    const narrow = built({
      ...baseInput(),
      coverage: [{ root: 'NQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-02-01T00:00:00Z') }],
    })
    expect(resolveContractAt(narrow, 'NQ', T('2026-05-01T00:00:00Z')).outcome).toBe('REFUSED')

    // And inside coverage it never returns a cycle that was never authored.
    const authored = new Set(narrow.entries.map((e) => contractKey(e.contract)))
    const inside = resolveContractAt(narrow, 'NQ', T('2026-01-20T00:00:00Z'))
    if (inside.outcome === 'RESOLVED') {
      expect(authored.has(contractKey(inside.contract))).toBe(true)
    }
  })

  it('Q. refuses a root with no coverage, even when another root has it', () => {
    for (const root of ['MNQ', 'ES'] as const) {
      const out = resolveContractAt(calendar, root, T('2026-02-01T00:00:00Z'))
      expect(out.outcome, root).toBe('REFUSED')
    }
    expect(resolveContractAt(calendar, 'NQ', T('2026-02-01T00:00:00Z')).outcome).toBe('RESOLVED')
  })

  it('resolves each root independently when each has its own coverage', () => {
    const multi = built({
      calendarVersion: 'fixture-multi',
      entries: [
        entry('NQ', 2026, 3, '2026-01-05T23:00:00Z', '2026-03-20T13:30:00Z'),
        entry('MNQ', 2026, 3, '2026-01-05T23:00:00Z', '2026-03-20T13:30:00Z'),
        entry('ES', 2026, 6, '2026-01-05T23:00:00Z', '2026-06-18T13:30:00Z'),
      ],
      coverage: [
        { root: 'NQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-04-01T00:00:00Z') },
        { root: 'MNQ', from: T('2026-01-05T23:00:00Z'), to: T('2026-04-01T00:00:00Z') },
        { root: 'ES', from: T('2026-01-05T23:00:00Z'), to: T('2026-04-01T00:00:00Z') },
      ],
    })
    const at = T('2026-02-01T00:00:00Z')
    const nq = resolveContractAt(multi, 'NQ', at)
    const mnq = resolveContractAt(multi, 'MNQ', at)
    const es = resolveContractAt(multi, 'ES', at)
    if (nq.outcome !== 'RESOLVED' || mnq.outcome !== 'RESOLVED' || es.outcome !== 'RESOLVED') {
      throw new Error('expected all three to resolve')
    }
    // NQ and MNQ share the cycle here; they remain different contracts.
    expect(nq.contract.cycle).toEqual(mnq.contract.cycle)
    expect(sameContract(nq.contract, mnq.contract)).toBe(false)
    expect(sameContract(nq.contract, es.contract)).toBe(false)
  })

  it('the refusal vocabulary stays a single member', () => {
    expect([...CONTRACT_REFUSALS]).toEqual(['NO_AUTHORITATIVE_COVERAGE'])
  })

  it('orders instants by epoch, not by text', () => {
    /*
     * `Timestamp` allows an optional millisecond field, so '…00:00:00Z' and
     * '…00:00:00.500Z' compare WRONG as strings — '.' sorts before 'Z'. A text
     * comparison would place the later instant first and select the wrong side
     * of a roll.
     */
    const c = built({
      ...baseInput(),
      entries: [
        entry('NQ', 2026, 3, '2026-01-05T23:00:00Z', '2026-03-20T13:30:00Z'),
        entry('NQ', 2026, 6, '2026-01-05T23:00:00.500Z', '2026-06-18T13:30:00Z'),
      ],
    })
    const out = resolveContractAt(c, 'NQ', T('2026-02-01T00:00:00Z'))
    expect(out.outcome).toBe('RESOLVED')
    // The .500 entry is LATER, so it is the selected one.
    if (out.outcome === 'RESOLVED') expect(out.contract.cycle.quarterMonth).toBe(6)
  })
})

// ─── R. S. T. Determinism and immutability ────────────────────────────────────

describe('resolution is pure, and its inputs cannot be changed', () => {
  it('R. repeating a resolution gives a value-identical answer', () => {
    const at = T('2026-02-14T12:00:00Z')
    const first = resolveContractAt(built(), 'NQ', at)
    const second = resolveContractAt(built(), 'NQ', at)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toEqual(second)

    // And building the same input twice produces the same calendar.
    expect(JSON.stringify(built())).toBe(JSON.stringify(built()))
  })

  it('S. neither the calendar nor a result can be mutated through the public API', () => {
    const calendar = built()
    expect(Object.isFrozen(calendar)).toBe(true)
    expect(Object.isFrozen(calendar.entries)).toBe(true)
    expect(Object.isFrozen(calendar.entries[0])).toBe(true)
    expect(Object.isFrozen(calendar.coverage[0])).toBe(true)

    expect(() => {
      (calendar as { calendarVersion: string }).calendarVersion = 'tampered'
    }).toThrow()

    const out = resolveContractAt(calendar, 'NQ', T('2026-02-01T00:00:00Z'))
    expect(Object.isFrozen(out)).toBe(true)
    if (out.outcome === 'RESOLVED') expect(Object.isFrozen(out.lifecycle)).toBe(true)
  })

  it('S2. building does not mutate the caller-s input arrays', () => {
    const input = baseInput()
    const before = JSON.stringify(input)
    buildContractCalendar(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('T. the answer does not depend on when it is asked', () => {
    /*
     * A weak-but-real check that no wall clock leaks in: two resolutions
     * separated by real elapsed time must agree. The structural proof that no
     * clock is even referenced lives in the import-discipline suite.
     */
    const calendar = built()
    const at = T('2026-02-01T00:00:00Z')
    const first = resolveContractAt(calendar, 'NQ', at)
    const start = performance.now()
    while (performance.now() - start < 5) { /* burn a few real milliseconds */ }
    expect(resolveContractAt(calendar, 'NQ', at)).toEqual(first)
  })
})
