/**
 * Omnira Trading — the versioned contract calendar.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §7 (ContractCalendar)
 *
 * CONCRETE STORED ENTRIES, NOT A FORMULA
 * ──────────────────────────────────────
 * The calendar holds authored facts. It evaluates no rule at runtime. Canonical
 * v1.0 §7.2 is explicit that the Monday-before-third-Friday convention is a
 * VALIDATION rule used when entries are authored and reviewed — "aldrig som
 * fallback vid körning" — so no such arithmetic appears anywhere in this file.
 *
 * AN INCOMPLETE ENTRY IS NOT A WEAK ENTRY, IT IS NO ENTRY
 * ──────────────────────────────────────────────────────
 * §7 requires every entry to carry contract, roll instant, last trade instant,
 * final-settlement reference, exchange and source reference before it is valid.
 * A half-authored entry is refused at construction and never reaches the
 * resolver, so the resolver has exactly one fail-closed path instead of two.
 *
 * `Available<T>` is deliberately NOT used for this. That vocabulary belongs to
 * provider OBSERVATION (`provider/primitives.ts`), and Omnira-authored calendar
 * data borrowing it would import provider semantics into canonical data.
 *
 * COVERAGE IS EXPLICIT, AND THAT IS THE POINT
 * ───────────────────────────────────────────
 * The last entry does NOT quietly extend to infinity. §7.2 requires a refusal
 * where there is no authoritative coverage, and an unbounded final entry would
 * silently answer for every future instant using the newest fact anyone
 * happened to author. Coverage is therefore stated as explicit half-open
 * intervals per root, and the resolver answers only inside them.
 *
 * NO CLOCK. NO PROVIDER. NO NETWORK. NO SYMBOL.
 */

import { isTimestamp, toEpochMs, type Timestamp } from '../time'
import { isMarketInstrument, type MarketInstrument } from '../market-instrument'
import {
  contractKey,
  parseContractCycle,
  type ResolvedContract,
} from '../contract-identity'

// ─── What an author supplies ──────────────────────────────────────────────────

export interface ContractCalendarEntry {
  readonly contract: ResolvedContract
  /** When this contract becomes the selected one. */
  readonly rollEffectiveAt: Timestamp
  readonly lastTradeAt: Timestamp
  readonly finalSettlementRef: string
  /** The listing venue, as an authored calendar fact — never a provider reading. */
  readonly exchange: string
  /** Where the authoritative facts came from. Required, never blank. */
  readonly sourceRef: string
}

/**
 * An interval the calendar CLAIMS AUTHORITY OVER, per root.
 *
 * Half-open `[from, to)`, matching every other interval in the Trading tree.
 * Stated per root because coverage for NQ, MNQ and ES must be independently
 * knowable: authoring one of them does not make the others answerable.
 */
export interface ContractCoverage {
  readonly root: MarketInstrument
  readonly from: Timestamp
  readonly to: Timestamp
}

export interface ContractCalendarInput {
  readonly calendarVersion: string
  readonly entries: readonly ContractCalendarEntry[]
  readonly coverage: readonly ContractCoverage[]
}

// ─── What construction produces ───────────────────────────────────────────────

export interface ContractCalendar {
  readonly calendarVersion: string
  /** Validated and ordered. Frozen — a calendar cannot change after building. */
  readonly entries: readonly ContractCalendarEntry[]
  readonly coverage: readonly ContractCoverage[]
}

/**
 * Why a calendar could not be built.
 *
 * One code per guard Canonical v1.0 §7 requires. They are AUTHORING failures,
 * not runtime conditions — nothing downstream branches on them, and none of
 * them implies retry, severity or anything about a market.
 */
export const CALENDAR_PROBLEMS = [
  'EMPTY_CALENDAR_VERSION',
  'UNSUPPORTED_ROOT',
  'INVALID_CYCLE',
  'MISSING_FIELD',
  'INVALID_TIMESTAMP',
  'DUPLICATE_CONTRACT',
  'CONFLICTING_ROLL_BOUNDARY',
  'MALFORMED_COVERAGE',
  'OVERLAPPING_COVERAGE',
  'COVERAGE_UNSUPPORTED',
] as const
export type CalendarProblemCode = (typeof CALENDAR_PROBLEMS)[number]

export interface CalendarProblem {
  readonly code: CalendarProblemCode
  /** Operator and review text. Never decision input. */
  readonly detail: string
}

export type CalendarBuild =
  | { readonly ok: true; readonly calendar: ContractCalendar }
  | { readonly ok: false; readonly problems: readonly CalendarProblem[] }

// ─── Construction ─────────────────────────────────────────────────────────────

const isNonBlank = (raw: unknown): raw is string =>
  typeof raw === 'string' && raw.trim().length > 0

/**
 * Build a calendar, or refuse with every problem found.
 *
 * ALL PROBLEMS ARE COLLECTED, not just the first. An author fixing a calendar
 * one refusal at a time learns one fault per attempt; the whole list is what
 * makes a broken calendar cheap to correct.
 *
 * Instants are compared through `toEpochMs`, never as text. `Timestamp` permits
 * an optional millisecond field, so `…T00:00:00Z` and `…T00:00:00.500Z` order
 * WRONG as strings — '.' sorts before 'Z' — and a text comparison would place
 * the later instant first.
 */
export function buildContractCalendar(input: ContractCalendarInput): CalendarBuild {
  const problems: CalendarProblem[] = []
  const fail = (code: CalendarProblemCode, detail: string): void => {
    problems.push({ code, detail })
  }

  if (!isNonBlank(input.calendarVersion)) {
    fail('EMPTY_CALENDAR_VERSION', 'calendarVersion must be a non-blank string')
  }

  // ── entries ────────────────────────────────────────────────────────────────
  const seen = new Set<string>()
  const rollSeen = new Map<string, string>()
  const usable: ContractCalendarEntry[] = []

  for (const [index, entry] of input.entries.entries()) {
    const at = `entries[${index}]`
    let sound = true

    if (!isMarketInstrument(entry.contract?.root)) {
      fail('UNSUPPORTED_ROOT', `${at}: root is not a supported instrument`)
      sound = false
    }
    if (parseContractCycle(entry.contract?.cycle) === null) {
      fail('INVALID_CYCLE', `${at}: cycle is not a valid quarterly cycle`)
      sound = false
    }
    for (const field of ['finalSettlementRef', 'exchange', 'sourceRef'] as const) {
      if (!isNonBlank(entry[field])) {
        fail('MISSING_FIELD', `${at}: ${field} is required and must be non-blank`)
        sound = false
      }
    }
    for (const field of ['rollEffectiveAt', 'lastTradeAt'] as const) {
      if (!isTimestamp(entry[field])) {
        fail('INVALID_TIMESTAMP', `${at}: ${field} is not a canonical Timestamp`)
        sound = false
      }
    }
    if (!sound) continue

    const key = contractKey(entry.contract)
    if (seen.has(key)) {
      fail('DUPLICATE_CONTRACT', `${at}: ${key} appears more than once`)
      continue
    }
    seen.add(key)

    /*
     * Two DIFFERENT contracts of one root claiming the same roll instant leaves
     * the resolver with no way to say which is selected. That is ambiguity, and
     * ambiguity is refused rather than broken arbitrarily.
     */
    const rollKey = `${entry.contract.root}@${toEpochMs(entry.rollEffectiveAt)}`
    const existing = rollSeen.get(rollKey)
    if (existing !== undefined) {
      fail('CONFLICTING_ROLL_BOUNDARY', `${at}: ${key} and ${existing} share a roll instant`)
      continue
    }
    rollSeen.set(rollKey, key)

    usable.push(entry)
  }

  // ── coverage ───────────────────────────────────────────────────────────────
  const windows: ContractCoverage[] = []
  for (const [index, window] of input.coverage.entries()) {
    const at = `coverage[${index}]`
    if (!isMarketInstrument(window.root)) {
      fail('UNSUPPORTED_ROOT', `${at}: root is not a supported instrument`)
      continue
    }
    if (!isTimestamp(window.from) || !isTimestamp(window.to)) {
      fail('MALFORMED_COVERAGE', `${at}: from/to must be canonical Timestamps`)
      continue
    }
    if (toEpochMs(window.from) >= toEpochMs(window.to)) {
      fail('MALFORMED_COVERAGE', `${at}: from must be strictly before to`)
      continue
    }
    windows.push(window)
  }

  for (const [i, a] of windows.entries()) {
    for (const b of windows.slice(i + 1)) {
      if (a.root !== b.root) continue
      if (toEpochMs(a.from) < toEpochMs(b.to) && toEpochMs(b.from) < toEpochMs(a.to)) {
        fail('OVERLAPPING_COVERAGE', `coverage for ${a.root} overlaps itself`)
      }
    }
  }

  /*
   * Coverage is a CLAIM, and a claim needs something behind it. A window whose
   * start is not preceded by an entry would have the resolver answering from
   * inside declared authority with nothing to select — so the calendar refuses
   * to exist rather than leaving that hole for the resolver to fall into.
   */
  for (const window of windows) {
    const supported = usable.some(
      (entry) =>
        entry.contract.root === window.root &&
        toEpochMs(entry.rollEffectiveAt) <= toEpochMs(window.from),
    )
    if (!supported) {
      fail(
        'COVERAGE_UNSUPPORTED',
        `coverage for ${window.root} from ${window.from} has no entry effective at or before it`,
      )
    }
  }

  if (problems.length > 0) return { ok: false, problems: Object.freeze(problems) }

  // Deterministic order: root, then instant. Two identical inputs build alike.
  const entries = [...usable].sort(
    (a, b) =>
      a.contract.root.localeCompare(b.contract.root) ||
      toEpochMs(a.rollEffectiveAt) - toEpochMs(b.rollEffectiveAt),
  )
  const coverage = [...windows].sort(
    (a, b) => a.root.localeCompare(b.root) || toEpochMs(a.from) - toEpochMs(b.from),
  )

  return {
    ok: true,
    calendar: Object.freeze({
      calendarVersion: input.calendarVersion,
      entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
      coverage: Object.freeze(coverage.map((window) => Object.freeze({ ...window }))),
    }),
  }
}
