/**
 * Small, conservative command gate for the two existing read-only Handlarbörsen
 * sources. Never use client view or the model's guessed project as authorization.
 */
export type HandlarborsenReadIntent = 'handlarborsen_latest_mail' | 'handlarborsen_statistics' | null

const HB = /handlarb[oö]rs(?:en|ens|[-\s]?b[oö]rsen)?|info@handlarborsen\.se/i
const MAIL = /strato|inkorg|mejl|mail|e-post|meddeland(?:e|et)/i
const MAIL_READ = /senaste?|l[aä]s|\bse\b|f[aå]tt|kommit|tillg[aå]ng|vad st[aå]r|vilket|vilka|kolla|granska|\bhar vi\b/i
const STATS = /statistik|verifierad|registrerad|handlar(?:e|na)|fordon|bud|aff[aä]r|tillv[aä]xt|rekryter|r[aä]ckvidd|n[aå] ut/i
const STATS_READ = /visa|l[aä]s|kolla|analys|hur|m[aå]nga|finns|senast|status|j[aä]mf[oö]r|kan du|ser du|unders[oö]k|vad/i

export function classifyHandlarborsenReadIntent(last: unknown, previousUserMessages: readonly string[] = []): HandlarborsenReadIntent {
  if (typeof last !== 'string' || !last.trim()) return null
  const text = last.normalize('NFC').toLowerCase()
  // Only the last 2 user turns may supply the project context, and only if the
  // current request is unambiguously a read of mail or business metrics.
  const recent = previousUserMessages.slice(-2).some(message => HB.test(message))
  const ownerContext = HB.test(text) || recent
  if (!ownerContext) return null
  if (MAIL.test(text) && MAIL_READ.test(text)) return 'handlarborsen_latest_mail'
  if (STATS.test(text) && STATS_READ.test(text)) return 'handlarborsen_statistics'
  return null
}
