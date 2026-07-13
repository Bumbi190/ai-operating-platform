import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import {
  beginCrossCommunitySearch,
  buildGraphBreadcrumbs,
  resolveGraphNavigationIntent,
} from './graph-navigation'

function node(
  kind: IntelligenceGraphNode['kind'],
  id: string,
  community: number,
  overrides: Partial<IntelligenceGraphNode> = {},
): IntelligenceGraphNode {
  return {
    id,
    kind,
    label: overrides.label ?? id,
    source: 'graphify',
    community,
    metadata: {},
    ...overrides,
  }
}

function edge(id: string, source: string, target: string, relation: IntelligenceGraphEdge['relation']): IntelligenceGraphEdge {
  return { id, source, target, relation, confidence: 'DERIVED', metadata: {} }
}

const workflowA = node('workflow', 'workflow:A', 1, { label: 'Workflow A' })
const agentA = node('agent', 'agent:A', 1, { label: 'Agent A' })
const runA = node('run', 'run:A', 1, { label: 'Run A' })
const nodesA = [workflowA, agentA, runA]
const edgesA = [
  edge('a-workflow-agent', workflowA.id, agentA.id, 'DELEGATED_TO'),
  edge('a-workflow-run', workflowA.id, runA.id, 'STARTED'),
]

const workflowB = node('workflow', 'workflow:B', 2, { label: 'Workflow B' })
const runB = node('run', 'run:B', 2, { label: 'Run B' })
const nodesB = [workflowB, runB]
const edgesB = [edge('b-workflow-run', workflowB.id, runB.id, 'STARTED')]

describe('Phase 2 PR #49 navigation behavior', () => {
  it('restores selected, drill, and isolate roots independently from one scoped payload', () => {
    const restored = resolveGraphNavigationIntent(nodesA, edgesA, {
      selectedId: runA.id,
      drillId: agentA.id,
      isolateId: workflowA.id,
    })

    expect(restored.selected?.id).toBe(runA.id)
    expect(restored.drillScope?.rootId).toBe(agentA.id)
    expect(restored.isolateScope?.rootId).toBe(workflowA.id)
    expect(restored.isolateScope?.nodeIds.has(runA.id)).toBe(true)
  })

  it('does not let a stale selection erase a valid isolate root', () => {
    const restored = resolveGraphNavigationIntent(nodesA, edgesA, {
      selectedId: 'run:stale',
      isolateId: workflowA.id,
    })

    expect(restored.selected).toBeNull()
    expect(restored.isolateScope?.rootId).toBe(workflowA.id)
  })

  it('does not let a stale isolate erase a valid selected node or drill root', () => {
    const restored = resolveGraphNavigationIntent(nodesA, edgesA, {
      selectedId: runA.id,
      drillId: workflowA.id,
      isolateId: 'workflow:unavailable',
    })

    expect(restored.selected?.id).toBe(runA.id)
    expect(restored.drillScope?.rootId).toBe(workflowA.id)
    expect(restored.isolateScope).toBeNull()
  })

  it('fails closed for identifiers absent from the authorized scoped payload', () => {
    const restored = resolveGraphNavigationIntent(nodesA, edgesA, {
      selectedId: runB.id,
      drillId: workflowB.id,
      isolateId: workflowB.id,
    })

    expect(restored).toEqual({ selected: null, drillScope: null, isolateScope: null })
  })

  it('leaves community A scopes, opens community B, and restores A context on internal Back', () => {
    const previous = resolveGraphNavigationIntent(nodesA, edgesA, {
      selectedId: runA.id,
      isolateId: workflowA.id,
    })
    const transition = beginCrossCommunitySearch(1, { id: runB.id, community: 2 })!

    expect(transition.nextSelectionId).toBeNull()
    expect(transition.nextDrillScope).toBeNull()
    expect(transition.nextIsolateScope).toBeNull()

    const inCommunityB = resolveGraphNavigationIntent(nodesB, edgesB, transition.intent)
    expect(inCommunityB.selected?.id).toBe(runB.id)
    expect(inCommunityB.drillScope).toBeNull()
    expect(inCommunityB.isolateScope).toBeNull()
    expect(buildGraphBreadcrumbs('system', 2, inCommunityB.drillScope, inCommunityB.isolateScope))
      .toEqual(['Global', 'Community 2'])

    const afterBack = resolveGraphNavigationIntent(nodesA, edgesA, {
      selectedId: previous.selected?.id,
      isolateId: previous.isolateScope?.rootId,
    })
    expect(afterBack.selected?.id).toBe(runA.id)
    expect(afterBack.isolateScope?.rootId).toBe(workflowA.id)
    expect(buildGraphBreadcrumbs('system', 1, afterBack.drillScope, afterBack.isolateScope))
      .toEqual(['Global', 'Community 1', 'Isolated: Workflow A'])
  })

  it('handles a stale cross-community result without hiding the destination graph', () => {
    const transition = beginCrossCommunitySearch(1, { id: 'run:B-stale', community: 2 })!
    const resolved = resolveGraphNavigationIntent(nodesB, edgesB, transition.intent)

    expect(resolved.selected).toBeNull()
    expect(resolved.drillScope).toBeNull()
    expect(resolved.isolateScope).toBeNull()
    expect(nodesB).toHaveLength(2)
    expect(beginCrossCommunitySearch(2, { id: runB.id, community: 2 })).toBeNull()
  })
})
