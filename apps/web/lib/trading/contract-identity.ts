/**
 * Omnira Trading Core — concrete futures contract IDENTITY.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §4 (ContractCycle)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §5 (ResolvedContract)
 *
 * IDENTITY, AND NOTHING ELSE
 * ──────────────────────────
 * A `ResolvedContract` is a root plus a cycle. That is the whole of it.
 *
 * `expiration`, `lastTradeAt`, `rollEffectiveAt` and `calendarVersion` are
 * deliberately absent. Canonical v1.0 §5 gives the reason and it is not
 * stylistic: those are lifecycle facts that an authoritative calendar
 * correction may change, and a corrected fact must not change WHICH listed
 * contract is being described. Put them in the identity and an ordinary
 * correction becomes an identity change — that is, a rollover that never
 * happened. They live in `contract-calendar/lifecycle.ts` instead.
 *
 * NO EXCHANGE FIELD IN v1.0
 * ─────────────────────────
 * Canonical v1.0 §5 scopes this precisely. v1.0 supports the closed root set
 * NQ / MNQ / ES, which are venue-unambiguous WITHIN THAT SCOPE, so venue is not
 * part of identity here. Admitting a root whose venue is ambiguous requires an
 * explicit canonical extension BEFORE that root is admitted — not a quiet field
 * added later. Provider-observed exchange stays provenance.
 *
 * NO BRANDED ID
 * ─────────────
 * Identity is structural, so two resolutions of the same contract are equal by
 * value. Two minted ids can drift apart; two values cannot.
 *
 * NOTHING HERE IS DERIVED FROM A PROVIDER OBSERVATION.
 */

import { isMarketInstrument, type MarketInstrument } from './market-instrument'

// ─── Cycle ────────────────────────────────────────────────────────────────────

/**
 * The quarterly cycle the supported products list on.
 *
 * March / June / September / December is an exchange fact (Canonical v1.0
 * §27.1), not an Omnira choice. Restricting the type to those four values makes
 * a fifth month a compile error rather than a runtime surprise.
 */
export const QUARTER_MONTHS = [3, 6, 9, 12] as const
export type QuarterMonth = (typeof QUARTER_MONTHS)[number]

export function isQuarterMonth(raw: unknown): raw is QuarterMonth {
  return typeof raw === 'number' && (QUARTER_MONTHS as readonly number[]).includes(raw)
}

export interface ContractCycle {
  readonly year: number
  readonly quarterMonth: QuarterMonth
}

/**
 * Whether a year is structurally usable.
 *
 * Integer and finite, and NOTHING ELSE. A bound such as `year >= 2020` would be
 * a business rule no canonical text states, and the first historical backfill
 * that reached past it would fail for a reason nobody wrote down.
 */
export function isCalendarYear(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw)
}

/** Parse an untrusted value into a cycle. Fails closed to null. */
export function parseContractCycle(raw: unknown): ContractCycle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const candidate = raw as Record<string, unknown>
  if (!isCalendarYear(candidate.year)) return null
  if (!isQuarterMonth(candidate.quarterMonth)) return null
  return Object.freeze({ year: candidate.year, quarterMonth: candidate.quarterMonth })
}

/** Assert a cycle at a boundary you control (fixtures, literals). Throws. */
export function contractCycle(year: number, quarterMonth: QuarterMonth): ContractCycle {
  const parsed = parseContractCycle({ year, quarterMonth })
  if (parsed === null) throw new Error(`Malformed ContractCycle: ${JSON.stringify({ year, quarterMonth })}`)
  return parsed
}

/** Chronological order. Deterministic, and the only ordering this module defines. */
export function compareContractCycle(a: ContractCycle, b: ContractCycle): number {
  if (a.year !== b.year) return a.year - b.year
  return a.quarterMonth - b.quarterMonth
}

export function sameCycle(a: ContractCycle, b: ContractCycle): boolean {
  return a.year === b.year && a.quarterMonth === b.quarterMonth
}

// ─── Resolved contract ────────────────────────────────────────────────────────

export interface ResolvedContract {
  readonly root: MarketInstrument
  readonly cycle: ContractCycle
}

/** Assert a resolved contract at a boundary you control. Throws. */
export function resolvedContract(root: MarketInstrument, cycle: ContractCycle): ResolvedContract {
  if (!isMarketInstrument(root)) throw new Error(`Unsupported root: ${JSON.stringify(root)}`)
  const parsed = parseContractCycle(cycle)
  if (parsed === null) throw new Error(`Malformed ContractCycle: ${JSON.stringify(cycle)}`)
  return Object.freeze({ root, cycle: parsed })
}

/** Parse an untrusted value into a resolved contract. Fails closed to null. */
export function parseResolvedContract(raw: unknown): ResolvedContract | null {
  if (typeof raw !== 'object' || raw === null) return null
  const candidate = raw as Record<string, unknown>
  if (!isMarketInstrument(candidate.root)) return null
  const cycle = parseContractCycle(candidate.cycle)
  if (cycle === null) return null
  return Object.freeze({ root: candidate.root, cycle })
}

/**
 * Structural equality on root and cycle — the whole of identity.
 *
 * NQ and MNQ of the same cycle are NOT the same contract: they are distinct
 * products that happen to share a roll boundary (Canonical v1.0 §22). This
 * function is what makes that difference impossible to blur.
 */
export function sameContract(a: ResolvedContract, b: ResolvedContract): boolean {
  return a.root === b.root && sameCycle(a.cycle, b.cycle)
}

/**
 * A stable, human-readable key for a contract.
 *
 * For grouping and diagnostics only. It is NOT an identity, NOT a provider
 * symbol, and nothing may parse a contract back out of it — that would be the
 * symbol-inference this architecture forbids.
 */
export function contractKey(contract: ResolvedContract): string {
  return `${contract.root}:${contract.cycle.year}-${String(contract.cycle.quarterMonth).padStart(2, '0')}`
}
