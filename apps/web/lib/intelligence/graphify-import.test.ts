import { describe, expect, it } from 'vitest'
import { importGraphifyGraph, summarizeCommunities } from './graphify-import'
import { LIMITS } from './graph-contract'

function rawGraph(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    directed: false,
    multigraph: false,
    built_at_commit: 'd329d93c115e63bf27f652457eeae077e0bd41a9',
    nodes: [
      { id: 'a', label: 'a.ts', file_type: 'code', source_file: 'apps/web/a.ts', source_location: 'L1', community: 0 },
      { id: 'b', label: 'b.ts', file_type: 'code', source_file: 'apps/web/b.ts', source_location: 'L9', community: 0 },
      { id: 'doc', label: 'ADR', file_type: 'document', source_file: 'docs/adr.md', community: 1 },
    ],
    links: [
      { source: 'a', target: 'b', relation: 'imports', confidence: 'EXTRACTED' },
      { source: 'b', target: 'doc', relation: 'references', confidence: 'INFERRED' },
    ],
    ...overrides,
  })
}

describe('importGraphifyGraph', () => {
  it('imports and normalizes a valid graph', () => {
    const { graph } = importGraphifyGraph(rawGraph())
    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges).toHaveLength(2)
    expect(graph.meta.builtAtCommit).toBe('d329d93c115e63bf27f652457eeae077e0bd41a9')
    expect(graph.meta.source).toBe('graphify')
    const a = graph.nodes.find(n => n.id === 'a')!
    expect(a.degree).toBe(1)
    expect(a.source).toBe('graphify')
  })

  it('builds community summaries', () => {
    const { graph } = importGraphifyGraph(rawGraph())
    expect(graph.meta.communities!.length).toBe(2)
    expect(graph.meta.communities![0].size).toBe(2)
  })

  it('rejects invalid JSON and wrong roots (malformed artifact)', () => {
    expect(() => importGraphifyGraph('not json {')).toThrow(/not valid JSON/)
    expect(() => importGraphifyGraph('42')).toThrow()
    expect(() => importGraphifyGraph('{"nodes": 3}')).toThrow()
  })

  it('rejects oversized artifacts', () => {
    const filler = 'x'.repeat(LIMITS.MAX_ARTIFACT_BYTES + 1)
    expect(() => importGraphifyGraph(filler)).toThrow(/exceeds/)
  })

  it('aborts when secret-like content is present', () => {
    const withKey = rawGraph({
      nodes: [{ id: 'a', label: 'sk-ant-api03-abcdefghijklmnop', file_type: 'code' }],
      links: [],
    })
    expect(() => importGraphifyGraph(withKey)).toThrow(/secret-like/)

    const withPem = rawGraph({
      nodes: [{ id: 'a', label: '-----BEGIN RSA PRIVATE KEY-----', file_type: 'code' }],
      links: [],
    })
    expect(() => importGraphifyGraph(withPem)).toThrow(/secret-like/)
  })

  it('aborts when a node carries an absolute local path', () => {
    const leaky = rawGraph({
      nodes: [{ id: 'a', label: 'a.ts', file_type: 'code', source_file: '/Volumes/DISK/Projects/Omnira/a.ts' }],
      links: [],
    })
    expect(() => importGraphifyGraph(leaky)).toThrow(/unsafe source path/)
  })

  it('drops unknown relations and dangling edges without failing', () => {
    const { graph, issues } = importGraphifyGraph(rawGraph({
      links: [
        { source: 'a', target: 'b', relation: 'imports' },
        { source: 'a', target: 'b', relation: 'quantum_entangles' },
        { source: 'a', target: 'nope', relation: 'imports' },
      ],
    }))
    expect(graph.edges).toHaveLength(1)
    expect(issues.some(i => i.reason.includes('unknown relation'))).toBe(true)
    expect(issues.some(i => i.reason.includes('endpoint'))).toBe(true)
  })

  it('handles the empty graph honestly', () => {
    const { graph } = importGraphifyGraph(rawGraph({ nodes: [], links: [] }))
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
  })
})

describe('label sanitization (H1) — importer/loader contract alignment', () => {
  it('sanitizes tabs, newlines and control characters instead of failing the artifact', () => {
    const { graph } = importGraphifyGraph(rawGraph({
      nodes: [
        { id: 'tabby', label: 'foo\tbar', file_type: 'code', source_file: 'apps/web/a.ts' },
        { id: 'liny', label: 'first\nsecond', file_type: 'code', source_file: 'apps/web/b.ts' },
        { id: 'bell', label: 'ding\u0007dong', file_type: 'code', source_file: 'apps/web/c.ts' },
      ],
      links: [],
    }))
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes.map(n => n.label)).toEqual(['foo bar', 'first second', 'ding dong'])
  })

  it('drops ONLY the node whose label is unsalvageable, deterministically reported', () => {
    const { graph, issues } = importGraphifyGraph(rawGraph({
      nodes: [
        { id: 'ok', label: 'fine.ts', file_type: 'code', source_file: 'apps/web/ok.ts' },
        { id: 'bad', label: '\u0000\u0001\n\t', file_type: 'code', source_file: 'apps/web/bad.ts' },
      ],
      links: [],
    }))
    expect(graph.nodes.map(n => n.id)).toEqual(['ok'])
    expect(issues.some(i => i.reason === 'unsanitizable node label' && i.count === 1)).toBe(true)
  })

  it('rejects node ids containing control characters (ids are never rewritten)', () => {
    const { graph, issues } = importGraphifyGraph(rawGraph({
      nodes: [{ id: 'evil\nid', label: 'x.ts', file_type: 'code' }],
      links: [],
    }))
    expect(graph.nodes).toHaveLength(0)
    expect(issues.some(i => i.reason === 'node id contains control characters')).toBe(true)
  })

  it('preserves valid Unicode labels untouched', () => {
    const { graph } = importGraphifyGraph(rawGraph({
      nodes: [{ id: 'u', label: 'Överblick — Fjäll & 日本語 🚀', file_type: 'document', source_file: 'docs/x.md' }],
      links: [],
    }))
    expect(graph.nodes[0].label).toBe('Överblick — Fjäll & 日本語 🚀')
  })

  it('sanitized labels always survive the loader-side validator round trip', async () => {
    const { graph } = importGraphifyGraph(rawGraph({
      nodes: [{ id: 't', label: 'a\tb\u0002c', file_type: 'code', source_file: 'apps/web/t.ts' }],
      links: [],
    }))
    const { validateIntelligenceGraph } = await import('./graph-contract')
    expect(() => validateIntelligenceGraph(graph)).not.toThrow()
  })
})

describe('edge confidence (M4) — never inflated', () => {
  const edgeWith = (confidence: unknown) => rawGraph({
    links: [{ source: 'a', target: 'b', relation: 'imports', confidence }],
  })

  it('keeps known EXTRACTED and INFERRED', () => {
    expect(importGraphifyGraph(edgeWith('EXTRACTED')).graph.edges[0].confidence).toBe('EXTRACTED')
    expect(importGraphifyGraph(edgeWith('INFERRED')).graph.edges[0].confidence).toBe('INFERRED')
  })

  it('maps unknown, missing and unsupported values to the lowest safe tier', () => {
    expect(importGraphifyGraph(edgeWith(undefined)).graph.edges[0].confidence).toBe('INFERRED')
    expect(importGraphifyGraph(edgeWith('AMBIGUOUS')).graph.edges[0].confidence).toBe('INFERRED')
    expect(importGraphifyGraph(edgeWith('extracted')).graph.edges[0].confidence).toBe('INFERRED')
    expect(importGraphifyGraph(edgeWith(42)).graph.edges[0].confidence).toBe('INFERRED')
  })
})

describe('summarizeCommunities', () => {
  it('labels a community from dominant path + top node', () => {
    const summaries = summarizeCommunities([
      { id: 'x', kind: 'code', label: 'signals.ts', source: 'graphify', community: 7, degree: 9, sourceFile: 'apps/web/lib/atlas/signals.ts', metadata: {} },
      { id: 'y', kind: 'code', label: 'context.ts', source: 'graphify', community: 7, degree: 2, sourceFile: 'apps/web/lib/atlas/context.ts', metadata: {} },
    ])
    expect(summaries).toHaveLength(1)
    expect(summaries[0].label).toContain('apps/web/lib/atlas')
    expect(summaries[0].label).toContain('signals.ts')
    expect(summaries[0].topNodes[0].id).toBe('x')
  })
})
