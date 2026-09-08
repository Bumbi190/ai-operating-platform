import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { resolveDestination } from '@/lib/nav/registry'
import { listInstancesForProjects } from '@/lib/workflows/store'
import { wakeState, type WakeState } from '@/lib/workflows/schedule'

/**
 * Planning — an aggregated READ over work that already exists in the runtime.
 *
 * Planning is not an entity in Omnira. It is a VIEW over three canonical
 * sources, each of which is owned elsewhere:
 *
 *   backlog    `manager_tasks`      — the delegated-work backlog. The repo had
 *                                     already bound this route to that table
 *                                     (`view-records.ts`: planning → manager_tasks;
 *                                     `data-registry.ts`: "the planning /
 *                                     delegated-work backlog").
 *   recurring  `workflows`          — procedures with a cron trigger. The
 *                                     schedule IS `cron_expr`; there is no
 *                                     other recurrence source.
 *   releases   `workflow_instances` — long-lived executions, the same rows
 *                                     `/releases` renders.
 *
 * WHAT IS NOT HERE, AND WHY. `planning_items` and `sprints` exist in the schema
 * and are deliberately untouched: they have no producer, no consumer and no
 * Atlas write path, and adopting them would create a SECOND planning model
 * weaker than the one the runtime already uses. This module must never query
 * them.
 *
 * EVERY FIELD TRACES TO A COLUMN:
 *
 *   task status/priority  `manager_tasks.status` / `.priority` — the REAL
 *                         vocabulary, never remapped into prettier words
 *   task owner            `manager_tasks.owner` — FREE TEXT. There is no
 *                         task → agent foreign key anywhere in the schema, so
 *                         this is never presented as an agent.
 *   recurrence            `workflows.cron_expr` verbatim. No cron parser exists
 *                         in this repo, so no next-run time and no
 *                         human-readable recurrence is derived. A derived
 *                         timestamp here would be invented.
 *   release wake          `workflow_instances.wake_at`, classified by the
 *                         scheduler's own `wakeState`. This one IS real: a
 *                         scheduler writes the column.
 *
 * There is no deadline, due date, progress, dependency or ordering column on
 * any of the three tables. Those concepts are absent from the model on purpose.
 *
 * PROJECT ISOLATION (fail closed). Scoped exactly like every other Atlas
 * surface — `getAllowedProjectIds` then `scopeProjectFilter`, so an empty
 * allow-list resolves to an impossible id and yields zero rows rather than
 * every row. `manager_tasks.project_id` is NULLABLE; a null-project task
 * therefore never matches `.in(...)` and is DROPPED, which is the same
 * fail-closed choice the operations graph makes.
 *
 * WHY NOT `fetchRecords`. It is the canonical scoped manager_tasks reader, but
 * it is Atlas's TOOL executor: it emits a `[get_records]` audit line per call,
 * caps at 25 rows, and its column whitelist deliberately omits `project_id`
 * because that is its scope column, not payload. A page cannot group by project
 * through it, and page loads would forge tool-call audit entries. This module
 * reuses the thing `fetchRecords` itself reuses — the isolation boundary — the
 * same way `lib/os/organisation.ts` does.
 *
 * WHY NOT `lib/os/data.ts`. `fetchDashboardSnapshot` reads `workflows` through
 * the admin client with NO project scope. It is unusable for a scoped surface.
 *
 * WHY NOT `listInstances`. It filters by `def_key` only and is called with a
 * service-role client, so it is not project-scoped either. This module uses
 * `listInstancesForProjects`, the scoped sibling.
 *
 * READ ONLY. Nothing here writes, and there is no mutation path to Planning.
 */

// ── Vocabularies (source truth, never remapped) ──────────────────────────────

/**
 * `manager_tasks.status` as the CHECK constraint defines it. Used ONLY to order
 * groups; a value outside this list is still rendered, under its own raw name,
 * because an unrecognised status is information rather than an error.
 */
export const MANAGER_TASK_STATUS_ORDER = [
  'pending', 'in_progress', 'done', 'failed', 'cancelled',
] as const

/** `manager_tasks.priority` as the CHECK constraint defines it, most urgent first. */
export const MANAGER_TASK_PRIORITY_ORDER = [
  'critical', 'high', 'medium', 'low',
] as const

/** Upper bounds. A source that hits its bound reports `truncated`, never silence. */
export const PLANNING_TASK_LIMIT = 60
export const PLANNING_RECURRING_LIMIT = 40
export const PLANNING_RELEASE_LIMIT = 24

// ── Model ────────────────────────────────────────────────────────────────────

export interface PlanningProject {
  id: string
  name: string
  slug: string
  color: string
  /** The registry's project route, or null when it will not vouch for the slug. */
  href: string | null
}

export interface PlanningTask {
  id: string
  title: string
  /** `manager_tasks.status`, verbatim. */
  status: string
  /** `manager_tasks.priority`, verbatim. */
  priority: string
  /**
   * `manager_tasks.owner` — FREE TEXT, not a relation. No agent foreign key
   * exists on this table, so this must never be rendered as an agent.
   */
  owner: string | null
  /** `manager_tasks.source` — how the row got here (delegation, dream, …). */
  source: string | null
  projectId: string | null
  /** Real workflow route when both the workflow and its project are known. */
  workflowHref: string | null
  /** Real run route when both the run and its project are known. */
  runHref: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface PlanningTaskGroup {
  /** The raw status value. Group labels are presentation; this is the truth. */
  status: string
  /** True when this status is part of the declared CHECK vocabulary. */
  known: boolean
  tasks: PlanningTask[]
}

export interface PlanningRecurring {
  id: string
  name: string
  projectId: string | null
  /** `workflows.trigger` — 'cron' for everything in this list. */
  trigger: string
  /** `workflows.cron_expr`, verbatim. Never expanded into a next-run time. */
  cronExpr: string | null
  active: boolean
  href: string | null
}

export interface PlanningRelease {
  id: string
  /** The natural key for this execution — '2026-11' for a month. */
  instanceKey: string
  defKey: string
  projectId: string
  /** Projection of the transition history, as stored. */
  currentState: string
  status: string
  wakeAt: string | null
  /** Classified by the scheduler's own helper, never by a local rule. */
  wake: WakeState
  lastTickAt: string | null
  lastTickOutcome: string | null
}

export interface PlanningModel {
  projects: PlanningProject[]
  taskGroups: PlanningTaskGroup[]
  taskCount: number
  recurring: PlanningRecurring[]
  releases: PlanningRelease[]
  /** A source that reached its bound — more rows exist than are shown. */
  truncated: { tasks: boolean; recurring: boolean; releases: boolean }
  /**
   * false means COULD NOT READ, which is not the same as "nothing planned".
   * The view must render these as explicit unavailable states.
   */
  availability: {
    projects: boolean
    tasks: boolean
    recurring: boolean
    releases: boolean
  }
}

const DEFAULT_PROJECT_COLOR = '#6366f1'

// ── Pure assembly ────────────────────────────────────────────────────────────

interface RawProject { id: string; name: string; slug: string; color: string | null }

interface RawTask {
  id: string
  project_id: string | null
  title: string
  status: string | null
  priority: string | null
  owner: string | null
  source: string | null
  workflow_id: string | null
  run_id: string | null
  created_at: string | null
  updated_at: string | null
}

interface RawWorkflow {
  id: string
  project_id: string | null
  name: string
  trigger: string | null
  cron_expr: string | null
  active: boolean | null
}

export interface AssemblePlanningInput {
  projects: readonly RawProject[]
  tasks: readonly RawTask[]
  workflows: readonly RawWorkflow[]
  releases: readonly PlanningRelease[]
  truncated: PlanningModel['truncated']
  availability: PlanningModel['availability']
}

function priorityRank(priority: string): number {
  const at = (MANAGER_TASK_PRIORITY_ORDER as readonly string[]).indexOf(priority)
  return at === -1 ? MANAGER_TASK_PRIORITY_ORDER.length : at
}

/**
 * Build the surface from already-fetched, already-scoped rows.
 *
 * Pure, so the rules that matter — a task outside the scoped project set
 * appears nowhere, an unknown status keeps its own name instead of being folded
 * into a known one, a link is only built when its project resolves — are
 * assertable without a database.
 */
export function assemblePlanningModel(input: AssemblePlanningInput): PlanningModel {
  const projects = input.projects.map<PlanningProject>((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    color: project.color ?? DEFAULT_PROJECT_COLOR,
    // Straight from the registry, with no hard-coded fallback: a slug the
    // registry will not vouch for yields no href and the row renders
    // non-interactive rather than pointing at a guessed path.
    href: resolveDestination('project_home', { project: project.slug })?.href ?? null,
  }))

  const allowedProjectIds = new Set(projects.map((project) => project.id))
  const projectHref = new Map(projects.map((project) => [project.id, project.href]))

  // ── Backlog ──
  // The queries are already scoped; this is the same belt-and-braces guard the
  // organisation hierarchy applies before rendering.
  const visibleTasks = input.tasks.filter(
    (task) => task.project_id !== null && allowedProjectIds.has(task.project_id),
  )

  const byStatus = new Map<string, PlanningTask[]>()
  for (const task of visibleTasks) {
    const home = task.project_id ? projectHref.get(task.project_id) ?? null : null
    const status = task.status ?? 'unknown'
    const bucket = byStatus.get(status) ?? []
    bucket.push({
      id: task.id,
      title: task.title,
      status,
      priority: task.priority ?? 'unknown',
      owner: task.owner?.trim() ? task.owner.trim() : null,
      source: task.source?.trim() ? task.source.trim() : null,
      projectId: task.project_id,
      // `<project route>/workflows/<id>` and `/runs/<id>` are real pages. Built
      // from the project's own resolved route rather than restated, so this
      // module holds exactly one project URL shape and it comes from the registry.
      workflowHref: home && task.workflow_id ? `${home}/workflows/${task.workflow_id}` : null,
      runHref: home && task.run_id ? `${home}/runs/${task.run_id}` : null,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    })
    byStatus.set(status, bucket)
  }

  // Declared statuses in their canonical order, then anything unrecognised in
  // stable alphabetical order. An unknown status is never folded into a known
  // one — that would be a mapping that changes meaning.
  const declared = MANAGER_TASK_STATUS_ORDER as readonly string[]
  const seen = [...byStatus.keys()]
  const orderedStatuses = [
    ...declared.filter((status) => byStatus.has(status)),
    ...seen.filter((status) => !declared.includes(status)).sort(),
  ]

  const taskGroups = orderedStatuses.map<PlanningTaskGroup>((status) => ({
    status,
    known: declared.includes(status),
    tasks: (byStatus.get(status) ?? []).sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority)
        || a.title.localeCompare(b.title, 'sv'),
    ),
  }))

  // ── Recurring ──
  const recurring = input.workflows
    .filter((workflow) => workflow.project_id !== null && allowedProjectIds.has(workflow.project_id))
    .map<PlanningRecurring>((workflow) => {
      const home = workflow.project_id ? projectHref.get(workflow.project_id) ?? null : null
      return {
        id: workflow.id,
        name: workflow.name,
        projectId: workflow.project_id,
        trigger: workflow.trigger ?? 'unknown',
        cronExpr: workflow.cron_expr?.trim() ? workflow.cron_expr.trim() : null,
        active: workflow.active === true,
        href: home ? `${home}/workflows/${workflow.id}` : null,
      }
    })
    // Active schedules first — a paused one is still shown, marked paused,
    // because a configured-but-off schedule is planning information.
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'sv'))

  // ── Releases ──
  const releases = input.releases
    .filter((release) => allowedProjectIds.has(release.projectId))

  return {
    projects,
    taskGroups,
    taskCount: visibleTasks.length,
    recurring,
    releases,
    truncated: input.truncated,
    availability: input.availability,
  }
}

// ── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load the Planning surface for the signed-in operator.
 *
 * Every source is read independently through `Promise.allSettled`, so one
 * failing table degrades exactly one section instead of blanking the page —
 * and the failure is reported as UNAVAILABLE rather than as an empty backlog.
 */
export async function loadPlanningModel(): Promise<PlanningModel | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createAdminClient()
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  const scopedIds = scopeProjectFilter(allowedProjectIds)

  const [projectsRes, tasksRes, workflowsRes, releasesRes] = await Promise.allSettled([
    (db.from('projects') as any)
      .select('id, name, slug, color')
      .in('id', scopedIds)
      .order('created_at', { ascending: true }),
    // `manager_tasks.project_id` is nullable — a null-project task cannot match
    // `.in(...)` and is therefore dropped, which is the fail-closed answer.
    (db.from('manager_tasks') as any)
      .select('id, project_id, title, status, priority, owner, source, workflow_id, run_id, created_at, updated_at')
      .in('project_id', scopedIds)
      .order('created_at', { ascending: false })
      .limit(PLANNING_TASK_LIMIT),
    // Recurrence IS the cron trigger. A workflow with any other trigger is not
    // recurring work and has no place in this section.
    (db.from('workflows') as any)
      .select('id, project_id, name, trigger, cron_expr, active')
      .eq('trigger', 'cron')
      .in('project_id', scopedIds)
      .limit(PLANNING_RECURRING_LIMIT),
    listInstancesForProjects(db, scopedIds, PLANNING_RELEASE_LIMIT),
  ])

  // A rejected settle and a PostgREST error envelope are the same outcome here:
  // the source could not be read. Both must reach `availability` as false.
  const ok = (res: PromiseSettledResult<any>): boolean =>
    res.status === 'fulfilled' && !res.value?.error
  const rows = <T,>(res: PromiseSettledResult<any>): T[] =>
    res.status === 'fulfilled' && !res.value?.error ? (res.value.data ?? []) : []

  const projectsOk = ok(projectsRes)
  const tasksOk = ok(tasksRes)
  const recurringOk = ok(workflowsRes)
  // listInstancesForProjects throws rather than returning an error envelope.
  const releasesOk = releasesRes.status === 'fulfilled'

  const projects = rows<RawProject>(projectsRes)
  const tasks = rows<RawTask>(tasksRes)
  const workflows = rows<RawWorkflow>(workflowsRes)
  const instances = releasesOk ? (releasesRes.value as any[]) : []

  const now = new Date().toISOString()
  const releases = instances.map<PlanningRelease>((instance) => ({
    id: instance.id,
    instanceKey: instance.instance_key,
    defKey: instance.def_key,
    projectId: instance.project_id,
    currentState: instance.current_state,
    status: instance.status,
    wakeAt: instance.wake_at,
    wake: wakeState(instance.wake_at, now),
    lastTickAt: instance.last_tick_at,
    lastTickOutcome: instance.last_tick_outcome,
  }))

  return assemblePlanningModel({
    projects,
    tasks,
    workflows,
    releases,
    truncated: {
      tasks: tasks.length >= PLANNING_TASK_LIMIT,
      recurring: workflows.length >= PLANNING_RECURRING_LIMIT,
      releases: releases.length >= PLANNING_RELEASE_LIMIT,
    },
    availability: {
      projects: projectsOk,
      tasks: tasksOk,
      recurring: recurringOk,
      releases: releasesOk,
    },
  })
}
