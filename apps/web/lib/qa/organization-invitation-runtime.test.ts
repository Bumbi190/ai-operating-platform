import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const stubs = vi.hoisted(() => ({
  operator: vi.fn(),
  admin: vi.fn(),
}))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: stubs.operator }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: stubs.admin }))
import { POST } from '@/app/api/organization/invitations/route'

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const inviteeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const origin = 'https://app.omniraos.se'
const oldFlag = process.env.OMNIRA_COLLAB_INVITES_ENABLED

function setup({ owner = true, inviteOk = true, saveOk = true } = {}) {
  const member = { user_id: ownerId, role: owner ? 'owner' : 'collaborator', revoked_at: null }
  const insert = vi.fn(async () => ({ error: saveOk ? null : { message: 'denied' } }))
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: member, error: null })),
    insert,
  }
  const inviteUserByEmail = vi.fn(async () =>
    inviteOk ? { data: { user: { id: inviteeId } }, error: null } : { data: { user: null }, error: { message: 'unavailable' } })
  const db = { from: vi.fn(() => chain), auth: { admin: { inviteUserByEmail } } }
  stubs.operator.mockResolvedValue({ ok: true, userId: ownerId, email: 'owner@example.se' })
  stubs.admin.mockReturnValue(db)
  return { db, inviteUserByEmail, insert }
}
function request(body: unknown, opts: { from?: string; contentType?: string } = {}) {
  return new Request(origin + '/api/organization/invitations', {
    method: 'POST',
    headers: { Origin: opts.from ?? origin, 'Content-Type': opts.contentType ?? 'application/json' },
    body: JSON.stringify(body),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  process.env.OMNIRA_COLLAB_INVITES_ENABLED = 'true'
})
afterEach(() => {
  if (oldFlag === undefined) delete process.env.OMNIRA_COLLAB_INVITES_ENABLED
  else process.env.OMNIRA_COLLAB_INVITES_ENABLED = oldFlag
})
describe('Collaborator invitation guarded API', () => {
  it('refuses before any authority or database lookup when flag is off', async () => {
    delete process.env.OMNIRA_COLLAB_INVITES_ENABLED
    const response = await POST(request({ email: 'oscar@example.se' }))
    expect(response.status).toBe(503)
    expect(stubs.operator).not.toHaveBeenCalled()
  })
  it('rejects cross-origin and non-JSON requests before service role', async () => {
    const response = await POST(request({ email: 'oscar@example.se' }, { from: 'https://attacker.example' }))
    expect(response.status).toBe(403)
    expect(stubs.admin).not.toHaveBeenCalled()
  })
  it('requires verified platform operator and existing owner role', async () => {
    setup({ owner: false })
    expect((await POST(request({ email: 'oscar@example.se' }))).status).toBe(403)
    stubs.operator.mockResolvedValue({ ok: false })
    expect((await POST(request({ email: 'oscar@example.se' }))).status).toBe(403)
  })
  it('rejects requested owner role or custom callback', async () => {
    const mocks = setup()
    expect((await POST(request({ email: 'oscar@example.se', role: 'owner' }))).status).toBe(400)
    expect((await POST(request({ email: 'oscar@example.se', redirectTo: 'https://evil.example' }))).status).toBe(400)
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled()
  })
  it('creates a collaborator grant bound only to the invited auth user', async () => {
    const mocks = setup()
    const response = await POST(request({ email: 'Oscar@Example.se' }))
    expect(response.status).toBe(201)
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith('oscar@example.se', {
      redirectTo: 'https://app.omniraos.se/auth/callback?next=/organization',
    })
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: inviteeId, role: 'collaborator' })
  })
  it('does not create membership when provider invitation fails', async () => {
    const mocks = setup({ inviteOk: false })
    expect((await POST(request({ email: 'oscar@example.se' }))).status).toBe(409)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('reports failure without claiming success if membership is not persisted', async () => {
    setup({ saveOk: false })
    expect((await POST(request({ email: 'oscar@example.se' }))).status).toBe(503)
  })
})
