/**
 * lib/bugs/severity.ts
 *
 * Severitets-routing (PLAN avsnitt 1). Avgör vad som är AKUT (→ direktmail)
 * och vad som bara hör hemma i panelen. Ingen LLM — rena regler.
 *
 *   🔴 critical → akut-mail + panel
 *   🟡 warning  → bara panel
 *   🟢 info     → bara panel
 *
 * Tröskeln är medvetet konservativ: ett mail ska betyda "agera nu".
 */

import type { BugSeverity } from './types'

/** Endast 'critical' mailar. Allt annat stannar i panelen. */
export function shouldEmail(severity: BugSeverity): boolean {
  return severity === 'critical'
}

/** Emoji-prefix för panel/mail-rubriker. */
export function severityIcon(severity: BugSeverity): string {
  switch (severity) {
    case 'critical': return '🔴'
    case 'warning':  return '🟡'
    default:         return '🟢'
  }
}

/**
 * Heuristik för att klassa systemfel som inte fått explicit severity.
 * Kör på fri text (felmeddelande/titel) + valfria signaler. Konservativ:
 * defaultar till 'warning' (panel), höjer bara till 'critical' vid tydliga
 * akut-mönster.
 */
const CRITICAL_PATTERNS: RegExp[] = [
  /\b(down|nere|otillg(ä|a)nglig|unreachable|timeout|timed out)\b/i,
  /\b5\d{2}\b/,                                   // 5xx
  /\b(stripe|payment|betal|checkout|payout)\b/i,  // intäktspåverkande
  /\b(auth|login|inloggning|unauthorized|forbidden|token (expired|invalid))\b/i,
  /\b(database|supabase|connection refused|ECONNREFUSED|PGRST)\b/i,
  /\bcan(no|')?t use\b|kan inte anv(ä|a)nda/i,    // användarrapport: blockerad
]

export interface SeveritySignals {
  /** Antal relaterade fel i fönstret (t.ex. misslyckade körningar). */
  occurrences?: number
  /** Tröskel för när upprepning blir akut. Default 3 (PLAN). */
  occurrenceThreshold?: number
}

export function classifySeverity(text: string, signals: SeveritySignals = {}): BugSeverity {
  const { occurrences = 1, occurrenceThreshold = 3 } = signals
  if (occurrences >= occurrenceThreshold) return 'critical'
  const haystack = text ?? ''
  if (CRITICAL_PATTERNS.some(re => re.test(haystack))) return 'critical'
  return 'warning'
}
