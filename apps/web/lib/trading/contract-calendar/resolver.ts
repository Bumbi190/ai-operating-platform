/**
 * Omnira Trading — the pure contract resolver.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §7.2 (täckning, REFUSE)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §8 (roll effective instant)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §26 (ren funktion)
 *
 * A PURE FUNCTION OF (CALENDAR, ROOT, INSTANT)
 * ────────────────────────────────────────────
 * The same calendar, root and instant always produce the same answer, on every
 * machine and after every restart. That is not a nice property, it is the whole
 * mechanism behind Canonical v1.0 §26: a restart recomputes identically because
 * there is nothing else for the answer to depend on.
 *
 * So there is no clock here, no randomness, no environment, no network, no
 * provider and no symbol. `at` is supplied by the caller; the resolver never
 * asks what time it is.
 *
 * NO FALLBACK, EVER
 * ─────────────────
 * Outside authoritative coverage the answer is REFUSE. Not the newest entry,
 * not the nearest one, not a month-code guess, not a provider's front-month
 * label. §7.2 lists those prohibitions and this file implements none of them —
 * the only thing it can do with an uncovered instant is decline.
 *
 * IT MINTS NOTHING
 * ────────────────
 * A resolved contract is DATA IDENTITY. It is not permission to trade, and
 * nothing in this package can turn it into any.
 */

import { toEpochMs, type Timestamp } from '../time'
import type { MarketInstrument } from '../market-instrument'
import type { ResolvedContract } from '../contract-identity'
import type { ContractCalendar, ContractCalendarEntry } from './calendar'
import type { ContractLifecycle } from './lifecycle'

/**
 * Why the calendar declined.
 *
 * One member, on purpose. Canonical v1.0 states the semantic as
 * `resolve(root, T) → REFUSE`, and from a caller's side "no coverage for that
 * root" and "no coverage for that instant" are the same fact: the calendar was
 * never claimed to know. A wider taxonomy here would invite branching on
 * distinctions that carry no different obligation.
 */
export const CONTRACT_REFUSALS = ['NO_AUTHORITATIVE_COVERAGE'] as const
export type ContractRefusal = (typeof CONTRACT_REFUSALS)[number]

/**
 * A resolution, carrying the interval it is authoritative over.
 *
 * `effectiveFrom`/`effectiveTo` exist so a later segmentation step can split a
 * requested window at roll boundaries WITHOUT re-deriving the calendar logic. A
 * second implementation of that arithmetic is a second place for it to differ.
 *
 * Both are clamped to the coverage window: the interval reported is the span
 * this answer is actually authoritative over, not the span the entry would
 * cover if authority were unlimited.
 */
export type ContractResolution =
  | {
      readonly outcome: 'RESOLVED'
      readonly contract: ResolvedContract
      readonly lifecycle: ContractLifecycle
      /** Inclusive. */
      readonly effectiveFrom: Timestamp
      /** Exclusive. */
      readonly effectiveTo: Timestamp
      readonly calendarVersion: string
    }
  | { readonly outcome: 'REFUSED'; readonly refusal: ContractRefusal }

const refused: ContractResolution = Object.freeze({
  outcome: 'REFUSED',
  refusal: 'NO_AUTHORITATIVE_COVERAGE',
})

/**
 * Which concrete contract the calendar says is selected for `root` at `at`.
 *
 * The boundary is half-open on the roll instant: an entry becomes selected AT
 * its stored `rollEffectiveAt`, so the instant of the roll already belongs to
 * the new contract and the instant before it still belongs to the old one.
 */
export function resolveContractAt(
  calendar: ContractCalendar,
  root: MarketInstrument,
  at: Timestamp,
): ContractResolution {
  const atMs = toEpochMs(at)

  // 1. Is this instant inside declared authority for this root?
  const window = calendar.coverage.find(
    (candidate) =>
      candidate.root === root &&
      toEpochMs(candidate.from) <= atMs &&
      atMs < toEpochMs(candidate.to),
  )
  if (window === undefined) return refused

  // 2. The latest entry whose roll instant has already arrived.
  let chosen: ContractCalendarEntry | null = null
  for (const entry of calendar.entries) {
    if (entry.contract.root !== root) continue
    const rollMs = toEpochMs(entry.rollEffectiveAt)
    if (rollMs > atMs) continue
    if (chosen === null || rollMs > toEpochMs(chosen.rollEffectiveAt)) chosen = entry
  }
  /*
   * Construction refuses a coverage window with no entry at or before its
   * start, so this is unreachable through the public API. It is kept because a
   * resolver that assumed its own validator had run would be trusting a
   * guarantee it cannot see — and the honest answer here is the same refusal.
   */
  if (chosen === null) return refused

  // 3. The next roll for this root, if the calendar has one.
  let nextRoll: Timestamp | null = null
  for (const entry of calendar.entries) {
    if (entry.contract.root !== root) continue
    const rollMs = toEpochMs(entry.rollEffectiveAt)
    if (rollMs <= toEpochMs(chosen.rollEffectiveAt)) continue
    if (nextRoll === null || rollMs < toEpochMs(nextRoll)) nextRoll = entry.rollEffectiveAt
  }

  /*
   * Clamped to the coverage window, and by SELECTING an existing Timestamp
   * rather than constructing one. Building a new instant would mean `new Date`,
   * and this package is forbidden from touching a date constructor at all.
   */
  const effectiveFrom =
    toEpochMs(chosen.rollEffectiveAt) >= toEpochMs(window.from) ? chosen.rollEffectiveAt : window.from
  const effectiveTo =
    nextRoll !== null && toEpochMs(nextRoll) < toEpochMs(window.to) ? nextRoll : window.to

  return Object.freeze({
    outcome: 'RESOLVED',
    contract: chosen.contract,
    lifecycle: Object.freeze({
      contract: chosen.contract,
      lastTradeAt: chosen.lastTradeAt,
      finalSettlementRef: chosen.finalSettlementRef,
      rollEffectiveAt: chosen.rollEffectiveAt,
      calendarVersion: calendar.calendarVersion,
    }),
    effectiveFrom,
    effectiveTo,
    calendarVersion: calendar.calendarVersion,
  })
}
