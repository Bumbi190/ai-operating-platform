import { describe, expect, it } from 'vitest'
import {
  isSafeRelativePath,
  LIMITS,
  OPERATIONS_SNAPSHOT_SOURCES,
  normalizeEdge,
  normalizeNode,
  validateIntelligenceGraph,
  type OperationsGraphResponse,
} from './graph-contract'

const validNode = {
  id: 'apps_web_lib_foo',
  kind: 'code',
  label: 'foo.ts',
  source: 'graphify',
  sourceFile: 'apps/web/lib/foo.ts',
  sourceLocation: 'L12',
  community: 3,
  degree: 7,
  metadata: {},
}

describe('isSafeRelativePath', () => {
  it('accepts repo-relative paths', () => {
    expect(isSafeRelativePath('apps/web/lib/foo.ts')).toBe(true)
    expect(isSafeRelativePath('supabase/migrations/x.sql')).toBe(true)
  })
  it('rejects absolute and private paths', () => {
    expect(isSafeRelativePath('/Volumes/X/Projects/Omnira/foo.ts')).toBe(false)
    expect(isSafeRelativePath('/home/user/repo/foo.ts')).toBe(false)
    expect(isSafeRelativePath('C:\\repo\\foo.ts')).toBe(false)
    expect(isSafeRelativePath('users/andre/secret.ts')).toBe(false)
    expect(isSafeRelativePath('volumes/disk/foo.ts')).toBe(false)
  })
  it('rejects traversal, null bytes and empty', () => {
    expect(isSafeRelativePath('../../etc/passwd')).toBe(false)
    expect(isSafeRelativePath('apps/../../.env')).toBe(false)
    expect(isSafeRelativePath('a\0b')).toBe(false)
    expect(isSafeRelativePath('')).toBe(false)
  })
})

describe('normalizeNode', () => {
  it('accepts a valid node', () => {
    const { node } = normalizeNode(validNode)
    expect(node).not.toBeNull()
    expect(node!.id).toBe('apps_web_lib_foo')
    expect(node!.sourceFile).toBe('apps/web/lib/foo.ts')
    expect(node!.degree).toBe(7)
  })
  it('fails closed on unknown kind / missing fields / bad source', () => {
    expect(normalizeNode({ ...validNode, kind: 'wormhole' }).node).toBeNull()
    expect(normalizeNode({ ...validNode, id: '' }).node).toBeNull()
    expect(normalizeNode({ ...validNode, label: undefined }).node).toBeNull()
    expect(normalizeNode({ ...validNode, source: 'random' }).node).toBeNull()
    expect(normalizeNode(null).node).toBeNull()
    expect(normalizeNode('x').node).toBeNull()
  })
  it('rejects nodes with unsafe source paths', () => {
    const { node, reason } = normalizeNode({ ...validNode, sourceFile: '/Users/x/repo/foo.ts' })
    expect(node).toBeNull()
    expect(reason).toContain('unsafe')
  })
  it('strips control characters in labels', () => {
    expect(normalizeNode({ ...validNode, label: 'ab' }).node).toBeNull()
  })
})

describe('normalizeEdge', () => {
  const ids = new Set(['a', 'b'])
  it('accepts a valid edge and drops unknown endpoints/relations', () => {
    expect(normalizeEdge({ source: 'a', target: 'b', relation: 'imports' }, ids)).not.toBeNull()
    expect(normalizeEdge({ source: 'a', target: 'zzz', relation: 'imports' }, ids)).toBeNull()
    expect(normalizeEdge({ source: 'a', target: 'b', relation: 'MIND_MELD' }, ids)).toBeNull()
  })
  it('accepts runtime relations and timestamps', () => {
    const e = normalizeEdge(
      { source: 'a', target: 'b', relation: 'STARTED', timestamp: '2026-07-01T10:00:00Z', confidence: 'DERIVED' },
      ids,
    )
    expect(e).not.toBeNull()
    expect(e!.timestamp).toBe('2026-07-01T10:00:00Z')
    expect(e!.confidence).toBe('DERIVED')
  })
})

describe('validateIntelligenceGraph', () => {
  it('validates a complete graph', () => {
    const g = validateIntelligenceGraph({
      meta: { source: 'graphify', generatedAt: '2026-07-08T00:00:00Z', builtAtCommit: 'd329d93' },
      nodes: [validNode, { ...validNode, id: 'other', label: 'bar.ts' }],
      edges: [{ source: 'apps_web_lib_foo', target: 'other', relation: 'imports' }],
    })
    expect(g.nodes).toHaveLength(2)
    expect(g.edges).toHaveLength(1)
    expect(g.meta.builtAtCommit).toBe('d329d93')
  })

  it('handles the empty graph without inventing data', () => {
    const g = validateIntelligenceGraph({ nodes: [], edges: [] })
    expect(g.nodes).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
    expect(g.meta.nodeCount).toBe(0)
  })

  it('rejects malformed roots', () => {
    expect(() => validateIntelligenceGraph(null)).toThrow()
    expect(() => validateIntelligenceGraph({ nodes: 'x', edges: [] })).toThrow()
    expect(() => validateIntelligenceGraph({ nodes: [], edges: {} })).toThrow()
    expect(() => validateIntelligenceGraph({ nodes: [{ bogus: true }], edges: [] })).toThrow()
  })

  it('rejects oversized graphs (node cap)', () => {
    const nodes = Array.from({ length: LIMITS.MAX_NODES + 1 }, (_, i) => ({ ...validNode, id: `n${i}` }))
    expect(() => validateIntelligenceGraph({ nodes, edges: [] })).toThrow(/too many nodes/)
  })

  it('drops edges pointing at unknown nodes instead of failing the artifact', () => {
    const g = validateIntelligenceGraph({
      nodes: [validNode],
      edges: [{ source: 'apps_web_lib_foo', target: 'ghost', relation: 'imports' }],
    })
    expect(g.edges).toHaveLength(0)
  })
})


describe('Operations snapshot contract', () => {
  it('declares only the supported snapshot sources and capabilities', () => {
    expect(OPERATIONS_SNAPSHOT_SOURCES).toEqual([
      'projects', 'agents', 'workflows', 'runs', 'approvals', 'outputs', 'manager_tasks',
    ])

    const response: OperationsGraphResponse = {
      available: true,
      projects: [],
      snapshot: {
        generatedAt: '2026-07-14T10:00:00.000Z',
        requestedHours: 24,
        authorizedProjectIds: [],
        appliedProjectId: null,
        returnedProjectIds: [],
        queriedSources: ['projects'],
        delivery: 'snapshot_only',
        sourceFreshness: 'unknown',
        capabilities: {
          realtime: false,
          polling: true,
          incidents: false,
          toolCalls: false,
          atlasRuntime: false,
          managerRuntime: false,
          correlation: false,
          causation: false,
          replay: false,
        },
      },
      meta: { source: 'runtime', generatedAt: '2026-07-14T10:00:00.000Z', nodeCount: 0, edgeCount: 0 },
      nodes: [],
      edges: [],
    }

    expect(response.snapshot.delivery).toBe('snapshot_only')
    expect(response.snapshot.sourceFreshness).toBe('unknown')
    expect(response.snapshot.capabilities).toMatchObject({ realtime: false, polling: true, replay: false })
  })
})
