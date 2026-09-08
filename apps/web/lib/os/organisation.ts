import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { OPERATOR_DISPLAY_NAME } from '@/lib/atlas/identity'
import { resolveDestination } from '@/lib/nav/registry'
import type { WorkflowStep } from '@/lib/supabase/types'

/**
 * Organisation — who belongs where, and who is working right now.
 *
 * Andre → Atlas → projects → agents. HIERARCHY and MEMBERSHIP only. The
 * Intelligence Graph owns relationships, dependencies and knowledge flow; this
 * module deliberately carries no memory, skill, tool or workflow edge, and
 * nothing inferred.
 *
 * WHAT IS REAL, AND WHAT IS NOT. Every field below traces to a column:
 *
 *   operator            OPERATOR_DISPLAY_NAME, or the signed-in user's own name
 *   projects            `projects` — scoped by getAllowedProjectIds
 *   project → agent     `agents.project_id`, the only ownership link that exists
 *   agent identity      `agents.name`, `.description`, `.model`
 *   agent activity      running `runs` → `workflows.steps[].agent_id`
 *
 * `agents` has NO status column — no `active`, no `last_seen`. An agent is
 * "working" only when a RUNNING run's workflow names it in a step, which is the
 * same link `fetchActiveExecution` already follows. When that query fails the
 * answer is `null` — unknown — never `false`, because rendering "idle" for an
 * agent we could not ask about is a fabricated status.
 *
 * WHY NOT `lib/os/agents-activity.ts`. Despite the name, `RunningAgent`
 * describes a RUN: workflow name, step, progress, ETA. It carries no agent
 * identity at all, and `fetchAgentActivity` queries every run in the database
 * with no project scope. Neither fits a scoped per-agent hierarchy.
 */

export interface OrganisationAgent {
  id: string
  name: string
  /** Trimmed to one line; null when the row has none. */
  description: string | null
  model: string
  /** The existing agent route, or null when it cannot be built. */
  href: string | null
  /**
   * true  — a running run's workflow names this agent in a step
   * false — no running run names it
   * null  — activity could not be determined; render a neutral state
   */
  working: boolean | null
}

export interface OrganisationProject {
  id: string
  name: string
  slug: string
  color: string
  /** The existing project route, or null when the registry cannot build it. */
  href: string | null
  agents: OrganisationAgent[]
  /** Running runs in this project, or null when unavailable. */
  runningRuns: number | null
}

export interface OrganisationModel {
  operatorName: string
  projects: OrganisationProject[]
  availability: {
    projects: boolean
    agents: boolean
    activity: boolean
  }
}

interface RawProject { id: string; name: string; slug: string; color: string | null }
interface RawAgent {
  id: string
  project_id: string
  name: string
  description: string | null
  model: string | null
}

export interface AssembleOrganisationInput {
  operatorName: string
  projects: readonly RawProject[]
  agents: readonly RawAgent[]
  /** Agent ids named by a step of a currently-running run. */
  workingAgentIds: ReadonlySet<string> | null
  /** Running-run counts by project id, or null when runs were unavailable. */
  runningRunsByProject: ReadonlyMap<string, number> | null
  availability: OrganisationModel['availability']
}

const DEFAULT_PROJECT_COLOR = '#6366f1'

/**
 * Build the hierarchy from already-fetched, already-scoped rows.
 *
 * Pure, so the rules that matter — an agent appears under its own project and
 * nowhere else, an agent whose project is out of scope appears nowhere at all,
 * unknown activity stays unknown — are assertable without a database.
 */
export function assembleOrganisationModel(
  input: AssembleOrganisationInput,
): OrganisationModel {
  const allowedProjectIds = new Set(input.projects.map((project) => project.id))

  const agentsByProject = new Map<string, OrganisationAgent[]>()
  for (const agent of input.agents) {
    // An agent whose project is not in the scoped set is not rendered anywhere.
    // The query is already scoped; this is the same belt-and-braces guard the
    // platform layout applies to its own project list before serialising it.
    if (!allowedProjectIds.has(agent.project_id)) continue

    const bucket = agentsByProject.get(agent.project_id) ?? []
    bucket.push({
      id: agent.id,
      name: agent.name,
      description: firstLine(agent.description),
      model: agent.model ?? 'okänd modell',
      href: null, // filled below, once the project's slug is known
      working: input.workingAgentIds ? input.workingAgentIds.has(agent.id) : null,
    })
    agentsByProject.set(agent.project_id, bucket)
  }

  const projects = input.projects.map<OrganisationProject>((project) => {
    // Straight from the registry. There is deliberately no hard-coded fallback:
    // a slug the registry will not vouch for yields no href, and the node
    // renders non-interactive rather than pointing at a guessed path.
    const href = resolveDestination('project_home', { project: project.slug })?.href ?? null
    // `<project route>/agents/<id>` is a real page and the only place an agent
    // can be opened. Built from the project's own resolved route rather than
    // restated, so this module holds exactly one project URL shape and it comes
    // from the registry.
    const agents = (agentsByProject.get(project.id) ?? [])
      .map((agent) => ({ ...agent, href: href ? `${href}/agents/${agent.id}` : null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color ?? DEFAULT_PROJECT_COLOR,
      href,
      agents,
      runningRuns: input.runningRunsByProject?.get(project.id) ?? (
        input.runningRunsByProject ? 0 : null
      ),
    }
  })

  return {
    operatorName: input.operatorName,
    projects,
    availability: input.availability,
  }
}

function firstLine(value: string | null): string | null {
  if (!value) return null
  const line = value.split('\n')[0]!.trim()
  if (!line) return null
  return line.length <= 90 ? line : `${line.slice(0, 89).trimEnd()}…`
}

/**
 * Load the organisation for the signed-in operator.
 *
 * Scoped exactly the way every other Atlas surface is: `getAllowedProjectIds`
 * then `scopeProjectFilter`, so an empty allow-list produces an impossible id
 * and the queries stay fail-closed rather than returning everything.
 */
export async function loadOrganisationModel(): Promise<OrganisationModel | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createAdminClient()
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  const scopedIds = scopeProjectFilter(allowedProjectIds)

  const [projectsRes, agentsRes, runsRes] = await Promise.allSettled([
    (db.from('projects') as any)
      .select('id, name, slug, color')
      .in('id', scopedIds)
      .order('created_at', { ascending: true }),
    (db.from('agents') as any)
      .select('id, project_id, name, description, model')
      .in('project_id', scopedIds),
    (db.from('runs') as any)
      .select('id, project_id, status, workflows(steps)')
      .eq('status', 'running')
      .in('project_id', scopedIds),
  ])

  const projectsOk = projectsRes.status === 'fulfilled' && !(projectsRes.value as any).error
  const agentsOk = agentsRes.status === 'fulfilled' && !(agentsRes.value as any).error
  const runsOk = runsRes.status === 'fulfilled' && !(runsRes.value as any).error

  const projects: RawProject[] = projectsOk ? ((projectsRes.value as any).data ?? []) : []
  const agents: RawAgent[] = agentsOk ? ((agentsRes.value as any).data ?? []) : []
  const runs: any[] = runsOk ? ((runsRes.value as any).data ?? []) : []

  // Which agents a running run actually names. `workflows.steps[].agent_id` is
  // the only run → agent link that exists; the same one fetchActiveExecution
  // follows. No activity signal is inferred from anything else.
  let workingAgentIds: Set<string> | null = null
  let runningRunsByProject: Map<string, number> | null = null
  if (runsOk) {
    workingAgentIds = new Set<string>()
    runningRunsByProject = new Map<string, number>()
    for (const run of runs) {
      const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
      const steps = (workflow?.steps ?? []) as WorkflowStep[]
      for (const step of steps) {
        if (step?.agent_id) workingAgentIds.add(step.agent_id)
      }
      if (run.project_id) {
        runningRunsByProject.set(
          run.project_id,
          (runningRunsByProject.get(run.project_id) ?? 0) + 1,
        )
      }
    }
  }

  return assembleOrganisationModel({
    operatorName: operatorNameFromUser(user),
    projects,
    agents,
    workingAgentIds,
    runningRunsByProject,
    availability: { projects: projectsOk, agents: agentsOk, activity: runsOk },
  })
}

function operatorNameFromUser(user: { email?: string | null }): string {
  const metadataName = OPERATOR_DISPLAY_NAME
  if (metadataName) return metadataName
  return user.email?.split('@')[0] ?? 'Operatör'
}
