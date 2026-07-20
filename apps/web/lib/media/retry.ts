/**
 * retry.ts — Lager A: bounded backoff runt externa anrop (Claude, ElevenLabs,
 * Ideogram, Remotion Lambda). Fångar transienta fel (429/5xx/timeout/nät) i SAMMA
 * körning så en enstaka API-blip inte släcker dagens innehåll.
 *
 * Permanenta fel (4xx utom 429 — t.ex. ogiltig input) återförsöks INTE.
 * Cross-cycle-retry (om även detta misslyckas) sköts av pipeline-retry-drainern.
 */

import { redactSecrets } from './meta-errors'

export interface RetryOpts {
  attempts?: number   // totalt antal försök (default 2 — drainern tar resten)
  baseMs?:   number   // bas för exponentiell backoff (default 800ms → 0.8s, 2.4s, ...)
  label?:    string
  /**
   * Egen permanensbedömning. Behövs för API:er som inte kodar felkoden i
   * meddelandetexten — Meta returnerar t.ex. HTTP 400 för både "ogiltig token"
   * (permanent) och "rate limit" (transient), vilket den textbaserade
   * standardheuristiken nedan omöjligt kan skilja på.
   */
  isPermanent?: (err: unknown) => boolean
}

function isPermanent(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase()
  // Klara klientfel (ej 429) = permanenta → ingen mening att återförsöka.
  return /\b(400|401|403|404|409|422)\b/.test(m) && !/\b429\b/.test(m)
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 2
  const base     = opts.baseMs ?? 800
  const permanent = opts.isPermanent ?? isPermanent
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === attempts - 1 || permanent(err)) break
      const delay = base * Math.pow(3, i) + Math.random() * 250
      // Redaktion krävs: felmeddelanden från externa API:er kan innehålla den
      // URL eller header som anropet skickades med. Ett Facebook-fel loggade
      // hela access token i klartext innan detta sattes på plats.
      const reason = redactSecrets(err instanceof Error ? err.message : String(err))
      console.warn(`[retry] ${opts.label ?? 'anrop'} försök ${i + 1}/${attempts} misslyckades: ${reason}. Väntar ${Math.round(delay)}ms.`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

/** Backoff för cross-cycle-retry (drainern): 5m, 15m, 45m … per försök. */
export function nextRetryDelayMs(attempt: number): number {
  const mins = [5, 15, 45, 120]
  return (mins[Math.min(attempt, mins.length - 1)] ?? 120) * 60_000
}
