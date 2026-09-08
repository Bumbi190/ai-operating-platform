/**
 * lib/os/agents-activity.ts
 *
 * Agent Activity Center (V4, P3) — full insyn i vad agenterna gör.
 *
 * Bygger en realtidsbild av körande agenter ur runs + run_logs + workflows:
 * nuvarande steg, framsteg, starttid, senaste åtgärd och uppskattad tid kvar.
 * Allt grundat i riktiga rader. Inga körningar → ärligt tomt tillstånd.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowStep } from '@/lib/supabase/types'
import { scopeProjectFilter } from '@/lib/atlas/isolation'

export interface RunningAgent {
  runId:        string
  workflowName: string
  projectName:  string | null
  projectColor: string | null
  currentStep:  string
  stepIndex:    number       // 1-baserat
  totalSteps:   number
  progressPct:  number
  startedAt:    string | null
  lastAction:   string | null
  etaSeconds:   number | null
}

export interface RecentRun {
  runId:        string
  workflowName: string
  projectName:  string | null
  projectColor: string | null
  status:       string
  finishedAt:   string | null
  durationSec:  number | null
}

export interface AgentActivity {
  running: RunningAgent[]
  recent:  RecentRun[]
}

function truncate(s: string | null | undefined, n = 120): string | null {
  if (!s) return null
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

/**
 * PROJECT ISOLATION.
 *
 * `allowedProjectIds` is REQUIRED and comes second so it cannot be defaulted
 * away: this helper reads through the SERVICE-ROLE client, which bypasses RLS,
 * and it has exactly one caller — the Agent Activity page — so there is no
 * global-by-design consumer whose semantics this would break.
 *
 * WHY THE SCOPE MUST PRECEDE `.limit()`, not merely filter afterwards.
 * Both reads take the newest N runs across the whole table. Without a scope
 * the limit is spent on whoever ran most recently, so an operator does not
 * just see other people's runs — their OWN runs vanish from a full slice.
 * Production makes that concrete: 947 runs belong to one project and 53 to
 * another, and the unscoped `limit(8)` slice is 100% the first project. This
 * is why post-filtering a global read would be the wrong fix; it would leave
 * the smaller tenant with an empty page.
 *
 * `scopeProjectFilter` substitutes an impossible id for an empty allow-list,
 * so an operator who owns nothing sees nothing rather than everything.
 */
export async function fetchAgentActivity(
  admin: SupabaseClient,
  allowedProjectIds: string[],
): Promise<AgentActivity> {
  const scopedIds = scopeProjectFilter(allowedProjectIds)

  const [runningRes, recentRes] = await Promise.allSettled([
    (admin.from('runs') as any)
      .select('id, status, started_at, project_id, workflows(name, steps), projects(name, color)')
      .in('project_id', scopedIds)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(10),
    (admin.from('runs') as any)
      .select('id, status, started_at, finished_at, created_at, workflows(name), projects(name, color)')
      .in('project_id', scopedIds)
      .neq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const runningRows = runningRes.status === 'fulfilled' ? ((runningRes.value as any).data ?? []) : []
  const recentRows  = recentRes.status === 'fulfilled' ? ((recentRes.value as any).data ?? []) : []

  const running: RunningAgent[] = []
  for (const r of runningRows as any[]) {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const pr = Array.isArray(r.projects) ? r.projects[0] : r.projects
    const steps = ((wf?.steps ?? []) as WorkflowStep[]).slice().sort((a, b) => a.order - b.order)
    const totalSteps = steps.length || 1

    // `run_logs` has no project_id — its only ownership link is the parent run.
    // `r.id` already came out of the scoped query above, so this fan-out is
    // owned by derivation; the transitive filter is added anyway so the query
    // is safe by construction rather than by caller discipline. If a run id
    // ever reached this helper from somewhere other than the scoped read, this
    // is the guard that would still hold. `runs!inner` is what makes the filter
    // drop rows: a plain embed would only null the embedded object.
    const { data: logs } = await (admin.from('run_logs') as any)
      .select('step_order, step_name, role, content, duration_ms, created_at, runs!inner(project_id)')
      .in('runs.project_id', scopedIds)
      .eq('run_id', r.id)
      .order('created_at', { ascending: true })

    const logRows = (logs ?? []) as any[]
    const completedOrders = new Set(logRows.filter(l => l.role === 'assistant' && l.step_order != null).map(l => l.step_order))
    const completed = completedOrders.size
    const currentStepObj = steps.find(s => !completedOrders.has(s.order)) ?? steps[steps.length - 1]
    const stepIndex = currentStepObj ? steps.findIndex(s => s.order === currentStepObj.order) + 1 : completed + 1
    const lastLog = logRows[logRows.length - 1]

    // ETA: snittduration på klara steg × återstående steg
    const durations = logRows.filter(l => l.role === 'assistant' && l.duration_ms).map(l => l.duration_ms as number)
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
    const remaining = Math.max(0, totalSteps - completed)
    const etaSeconds = avgMs ? Math.round((avgMs * remaining) / 1000) : null

    running.push({
      runId: r.id,
      workflowName: wf?.name ?? 'Arbetsflöde',
      projectName: pr?.name ?? null,
      projectColor: pr?.color ?? null,
      currentStep: currentStepObj?.name ?? `Steg ${stepIndex}`,
      stepIndex,
      totalSteps,
      progressPct: Math.round((completed / totalSteps) * 100),
      startedAt: r.started_at ?? null,
      lastAction: truncate(lastLog?.content),
      etaSeconds,
    })
  }

  const recent: RecentRun[] = (recentRows as any[]).map(r => {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
    const pr = Array.isArray(r.projects) ? r.projects[0] : r.projects
    const durationSec = r.started_at && r.finished_at
      ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
      : null
    return {
      runId: r.id,
      workflowName: wf?.name ?? 'Arbetsflöde',
      projectName: pr?.name ?? null,
      projectColor: pr?.color ?? null,
      status: r.status,
      finishedAt: r.finished_at ?? r.created_at ?? null,
      durationSec,
    }
  })

  return { running, recent }
}
