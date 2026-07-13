import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import {
  GRAPH_VISUAL_TOKENS,
  buildProjectTerritories,
  getEdgeVisual,
  getNodeVisual,
  getStatusVisual,
} from './graph-visuals'
import type { PositionedNode } from './force-layout'

function node(kind: IntelligenceGraphNode['kind'], overrides: Partial<IntelligenceGraphNode> = {}): IntelligenceGraphNode {
  return {
    id: `${kind}:1`,
    kind,
    label: kind,
    source: ['project', 'agent', 'workflow', 'run', 'approval', 'output', 'task'].includes(kind) ? 'runtime' : 'graphify',
    metadata: {},
    ...overrides,
  }
}

function edge(relation: IntelligenceGraphEdge['relation']): IntelligenceGraphEdge {
  return { id: relation, source: 'a', target: 'b', relation, metadata: {} }
}

describe('Phase 1 graph visual contract', () => {
  it('keeps the canonical structural scale ordered with Atlas largest', () => {
    const radius = GRAPH_VISUAL_TOKENS.canonicalRadius
    expect(radius.atlas).toBeGreaterThan(radius.project)
    expect(radius.project).toBeGreaterThan(radius.manager)
    expect(radius.manager).toBeGreaterThan(radius.workflow)
    expect(radius.workflow).toBeGreaterThan(radius.agent)
    expect(radius.approval).toBeGreaterThan(radius.run)
  })

  it('maps only verified node kinds to distinct structural silhouettes', () => {
    expect(getNodeVisual(node('project')).shape).toBe('project')
    expect(getNodeVisual(node('agent')).shape).toBe('circle')
    expect(getNodeVisual(node('workflow')).shape).toBe('workflow')
    expect(getNodeVisual(node('run')).shape).toBe('run')
    expect(getNodeVisual(node('approval')).shape).toBe('approval')
    expect(getNodeVisual(node('output')).shape).toBe('output')
    expect(getNodeVisual(node('task')).shape).toBe('task')
  })

  it('keeps approval and failure distinguishable without color alone', () => {
    const approval = node('approval', { status: 'pending' })
    const failure = node('run', { status: 'failed' })
    const approvalStatus = getStatusVisual(approval)!
    const failureStatus = getStatusVisual(failure)!

    expect(getNodeVisual(approval).shape).toBe('approval')
    expect(getNodeVisual(failure).shape).toBe('run')
    expect(approvalStatus.badge).toBe('A')
    expect(failureStatus.badge).toBe('!')
    expect(approvalStatus.stroke).not.toBe(failureStatus.stroke)
    expect(approvalStatus.attention).toBe(true)
    expect(failureStatus.attention).toBe(true)
  })

  it('uses a restrained semantic edge hierarchy without inventing causation', () => {
    const structural = getEdgeVisual(edge('CONTAINS'))
    const association = getEdgeVisual(edge('TRACKS'))
    const approval = getEdgeVisual(edge('REQUESTED_APPROVAL'))

    expect(structural.directional).toBe(false)
    expect(association.dash).toBe('2 4')
    expect(approval.attention).toBe('approval')
    expect(approval.width).toBeGreaterThan(structural.width)
  })

  it('builds deterministic, separate territories from projectId membership only', () => {
    const nodes = [
      node('project', { id: 'project:a', projectId: 'a', label: 'Alpha', metadata: { color: '#112233' } }),
      node('agent', { id: 'agent:a', projectId: 'a' }),
      node('project', { id: 'project:b', projectId: 'b', label: 'Beta', metadata: { color: '#445566' } }),
      node('workflow', { id: 'workflow:b', projectId: 'b' }),
      node('run', { id: 'run:unscoped' }),
    ]
    const positions = new Map<string, PositionedNode>([
      ['project:a', { id: 'project:a', x: 100, y: 100, r: 30 }],
      ['agent:a', { id: 'agent:a', x: 150, y: 120, r: 16 }],
      ['project:b', { id: 'project:b', x: 800, y: 500, r: 30 }],
      ['workflow:b', { id: 'workflow:b', x: 740, y: 520, r: 20 }],
      ['run:unscoped', { id: 'run:unscoped', x: 400, y: 300, r: 10 }],
    ])

    const first = buildProjectTerritories(nodes, positions)
    const second = buildProjectTerritories(nodes, positions)

    expect(first).toEqual(second)
    expect(first.map(territory => territory.id)).toEqual(['a', 'b'])
    expect(first[0].label).toBe('Alpha')
    expect(first[1].label).toBe('Beta')
    expect(Math.abs(first[0].cx - first[1].cx)).toBeGreaterThan(400)
  })
})
