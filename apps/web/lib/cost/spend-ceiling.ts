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
 * Decimal places of the authoritative SEK ledger: `spend_reservations.estimated_sek`,
 * `actual_sek` and `cost_events.cost_sek` are all `numeric(12,4)`.
 */
export const SEK_LEDGER_SCALE = 4
const LEDGER_QUANTA = 10 ** SEK_LEDGER_SCALE

/**
 * The largest amount `numeric(12,4)` can hold: 8 integer digits, 4 decimals.
 * An amount above it cannot be represented by the ledger at all, so a governed
 * call whose quantized ceiling exceeds it is REFUSED before reserving — never
 * clamped down, and never left to a PostgreSQL overflow to catch.
 */
export const SEK_LEDGER_MAX = 99_999_999.9999

/**
 * M0: an amount quantized UP to the ledger scale — the smallest 4-decimal amount
 * that is ≥ the input. Used for EVERY authoritative SEK amount the ledger holds:
 * hard ceilings before they are reserved, and metered/ungoverned costs before
 * they reach `cost_events.cost_sek`.
 *
 * Postgres rounds a value written to `numeric(12,4)` to NEAREST, so an unquantized
 * amount can be stored BELOW itself (production, Atlas TTS 18 chars: ceiling
 * 0.002835 → 0.0028; Atlas chat 104 in / 4 out: cost 0.003906 → 0.0039), and
 * budget and Survival authority would count less than the computed amount.
 *
 * Float-safe and loop-free. `Math.ceil(sek * 10^4)` alone is not safe — the
 * product can land on either side of an integer (600 TTS chars compute to
 * 0.09449999999999999). For any input up to `SEK_LEDGER_MAX` the product is
 * below 10^12 with a relative error under 2^-52, so its absolute error is far
 * below 1 and the candidate `k` is off by at most one in either direction; ONE
 * correction step each way against the exact comparison `k / 10^4 >= sek`
 * therefore lands on the right integer. `k` is an integer below 2^53, so `k ± 1`
 * is exact; there is no loop to fail to make progress. An IEEE division of two
 * exact integers is the correctly rounded double of the decimal `k / 10^4`, and
 * that double serializes back to exactly that decimal.
 *
 * The result is never below the input and at most one 0.0001 SEK quantum above.
 *
 * Inputs outside the ledger's domain are returned UNCHANGED for the caller to
 * refuse: zero, negative, non-finite, and anything above `SEK_LEDGER_MAX` (whose
 * quantum count would leave the exact-integer range). No input can make this
 * function loop. `SEK_LEDGER_MAX` is itself 4-decimal, so a quantized in-range
 * amount never exceeds it.
 */
export function ceilToLedgerScale(sek: number): number {
  if (!Number.isFinite(sek) || sek <= 0 || sek > SEK_LEDGER_MAX) return sek
  let k = Math.ceil(sek * LEDGER_QUANTA)
  if (k > 0 && (k - 1) / LEDGER_QUANTA >= sek) k -= 1
  if (k / LEDGER_QUANTA < sek) k += 1
  return k / LEDGER_QUANTA
}


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

// ── OpenAI speech ────────────────────────────────────────────────────────────

/**
 * The speech models OpenAI bills PER INPUT CHARACTER, each with its own
 * canonical `cost_rates` key. Only these have a request-fixed billable unit (the
 * input text) that a hard ceiling can price. gpt-4o-mini-tts bills text-input
 * AND audio-output tokens, and the request carries no cap on audio output, so it
 * is not boundable. There is deliberately NO fallback price: the old $0.015 /
 * 1k-character figure was a proxy for per-token billing.
 */
export const OPENAI_PER_CHARACTER_SPEECH_RATE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'tts-1': 'openai_tts_1_usd_per_1k_chars',
  'tts-1-hd': 'openai_tts_1_hd_usd_per_1k_chars',
})

/**
 * Speech: input characters × the model's canonical per-character rate, for a
 * per-character-billed model with a configured rate only. `charCount` is the
 * UTF-16 length of the input, which is ≥ the number of characters billed.
 */
export function openAISpeechCeiling(charCount: number, model: string, rates: RateSnapshot): Ceiling {
  const key = Object.prototype.hasOwnProperty.call(OPENAI_PER_CHARACTER_SPEECH_RATE_KEYS, model)
    ? OPENAI_PER_CHARACTER_SPEECH_RATE_KEYS[model] : undefined
  if (!key) {
    return refuse(`speech model "${model}" is not billed per input character (or is unknown): `
      + 'its audio output is not bounded by the request')
  }
  const perK = rates[key]
  if (typeof perK !== 'number' || !Number.isFinite(perK) || perK < 0) {
    return refuse(`no canonical per-character rate is configured (cost_rates.${key})`)
  }
  return fixedUnitCeiling(charCount / 1000, perK, rates, `speech:${model}:${charCount}chars`)
}

// ── OpenAI gpt-image-1 ───────────────────────────────────────────────────────

/**
 * gpt-image-1: currently NO hard ceiling, so every request is refused.
 *
 * OpenAI bills gpt-image-1 by TOKENS: text (and, for edits, image) input tokens
 * plus image output tokens that depend on `quality` × `size`. Omnira's price
 * book has one flat `gpt_image_usd_per_image` figure, which prices one
 * quality/size tier and none of the input tokens; requests do not pin
 * `quality`. That figure is a proxy for a different billing unit. Making this
 * boundable needs canonical per-(quality, size) output prices plus a proven
 * input-token bound — a reviewed price-book change, not a guess here.
 */
export function gptImageCeiling(count: number, params: Record<string, unknown>, rates: RateSnapshot): Ceiling {
  void count; void params; void rates
  return refuse('gpt-image-1 bills text/image tokens by quality and size; the flat per-image price-book '
    + 'entry is a proxy for one tier, not a hard ceiling for this request')
}
