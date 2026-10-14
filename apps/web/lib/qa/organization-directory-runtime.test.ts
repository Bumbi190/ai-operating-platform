import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), scope: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: mocks.scope }))
import { GET } from '@/app/api/organization/projects/route'
const project = '11111111-1111-4111-8111-111111111111'
function setup() {
  mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  mocks.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [project] })
  const order = vi.fn(async () => ({ data: [{ id: project, name: 'Test', slug: 'test', secret: 'never-send' }], error: null }))
  const inFn = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select }))
  mocks.admin.mockReturnValue({ from })
  return { select, inFn, from }
}
beforeEach(() => vi.clearAllMocks())
describe('organization project directory request behavior', () => {
  it('requires an authenticated session', async () => {
    setup()
    mocks.user.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET()).status).toBe(401)
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('refuses revoked or absent role before selecting projects', async () => {
    const db = setup()
    mocks.scope.mockResolvedValue({ role: { active: false, role: null }, projectIds: [project] })
    expect((await GET()).status).toBe(403)
    expect(db.from).not.toHaveBeenCalled()
  })
  it('uses explicit scoped fields and excludes unexpected fields', async () => {
    const db = setup()
    const response = await GET()
    expect(response.status).toBe(200)
    expect(db.select).toHaveBeenCalledWith('id, slug, name')
    expect(db.inFn).toHaveBeenCalledWith('id', [project])
    expect(await response.json()).toEqual({ projects: [{ id: project, slug: 'test', name: 'Test' }] })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('never reads all projects on an empty allowlist', async () => {
    const db = setup()
    mocks.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [] })
    expect(await (await GET()).json()).toEqual({ projects: [] })
    expect(db.from).not.toHaveBeenCalled()
  })
})
