/**
 * Omnira Trading — externally observed open positions.
 *
 * WHAT THIS REPRESENTS
 * ────────────────────
 * Actual exposure, as *reported by a provider*. Not what Omnira planned, not
 * what Omnira thinks should be open — what someone else says is open.
 *
 * In Stage 1.5 the only source is fixtures. When a real read-only adapter
 * arrives it fills this same shape, and nothing downstream changes.
 *
 * WHY IT IS A SEPARATE TYPE FROM `PlannedTradeView`
 * ────────────────────────────────────────────────
 * Because plan and reality disagree, and the system must be able to say so. A
 * position can exist that Omnira never planned — opened by hand, left over from
 * a previous session, or belonging to another platform on the same account. The
 * canonical rule is that provider state is authoritative for actual exposure,
 * and a merged model would make an unplanned position unrepresentable.
 *
 * There is deliberately no conversion between the two types, in either
 * direction. An observed position cannot be turned into a plan, and a plan
 * cannot be turned into a position by rendering it harder.
 *
 * MISSING DATA IS NEVER GUESSED
 * ─────────────────────────────
 * Providers differ in what they report. Every optional reading is `Available<T>`
 * shaped — PRESENT with a value, UNAVAILABLE because this provider does not
 * report it, or UNKNOWN because we have not been told. None of those is zero,
 * and none of them is silently rendered as a dash that could mean any of the
 * three.
 */

import { parseDecimal } from '../decimal'
import type { Branded } from '../ids'
import type {
  MarketFreshness,
  MarketInstrument,
  PriceText,
  Timestamp,
} from '../market-view'

// ─── Exact observed quantity ──────────────────────────────────────────────────

/**
 * An exact position size, in text form.
 *
 * WHY NOT `number`
 * ────────────────
 * A provider reports quantity as an exact `Decimal`, and JS `number` cannot hold
 * one. Measured on the canonical parser's own accepted range:
 *
 *     '0.000000000001'    → Number() → 1e-12                 exponent form,
 *                                                            which parseDecimal rejects
 *     '99999999999999999' → Number() → 100000000000000000    THE VALUE CHANGED
 *
 * Futures quantities are usually small integers, and that is exactly why the
 * old `number` survived this long — it was right for every fixture and wrong for
 * the model. A representation that silently corrupts a legal provider value is
 * not made safe by the values we happen to see today.
 *
 * WHY NOT `PriceText`
 * ───────────────────
 * A quantity is not a price. They share an exact-decimal-text representation and
 * nothing else, and one branded type for both would let a size be rendered where
 * a price belongs without a compiler complaint.
 *
 * Text rather than the `Decimal` value object for the same reason `PriceText` is
 * text: `Decimal` stores a `bigint`, which `JSON.stringify` throws on, so it
 * cannot cross a React Server Component boundary. This is the same value,
 * exactly, in the form the boundary accepts.
 *
 * Validated through the canonical `parseDecimal` — there is no second numeric
 * parser here, and no path from a JS number.
 */
export type QuantityText = Branded<string, 'QuantityText'>

/**
 * Parse an untrusted value into a QuantityText. Fails closed to null.
 *
 * Accepts only what `parseDecimal` accepts: no floats, no exponent notation, no
 * leading '+', no bare '.'. The normalized `Decimal.text` is what is stored, so
 * the value round-trips through `parseDecimal` unchanged.
 */
export function parseQuantityText(raw: unknown): QuantityText | null {
  const parsed = parseDecimal(raw)
  return parsed === null ? null : (parsed.text as QuantityText)
}

/** Assert a QuantityText at a boundary you control. Throws on malformed input. */
export function quantityText(raw: string): QuantityText {
  const parsed = parseQuantityText(raw)
  if (parsed === null) throw new Error(`Malformed quantity: ${JSON.stringify(raw)}`)
  return parsed
}

// ─── Observed direction ───────────────────────────────────────────────────────

/**
 * The direction of an observed position.
 *
 * SEPARATE FROM `DisplayDirection`, WHICH CANNOT SAY "UNKNOWN".
 * `DisplayDirection` is LONG · SHORT · NEUTRAL, and NEUTRAL is a *strategy*
 * statement — no bias, nothing to lean on. An observed position whose direction
 * the provider could not report is not neutral; it is unknown, and rendering it
 * as NEUTRAL would assert a fact nobody established.
 *
 * There is no NEUTRAL here for the same reason there is no FLAT in the provider
 * contract: a position that is not open is absent from the list, not present
 * with a zero-ish direction.
 *
 * Replay-owned. Deliberately NOT an alias of the provider contract's
 * `PositionSide`, and replay imports nothing from `lib/trading/provider`. A
 * future normalization package maps one to the other, member for member.
 */
export const OBSERVED_POSITION_DIRECTIONS = ['LONG', 'SHORT', 'UNKNOWN'] as const
export type ObservedPositionDirection = (typeof OBSERVED_POSITION_DIRECTIONS)[number]

/**
 * A reading that a provider may or may not supply.
 *
 * Mirrors the `Available<T>` vocabulary locked in the Level 1 Execution Provider
 * Adapter contract, so the read-only adapter's answers map straight onto this
 * without a translation layer inventing certainty.
 */
export type ObservedValue<T> =
  | { readonly state: 'PRESENT'; readonly value: T }
  | { readonly state: 'UNAVAILABLE' }
  | { readonly state: 'UNKNOWN' }

export function present<T>(value: T): ObservedValue<T> {
  return { state: 'PRESENT', value }
}

/*
 * Factories, not shared constants.
 *
 * A singleton would be aliased across several fields of the same position, and
 * a structure that reaches the same object twice is a DAG rather than a tree.
 * That is worth avoiding on its own — two fields that silently share an object
 * are a latent aliasing bug — and it also keeps this package clear of a defect
 * in `canonicalJson`, whose cycle guard never releases visited nodes and so
 * rejects any repeated reference as circular.
 */
export function unavailable<T>(): ObservedValue<T> {
  return { state: 'UNAVAILABLE' }
}

export function unknownValue<T>(): ObservedValue<T> {
  return { state: 'UNKNOWN' }
}

/** Read a value, or null when it is not present. Never a default. */
export function observedOrNull<T>(value: ObservedValue<T>): T | null {
  return value.state === 'PRESENT' ? value.value : null
}

/**
 * Provider identity as opaque observation metadata.
 *
 * Deliberately unstructured strings: this is a *label to show the operator*,
 * not a typed handle onto a provider session. No provider protocol type appears
 * anywhere in this package, and there is no account id, no credential reference
 * and nothing that could address a broker.
 */
export interface ObservationSource {
  /** e.g. 'Fixtur' today; a provider name later. Never a credential. */
  readonly providerLabel: string
  /** An opaque, already-redacted account reference. Null when none applies. */
  readonly accountLabel: string | null
  readonly origin: 'FIXTURE' | 'SIMULATION' | 'LIVE'
}

export const OBSERVED_POSITION_STATES = ['OPEN', 'CLOSED', 'UNKNOWN'] as const
export type ObservedPositionState = (typeof OBSERVED_POSITION_STATES)[number]

export interface ObservedPosition {
  /** Stable within a scenario. Not an order id and not a plan id. */
  readonly positionId: string
  readonly source: ObservationSource
  readonly instrument: MarketInstrument
  readonly state: ObservedPositionState
  readonly direction: ObservedPositionDirection
  readonly quantity: ObservedValue<QuantityText>
  readonly averageEntry: ObservedValue<PriceText>
  readonly lastPrice: ObservedValue<PriceText>
  readonly unrealizedPnl: ObservedValue<PriceText>
  readonly stopLoss: ObservedValue<PriceText>
  readonly takeProfit: ObservedValue<PriceText>
  readonly openedAt: ObservedValue<Timestamp>
  /** When this reading was taken. Market time. */
  readonly lastObservedAt: Timestamp
  readonly freshness: MarketFreshness
  /**
   * True when Omnira has no plan that corresponds to this position.
   *
   * Not a fault — a manual or leftover position is a normal thing to observe,
   * and saying so is more useful than quietly attributing it to a plan.
   */
  readonly unattributed: boolean
  readonly note: string | null
}

/**
 * Whether an observed position can produce a plan or an intent. Always false.
 *
 * Seeing exposure tells the system what is true, not what it may do. This
 * function exists so the claim is testable rather than merely asserted in a
 * comment; there is no counterpart that returns true.
 */
export function observedPositionGrantsAuthority(position: ObservedPosition): boolean {
  void position
  return false
}

/** True when nothing about this position can be trusted as current. */
export function observationIsStale(position: ObservedPosition): boolean {
  return position.freshness !== 'FRESH'
}
