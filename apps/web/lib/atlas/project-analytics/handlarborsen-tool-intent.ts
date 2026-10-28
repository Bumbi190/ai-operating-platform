/**
 * Conservative command gate for project-scoped Handlarbörsen READ tools.
 * This classifier selects a read endpoint only; never use client text as
 * authorization or allow it to choose a project/table/contact/recipient.
 */
export type HandlarborsenReadIntent = 'handlarborsen_latest_mail' | 'handlarborsen_statistics' | 'handlarborsen_sales_overview' | null

const HB = /handlarb[oö]rs(?:en|ens|[-\s]?b[oö]rsen)?|info@handlarborsen\.se/i
const MAIL = /strato|inkorg|mejl|mail|e-post|meddeland(?:e|et)/i
const MAIL_READ = /senaste?|l[aä]s|\bse\b|f[aå]tt|kommit|tillg[aå]ng|vad st[aå]r|vilket|vilka|kolla|granska|\bhar vi\b/i
const SALES = /\bcrm\b|säljkontak|säljsystem|säljpipe|säljstatus|kontakthistorik|kontaktspärr|spärrade kontakter|scb[-\s]?kandidat|granskningskö|uppföljningsjobb|svarsutkast|mejlautkast|skickajobb|outreach|uppföljning av kontakter|sales.contacts|suppressed/i
const SALES_READ = /sammanfatta|sammanställ|översikt|överblick|antal|hur många|status|statistik|hur ser|siffror|kolla läget|visa.*(?:läget|status|antal|översikt|siffror)|vilka.*(?:status|antal)/i
const ACTION_START = /^(?:skriv|skicka|starta|kör|publicera|ändra|uppdatera|radera|importera|ta bort|slå på|visa inte|sök inte|kolla inte)\b/i
const STATS = /statistik|verifierad|registrerad|handlar(?:e|na)|fordon|bud|aff[aä]r|tillv[aä]xt|rekryter|r[aä]ckvidd|n[aå] ut/i
const STATS_READ = /visa|l[aä]s|kolla|analys|hur|m[aå]nga|finns|senast|status|j[aä]mf[oö]r|kan du|ser du|unders[oö]k|vad/i

export function classifyHandlarborsenReadIntent(last: unknown, previousUserMessages: readonly string[] = []): HandlarborsenReadIntent {
  if (typeof last !== 'string' || !last.trim() || last.length > 1200) return null
  const text = last.normalize('NFC').toLowerCase()
  // Only the last 2 user turns may supply the project context, and only if the
  // current request is unambiguously a read of mail or business metrics.
  const recent = previousUserMessages.slice(-2).some(message => HB.test(message))
  const ownerContext = HB.test(text) || recent
  if (!ownerContext) return null
  if (ACTION_START.test(text.trim())) return null
  // Latest-mail remains specific: generic CRM/mailbox counts must never
  // authorize access to email bodies or accidentally replace a latest-mail read.
  if (MAIL.test(text) && MAIL_READ.test(text) && /strato|senaste?|rubrik|avsändare|vad står/i.test(text)) return 'handlarborsen_latest_mail'
  if (SALES.test(text) && SALES_READ.test(text)) return 'handlarborsen_sales_overview'
  if (MAIL.test(text) && MAIL_READ.test(text)) return 'handlarborsen_latest_mail'
  if (STATS.test(text) && STATS_READ.test(text)) return 'handlarborsen_statistics'
  return null
}
