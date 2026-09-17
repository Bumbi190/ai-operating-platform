import { describe, expect, it } from 'vitest'
import {
  FIXTURE_PROJECT_A,
  OPERATIONS_FIXTURE_EDGES,
  OPERATIONS_FIXTURE_NODES,
  OPERATIONS_FIXTURE_PAYLOAD,
} from '@/lib/qa/intelligence-graph-fixture'
import { buildGraphListModel } from './graph-list-model'

const projects = OPERATIONS_FIXTURE_PAYLOAD.projects

describe('Phase 18 T3a · synchronized graph list model', () => {
  it('projects the exact snapshot node and edge sets without mutation', () => {
    const beforeNodes = JSON.stringify(OPERATIONS_FIXTURE_NODES)
    const beforeEdges = JSON.stringify(OPERATIONS_FIXTURE_EDGES)
    const model = buildGraphListModel({ nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, projects })

    expect(new Set(model.nodeIds)).toEqual(new Set(OPERATIONS_FIXTURE_NODES.map(node => node.id)))
    expect(new Set(model.edgeIds)).toEqual(new Set(OPERATIONS_FIXTURE_EDGES.map(edge => edge.id)))
    expect(JSON.stringify(OPERATIONS_FIXTURE_NODES)).toBe(beforeNodes)
    expect(JSON.stringify(OPERATIONS_FIXTURE_EDGES)).toBe(beforeEdges)

    const first = model.groups.flatMap(group => group.rows).find(row => row.node.id === OPERATIONS_FIXTURE_NODES[0].id)
    expect(first?.node).toBe(OPERATIONS_FIXTURE_NODES[0])
  })

  it('is deterministic for shuffled input and orders dated peers newest first', () => {
    const normal = buildGraphListModel({ nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, projects })
    const shuffled = buildGraphListModel({
      nodes: [...OPERATIONS_FIXTURE_NODES].reverse(),
      edges: [...OPERATIONS_FIXTURE_EDGES].reverse(),
      projects: [...projects].reverse(),
    })

    expect(shuffled.nodeIds).toEqual(normal.nodeIds)
    expect(shuffled.edgeIds).toEqual(normal.edgeIds)
    expect(shuffled.groups.map(group => group.label)).toEqual(['Familje-Stunden', 'The Prompt'])

    const prompt = shuffled.groups.find(group => group.id === FIXTURE_PROJECT_A)!
    expect(prompt.rows.filter(row => row.node.kind === 'run').map(row => row.node.id))
      .toEqual(['run:r4', 'run:r2', 'run:r1'])
  })

  it('preserves exact dimming, search, scope and relation identities', () => {
    const dimmedNode = 'run:r1'
    const dimmedEdge = 'workflow:w1→run:r1'
    const scopeNodeIds = new Set(['workflow:w1', 'run:r1'])
    const model = buildGraphListModel({
      nodes: OPERATIONS_FIXTURE_NODES,
      edges: OPERATIONS_FIXTURE_EDGES,
      projects,
      dimmedIds: new Set([dimmedNode]),
      dimmedEdgeIds: new Set([dimmedEdge]),
      searchHitIds: new Set([dimmedNode]),
      scopeNodeIds,
    })
    const rows = model.groups.flatMap(group => group.rows)
    const run = rows.find(row => row.node.id === dimmedNode)!

    expect(run.dimmed).toBe(true)
    expect(run.outsideScope).toBe(false)
    expect(run.searchHit).toBe(true)
    expect(run.relations.find(relation => relation.edge.id === dimmedEdge)).toMatchObject({
      edge: OPERATIONS_FIXTURE_EDGES.find(edge => edge.id === dimmedEdge),
      other: OPERATIONS_FIXTURE_NODES.find(node => node.id === 'workflow:w1'),
      dimmed: true,
    })
    expect(rows.find(row => row.node.id === 'run:r2')?.outsideScope).toBe(true)
  })
})
