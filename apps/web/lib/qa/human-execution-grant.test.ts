/**
 * Phase 3B1B2 M4 — the human execution grant path (TypeScript side).
 *
 * The database is the authority: only `atlas_grant_m4_execution_authorization`,
 * executable by `authenticated` alone, can create the human-origin attestation an
 * M4 licensed bind requires. These tests pin the TypeScript side of that contract:
 *
 *   • an M4 execution grant goes through the signed-in USER'S session client
 *     (the user's JWT reaches PostgreSQL), never the service-role admin client;
 *   • the RPC receives exactly the authorization id and the expiry — no user id,
 *     principal, project, action or target;
 *   • other grant purposes keep the existing store path (they never produce an
 *     M4-acceptable attestation);
 *   • every database refusal maps to a refusal, never to success.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const userRpc = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc: (...a: unknown[]) => userRpc(...a) }),
}))
const adminUsed = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { adminUsed(); throw new Error('the M4 human grant must never use the service-role client') },
}))
vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: async () => ({ ok: true, userId: 'u-1', allowedProjectIds: ['p-1'] }),
}))

import { grantHumanExecutionAuthorization } from '@/lib/atlas/authorization/human-execution-grant'
import { grantAuthorization } from '@/lib/atlas/authorization/principal-write'
import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import type { AuthorizationEventStore } from '@/lib/atlas/authorization/store'

const AUTH = '00000000-0000-4000-8000-0000000000a1'
const request = (actionKind: string, targetType: string): AuthorizationEvent => ({
  eventId: '00000000-0000-4000-8000-0000000000e1', authorizationId: AUTH, type: 'requested',
  occurredAt: '2026-10-01T00:00:00.000Z', projectId: 'p-1', principalId: 'u-0', authorityBasis: 'founder_owner',
  target: { targetType, targetId: 'x', versionHash: 'a'.repeat(64) }, authority: { actionKind, description: '' },
  conditions: [], evidence: [], expiresAt: null, supersededBy: null, reason: null,
})
function store(events: AuthorizationEvent[]): AuthorizationEventStore & { appended: AuthorizationEvent[] } {
  const appended: AuthorizationEvent[] = []
  return {
    appended,
    append: async e => { appended.push(e); events.push(e); return e },
    history: async () => [...events],
    byProject: async () => [], byTarget: async () => [],
  }
}

beforeEach(() => {
  userRpc.mockReset(); getUser.mockReset(); adminUsed.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
})

describe('grantHumanExecutionAuthorization', () => {
  it('calls the authenticated boundary through the USER session with exactly the id and the expiry', async () => {
    userRpc.mockResolvedValue({ data: [{ authorization_id: AUTH, grant_event_id: 'g', attestation_id: 'a', human_principal: 'u-1',
      expires_at: '2026-10-08T00:00:00Z' }], error: null })
    const r = await grantHumanExecutionAuthorization({ authorizationId: AUTH, expiresAt: '2026-10-08T00:00:00Z' })
    expect(r).toMatchObject({ status: 'ok', grant: { grantEventId: 'g', attestationId: 'a', humanPrincipal: 'u-1' } })
    expect(userRpc).toHaveBeenCalledTimes(1)
    const [fn, args] = userRpc.mock.calls[0]
    expect(fn).toBe('atlas_grant_m4_execution_authorization')
    expect(Object.keys(args as object).sort()).toEqual(['p_authorization_id', 'p_expires_at'])
    expect(adminUsed).not.toHaveBeenCalled()
  })

  it('no signed-in human → no_principal, and the RPC is never called', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await grantHumanExecutionAuthorization({ authorizationId: AUTH, expiresAt: '2026-10-08T00:00:00Z' }))
      .toMatchObject({ status: 'no_principal' })
    expect(userRpc).not.toHaveBeenCalled()
  })

  it.each([['42501', 'not_permitted'], ['P0002', 'not_found'], ['55000', 'conflict'], ['22023', 'invalid_request'], ['XX000', 'unavailable']])(
    'database refusal %s → %s, never success', async (code, status) => {
      userRpc.mockResolvedValue({ data: null, error: { code, message: 'refused' } })
      expect(await grantHumanExecutionAuthorization({ authorizationId: AUTH, expiresAt: '2026-10-08T00:00:00Z' }))
        .toMatchObject({ status })
    })
})

describe('grantAuthorization routes an M4 execution grant to the human boundary', () => {
  it('workflow.action.execute → the authenticated RPC; nothing is appended through the service-role store', async () => {
    const s = store([request('workflow.action.execute', 'workflow_execution')])
    userRpc.mockImplementation(async () => ({ data: [{ authorization_id: AUTH, grant_event_id: 'g', attestation_id: 'a',
      human_principal: 'u-1', expires_at: '2026-10-08T00:00:00Z' }], error: null }))
    await grantAuthorization({ authorizationId: AUTH, expiresAt: '2026-10-08T00:00:00Z', store: s, now: '2026-10-07T00:00:00.000Z' })
    expect(userRpc).toHaveBeenCalledWith('atlas_grant_m4_execution_authorization',
      { p_authorization_id: AUTH, p_expires_at: '2026-10-08T00:00:00Z' })
    expect(s.appended).toEqual([])
  })

  it('a refused human grant is a refusal — never a fallback to the service-role store', async () => {
    const s = store([request('workflow.action.execute', 'workflow_execution')])
    userRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not owner' } })
    const r = await grantAuthorization({ authorizationId: AUTH, expiresAt: '2026-10-08T00:00:00Z', store: s })
    expect(r.status).toBe('not_permitted')
    expect(s.appended).toEqual([])
  })

  it('other purposes keep the existing store path (and never touch the human boundary)', async () => {
    const s = store([request('workflow.gate.advance', 'workflow_gate')])
    await grantAuthorization({ authorizationId: AUTH, expiresAt: '2026-10-08T00:00:00Z', store: s, now: '2026-10-07T00:00:00.000Z' })
    expect(userRpc).not.toHaveBeenCalled()
    expect(s.appended.map(e => e.type)).toEqual(['granted'])
  })
})

describe('static: the human grant module cannot borrow service-role authority', () => {
  const src = readFileSync(join(process.cwd(), 'lib/atlas/authorization/human-execution-grant.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  it('imports only the user-session client', () => {
    expect([...src.matchAll(/from '([^']+)'/g)].map(m => m[1])).toEqual(['@/lib/supabase/server'])
    expect(src).not.toMatch(/createAdminClient|service_role|SERVICE_ROLE/)
  })
  it('sends no principal, user, project, action or target', () => {
    const call = src.slice(src.indexOf(".rpc('atlas_grant_m4_execution_authorization'"))
    const args = call.slice(call.indexOf('{'), call.indexOf('})'))
    expect([...args.matchAll(/(p_\w+):/g)].map(m => m[1])).toEqual(['p_authorization_id', 'p_expires_at'])
  })
})
