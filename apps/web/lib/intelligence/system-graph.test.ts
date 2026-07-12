/**
 * M1 — the community catalogue ships ONLY with the overview response.
 * Drilldown/neighborhood keep the rest of meta (commit, counts) but must not
 * repeat the full communities payload on every request.
 */

import { describe, expect, it } from 'vitest'
import { buildCommunityView, buildNeighborhood, buildOverview } from './system-graph'
import type { IntelligenceGraph } from './graph-contract'

const graph: IntelligenceGraph = {
  meta: {
    source: 'graphify',
    generatedAt: '2026-07-08T00:00:00Z',
    builtAtCommit: 'd329d93c115e63bf27f652457eeae077e0bd41a9',
    nodeCount: 3,
    edgeCount: 2,
    communities: Array.from({ length: 30 }, (_, i) => ({
      id: i,
      label: `Community ${i}`,
      size: 20,
      topNodes: [{ id: `n${i}`, label: `n${i}`, degree: 3 }],
      dominantPath: 'apps/web/lib',
    })),
  },
  nodes: [
    { id: 'a', kind: 'code', label: 'a.ts', source: 'graphify', community: 0, degree: 2, sourceFile: 'apps/web/a.ts', metadata: {} },
    { id: 'b', kind: 'code', label: 'b.ts', source: 'graphify', community: 0, degree: 1, sourceFile: 'apps/web/b.ts', metadata: {} },
    { id: 'c', kind: 'document', label: 'adr.md', source: 'graphify', community: 1, degree: 1, sourceFile: 'docs/adr.md', metadata: {} },
  ],
  edges: [
    { id: 'a→b:imports', source: 'a', target: 'b', relation: 'imports', confidence: 'EXTRACTED', metadata: {} },
    { id: 'a→c:references', source: 'a', target: 'c', relation: 'references', confidence: 'INFERRED', metadata: {} },
  ],
}

describe('response meta payload (M1)', () => {
  it('overview keeps the community catalogue', () => {
    const res = buildOverview(graph)
    expect(res.meta.communities).toBeDefined()
    expect(res.meta.communities!.length).toBe(30)
  })

  it('community drilldown omits the catalogue but keeps commit + counts', () => {
    const res = buildCommunityView(graph, 0)
    expect(res.meta.communities).toBeUndefined()
    expect(res.meta.builtAtCommit).toBe('d329d93c115e63bf27f652457eeae077e0bd41a9')
    expect(res.meta.nodeCount).toBe(3)
    expect(res.nodes.map(n => n.id).sort()).toEqual(['a', 'b'])
  })

  it('neighborhood omits the catalogue but keeps commit', () => {
    const res = buildNeighborhood(graph, 'a')!
    expect(res.meta.communities).toBeUndefined()
    expect(res.meta.builtAtCommit).toBeDefined()
    expect(res.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('stripping meta does not mutate the cached source graph', () => {
    buildCommunityView(graph, 0)
    buildNeighborhood(graph, 'a')
    expect(graph.meta.communities!.length).toBe(30)
  })
})
