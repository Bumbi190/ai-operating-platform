import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import {
  buildDenseViewSummaries,
  buildDrilldownScope,
  computeGraphFilterState,
  searchScopedNodes,
} from './graph-navigation'

function node(kind: IntelligenceGraphNode['kind'], id: string, projectId = 'project-a', overrides: Partial<IntelligenceGraphNode> = {}): IntelligenceGraphNode {
  return { id, kind, label: overrides.label ?? id, source: 'runtime', projectId, metadata: {}, ...overrides }
}

function edge(id: string, source: string, target: string, relation: IntelligenceGraphEdge['relation']): IntelligenceGraphEdge {
  return { id, source, target, relation, confidence: 'DERIVED', metadata: {} }
}

describe('Phase 2 scoped navigation and truthful dense-view summaries', () => {
  const project = node('project', 'project:a')
  const workflow = node('workflow', 'workflow:a')
  const agent = node('agent', 'agent:a')
  const run = node('run', 'run:a', 'project-a', { status: 'running' })
  const siblingRun = node('run', 'run:sibling', 'project-a', { status: 'done' })
  const approval = node('approval', 'approval:a', 'project-a', { status: 'pending' })
  const output = node('output', 'output:a')
  const foreignRun = node('run', 'run:foreign', 'project-b', { status: 'failed' })
  const nodes = [project, workflow, agent, run, siblingRun, approval, output, foreignRun]
  const edges = [
    edge('p-w', project.id, workflow.id, 'CONTAINS'),
    edge('w-a', workflow.id, agent.id, 'DELEGATED_TO'),
    edge('w-r', workflow.id, run.id, 'STARTED'),
    edge('w-r2', workflow.id, siblingRun.id, 'STARTED'),
    edge('r-ap', run.id, approval.id, 'REQUESTED_APPROVAL'),
    edge('r-o', run.id, output.id, 'PRODUCED'),
    // Invalid cross-project STARTED relation must never become summary membership.
    edge('w-foreign', workflow.id, foreignRun.id, 'STARTED'),
  ]

  it('builds project drilldown strictly from verified projectId membership', () => {
    const scope = buildDrilldownScope(project, nodes, edges)!
    expect(scope.kind).toBe('project')
    expect(scope.nodeIds.has(foreignRun.id)).toBe(false)
    expect([...scope.nodeIds].every(id => nodes.find(value => value.id === id)?.projectId === 'project-a')).toBe(true)
  })

  it('builds a real run path without absorbing sibling or cross-project runs', () => {
    const scope = buildDrilldownScope(run, nodes, edges)!
    expect(scope.nodeIds).toEqual(new Set([run.id, workflow.id, approval.id, output.id, project.id, agent.id]))
    expect(scope.nodeIds.has(siblingRun.id)).toBe(false)
    expect(scope.nodeIds.has(foreignRun.id)).toBe(false)
  })

  it('creates deterministic workflow run summaries only from same-project STARTED membership', () => {
    const summaries = buildDenseViewSummaries(nodes, edges, 'operational')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].parentId).toBe(workflow.id)
    expect(summaries[0].memberIds).toEqual([run.id, siblingRun.id])
    expect(summaries[0].count).toBe(2)
    expect(summaries[0].projectId).toBe('project-a')
    expect(summaries[0].memberIds).not.toContain(foreignRun.id)
    expect(buildDenseViewSummaries(nodes, edges, 'operational')).toEqual(summaries)
    expect(buildDenseViewSummaries(nodes, edges, 'detail')).toEqual([])
  })

  it('counts approval/failure attention without replacing the real members', () => {
    const failedSibling = { ...siblingRun, status: 'failed' }
    const summary = buildDenseViewSummaries(
      nodes.map(value => value.id === failedSibling.id ? failedSibling : value),
      edges,
      'project',
    )[0]
    expect(summary.attentionCount).toBe(1)
    expect(summary.memberIds).toContain(failedSibling.id)
  })

  it('searches deterministically only inside the caller-provided scope', () => {
    const scoped = [node('workflow', 'workflow:2', 'project-a', { label: 'Render Video' }), node('run', 'run:1', 'project-a', { label: 'Render Video attempt' })]
    const results = searchScopedNodes(scoped, 'render')
    expect(results.map(value => value.id)).toEqual(['workflow:2', 'run:1'])
    expect(searchScopedNodes(scoped, 'foreign')).toEqual([])
  })

  it('dims ordinary non-matches while critical truth remains visible and counted', () => {
    const quiet = node('run', 'quiet', 'project-a', { status: 'done' })
    const critical = node('run', 'critical', 'project-a', { status: 'failed' })
    const result = computeGraphFilterState([quiet, critical], {
      kinds: new Set(['workflow']),
      statuses: new Set(),
    })
    expect(result.matchCount).toBe(0)
    expect(result.dimmedIds.has(quiet.id)).toBe(true)
    expect(result.dimmedIds.has(critical.id)).toBe(false)
    expect(result.criticalOutsideFilters).toBe(1)

    const noRunningRuns = computeGraphFilterState([project, quiet], {
      kinds: new Set(),
      statuses: new Set(['running']),
    })
    expect(noRunningRuns.matchCount).toBe(0)
    expect(noRunningRuns.matchingIds.has(project.id)).toBe(true)
  })
})
