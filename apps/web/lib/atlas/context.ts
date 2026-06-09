/**
 * Atlas Context Brain.
 *
 * Assembles ONE unified, live snapshot of the whole operation from the existing
 * Omnira tables. This is the single source Atlas reasons over — for the Home
 * greeting (Phase 1) and the conversational layer (Phase 2).
 *
 * Every query is defensive: if a table/column differs or is empty, that slice
 * degrades to zero rather than breaking the page. Read-only.
 */

import { profileFor } from './identity'
import { resolveDestination, type DestinationId } from '@/lib/nav/registry'

type AnyDb = any

/** Resolve a registry href once, server-side. Single source of truth for routes. */
function navHref(id: DestinationId, opts?: { project?: string; filters?: Record<string, string> }): string {
  return resolveDestination(id, opts)?.href ?? '/atlas'
}

export interface BusinessSnapshot {
  id: string
  name: string
  slug: string
  color: string
  focus: string
  principle: string
  revenueMonthSek: number
  costMonthSek: number
  qualifiedLeads: number
  publishedThisWeek: number
  pendingReview: number
}

export interface DecisionContext {
  key: string
  text: string
  source: string
  updatedAt: string
}

export interface AtlasContext {
  generatedAt: string
  totals: {
    costTodaySek: number
    costWeekSek: number
    costMonthSek: number
    forecastMonthSek: number
    revenueMonthSek: number
    pendingApprovals: number
    failedRuns24h: number
  }
  byProvider: { provider: string; sek: number }[]
  businesses: BusinessSnapshot[]
  /** The single highest-leverage thing to do right now. */
  topPriority: { label: string; href: string } | null
  /** Recorded operator decisions Atlas must honor (D1). Reuses the memories table. */
  decisions: DecisionContext[]
}

function num(v: unknown): number { return Number(v ?? 0) || 0 }

// ── D1: operator decisions ────────────────────────────────────────────────────
// Atlas honors recorded decisions. Reuses `memories`; only the operator-authored
// sources below. `dream` + `competitor_intelligence` are excluded by construction.
const DECISION_SOURCES = ['operator', 'incident-verification']
const MAX_DECISIONS = 12
const DECISION_MAX_CHARS = 200

type DecisionRow = { key: string; value: string; source: string; updated_at: string }

/**
 * Pure selection: keep the latest row per `key` (supersession-by-key), newest
 * first, capped + truncated. Exported so it is unit-testable without a DB.
 */
export function selectActiveDecisions(rows: DecisionRow[]): DecisionContext[] {
  const latestByKey = new Map<string, DecisionRow>()
  for (const r of rows ?? []) {
    if (!r?.key || !r?.value) continue
    const prev = latestByKey.get(r.key)
    if (!prev || new Date(r.updated_at) > new Date(prev.updated_at)) latestByKey.set(r.key, r)
  }
  return [...latestByKey.values()]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, MAX_DECISIONS)
    .map(r => ({
      key: r.key,
      text: r.value.length > DECISION_MAX_CHARS ? r.value.slice(0, DECISION_MAX_CHARS) + '…' : r.value,
      source: r.source,
      updatedAt: r.updated_at,
    }))
}

export async function gatherAtlasContext(db: AnyDb): Promise<AtlasContext> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart  = new Date(now.getTime() - 7 * 864e5)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const safe = async <T>(p: Promise<{ data: T | null }>, fallback: T): Promise<T> => {
    try { const { data } = await p; return (data ?? fallback) } catch { return fallback }
  }

  // ── Projects (businesses) ──────────────────────────────────────────────────
  const projects = await safe<any[]>(
    db.from('projects').select('id, name, slug, color'), [],
  )

  // ── Cost events this month (today/week/month + per-project + per-provider) ──
  const costRows = await safe<any[]>(
    db.from('cost_events')
      .select('project_id, provider, cost_sek, created_at')
      .gte('created_at', monthStart.toISOString()),
    [],
  )
  let costToday = 0, costWeek = 0, costMonth = 0
  const costByProject = new Map<string, number>()
  const costByProvider = new Map<string, number>()
  for (const r of costRows) {
    const sek = num(r.cost_sek)
    const t = new Date(r.created_at)
    costMonth += sek
    if (t >= weekStart) costWeek += sek
    if (t >= todayStart) costToday += sek
    if (r.project_id) costByProject.set(r.project_id, (costByProject.get(r.project_id) ?? 0) + sek)
    costByProvider.set(r.provider, (costByProvider.get(r.provider) ?? 0) + sek)
  }
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const forecastMonth = dayOfMonth > 0 ? (costMonth / dayOfMonth) * daysInMonth : 0

  // ── Revenue this month, per project ────────────────────────────────────────
  const revRows = await safe<any[]>(
    db.from('revenue_events').select('project_id, amount_sek, occurred_at').gte('occurred_at', monthStart.toISOString()),
    [],
  )
  let revenueMonth = 0
  const revByProject = new Map<string, number>()
  for (const r of revRows) {
    const sek = num(r.amount_sek)
    revenueMonth += sek
    if (r.project_id) revByProject.set(r.project_id, (revByProject.get(r.project_id) ?? 0) + sek)
  }

  // ── Leads (qualified) per project ──────────────────────────────────────────
  const leadRows = await safe<any[]>(
    db.from('leads').select('project_id, status'), [],
  )
  const qualifiedByProject = new Map<string, number>()
  for (const l of leadRows) {
    if (['new', 'qualified', 'warm'].includes(String(l.status))) {
      if (l.project_id) qualifiedByProject.set(l.project_id, (qualifiedByProject.get(l.project_id) ?? 0) + 1)
    }
  }

  // ── Media scripts: published this week + pending review, per project ───────
  const scriptRows = await safe<any[]>(
    db.from('media_scripts').select('project_id, status, published_at').gte('generated_at', weekStart.toISOString()),
    [],
  )
  const publishedByProject = new Map<string, number>()
  const reviewByProject = new Map<string, number>()
  for (const s of scriptRows) {
    if (String(s.status) === 'published' && s.published_at) {
      if (s.project_id) publishedByProject.set(s.project_id, (publishedByProject.get(s.project_id) ?? 0) + 1)
    }
    if (['pending_review', 'needs_review'].includes(String(s.status))) {
      if (s.project_id) reviewByProject.set(s.project_id, (reviewByProject.get(s.project_id) ?? 0) + 1)
    }
  }

  // ── Platform: pending approvals + failed runs (24h) ────────────────────────
  const pendingApprovalsRows = await safe<any[]>(
    db.from('approvals').select('id').eq('status', 'pending'), [],
  )
  const pendingApprovals = pendingApprovalsRows.length

  const failedRunsRows = await safe<any[]>(
    db.from('runs').select('id').eq('status', 'failed').gte('created_at', new Date(now.getTime() - 864e5).toISOString()),
    [],
  )
  const failedRuns24h = failedRunsRows.length

  // ── Operator decisions (D1) ────────────────────────────────────────────────
  const decisionRows = await safe<DecisionRow[]>(
    db.from('memories')
      .select('key, value, source, updated_at')
      .in('source', DECISION_SOURCES)
      .order('updated_at', { ascending: false }),
    [],
  )
  const decisions = selectActiveDecisions(decisionRows)

  // ── Assemble per-business snapshots ────────────────────────────────────────
  const businesses: BusinessSnapshot[] = projects.map(p => {
    const prof = profileFor(p.slug, p.name)
    return {
      id: p.id, name: p.name, slug: p.slug, color: p.color || '#71717a',
      focus: prof.focus, principle: prof.principle,
      revenueMonthSek: revByProject.get(p.id) ?? 0,
      costMonthSek: costByProject.get(p.id) ?? 0,
      qualifiedLeads: qualifiedByProject.get(p.id) ?? 0,
      publishedThisWeek: publishedByProject.get(p.id) ?? 0,
      pendingReview: reviewByProject.get(p.id) ?? 0,
    }
  }).sort((a, b) => b.costMonthSek - a.costMonthSek)

  // ── Highest-leverage action ────────────────────────────────────────────────
  let topPriority: AtlasContext['topPriority'] = null
  const totalReview = pendingApprovals + businesses.reduce((s, b) => s + b.pendingReview, 0)
  if (totalReview > 0) {
    topPriority = { label: `Granska ${totalReview} väntande godkännande${totalReview === 1 ? '' : 'n'}`, href: navHref('approvals', { filters: { state: 'pending' } }) }
  } else if (failedRuns24h > 0) {
    topPriority = { label: `${failedRuns24h} körning${failedRuns24h === 1 ? '' : 'ar'} har fallerat — undersök`, href: navHref('activity', { filters: { status: 'failed' } }) }
  } else {
    const topLeads = businesses.find(b => b.qualifiedLeads > 0)
    if (topLeads) topPriority = { label: `${topLeads.qualifiedLeads} leads i ${topLeads.name} väntar`, href: navHref('revenue') }
  }

  return {
    generatedAt: now.toISOString(),
    totals: {
      costTodaySek: costToday, costWeekSek: costWeek, costMonthSek: costMonth,
      forecastMonthSek: forecastMonth, revenueMonthSek: revenueMonth,
      pendingApprovals: totalReview, failedRuns24h,
    },
    byProvider: [...costByProvider.entries()].map(([provider, sek]) => ({ provider, sek })).sort((a, b) => b.sek - a.sek),
    businesses,
    topPriority,
    decisions,
  }
}
