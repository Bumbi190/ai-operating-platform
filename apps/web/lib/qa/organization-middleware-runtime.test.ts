import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  member: null as null | { role: string; revoked_at: string | null },
  error: null as null | { message: string },
  owns: false,
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => table === 'omnira_organization_memberships'
          ? { maybeSingle: async () => ({ data: state.member, error: state.error }) }
          : { limit: async () => ({ data: state.owns ? [{ id: 'p1' }] : [], error: null }) },
      }),
    }),
  }),
}))
import { middleware } from '@/middleware'
function req(path: string) { return new NextRequest(new URL(path, 'https://app.omniraos.se')) }
beforeEach(() => {
  state.user = { id: 'viewer' }
  state.member = { role: 'collaborator', revoked_at: null }
  state.error = null
  state.owns = false
})
describe('collaborator middleware HTTP isolation', () => {
  it('redirects a collaborator away from Atlas', async () => {
    const response = await middleware(req('/atlas'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.omniraos.se/organization')
  })
  it('rejects direct access to legacy privileged APIs', async () => {
    const response = await middleware(req('/api/chat'))
    expect(response.status).toBe(403)
  })
  it('allows only the scoped organization project directory API', async () => {
    const response = await middleware(req('/api/organization/projects'))
    expect(response.status).toBe(200)
  })
  it('rejects revoked collaborators even on allowed endpoints', async () => {
    state.member = { role: 'collaborator', revoked_at: '2026-10-13T20:00:00Z' }
    expect((await middleware(req('/api/organization/projects'))).status).toBe(403)
    expect((await middleware(req('/atlas'))).status).toBe(403)
  })
  it('does not allow unknown users into legacy Atlas on membership lookup failures', async () => {
    state.member = null
    state.error = { message: 'temporarily unavailable' }
    expect((await middleware(req('/atlas'))).headers.get('location')).toBe('https://app.omniraos.se/organization')
    expect((await middleware(req('/api/chat'))).status).toBe(403)
  })
  it('keeps legacy project owners operating during migration', async () => {
    state.member = null
    state.owns = true
    expect((await middleware(req('/atlas'))).status).toBe(200)
  })
})
