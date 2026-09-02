/**
 * Omnira Trading — exact summation for aggregated volume.
 *
 * Canonical source:
 *  - Risk Engine Specification v0.1 §82 (numeric precision), kept in force by
 *    Market Data & Contract Lifecycle Canonical v1.0 §7
 *
 * WHY THIS IS NOT IN decimal.ts
 * ─────────────────────────────
 * `decimal.ts` ships NO arithmetic, and its header says why in as many words:
 * add, subtract, multiply and divide are Risk Engine work (Fas 5), because the
 * moment a general arithmetic API exists, position sizing and R:R computation
 * start using it before anyone has decided how they should round.
 *
 * That reasoning is still right, so this helper stays here, deliberately
 * cramped: it sums a list of volumes for one candle bucket and does nothing
 * else. It is NOT exported from the package barrel, there is no `subtract`,
 * no `multiply`, no `divide` and no rounding mode — and the import-discipline
 * suite fails the build if any of those appear.
 *
 * If exact money arithmetic is ever genuinely needed system-wide, it belongs in
 * `decimal.ts` under the Risk Engine's rules. Not by quietly widening this.
 *
 * NO FLOAT EVER TOUCHES A VOLUME
 * ──────────────────────────────
 * Every value is parsed through the canonical `parseDecimal`, summed as a
 * scaled `bigint`, and rendered back to text by integer division. `Number`,
 * `parseFloat` and `Math` are absent, and the guard proves their absence.
 *
 * SCALE IS PRESERVED, NOT NORMALISED
 * ──────────────────────────────────
 * The sum carries the LARGEST constituent scale: `1 + 2` is `3`, and
 * `1.0 + 2.00` is `3.00`. That is serialization mechanics — it says nothing
 * about tick size, contract size or how a venue reports volume, and no market
 * policy may be read out of it. Choosing the maximum scale rather than trimming
 * keeps the operation associative in its text form, so summing a bucket in two
 * halves and summing it in one pass produce the same string.
 */

import { parseDecimal, type Decimal } from '../decimal'
import { parsePriceText, type PriceText } from '../market-price'

/** ES2017 target: BigInt literals are unavailable, so the constant is built. */
const ZERO = BigInt(0)

/** 10^n as an exact bigint, built from digits so no exponent operator is needed. */
function powerOfTen(n: number): bigint {
  return BigInt('1' + '0'.repeat(n))
}

/**
 * The exact sum of some volumes, or null when it cannot be represented.
 *
 * Returns null rather than throwing on an unrepresentable total: the canonical
 * decimal grammar bounds the integer part, and a sum that overflows it is a
 * refusal for the caller to report, not an exception to unwind through.
 *
 * An empty list sums to null, not to zero. Canonical v1.0 keeps `null` (not
 * reported) and zero (reported as none) strictly apart, and inventing a zero
 * total for a bucket that contributed nothing would be a factual claim about
 * the market that no observation supports.
 */
export function exactVolumeSum(volumes: readonly PriceText[]): PriceText | null {
  if (volumes.length === 0) return null

  const parsed: Decimal[] = []
  for (const volume of volumes) {
    const value = parseDecimal(volume)
    // Unreachable through `PriceText`, which is validated by the same parser.
    // Kept because a helper that trusted its own brand would be trusting a
    // guarantee it cannot see.
    if (value === null) return null
    parsed.push(value)
  }

  const scale = parsed.reduce((widest, value) => (value.scale > widest ? value.scale : widest), 0)
  let units = ZERO
  for (const value of parsed) units += value.units * powerOfTen(scale - value.scale)

  return parsePriceText(renderExact(units, scale))
}

/**
 * Render a scaled bigint as exact decimal text.
 *
 * Integer division and remainder only — never `toFixed`, never an exponent.
 * The fractional part is left-padded to the full scale so `3.05` never renders
 * as `3.5`.
 */
function renderExact(units: bigint, scale: number): string {
  const negative = units < ZERO
  const magnitude = negative ? -units : units
  if (scale === 0) return `${negative ? '-' : ''}${magnitude.toString()}`

  const divisor = powerOfTen(scale)
  const whole = magnitude / divisor
  const fraction = magnitude % divisor
  const digits = fraction.toString().padStart(scale, '0')
  return `${negative ? '-' : ''}${whole.toString()}.${digits}`
}
