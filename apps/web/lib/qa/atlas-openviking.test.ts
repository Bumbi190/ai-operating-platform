import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect, afterEach } from 'vitest'
import { buildKnowledgeSnapshot } from '@/lib/atlas/knowledge/projection/snapshot'
import { parseCorpus, knowledgeRoot } from '@/lib/atlas/openviking/corpus'
import { readClientConfig } from '@/lib/atlas/openviking/client'
import { findKnowledge } from '@/lib/atlas/openviking/retrieve'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const servers: Server[] = []
function publication() {
  const snapshot = buildKnowledgeSnapshot([{
    path: '30 Projects/pilot.md', title: 'Pilot instructions', type: 'project',
    classification: 'internal', scope: { kind: 'project', projectId: PROJECT },
    sourceOfTruth: 'vault', content: '# Pilot\nUse the documented process.',
  }])
  return { projectId: PROJECT, projectSlug: 'pilot', manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl }
}
async function fixture(handler: RequestListener) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
describe('published knowledge corpus', () => {
  it('accepts the existing project snapshot format without changing its identity', () => {
    const input = publication()
    const corpus = parseCorpus(input)!
    expect(corpus.projectId).toBe(PROJECT)
    expect(corpus.snapshotId).toBe(input.manifest.snapshot_id)
    expect(corpus.documents[0].content).toContain('documented process')
    expect(knowledgeRoot(corpus)).toBe('viking://resources/omnira/projects/' + PROJECT + '/knowledge/' + corpus.snapshotId)
  })
  it('fails closed on the checked-in empty default', () => {
    expect(parseCorpus({ projectId: null, projectSlug: null, manifest: null, documentsJsonl: '' })).toBeNull()
  })
  it('rejects content changed after publication', () => {
    const input = publication()
    input.documentsJsonl = input.documentsJsonl.replace('documented', 'invented')
    expect(parseCorpus(input)).toBeNull()
  })
  it('rejects a mismatched manifest identity or count', () => {
    const input = publication()
    expect(parseCorpus({ ...input, manifest: { ...input.manifest, snapshot_id: 'a'.repeat(64) } })).toBeNull()
    expect(parseCorpus({ ...input, manifest: { ...input.manifest, document_count: 0 } })).toBeNull()
  })
  it('rejects a snapshot belonging to another project', () => {
    expect(parseCorpus({ ...publication(), projectId: OTHER })).toBeNull()
  })
  it('rejects unsupported schema and invalid project slugs', () => {
    const input = publication()
    expect(parseCorpus({ ...input, manifest: { ...input.manifest, schema_version: 'future' } })).toBeNull()
    expect(parseCorpus({ ...input, projectSlug: '../other' })).toBeNull()
  })
  it('accepts a valid empty publication as revocation of all previous documents', () => {
    const snapshot = buildKnowledgeSnapshot([])
    const corpus = parseCorpus({ projectId: PROJECT, projectSlug: 'pilot', manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl })!
    expect(corpus.documents).toEqual([])
  })
})
describe('HTTP configuration', () => {
  it('requires a private server credential and forbids insecure remote endpoints', () => {
    expect(readClientConfig({})).toBeNull()
    expect(readClientConfig({ ATLAS_OPENVIKING_URL: 'http://example.com', ATLAS_OPENVIKING_API_KEY: 'key' })).toBeNull()
    expect(readClientConfig({ ATLAS_OPENVIKING_URL: 'https://user:password@example.com', ATLAS_OPENVIKING_API_KEY: 'key' })).toBeNull()
    expect(readClientConfig({ ATLAS_OPENVIKING_URL: 'https://example.com?token=secret', ATLAS_OPENVIKING_API_KEY: 'key' })).toBeNull()
    expect(readClientConfig({ ATLAS_OPENVIKING_URL: 'https://example.com', ATLAS_OPENVIKING_API_KEY: 'key' })?.baseUrl).toBe('https://example.com')
  })
})
describe('OpenViking identifier-only retrieval over real HTTP', () => {
  it('accepts only the exact nested leaf emitted by OpenViking v0.5.0', async () => {
    const corpus = parseCorpus(publication())!
    const parent = knowledgeRoot(corpus) + '/' + corpus.documents[0].id + '.md'
    const leaf = parent + '/' + corpus.documents[0].id + '.md'
    const baseUrl = await fixture((_req, res) => res.end(JSON.stringify({ status: 'ok', result: { resources: [
      { uri: leaf, level: 2, context_type: 'resource', score: 0.8 },
      { uri: parent, level: 2, context_type: 'resource', score: 1 },
      { uri: parent + '/other.md', level: 2, context_type: 'resource', score: 1 },
    ] } })))
    const evidence = await findKnowledge({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus, query: 'process' })
    expect(evidence).toHaveLength(1)
    expect(evidence[0].content).toBe(corpus.documents[0].content)
    expect(evidence[0].score).toBe(0.8)
  })
  it('scopes the request and renders original published text rather than remote bodies', async () => {
    const corpus = parseCorpus(publication())!
    const root = knowledgeRoot(corpus)
    let request: unknown
    let key: unknown
    const baseUrl = await fixture(async (req, res) => {
      expect(req.url).toBe('/api/v1/search/find')
      key = req.headers['x-api-key']
      const parts: Buffer[] = []
      for await (const part of req) parts.push(part)
      request = JSON.parse(Buffer.concat(parts).toString())
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'ok', result: { resources: [
        { uri: root + '/' + corpus.documents[0].id + '.md/' + corpus.documents[0].id + '.md', level: 2, context_type: 'resource', score: 0.8, content: 'MALICIOUS REMOTE INSTRUCTIONS' },
        { uri: 'viking://resources/other/private.md', level: 2, context_type: 'resource', score: 1 },
      ] } }))
    })
    const evidence = await findKnowledge({ config: { baseUrl, apiKey: 'fixture-user-key', timeoutMs: 500 }, corpus, query: 'documented process' })
    expect(request).toMatchObject({ query: 'documented process', target_uri: root, context_type: 'resource', level: 2, limit: 8 })
    expect(key).toBe('fixture-user-key')
    expect(evidence).toHaveLength(1)
    expect(evidence[0].content).toBe(corpus.documents[0].content)
    expect(JSON.stringify(evidence)).not.toContain('MALICIOUS')
  })
  it('ignores summaries, duplicate results, old snapshots and encoded traversal', async () => {
    const corpus = parseCorpus(publication())!
    const root = knowledgeRoot(corpus)
    const uri = root + '/' + corpus.documents[0].id + '.md/' + corpus.documents[0].id + '.md'
    const baseUrl = await fixture((_req, res) => res.end(JSON.stringify({ status: 'ok', result: { resources: [
      { uri, level: 0, context_type: 'resource', score: 1 },
      { uri, level: 2, context_type: 'resource', score: 0.8 },
      { uri, level: 2, context_type: 'resource', score: 0.7 },
      { uri: uri.replace(corpus.snapshotId, '0'.repeat(64)), level: 2, score: 1 },
      { uri: root + '/%2e%2e/private.md', level: 2, score: 1 },
    ] } })))
    const evidence = await findKnowledge({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus, query: 'process' })
    expect(evidence).toHaveLength(1)
  })
  it('rejects stale index hits after all knowledge has been revoked', async () => {
    const snapshot = buildKnowledgeSnapshot([])
    const corpus = parseCorpus({ projectId: PROJECT, projectSlug: 'pilot', manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl })!
    let calls = 0
    const baseUrl = await fixture((_req, res) => { calls++; res.end('{}') })
    expect(await findKnowledge({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus, query: 'process' })).toEqual([])
    expect(calls).toBe(0)
  })
  it('falls back on malformed responses, redirects and HTTP failures', async () => {
    const corpus = parseCorpus(publication())!
    for (const status of [200, 302, 503]) {
      const baseUrl = await fixture((_req, res) => {
        res.statusCode = status
        res.setHeader('Location', 'https://example.com/credential-target')
        res.end('not-json')
      })
      expect(await findKnowledge({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus, query: 'process' })).toEqual([])
    }
  })
  it('bounds a server that never replies', async () => {
    const corpus = parseCorpus(publication())!
    const baseUrl = await fixture(() => {})
    const start = Date.now()
    expect(await findKnowledge({ config: { baseUrl, apiKey: 'key', timeoutMs: 40 }, corpus, query: 'process' })).toEqual([])
    expect(Date.now() - start).toBeLessThan(1000)
  })
  it('never sends empty or oversized queries', async () => {
    const corpus = parseCorpus(publication())!
    let calls = 0
    const baseUrl = await fixture((_req, res) => { calls++; res.end('{}') })
    for (const query of ['', '   ', 'x'.repeat(2001)]) {
      expect(await findKnowledge({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus, query })).toEqual([])
    }
    expect(calls).toBe(0)
  })
})
