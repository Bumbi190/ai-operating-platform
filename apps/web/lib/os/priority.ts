/**
 * lib/os/priority.ts
 *
 * AI Priority Engine — Feature 2 (V3).
 *
 * Varje operativ signal får en poäng. Poängen avgör ordning i briefingen,
 * vad assistenten lyfter, och vad som hamnar i Action Center. Allt härleds ur
 * riktiga tillstånd (BusinessSnapshot + ett fåtal globala signaler).
 *
 * Poängskala (riktvärden):
 *   Intäktsproblem        100
 *   Misslyckad automation  90
 *   Väntande godkännande   60
 *   Vilande verksamhet     40
 *   Saknad mätdata (IG)    35
 *   Nyligen publicerat     20
 *   Allt friskt             5
 */

import type { BusinessSnapshot } from './business'
import { resolveDestination, type DestinationId } from '@/lib/nav/registry'

// Single source of truth for routes — every attention-item action resolves its
// href through the navigation registry (never a hard-coded path).
function navHref(
  id: DestinationId,
  opts: { project?: string; filters?: Record<string, string> } = {},
  fallback = '/atlas',
): string {
  return resolveDestination(id, opts)?.href ?? fallback
}

export type Severity = 'urgent' | 'important' | 'info'

export interface AttentionItem {
  id:        string
  score:     number
  severity:  Severity
  title:     string
  reason:    string
  business?: string
  color?:    string
  /** uppskattad tid att åtgärda, i minuter */
  etaMin?:   number
  action?:   { label: string; href: string }
  /** agentisk åtgärd — utförs på plats istället för att navigera */
  agentic?:  { endpoint: string; body?: Record<string, unknown>; label: string }
}

export interface GlobalSignals {
  /** publicerade inlägg finns men inga insights → token saknar behörighet */
  instagramInsightsMissing?: boolean
}

function severityFor(score: number): Severity {
  if (score >= 80) return 'urgent'
  if (score >= 45) return 'important'
  return 'info'
}

export function buildAttentionItems(
  businesses: BusinessSnapshot[],
  signals: GlobalSignals = {},
): AttentionItem[] {
  const items: AttentionItem[] = []
  const DAY = 24 * 60 * 60 * 1000

  for (const b of businesses) {
    // Misslyckad automation — 90
    if (b.failedRuns > 0) {
      items.push({
        id: `fail-${b.id}`, score: 90, severity: 'urgent',
        title: `${b.name}: ${b.failedRuns} ${b.failedRuns === 1 ? 'körning' : 'körningar'} misslyckades`,
        reason: 'Automation stannade. Jag kan starta om den från steget som kraschade.',
        business: b.name, color: b.color, etaMin: b.failedRuns * 5,
        action: { label: 'Visa logg', href: navHref('activity', { project: b.slug, filters: { status: 'failed' } }) },
        agentic: { endpoint: '/api/actions/resume-failed', body: { project_id: b.id }, label: 'Åtgärda automatiskt' },
      })
    }
    // Väntande godkännande — 60
    if (b.pendingApprovals > 0) {
      const days = b.pendingApprovals  // proxy; visas som "väntar"
      items.push({
        id: `appr-${b.id}`, score: 60 + Math.min(15, b.pendingApprovals * 3), severity: 'important',
        title: `${b.name}: ${b.pendingApprovals} ${b.pendingApprovals === 1 ? 'objekt väntar' : 'objekt väntar'} på godkännande`,
        reason: 'Innehåll är blockerat tills du granskar det — nedströmssteg står stilla.',
        business: b.name, color: b.color, etaMin: Math.max(2, b.pendingApprovals * 2),
        action: { label: 'Granska', href: navHref('approvals', { project: b.slug, filters: { state: 'pending' } }) },
      })
      void days
    }
    // Vilande verksamhet — 40
    const lastMs = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
    const staleDays = lastMs ? Math.floor((Date.now() - lastMs) / DAY) : null
    if (b.status === 'idle' || (b.runs7d === 0 && (staleDays === null || staleDays > 7))) {
      items.push({
        id: `idle-${b.id}`, score: 40, severity: 'important',
        title: `${b.name}: inaktiv${staleDays != null ? ` i ${staleDays} dagar` : ' — ingen aktivitet än'}`,
        reason: 'Verksamheten producerar inget värde just nu. Starta ett arbetsflöde eller fyll på data.',
        business: b.name, color: b.color, etaMin: 10,
        action: { label: 'Öppna', href: navHref('project_home', { project: b.slug }) },
      })
    }
    // Nyligen publicerat — 20 (positiv info)
    if (b.latestPublication?.at) {
      const pubDays = Math.floor((Date.now() - new Date(b.latestPublication.at).getTime()) / DAY)
      if (pubDays <= 2) {
        items.push({
          id: `pub-${b.id}`, score: 20, severity: 'info',
          title: `${b.name}: publicerade nyligen`,
          reason: `"${b.latestPublication.title.slice(0, 60)}" gick ut ${pubDays === 0 ? 'idag' : `för ${pubDays} dagar sedan`}.`,
          business: b.name, color: b.color,
        })
      }
    }
  }

  // Saknad Instagram-mätdata — 35 (global)
  if (signals.instagramInsightsMissing) {
    items.push({
      id: 'ig-insights', score: 35, severity: 'important',
      title: 'Instagram-engagemang saknas',
      reason: 'Inlägg publiceras men ingen räckvidd/engagemang läses in — tokenet saknar insights-behörighet.',
      etaMin: 5,
      action: { label: 'Fixa nu', href: navHref('settings') },
    })
  }

  // Allt friskt — 5 (visas bara om inget annat finns)
  if (items.length === 0) {
    items.push({
      id: 'all-clear', score: 5, severity: 'info',
      title: 'Allt rullar på',
      reason: 'Inga fel, inga väntande godkännanden och alla aktiva verksamheter mår bra.',
    })
  }

  return items.sort((a, b) => b.score - a.score)
}

/** Topp-N saker som kräver uppmärksamhet (utesluter ren positiv info om möjligt). */
export function topAttention(items: AttentionItem[], n = 3): AttentionItem[] {
  const actionable = items.filter(i => i.severity !== 'info')
  const base = actionable.length > 0 ? actionable : items
  return base.slice(0, n)
}

/** Snäll formatering av total uppskattad tid. */
export function formatEta(minutes: number): string {
  if (minutes <= 1) return '~1 minut'
  if (minutes < 60) return `~${minutes} minuter`
  const h = Math.round(minutes / 60)
  return `~${h} ${h === 1 ? 'timme' : 'timmar'}`
}
