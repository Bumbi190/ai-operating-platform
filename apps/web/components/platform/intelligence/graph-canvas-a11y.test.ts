import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import type { SpatialRunCluster } from './spatial-layout'
import {
  LIVE_OPERATIONS_CANVAS_INSTRUCTIONS,
  canvasRovingOrder,
  nextCanvasRovingId,
} from './graph-canvas-a11y'

const nodes: IntelligenceGraphNode[] = [
  { id: 'workflow:b', kind: 'workflow', label: 'B', source: 'runtime', metadata: {} },
  { id: 'project:a', kind: 'project', label: 'A', source: 'runtime', metadata: {} },
  { id: 'run:c', kind: 'run', label: 'C', source: 'runtime', status: 'failed', metadata: {} },
]

const positions = new Map<string, PositionedNode>([
  ['workflow:b', { id: 'workflow:b', x: 200, y: 100, r: 18 }],
  ['project:a', { id: 'project:a', x: 50, y: 100, r: 24 }],
  ['run:c', { id: 'run:c', x: 80, y: 240, r: 12 }],
])

const cluster: SpatialRunCluster = {
  id: 'cluster:workflow:b', parentId: 'workflow:b', kind: 'workflow', x: 260, y: 180, r: 14,
  count: 3, memberIds: ['run:1', 'run:2', 'run:3'], distribution: [{ status: 'done', count: 3 }], attentionCount: 0,
}

describe('T3b canvas roving order', () => {
  it('orders visible nodes and clusters geometrically without status inference', () => {
    const original = nodes.map(node => ({ id: node.id, status: node.status }))
    const ordered = canvasRovingOrder(nodes, positions, [cluster], new Set(nodes.map(node => node.id)))

    expect(ordered.map(item => item.id)).toEqual(['project:a', 'workflow:b', 'cluster:workflow:b', 'run:c'])
    expect(nodes.map(node => ({ id: node.id, status: node.status }))).toEqual(original)
  })

  it('moves previous/next deterministically and wraps without selecting anything', () => {
    const ids = ['project:a', 'workflow:b', 'cluster:workflow:b', 'run:c']
    expect(nextCanvasRovingId(ids, 'project:a', 'ArrowLeft')).toBe('run:c')
    expect(nextCanvasRovingId(ids, 'project:a', 'ArrowDown')).toBe('workflow:b')
    expect(nextCanvasRovingId(ids, 'workflow:b', 'Home')).toBe('project:a')
    expect(nextCanvasRovingId(ids, 'workflow:b', 'End')).toBe('run:c')
    expect(nextCanvasRovingId(ids, 'workflow:b', 'Enter')).toBeNull()
  })

  it('states snapshot/list equivalence, line truth and Atlas identity in Swedish', () => {
    expect(LIVE_OPERATIONS_CANVAS_INSTRUCTIONS).toContain('samma ögonblicksbild som listan')
    expect(LIVE_OPERATIONS_CANVAS_INSTRUCTIONS).toContain('Heldragna linjer är direkta referenser')
    expect(LIVE_OPERATIONS_CANVAS_INSTRUCTIONS).toContain('streckade linjer är aktuella definitioner')
    expect(LIVE_OPERATIONS_CANVAS_INSTRUCTIONS).toContain('punktstreckade linjer är härledda relationer')
    expect(LIVE_OPERATIONS_CANVAS_INSTRUCTIONS).toContain('Atlas är identitet och navigation, inte en datanod')
  })
})
