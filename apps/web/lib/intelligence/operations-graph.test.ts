/**
 * Project-isolation tests for the Live Operations graph builder.
 * Uses a stub Supabase client — proves the FAIL-CLOSED invariants without a DB:
 *   1. no user           → empty graph (zero rows, no unscoped query)
 *   2. user w/o projects → empty graph via IMPOSSIBLE_PROJECT_ID
 *   3. caller-supplied project outside the allow-list → ignored (falls back)
 *   4. child rows whose parent run is not visible → dropped
 */

import { describe, expect, it } from 'vitest'
import { buildOperationsGraph, OperationsGraphLimitError } from './operations-graph'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

// ─── Stub Supabase query builder ─────────────────────────────────────────────

type Table = string
interface StubData { [table: string]: any[] }

/** Records every `.in(column, values)` call so tests can assert scoping. */
class StubQuery {
  private rows: any[]
  public inCalls: Array<{ column: string; values: string[] }> = []
  constructor(public readonly table: Table, private store: StubData, private log: StubQuery[]) {
    this.rows = [...(store[table] ?? [])]
    log.push(this)
  }
  select() { return this }
  eq(column: string, value: unknown) { this.rows = this.rows.filter(r => r[column] === value); return this }
  gte(column: string, value: string) { this.rows = this.rows.filter(r => String(r[column]) >= value); return this }
  order() { return this }
  limit(n: number) { this.rows = this.rows.slice(0, n); return this }
  in(column: string, values: string[]) {
    this.inCalls.push({ column, values })
    this.rows = this.rows.filter(r => values.includes(r[column]))
    return this
  }
  then(resolve: (v: { data: any[] }) => void) { resolve({ data: this.rows }) }
}

function stubDb(data: StubData) {
  const log: StubQuery[] = []
  return {
    log,
    from(table: Table) { return new StubQuery(table, data, log) },
  }
}

const NOW = new Date().toISOString()

const DATA: StubData = {
  projects: [
    { id: 'p-mine', name: 'Mitt projekt', slug: 'mine', color: '#fff', owner_id: 'user-1' },
    { id: 'p-mine-two', name: 'Andra mitt projekt', slug: 'mine-two', color: '#eee', owner_id: 'user-1' },
    { id: 'p-other', name: 'Annans projekt', slug: 'other', color: '#000', owner_id: 'user-2' },
  ],
  agents: [
    { id: 'ag-1', name: 'Writer', project_id: 'p-mine', model: 'x', description: null },
    { id: 'ag-2', name: 'Spy', project_id: 'p-other', model: 'x', description: null },
  ],
  workflows: [
    { id: 'wf-1', name: 'Pipeline', project_id: 'p-mine', trigger: 'manual', active: true, steps: [{ order: 1, name: 'write', agent_id: 'ag-1', input_template: '', output_key: 'draft' }] },
    { id: 'wf-2', name: 'Secret pipeline', project_id: 'p-other', trigger: 'cron', active: true, steps: [] },
  ],
  runs: [
    { id: 'run-1', project_id: 'p-mine', workflow_id: 'wf-1', status: 'running', created_at: NOW, started_at: NOW, finished_at: null, error: null, attempts: 1, kind: null },
    { id: 'run-2', project_id: 'p-other', workflow_id: 'wf-2', status: 'failed', created_at: NOW, started_at: NOW, finished_at: NOW, error: 'x', attempts: 1, kind: null },
  ],
  approvals: [
    { id: 'app-1', run_id: 'run-1', status: 'pending', kind: 'content', output_key: 'draft', created_at: NOW, reviewed_at: null, operator: null, project_id: null },
    // Belongs to someone else's run — must NEVER appear even though .in(run_id) could match if runIds leaked:
    { id: 'app-2', run_id: 'run-2', status: 'pending', kind: 'content', output_key: 'x', created_at: NOW, reviewed_at: null, operator: null, project_id: null },
  ],
  outputs: [
    { id: 'out-1', run_id: 'run-1', name: 'Utkast', type: 'text', project_id: 'p-mine', created_at: NOW },
  ],
  manager_tasks: [
    { id: 'task-1', title: 'Följ upp', status: 'open', priority: 'high', run_id: 'run-1', workflow_id: null, project_id: null, created_at: NOW },
  ],
}

describe('buildOperationsGraph — project isolation (fail closed)', () => {
  it('returns an EMPTY graph for a missing user (no unscoped queries)', async () => {
    const db = stubDb(DATA)
    const { graph, projects, snapshot } = await buildOperationsGraph(db as any, null)
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
    expect(projects).toHaveLength(0)
    expect(snapshot.authorizedProjectIds).toEqual([])
    expect(snapshot.appliedProjectId).toBeNull()
    expect(snapshot.returnedProjectIds).toEqual([])
    expect(snapshot.queriedSources).toEqual(['projects', 'agents', 'workflows', 'runs'])
    // Every data query after the allow-list resolution must be scoped to the impossible id:
    const scoped = db.log.flatMap(q => q.inCalls)
    expect(scoped.length).toBeGreaterThan(0)
    for (const call of scoped) expect(call.values).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('returns an EMPTY graph for a user without projects', async () => {
    const db = stubDb(DATA)
    const { graph } = await buildOperationsGraph(db as any, 'user-without-projects')
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
  })

  it('scopes everything to the caller-owned projects only', async () => {
    const db = stubDb(DATA)
    const { graph } = await buildOperationsGraph(db as any, 'user-1')

    const ids = graph.nodes.map(n => n.id)
    expect(ids).toContain('project:p-mine')
    expect(ids).toContain('workflow:wf-1')
    expect(ids).toContain('agent:ag-1')
    expect(ids).toContain('run:run-1')
    expect(ids).toContain('approval:app-1')
    expect(ids).toContain('output:out-1')
    expect(ids).toContain('task:task-1')

    // NOTHING from p-other may leak:
    expect(ids.join(',')).not.toContain('p-other')
    expect(ids).not.toContain('workflow:wf-2')
    expect(ids).not.toContain('agent:ag-2')
    expect(ids).not.toContain('run:run-2')
    expect(ids).not.toContain('approval:app-2')
  })

  it('derives only real relations', async () => {
    const db = stubDb(DATA)
    const { graph } = await buildOperationsGraph(db as any, 'user-1')
    const relations = new Set(graph.edges.map(e => e.relation))
    expect(relations).toEqual(new Set(['CONTAINS', 'DELEGATED_TO', 'STARTED', 'PRODUCED', 'REQUESTED_APPROVAL', 'TRACKS']))
    // DELEGATED_TO comes from the real steps JSONB:
    const deleg = graph.edges.find(e => e.relation === 'DELEGATED_TO')!
    expect(deleg.source).toBe('workflow:wf-1')
    expect(deleg.target).toBe('agent:ag-1')
  })

  it('ignores a caller-supplied project outside the allow-list', async () => {
    const db = stubDb(DATA)
    const foreignProjectId = 'p-other'
    const { graph, projects, snapshot } = await buildOperationsGraph(db as any, 'user-1', { projectId: foreignProjectId })
    // Falls back to the allow-list — never honors or echoes the foreign id:
    const ids = graph.nodes.map(n => n.id)
    expect(ids).toContain('run:run-1')
    expect(ids.join(',')).not.toContain(foreignProjectId)
    expect(snapshot.appliedProjectId).toBeNull()
    expect(snapshot.authorizedProjectIds).not.toContain(foreignProjectId)
    expect(snapshot.returnedProjectIds).not.toContain(foreignProjectId)
    expect(projects.map(project => project.id)).not.toContain(foreignProjectId)
    expect(JSON.stringify({ graph, projects, snapshot })).not.toContain(foreignProjectId)
  })

  it('honors a caller-supplied project INSIDE the allow-list', async () => {
    const db = stubDb(DATA)
    const { graph } = await buildOperationsGraph(db as any, 'user-1', { projectId: 'p-mine' })
    expect(graph.nodes.map(n => n.id)).toContain('run:run-1')
  })
})


describe('buildOperationsGraph — snapshot metadata', () => {
  it('returns truthful metadata for the full authorized scope', async () => {
    const db = stubDb(DATA)
    const { graph, projects, snapshot } = await buildOperationsGraph(db as any, 'user-1')

    expect(projects.map(project => project.id)).toEqual(['p-mine', 'p-mine-two'])
    expect(snapshot).toMatchObject({
      requestedHours: 24,
      authorizedProjectIds: ['p-mine', 'p-mine-two'],
      appliedProjectId: null,
      returnedProjectIds: ['p-mine', 'p-mine-two'],
      queriedSources: ['projects', 'agents', 'workflows', 'runs', 'approvals', 'outputs', 'manager_tasks'],
      delivery: 'snapshot_only',
      sourceFreshness: 'unknown',
      capabilities: {
        realtime: false, polling: true, incidents: false, toolCalls: false,
        atlasRuntime: false, managerRuntime: false, correlation: false, causation: false, replay: false,
      },
    })
    expect(snapshot.generatedAt).toBe(graph.meta.generatedAt)
  })

  it('retains the full authorized project list when a valid project scope is applied', async () => {
    const db = stubDb(DATA)
    const { graph, projects, snapshot } = await buildOperationsGraph(db as any, 'user-1', { projectId: 'p-mine' })

    expect(projects.map(project => project.id)).toEqual(['p-mine', 'p-mine-two'])
    expect(graph.nodes.map(node => node.id)).not.toContain('project:p-mine-two')
    expect(snapshot.appliedProjectId).toBe('p-mine')
    expect(snapshot.returnedProjectIds).toEqual(['p-mine'])
  })

  it('records only sources actually queried when the scoped run set is empty', async () => {
    const db = stubDb({ ...DATA, runs: [] })
    const { snapshot } = await buildOperationsGraph(db as any, 'user-1')

    expect(snapshot.queriedSources).toEqual(['projects', 'agents', 'workflows', 'runs'])
    expect(db.log.map(query => query.table)).not.toContain('approvals')
    expect(db.log.map(query => query.table)).not.toContain('outputs')
    expect(db.log.map(query => query.table)).not.toContain('manager_tasks')
  })

  it('records child sources without fabricating child nodes when visible runs have no child rows', async () => {
    const db = stubDb({ ...DATA, approvals: [], outputs: [], manager_tasks: [] })
    const { graph, snapshot } = await buildOperationsGraph(db as any, 'user-1')

    expect(snapshot.queriedSources).toEqual([
      'projects', 'agents', 'workflows', 'runs', 'approvals', 'outputs', 'manager_tasks',
    ])
    expect(db.log.map(query => query.table)).toContain('approvals')
    expect(db.log.map(query => query.table)).toContain('outputs')
    expect(db.log.map(query => query.table)).toContain('manager_tasks')
    expect(graph.nodes.filter(node => ['approval', 'output', 'task'].includes(node.kind))).toEqual([])
  })

  it('fails closed instead of returning an oversized final graph response', async () => {
    const db = stubDb({
      ...DATA,
      agents: Array.from({ length: 601 }, (_, index) => ({
        id: 'agent-' + index, name: 'Agent ' + index, project_id: 'p-mine', model: 'x', description: null,
      })),
      runs: [],
    })

    await expect(buildOperationsGraph(db as any, 'user-1')).rejects.toBeInstanceOf(OperationsGraphLimitError)
  })
})
