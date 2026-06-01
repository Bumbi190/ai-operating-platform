/**
 * lib/os/briefing.ts
 *
 * Executive Briefing Engine (V3, Feature 1).
 *
 * Förvandlar verksamhetssnapshots till en chief-of-staff-briefing: hälsning,
 * prioritetsordnade rader (🔴🟡🟢), en rekommenderad åtgärd med uppskattad tid,
 * och topp-prioriteringar — allt drivet av AI Priority Engine + Health Score
 * och grundat i riktig data.
 */

import type { BusinessSnapshot, HeroSummary } from './business'
import { businessHealth } from './health'
import { buildAttentionItems, topAttention, formatEta, type AttentionItem, type GlobalSignals } from './priority'

export type LineStatus = 'ok' | 'attention' | 'idle'
export type Dot = 'red' | 'amber' | 'green'

export interface BriefingLine {
  status:   LineStatus
  dot:      Dot
  business: string
  slug:     string
  color:    string
  message:  string
  health:   number
}

export interface ExecutiveBriefing {
  greeting:        string
  operatorName:    string
  dateLabel:       string
  headline:        string
  lines:           BriefingLine[]
  priorities:      AttentionItem[]      // topp-3 att agera på
  recommended?:    AttentionItem        // den enskilt viktigaste åtgärden
  recommendedEta?: string               // "~4 minuter"
  attentionCount:  number
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
  signals: GlobalSignals = {},
  now: Date = new Date(),
): ExecutiveBriefing {
  const { hour, dateLabel } = stockholmParts(now)
  const greeting = greetingFor(hour)

  const lines: BriefingLine[] = businesses.map((b): BriefingLine => {
    const health = businessHealth(b).score
    if (b.pendingApprovals > 0 || b.failedRuns > 0) {
      const bits: string[] = []
      if (b.pendingApprovals > 0) bits.push(`${b.pendingApprovals} väntar på godkännande`)
      if (b.failedRuns > 0) bits.push(`${b.failedRuns} körning${b.failedRuns === 1 ? '' : 'ar'} att titta på`)
      return { status: 'attention', dot: b.failedRuns > 0 ? 'red' : 'amber', business: b.name, slug: b.slug, color: b.color, message: bits.join(' · '), health }
    }
    const summary = topMetricSummary(b)
    if (summary) {
      return { status: 'ok', dot: 'green', business: b.name, slug: b.slug, color: b.color, message: `${summary} denna månad`, health }
    }
    return { status: 'idle', dot: 'amber', business: b.name, slug: b.slug, color: b.color, message: 'vilande — ingen aktivitet än', health }
  })

  // Sortera: problem först (röd), sedan väntande/vilande (gul), sist klart (grön)
  const rank: Record<Dot, number> = { red: 0, amber: 1, green: 2 }
  lines.sort((a, b) => rank[a.dot] - rank[b.dot] || a.health - b.health)

  // Priority engine
  const attentionItems = buildAttentionItems(businesses, signals)
  const priorities = topAttention(attentionItems, 3)
  const recommended = priorities.find(p => p.action) ?? priorities[0]
  const recommendedEta = recommended?.etaMin ? formatEta(recommended.etaMin) : undefined

  const attentionCount = lines.filter(l => l.status === 'attention').length

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
    greeting, operatorName, dateLabel, headline,
    lines, priorities, recommended, recommendedEta,
    attentionCount, revenueTodaySek: hero.revenueTodaySek,
  }
}
