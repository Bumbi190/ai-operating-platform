import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDestination } from '@/lib/nav/registry'
import type { WorkflowStep } from '@/lib/supabase/types'
// Types only. The tab vocabulary lives in a client-safe sibling because the
// client component needs its runtime values, and this module is `server-only`.
//
// Deliberately NOT re-exported from here: a re-export would let a client
// component import those constants through this module and pull `server-only`
// into the bundle again — the exact failure this split fixes. Consumers import
// them from `agent-detail-shared` directly.
import type { AgentDetailTabId, TabAvailability } from '@/lib/os/agent-detail-shared'

/**
 * Agent Detail — what this agent is, what it is doing, and what Omnira can
 * truthfully say about it.
 *
 * THE AUDIT THIS ENCODES. `lib/atlas/workpackage/roles.ts` already states the
 * position canonically, and this module mirrors it rather than re-deciding it:
 *
 *   role exists            YES — `agents` row
 *   project membership     YES — `agents.project_id`
 *   declared skills        LABELS ONLY — `agents.skill_ids` is a string[] that
 *                          resolves against nothing; there is no `skills` table
 *                          in the repository or in production
 *   tools                  NO  — no tool registry exists, and no agent→tool
 *                          assignment model exists
 *   capacity / load        NO  — no source; not guessed
 *
 * To that this module adds, from its own reading of the schema:
 *
 *   agent memory           NO  — `memories` is keyed by `project_id` only
 *   agent tasks            NO  — `manager_tasks` has no agent column; `owner`
 *                          is free text and the graph contract links a task to
 *                          runs and workflows, never to an agent
 *   agent chat             NO  — `agent_messages` is inter-agent / manager
 *                          coordination, not an operator↔agent surface
 *   workflow membership    YES — `workflows.steps[].agent_id`
 *   current activity       YES — a RUNNING run whose workflow names this agent
 *
 * Absence is reported as absence. A tab with no runtime link renders an
 * explicit unavailable state, never an empty list that reads as "none".
 */

export interface AgentWorkflowMembership {
  workflowId: string
  workflowName: string
  /** Step names in this workflow that name this agent. */
  steps: string[]
  /** True when a run of this workflow is running right now. */
  running: boolean
}

export interface AgentDetailModel {
  agent: {
    id: string
    name: string
    description: string | null
    model: string
    /** Presence only — the prompt itself is the editor's content, not the detail's. */
    hasSystemPrompt: boolean
    systemPromptChars: number
    /** Uninterpreted labels. There is no registry to resolve them against. */
    skillIds: string[]
    createdAt: string | null
  }
  project: {
    id: string
    name: string
    slug: string
    color: string
    href: string | null
  }
  /**
   * true  — a running run's workflow names this agent in a step
   * false — no running run names it
   * null  — activity could not be read; the UI must say "unknown", not "idle"
   */
  working: boolean | null
  workflows: AgentWorkflowMembership[]
  /** null when the workflow query failed — distinct from "belongs to none". */
  workflowsAvailable: boolean
  /** What each section can truthfully show. */
  tabs: Record<AgentDetailTabId, TabAvailability>
}

interface RawAgent {
  id: string
  project_id: string
  name: string
  description: string | null
  model: string | null
  system_prompt: string | null
  skill_ids: unknown
  created_at: string | null
}

interface RawProject { id: string; name: string; slug: string; color: string | null }

export interface AssembleAgentDetailInput {
  agent: RawAgent
  project: RawProject
  /** Workflows in this project, or null when the query failed. */
  workflows: ReadonlyArray<{ id: string; name: string; steps: unknown }> | null
  /** Workflow ids with a run currently running, or null when unavailable. */
  runningWorkflowIds: ReadonlySet<string> | null
}

const DEFAULT_PROJECT_COLOR = '#6366f1'

/**
 * Build the detail from already-fetched, already-scoped rows.
 *
 * Pure, so the classification rules — which tab is real, when "working" stays
 * unknown, that a foreign project can never be assembled — are assertable
 * without a database.
 */
export function assembleAgentDetail(input: AssembleAgentDetailInput): AgentDetailModel {
  const { agent, project } = input

  const skillIds = Array.isArray(agent.skill_ids)
    ? agent.skill_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  const workflows: AgentWorkflowMembership[] = []
  if (input.workflows) {
    for (const workflow of input.workflows) {
      const steps = (Array.isArray(workflow.steps) ? workflow.steps : []) as WorkflowStep[]
      const mine = steps.filter((step) => step?.agent_id === agent.id)
      if (mine.length === 0) continue
      workflows.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        steps: mine.map((step, index) => step?.name ?? `Steg ${index + 1}`),
        running: input.runningWorkflowIds?.has(workflow.id) ?? false,
      })
    }
  }

  // Activity is derived ONLY from a running run whose workflow names this
  // agent. Never from created_at, never from unrelated project runs.
  const working = input.runningWorkflowIds === null || input.workflows === null
    ? null
    : workflows.some((workflow) => workflow.running)

  const projectHref = resolveDestination('project_home', { project: project.slug })?.href ?? null

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      description: agent.description?.trim() || null,
      model: agent.model ?? 'okänd modell',
      hasSystemPrompt: Boolean(agent.system_prompt?.trim()),
      systemPromptChars: agent.system_prompt?.trim().length ?? 0,
      skillIds,
      createdAt: agent.created_at,
    },
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color ?? DEFAULT_PROJECT_COLOR,
      href: projectHref,
    },
    working,
    workflows,
    workflowsAvailable: input.workflows !== null,
    tabs: {
      overview: 'REAL',
      // No operator↔agent chat runtime exists.
      chat: 'UNAVAILABLE',
      // Always PARTIAL, whatever the count: skill_ids are a real, canonical
      // field, but they resolve against nothing — labels, not capabilities. An
      // agent with zero of them is not "more available", it just declares none.
      skills: 'PARTIAL',
      tools: 'UNAVAILABLE',
      memory: 'UNAVAILABLE',
      permissions: 'UNAVAILABLE',
      // Membership is real; run history per agent is not.
      workflows: input.workflows === null ? 'UNAVAILABLE' : 'PARTIAL',
      tasks: 'UNAVAILABLE',
    },
  }
}

/**
 * Load one agent, scoped to its project.
 *
 * The project is resolved by the caller (the route already does this through
 * `getProjectBySlug`), and the agent lookup is filtered by `project_id` so an
 * agent from another project cannot be opened under this project's URL — the
 * guard the route has always had, kept intact.
 */
export async function loadAgentDetail(
  agentId: string,
  project: RawProject,
): Promise<AgentDetailModel | null> {
  const db = createAdminClient()

  const { data: agent, error } = await (db.from('agents') as any)
    .select('id, project_id, name, description, model, system_prompt, skill_ids, created_at')
    .eq('id', agentId)
    .eq('project_id', project.id)
    .maybeSingle()

  if (error || !agent) return null

  const [workflowsRes, runsRes] = await Promise.allSettled([
    (db.from('workflows') as any)
      .select('id, name, steps')
      .eq('project_id', project.id),
    (db.from('runs') as any)
      .select('workflow_id, status')
      .eq('status', 'running')
      .eq('project_id', project.id),
  ])

  const workflowsOk = workflowsRes.status === 'fulfilled' && !(workflowsRes.value as any).error
  const runsOk = runsRes.status === 'fulfilled' && !(runsRes.value as any).error

  const runningWorkflowIds = runsOk
    ? new Set<string>(
        (((runsRes.value as any).data ?? []) as any[])
          .map((run) => run.workflow_id)
          .filter((id): id is string => typeof id === 'string'),
      )
    : null

  return assembleAgentDetail({
    agent: agent as RawAgent,
    project,
    workflows: workflowsOk ? ((workflowsRes.value as any).data ?? []) : null,
    runningWorkflowIds,
  })
}
