/**
 * lib/os/business.ts
 *
 * Verksamhetscentrerade dataadaptrar för Omnira Command Center.
 *
 * Filosofin från lib/os/data.ts gäller även här: varje siffra är grundad i
 * en riktig Supabase-rad. Saknas data visar vi 0 / tomt tillstånd — aldrig
 * påhittade värden. Allt körs som parallella, fail-safe queries.
 *
 * Adaptrarna är PROJEKT-DRIVNA, inte hårdkodade: vi renderar exakt de
 * verksamheter som finns i `projects`, med de mätvärden som faktiskt har en
 * datakälla. Lägg till ett projekt → det dyker upp som ett kort automatiskt.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Project } from '@/lib/supabase/types'

// ─── Typer ────────────────────────────────────────────────────────────────────

export type BusinessStatus = 'active' | 'attention' | 'idle'

export interface BusinessMetric {
  label: string
  value: number
  /** formateringshint för UI */
  kind?: 'count' | 'currency'
}

export interface BusinessSnapshot {
  id:     string
  name:   string
  slug:   string
  color:  string
  status: BusinessStatus
  /** "denna månad"-mätvärden, redan filtrerade till value-relevanta rader */
  metrics: BusinessMetric[]
  /** saker som väntar på operatören för just denna verksamhet */
  pendingApprovals: number
  failedRuns:       number
  /** senaste intäkt (livstid) — för sortering / kontext */
  revenueMonthSek:  number
}

export interface HeroSummary {
  totalBusinesses:  number
  activeBusinesses: number
  revenueTodaySek:  number
  revenueMonthSek:  number
  pendingApprovals: number
  activeWorkflows:  number
  runningRuns:      number
}

export interface PendingApprovalDetail {
  id:            string
  output_key:    string
  created_at:    string
  run_id:        string | null
  workflow_name: string | null
  project_name:  string | null
  project_color: string | null
  project_slug:  string | null
}

export interface FailedRunDetail {
  id:            string
  workflow_name: string | null
  project_name:  string | null
  project_slug:  string | null
  project_color: string | null
  failed_at:     string | null
}

// ─── Hjälpare ───────────────────────────────────────────────────────────────

function startOfMonthISO(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}
function startOfTodayISO(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}
function rows<T>(res: PromiseSettledResult<{ data: T[] | null }>): T[] {
  return res.status === 'fulfilled' ? ((res.value as any).data ?? []) : []
}

// ─── Verksamhetssnapshots · ett kort per projekt ───────────────────────────

export async function fetchBusinessSnapshots(
  admin: SupabaseClient,
  projects: Project[],
): Promise<BusinessSnapshot[]> {
  if (projects.length === 0) return []

  const monthISO = startOfMonthISO()

  const [
    outputsRes, scriptsRes, newsRes, runsRes, approvalsRes,
    leadsRes, revenueRes, campaignsRes,
  ] = await Promise.allSettled([
    (admin.from('outputs') as any)
      .select('project_id, type, created_at').gte('created_at', monthISO),
    (admin.from('media_scripts') as any)
      .select('project_id, status, video_status, published_at, generated_at').gte('generated_at', monthISO),
    (admin.from('media_news_items') as any)
      .select('project_id, status, created_at').gte('created_at', monthISO),
    (admin.from('runs') as any)
      .select('project_id, status, created_at'),
    (admin.from('approvals') as any)
      .select('id, status, runs(project_id)').eq('status', 'pending'),
    (admin.from('leads') as any)
      .select('project_id, created_at').gte('created_at', monthISO),
    (admin.from('revenue_events') as any)
      .select('project_id, amount_sek, occurred_at').gte('occurred_at', monthISO),
    (admin.from('campaigns') as any)
      .select('project_id, status').eq('status', 'active'),
  ])

  const outputs   = rows<{ project_id: string; type: string; created_at: string }>(outputsRes)
  const scripts   = rows<{ project_id: string; status: string; video_status: string | null; published_at: string | null }>(scriptsRes)
  const news      = rows<{ project_id: string; status: string }>(newsRes)
  const runs      = rows<{ project_id: string; status: string; created_at: string }>(runsRes)
  const approvals = rows<{ id: string; runs: { project_id: string } | { project_id: string }[] | null }>(approvalsRes)
  const leads     = rows<{ project_id: string }>(leadsRes)
  const revenue   = rows<{ project_id: string; amount_sek: number }>(revenueRes)
  const campaigns = rows<{ project_id: string; status: string }>(campaignsRes)

  const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000

  return projects.map((p): BusinessSnapshot => {
    const pid = p.id
    const byP = <T extends { project_id: string }>(arr: T[]) => arr.filter(r => r.project_id === pid)

    const texts      = byP(outputs).filter(o => o.type === 'text').length
    const pdfs       = byP(outputs).filter(o => o.type === 'pdf').length
    const images     = byP(outputs).filter(o => o.type === 'image').length
    const published  = byP(scripts).filter(s => s.status === 'published').length
    const videos     = byP(scripts).filter(s => s.video_status === 'done').length
    const newsCount  = byP(news).length
    const leadsCount = byP(leads).length
    const activeCamp = byP(campaigns).length
    const revMonth   = byP(revenue).reduce((a, r) => a + Number(r.amount_sek ?? 0), 0)

    const since7d       = Date.now() - 7 * 24 * 60 * 60 * 1000
    const projRuns      = byP(runs)
    // Bara FÄRSKA fel räknas som "behöver uppmärksamhet" — gamla fel är historik.
    const failedRuns    = projRuns.filter(r => r.status === 'failed' && new Date(r.created_at).getTime() > since7d).length
    const recentRuns    = projRuns.filter(r => new Date(r.created_at).getTime() > since30d).length

    const pendingApprovals = approvals.filter(a => {
      const r = Array.isArray(a.runs) ? a.runs[0] : a.runs
      return r?.project_id === pid
    }).length

    // Bara mätvärden som faktiskt har innehåll — ärligt, inte fejkat
    const metrics: BusinessMetric[] = []
    if (revMonth   > 0) metrics.push({ label: 'Intäkter denna månad', value: Math.round(revMonth), kind: 'currency' })
    if (texts      > 0) metrics.push({ label: texts === 1 ? 'Berättelse' : 'Berättelser', value: texts })
    if (pdfs       > 0) metrics.push({ label: pdfs === 1 ? 'PDF genererad' : 'PDF:er genererade', value: pdfs })
    if (published  > 0) metrics.push({ label: 'Publicerade inlägg', value: published })
    if (videos     > 0) metrics.push({ label: 'Videor renderade', value: videos })
    if (newsCount  > 0) metrics.push({ label: 'Nyheter bevakade', value: newsCount })
    if (images     > 0) metrics.push({ label: 'Bilder skapade', value: images })
    if (leadsCount > 0) metrics.push({ label: 'Leads', value: leadsCount })
    if (activeCamp > 0) metrics.push({ label: 'Aktiva kampanjer', value: activeCamp })

    const status: BusinessStatus =
      (pendingApprovals > 0 || failedRuns > 0) ? 'attention' :
      (recentRuns > 0 || metrics.length > 0)   ? 'active' :
                                                  'idle'

    return {
      id: pid, name: p.name, slug: p.slug, color: p.color,
      status, metrics, pendingApprovals, failedRuns, revenueMonthSek: revMonth,
    }
  })
}

// ─── Hero-sammanfattning ──────────────────────────────────────────────────────

export async function fetchHeroSummary(
  admin: SupabaseClient,
  projects: Project[],
  businesses: BusinessSnapshot[],
): Promise<HeroSummary> {
  const todayISO = startOfTodayISO()
  const monthISO = startOfMonthISO()

  const [revTodayRes, revMonthRes, workflowsRes, runningRes] = await Promise.allSettled([
    (admin.from('revenue_events') as any).select('amount_sek').gte('occurred_at', todayISO),
    (admin.from('revenue_events') as any).select('amount_sek').gte('occurred_at', monthISO),
    (admin.from('workflows') as any).select('id', { count: 'exact', head: true }).eq('active', true),
    (admin.from('runs') as any).select('id', { count: 'exact', head: true }).eq('status', 'running'),
  ])

  const sum = (res: PromiseSettledResult<{ data: { amount_sek: number }[] | null }>) =>
    rows<{ amount_sek: number }>(res).reduce((a, r) => a + Number(r.amount_sek ?? 0), 0)

  const activeWorkflows = workflowsRes.status === 'fulfilled' ? ((workflowsRes.value as any).count ?? 0) : 0
  const runningRuns     = runningRes.status === 'fulfilled' ? ((runningRes.value as any).count ?? 0) : 0

  return {
    totalBusinesses:  projects.length,
    activeBusinesses: businesses.filter(b => b.status !== 'idle').length,
    revenueTodaySek:  sum(revTodayRes),
    revenueMonthSek:  sum(revMonthRes),
    pendingApprovals: businesses.reduce((a, b) => a + b.pendingApprovals, 0),
    activeWorkflows,
    runningRuns,
  }
}

// ─── Godkännanden (detaljerade, för banner) ───────────────────────────────────

export async function fetchPendingApprovalsDetailed(
  admin: SupabaseClient,
): Promise<PendingApprovalDetail[]> {
  const { data } = await (admin.from('approvals') as any)
    .select('id, output_key, created_at, run_id, runs(id, workflows(name), projects:projects(name, slug, color))')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(12)

  return ((data ?? []) as any[]).map((a) => {
    const run = Array.isArray(a.runs) ? a.runs[0] : a.runs
    const w   = run ? (Array.isArray(run.workflows) ? run.workflows[0] : run.workflows) : null
    const p   = run ? (Array.isArray(run.projects)  ? run.projects[0]  : run.projects)  : null
    return {
      id: a.id,
      output_key: a.output_key ?? 'output',
      created_at: a.created_at,
      run_id: a.run_id ?? null,
      workflow_name: w?.name ?? null,
      project_name:  p?.name ?? null,
      project_color: p?.color ?? null,
      project_slug:  p?.slug ?? null,
    }
  })
}

// ─── Misslyckade körningar (detaljerade, för banner) ──────────────────────────

export async function fetchFailedRuns(
  admin: SupabaseClient,
): Promise<FailedRunDetail[]> {
  const since7dISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await (admin.from('runs') as any)
    .select('id, status, finished_at, created_at, workflows(name), projects:projects(name, slug, color)')
    .eq('status', 'failed')
    .gte('created_at', since7dISO)
    .order('created_at', { ascending: false })
    .limit(6)

  return ((data ?? []) as any[]).map((r) => {
    const w = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const p = Array.isArray(r.projects)  ? r.projects[0]  : r.projects
    return {
      id: r.id,
      workflow_name: w?.name ?? null,
      project_name:  p?.name ?? null,
      project_slug:  p?.slug ?? null,
      project_color: p?.color ?? null,
      failed_at:     r.finished_at ?? r.created_at ?? null,
    }
  })
}
