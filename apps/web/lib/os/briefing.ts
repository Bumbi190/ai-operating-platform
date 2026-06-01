/**
 * lib/os/briefing.ts
 *
 * Executive Briefing-generator. Förvandlar de råa verksamhetssnapshotsen
 * (lib/os/business.ts) till en chief-of-staff-briefing på människospråk —
 * hälsning, en rad per verksamhet, prioriteringar och en kort lägesmening.
 *
 * Allt är grundat i riktig data. Ingen rad hittas på. En tom verksamhet får
 * ärligt "vilande", inte påhittade siffror.
 */

import type { BusinessSnapshot, HeroSummary } from './business'

export type LineStatus = 'ok' | 'attention' | 'idle'

export interface BriefingLine {
  status:   LineStatus
  business: string
  slug:     string
  color:    string
  message:  string
}

export interface Priority {
  label: string
  detail: string
  href:  string
  tone:  'critical' | 'warn'
}

export interface ExecutiveBriefing {
  greeting:       string   // "God morgon"
  operatorName:   string   // "Andre"
  dateLabel:      string   // "måndag 1 juni"
  headline:       string   // en mening som sammanfattar dagen
  lines:          BriefingLine[]
  priorities:     Priority[]
  attentionCount: number
  revenueTodaySek: number
}

// ─── Hjälpare ───────────────────────────────────────────────────────────────

function stockholmParts(now: Date): { hour: number; dateLabel: string } {
  const hourStr = new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm' }).format(now)
  const dateLabel = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }).format(now)
  return { hour: parseInt(hourStr, 10) || 0, dateLabel }
}

function greetingFor(hour: number): string {
  if (hour < 5)  return 'God natt'
  if (hour < 10) return 'God morgon'
  if (hour < 18) return 'God eftermiddag'
  return 'God kväll'
}

/** Bästa gissning på operatörens tilltalsnamn utifrån namn eller e-post. */
export function deriveOperatorName(fullName?: string | null, email?: string | null): string {
  if (fullName && fullName.trim()) return fullName.trim().split(/\s+/)[0]
  if (email) {
    const local = email.split('@')[0].replace(/[0-9._-]+/g, ' ').trim()
    if (local) {
      const first = local.split(/\s+/)[0]
      return first.charAt(0).toUpperCase() + first.slice(1)
    }
  }
  return 'där'
}

function topMetricSummary(b: BusinessSnapshot): string | null {
  if (b.metrics.length === 0) return null
  // Plocka de 1–2 mest talande mätvärdena
  const parts = b.metrics.slice(0, 2).map(m => {
    if (m.kind === 'currency') {
      const v = m.value >= 1000 ? `${(m.value / 1000).toFixed(1).replace('.', ',')}k kr` : `${m.value} kr`
      return `${v} i intäkter`
    }
    return `${m.value} ${m.label.toLowerCase()}`
  })
  return parts.join(' · ')
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function buildExecutiveBriefing(
  businesses: BusinessSnapshot[],
  hero: HeroSummary,
  operatorName: string,
  now: Date = new Date(),
): ExecutiveBriefing {
  const { hour, dateLabel } = stockholmParts(now)
  const greeting = greetingFor(hour)

  const lines: BriefingLine[] = businesses.map((b): BriefingLine => {
    if (b.pendingApprovals > 0 || b.failedRuns > 0) {
      const bits: string[] = []
      if (b.pendingApprovals > 0) bits.push(`${b.pendingApprovals} väntar på godkännande`)
      if (b.failedRuns > 0) bits.push(`${b.failedRuns} körning${b.failedRuns === 1 ? '' : 'ar'} att titta på`)
      return { status: 'attention', business: b.name, slug: b.slug, color: b.color, message: bits.join(' · ') }
    }
    const summary = topMetricSummary(b)
    if (summary) {
      return { status: 'ok', business: b.name, slug: b.slug, color: b.color, message: `${summary} denna månad` }
    }
    return { status: 'idle', business: b.name, slug: b.slug, color: b.color, message: 'vilande — ingen aktivitet än' }
  })

  // Prioriteringar — verkliga, åtgärdsbara
  const priorities: Priority[] = []
  for (const b of businesses) {
    if (b.failedRuns > 0) {
      priorities.push({
        label: `${b.name}: ${b.failedRuns} fel att åtgärda`,
        detail: 'En eller flera körningar misslyckades den senaste veckan.',
        href: '/system',
        tone: 'critical',
      })
    }
  }
  for (const b of businesses) {
    if (b.pendingApprovals > 0) {
      priorities.push({
        label: `${b.name}: ${b.pendingApprovals} att granska`,
        detail: 'Innehåll väntar på ditt godkännande innan det går vidare.',
        href: '/approvals',
        tone: 'warn',
      })
    }
  }

  const attentionCount = lines.filter(l => l.status === 'attention').length

  // Lägesmening
  let headline: string
  if (attentionCount === 0) {
    headline = hero.activeBusinesses > 0
      ? 'Allt rullar på. Inget kräver din uppmärksamhet just nu.'
      : 'Lugnt just nu — inga verksamheter är aktiva ännu.'
  } else {
    const names = lines.filter(l => l.status === 'attention').map(l => l.business)
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} och ${names.at(-1)}`
    headline = `${attentionCount} ${attentionCount === 1 ? 'sak' : 'saker'} behöver dig idag — ${list}.`
  }

  return {
    greeting,
    operatorName,
    dateLabel,
    headline,
    lines,
    priorities,
    attentionCount,
    revenueTodaySek: hero.revenueTodaySek,
  }
}
