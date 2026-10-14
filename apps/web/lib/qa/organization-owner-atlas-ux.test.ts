import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mock = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn(), admin: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error('REDIRECT:' + href) },
  notFound: () => { throw new Error('NOT_FOUND') },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mock.user } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mock.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: mock.scope }))
vi.mock('@/lib/atlas/home-view-model', () => ({ assembleAtlasHomeViewModel: vi.fn(() => ({ projects: [], activity: [] })) }))
vi.mock('@/components/platform/vnext/AtlasHomeVNext', () => ({ AtlasHomeVNext: () => null }))
import OrganizationAtlasPage from '@/app/organization/atlas/page'

const reviewBoard = readFileSync(resolve(process.cwd(), 'app/organization/reviews/ReviewBoard.tsx'), 'utf8')

beforeEach(() => {
  vi.clearAllMocks()
  mock.user.mockResolvedValue({ data: { user: { id: 'owner-uuid' } } })
  mock.admin.mockReturnValue({ from: vi.fn() })
})

describe('Owner /organization/atlas navigation and review empty state', () => {
  it('routes the verified Owner to the original /atlas instead of a 404', async () => {
    mock.scope.mockResolvedValue({ role: { active: true, role: 'owner' }, projectIds: ['project-id'] })
    await expect(OrganizationAtlasPage()).rejects.toThrow('REDIRECT:/atlas')
    expect(mock.admin().from).not.toHaveBeenCalled()
  })
  it('keeps inactive sessions out of the collaborator Atlas surface', async () => {
    mock.scope.mockResolvedValue({ role: { active: false, role: null }, projectIds: [] })
    await expect(OrganizationAtlasPage()).rejects.toThrow('NOT_FOUND')
  })
  it('shows understandable empty state rather than a blank Owner review screen', () => {
    expect(reviewBoard).toContain('Inga förslag ännu')
    expect(reviewBoard).toContain('När Oscar skickar ett förslag för Handlarbörsen')
    expect(reviewBoard).toContain('rows.length === 0')
    expect(reviewBoard).toContain('!loadFailed')
    expect(reviewBoard).toContain('Hämtar förslag…')
  })
})
