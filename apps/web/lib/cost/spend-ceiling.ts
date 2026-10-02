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
 * M0: a hard ceiling quantized UP to the ledger scale — the smallest 4-decimal
 * amount that is ≥ the derived ceiling.
 *
 * Postgres rounds a value written to `numeric(12,4)` to NEAREST, so an unquantized
 * ceiling can be stored BELOW itself (production, Atlas TTS 18 chars: 0.002835 →
 * 0.0028), and the held amount would no longer cover every permitted outcome.
 *
 * Float-safe by construction: `Math.ceil(sek * 10^4)` alone is not, because the
 * product can land on either side of an integer (600 TTS chars compute to
 * 0.09449999999999999). The candidate is therefore corrected in both directions
 * against an exact comparison, `k / 10^4 >= sek` — an IEEE division of two exact
 * integers is the correctly rounded double of the decimal `k / 10^4`, and that
 * double serializes back to exactly that decimal. The result is never below the
 * input; at most it is one 0.0001 SEK quantum above it.
 *
 * Non-finite and negative inputs are returned unchanged for the caller's
 * validation to refuse.
 */
export function ceilToLedgerScale(sek: number): number {
  if (!Number.isFinite(sek) || sek <= 0) return sek
  let k = Math.ceil(sek * LEDGER_QUANTA)
  while (k > 0 && (k - 1) / LEDGER_QUANTA >= sek) k -= 1
  while (k / LEDGER_QUANTA < sek) k += 1
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
