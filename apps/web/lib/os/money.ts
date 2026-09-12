/**
 * Pengar — the operator's financial surface.
 *
 * WHAT THIS ANSWERS, and out of which source:
 *   what has cost money       → `cost_events`, Omnira's per-call cost ledger
 *   which project             → `cost_events.project_id`, owned rows only
 *   when                      → `cost_events.created_at`, inside the gate's own calendar month
 *   which provider / service  → `cost_events.provider`, as the ledger recorded it
 *   what the limits are       → `budget_headroom`, the function the gate decides on
 *   whether limits are enforced → `executionSafetyFlags().spend_gate`, the runtime's predicate
 *   what needs attention      → stored conditions only: an exhausted scope, a
 *                               project without a budget, recorded advisory
 *                               overrides, fallback-priced rows, unreadable sources
 *
 * WHAT IT REFUSES TO ANSWER: revenue amounts, profit, margin, ROI, forecasts,
 * growth, savings, shares of spend. See `money-shared.ts` for why each one is
 * absent rather than approximated.
 *
 * ISOLATION. `cost_events` and every budget function are SERVICE-ROLE ONLY —
 * Phase 9AB revoked them from `authenticated` after proving anon could read the
 * platform-level rows. So this read cannot be RLS-bound the way Aktivitet is;
 * it keeps the boundary the legacy page already had: `resolveProjectAccess()`
 * on the session, `scopeProjectFilter` inside every query, and a second filter
 * in the assembler so a regression in one layer cannot move a total.
 *
 *   · `budget_headroom` returns EVERY project. Rows are kept only for owned
 *     projects and only for PROJECT scopes. A global scope's `spent` is summed
 *     across all projects, so showing it here would put other projects' spend
 *     on this page.
 *   · Null-project cost rows are platform-level and are never shown.
 *   · `?project=<slug>` only ever removes ids; a slug the session does not own
 *     narrows to nothing, never to everything.
 *
 * Nothing here writes, reserves, settles, releases or re-prices anything.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { executionSafetyFlags } from '@/lib/ai/execution-flags'
import { MODEL_PRICING } from '@/lib/ai/pricing'
import { ATLAS_HOME_TIMEZONE } from '@/lib/atlas/utilities/time'
// The one DST-correct "first of the month, 00:00 Europe/Stockholm" in the
// codebase. Reused rather than restated: a second implementation is how two
// windows that should be the same month quietly stop being one.
import { computeReleaseInstant } from '@/lib/workflows/adapters/familje-stunden/instant'
import { destinationBasePath } from '@/lib/nav/registry'
import {
  MONEY_LIMITS,
  PROJECT_BUDGET_SCOPES,
  isProjectBudgetScope,
  type EnforcementState,
  type ProjectBudgetScope,
  type SectionState,
} from '@/lib/os/money-shared'

// ─────────────────────────────────────────────────────────────────────────────
// The window
// ─────────────────────────────────────────────────────────────────────────────

export interface MoneyWindow {
  /** `YYYY-MM` in Europe/Stockholm. */
  monthKey: string
  /** Inclusive lower bound, ISO UTC. */
  startUtc: string
  /** Exclusive upper bound, ISO UTC — the gate bounds its windows the same way. */
  endUtc: string
}

/**
 * The Stockholm calendar month containing `now`, as the gate computes it:
 * `date_trunc('month', now() at time zone 'Europe/Stockholm')` and the start of
 * the next month, both converted back to UTC. Each edge is derived on its own
 * calendar date, never by adding a month to the other.
 */
export function stockholmMonthWindow(now: Date): MoneyWindow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATLAS_HOME_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
  const monthKey = key(year, month)
  const nextKey = month === 12 ? key(year + 1, 1) : key(year, month + 1)
  return {
    monthKey,
    startUtc: computeReleaseInstant(monthKey).utc,
    endUtc: computeReleaseInstant(nextKey).utc,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The model
// ─────────────────────────────────────────────────────────────────────────────

export type MoneySource = 'projects' | 'costs' | 'budgets' | 'revenue' | 'leads' | 'overrides'

export interface MoneyProject {
  id: string
  name: string | null
  slug: string | null
  color: string | null
  href: string | null
}

/** One configured project scope, exactly as `budget_headroom` reported it. */
export interface BudgetScopeFigure {
  scope: ProjectBudgetScope
  limitSek: number
  spentSek: number
  heldSek: number
  remainingSek: number
  /** The same rule the execution-safety surface uses: nothing left. */
  exhausted: boolean
}

export interface ProjectBudget {
  project: MoneyProject
  scopes: BudgetScopeFigure[]
  exhausted: boolean
}

export interface CostLine {
  key: string
  /** Null when the ledger recorded nothing to name it by. */
  label: string | null
  sek: number
  rows: number
  project: MoneyProject | null
}

export interface CostEntry {
  at: string | null
  project: MoneyProject | null
  provider: string | null
  model: string | null
  agent: string | null
  operation: string | null
  unitType: string | null
  units: number | null
  sek: number | null
  /** Priced by `getModelPricing`'s fallback — provider and amount are not reliable. */
  pricingFallback: boolean
}

export interface OverrideEntry {
  at: string | null
  project: MoneyProject | null
  provider: string | null
  operation: string | null
  reason: string | null
  estimatedSek: number | null
}

export type AttentionItem =
  | { kind: 'budget_exhausted'; project: MoneyProject; scope: ProjectBudgetScope; remainingSek: number }
  | { kind: 'project_without_budget'; project: MoneyProject }
  | { kind: 'advisory_overrides'; count: number }
  | { kind: 'pricing_fallback'; rows: number }
  | { kind: 'global_ceiling_missing' }
  | { kind: 'source_unreadable'; source: MoneySource }

export interface MoneyModel {
  /** `error` only when neither the ledger nor the gate could be read. */
  state: SectionState
  sources: Record<MoneySource, SectionState>
  enforcement: EnforcementState
  window: MoneyWindow
  cost: {
    /** Null when the ledger could not be read — never 0 for "unknown". */
    totalSek: number | null
    rows: number
    /** The read reached its cap, so the total is a floor rather than the total. */
    truncated: boolean
    byProvider: CostLine[]
    byProject: CostLine[]
    byAgent: CostLine[]
    fallbackRows: number
    recent: CostEntry[]
  }
  /** How many revenue events exist. Amounts are deliberately not read. */
  revenue: { events: number | null }
  leads: { total: number | null; withValue: number | null }
  budgets: ProjectBudget[]
  /** Owned projects the gate has no project budget for. Empty when that is unknown. */
  unbudgeted: MoneyProject[]
  /**
   * Whether the three platform ceilings the gate requires exist. Without all of
   * them it refuses EVERY project (`no_global_budget_configured`). Presence only —
   * a global scope's figures are summed across every project and never kept.
   */
  globalCeilings: 'configured' | 'missing' | 'unknown'
  overrides: { count: number | null; recent: OverrideEntry[] }
  attention: AttentionItem[]
  projectSlug: string | null
  limits: typeof MONEY_LIMITS
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure assembly
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembleMoneyInput {
  /** The owned — and, when narrowed, narrowed — project ids. Everything is re-filtered by it. */
  scopeIds: string[]
  projects: { ok: boolean; rows: any[] }
  costs: { ok: boolean; rows: any[] }
  headroom: { ok: boolean; rows: any[] }
  revenue: { ok: boolean; count: number | null }
  leads: { ok: boolean; total: number | null; withValue: number | null }
  overrides: { ok: boolean; rows: any[]; count: number | null }
  enforced: boolean
  window: MoneyWindow
  projectSlug: string | null
}

/** The platform ceilings the gate requires — all three, or it refuses every project. */
const GLOBAL_SCOPES: readonly string[] = ['global_daily', 'global_weekly', 'global_monthly']

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * A token row whose model is not in Omnira's price table was priced by
 * `getModelPricing`'s fallback: Sonnet rates, provider `anthropic`. Own
 * properties only — `'constructor' in MODEL_PRICING` is true and is not a price.
 * Character and image rows are priced from `cost_rates`, not this table, and a
 * row with no model cannot be judged, so neither is flagged.
 */
export function isPricingFallback(row: any): boolean {
  if (text(row?.unit_type) !== 'tokens') return false
  const model = text(row?.model)
  if (!model) return false
  return !Object.prototype.hasOwnProperty.call(MODEL_PRICING, model)
}

function projectHref(slug: string | null): string | null {
  const base = destinationBasePath('project_home')
  return base && slug ? `${base}/${slug}` : null
}

const byAtDesc = (a: { at: string | null }, b: { at: string | null }) => {
  if (!a.at && !b.at) return 0
  if (!a.at) return 1
  if (!b.at) return -1
  return a.at < b.at ? 1 : a.at > b.at ? -1 : 0
}

const bySekDesc = (a: CostLine, b: CostLine) =>
  b.sek - a.sek || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

export function assembleMoney(input: AssembleMoneyInput): MoneyModel {
  const owned = new Set(input.scopeIds)
  const sources: Record<MoneySource, SectionState> = {
    projects: input.projects.ok ? 'ok' : 'error',
    costs: input.costs.ok ? 'ok' : 'error',
    budgets: input.headroom.ok ? 'ok' : 'error',
    revenue: input.revenue.ok ? 'ok' : 'error',
    leads: input.leads.ok ? 'ok' : 'error',
    overrides: input.overrides.ok ? 'ok' : 'error',
  }

  const projectById = new Map<string, MoneyProject>()
  if (input.projects.ok) {
    for (const row of input.projects.rows ?? []) {
      const id = text(row?.id)
      if (!id || !owned.has(id)) continue
      const slug = text(row?.slug)
      projectById.set(id, { id, name: text(row?.name), slug, color: text(row?.color), href: projectHref(slug) })
    }
  }
  const projectOf = (id: string | null, fallbackSlug: string | null = null): MoneyProject | null => {
    if (!id) return null
    return projectById.get(id) ?? { id, name: null, slug: fallbackSlug, color: null, href: projectHref(fallbackSlug) }
  }

  // ── The ledger ──────────────────────────────────────────────────────────
  const costRows = input.costs.ok
    ? (input.costs.rows ?? []).filter((r) => {
        const pid = text(r?.project_id)
        return pid !== null && owned.has(pid)
      })
    : []

  const group = (keyOf: (r: any) => string, labelOf: (r: any) => string | null, withProject: boolean) => {
    const lines = new Map<string, CostLine>()
    for (const r of costRows) {
      const key = keyOf(r)
      const line = lines.get(key) ?? {
        key,
        label: labelOf(r),
        sek: 0,
        rows: 0,
        project: withProject ? projectOf(text(r?.project_id)) : null,
      }
      line.sek += num(r?.cost_sek) ?? 0
      line.rows += 1
      lines.set(key, line)
    }
    return [...lines.values()].sort(bySekDesc)
  }

  const entries: CostEntry[] = costRows
    .map((r) => ({
      at: text(r?.created_at),
      project: projectOf(text(r?.project_id)),
      provider: text(r?.provider),
      model: text(r?.model),
      agent: text(r?.agent),
      operation: text(r?.operation),
      unitType: text(r?.unit_type),
      units: num(r?.units),
      sek: num(r?.cost_sek),
      pricingFallback: isPricingFallback(r),
    }))
    .sort(byAtDesc)

  const fallbackRows = entries.filter((e) => e.pricingFallback).length

  const cost: MoneyModel['cost'] = {
    totalSek: input.costs.ok ? costRows.reduce((s, r) => s + (num(r?.cost_sek) ?? 0), 0) : null,
    rows: costRows.length,
    truncated: input.costs.ok && (input.costs.rows ?? []).length >= MONEY_LIMITS.costRows,
    byProvider: group((r) => text(r?.provider) ?? '', (r) => text(r?.provider), false),
    byProject: group((r) => text(r?.project_id) ?? '', () => null, true),
    byAgent: group(
      (r) => text(r?.agent) ?? text(r?.operation) ?? '',
      (r) => text(r?.agent) ?? text(r?.operation),
      false,
    ),
    fallbackRows,
    recent: entries.slice(0, MONEY_LIMITS.recentRows),
  }

  // ── The gate's own figures, passed through ──────────────────────────────
  const scopesByProject = new Map<string, { slug: string | null; scopes: BudgetScopeFigure[] }>()
  const monthlySeen = new Set<string>()
  const globalSeen = new Set<string>()
  if (input.headroom.ok) {
    for (const row of input.headroom.rows ?? []) {
      const pid = text(row?.project_id)
      if (!pid || !owned.has(pid)) continue
      // Presence only: a global scope's figures cover every project and are never kept.
      if (GLOBAL_SCOPES.includes(row?.scope)) { globalSeen.add(row.scope); continue }
      if (!isProjectBudgetScope(row?.scope)) continue
      // The gate's "has a budget" is `monthly_sek is not null` — exactly when this row exists.
      if (row.scope === 'project_monthly') monthlySeen.add(pid)
      const limitSek = num(row?.limit_sek)
      const spentSek = num(row?.spent_sek)
      const heldSek = num(row?.held_sek)
      const remainingSek = num(row?.remaining_sek)
      // A figure the gate did not report is not invented as zero.
      if (limitSek === null || spentSek === null || heldSek === null || remainingSek === null) continue
      const entry = scopesByProject.get(pid) ?? { slug: text(row?.slug), scopes: [] }
      entry.scopes.push({ scope: row.scope, limitSek, spentSek, heldSek, remainingSek, exhausted: remainingSek <= 0 })
      scopesByProject.set(pid, entry)
    }
  }

  const budgets: ProjectBudget[] = [...scopesByProject.entries()]
    .map(([pid, { slug, scopes }]) => {
      const ordered = [...scopes].sort(
        (a, b) => PROJECT_BUDGET_SCOPES.indexOf(a.scope) - PROJECT_BUDGET_SCOPES.indexOf(b.scope),
      )
      return { project: projectOf(pid, slug)!, scopes: ordered, exhausted: ordered.some((s) => s.exhausted) }
    })
    .sort((a, b) => (a.project.name ?? a.project.slug ?? '').localeCompare(b.project.name ?? b.project.slug ?? '', 'sv'))

  // Only claimable when BOTH the projects and the gate were read. Keyed on the
  // gate's own predicate: a project with daily or weekly limits but no monthly
  // one is still refused as `no_budget_configured`.
  const unbudgeted: MoneyProject[] =
    input.headroom.ok && input.projects.ok
      ? [...projectById.values()].filter((p) => !monthlySeen.has(p.id))
      : []

  // `no_global_budget_configured` refuses every project unless all three
  // platform ceilings exist. Judged only from owned projects' rows, and only
  // when both reads succeeded — otherwise it is unknown, never "configured".
  const globalCeilings: MoneyModel['globalCeilings'] =
    !input.headroom.ok || !input.projects.ok || projectById.size === 0
      ? 'unknown'
      : GLOBAL_SCOPES.every((s) => globalSeen.has(s)) ? 'configured' : 'missing'

  // ── Overrides ───────────────────────────────────────────────────────────
  const overrideRows = input.overrides.ok
    ? (input.overrides.rows ?? []).filter((r) => {
        const pid = text(r?.project_id)
        return pid !== null && owned.has(pid)
      })
    : []
  const overrides: MoneyModel['overrides'] = input.overrides.ok
    ? {
        count: input.overrides.count ?? overrideRows.length,
        recent: overrideRows
          .map((r) => ({
            at: text(r?.created_at),
            project: projectOf(text(r?.project_id)),
            provider: text(r?.provider),
            operation: text(r?.operation),
            reason: text(r?.reason),
            estimatedSek: num(r?.estimated_sek),
          }))
          .sort(byAtDesc)
          .slice(0, MONEY_LIMITS.overrides),
      }
    : { count: null, recent: [] }

  // ── Attention — stored conditions only ──────────────────────────────────
  const attention: AttentionItem[] = []
  for (const b of budgets) {
    for (const s of b.scopes) {
      if (s.exhausted) attention.push({ kind: 'budget_exhausted', project: b.project, scope: s.scope, remainingSek: s.remainingSek })
    }
  }
  for (const p of unbudgeted) attention.push({ kind: 'project_without_budget', project: p })
  if (globalCeilings === 'missing') attention.push({ kind: 'global_ceiling_missing' })
  if (overrides.count !== null && overrides.count > 0) attention.push({ kind: 'advisory_overrides', count: overrides.count })
  if (fallbackRows > 0) attention.push({ kind: 'pricing_fallback', rows: fallbackRows })
  for (const source of Object.keys(sources) as MoneySource[]) {
    if (sources[source] === 'error') attention.push({ kind: 'source_unreadable', source })
  }

  return {
    state: sources.costs === 'error' && sources.budgets === 'error' ? 'error' : 'ok',
    sources,
    enforcement: input.enforced ? 'enforced' : 'advisory',
    window: input.window,
    cost,
    revenue: { events: input.revenue.ok ? input.revenue.count : null },
    leads: input.leads.ok
      ? { total: input.leads.total, withValue: input.leads.withValue }
      : { total: null, withValue: null },
    budgets,
    unbudgeted,
    globalCeilings,
    overrides,
    attention,
    projectSlug: input.projectSlug,
    limits: MONEY_LIMITS,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The read
// ─────────────────────────────────────────────────────────────────────────────

const COST_SELECT = 'project_id, provider, model, agent, operation, unit_type, units, cost_sek, created_at'

/** The staleness the gate and the execution-safety surface both use. */
const STALE_MINUTES = 30

/** A read that never throws: an error is a state, not an exception. */
async function read(query: unknown): Promise<{ ok: boolean; data: any[]; count: number | null }> {
  try {
    const res = (await query) as { data?: unknown; error?: unknown; count?: unknown } | null
    if (!res || res.error) return { ok: false, data: [], count: null }
    return {
      ok: true,
      data: Array.isArray(res.data) ? res.data : [],
      count: typeof res.count === 'number' ? res.count : null,
    }
  } catch {
    return { ok: false, data: [], count: null }
  }
}

/**
 * Loads the surface for the signed-in session. Returns null when the scope
 * cannot be resolved — a redirect, never a page of zeroes that reads like a
 * platform that spent nothing.
 */
export async function loadMoney(
  { projectSlug, now }: { projectSlug?: string | null; now?: Date } = {},
): Promise<MoneyModel | null> {
  const access = await resolveProjectAccess()
  if (!access.ok) return null

  const slug = text(projectSlug)
  const db = createAdminClient() as any
  const owned = scopeProjectFilter(access.allowedProjectIds)
  const window = stockholmMonthWindow(now ?? new Date())
  const enforced = executionSafetyFlags().spend_gate

  const projects = await read(
    db.from('projects').select('id, name, slug, color').in('id', owned).order('name'),
  )

  // Narrowing only ever removes ids.
  let scope = owned
  if (slug) {
    const match = projects.data.find((p) => text(p?.slug) === slug && owned.includes(p?.id))
    scope = scopeProjectFilter(match ? [match.id] : [])
  }

  const [costs, headroom, revenue, leadsTotal, leadsValued, overrides] = await Promise.all([
    read(
      db.from('cost_events')
        .select(COST_SELECT)
        .in('project_id', scope)
        .gte('created_at', window.startUtc)
        .lt('created_at', window.endUtc)
        .order('created_at', { ascending: false })
        .limit(MONEY_LIMITS.costRows),
    ),
    // Returns every project; `assembleMoney` keeps owned PROJECT scopes only.
    read(db.rpc('budget_headroom', { p_stale_minutes: STALE_MINUTES })),
    read(db.from('revenue_events').select('id', { count: 'exact', head: true }).in('project_id', scope)),
    read(db.from('leads').select('id', { count: 'exact', head: true }).in('project_id', scope)),
    read(
      db.from('leads').select('id', { count: 'exact', head: true })
        .in('project_id', scope).not('value_sek', 'is', null),
    ),
    read(
      db.from('spend_advisory_overrides')
        .select('*', { count: 'exact' })
        .in('project_id', scope)
        .order('created_at', { ascending: false })
        .limit(MONEY_LIMITS.overrides),
    ),
  ])

  return assembleMoney({
    scopeIds: scope,
    projects: { ok: projects.ok, rows: projects.data },
    costs: { ok: costs.ok, rows: costs.data },
    headroom: { ok: headroom.ok, rows: headroom.data },
    revenue: { ok: revenue.ok, count: revenue.count },
    leads: {
      ok: leadsTotal.ok && leadsValued.ok,
      total: leadsTotal.count,
      withValue: leadsValued.count,
    },
    overrides: { ok: overrides.ok, rows: overrides.data, count: overrides.count },
    enforced,
    window,
    projectSlug: slug,
  })
}
