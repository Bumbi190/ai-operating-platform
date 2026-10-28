import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  principal: { ok: true, userId: 'operator-1', email: 'operator@example.test', actor: 'user:operator-1' } as any,
  dispatches: 0,
  lastInput: null as unknown,
  result: { ok: true, action: 'status', repository: 'Bumbi190/handlarborsen',
    repositoryId: 1374257653, projectSlug: 'handlarborsen', readonly: true, sha: 'f'.repeat(40),
    observedAt: '2026-10-28T14:00:00Z' } as any,
  projects: [
    { id: 'project-owned', slug: 'handlarborsen', owner_id: 'operator-1' },
    { id: 'project-foreign', slug: 'handlarborsen', owner_id: 'someone-else' },
  ],
}))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => s.principal }))
vi.mock('@/lib/atlas/source-inspection/github', () => ({
  inspectVerifiedSource: async (input: unknown) => {
    s.dispatches++; s.lastInput = input
    return s.result
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'projects') throw Error('unexpected DB access')
      const predicates: Array<(r: any) => boolean> = []
      const filtered = () => s.projects.filter(r => predicates.every(p => p(r)))
      const b: any = {
        select: () => b,
        eq: (name: string, value: unknown) => { predicates.push(r => (r as any)[name] === value); return b },
        in: (name: string, values: unknown[]) => { predicates.push(r => values.includes((r as any)[name])); return b },
        maybeSingle: async () => ({ data: filtered()[0] ?? null, error: null }),
        then: (ok: any) => Promise.resolve({ data: filtered(), error: null }).then(ok),
      }
      return b
    },
  }),
}))

import { POST } from '@/app/api/atlas/source-inspection/route'
const ORIGIN = 'https://pilot.omnira.test'
const url = ORIGIN + '/api/atlas/source-inspection'
async function post(
  body: unknown = { action: 'status', projectSlug: 'handlarborsen' },
  opts: { origin?: string | null; size?: number; contentType?: string } = {},
) {
  const raw = JSON.stringify(body)
  const headers = new Headers({ 'content-type': opts.contentType ?? 'application/json' })
  if (opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN)
  if (opts.size !== undefined) headers.set('content-length', String(opts.size))
  return POST(new Request(url, { method: 'POST', headers, body: raw }))
}
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('ATLAS_SOURCE_INSPECTION_MODE', 'pilot')
  s.principal = { ok: true, userId: 'operator-1', email: 'operator@example.test', actor: 'user:operator-1' }
  s.dispatches = 0
  s.lastInput = null
  s.result = { ok: true, action: 'status', repository: 'Bumbi190/handlarborsen',
    repositoryId: 1374257653, projectSlug: 'handlarborsen', readonly: true, sha: 'f'.repeat(40),
    observedAt: '2026-10-28T14:00:00Z' }
})
afterEach(() => vi.unstubAllEnvs())

describe('Nova read-only source API permission boundary', () => {
  it('is absent in production even if pilot was copied into an environment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await post()).status).toBe(404)
    expect(s.dispatches).toBe(0)
  })
  it('is absent when pilot is not explicitly enabled', async () => {
    vi.stubEnv('ATLAS_SOURCE_INSPECTION_MODE', '')
    expect((await post()).status).toBe(404)
    expect(s.dispatches).toBe(0)
  })
  it('rejects forged and missing origins before authorization or source dispatch', async () => {
    expect((await post(undefined, { origin: 'https://evil.test' })).status).toBe(403)
    expect((await post(undefined, { origin: null })).status).toBe(403)
    expect(s.dispatches).toBe(0)
  })
  it('denies unauthenticated and nonoperator sessions before any GitHub access', async () => {
    s.principal = { ok: false, reason: 'unauthenticated' }
    expect((await post()).status).toBe(401)
    s.principal = { ok: false, reason: 'not_platform_operator' }
    expect((await post()).status).toBe(403)
    expect(s.dispatches).toBe(0)
  })
  it('never dispatches for a project outside verified operator ownership', async () => {
    s.principal = { ok: true, userId: 'operator-2', email: 'operator2@example.test', actor: 'user:operator-2' }
    expect((await post()).status).toBe(404)
    expect(s.dispatches).toBe(0)
  })
  it('rejects unknown projects, extra tool args and unsafe file paths', async () => {
    for (const body of [
      { action: 'status', projectSlug: 'the-prompt' },
      { action: 'status', projectSlug: 'handlarborsen', repository: 'evil/code' },
      { action: 'read_file', projectSlug: 'handlarborsen', path: '../.env' },
      { action: 'read_file', projectSlug: 'handlarborsen', path: 'https://evil.test/' },
      { action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx', ref: 'main' },
    ]) expect((await post(body)).status).toBe(400)
    expect(s.dispatches).toBe(0)
  })
  it('rejects oversized request body before source dispatch', async () => {
    expect((await post(undefined, { size: 20_000 })).status).toBe(400)
    expect((await post({ action: 'status', projectSlug: 'handlarborsen', padding: 'x'.repeat(800) })).status).toBe(400)
    expect(s.dispatches).toBe(0)
  })
  it('transfers a validated request only after operator and DB authorization', async () => {
    const result = await post({ action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx' })
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toContain('no-store')
    expect(result.headers.get('x-content-type-options')).toBe('nosniff')
    expect(s.dispatches).toBe(1)
    expect(s.lastInput).toEqual({ action: 'read_file', projectSlug: 'handlarborsen', path: 'src/app/page.tsx' })
    const body = await result.json()
    expect(body.policy).toBe('nova.source.read.v1')
    expect(body.sha).toBe('f'.repeat(40))
  })
  it('uses generic nonsecret provider codes and never reports a failed read as success', async () => {
    s.result = { ok: false, code: 'not_configured' }
    const first = await post()
    expect(first.status).toBe(503)
    expect(await first.json()).toEqual({ error: 'not_configured' })
    s.result = { ok: false, code: 'source_denied' }
    expect((await post()).status).toBe(422)
  })
})
