/**
 * lib/cost/spend-ceiling.ts — the HARD ceiling a governed dispatch reserves (M0).
 *
 * ── THE INVARIANT ───────────────────────────────────────────────────────────
 * If durable post-dispatch persistence becomes unavailable, the amount that
 * stays held MUST be ≥ every billable outcome the provider request allows. The
 * reservation is what the crash reconciler settles, so a reservation that is
 * only a likely figure would turn a lost settlement into an under-count.
 *
 * "Billable outcome" is measured the way Omnira's own ledger measures it: the
 * metered quantities the provider reports, priced by the canonical price book
 * (`MODEL_PRICING`, `cost_rates`) at the SAME rate snapshot the ceiling used —
 * `withGovernedSpend` pins that snapshot for the call's metering, so an FX or
 * rate edit mid-flight cannot push the metered amount above the ceiling.
 * Whether the price book itself matches the provider's invoices is an
 * operator-owned fact about the price book, not something code can prove.
 *
 * ── THREE BASES, AND NOTHING ELSE ──────────────────────────────────────────
 *   token_window    billed tokens are capped by the provider's own request
 *                   contract: input ≤ the model's context window (a larger
 *                   prompt is rejected unbilled) and output ≤ the request's
 *                   own output cap. Heuristic input estimates are NOT used —
 *                   characters-per-token is a guess, the window is a limit.
 *   fixed_units     the provider bills a unit count fixed by the request
 *                   (images, characters, an execution), priced exactly as the
 *                   metering prices it.
 *   internal_fixed  no provider is billed by this boundary (workflow effects);
 *                   the reservation is the whole amount and nothing is metered.
 *
 * A request this module cannot bound is REFUSED — never reserved at a guess.
 */

import { MODEL_PRICING, type ModelPricing } from '@/lib/ai/pricing'

export type CeilingBasis = 'token_window' | 'fixed_units' | 'internal_fixed'
export const CEILING_BASES: readonly CeilingBasis[] = ['token_window', 'fixed_units', 'internal_fixed']

/** A rate snapshot as returned by `getRates()`. */
export type RateSnapshot = Readonly<Record<string, number>>

/**
 * Context windows in tokens: the provider-enforced maximum prompt size. A
 * request above it is rejected before inference (unbilled), so the window is a
 * hard bound on billed input. Only models with BOTH a price-book entry and a
 * documented window are boundable; anything else is refused.
 *
 * Anthropic's larger 1M window exists only behind a beta header, which the
 * ceiling refuses outright, so 200k is the bound for every listed Claude model.
 */
export const CONTEXT_WINDOW_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
})

export type Ceiling =
  | { readonly ok: true; readonly sek: number; readonly basis: CeilingBasis; readonly detail: string }
  | { readonly ok: false; readonly reason: string }

const refuse = (reason: string): Ceiling => ({ ok: false, reason })

function fx(rates: RateSnapshot): number | null {
  const v = rates.usd_sek
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function tokenModel(model: string): { pricing: ModelPricing; window: number } | null {
  const pricing = Object.prototype.hasOwnProperty.call(MODEL_PRICING, model) ? MODEL_PRICING[model] : undefined
  const window = Object.prototype.hasOwnProperty.call(CONTEXT_WINDOW_TOKENS, model) ? CONTEXT_WINDOW_TOKENS[model] : undefined
  if (!pricing || !window) return null
  return { pricing, window }
}

const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

/** Token-window ceiling: window × input price + output cap × output price. */
export function tokenWindowCeiling(model: string, outputCap: number, rates: RateSnapshot): Ceiling {
  const m = tokenModel(model)
  if (!m) return refuse(`model "${model}" has no price-book entry with a documented context window`)
  if (!isPositiveInt(outputCap)) return refuse('the request carries no positive integer output cap')
  const rate = fx(rates)
  if (rate === null) return refuse('the rate snapshot has no usable usd_sek')
  const usd = (m.window / 1_000_000) * m.pricing.inputPer1M + (outputCap / 1_000_000) * m.pricing.outputPer1M
  return { ok: true, sek: usd * rate, basis: 'token_window', detail: `${model}:in<=${m.window},out<=${outputCap}` }
}

/** Fixed-unit ceiling: units × the per-unit USD price the metering also uses. */
export function fixedUnitCeiling(units: number, usdPerUnit: number, rates: RateSnapshot, detail: string): Ceiling {
  if (!Number.isFinite(units) || units < 0) return refuse('the unit count is not a finite non-negative number')
  if (!Number.isFinite(usdPerUnit) || usdPerUnit < 0) return refuse('the unit price is not usable')
  const rate = fx(rates)
  if (rate === null) return refuse('the rate snapshot has no usable usd_sek')
  return { ok: true, sek: units * usdPerUnit * rate, basis: 'fixed_units', detail }
}

/** True when `value` (any JSON-ish structure) contains `key` anywhere. */
export function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some(v => containsKey(v, key))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => k === key || containsKey(v, key))
  }
  return false
}
