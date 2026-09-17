import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDestination } from '@/lib/nav/registry'
import { parseWorkflowSteps } from '@/lib/supabase/json'
import type { ResolvedProject } from '@/lib/project/get-project'
import type { WorkflowStep } from '@/lib/supabase/types'

/**
 * Project Workspace vNext — read-only models for the observation tranche.
 *
 * Every loader receives a project that the route has already resolved through
 * `getProjectBySlug`. There is no project lookup, default project or fallback in
 * this module. RLS-bound reads still name the project explicitly; the one
 * service-role read (`runs.context` for the existing Outputs surface) also
 * carries that exact id at the query boundary.
 */

export type CollectionState = 'ready' | 'error'

export interface ProjectIdentity {
  id: string
  name: string
  slug: string
  color: string
  href: string | null
}

export interface CollectionModel<T> {
  project: ProjectIdentity
  state: CollectionState
  items: T[]
  count: number | null
}

export type DetailRead<T> =
  | { kind: 'ready'; model: T }
  | { kind: 'not_found' }
  | { kind: 'error' }

export interface WorkspaceAgent {
  id: string
  name: string
  description: string | null
  model: string | null
  hasSystemPrompt: boolean
  href: string | null
}

export interface WorkspaceWorkflow {
  id: string
  name: string
  description: string | null
  trigger: string | null
  cronExpr: string | null
  active: boolean | null
  stepCount: number | null
  href: string | null
}

export interface WorkflowDetailStep {
  position: number
  name: string | null
  outputKey: string | null
  agent:
    | { kind: 'resolved'; name: string; href: string | null }
    | { kind: 'missing' }
    | { kind: 'unassigned' }
    | { kind: 'unknown' }
}

export interface WorkflowDetailModel {
  project: ProjectIdentity
  workflow: {
    id: string
    name: string
    description: string | null
    trigger: string | null
    cronExpr: string | null
    active: boolean | null
    createdAt: string | null
    steps: WorkflowDetailStep[] | null
    editHref: string | null
    runHref: string | null
  }
  agentsState: CollectionState
}

export interface WorkspaceRun {
  id: string
  status: string | null
  workflowName: string | null
  workflowId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  href: string | null
}

export interface RunDetailLog {
  id: string
  run_id: string
  step_order: number | null
  step_name: string | null
  role: string
  content: string
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
  created_at: string
}

export interface RunDetailModel {
  project: ProjectIdentity
  run: {
    id: string
    status: string
    workflowId: string | null
    workflowName: string | null
    createdAt: string
    startedAt: string | null
    finishedAt: string | null
    error: string | null
    input: Record<string, unknown> | null
    context: Record<string, unknown> | null
    runAgainHref: string | null
  }
  logs: RunDetailLog[]
  logsState: CollectionState
}

export interface WorkspaceOutputRun {
  id: string
  status: string
  context: Record<string, unknown> | null
  createdAt: string
  finishedAt: string | null
  workflowName: string | null
  runHref: string | null
}

export interface WorkspaceOutputsModel extends CollectionModel<WorkspaceOutputRun> {
  filter: 'all' | 'today'
  todayLabel: string
}

function projectIdentity(project: ResolvedProject): ProjectIdentity {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    color: project.color,
    href: resolveDestination('project_home', { project: project.slug })?.href ?? null,
  }
}

function under(project: ProjectIdentity, path: string): string | null {
  return project.href ? `${project.href}/${path}` : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function loadWorkspaceAgents(
  project: ResolvedProject,
): Promise<CollectionModel<WorkspaceAgent>> {
  const identity = projectIdentity(project)
  const db = await createClient()
  const { data, error, count } = await (db.from('agents') as any)
    .select('id, name, description, model, system_prompt', { count: 'exact' })
    .eq('project_id', project.id)
    .order('created_at', { ascending: true })

  if (error) return { project: identity, state: 'error', items: [], count: null }

  return {
    project: identity,
    state: 'ready',
    count: typeof count === 'number' ? count : null,
    items: ((data ?? []) as any[]).map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: text(agent.description),
      model: text(agent.model),
      // Presence only. Browse surfaces do not disclose configuration content.
      hasSystemPrompt: Boolean(text(agent.system_prompt)),
      href: under(identity, `agents/${agent.id}`),
    })),
  }
}

export async function loadWorkspaceWorkflows(
  project: ResolvedProject,
): Promise<CollectionModel<WorkspaceWorkflow>> {
  const identity = projectIdentity(project)
  const db = await createClient()
  const { data, error, count } = await (db.from('workflows') as any)
    .select('id, name, description, steps, trigger, cron_expr, active', { count: 'exact' })
    .eq('project_id', project.id)
    .order('created_at', { ascending: true })

  if (error) return { project: identity, state: 'error', items: [], count: null }

  return {
    project: identity,
    state: 'ready',
    count: typeof count === 'number' ? count : null,
    items: ((data ?? []) as any[]).map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      description: text(workflow.description),
      trigger: text(workflow.trigger),
      cronExpr: text(workflow.cron_expr),
      active: typeof workflow.active === 'boolean' ? workflow.active : null,
      stepCount: Array.isArray(workflow.steps) ? workflow.steps.length : null,
      href: under(identity, `workflows/${workflow.id}`),
    })),
  }
}

export async function loadWorkflowDetail(
  workflowId: string,
  project: ResolvedProject,
): Promise<DetailRead<WorkflowDetailModel>> {
  const identity = projectIdentity(project)
  const db = await createClient()

  // Parent first. A foreign and a missing id both resolve to no row through RLS
  // plus the explicit project predicate, and no dependent read runs afterwards.
  const { data: workflow, error } = await (db.from('workflows') as any)
    .select('id, name, description, steps, trigger, cron_expr, active, created_at')
    .eq('id', workflowId)
    .eq('project_id', project.id)
    .maybeSingle()

  if (error) return { kind: 'error' }
  if (!workflow) return { kind: 'not_found' }

  const parsedSteps = Array.isArray(workflow.steps)
    ? parseWorkflowSteps(workflow.steps)
    : null
  const agentIds = parsedSteps
    ? [...new Set(parsedSteps.map((step) => text(step.agent_id)).filter((id): id is string => id !== null))]
    : []

  let agentsState: CollectionState = 'ready'
  const agentsById = new Map<string, { id: string; name: string }>()

  if (agentIds.length > 0) {
    const agentsResult = await (db.from('agents') as any)
      .select('id, name')
      .eq('project_id', project.id)
      .in('id', agentIds)

    if (agentsResult.error) {
      agentsState = 'error'
    } else {
      for (const agent of (agentsResult.data ?? []) as any[]) {
        agentsById.set(agent.id, { id: agent.id, name: agent.name })
      }
    }
  }

  const steps = parsedSteps?.map((step: WorkflowStep, index: number): WorkflowDetailStep => {
    const agentId = text(step.agent_id)
    const agent = agentId ? agentsById.get(agentId) : null
    return {
      position: index + 1,
      name: text(step.name),
      outputKey: text(step.output_key),
      agent: !agentId
        ? { kind: 'unassigned' }
        : agentsState === 'error'
          ? { kind: 'unknown' }
          : agent
            ? { kind: 'resolved', name: agent.name, href: under(identity, `agents/${agent.id}`) }
            : { kind: 'missing' },
    }
  }) ?? null

  return {
    kind: 'ready',
    model: {
      project: identity,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: text(workflow.description),
        trigger: text(workflow.trigger),
        cronExpr: text(workflow.cron_expr),
        active: typeof workflow.active === 'boolean' ? workflow.active : null,
        createdAt: workflow.created_at ?? null,
        steps,
        editHref: under(identity, `workflows/${workflow.id}/edit`),
        runHref: under(identity, `workflows/${workflow.id}/run`),
      },
      agentsState,
    },
  }
}

export async function loadWorkspaceRuns(
  project: ResolvedProject,
): Promise<CollectionModel<WorkspaceRun>> {
  const identity = projectIdentity(project)
  const db = await createClient()
  const { data, error, count } = await (db.from('runs') as any)
    .select('id, status, workflow_id, created_at, started_at, finished_at, workflows(name)', { count: 'exact' })
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { project: identity, state: 'error', items: [], count: null }

  return {
    project: identity,
    state: 'ready',
    count: typeof count === 'number' ? count : null,
    items: ((data ?? []) as any[]).map((run) => ({
      id: run.id,
      status: text(run.status),
      workflowName: text(one<{ name: string | null }>(run.workflows)?.name),
      workflowId: text(run.workflow_id),
      createdAt: run.created_at,
      startedAt: run.started_at ?? null,
      finishedAt: run.finished_at ?? null,
      href: under(identity, `runs/${run.id}`),
    })),
  }
}

export async function loadRunDetail(
  runId: string,
  project: ResolvedProject,
): Promise<DetailRead<RunDetailModel>> {
  const identity = projectIdentity(project)
  const db = await createClient()

  // The run is the parent authority for its logs. Do not issue the log query
  // until both id and project_id have resolved one RLS-visible row.
  const { data: run, error } = await (db.from('runs') as any)
    .select('id, project_id, workflow_id, status, input, context, error, created_at, started_at, finished_at, workflows(name, id)')
    .eq('id', runId)
    .eq('project_id', project.id)
    .maybeSingle()

  if (error) return { kind: 'error' }
  if (!run) return { kind: 'not_found' }

  const logsResult = await (db.from('run_logs') as any)
    .select('*')
    .eq('run_id', run.id)
    .order('created_at', { ascending: true })

  const workflow = one<{ id: string; name: string | null }>(run.workflows)

  return {
    kind: 'ready',
    model: {
      project: identity,
      run: {
        id: run.id,
        status: run.status,
        workflowId: text(run.workflow_id),
        workflowName: text(workflow?.name),
        createdAt: run.created_at,
        startedAt: run.started_at ?? null,
        finishedAt: run.finished_at ?? null,
        error: text(run.error),
        input: run.input && typeof run.input === 'object' ? run.input as Record<string, unknown> : null,
        context: run.context && typeof run.context === 'object' ? run.context as Record<string, unknown> : null,
        runAgainHref: workflow?.id ? under(identity, `workflows/${workflow.id}/run`) : null,
      },
      logsState: logsResult.error ? 'error' : 'ready',
      logs: logsResult.error ? [] : (logsResult.data ?? []) as RunDetailLog[],
    },
  }
}

export async function loadWorkspaceOutputs(
  project: ResolvedProject,
  filter: 'all' | 'today',
  now = new Date(),
): Promise<WorkspaceOutputsModel> {
  const identity = projectIdentity(project)
  const db = createAdminClient()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // This route has always presented completed run context. It does NOT read the
  // canonical `outputs` table, and the model names its rows accordingly.
  let query = (db.from('runs') as any)
    .select('id, status, context, created_at, finished_at, workflows(name)', { count: 'exact' })
    .eq('project_id', project.id)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(50)

  if (filter === 'today') query = query.gte('created_at', todayStart.toISOString())

  const { data, error, count } = await query
  const todayLabel = todayStart.toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  if (error) {
    return { project: identity, state: 'error', items: [], count: null, filter, todayLabel }
  }

  return {
    project: identity,
    state: 'ready',
    count: typeof count === 'number' ? count : null,
    filter,
    todayLabel,
    items: ((data ?? []) as any[]).map((run) => ({
      id: run.id,
      status: run.status,
      context: run.context && typeof run.context === 'object' ? run.context as Record<string, unknown> : null,
      createdAt: run.created_at,
      finishedAt: run.finished_at ?? null,
      workflowName: text(one<{ name: string | null }>(run.workflows)?.name),
      runHref: under(identity, `runs/${run.id}`),
    })),
  }
}
