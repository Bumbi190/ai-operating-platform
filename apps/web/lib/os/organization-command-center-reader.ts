import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from '@/lib/auth/organization-project-read'
import { listInstancesForProjects } from '@/lib/workflows/store'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { findVendoredDefinition } from '@/lib/workflows/definitions'
import {
  ACTIVE_RUN_STATUSES, COMMAND_CENTER_LIMITS, assembleProjectCommandCenter,
  type ProjectCommandCenterModel, type CommandCenterRunRef,
  type RawWorkflow, type RawRunLite, type RawRun, type RawAgent, type RawApproval, type RawOutput, type Read,
} from '@/lib/os/project-command-center'
import type { ResolvedProject } from '@/lib/project/get-project'
import type { WorkflowInstance } from '@/lib/workflows/types'

/** An invalid/missing read is not the same as a valid but empty result. */
function toRead<T>(value: PromiseSettledResult<unknown>): Read<T> {
  if (value.status !== 'fulfilled') return { ok: false }
  const r = value.value as { data?: unknown; error?: unknown; count?: unknown } | T[] | null
  if (Array.isArray(r)) return { ok: true, rows: r as T[], count: null }
  if (!r || r.error || !Array.isArray(r.data)) return { ok: false }
  return { ok: true, rows: r.data as T[], count: typeof r.count === 'number' ? r.count : null }
}

function scrubWorkflowSteps(workflow: RawWorkflow): RawWorkflow {
  return {
    ...workflow,
    description: null,
    steps: Array.isArray(workflow.steps)
      ? workflow.steps.map(raw => {
        const step = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
        return {
          name: typeof step.name === 'string' ? step.name : null,
          order: typeof step.order === 'number' ? step.order : null,
          agent_id: typeof step.agent_id === 'string' ? step.agent_id : null,
        }
      })
      : null,
  }
}

/** No privileged links, file URLs, workflow output keys or embedded config. */
export function sanitizeOrganizationCommandCenter(model: ProjectCommandCenterModel): ProjectCommandCenterModel {
  const noHref = (run: CommandCenterRunRef): CommandCenterRunRef => ({ ...run, href: null })
  return {
    ...model,
    project: { ...model.project, href: null },
    links: {
      runs: null, workflows: null, outputs: null, agents: null,
      newAgent: null, newWorkflow: null, media: null, approvals: null, marketplace: null,
    },
    workflows: {
      ...model.workflows,
      items: model.workflows.items.map(w => ({
        ...w, description: null, href: null,
        activeRuns: w.activeRuns?.map(noHref) ?? null,
        latestRun: w.latestRun ? noHref(w.latestRun) : w.latestRun,
        steps: w.steps?.map(step => ({
          ...step, outputKey: null,
          agent: step.agent.kind === 'resolved' ? { ...step.agent, href: null } : step.agent,
        })) ?? null,
      })),
    },
    runs: { ...model.runs, items: model.runs.items.map(r => ({ ...r, href: null, workflowHref: null })) },
    approvals: { ...model.approvals, items: model.approvals.items.map(r => ({ ...r, outputKey: null, runHref: null })) },
    agents: { ...model.agents, items: model.agents.items.map(a => ({ ...a, href: null })) },
    outputs: { ...model.outputs, items: model.outputs.items.map(o => ({ ...o, fileUrl: null, runHref: null })) },
  }
}

/**
 * Independently authorized, read-only adapter to the EXACT Owner Command Center
 * presentation. Never changes getAllowedProjectIds, Owner loader, or RLS.
 */
export async function loadOrganizationProjectCommandCenter(slug: string): Promise<ProjectCommandCenterModel | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null
  const session = await createClient()
  const { data: { user }, error: authError } = await session.auth.getUser()
  if (authError || !user) return null

  const admin = createAdminClient()
  const scope = await resolveOrganizationReadScope(session, admin, user.id)
  if (!scope.role.active || scope.projectIds.length === 0) return null

  const { data: row, error } = await admin.from('projects')
    .select('id, name, slug, color, execution_paused, paused_at, paused_reason')
    .eq('slug', slug).in('id', [...scope.projectIds]).maybeSingle()
  if (error || !row || !scope.projectIds.includes(row.id)) return null

  const project: ResolvedProject = {
    id: row.id, name: row.name, slug: row.slug, color: row.color ?? '#6366f1',
    settings: {} as ResolvedProject['settings'],
    executionPaused: row.execution_paused ?? false,
    pausedAt: row.paused_at ?? null,
    pausedReason: row.paused_reason ?? null,
  }
  const db = admin as any
  const L = COMMAND_CENTER_LIMITS
  // Exactly scoped, allowlisted columns. Client-side post-filtering is NOT the
  // authorization boundary: every service-role request includes project_id.
  const settled = await Promise.allSettled([
    db.from('workflows')
      .select('id,name,description,steps,trigger,cron_expr,active,created_at', { count: 'exact' })
      .eq('project_id', project.id).order('created_at', { ascending: true }).limit(L.workflows),
    db.from('runs')
      .select('id,status,workflow_id,created_at,started_at,finished_at', { count: 'exact' })
      .eq('project_id', project.id).in('status', [...ACTIVE_RUN_STATUSES])
      .order('created_at', { ascending: false }).limit(L.activeRuns),
    db.from('runs')
      .select('id,status,created_at,started_at,finished_at,workflow_id,workflow_instance_id,action_kind,workflows(name)')
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(L.recentRuns),
    db.from('approvals')
      .select('id,output_key,kind,created_at,run_id,runs!inner(project_id,workflows(name))', { count: 'exact' })
      .eq('status', 'pending').eq('runs.project_id', project.id)
      .order('created_at', { ascending: false }).limit(L.approvals),
    db.from('agents').select('id,name,model', { count: 'exact' })
      .eq('project_id', project.id).order('name', { ascending: true }).limit(L.agents),
    db.from('outputs').select('id,run_id,name,type,created_at', { count: 'exact' })
      .eq('project_id', project.id).order('created_at', { ascending: false }).limit(L.outputs),
    listInstancesForProjects(admin, scopeProjectFilter([project.id]), { limit: L.instances + 1 }),
  ])
  const rawWorkflows = toRead<RawWorkflow>(settled[0])
  const workflows: Read<RawWorkflow> = rawWorkflows.ok
    ? { ...rawWorkflows, rows: rawWorkflows.rows.map(scrubWorkflowSteps) }
    : rawWorkflows
  const workflowRows = workflows.ok ? workflows.rows : []
  const referencedAgents = [...new Set(workflowRows.flatMap(w =>
    Array.isArray(w.steps) ? w.steps : []
  ).map(step => {
    const raw = step as { agent_id?: unknown } | null
    return typeof raw?.agent_id === 'string' ? raw.agent_id : null
  }).filter((value): value is string => !!value))]

  const [latest, stepAgents] = await Promise.all([
    Promise.allSettled(workflowRows.map(w =>
      db.from('runs').select('id,status,created_at,started_at,finished_at')
        .eq('project_id', project.id).eq('workflow_id', w.id)
        .order('created_at', { ascending: false }).limit(1),
    )),
    referencedAgents.length
      ? Promise.allSettled([db.from('agents').select('id,name,model')
        .eq('project_id', project.id).in('id', referencedAgents)])
        .then(([answer]) => answer)
      : Promise.resolve(null),
  ])
  const latestRunByWorkflow = new Map<string, Read<RawRunLite>>()
  workflowRows.forEach((w, i) => latestRunByWorkflow.set(w.id, toRead<RawRunLite>(latest[i])))
  const model = assembleProjectCommandCenter({
    project, now: new Date().toISOString(),
    workflows, latestRunByWorkflow,
    activeRuns: toRead<RawRunLite>(settled[1]),
    recentRuns: toRead<RawRun>(settled[2]),
    approvals: toRead<RawApproval>(settled[3]),
    agents: toRead<RawAgent>(settled[4]),
    outputs: toRead<RawOutput>(settled[5]),
    instances: toRead<WorkflowInstance>(settled[6]),
    stepAgents: stepAgents ? toRead<RawAgent>(stepAgents) : null,
    definitionFor: findVendoredDefinition,
  })
  return sanitizeOrganizationCommandCenter(model)
}
