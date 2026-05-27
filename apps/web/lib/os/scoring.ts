/**
 * lib/os/scoring.ts
 *
 * Computes per-agent performance scorecards from real run_logs + runs.
 *
 * Window: last 7 days (configurable). All aggregation is done in a single
 * server round-trip via two parallel queries:
 *
 *   1. run_logs in window       — for step-level tokens / durations
 *   2. runs in window           — to know which runs were done/failed
 *
 * Joining happens in memory so we don't need a SQL view.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Agent, RunLog, Run } from '@/lib/supabase/types'

export interface AgentScorecard {
  agent:           Agent
  /** number of steps executed by this agent in the window */
  steps:           number
  /** number of distinct runs touched */
  runs:            number
  /** success rate (0-100) over those runs */
  successRate:     number
  /** avg duration_ms per step */
  avgDurationMs:   number | null
  /** total tokens used */
  tokens:          number
  /** last activity timestamp (ISO) */
  lastActiveAt:    string | null
  /** derived: 0–100 health score · combines success, latency, recency */
  health:          number
  /** narrative label for the current state */
  state:           'active' | 'idle' | 'degraded' | 'silent'
}

interface ScorecardOptions {
  windowMs?: number   // default 7d
  agentIds?: string[] // restrict to these agents (otherwise all)
}

export async function fetchAgentScorecards(
  admin: SupabaseClient,
  opts: ScorecardOptions = {},
): Promise<AgentScorecard[]> {
  const windowMs = opts.windowMs ?? 7 * 24 * 60 * 60 * 1000
  const sinceISO = new Date(Date.now() - windowMs).toISOString()

  const [agentsRes, logsRes, runsRes] = await Promise.allSettled([
    opts.agentIds && opts.agentIds.length > 0
      ? (admin.from('agents') as any)
          .select('id, project_id, name, description, system_prompt, model, skill_ids, config, created_at')
          .in('id', opts.agentIds)
      : (admin.from('agents') as any)
          .select('id, project_id, name, description, system_prompt, model, skill_ids, config, created_at'),
    (admin.from('run_logs') as any)
      .select('id, run_id, step_order, step_name, role, content, tokens_in, tokens_out, duration_ms, created_at')
      .gte('created_at', sinceISO),
    (admin.from('runs') as any)
      .select('id, status, workflow_id, project_id')
      .gte('created_at', sinceISO),
  ])

  const agents: Agent[] = agentsRes.status === 'fulfilled' ? ((agentsRes.value as any).data ?? []) : []
  const logs:   RunLog[] = logsRes.status   === 'fulfilled' ? ((logsRes.value as any).data ?? []) : []
  const runs:   Run[]    = runsRes.status   === 'fulfilled' ? ((runsRes.value as any).data ?? []) : []

  // To link logs → agents we need to walk workflows.steps — but we don't want
  // to fetch them all here. Alternative: log.step_name often matches the agent
  // name, and the runs table will tell us which workflow ran. We use a simple
  // matcher: step_name === agent.name (case-insensitive).
  const agentByName: Record<string, Agent> = {}
  for (const a of agents) agentByName[a.name.toLowerCase()] = a

  // Group logs by their resolved agent
  const logsByAgent: Record<string, RunLog[]> = {}
  const runsTouchedByAgent: Record<string, Set<string>> = {}

  for (const log of logs) {
    const key = (log.step_name ?? '').toLowerCase()
    const agent = key ? agentByName[key] : undefined
    if (!agent) continue
    ;(logsByAgent[agent.id] ??= []).push(log)
    ;(runsTouchedByAgent[agent.id] ??= new Set()).add(log.run_id)
  }

  // Build scorecards
  const runStatusById: Record<string, Run['status']> = {}
  for (const r of runs) runStatusById[r.id] = r.status

  const now = Date.now()

  return agents.map(agent => {
    const aLogs = logsByAgent[agent.id] ?? []
    const touched = runsTouchedByAgent[agent.id] ?? new Set<string>()
    const touchedRuns = [...touched]

    const stepCount = aLogs.length
    const tokens = aLogs.reduce((acc, l) => acc + (l.tokens_in ?? 0) + (l.tokens_out ?? 0), 0)

    // avg duration_ms
    const withDur = aLogs.filter(l => l.duration_ms != null)
    const avgDurationMs = withDur.length > 0
      ? Math.round(withDur.reduce((acc, l) => acc + (l.duration_ms ?? 0), 0) / withDur.length)
      : null

    // success rate over runs the agent touched
    const succeed = touchedRuns.filter(id => runStatusById[id] === 'done').length
    const failed  = touchedRuns.filter(id => runStatusById[id] === 'failed').length
    const decided = succeed + failed
    const successRate = decided > 0 ? Math.round((succeed / decided) * 100) : 0

    // last activity
    const lastLog = aLogs.length > 0
      ? aLogs.reduce((latest, l) => new Date(l.created_at).getTime() > new Date(latest.created_at).getTime() ? l : latest, aLogs[0])
      : null
    const lastActiveAt = lastLog?.created_at ?? null

    // State: active < 5min, idle < 1h, silent < 7d, degraded if recent failure ratio bad
    let state: AgentScorecard['state'] = 'silent'
    if (lastActiveAt) {
      const age = now - new Date(lastActiveAt).getTime()
      if (age < 5 * 60_000)       state = 'active'
      else if (age < 60 * 60_000) state = 'idle'
      else                        state = 'silent'
    }
    if (decided > 2 && successRate < 50) state = 'degraded'

    // Health 0–100: 60% success, 25% recency, 15% latency
    const recencyScore = state === 'active' ? 100
      : state === 'idle' ? 70
      : state === 'degraded' ? 40
      : 25
    const latencyScore = avgDurationMs == null
      ? 70
      : Math.max(0, Math.min(100, 110 - Math.log10(Math.max(avgDurationMs, 100)) * 18))
    const health = Math.round(successRate * 0.6 + recencyScore * 0.25 + latencyScore * 0.15)

    return {
      agent,
      steps: stepCount,
      runs: touchedRuns.length,
      successRate,
      avgDurationMs,
      tokens,
      lastActiveAt,
      health,
      state,
    } satisfies AgentScorecard
  })
}

/** Convert an AgentScorecard into the AgentSnapshot shape the UI consumes */
import type { AgentSnapshot } from '@/components/platform/os'

export function scorecardToSnapshot(s: AgentScorecard, recentReasoning?: string | null): AgentSnapshot {
  // role inference (we don't store role on the agent table)
  const lower = s.agent.name.toLowerCase()
  let role = 'Autonomous agent'
  let color = '#a5b4fc'
  if (/news|hunter/.test(lower))    { role = 'News Hunter';     color = '#67e8f9' }
  else if (/script|writer|hook/.test(lower)) { role = 'Script Agent';    color = '#a78bfa' }
  else if (/visual|director|image/.test(lower)) { role = 'Visual Director'; color = '#a5b4fc' }
  else if (/qa|review|eval/.test(lower)) { role = 'QA Agent';      color = '#d4a574' }
  else if (/publish|distribut/.test(lower)) { role = 'Publisher';   color = '#34d399' }
  else if (/manager|operator|orchestr/.test(lower)) { role = 'Operator'; color = '#818cf8' }

  const status: AgentSnapshot['status'] =
    s.state === 'active'    ? 'active'    :
    s.state === 'degraded'  ? 'blocked'   :
    s.state === 'idle'      ? 'idle'      :
                              'idle'

  const runtimeSeconds = s.lastActiveAt
    ? Math.max(0, Math.round((Date.now() - new Date(s.lastActiveAt).getTime()) / 1000))
    : undefined

  return {
    id: s.agent.id,
    name: s.agent.name,
    role,
    status,
    task: recentReasoning ?? (s.state === 'silent'
      ? 'Standing by · no recent activity'
      : s.state === 'idle'
        ? 'Idle · last task complete'
        : s.state === 'degraded'
          ? 'Recent failures detected · review trace'
          : 'Executing'),
    confidence: s.health,
    memoryUsage: Math.min(100, Math.round((s.tokens / 200_000) * 100)),
    runtimeSeconds,
    reasoning: recentReasoning ?? undefined,
    color,
  }
}
