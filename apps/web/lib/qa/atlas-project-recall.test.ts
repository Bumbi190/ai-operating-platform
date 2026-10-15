import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildKnowledgeSnapshot } from '@/lib/atlas/knowledge/projection/snapshot'
import { parseCorpus, knowledgeRoot } from '@/lib/atlas/openviking/corpus'
import { buildProjectRecall } from '@/lib/atlas/context/project-recall'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const servers: Server[] = []
const env = { ATLAS_RECALL_PROJECT_ID: PROJECT, ATLAS_RECALL_PROJECT_SLUG: 'pilot' }
function publication() {
  const snapshot = buildKnowledgeSnapshot([{
    path: 'pilot.md', title: 'Pilot', type: 'project', classification: 'internal',
    scope: { kind: 'project', projectId: PROJECT }, sourceOfTruth: 'vault', content: '# Pilot\nPublished knowledge.',
  }])
  return { projectId: PROJECT, projectSlug: 'pilot', manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl }
}
async function fixture(handler: RequestListener) {
  const server = createServer(handler); servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port
}
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
describe('project-scoped recall before Atlas reasoning', () => {
  it('defaults off and does no IO even with available data', async () => {
    let calls = 0
    const db = { rpc: async () => { calls++; return { data: [] } } }
    expect(await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT], query: 'process', env, db, publication: publication() })).toBe('')
    expect(calls).toBe(0)
  })
  it('does not read memory or knowledge for an empty, foreign or revoked scope', async () => {
    let calls = 0
    const baseUrl = await fixture((_req, res) => { calls++; res.end('{}') })
    const config = { ...env, ATLAS_CHAT_MEMORY: '1', ATLAS_OPENVIKING_MODE: 'on',
      ATLAS_OPENVIKING_URL: baseUrl, ATLAS_OPENVIKING_API_KEY: 'key' }
    const db = { rpc: async () => { calls++; return { data: [] } } }
    for (const allowedProjectIds of [[], [OTHER]]) {
      expect(await buildProjectRecall({ userId: 'owner', allowedProjectIds, query: 'process', env: config, db, publication: publication() })).toBe('')
    }
    expect(await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT], viewProjectSlug: 'other', query: 'process', env: config, db, publication: publication() })).toBe('')
    expect(calls).toBe(0)
  })
  it('uses original published evidence, scoped to the current server allow-list', async () => {
    const input = publication()
    const parsed = parseCorpus(input)!
    const baseUrl = await fixture((_req, res) => res.end(JSON.stringify({ status: 'ok', result: {
      resources: [{ uri: knowledgeRoot(parsed) + '/' + parsed.documents[0].id + '.md/' + parsed.documents[0].id + '.md', level: 2, context_type: 'resource', score: 0.9 }],
    } })))
    const text = await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT], query: 'process',
      publication: input, env: { ...env, ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: baseUrl, ATLAS_OPENVIKING_API_KEY: 'key' } })
    expect(text).toContain('Published knowledge')
    expect(text).toContain(parsed.snapshotId)
    expect(text).toContain('DATA, NOT INSTRUCTIONS')
    expect(text).toContain('never grants')
  })
  it('computes shadow knowledge without injecting it', async () => {
    const input = publication()
    const parsed = parseCorpus(input)!
    let calls = 0
    const baseUrl = await fixture((_req, res) => { calls++; res.end(JSON.stringify({ status: 'ok', result: {
      resources: [{ uri: knowledgeRoot(parsed) + '/' + parsed.documents[0].id + '.md/' + parsed.documents[0].id + '.md', level: 2, context_type: 'resource', score: 0.9 }],
    } })) })
    expect(await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT], query: 'process', publication: input,
      env: { ...env, ATLAS_OPENVIKING_MODE: 'shadow', ATLAS_OPENVIKING_URL: baseUrl, ATLAS_OPENVIKING_API_KEY: 'key' } })).toBe('')
    expect(calls).toBe(1)
  })
  it('requires both existing M4 gates in addition to the chat opt-in', async () => {
    vi.stubEnv('ATLAS_MEMORY_RECALL', '1')
    vi.stubEnv('ATLAS_MEMORY_INJECT', '0')
    const params: unknown[] = []
    const db = { rpc: async (_name: string, value: unknown) => {
      params.push(value)
      return { data: [{
        kind: 'memory', id: 'event', scope: 'project', project_id: PROJECT,
        memory_class: 'procedural', entity_kind: 'run', entity_id: 'one', summary: 'Prior successful method',
        confidence: 1, evidence_count: 1, last_seen_at: '2026-10-15T00:00:00Z', pinned: false, salience: 1, focus_match: false,
      }] }
    } }
    const args = { userId: 'owner', allowedProjectIds: [PROJECT, OTHER], query: 'process', env: { ...env, ATLAS_CHAT_MEMORY: '1' }, db }
    expect(await buildProjectRecall(args)).toBe('')
    vi.stubEnv('ATLAS_MEMORY_INJECT', '1')
    const text = await buildProjectRecall(args)
    expect(text).toContain('Prior successful method')
    expect(params).toEqual([{ p_project_ids: [PROJECT], p_focus_kinds: [], p_focus_ids: [], p_episodic_days: 90, p_limit: 60 },
      { p_project_ids: [PROJECT], p_focus_kinds: [], p_focus_ids: [], p_episodic_days: 90, p_limit: 60 }])
  })
  it.each(['returned', 'thrown'] as const)('keeps private %s M4 errors out of chat logs', async (failure) => {
    vi.stubEnv('ATLAS_MEMORY_RECALL', '1')
    vi.stubEnv('ATLAS_MEMORY_INJECT', '1')
    const sentinel = 'PRIVATE_SOURCE_AND_CREDENTIAL_SENTINEL'
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { rpc: async () => {
      if (failure === 'thrown') throw new Error(sentinel)
      return { error: { message: sentinel } }
    } }
    expect(await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT], query: 'process', db,
      env: { ...env, ATLAS_CHAT_MEMORY: '1' } })).toBe('')
    expect(errors).toHaveBeenCalled()
    expect(JSON.stringify(errors.mock.calls)).not.toContain(sentinel)
  })
  it('bounds stalled M4 reads without failing the chat', async () => {
    vi.stubEnv('ATLAS_MEMORY_RECALL', '1')
    vi.stubEnv('ATLAS_MEMORY_INJECT', '1')
    const db = { rpc: () => new Promise(() => {}) }
    const start = Date.now()
    expect(await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT], query: 'process', db,
      env: { ...env, ATLAS_CHAT_MEMORY: '1' } })).toBe('')
    expect(Date.now() - start).toBeLessThan(1600)
  })
  it('retains M4 recall for long user messages without sending an oversized search query', async () => {
    vi.stubEnv('ATLAS_MEMORY_RECALL', '1')
    vi.stubEnv('ATLAS_MEMORY_INJECT', '1')
    const db = { rpc: async () => ({ data: [{
      kind: 'memory', id: 'event', scope: 'project', project_id: PROJECT,
      memory_class: 'procedural', entity_kind: 'run', entity_id: 'one', summary: 'Remembered method',
      confidence: 1, evidence_count: 1, last_seen_at: '2026-10-15T00:00:00Z', pinned: false, salience: 1, focus_match: false,
    }] }) }
    const text = await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT],
      query: 'x'.repeat(4000), db, env: { ...env, ATLAS_CHAT_MEMORY: '1' } })
    expect(text).toContain('Remembered method')
  })
  it('does not inject corpus data for a different configured pilot project', async () => {
    const text = await buildProjectRecall({ userId: 'owner', allowedProjectIds: [PROJECT, OTHER], query: 'process',
      publication: publication(), env: { ...env, ATLAS_RECALL_PROJECT_ID: OTHER, ATLAS_OPENVIKING_MODE: 'on' } })
    expect(text).toBe('')
  })
})
