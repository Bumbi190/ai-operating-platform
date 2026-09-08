/**
 * lib/os/data.ts
 *
 * Server-side data adapters for the Omnira OS dashboard.
 *
 * Goal: every piece of operational telemetry on the dashboard is grounded in
 * a real Supabase row, never illustrative defaults. Where a table is empty
 * we return clearly-typed null/empty values so the UI can show real empty
 * states instead of fake data.
 *
 * Tables consumed:
 *   projects, agents, workflows, runs, run_logs, outputs, memories,
 *   approvals, media_news_items, media_scripts.
 *
 * Everything runs as parallel Promise.allSettled so a failing query never
 * blocks the whole page.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import type {
  Project, Agent, Workflow, Run, RunLog, Memory, RunStatus, WorkflowStep,
} from '@/lib/supabase/types'

// ─── Snapshot types ──────────────────────────────────────────────────────────

export interface DashboardSnapshot {
  projects:           Project[]
  agents:             Agent[]
  workflows:          Workflow[]
  recentRuns:         RunWithJoins[]
  pendingApprovals:   number
  memoriesCount:      number
  metrics: {
    totalRuns:           number
    doneRuns:            number
    failedRuns:          number
    runningRuns:         number
    executionsLast24h:   number
    successRate:         number   // 0–100
    failRate:            number   // 0–100
    systemHealth:        number   // 0–100, derived
    avgDurationSec:      number | null
    tokensLast24h:       number
    decisionsAutonomous: number
  }
}

export interface RunWithJoins extends Run {
  workflows?: { id: string; name: string } | null
  projects?: { id: string; name: string; slug: string; color: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(res: PromiseSettledResult<{ data: T | null }>, fallback: T): T {
  if (res.status !== 'fulfilled') return fallback
  return (res.value.data ?? fallback) as T
}

function pickCount(res: PromiseSettledResult<{ count: number | null }>): number {
  if (res.status !== 'fulfilled') return 0
  return res.value.count ?? 0
}

// ─── fetchDashboardSnapshot · the single hot path for the dashboard ─────────

export async function fetchDashboardSnapshot(
  supabase: SupabaseClient,
  /**
   * Service-role client. It bypasses RLS, which is exactly why every query
   * below is scoped by hand: a service role must never broaden what the
   * signed-in operator is allowed to read.
   */
  admin: SupabaseClient,
  /**
   * The operator's projects, ALREADY RESOLVED by the caller through
   * `getAllowedProjectIds` / `resolveProjectAccess`. Required, not optional —
   * an optional scope is one forgotten argument away from being global again,
   * and this function has no session of its own to fall back on.
   */
  allowedProjectIds: string[],
): Promise<DashboardSnapshot> {
  const since24hISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  // Never an empty `.in()`: an empty allow-list becomes an impossible project
  // id, so a scope-less operator sees zero rows rather than every row.
  const scopedIds = scopeProjectFilter(allowedProjectIds)

  const [
    projectsRes,
    agentsRes,
    workflowsRes,
    recentRunsRes,
    totalRunsRes,
    doneRunsRes,
    failedRunsRes,
    runningRunsRes,
    pendingApprovalsRes,
    last24hRunsRes,
    memoriesCountRes,
    tokensRes,
    avgDurationRes,
  ] = await Promise.allSettled([
    // Real entities
    supabase
      .from('projects')
      // Every column, because this is typed `Project = Row<'projects'>`. The
      // stale generated types described a 7-column projects table, so a partial
      // select silently satisfied the full Row type; regenerating them after G3A
      // exposed that execution_paused / paused_at / paused_reason / atlas_mode
      // were declared here while always arriving undefined at runtime.
      // Single literal string: PostgREST infers the row type from the select
      // text itself, so concatenating it collapses the result to an error type.
      .select('id, owner_id, name, slug, color, settings, created_at, execution_paused, paused_at, paused_reason, atlas_mode')
      // RLS already limits this client to owned projects; scoping by id as well
      // keeps ONE rule true of every query here — each carries a scope clause —
      // so a missing one is visible rather than a judgement call.
      .in('id', scopedIds)
      .order('created_at', { ascending: true }),

    admin
      .from('agents')
      .select('id, project_id, name, description, system_prompt, model, skill_ids, config, created_at')
      .in('project_id', scopedIds)
      .order('created_at', { ascending: true }),

    admin
      .from('workflows')
      .select('id, project_id, name, description, steps, trigger, cron_expr, active, created_at, side_effect_class')
      .in('project_id', scopedIds)
      .order('created_at', { ascending: true }),

    // Recent runs (with joins for the UI rows)
    (admin.from('runs') as any)
      .select('id, workflow_id, project_id, status, input, context, error, started_at, finished_at, created_at, workflows(id, name), projects(id, name, slug, color)')
      .in('project_id', scopedIds)
      .order('created_at', { ascending: false })
      .limit(10),

    // Counts
    (admin.from('runs') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds),
    (admin.from('runs') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds).eq('status', 'done'),
    (admin.from('runs') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds).eq('status', 'failed'),
    (admin.from('runs') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds).eq('status', 'running'),
    // `approvals.project_id` is NULLABLE. `.in()` does not match NULL, so an
    // approval with no project is EXCLUDED rather than counted globally — the
    // same fail-closed choice the operations graph makes for the same column.
    (admin.from('approvals') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds).eq('status', 'pending'),

    // Activity window
    (admin.from('runs') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds).gte('created_at', since24hISO),

    // Memory presence
    (admin.from('memories') as any).select('id', { count: 'exact', head: true }).in('project_id', scopedIds),

    // Token aggregate (last 24h)
    // `run_logs` has NO project_id — its only link is `run_id NOT NULL
    // REFERENCES runs(id)` — so the scope travels through an INNER join on the
    // parent run. `!inner` is what makes the embedded filter restrict the outer
    // rows instead of merely nulling the embed. Verified against the live
    // database: an impossible project id returns zero rows, not every row.
    (admin.from('run_logs') as any)
      .select('tokens_in, tokens_out, duration_ms, runs!inner(project_id)')
      .in('runs.project_id', scopedIds)
      .gte('created_at', since24hISO),

    // Average duration of completed runs (last 24h)
    (admin.from('runs') as any)
      .select('started_at, finished_at')
      .in('project_id', scopedIds)
      .eq('status', 'done')
      .gte('created_at', since24hISO)
      .not('started_at', 'is', null)
      .not('finished_at', 'is', null),
  ])

  const projects   = pick(projectsRes,  [] as Project[])
  const agents     = pick(agentsRes,    [] as Agent[])
  const workflows  = pick(workflowsRes, [] as Workflow[])
  const recentRuns = pick(recentRunsRes, [] as RunWithJoins[])

  const totalRuns        = pickCount(totalRunsRes)
  const doneRuns         = pickCount(doneRunsRes)
  const failedRuns       = pickCount(failedRunsRes)
  const runningRuns      = pickCount(runningRunsRes)
  const pendingApprovals = pickCount(pendingApprovalsRes)
  const executionsLast24h= pickCount(last24hRunsRes)
  const memoriesCount    = pickCount(memoriesCountRes)

  const successRate = totalRuns > 0 ? Math.round((doneRuns / totalRuns) * 100) : 0
  const failRate    = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0
  const systemHealth = Math.max(0, 100 - failRate * 2)

  // Tokens / avg duration aggregated client-side over the small last-24h slice.
  const tokensRows = tokensRes.status === 'fulfilled'
    ? ((tokensRes.value as any).data ?? []) as { tokens_in: number | null; tokens_out: number | null; duration_ms: number | null }[]
    : []
  const tokensLast24h = tokensRows.reduce((acc, r) => acc + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0)

  const durationRows = avgDurationRes.status === 'fulfilled'
    ? ((avgDurationRes.value as any).data ?? []) as { started_at: string; finished_at: string }[]
    : []
  let avgDurationSec: number | null = null
  if (durationRows.length > 0) {
    const total = durationRows.reduce((acc, r) => {
      const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
      return acc + Math.max(0, ms)
    }, 0)
    avgDurationSec = Math.round(total / durationRows.length / 1000)
  }

  return {
    projects,
    agents,
    workflows,
    recentRuns,
    pendingApprovals,
    memoriesCount,
    metrics: {
      totalRuns,
      doneRuns,
      failedRuns,
      runningRuns,
      executionsLast24h,
      successRate,
      failRate,
      systemHealth,
      avgDurationSec,
      tokensLast24h,
      decisionsAutonomous: doneRuns + failedRuns,
    },
  }
}

// ─── Active execution · the most recent running run, fully expanded ──────────

export interface ActiveExecution {
  run: RunWithJoins
  workflow: Workflow | null
  logs: RunLog[]
  /** the most recent assistant log per step — for reasoning surfacing */
  latestReasoningByStep: Record<number, RunLog | undefined>
  /** convenience: agents indexed by id (joined separately so the route is fast) */
  agentsById: Record<string, Agent>
}

export async function fetchActiveExecution(
  admin: SupabaseClient,
): Promise<ActiveExecution | null> {
  // 1. Find the most recent running run.
  const { data: running, error: rErr } = await (admin.from('runs') as any)
    .select('id, workflow_id, project_id, status, input, context, error, started_at, finished_at, created_at, workflows(id, project_id, name, description, steps, trigger, cron_expr, active, created_at), projects(id, name, slug, color)')
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rErr || !running) {
    // Fallback to most recent completed/failed run so we always have *something* to visualize
    const { data: latest } = await (admin.from('runs') as any)
      .select('id, workflow_id, project_id, status, input, context, error, started_at, finished_at, created_at, workflows(id, project_id, name, description, steps, trigger, cron_expr, active, created_at), projects(id, name, slug, color)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return null
    return hydrateExecution(admin, latest)
  }

  return hydrateExecution(admin, running)
}

async function hydrateExecution(admin: SupabaseClient, run: any): Promise<ActiveExecution> {
  const workflow = (Array.isArray(run.workflows) ? run.workflows[0] : run.workflows) ?? null

  const [logsRes, agentsRes] = await Promise.allSettled([
    (admin.from('run_logs') as any)
      .select('id, run_id, step_order, step_name, role, content, tokens_in, tokens_out, duration_ms, created_at')
      .eq('run_id', run.id)
      .order('created_at', { ascending: true }),

    workflow?.steps?.length
      ? (admin.from('agents') as any)
          .select('id, project_id, name, description, system_prompt, model, skill_ids, config, created_at')
          .in('id', (workflow.steps as WorkflowStep[]).map(s => s.agent_id).filter(Boolean))
      : Promise.resolve({ data: [] }),
  ])

  const logs    = logsRes.status    === 'fulfilled' ? ((logsRes.value as any).data ?? []) : []
  const agents  = agentsRes.status  === 'fulfilled' ? ((agentsRes.value as any).data ?? []) : []

  const agentsById: Record<string, Agent> = {}
  for (const a of agents) agentsById[a.id] = a

  // Latest assistant log per step — that's the "current reasoning"
  const latestReasoningByStep: Record<number, RunLog | undefined> = {}
  for (const log of logs as RunLog[]) {
    if (log.step_order == null) continue
    if (log.role !== 'assistant') continue
    const existing = latestReasoningByStep[log.step_order]
    if (!existing || new Date(log.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestReasoningByStep[log.step_order] = log
    }
  }

  return { run, workflow, logs, latestReasoningByStep, agentsById }
}

// ─── Memory snapshot · what's in long-term knowledge right now ───────────────

export interface MemorySnapshot {
  total:    number
  recent:   Memory[]      // up to 24 newest
  bySource: Record<string, number>
}

export async function fetchMemorySnapshot(admin: SupabaseClient): Promise<MemorySnapshot> {
  const [recentRes, allCountRes] = await Promise.allSettled([
    (admin.from('memories') as any)
      .select('id, project_id, key, value, source, updated_at')
      .order('updated_at', { ascending: false })
      .limit(24),
    (admin.from('memories') as any).select('id', { count: 'exact', head: true }),
  ])

  const recent: Memory[] = recentRes.status === 'fulfilled' ? ((recentRes.value as any).data ?? []) : []
  const total = allCountRes.status === 'fulfilled' ? ((allCountRes.value as any).count ?? 0) : 0

  const bySource: Record<string, number> = {}
  for (const m of recent) {
    const s = m.source ?? 'uncategorized'
    bySource[s] = (bySource[s] ?? 0) + 1
  }

  return { total, recent, bySource }
}

// ─── Publish pipeline · real distribution timeline ───────────────────────────

export interface PublishRow {
  id:           string
  project_id:   string | null
  hook:         string | null
  script:       string | null
  voice_status: string | null
  video_status: string | null
  status:       string | null         // 'pending_review' | 'approved' | 'rejected' | 'published'
  audio_url:    string | null
  video_url:    string | null
  duration_ms:  number | null
  generated_at: string
  reviewed_at:  string | null
  published_at: string | null
  /** joined project for color/name */
  projects?: { name: string; slug: string; color: string } | null
}

export async function fetchPublishPipeline(admin: SupabaseClient): Promise<PublishRow[]> {
  const { data } = await (admin.from('media_scripts') as any)
    .select('id, project_id, hook, script, voice_status, video_status, status, audio_url, video_url, duration_ms, generated_at, reviewed_at, published_at, projects:projects(name, slug, color)')
    .order('generated_at', { ascending: false })
    .limit(12)

  return (data ?? []) as PublishRow[]
}

// ─── Status helpers ──────────────────────────────────────────────────────────

export function classifyRunStatus(s: RunStatus): {
  tier: 'live' | 'passive' | 'archived' | 'critical'
  label: string
} {
  switch (s) {
    case 'running':           return { tier: 'live',     label: 'Executing' }
    case 'pending':           return { tier: 'passive',  label: 'Pending' }
    case 'awaiting_approval': return { tier: 'passive',  label: 'Väntar godkännande' }
    case 'done':              return { tier: 'archived', label: 'Complete' }
    case 'cancelled':         return { tier: 'archived', label: 'Avbruten' }
    case 'failed':            return { tier: 'critical', label: 'Failed' }
    case 'rejected':          return { tier: 'critical', label: 'Avvisad' }
    // Defensive default: any future/unknown status degrades gracefully.
    default:                  return { tier: 'passive',  label: 'Okänd' }
  }
}
