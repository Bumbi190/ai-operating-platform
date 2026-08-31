/**
 * lib/cost/rates.ts — the one price accessor.
 *
 * Extracted from `track.ts` by Governance G1. The rates were already exported
 * from there specifically so the pre-spend estimate and the after-the-fact
 * ledger could not drift apart (PR9b), and that invariant is unchanged — this is
 * still exactly one accessor, and `track.ts` re-exports it.
 *
 * What changes is the dependency direction. A provider adapter needs to PRICE a
 * call; it should not have to import the module that WRITES the ledger to do so.
 * Keeping them together meant every governed adapter pulled in `cost_events`,
 * and every existing test that partially mocked the ledger silently broke the
 * estimator.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Rate cache (5 min TTL) ──────────────────────────────────────────────────
let ratesCache: { at: number; rates: Record<string, number> } | null = null
const RATES_TTL_MS = 5 * 60 * 1000

/**
 * Per-unit prices and the USD→SEK rate, from `cost_rates` so they can be tuned
 * without a deploy.
 *
 * Never throws: an unreachable table falls back to the built-in figures rather
 * than failing a call. That is safe for a CEILING because the fallbacks are the
 * real prices — a governance decision is never made on a missing rate, only on
 * the estimate it produces.
 */
export async function getRates(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.rates
  const fallback = {
    usd_sek: 10.5,
    elevenlabs_usd_per_1k_chars: 0.24,
    ideogram_v3_usd_per_image: 0.08,
    gpt_image_usd_per_image: 0.042,
  }
  try {
    const db = createAdminClient()
    const { data } = await db.from('cost_rates').select('key, value')
    const rates: Record<string, number> = { ...fallback }
    for (const row of data ?? []) rates[row.key as string] = Number(row.value)
    ratesCache = { at: Date.now(), rates }
    return rates
  } catch {
    return fallback
  }
}
