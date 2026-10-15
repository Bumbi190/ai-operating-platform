import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildKnowledgeSnapshot } from '@/lib/atlas/knowledge/projection/snapshot'
import { buildProjectRecall } from '@/lib/atlas/context/project-recall'
import { isExplicitlyAuthorizedInternalPrincipal } from '@/lib/architecture-knowledge/policy'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const servers: Server[] = []
const env = {
  ATLAS_RECALL_PROJECT_ID: PROJECT, ATLAS_RECALL_PROJECT_SLUG: 'pilot',
  ATLAS_OPENVIKING_PLATFORM_MODE: 'on', ATLAS_OPENVIKING_PLATFORM_USER_ID: OWNER,
}
function publication(kind: 'platform' | 'project' = 'platform', count = 1, content = 'Approved platform original.') {
  const snapshot = buildKnowledgeSnapshot(Array.from({ length: count }, (_, i) => ({
    path: kind + '-' + i + '.md', title: kind + ' ' + i, type: 'architecture' as const,
    classification: 'internal' as const,
    scope: kind === 'platform' ? { kind: 'platform' as const } : { kind: 'project' as const, projectId: PROJECT },
    sourceOfTruth: 'repository' as const, canonicalPath: 'docs/canonical.md', content,
  })))
  return kind === 'platform'
    ? { scope: { kind: 'platform' }, manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl }
    : { projectId: PROJECT, projectSlug: 'pilot', manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl }
}
async function fixture(handler: RequestListener) {
  const server = createServer(handler); servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port
}
function response(input: ReturnType<typeof publication>, root: string) {
  return JSON.stringify({ status: 'ok', result: { resources: input.documentsJsonl.trim().split('\n').map(line => {
    const row = JSON.parse(line)
    return { uri: root + '/' + row.id + '.md/' + row.id + '.md', level: 2, context_type: 'resource', score: 0.9, content: 'REMOTE_INJECTION_SENTINEL' }
  }) } })
}
function platformRoot(input: ReturnType<typeof publication>) {
  return 'viking://resources/omnira/platform/knowledge/' + input.manifest.snapshot_id
}
async function recall(overrides: Record<string, unknown> = {}) {
  return buildProjectRecall({
    userId: OWNER, internalAuthorized: true, allowedProjectIds: [PROJECT], viewProjectSlug: 'pilot',
    query: 'Which architecture rule applies?', platformPublication: publication(), env,
    ...overrides,
  } as Parameters<typeof buildProjectRecall>[0])
}
afterEach(async () => {
  vi.unstubAllEnvs(); vi.restoreAllMocks()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe('owner-only local platform recall', () => {
  it('injects original platform evidence for the authenticated approved owner with its own credential', async () => {
    const input = publication()
    const requests: { key: string | undefined; body: Record<string, unknown> }[] = []
    const url = await fixture(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk
      requests.push({ key: req.headers['x-api-key'] as string, body: JSON.parse(body) })
      res.end(response(input, platformRoot(input)))
    })
    const text = await recall({ env: { ...env, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'platform-reader' } })
    expect(text).toContain('Approved platform original.')
    expect(text).toContain('PLATFORM KNOWLEDGE')
    expect(text).toContain('docs/canonical.md')
    expect(text).toContain(input.manifest.snapshot_id)
    expect(text).not.toContain('REMOTE_INJECTION_SENTINEL')
    expect(requests).toEqual([{ key: 'platform-reader', body: {
      query: 'Which architecture rule applies?', target_uri: platformRoot(input), context_type: 'resource', level: 2, limit: 8,
    } }])
  })
  it.each([
    ['anonymous', { userId: null }],
    ['ordinary owner of the pilot project', { internalAuthorized: false }],
    ['another authorized internal principal', { userId: OTHER }],
    ['client supplies internal authorization', { internalAuthorized: undefined }],
    ['revoked project access', { allowedProjectIds: [] }],
    ['foreign active project', { viewProjectSlug: 'foreign' }],
  ])('does no platform IO for %s', async (_label, overrides) => {
    let calls = 0
    const url = await fixture((_req, res) => { calls++; res.end('{}') })
    expect(await recall({ ...overrides, env: { ...env, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'key' } })).toBe('')
    expect(calls).toBe(0)
  })
  it.each([undefined, 'off', 'ON', 'invalid'])('defaults closed for platform mode %s', async mode => {
    let calls = 0
    const url = await fixture((_req, res) => { calls++; res.end('{}') })
    expect(await recall({ env: { ...env, ATLAS_OPENVIKING_PLATFORM_MODE: mode, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'key' } })).toBe('')
    expect(calls).toBe(0)
  })
  it('never borrows project credentials or invents a platform owner', async () => {
    let calls = 0
    const url = await fixture((_req, res) => { calls++; res.end('{}') })
    for (const config of [
      { ...env, ATLAS_OPENVIKING_URL: url, ATLAS_OPENVIKING_API_KEY: 'project-key' },
      { ...env, ATLAS_OPENVIKING_PLATFORM_USER_ID: undefined, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'key' },
    ]) expect(await recall({ env: config })).toBe('')
    expect(calls).toBe(0)
  })
  it.each(['project artifact', 'mixed scope', 'tampered body', 'prohibited classification', 'ambiguous envelope'])('rejects %s before any platform IO', async corruption => {
    let input: unknown = publication()
    if (corruption === 'project artifact') input = publication('project')
    if (corruption === 'mixed scope' || corruption === 'prohibited classification') {
      const valid = publication()
      const row = JSON.parse(valid.documentsJsonl.trim())
      if (corruption === 'mixed scope') row.scope = { kind: 'project', projectId: PROJECT }
      else row.classification = 'confidential'
      const { sha256 } = await import('@/lib/architecture-knowledge/hash')
      const documentsJsonl = JSON.stringify(row) + '\n'
      const manifest = { document_count: 1, documents_hash: sha256(documentsJsonl), schema_version: 'knowledge-projection-v1' }
      input = { scope: { kind: 'platform' }, documentsJsonl, manifest: { ...manifest, snapshot_id: sha256(JSON.stringify(manifest)) } }
    }
    if (corruption === 'tampered body') {
      const valid = publication(); input = { ...valid, documentsJsonl: valid.documentsJsonl.replace('Approved', 'Tampered') }
    }
    if (corruption === 'ambiguous envelope') input = { ...publication(), projectId: PROJECT, projectSlug: 'pilot' }
    let calls = 0
    const url = await fixture((_req, res) => { calls++; res.end('{}') })
    expect(await recall({ platformPublication: input, env: { ...env, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'key' } })).toBe('')
    expect(calls).toBe(0)
  })
  it('retrieves in shadow without adding platform text or logging source content', async () => {
    const input = publication(); let calls = 0
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const url = await fixture((_req, res) => { calls++; res.end(response(input, platformRoot(input))) })
    expect(await recall({ env: { ...env, ATLAS_OPENVIKING_PLATFORM_MODE: 'shadow', ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'private-key' } })).toBe('')
    expect(calls).toBe(1)
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Approved platform original|private-key/)
  })
  it('keeps one 6000-character content budget with separate scope provenance', async () => {
    const platform = publication('platform', 8, 'P'.repeat(1500))
    const project = publication('project', 8, 'J'.repeat(1500))
    const keys: string[] = []
    const platformUrl = await fixture((req, res) => { keys.push(String(req.headers['x-api-key'])); res.end(response(platform, platformRoot(platform))) })
    const projectRoot = 'viking://resources/omnira/projects/' + PROJECT + '/knowledge/' + project.manifest.snapshot_id
    const projectUrl = await fixture((req, res) => { keys.push(String(req.headers['x-api-key'])); res.end(response(project, projectRoot)) })
    const text = await recall({ publication: project, platformPublication: platform, env: {
      ...env, ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: projectUrl, ATLAS_OPENVIKING_API_KEY: 'project-reader',
      ATLAS_OPENVIKING_PLATFORM_URL: platformUrl, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'platform-reader',
    } })
    expect(text).toContain('PROJECT RECALL')
    expect(text).toContain('PLATFORM KNOWLEDGE')
    expect(text).toContain('P'.repeat(1200))
    expect(text).toContain('J'.repeat(1200))
    const excerpts = [...text.matchAll(/"content":"([PJ]+)"/g)].map(match => match[1])
    expect(excerpts.reduce((total, excerpt) => total + excerpt.length, 0)).toBe(6000)
    expect(excerpts.every(excerpt => excerpt.length <= 1200)).toBe(true)
    expect(keys.sort()).toEqual(['platform-reader', 'project-reader'])
  })
  it('retains project evidence when the platform service fails', async () => {
    const project = publication('project', 1, 'Project evidence survives.')
    const projectRoot = 'viking://resources/omnira/projects/' + PROJECT + '/knowledge/' + project.manifest.snapshot_id
    const projectUrl = await fixture((_req, res) => res.end(response(project, projectRoot)))
    const platformUrl = await fixture((_req, res) => { res.statusCode = 500; res.end('PRIVATE_FAILURE') })
    const text = await recall({ publication: project, env: {
      ...env, ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: projectUrl, ATLAS_OPENVIKING_API_KEY: 'project-reader',
      ATLAS_OPENVIKING_PLATFORM_URL: platformUrl, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'platform-reader',
    } })
    expect(text).toContain('Project evidence survives.')
    expect(text).not.toContain('PRIVATE_FAILURE')
  })
  it.each(['project namespace', 'stale platform snapshot'])('rejects %s with otherwise valid response fields', async corruption => {
    const input = publication()
    const root = platformRoot(input)
    const wrongRoot = corruption === 'project namespace'
      ? root.replace('/platform/', '/projects/' + PROJECT + '/')
      : root.replace(input.manifest.snapshot_id, '0'.repeat(64))
    const url = await fixture((_req, res) => res.end(response(input, wrongRoot)))
    expect(await recall({ env: { ...env, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'key' } })).toBe('')
  })
  it('limits combined short-document evidence to eight documents', async () => {
    const platform = publication('platform', 8, 'platform excerpt')
    const project = publication('project', 8, 'project excerpt')
    const platformUrl = await fixture((_req, res) => res.end(response(platform, platformRoot(platform))))
    const projectRoot = 'viking://resources/omnira/projects/' + PROJECT + '/knowledge/' + project.manifest.snapshot_id
    const projectUrl = await fixture((_req, res) => res.end(response(project, projectRoot)))
    const text = await recall({ publication: project, platformPublication: platform, env: {
      ...env, ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: projectUrl, ATLAS_OPENVIKING_API_KEY: 'project-reader',
      ATLAS_OPENVIKING_PLATFORM_URL: platformUrl, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'platform-reader',
    } })
    expect([...text.matchAll(/"source":"published-knowledge"/g)]).toHaveLength(8)
    expect([...text.matchAll(/"content":"platform excerpt"/g)]).toHaveLength(4)
    expect([...text.matchAll(/"content":"project excerpt"/g)]).toHaveLength(4)
  })
  it('runs both stalled scopes concurrently within one search deadline', async () => {
    let calls = 0
    const url = await fixture(() => { calls++ })
    const start = Date.now()
    expect(await recall({ publication: publication('project'), env: {
      ...env, ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: url, ATLAS_OPENVIKING_API_KEY: 'project-reader',
      ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'platform-reader',
    } })).toBe('')
    expect(calls).toBe(2)
    expect(Date.now() - start).toBeLessThan(2100)
  })
  it('bounds a stalled platform request to the existing deadline', async () => {
    const url = await fixture(() => {})
    const start = Date.now()
    expect(await recall({ env: { ...env, ATLAS_OPENVIKING_PLATFORM_URL: url, ATLAS_OPENVIKING_PLATFORM_API_KEY: 'key' } })).toBe('')
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000)
    expect(Date.now() - start).toBeLessThan(2200)
  })
  it('uses the existing knowledge allowlist rather than operational operator authority', () => {
    vi.stubEnv('BREVO_ADMIN_EMAIL', '')
    vi.stubEnv('ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS', 'owner@example.invalid')
    vi.stubEnv('PLATFORM_OPERATOR_EMAILS', 'operator@example.invalid')
    expect(isExplicitlyAuthorizedInternalPrincipal('owner@example.invalid')).toBe(true)
    expect(isExplicitlyAuthorizedInternalPrincipal('operator@example.invalid')).toBe(false)
  })
})
