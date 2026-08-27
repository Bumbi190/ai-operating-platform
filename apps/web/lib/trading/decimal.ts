/**
 * Omnira Trading Core — exact decimal values for prices, money and quantities.
 *
 * Canonical source: Risk Engine Specification v0.1 §82 (numeric precision), kept
 * in force by Canonical v1.0 §7.
 *
 *   "Money, price, quantity och tick calculations får inte förlita sig på
 *    godtycklig binary floating-point där avrundningsfel kan påverka hard limits.
 *    När systemet ligger exakt på en riskgräns ska resultatet vara reproducerbart."
 *
 * WHY THIS EXISTS IN PHASE 1:
 * TradeProposal must carry entry, stop, target, R:R and risk amount. Storing any
 * of those as a JS `number` would bake a float rounding error into the very
 * foundation the Risk Engine will later compare against a hard limit. The value
 * object is therefore load-bearing for Core, not an early Risk Engine.
 *
 * DELIBERATELY ABSENT: arithmetic. There is no add, subtract, multiply or divide
 * here. Position sizing, risk amounts and R:R computation are Risk Engine work
 * (Fas 5). Phase 1 only needs to carry exact values and compare them.
 *
 * INVARIANTS:
 *  - Construction is from strings only. There is no `fromNumber`, because that
 *    is precisely where precision is lost.
 *  - The value is stored as a scaled bigint, so equality and ordering are exact.
 *  - Comparison is scale-aware: '1.50' and '1.5' are equal in value.
 */

import type { Branded } from './ids'

/** Maximum accepted fractional digits. Well beyond any instrument tick size. */
export const MAX_DECIMAL_SCALE = 12

/**
 * An exact decimal number.
 *
 * `units` is the value scaled by 10^`scale`. '1.25' is { units: 125n, scale: 2 }.
 */
export interface Decimal {
  readonly units: bigint
  readonly scale: number
  /** The exact text the value was parsed from, normalized. Never lossy. */
  readonly text: string
}

/** A decimal known to be non-negative. Used where a negative value is nonsense. */
export type NonNegativeDecimal = Branded<Decimal, 'NonNegativeDecimal'>

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/

/**
 * Zero as a bigint. Written this way rather than as a `0n` literal because the
 * workspace targets ES2017, where BigInt literal syntax is unavailable.
 */
const ZERO = BigInt(0)

/** 10^n as an exact bigint, built from digits so no exponent operator is needed. */
function powerOfTen(n: number): bigint {
  return BigInt('1' + '0'.repeat(n))
}

/**
 * Parse an exact decimal from its string form.
 *
 * Rejects: floats, exponent notation, leading '+', leading zeros, bare '.',
 * empty strings, and anything exceeding the scale or integer-digit bounds.
 * Fails closed to null.
 */
export function parseDecimal(raw: unknown): Decimal | null {
  if (typeof raw !== 'string') return null
  if (!DECIMAL_PATTERN.test(raw)) return null

  const negative = raw.startsWith('-')
  const body = negative ? raw.slice(1) : raw
  const dot = body.indexOf('.')

  const intPart = dot === -1 ? body : body.slice(0, dot)
  const fracPart = dot === -1 ? '' : body.slice(dot + 1)
  if (fracPart.length > MAX_DECIMAL_SCALE) return null

  const digits = intPart + fracPart
  let units: bigint
  try {
    units = BigInt(digits)
  } catch {
    return null
  }
  if (negative) units = -units

  // '-0' and '-0.00' normalize to zero, so the sign never leaks into equality.
  const scale = fracPart.length
  const text = units === ZERO ? zeroText(scale) : raw

  return Object.freeze({ units, scale, text })
}

function zeroText(scale: number): string {
  return scale === 0 ? '0' : `0.${'0'.repeat(scale)}`
}

/** Assert a decimal at a boundary you control. Throws on malformed input. */
export function asDecimal(raw: string): Decimal {
  const parsed = parseDecimal(raw)
  if (parsed === null) throw new Error(`Malformed decimal: ${JSON.stringify(raw)}`)
  return parsed
}

/** Parse a decimal that must not be negative. Fails closed to null. */
export function parseNonNegativeDecimal(raw: unknown): NonNegativeDecimal | null {
  const parsed = parseDecimal(raw)
  if (parsed === null || parsed.units < ZERO) return null
  return parsed as NonNegativeDecimal
}

/** True when the value is strictly greater than zero. */
export function isPositive(value: Decimal): boolean {
  return value.units > ZERO
}

/** True when the value is exactly zero, at any scale. */
export function isZero(value: Decimal): boolean {
  return value.units === ZERO
}

/** Rescale two decimals to a common scale without losing information. */
function align(a: Decimal, b: Decimal): { readonly left: bigint; readonly right: bigint } {
  if (a.scale === b.scale) return { left: a.units, right: b.units }
  const scale = Math.max(a.scale, b.scale)
  const left = a.units * powerOfTen(scale - a.scale)
  const right = b.units * powerOfTen(scale - b.scale)
  return { left, right }
}

/** Exact ordering. Returns -1, 0 or 1. Scale-independent. */
export function compareDecimal(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const { left, right } = align(a, b)
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Exact value equality. '1.50' equals '1.5'. */
export function decimalEquals(a: Decimal, b: Decimal): boolean {
  return compareDecimal(a, b) === 0
}

/** True when `a` is greater than or equal to `b`. */
export function decimalAtLeast(a: Decimal, b: Decimal): boolean {
  return compareDecimal(a, b) >= 0
}

/** The canonical string form. Round-trips through `parseDecimal` unchanged. */
export function decimalToString(value: Decimal): string {
  return value.text
}
