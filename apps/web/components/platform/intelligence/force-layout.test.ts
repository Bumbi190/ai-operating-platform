import { describe, expect, it } from 'vitest'
import { computeLayout } from './force-layout'

describe('Phase 1 deterministic layout foundation', () => {
  const nodes = [
    { id: 'project:a', weight: 12, radius: 33, group: 1, role: 'project' as const },
    { id: 'agent:a', weight: 3, radius: 16, group: 1, role: 'detail' as const },
    { id: 'workflow:a', weight: 5, radius: 20, group: 1, role: 'detail' as const },
    { id: 'project:b', weight: 12, radius: 33, group: 2, role: 'project' as const },
    { id: 'agent:b', weight: 3, radius: 16, group: 2, role: 'detail' as const },
    { id: 'workflow:b', weight: 5, radius: 20, group: 2, role: 'detail' as const },
  ]
  const edges = [
    { source: 'project:a', target: 'agent:a' },
    { source: 'project:a', target: 'workflow:a' },
    { source: 'project:b', target: 'agent:b' },
    { source: 'project:b', target: 'workflow:b' },
  ]

  it('returns the same settled positions for the same graph', () => {
    expect(computeLayout(nodes, edges)).toEqual(computeLayout(nodes, edges))
  })

  it('honors semantic radii and keeps project groups spatially separated', () => {
    const result = computeLayout(nodes, edges)
    const byId = new Map(result.map(position => [position.id, position]))
    expect(byId.get('project:a')?.r).toBe(33)
    expect(byId.get('agent:a')?.r).toBe(16)

    const centroid = (ids: string[]) => ids.reduce(
      (sum, id) => ({ x: sum.x + byId.get(id)!.x, y: sum.y + byId.get(id)!.y }),
      { x: 0, y: 0 },
    )
    const a = centroid(['project:a', 'agent:a', 'workflow:a'])
    const b = centroid(['project:b', 'agent:b', 'workflow:b'])
    const distance = Math.hypot((a.x - b.x) / 3, (a.y - b.y) / 3)
    expect(distance).toBeGreaterThan(180)
  })

  it('supports canonical Atlas anchoring without creating an Atlas node itself', () => {
    const [atlas] = computeLayout([
      { id: 'atlas-from-future-source', weight: 1, radius: 52, role: 'atlas' },
    ], [], { width: 1200, height: 800, iterations: 40 })
    expect(atlas.r).toBe(52)
    expect(atlas.x).toBeCloseTo(600, 0)
    expect(atlas.y).toBeCloseTo(400, 0)
  })

  it('keeps dense project clusters deterministically spread with semantic padding', () => {
    const denseNodes = [
      { id: 'dense:project', weight: 20, radius: 33, group: 7, role: 'project' as const },
      ...Array.from({ length: 28 }, (_, index) => ({
        id: `dense:detail:${index}`,
        weight: 2,
        radius: 14,
        group: 7,
        role: 'detail' as const,
      })),
    ]
    const denseEdges = denseNodes.slice(1).map(node => ({ source: 'dense:project', target: node.id }))
    const first = computeLayout(denseNodes, denseEdges)
    const second = computeLayout(denseNodes, denseEdges)
    const xSpread = Math.max(...first.map(node => node.x)) - Math.min(...first.map(node => node.x))
    const ySpread = Math.max(...first.map(node => node.y)) - Math.min(...first.map(node => node.y))
    let minimumDistance = Infinity
    for (let i = 0; i < first.length; i++) {
      for (let j = i + 1; j < first.length; j++) {
        minimumDistance = Math.min(minimumDistance, Math.hypot(first[i].x - first[j].x, first[i].y - first[j].y))
      }
    }

    expect(first).toEqual(second)
    expect(Math.max(xSpread, ySpread)).toBeGreaterThan(220)
    expect(minimumDistance).toBeGreaterThan(24)
  })
})
