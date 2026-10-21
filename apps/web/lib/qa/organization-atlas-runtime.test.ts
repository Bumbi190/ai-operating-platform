import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), admin: vi.fn(), scope: vi.fn(), getAnthropic: vi.fn(), createMessage: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: mocks.scope }))
vi.mock('@/lib/ai/anthropic', () => ({ getAnthropic: mocks.getAnthropic }))
import { POST } from '@/app/api/organization/atlas/route'

const ORIGIN = 'https://app.omniraos.se'
const PROJECT = '11111111-1111-4111-8111-111111111111'

function db() {
  const replies: Record<string, unknown[]> = {
    projects: [{ id: PROJECT, name: 'Handlarbörsen', slug: 'handlarborsen' }, {
      id: '22222222-2222-4222-8222-222222222222', name: 'Other tenant', slug: 'foreign',
    }],
    runs: [{ project_id: PROJECT, status: 'running', created_at: '2026-10-14' }],
    manager_tasks: [{ project_id: PROJECT, title: 'Read-only audit', status: 'pending' }],
  }
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query), in: vi.fn(() => query), order: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: replies[table] ?? [], error: null })),
    }
    return query
  })
  mocks.admin.mockReturnValue({ from })
  return { from }
}
function req(body: unknown, origin = ORIGIN) {
  return new Request(ORIGIN + '/api/organization/atlas', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null })
  mocks.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [PROJECT] })
  mocks.createMessage.mockResolvedValue({ content: [{ type: 'text', text: 'Det pågår en körning.' }] })
  mocks.getAnthropic.mockReturnValue({ messages: { create: mocks.createMessage } })
  db()
})
describe('tool-free collaborator Atlas', () => {
  it('denies external origins before session and data access', async () => {
    expect((await POST(req({ question: 'hej' }, 'https://evil.example'))).status).toBe(403)
    expect(mocks.getAnthropic).not.toHaveBeenCalled()
  })
  it('denies revoked and anonymous sessions without an AI call', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await POST(req({ question: 'hej' }))).status).toBe(401)
    mocks.scope.mockResolvedValue({ role: { active: false, role: null }, projectIds: [PROJECT] })
    expect((await POST(req({ question: 'hej' }))).status).toBe(403)
    expect(mocks.getAnthropic).not.toHaveBeenCalled()
  })
  it('responds to scoped question without tools or other tenants', async () => {
    const response = await POST(req({ question: 'Hur går det?' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ answer: 'Det pågår en körning.' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const options = mocks.createMessage.mock.calls[0][0]
    expect(options.tools).toBeUndefined()
    expect(options.messages[0].content).not.toContain('Other tenant')
    expect(options.messages[0].content).toContain('Handlarbörsen')
    expect(mocks.getAnthropic).toHaveBeenCalledTimes(1)
  })
  it('rejects injected role/tools and excessive prompt length', async () => {
    expect((await POST(req({ question: 'hello', role: 'owner' }))).status).toBe(400)
    expect((await POST(req({ question: 'x'.repeat(1800) }))).status).toBe(400)
    expect(mocks.getAnthropic).not.toHaveBeenCalled()
  })
})
