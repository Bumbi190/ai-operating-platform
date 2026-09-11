import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import { resolveDestination } from '@/lib/nav/registry'
import { listInstancesForProjects } from '@/lib/workflows/store'
import { isSchedulable, wakeState, type WakeState } from '@/lib/workflows/schedule'
import { findVendoredDefinition, type VendoredDefinition } from '@/lib/workflows/definitions'
import type { WorkflowInstance } from '@/lib/workflows/types'
import type { ResolvedProject } from '@/lib/project/get-project'
import type { SectionState } from '@/lib/os/project-command-center-shared'

/**
 * Project Command Center — one project's operational workspace, built only from
 * what the runtime stores about it.
 *
 * ── SOURCES ────────────────────────────────────────────────────────────────
 *   project      getProjectBySlug (RLS client; the route already 404s a slug the
 *                caller does not own — foreign and unknown are the same answer)
 *   workflows    `workflows` — steps rendered from `steps[]`, never a fixed count
 *   instances    `workflow_instances` through `listInstancesForProjects`, the
 *                existing scoped reader, handed this ONE project's id
 *   runs         `runs` — status in the stored RunStatus vocabulary
 *   approvals    `approvals` scoped THROUGH THE RUN (`runs!inner`), the rule
 *                /approvals and the decision route already use
 *   agents       `agents` — identity and model; Agent Detail v2 owns the rest
 *   outputs      `outputs` — stored artifact rows; content is never rendered
 *
 * ── ISOLATION ──────────────────────────────────────────────────────────────
 * Every owner-policied table is read through the caller's RLS-bound client, so
 * the database enforces the tenant boundary and each query ALSO names this
 * project explicitly. The one service-role read is `workflow_instances`, which
 * has no client policy at all (SERVER_ONLY): it goes through the scoped reader
 * with an allow-list of exactly the project the RLS client just resolved. No
 * query here derives a project on its own, falls back to another one, or reads
 * without a project filter.
 *
 * ── HONESTY ────────────────────────────────────────────────────────────────
 * A source that fails is `state: 'error'` — never an empty list, never a zero.
 * `undefined` means "could not be read"; `null` means "read, and there is none".
 * Nothing here computes progress, a score, a duration estimate or a health
 * figure: none of those is stored anywhere in the schema.
 */

export const COMMAND_CENTER_LIMITS = {
  workflows: 12,
  recentRuns: 8,
  activeRuns: 25,
  approvals: 5,
  agents: 12,
  outputs: 5,
  instances: 6,
} as const

/** RunStatus values that are not terminal: queued, executing, or held for review. */
export const ACTIVE_RUN_STATUSES = ['pending', 'running', 'awaiting_approval'] as const

export type Read<T> = { ok: true; rows: T[]; count: number | null } | { ok: false }

// ── Raw rows (exactly the columns selected) ──────────────────────────────────

interface WorkflowNameEmbed { name: string | null }

export interface RawWorkflow {
  id: string
  name: string
  description: string | null
  steps: unknown
  trigger: string | null
  cron_expr: string | null
  active: boolean | null
  created_at: string | null
}

export interface RawRunLite {
  id: string
  status: string | null
  workflow_id?: string | null
  created_at: string | null
  started_at: string | null
  finished_at: string | null
}

export interface RawRun extends RawRunLite {
  workflow_instance_id: string | null
  action_kind: string | null
  workflows?: WorkflowNameEmbed | WorkflowNameEmbed[] | null
}

export interface RawApproval {
  id: string
  output_key: string | null
  kind: string | null
  created_at: string | null
  run_id: string | null
  runs?: { project_id: string; workflows?: WorkflowNameEmbed | WorkflowNameEmbed[] | null }
    | { project_id: string; workflows?: WorkflowNameEmbed | WorkflowNameEmbed[] | null }[]
    | null
}

export interface RawAgent {
  id: string
  name: string
  model: string | null
}

export interface RawOutput {
  id: string
  run_id: string | null
  name: string | null
  type: string | null
  file_url: string | null
  created_at: string | null
}

// ── The model the view renders ───────────────────────────────────────────────

export type CommandCenterStepAgent =
  /** The step names an agent, and that agent exists in THIS project. */
  | { kind: 'resolved'; id: string; name: string; model: string | null; href: string | null }
  /** The step names an agent id that this project does not contain. */
  | { kind: 'unresolved'; id: string }
  /** The step names no agent at all. */
  | { kind: 'unassigned' }
  /** The step names an agent, but the agent lookup failed — not known either way. */
  | { kind: 'unknown'; id: string }

export interface CommandCenterStep {
  /** 1-based position after ordering by the stored `order`, then declaration order. */
  position: number
  /** The stored `order` value, when it is a number. */
  order: number | null
  name: string | null
  outputKey: string | null
  agent: CommandCenterStepAgent
}

export interface CommandCenterRunRef {
  id: string
  /** Verbatim `runs.status`. The view maps known values to labels and says so when it cannot. */
  status: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  href: string | null
}

export interface CommandCenterWorkflow {
  id: string
  name: string
  description: string | null
  /** Verbatim `workflows.trigger`. */
  trigger: string | null
  /** Verbatim `workflows.cron_expr`. No cron parser exists here, so none is invented. */
  cronExpr: string | null
  active: boolean | null
  href: string | null
  /** null → `steps` is not a readable list. [] → the workflow declares no steps. */
  steps: CommandCenterStep[] | null
  /** undefined → could not be read · null → this workflow has never run. */
  latestRun: CommandCenterRunRef | null | undefined
  /** Non-terminal runs of this workflow right now. null → not known. */
  activeRuns: CommandCenterRunRef[] | null
}

export type CommandCenterDefinition =
  | {
      kind: 'declared'
      states: { id: string; description: string | null; humanGate: boolean }[]
      /** -1 when the stored `current_state` is not a state the definition declares. */
      currentIndex: number
      /** The definition's own `next_state` for the current state — its single successor on success. */
      nextState: string | null
      terminal: boolean
    }
  /** This deployment does not vendor that definition key and version. */
  | { kind: 'not_vendored' }
  /** A definition is vendored, but its hash is not the one the instance was created from. */
  | { kind: 'hash_mismatch' }
  /** The vendored definitions could not be loaded at all. */
  | { kind: 'unreadable' }

export interface CommandCenterInstance {
  id: string
  defKey: string
  defVersion: number
  instanceKey: string
  /** Verbatim `workflow_instances.status`. */
  status: string
  /** Verbatim `workflow_instances.current_state`. */
  currentState: string
  /**
   * The scheduler's own `wakeState`, or null when the instance is not
   * schedulable at all (`isSchedulable` — complete and abandoned instances are
   * never eligible, whatever `wake_at` still says).
   */
  wake: WakeState | null
  wakeAt: string | null
  lastTickAt: string | null
  lastTickOutcome: string | null
  definition: CommandCenterDefinition
}

export interface CommandCenterRun extends CommandCenterRunRef {
  workflowName: string | null
  workflowHref: string | null
  /** Verbatim `runs.action_kind` — how a workflow-instance action run names itself. */
  actionKind: string | null
}

export interface CommandCenterApproval {
  id: string
  outputKey: string | null
  kind: string | null
  createdAt: string | null
  workflowName: string | null
  runHref: string | null
}

export interface CommandCenterAgent {
  id: string
  name: string
  model: string | null
  href: string | null
}

export interface CommandCenterOutput {
  id: string
  name: string | null
  /** Verbatim `outputs.type`. */
  type: string | null
  createdAt: string | null
  runHref: string | null
  /** Only an http(s) URL is ever linked. */
  fileUrl: string | null
}

export interface CommandCenterSection<T> {
  state: SectionState
  items: T[]
  /** Exact total where the source reports one; null when it does not or could not be read. */
  total: number | null
  truncated: boolean
}

export interface ProjectCommandCenterModel {
  project: {
    id: string
    name: string
    slug: string
    color: string
    href: string | null
    executionPaused: boolean
    pausedAt: string | null
    pausedReason: string | null
  }
  links: {
    runs: string | null
    workflows: string | null
    outputs: string | null
    agents: string | null
    newAgent: string | null
    newWorkflow: string | null
    media: string | null
    approvals: string | null
  }
  activity: {
    /** Exact count of non-terminal runs. null → not known (never shown as zero). */
    activeRuns: number | null
    lastRun: { state: 'ok'; at: string | null } | { state: 'error' }
  }
  workflows: CommandCenterSection<CommandCenterWorkflow>
  instances: CommandCenterSection<CommandCenterInstance>
  runs: CommandCenterSection<CommandCenterRun>
  approvals: CommandCenterSection<CommandCenterApproval>
  agents: CommandCenterSection<CommandCenterAgent>
  outputs: CommandCenterSection<CommandCenterOutput>
}

export interface AssembleCommandCenterInput {
  project: ResolvedProject
  now: string
  workflows: Read<RawWorkflow>
  /** Latest run per workflow id. A missing entry means that lookup did not succeed. */
  latestRunByWorkflow: ReadonlyMap<string, Read<RawRunLite>>
  activeRuns: Read<RawRunLite>
  recentRuns: Read<RawRun>
  approvals: Read<RawApproval>
  agents: Read<RawAgent>
  /** Agents named by any step. null → no step names an agent, so nothing was looked up. */
  stepAgents: Read<RawAgent> | null
  outputs: Read<RawOutput>
  instances: Read<WorkflowInstance>
  definitionFor: (defKey: string, version: number) => VendoredDefinition | null
}

// ── Pure assembly ────────────────────────────────────────────────────────────

const one = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const httpUrl = (value: unknown): string | null => {
  const candidate = text(value)
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : null
}

/**
 * `truncated` comes from the source's exact count when it reports one. A reader
 * that returns no count (the instance reader) is asked for one row more than is
 * shown, and the caller passes what that told it.
 */
function section<T>(read: Read<unknown>, items: T[], truncated?: boolean): CommandCenterSection<T> {
  if (!read.ok) return { state: 'error', items: [], total: null, truncated: false }
  const total = read.count
  return {
    state: 'ok',
    items,
    total,
    truncated: truncated ?? (total !== null && total > items.length),
  }
}

/**
 * Order steps by the stored `order`, then by declaration. A step without a
 * numeric `order` keeps its declared place after the numbered ones — nothing
 * is renumbered in storage, the position is display only.
 */
function orderSteps(raw: unknown[]): { step: Record<string, unknown>; index: number }[] {
  return raw
    .map((step, index) => ({ step: (step && typeof step === 'object' ? step : {}) as Record<string, unknown>, index }))
    .sort((a, b) => {
      const ao = typeof a.step.order === 'number' ? a.step.order : Number.POSITIVE_INFINITY
      const bo = typeof b.step.order === 'number' ? b.step.order : Number.POSITIVE_INFINITY
      return ao === bo ? a.index - b.index : ao - bo
    })
}

function runRef(row: RawRunLite, runHref: (id: string) => string | null): CommandCenterRunRef {
  return {
    id: row.id,
    status: text(row.status),
    createdAt: row.created_at ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    href: runHref(row.id),
  }
}

function describeDefinition(
  instance: WorkflowInstance,
  definitionFor: AssembleCommandCenterInput['definitionFor'],
): CommandCenterDefinition {
  let definition: VendoredDefinition | null
  try {
    definition = definitionFor(instance.def_key, instance.def_version)
  } catch {
    return { kind: 'unreadable' }
  }
  if (!definition) return { kind: 'not_vendored' }
  // An instance is bound to the exact definition it was created from. A vendored
  // definition with another hash is a different workflow, and rendering its
  // states against this instance would describe a shape it never had.
  if (definition.def_hash !== instance.def_hash) return { kind: 'hash_mismatch' }

  const states = definition.spec.states.map((state) => ({
    id: state.id,
    description: text(state.description),
    humanGate: state.human_gate?.required === true,
  }))
  const current = definition.spec.states.find((state) => state.id === instance.current_state)
  return {
    kind: 'declared',
    states,
    currentIndex: states.findIndex((state) => state.id === instance.current_state),
    nextState: current?.next_state ?? null,
    terminal: definition.spec.terminal_states.includes(instance.current_state),
  }
}

export function assembleProjectCommandCenter(input: AssembleCommandCenterInput): ProjectCommandCenterModel {
  const { project } = input
  const L = COMMAND_CENTER_LIMITS

  // Every project URL starts from the registry's path-mode destination, so the
  // shape of a project route is stated in exactly one place (the Organisation
  // and Agent Detail pattern). A slug the registry will not vouch for yields no
  // links rather than a hand-built one.
  const projectHref = resolveDestination('project_home', { project: project.slug })?.href ?? null
  const under = (path: string): string | null => (projectHref ? `${projectHref}/${path}` : null)
  const runHref = (id: string) => under(`runs/${id}`)
  const workflowHref = (id: string) => under(`workflows/${id}`)
  const agentHref = (id: string) => under(`agents/${id}`)

  // ── Agents that steps name ──
  const stepAgentsById = new Map<string, RawAgent>()
  if (input.stepAgents?.ok) for (const agent of input.stepAgents.rows) stepAgentsById.set(agent.id, agent)

  const resolveStepAgent = (agentId: string | null): CommandCenterStepAgent => {
    if (!agentId) return { kind: 'unassigned' }
    if (!input.stepAgents || !input.stepAgents.ok) return { kind: 'unknown', id: agentId }
    const agent = stepAgentsById.get(agentId)
    if (!agent) return { kind: 'unresolved', id: agentId }
    return { kind: 'resolved', id: agent.id, name: agent.name, model: text(agent.model), href: agentHref(agent.id) }
  }

  // ── Active runs, grouped by workflow ──
  const activeByWorkflow = new Map<string, CommandCenterRunRef[]>()
  if (input.activeRuns.ok) {
    for (const row of input.activeRuns.rows) {
      if (!row.workflow_id) continue
      const list = activeByWorkflow.get(row.workflow_id) ?? []
      list.push(runRef(row, runHref))
      activeByWorkflow.set(row.workflow_id, list)
    }
  }

  // ── Workflows ──
  const workflowRows = input.workflows.ok ? input.workflows.rows : []
  const workflows: CommandCenterWorkflow[] = workflowRows.map((row) => {
    const steps = Array.isArray(row.steps)
      ? orderSteps(row.steps).map(({ step }, index): CommandCenterStep => ({
          position: index + 1,
          order: typeof step.order === 'number' ? step.order : null,
          name: text(step.name),
          outputKey: text(step.output_key),
          agent: resolveStepAgent(text(step.agent_id)),
        }))
      : null

    const latest = input.latestRunByWorkflow.get(row.id)
    const latestRun = latest && latest.ok
      ? (latest.rows[0] ? runRef(latest.rows[0], runHref) : null)
      : undefined

    return {
      id: row.id,
      name: row.name,
      description: text(row.description),
      trigger: text(row.trigger),
      cronExpr: text(row.cron_expr),
      active: typeof row.active === 'boolean' ? row.active : null,
      href: workflowHref(row.id),
      steps,
      latestRun,
      activeRuns: input.activeRuns.ok ? activeByWorkflow.get(row.id) ?? [] : null,
    }
  })

  // Work that is happening leads; then the most recently run; then by name.
  const lastActivity = (workflow: CommandCenterWorkflow) => Math.max(
    ...[workflow.activeRuns?.[0]?.createdAt, workflow.latestRun?.createdAt]
      .map((at) => (at ? Date.parse(at) : Number.NEGATIVE_INFINITY))
      .map((ms) => (Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms)),
  )
  workflows.sort((a, b) => {
    const aActive = (a.activeRuns?.length ?? 0) > 0 ? 1 : 0
    const bActive = (b.activeRuns?.length ?? 0) > 0 ? 1 : 0
    if (aActive !== bActive) return bActive - aActive
    const byTime = lastActivity(b) - lastActivity(a)
    if (byTime !== 0 && !Number.isNaN(byTime)) return byTime
    return a.name.localeCompare(b.name, 'sv')
  })

  // ── Instances ──
  const instanceRows = input.instances.ok ? input.instances.rows : []
  const instances: CommandCenterInstance[] = instanceRows.slice(0, L.instances).map((row) => ({
    id: row.id,
    defKey: row.def_key,
    defVersion: row.def_version,
    instanceKey: row.instance_key,
    status: row.status,
    currentState: row.current_state,
    wake: isSchedulable(row) ? wakeState(row.wake_at, input.now) : null,
    wakeAt: row.wake_at,
    lastTickAt: row.last_tick_at,
    lastTickOutcome: text(row.last_tick_outcome),
    definition: describeDefinition(row, input.definitionFor),
  }))

  // ── Recent runs ──
  const runs: CommandCenterRun[] = (input.recentRuns.ok ? input.recentRuns.rows : []).map((row) => {
    const workflow = one(row.workflows)
    return {
      ...runRef(row, runHref),
      workflowName: text(workflow?.name),
      workflowHref: row.workflow_id ? workflowHref(row.workflow_id) : null,
      actionKind: text(row.action_kind),
    }
  })

  // ── Approvals ──
  const approvals: CommandCenterApproval[] = (input.approvals.ok ? input.approvals.rows : []).map((row) => {
    const run = one(row.runs)
    return {
      id: row.id,
      outputKey: text(row.output_key),
      kind: text(row.kind),
      createdAt: row.created_at ?? null,
      workflowName: text(one(run?.workflows)?.name),
      runHref: row.run_id ? runHref(row.run_id) : null,
    }
  })

  // ── Agents ──
  const agents: CommandCenterAgent[] = (input.agents.ok ? input.agents.rows : []).map((row) => ({
    id: row.id,
    name: row.name,
    model: text(row.model),
    href: agentHref(row.id),
  }))

  // ── Outputs ──
  const outputs: CommandCenterOutput[] = (input.outputs.ok ? input.outputs.rows : []).map((row) => ({
    id: row.id,
    name: text(row.name),
    type: text(row.type),
    createdAt: row.created_at ?? null,
    runHref: row.run_id ? runHref(row.run_id) : null,
    fileUrl: httpUrl(row.file_url),
  }))

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color,
      href: projectHref,
      executionPaused: project.executionPaused,
      pausedAt: project.pausedAt,
      pausedReason: text(project.pausedReason),
    },
    links: {
      runs: under('runs'),
      workflows: under('workflows'),
      outputs: under('outputs'),
      agents: under('agents'),
      newAgent: under('agents/new'),
      newWorkflow: under('workflows/new'),
      media: under('media'),
      // The approvals queue has no project filter, so no project is claimed in its link.
      approvals: resolveDestination('approvals')?.href ?? null,
    },
    activity: {
      activeRuns: input.activeRuns.ok ? input.activeRuns.count ?? input.activeRuns.rows.length : null,
      lastRun: input.recentRuns.ok
        ? { state: 'ok', at: input.recentRuns.rows[0]?.created_at ?? null }
        : { state: 'error' },
    },
    workflows: section(input.workflows, workflows),
    instances: section(input.instances, instances, instanceRows.length > L.instances),
    runs: section(input.recentRuns, runs, false),
    approvals: section(input.approvals, approvals),
    agents: section(input.agents, agents),
    outputs: section(input.outputs, outputs),
  }
}

// ── I/O ──────────────────────────────────────────────────────────────────────

/** A PostgREST envelope, a thrown query and a thrown reader all mean the same thing: not read. */
function toRead<T>(settled: PromiseSettledResult<unknown>): Read<T> {
  if (settled.status !== 'fulfilled') return { ok: false }
  const value = settled.value as { data?: unknown; error?: unknown; count?: unknown } | T[] | null
  if (Array.isArray(value)) return { ok: true, rows: value as T[], count: null }
  if (!value || value.error) return { ok: false }
  return {
    ok: true,
    rows: (Array.isArray(value.data) ? value.data : []) as T[],
    count: typeof value.count === 'number' ? value.count : null,
  }
}

/**
 * Load the Command Center for a project the caller has ALREADY resolved through
 * `getProjectBySlug` — i.e. a project RLS returned to this session. The loader
 * never resolves a project itself, so it has no path to a first-project or
 * global fallback.
 */
export async function loadProjectCommandCenter(project: ResolvedProject): Promise<ProjectCommandCenterModel> {
  const db = await createClient()
  const L = COMMAND_CENTER_LIMITS

  const [workflowsRes, activeRes, recentRes, approvalsRes, agentsRes, outputsRes, instancesRes] =
    await Promise.allSettled([
      (db.from('workflows') as any)
        .select('id, name, description, steps, trigger, cron_expr, active, created_at', { count: 'exact' })
        .eq('project_id', project.id)
        .order('created_at', { ascending: true })
        .limit(L.workflows),
      (db.from('runs') as any)
        .select('id, status, workflow_id, created_at, started_at, finished_at', { count: 'exact' })
        .eq('project_id', project.id)
        .in('status', [...ACTIVE_RUN_STATUSES])
        .order('created_at', { ascending: false })
        .limit(L.activeRuns),
      (db.from('runs') as any)
        .select('id, status, created_at, started_at, finished_at, workflow_id, workflow_instance_id, action_kind, workflows(name)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(L.recentRuns),
      // Scoped THROUGH THE RUN: `approvals.project_id` is nullable and nearly
      // always null, so the run is what places an approval in a project.
      (db.from('approvals') as any)
        .select('id, output_key, kind, created_at, run_id, runs!inner(project_id, workflows(name))', { count: 'exact' })
        .eq('status', 'pending')
        .eq('runs.project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(L.approvals),
      (db.from('agents') as any)
        .select('id, name, model', { count: 'exact' })
        .eq('project_id', project.id)
        .order('name', { ascending: true })
        .limit(L.agents),
      (db.from('outputs') as any)
        .select('id, run_id, name, type, file_url, created_at', { count: 'exact' })
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(L.outputs),
      // SERVER_ONLY table: the scoped reader, with exactly this project.
      listInstancesForProjects(createAdminClient(), scopeProjectFilter([project.id]), { limit: L.instances + 1 }),
    ])

  const workflows = toRead<RawWorkflow>(workflowsRes)
  const workflowRows = workflows.ok ? workflows.rows : []

  const referencedAgentIds = [...new Set(
    workflowRows.flatMap((workflow) => (Array.isArray(workflow.steps) ? workflow.steps : []))
      .map((step) => text((step as { agent_id?: unknown } | null)?.agent_id))
      .filter((id): id is string => id !== null),
  )]

  const [latestSettled, stepAgentsSettled] = await Promise.all([
    Promise.allSettled(workflowRows.map((workflow) =>
      (db.from('runs') as any)
        .select('id, status, created_at, started_at, finished_at')
        .eq('project_id', project.id)
        .eq('workflow_id', workflow.id)
        .order('created_at', { ascending: false })
        .limit(1),
    )),
    referencedAgentIds.length > 0
      ? Promise.allSettled([
          (db.from('agents') as any)
            .select('id, name, model')
            .eq('project_id', project.id)
            .in('id', referencedAgentIds),
        ]).then(([settled]) => settled)
      : Promise.resolve(null),
  ])

  const latestRunByWorkflow = new Map<string, Read<RawRunLite>>()
  workflowRows.forEach((workflow, index) => {
    latestRunByWorkflow.set(workflow.id, toRead<RawRunLite>(latestSettled[index]))
  })

  return assembleProjectCommandCenter({
    project,
    now: new Date().toISOString(),
    workflows,
    latestRunByWorkflow,
    activeRuns: toRead<RawRunLite>(activeRes),
    recentRuns: toRead<RawRun>(recentRes),
    approvals: toRead<RawApproval>(approvalsRes),
    agents: toRead<RawAgent>(agentsRes),
    stepAgents: stepAgentsSettled ? toRead<RawAgent>(stepAgentsSettled) : null,
    outputs: toRead<RawOutput>(outputsRes),
    instances: toRead<WorkflowInstance>(instancesRes),
    // A throw from the vendored registry is caught per instance and shown as unreadable.
    definitionFor: findVendoredDefinition,
  })
}
