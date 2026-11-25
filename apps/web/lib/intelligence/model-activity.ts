/**
 * Cost-event evidence for the existing Intelligence Graph.
 *
 * cost_events is the per-API-call source. Agents' configured models are NOT
 * execution evidence, and a run_id only proves attribution when that run
 * belongs to the same authorized project.
 *
 * This reader never invokes an AI model, changes a workflow or estimates a bill.
 */
import { scopeToProjects } from '@/lib/atlas/isolation'

// A bounded, paginated read. A daily graph may have more than one Supabase page.
const MAX_COST_ROWS = 5000
const PAGE_SIZE = 500

export type ModelActivityState = 'complete' | 'partial' | 'unavailable'

export interface ModelActivityRow {
  projectId: string
  provider: string
  model: string | null
  calls: number
  costSek: number
  lastSeen: string
  /** Only run ids present in this authenticated, time-scoped graph. */
  runIds: string[]
}

export interface RunModelActivityRow {
  runId: string
  projectId: string
  provider: string
  model: string | null
  calls: number
  costSek: number
  lastSeen: string
}

export interface ModelActivitySnapshot {
  state: ModelActivityState
  source: 'cost_events'
  periodHours: number
  /** Number of validated records read, not a promise of complete provider billing. */
  recordedCalls: number
  /** Records without a verified link to a run in the currently displayed graph. */
  unlinkedCalls: number
  /** Cost represented by validated records; when partial, this is NOT a total. */
  observedCostSek: number | null
  byModel: ModelActivityRow[]
  /** Per-run amounts: never derive these from project-level model totals. */
  byRun: RunModelActivityRow[]
}

type CostEvent = {
  project_id?: unknown
  run_id?: unknown
  provider?: unknown
  model?: unknown
  cost_sek?: unknown
  created_at?: unknown
  metadata?: unknown
}

const rounded = (value: number) => Math.round(value * 10000) / 10000

export function modelActivityUnavailable(periodHours: number): ModelActivitySnapshot {
  return {
    state: 'unavailable',
    source: 'cost_events',
    periodHours,
    recordedCalls: 0,
    unlinkedCalls: 0,
    observedCostSek: null,
    byModel: [],
    byRun: [],
  }
}

export function summarizeModelActivity(
  raw: readonly CostEvent[],
  authorizedProjects: readonly string[],
  runs: readonly { id: string; project_id: string }[],
  periodHours: number,
  now: Date,
  capped = false,
): ModelActivitySnapshot {
  const projects = new Set(authorizedProjects)
  const scopedRuns = new Map(runs
    .filter(run => projects.has(run.project_id))
    .map(run => [run.id, run.project_id]))
  const from = now.getTime() - periodHours * 3600_000
  const to = now.getTime()
  const aggregated = new Map<string, ModelActivityRow>()
  const byRun = new Map<string, RunModelActivityRow>()
  let recordedCalls = 0
  let unlinkedCalls = 0
  let observedCostSek = 0
  let invalid = 0

  for (const row of raw.slice(0, MAX_COST_ROWS)) {
    // Attribution-only rows describe the producer of an existing paid call;
    // they are NOT another provider call and must not inflate call counts.
    if (row.metadata && typeof row.metadata === 'object' &&
        (row.metadata as Record<string, unknown>).attribution_only === true) continue
    // The database query is scoped already, but this check is a separate
    // fail-closed boundary for a broken adapter or malformed database row.
    if (typeof row.project_id !== 'string' || !projects.has(row.project_id)) {
      invalid++
      continue
    }
    const timestamp = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN
    const cost = typeof row.cost_sek === 'number' || (
      typeof row.cost_sek === 'string' && row.cost_sek.trim() !== ''
    ) ? Number(row.cost_sek) : NaN
    if (!Number.isFinite(timestamp) || timestamp < from || timestamp > to ||
      !Number.isFinite(cost) || typeof row.provider !== 'string' || !row.provider.trim()) {
      invalid++
      continue
    }
    const provider = row.provider.trim().slice(0, 120)
    // NULL model is honest: neither configured agent.model nor provider name
    // can prove which model was actually invoked.
    const model = typeof row.model === 'string' && row.model.trim()
      ? row.model.trim().slice(0, 180) : null
    const matchedRun = typeof row.run_id === 'string' &&
      scopedRuns.get(row.run_id) === row.project_id ? row.run_id : null
    const key = JSON.stringify([row.project_id, provider, model])
    const previous = aggregated.get(key) ?? {
      projectId: row.project_id,
      provider, model, calls: 0, costSek: 0,
      lastSeen: row.created_at as string,
      runIds: [],
    }
    previous.calls++
    previous.costSek = rounded(previous.costSek + cost)
    if ((row.created_at as string) > previous.lastSeen) previous.lastSeen = row.created_at as string
    if (matchedRun && !previous.runIds.includes(matchedRun)) previous.runIds.push(matchedRun)
    if (matchedRun) {
      const runKey = JSON.stringify([matchedRun, provider, model])
      const previousRun = byRun.get(runKey) ?? {
        runId: matchedRun, projectId: row.project_id, provider, model,
        calls: 0, costSek: 0, lastSeen: row.created_at as string,
      }
      previousRun.calls++
      previousRun.costSek = rounded(previousRun.costSek + cost)
      if ((row.created_at as string) > previousRun.lastSeen) previousRun.lastSeen = row.created_at as string
      byRun.set(runKey, previousRun)
    } else unlinkedCalls++
    observedCostSek += cost
    recordedCalls++
    aggregated.set(key, previous)
  }

  return {
    state: capped || raw.length > MAX_COST_ROWS || invalid > 0 ? 'partial' : 'complete',
    source: 'cost_events',
    periodHours,
    recordedCalls,
    unlinkedCalls,
    observedCostSek: rounded(observedCostSek),
    byModel: [...aggregated.values()]
      .sort((a, b) => b.costSek - a.costSek || b.calls - a.calls ||
        a.provider.localeCompare(b.provider) || (a.model ?? '').localeCompare(b.model ?? '')),
    byRun: [...byRun.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
  }
}

export async function readModelActivity(
  db: any,
  projectIds: readonly string[],
  runs: readonly { id: string; project_id: string }[],
  periodHours: number,
  now: Date = new Date(),
): Promise<ModelActivitySnapshot> {
  if (projectIds.length === 0) {
    return summarizeModelActivity([], [], [], periodHours, now)
  }
  const since = new Date(now.getTime() - periodHours * 3600_000).toISOString()
  const before = now.toISOString()
  const collected: CostEvent[] = []
  try {
    // Stable ordering by created_at plus id. The upper timestamp boundary
    // prevents new events from shifting offset pages while this read runs.
    while (collected.length < MAX_COST_ROWS + 1) {
      const limit = Math.min(PAGE_SIZE, MAX_COST_ROWS + 1 - collected.length)
      const offset = collected.length
      const query = scopeToProjects(
        db.from('cost_events').select('id,project_id,run_id,provider,model,cost_sek,created_at,metadata'),
        [...projectIds],
      ).gte('created_at', since)
        .lte('created_at', before)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1)
      const response = await query
      if (response.error || !Array.isArray(response.data)) {
        if (collected.length === 0) return modelActivityUnavailable(periodHours)
        return summarizeModelActivity(collected, projectIds, runs, periodHours, now, true)
      }
      collected.push(...response.data)
      if (response.data.length < limit) break
    }
    return summarizeModelActivity(
      collected, projectIds, runs, periodHours, now, collected.length > MAX_COST_ROWS,
    )
  } catch {
    if (collected.length > 0) return summarizeModelActivity(collected, projectIds, runs, periodHours, now, true)
    return modelActivityUnavailable(periodHours)
  }
}
