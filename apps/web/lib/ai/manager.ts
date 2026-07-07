/**
 * Manager Agent — central orchestrator of the AI Operating System.
 *
 * Responsibilities:
 * - Build rich operational context from live DB data
 * - Generate daily priorities and recommendations
 * - Evaluate AI-generated outputs for quality
 * - Break high-level goals into concrete manager_tasks
 * - Coordinate agent communication via agent_messages
 * - Retry failed workflow runs
 *
 * All LLM calls use claude-sonnet-4-6.
 * All DB state lives in Supabase (no in-memory state).
 * Use getManager() singleton to avoid re-instantiation.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateCost } from './pricing'
import { applyProjectScope } from '@/lib/atlas/isolation'
import { toJson } from '@/lib/supabase/json'
import type { Json } from '@/lib/supabase/database.types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── System prompt ────────────────────────────────────────────────────────────

const MANAGER_SYSTEM_PROMPT = `You are the Manager Agent of an AI Operating System — a platform that coordinates multiple AI-powered businesses and workflows.

Your core responsibilities:
- Analyze operational state: runs, agents, costs, approvals, tasks
- Provide clear, prioritized, actionable recommendations
- Break high-level goals into concrete executable tasks
- Evaluate AI-generated content for quality, safety, and brand alignment
- Identify cost inefficiencies and workflow optimization opportunities
- Generate daily operational priorities for human decision-makers

Principles:
- Be direct and operational. No fluff.
- Prioritize by business impact and urgency.
- When something is failing, name it clearly and suggest a fix.
- When costs spike, quantify the impact.
- When approvals are pending, be decisive in your recommendation.

You respond in the same language as the user's message.`

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyPlan {
  priorities: { title: string; reason: string; urgency: 'high' | 'medium' | 'low' }[]
  concerns: string[]
  opportunities: string[]
  summary: string
}

export interface EvaluationResult {
  score: number          // 0–100
  approved: boolean
  issues: string[]
  feedback: string
}

export interface ManagerTask {
  id: string
  project_id: string | null
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  workflow_id: string | null
  run_id: string | null
  result: string | null
  created_at: string
  updated_at: string
}

export interface AgentMessage {
  from_agent: string
  to_agent: string
  message_type: 'message' | 'request' | 'response' | 'approval_request' | 'feedback' | 'handoff' | 'daily_plan' | 'analysis'
  content: string
  metadata?: Record<string, unknown>
  run_id?: string
  task_id?: string
  project_id?: string
}

type AdminClient = ReturnType<typeof createAdminClient>

// ─── Manager Agent class ──────────────────────────────────────────────────────

export class ManagerAgent {
  private db: AdminClient

  constructor() {
    this.db = createAdminClient()
  }

  // ── Context builder ─────────────────────────────────────────────────────────
  // Assembles a rich operational snapshot for LLM reasoning.

  private async buildContext(projectId?: string, allowedProjectIds?: string[]): Promise<string> {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // ISOLATION: scope every project-native read to the caller's allowed
    // projects. `undefined` = no scoping (daily-plan/cron callers stay global);
    // a provided array (even empty → impossible id → zero rows) scopes.

    // Parallel DB fetches
    const [runsRes, agentsRes, approvalsRes, costsRes, tasksRes, projectsRes] =
      await Promise.allSettled([
        applyProjectScope(this.db
          .from('runs')
          .select('id, status, error, created_at, finished_at, workflows(name), project_id')
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(30), allowedProjectIds),

        applyProjectScope(this.db
          .from('agents')
          .select('id, name, model, project_id')
          .limit(30), allowedProjectIds),

        applyProjectScope(this.db
          .from('approvals')
          .select('id, output_key, status, created_at, runs(workflows(name))')
          .in('status', ['pending'])
          .order('created_at', { ascending: false })
          .limit(10), allowedProjectIds),

        // run_logs has no project_id (indirect scope via run_id) — DEFERRED.
        // Token totals here remain global; safe for single-owner, must be
        // run_id-scoped before multi-tenant. Tracked in the isolation checklist.
        this.db
          .from('run_logs')
          .select('tokens_in, tokens_out, runs(agents(name, model), workflows(name))')
          .gte('created_at', monthStart)
          .not('tokens_in', 'is', null),

        applyProjectScope(this.db
          .from('manager_tasks')
          .select('*')
          .in('status', ['pending', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(15), allowedProjectIds),

        applyProjectScope(this.db
          .from('projects')
          .select('id, name, slug')
          .limit(10), allowedProjectIds, 'id'),
      ])

    // Safely unwrap results
    const runs  = runsRes.status      === 'fulfilled' ? (runsRes.value.data      ?? []) : []
    const agents = agentsRes.status   === 'fulfilled' ? (agentsRes.value.data    ?? []) : []
    const approvals = approvalsRes.status === 'fulfilled' ? (approvalsRes.value.data ?? []) : []
    const costs = costsRes.status     === 'fulfilled' ? (costsRes.value.data     ?? []) : []
    const tasks = tasksRes.status     === 'fulfilled' ? (tasksRes.value.data     ?? []) : []
    const projects = projectsRes.status === 'fulfilled' ? (projectsRes.value.data ?? []) : []

    // Run stats
    const done    = runs.filter((r: any) => r.status === 'done').length
    const failed  = runs.filter((r: any) => r.status === 'failed').length
    const running = runs.filter((r: any) => r.status === 'running').length

    // Split failures: recent (<48h) are active issues; older are historical context only
    const recentFailed = runs.filter((r: any) => r.status === 'failed' && r.created_at >= twoDaysAgo)
    const olderFailed  = runs.filter((r: any) => r.status === 'failed' && r.created_at < twoDaysAgo)

    const recentFailedList = recentFailed
      .map((r: any) => `  - ${(r.workflows as any)?.name ?? 'Unknown'} | ${r.created_at?.slice(0, 16)} | error: ${r.error ?? 'unknown'} | id: ${r.id.slice(0, 8)}`)
      .join('\n') || '  None — system appears healthy'

    const olderFailedList = olderFailed.length > 0
      ? olderFailed
          .map((r: any) => `  - ${(r.workflows as any)?.name ?? 'Unknown'} | ${r.created_at?.slice(0, 16)} | error: ${r.error ?? 'unknown'}`)
          .join('\n')
      : '  None'

    // Cost aggregation
    let totalCost = 0
    const agentCostMap: Record<string, number> = {}
    for (const log of costs as any[]) {
      const agent = log.runs?.agents
      if (!agent) continue
      const cost = calculateCost(agent.model ?? 'claude-sonnet-4-6', log.tokens_in ?? 0, log.tokens_out ?? 0)
      totalCost += cost
      agentCostMap[agent.name] = (agentCostMap[agent.name] ?? 0) + cost
    }
    const topCosts = Object.entries(agentCostMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, cost]) => `  - ${name}: $${cost.toFixed(4)}`)
      .join('\n') || '  No data'

    // Format context string
    return `=== OPERATIONAL CONTEXT [${now.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}] ===

PROJECTS: ${projects.map((p: any) => p.name).join(', ') || 'None'}

RUNS (last 7 days): ${runs.length} total
  Done: ${done} | Failed: ${failed} | Running: ${running}

ACTIVE FAILURES (last 48h) — these require attention:
${recentFailedList}

HISTORICAL FAILURES (2–7 days ago) — for context only, may already be resolved:
${olderFailedList}

PENDING APPROVALS: ${approvals.length}
${approvals.map((a: any) => `  - ${(a.runs as any)?.workflows?.name ?? 'Unknown workflow'} (id: ${a.id.slice(0, 8)})`).join('\n') || '  None'}

AGENTS: ${agents.length} registered
${agents.slice(0, 8).map((a: any) => `  - ${a.name} [${a.model}]`).join('\n')}

COST THIS MONTH: $${totalCost.toFixed(4)}
Top cost drivers:
${topCosts}

ACTIVE MANAGER TASKS: ${tasks.length}
${tasks.map((t: any) => `  - [${t.priority?.toUpperCase()}] ${t.title} (${t.status})`).join('\n') || '  None'}
`
  }

  // ── LLM-powered methods ────────────────────────────────────────────────────

  /**
   * Conversational interface — answers questions, gives recommendations,
   * provides project updates. Used by /chat command center.
   */
  async chat(message: string, projectId?: string, allowedProjectIds: string[] = []): Promise<string> {
    const context = await this.buildContext(projectId, allowedProjectIds)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: MANAGER_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `${context}\n\n---\n\n${message}` },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Log the exchange
    await Promise.allSettled([
      this.logMessage({ from_agent: 'human', to_agent: 'manager', message_type: 'message', content: message, project_id: projectId }),
      this.logMessage({ from_agent: 'manager', to_agent: 'human', message_type: 'response', content: text, project_id: projectId }),
    ])

    return text
  }

  /**
   * Generates today's operational plan. Caches result in agent_messages.
   * Idempotent — returns cached plan if already generated today.
   */
  async generateDailyPlan(projectId?: string, force = false): Promise<DailyPlan> {
    // Return cached plan if available today
    if (!force) {
      const cached = await this.getTodaysPlan()
      if (cached) return cached
    }

    const context = await this.buildContext(projectId)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: MANAGER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${context}\n\n---\n\nGenerate today's operational priorities. Return ONLY valid JSON, no other text:
{
  "priorities": [
    { "title": "string", "reason": "string", "urgency": "high|medium|low" }
  ],
  "concerns": ["string"],
  "opportunities": ["string"],
  "summary": "2-3 sentence executive summary"
}`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    let plan: DailyPlan = {
      priorities: [],
      concerns: ['Kunde inte generera daglig plan'],
      opportunities: [],
      summary: 'Ingen plan tillgänglig.',
    }

    try {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) plan = JSON.parse(match[0]) as DailyPlan
    } catch { /* use default */ }

    // Cache in DB
    await this.logMessage({
      from_agent: 'manager',
      to_agent: 'human',
      message_type: 'daily_plan',
      content: JSON.stringify(plan),
      metadata: { date: new Date().toISOString().slice(0, 10) },
      project_id: projectId,
    })

    return plan
  }

  /**
   * Evaluates an approval's content for quality.
   * Returns structured score + feedback for human review aid.
   */
  async evaluateOutput(approvalId: string): Promise<EvaluationResult> {
    const { data: approval } = await this.db
      .from('approvals')
      .select('*, runs(workflows(name))')
      .eq('id', approvalId)
      .single()

    if (!approval) throw new Error(`Approval ${approvalId} not found`)

    const workflowName = (approval.runs as any)?.workflows?.name ?? 'Unknown'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: MANAGER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Evaluate this AI-generated output from workflow "${workflowName}".

CONTENT (first 3000 chars):
${(approval.content ?? '').slice(0, 3000)}

Return ONLY valid JSON:
{
  "score": 0-100,
  "approved": true|false,
  "issues": ["issue if any"],
  "feedback": "Concise quality assessment"
}`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    try {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) return JSON.parse(match[0]) as EvaluationResult
    } catch { /* fall through */ }

    return { score: 0, approved: false, issues: ['Evaluation parse error'], feedback: 'Could not evaluate output.' }
  }

  /**
   * Breaks a high-level goal into manager_tasks and persists them.
   */
  async planTasks(goal: string, projectId: string): Promise<ManagerTask[]> {
    const context = await this.buildContext(projectId)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: MANAGER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${context}\n\n---\n\nBreak this goal into concrete, actionable tasks:\n\nGOAL: ${goal}\n\nReturn ONLY valid JSON array:
[
  { "title": "string", "description": "string", "priority": "high|medium|low" }
]`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]'
    let parsed: Array<{ title: string; description: string; priority: string }> = []
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) parsed = JSON.parse(match[0])
    } catch { return [] }

    const results: ManagerTask[] = []
    for (const task of parsed.slice(0, 10)) {
      const { data } = await this.db
        .from('manager_tasks')
        .insert({
          project_id: projectId,
          title: task.title,
          description: task.description,
          priority: task.priority as ManagerTask['priority'],
          status: 'pending',
        })
        .select()
        .single()
      if (data) results.push(data as ManagerTask)
    }

    return results
  }

  // ── DB operations (no LLM cost) ────────────────────────────────────────────

  async getActiveTasks(projectId?: string): Promise<ManagerTask[]> {
    let query = this.db
      .from('manager_tasks')
      .select('*')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (projectId) query = query.eq('project_id', projectId)
    const { data } = await query
    return (data ?? []) as ManagerTask[]
  }

  async updateTask(taskId: string, updates: Partial<Pick<ManagerTask, 'status' | 'result'>>): Promise<void> {
    await this.db
      .from('manager_tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', taskId)
  }

  async retryFailedRun(runId: string): Promise<string | null> {
    const { data: run } = await this.db
      .from('runs')
      .select('workflow_id, project_id, input, kind, steps_snapshot, policy_class, workflows(steps, side_effect_class)')
      .eq('id', runId)
      .single()

    if (!run) return null

    const wf = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
    const snapshot: Json | null = run.steps_snapshot ?? (wf as { steps?: Json } | null)?.steps ?? null
    // H1.P4 (PR1): carry the policy class onto the new run (immutable per-run). INERT until PR2.
    const policyClass: string | null = run.policy_class ?? (wf as { side_effect_class?: string } | null)?.side_effect_class ?? null

    // H1.P3: the retry is a NEW run (preserves "fresh run" semantics) but created as a
    // durable `pending` run carrying the steps snapshot — NOT `running`. The pg_cron
    // drain claims + executes it under a lease, the same durability/lease flow as every
    // other run. (Was `running` with no lease → an unrecoverable orphan since nothing
    // executed it and the reaper only requeues runs that already hold a lease.)
    const { data: newRun } = await this.db
      .from('runs')
      .insert({
        workflow_id: run.workflow_id,
        project_id: run.project_id,
        kind: run.kind,
        status: 'pending',
        input: run.input ?? {},
        context: {},
        steps_snapshot: snapshot,
        policy_class: policyClass,
      })
      .select('id')
      .single()

    return newRun?.id ?? null
  }

  async logMessage(msg: AgentMessage): Promise<void> {
    try {
      await this.db.from('agent_messages').insert({ ...msg, metadata: msg.metadata ? toJson(msg.metadata) : undefined })
    } catch {
      // Table might not exist yet — fail silently until migration runs
    }
  }

  async getRecentMessages(limit = 30): Promise<unknown[]> {
    try {
      const { data } = await this.db
        .from('agent_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      return data ?? []
    } catch {
      return []
    }
  }

  async getTodaysPlan(): Promise<DailyPlan | null> {
    const today = new Date().toISOString().slice(0, 10)
    try {
      const { data } = await this.db
        .from('agent_messages')
        .select('content')
        .eq('from_agent', 'manager')
        .eq('message_type', 'daily_plan')
        .gte('created_at', today + 'T00:00:00Z')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!data?.content) return null
      return JSON.parse(data.content) as DailyPlan
    } catch {
      return null
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _manager: ManagerAgent | null = null

export function getManager(): ManagerAgent {
  if (!_manager) _manager = new ManagerAgent()
  return _manager
}
