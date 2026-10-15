import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildKnowledgeSnapshot } from '@/lib/atlas/knowledge/projection/snapshot'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const state = vi.hoisted(() => ({
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.invalid' } as { id: string; email: string } | null,
  publication: {} as unknown, call: vi.fn(),
}))
vi.mock('@/data/openviking/platform-corpus.json', () => ({ default: state.publication }))
vi.mock('@/lib/ai/openai-client', () => ({ openAIChatCompletion: state.call }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }))
function builder(table: string): any {
  const b: any = { then: (ok: any) => Promise.resolve({ data: table === 'projects' ? [{ id: PROJECT }] : [], error: null }).then(ok) }
  for (const name of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'is', 'not', 'order', 'limit', 'range', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete', 'filter', 'or', 'contains']) b[name] = () => b
  return b
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => builder(table), rpc: async () => ({ data: null, error: null }) }) }))
let server: Server
let searches: number
beforeEach(async () => {
  vi.resetModules(); searches = 0
  state.user = { id: OWNER, email: 'owner@example.invalid' }
  const snapshot = buildKnowledgeSnapshot([{
    path: 'platform-fixture.md', title: 'Platform fixture', type: 'architecture', classification: 'internal',
    scope: { kind: 'platform' }, sourceOfTruth: 'repository', canonicalPath: 'docs/canonical.md',
    content: 'APPROVED_PLATFORM_ROUTE_EVIDENCE',
  }])
  state.publication = { scope: { kind: 'platform' }, manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl }
  const row = JSON.parse(snapshot.documentsJsonl.trim())
  server = createServer((_req, res) => {
    searches++
    res.end(JSON.stringify({ status: 'ok', result: { resources: [{
      uri: 'viking://resources/omnira/platform/knowledge/' + snapshot.manifest.snapshot_id + '/' + row.id + '.md/' + row.id + '.md',
      level: 2, context_type: 'resource', score: 0.9,
    }] } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const config = {
    ATLAS_CHAT_PROVIDER: 'openai', OPENAI_API_KEY: 'test-placeholder', ANTHROPIC_API_KEY: '',
    ATLAS_OPENVIKING_MODE: 'off', ATLAS_CHAT_MEMORY: '0', ATLAS_CTX_ASSEMBLER: 'off',
    ATLAS_RECALL_PROJECT_ID: PROJECT, ATLAS_RECALL_PROJECT_SLUG: 'pilot',
    ATLAS_OPENVIKING_PLATFORM_MODE: 'on', ATLAS_OPENVIKING_PLATFORM_USER_ID: OWNER,
    ATLAS_OPENVIKING_PLATFORM_URL: 'http://127.0.0.1:' + (server.address() as AddressInfo).port,
    ATLAS_OPENVIKING_PLATFORM_API_KEY: 'platform-reader',
    ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS: 'owner@example.invalid', BREVO_ADMIN_EMAIL: '',
  }
  for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value)
  state.call.mockReset().mockImplementation(async () => (async function* () {
    yield { choices: [{ index: 0, delta: { content: 'Test reply.' }, finish_reason: 'stop' }] }
    yield { choices: [], usage: { prompt_tokens: 100, completion_tokens: 10 } }
  })())
})
afterEach(async () => {
  vi.unstubAllEnvs()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})
async function post(extra: Record<string, unknown> = {}) {
  const { POST } = await import('@/app/api/chat/route')
  const result = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hur fungerar plattformens interna arbetsflödeskatalog?' }], ...extra }),
  }))
  await result.text()
  return result.status
}
function prompt() { return JSON.stringify(state.call.mock.calls[0]?.[1]?.messages ?? []) }
describe('platform evidence in the authenticated Atlas chat route', () => {
  it('uses the verified session identity to include original platform evidence in the model request', async () => {
    expect(await post()).toBe(200)
    expect(prompt()).toContain('APPROVED_PLATFORM_ROUTE_EVIDENCE')
    expect(searches).toBe(1)
  })
  it('ignores forged email and authorization claims in request JSON', async () => {
    state.user = { id: OWNER, email: 'ordinary@example.invalid' }
    expect(await post({ internalAuthorized: true, email: 'owner@example.invalid', user: { id: OWNER, email: 'owner@example.invalid' } })).toBe(200)
    expect(prompt()).not.toContain('APPROVED_PLATFORM_ROUTE_EVIDENCE')
    expect(searches).toBe(0)
  })
  it('denies another internally authorized user despite project ownership and a forged userId', async () => {
    state.user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'owner@example.invalid' }
    expect(await post({ userId: OWNER })).toBe(200)
    expect(prompt()).not.toContain('APPROVED_PLATFORM_ROUTE_EVIDENCE')
    expect(searches).toBe(0)
  })
  it('denies unauthenticated requests before recall and provider work', async () => {
    state.user = null
    expect(await post({ userId: OWNER, internalAuthorized: true })).toBe(401)
    expect(searches).toBe(0)
    expect(state.call).not.toHaveBeenCalled()
  })
})
