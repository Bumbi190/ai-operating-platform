/**
 * The acceptance invariants, tested on their own.
 *
 * The suite is only as good as these predicates, and a predicate asserted only
 * through a passing end-to-end run is a predicate nobody has actually checked.
 * Each one is exercised here against the values where a wrong implementation
 * would differ from a right one.
 */

import { describe, expect, it } from 'vitest'
import { asDecimal } from '../decimal'
import { CAPABILITY_STATES, failure, ok, present, unavailable, unknown } from '../provider'
import type { PositionSnapshot, Result } from '../provider'
import { isInertRecord } from './contract'
import {
  CAPABILITY_OBLIGATIONS,
  exactReading,
  failureCarriesStructuredReason,
  isHonestFailure,
  isKnownFlat,
  meetsSafetyCriticalRequirement,
  obligationFor,
  refusedUnknownReference,
  resolutionWasExplicit,
} from './checks'

const EMPTY_OK: Result<readonly PositionSnapshot[]> = ok([])
const FAILED: Result<readonly PositionSnapshot[]> = failure('PROVIDER_DISCONNECTED', 'nej')

// ─── Capability semantics ─────────────────────────────────────────────────────

describe('capability semantics', () => {
  it('lets only SUPPORTED discharge a safety-critical requirement', () => {
    expect(meetsSafetyCriticalRequirement('SUPPORTED')).toBe(true)
    for (const weaker of ['UNSUPPORTED', 'CONDITIONAL', 'UNKNOWN'] as const) {
      expect(meetsSafetyCriticalRequirement(weaker), weaker).toBe(false)
    }
  })

  it('is total over the four states and never collapses them to a boolean', () => {
    expect(CAPABILITY_STATES).toHaveLength(4)
    const obligations = CAPABILITY_STATES.map(obligationFor)
    expect(obligations).toHaveLength(4)
    for (const obligation of obligations) {
      expect(CAPABILITY_OBLIGATIONS as readonly string[]).toContain(obligation)
    }
    // Three of the four states carry the weaker obligation — the states remain
    // four even though the obligation is binary.
    expect(obligations.filter((o) => o === 'MUST_PROVIDE_DATA')).toHaveLength(1)
    expect(obligations.filter((o) => o === 'MUST_REPORT_HONESTLY')).toHaveLength(3)
  })

  it('distinguishes UNSUPPORTED from UNKNOWN as different facts', () => {
    // Both fail closed, but they are not interchangeable: only one is worth
    // retrying, and the contract keeps them apart for that reason.
    expect(obligationFor('UNSUPPORTED')).toBe(obligationFor('UNKNOWN'))
    expect(CAPABILITY_STATES.indexOf('UNSUPPORTED'))
      .not.toBe(CAPABILITY_STATES.indexOf('UNKNOWN'))
  })
})

// ─── Available semantics ──────────────────────────────────────────────────────

describe('exact readings', () => {
  it('reads a PRESENT decimal as exact text', () => {
    expect(exactReading(present(asDecimal('1.50')))).toEqual({ state: 'PRESENT', text: '1.50' })
  })

  it('keeps the two absences apart and carries no value for either', () => {
    expect(exactReading(unavailable())).toEqual({ state: 'UNAVAILABLE' })
    expect(exactReading(unknown())).toEqual({ state: 'UNKNOWN' })
    expect(exactReading(unavailable())).not.toEqual(exactReading(unknown()))
    for (const absent of [exactReading(unavailable()), exactReading(unknown())]) {
      expect(absent).not.toHaveProperty('text')
    }
  })

  it('never substitutes zero, null or empty for an absent reading', () => {
    for (const absent of [exactReading(unavailable()), exactReading(unknown())]) {
      expect(absent).not.toEqual({ state: 'PRESENT', text: '0' })
      expect(absent).not.toBeNull()
      expect(Array.isArray(absent)).toBe(false)
    }
  })

  it('preserves the values a JS number would corrupt', () => {
    for (const [text, corrupted] of [
      ['99999999999999999', '100000000000000000'],
      ['0.000000000001', '1e-12'],
      ['1.50', '1.5'],
    ] as const) {
      const read = exactReading(present(asDecimal(text)))
      expect(read).toEqual({ state: 'PRESENT', text })
      expect(String(Number(text))).toBe(corrupted)
      expect(read).not.toEqual({ state: 'PRESENT', text: corrupted })
    }
  })

  it('preserves a negative value and an authored scale', () => {
    expect(exactReading(present(asDecimal('-3.75')))).toEqual({ state: 'PRESENT', text: '-3.75' })
    expect(exactReading(present(asDecimal('1')))).toEqual({ state: 'PRESENT', text: '1' })
  })
})

// ─── Known flat ───────────────────────────────────────────────────────────────

describe('known flat', () => {
  it('is a successful empty result, and only that', () => {
    expect(isKnownFlat(EMPTY_OK)).toBe(true)
  })

  it('is never reachable from a failure, whatever the reason code', () => {
    for (const code of ['PROVIDER_DISCONNECTED', 'REFERENCE_MISMATCH', 'VERDICT_UNKNOWN'] as const) {
      expect(isKnownFlat(failure(code, 'nej')), code).toBe(false)
    }
  })

  it('is false for a successful result that carries positions', () => {
    const withPosition = ok([{ positionId: 'p1' } as unknown as PositionSnapshot])
    expect(isKnownFlat(withPosition)).toBe(false)
  })

  it('separates "could not find out" from "nothing is there"', () => {
    expect(isHonestFailure(FAILED)).toBe(true)
    expect(isHonestFailure(EMPTY_OK)).toBe(false)
    expect(isKnownFlat(FAILED)).toBe(false)
    expect(isKnownFlat(EMPTY_OK)).toBe(true)
  })
})

// ─── Fail-closed references ───────────────────────────────────────────────────

describe('unknown references fail closed', () => {
  it('accepts a structured refusal', () => {
    expect(refusedUnknownReference(FAILED)).toBe(true)
  })

  it('rejects an empty success as a refusal', () => {
    // The whole point: `ok([])` is a positive claim and must never count as a
    // refusal of an unknown reference.
    expect(refusedUnknownReference(EMPTY_OK)).toBe(false)
  })

  it('requires a structured reason rather than prose alone', () => {
    expect(failureCarriesStructuredReason(FAILED)).toBe(true)
    expect(failureCarriesStructuredReason(EMPTY_OK)).toBe(false)
  })
})

// ─── Contract resolution ──────────────────────────────────────────────────────

describe('explicit contract resolution', () => {
  it('requires the resolvable to resolve and the unresolvable to fail', () => {
    expect(resolutionWasExplicit(ok('ref'), failure('REFERENCE_MISMATCH', 'nej'))).toBe(true)
  })

  it('rejects a provider that resolves both — that is inference', () => {
    expect(resolutionWasExplicit(ok('ref'), ok('guessed'))).toBe(false)
  })

  it('rejects a provider that resolves neither — that is not explicit either', () => {
    expect(resolutionWasExplicit(
      failure('REFERENCE_MISMATCH', 'nej'),
      failure('REFERENCE_MISMATCH', 'nej'),
    )).toBe(false)
  })
})

// ─── Inert records ────────────────────────────────────────────────────────────

describe('observations are inert records', () => {
  it('accepts a plain nested record', () => {
    expect(isInertRecord({ a: 1, b: { c: 'x', d: [1, 2] } })).toBe(true)
  })

  it('rejects a value carrying a method at any depth', () => {
    expect(isInertRecord({ act: () => undefined })).toBe(false)
    expect(isInertRecord({ nested: { act: () => undefined } })).toBe(false)
  })

  it('rejects a bare function', () => {
    expect(isInertRecord(() => undefined)).toBe(false)
  })

  it('accepts primitives and null', () => {
    for (const value of [1, 'x', true, null, undefined]) {
      expect(isInertRecord(value), String(value)).toBe(true)
    }
  })
})
