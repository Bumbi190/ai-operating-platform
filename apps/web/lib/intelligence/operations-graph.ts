/**
 * Live Operations graph — read-only runtime graph built from Omnira's REAL
 * tables. No fictional events, no sample data: every node is a row, every edge
 * an FK or JSONB reference that exists today.
 *
 * PROJECT ISOLATION (fail closed):
 *  - The caller's user id resolves to an allow-list via getAllowedProjectIds
 *    (mirrors RLS `projects.owner_id = auth.uid()`).
 *  - EVERY query is scoped with scopeToProjects — an empty allow-list yields
 *    the IMPOSSIBLE_PROJECT_ID, i.e. zero rows, never an unscoped query.
 *  - approvals.project_id / manager_tasks.project_id are nullable → null-project
 *    rows are only included when their run resolves to an allowed project;
 *    otherwise they are DROPPED (fail closed), never shown globally.
 *
 * Derivable relations only (see graph-contract.ts):
 *   CONTAINS, DELEGATED_TO, STARTED, PRODUCED, REQUESTED_APPROVAL, TRACKS
 */

import { getAllowedProjectIds, scopeToProjects } from '@/lib/atlas/isolation'
import { parseWorkflowSteps } from '@/lib/supabase/json'
import type {
  IntelligenceGraph,
  IntelligenceGraphEdge,
  IntelligenceGraphNode,
} from './graph-contract'

type AnyDb = any

export interface OperationsWindow {
  /** Hours back from now for time-scoped rows (runs/approvals/outputs). */
  hours: number
  /** Max runs fetched (most recent first). */
  maxRuns: number
}

export const DEFAULT_WINDOW: OperationsWindow = { hours: 24, maxRuns: 120 }

export interface OperationsGraphResult {
  graph: IntelligenceGraph
  /** Projects visible to this caller (id, name, slug) for the project filter. */
  projects: Array<{ id: string; name: string; slug: string; color: string }>
}

export async function buildOperationsGraph(
  db: AnyDb,
  userId: string | null | undefined,
  opts: { projectId?: string; window?: OperationsWindow } = {},
): Promise<OperationsGraphResult> {
  const window = opts.window ?? DEFAULT_WINDOW
  const allowed = await getAllowedProjectIds(db, userId)

  // Optional caller-supplied narrowing — only honored if inside the allow-list.
  const scope = opts.projectId && allowed.includes(opts.projectId)
    ? [opts.projectId]
    : allowed

  const sinceIso = new Date(Date.now() - window.hours * 3600_000).toISOString()

  const [projectsRes, agentsRes, workflowsRes, runsRes] = await Promise.all([
    scopeToProjects(db.from('projects').select('id, name, slug, color'), allowed, 'id'),
    scopeToProjects(db.from('agents').select('id, name, project_id, model, description'), scope),
    scopeToProjects(db.from('workflows').select('id, name, project_id, trigger, active, steps'), scope),
    scopeToProjects(
      db.from('runs').select('id, project_id, workflow_id, status, created_at, started_at, finished_at, error, attempts, kind'),
      scope,
    )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(window.maxRuns),
  ])

  const projects: Array<{ id: string; name: string; slug: string; color: string }> = projectsRes.data ?? []
  const agents: any[] = agentsRes.data ?? []
  const workflows: any[] = workflowsRes.data ?? []
  const runs: any[] = runsRes.data ?? []

  const runIds = runs.map(r => r.id)

  // Child rows are fetched BY run id (already isolation-scoped through runs) —
  // and additionally re-checked against the run map below (defense in depth).
  const [approvalsRes, outputsRes, tasksRes] = runIds.length > 0
    ? await Promise.all([
        db.from('approvals')
          .select('id, run_id, status, kind, output_key, created_at, reviewed_at, operator, project_id')
          .in('run_id', runIds),
        db.from('outputs')
          .select('id, run_id, name, type, project_id, created_at')
          .in('run_id', runIds),
        db.from('manager_tasks')
          .select('id, title, status, priority, run_id, workflow_id, project_id, created_at')
          .in('run_id', runIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const approvals: any[] = approvalsRes.data ?? []
  const outputs: any[] = outputsRes.data ?? []
  const tasks: any[] = tasksRes.data ?? []

  // ── Assemble nodes ──
  const nodes: IntelligenceGraphNode[] = []
  const nodeIds = new Set<string>()
  const add = (n: IntelligenceGraphNode) => {
    if (nodeIds.has(n.id)) return
    nodeIds.add(n.id)
    nodes.push(n)
  }

  const scopeSet = new Set(scope)
  const projectName = new Map(projects.map(p => [p.id, p.name]))

  for (const p of projects) {
    if (!scopeSet.has(p.id)) continue
    add({
      id: `project:${p.id}`, kind: 'project', label: p.name, source: 'runtime',
      projectId: p.id, metadata: { slug: p.slug, color: p.color },
    })
  }
  for (const a of agents) {
    add({
      id: `agent:${a.id}`, kind: 'agent', label: a.name, source: 'runtime',
      projectId: a.project_id, metadata: { model: a.model, description: a.description },
    })
  }
  for (const w of workflows) {
    add({
      id: `workflow:${w.id}`, kind: 'workflow', label: w.name, source: 'runtime',
      projectId: w.project_id, status: w.active ? 'active' : 'inactive',
      metadata: { trigger: w.trigger },
    })
  }
  const runById = new Map<string, any>()
  for (const r of runs) {
    runById.set(r.id, r)
    const wfName = workflows.find(w => w.id === r.workflow_id)?.name
    add({
      id: `run:${r.id}`, kind: 'run',
      label: wfName ? `${wfName} · ${String(r.id).slice(0, 8)}` : `run ${String(r.id).slice(0, 8)}`,
      source: 'runtime', projectId: r.project_id, status: r.status,
      metadata: {
        createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
        error: r.error ? String(r.error).slice(0, 300) : null,
        attempts: r.attempts, kind: r.kind,
        projectName: projectName.get(r.project_id) ?? null,
      },
    })
  }

  // Fail-closed check for child rows: only attach when the parent run is in view.
  for (const ap of approvals) {
    if (!ap.run_id || !runById.has(ap.run_id)) continue
    add({
      id: `approval:${ap.id}`, kind: 'approval', label: `Approval · ${ap.output_key ?? ap.kind}`,
      source: 'runtime', projectId: ap.project_id ?? runById.get(ap.run_id).project_id,
      status: ap.status,
      metadata: { kind: ap.kind, createdAt: ap.created_at, reviewedAt: ap.reviewed_at, operator: ap.operator },
    })
  }
  for (const o of outputs) {
    if (!o.run_id || !runById.has(o.run_id)) continue
    add({
      id: `output:${o.id}`, kind: 'output', label: o.name, source: 'runtime',
      projectId: o.project_id, metadata: { type: o.type, createdAt: o.created_at },
    })
  }
  for (const t of tasks) {
    if (!t.run_id || !runById.has(t.run_id)) continue
    add({
      id: `task:${t.id}`, kind: 'task', label: t.title, source: 'runtime',
      projectId: t.project_id ?? runById.get(t.run_id).project_id, status: t.status,
      metadata: { priority: t.priority, createdAt: t.created_at },
    })
  }

  // ── Assemble edges (derived only) ──
  const edges: IntelligenceGraphEdge[] = []
  const addEdge = (e: IntelligenceGraphEdge) => {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) edges.push(e)
  }

  for (const a of agents) {
    addEdge({
      id: `project:${a.project_id}→agent:${a.id}`,
      source: `project:${a.project_id}`, target: `agent:${a.id}`,
      relation: 'CONTAINS', confidence: 'DERIVED', metadata: {},
    })
  }
  for (const w of workflows) {
    addEdge({
      id: `project:${w.project_id}→workflow:${w.id}`,
      source: `project:${w.project_id}`, target: `workflow:${w.id}`,
      relation: 'CONTAINS', confidence: 'DERIVED', metadata: {},
    })
    // workflow → agent (steps JSONB, real agent_id references only)
    const steps = parseWorkflowSteps(w.steps)
    const seen = new Set<string>()
    for (const step of steps) {
      if (!step.agent_id || seen.has(step.agent_id)) continue
      seen.add(step.agent_id)
      addEdge({
        id: `workflow:${w.id}→agent:${step.agent_id}`,
        source: `workflow:${w.id}`, target: `agent:${step.agent_id}`,
        relation: 'DELEGATED_TO', confidence: 'DERIVED',
        metadata: { step: step.name, order: step.order },
      })
    }
  }
  for (const r of runs) {
    if (r.workflow_id) {
      addEdge({
        id: `workflow:${r.workflow_id}→run:${r.id}`,
        source: `workflow:${r.workflow_id}`, target: `run:${r.id}`,
        relation: 'STARTED', confidence: 'DERIVED', timestamp: r.created_at, metadata: {},
      })
    }
  }
  for (const ap of approvals) {
    if (!ap.run_id) continue
    addEdge({
      id: `run:${ap.run_id}→approval:${ap.id}`,
      source: `run:${ap.run_id}`, target: `approval:${ap.id}`,
      relation: 'REQUESTED_APPROVAL', confidence: 'DERIVED', timestamp: ap.created_at ?? undefined, metadata: {},
    })
  }
  for (const o of outputs) {
    if (!o.run_id) continue
    addEdge({
      id: `run:${o.run_id}→output:${o.id}`,
      source: `run:${o.run_id}`, target: `output:${o.id}`,
      relation: 'PRODUCED', confidence: 'DERIVED', timestamp: o.created_at, metadata: {},
    })
  }
  for (const t of tasks) {
    const target = t.run_id ? `run:${t.run_id}` : t.workflow_id ? `workflow:${t.workflow_id}` : null
    if (!target) continue
    addEdge({
      id: `task:${t.id}→${target}`,
      source: `task:${t.id}`, target,
      relation: 'TRACKS', confidence: 'DERIVED', timestamp: t.created_at ?? undefined, metadata: {},
    })
  }

  const graph: IntelligenceGraph = {
    meta: {
      source: 'runtime',
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    nodes,
    edges,
  }

  return { graph, projects: projects.filter(p => scopeSet.has(p.id)) }
}
