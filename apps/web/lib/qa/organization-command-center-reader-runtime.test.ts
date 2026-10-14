import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  session: vi.fn(), admin: vi.fn(), scope: vi.fn(), instances: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: mocks.scope }))
vi.mock('@/lib/workflows/store', () => ({ listInstancesForProjects: mocks.instances }))
import { loadOrganizationProjectCommandCenter } from '@/lib/os/organization-command-center-reader'

const ownerProject = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const unauthorizedProject = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
function setup(projectId = ownerProject) {
  mocks.session.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'oscar' } }, error: null }) } })
  mocks.scope.mockResolvedValue({
    role: { active: true, role: 'collaborator' },
    projectIds: [ownerProject],
  })
  const filters: Array<{ field: string; value: unknown }> = []
  const source = {
    select: () => source,
    eq: (field: string, value: unknown) => { filters.push({ field, value }); return source },
    in: (field: string, value: unknown) => { filters.push({ field, value }); return source },
    order: () => source,
    limit: async () => ({ data: [], error: null, count: 0 }),
    maybeSingle: async () => ({
      data: { id: projectId, name: 'Project', slug: 'handlarborsen', color: '#334455',
        execution_paused: false, paused_at: null, paused_reason: null }, error: null,
    }),
  }
  const from = vi.fn(() => source)
  mocks.admin.mockReturnValue({ from })
  mocks.instances.mockResolvedValue([])
  return { from, filters }
}
beforeEach(() => vi.clearAllMocks())
describe('organization command center server authorization', () => {
  it('rejects unknown slugs before any user or admin queries', async () => {
    expect(await loadOrganizationProjectCommandCenter('https://not-a-project')).toBeNull()
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated users before privileged database access', async () => {
    setup()
    mocks.session.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })
    expect(await loadOrganizationProjectCommandCenter('handlarborsen')).toBeNull()
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('rejects revoked/absent membership before querying projects', async () => {
    const x = setup()
    mocks.scope.mockResolvedValue({ role: { active: false, role: null }, projectIds: [ownerProject] })
    expect(await loadOrganizationProjectCommandCenter('handlarborsen')).toBeNull()
    expect(x.from).not.toHaveBeenCalled()
  })
  it('rejects a project outside the allowlist even if a query adapter responds incorrectly', async () => {
    const x = setup(unauthorizedProject)
    expect(await loadOrganizationProjectCommandCenter('handlarborsen')).toBeNull()
    expect(x.filters).toContainEqual({ field: 'id', value: [ownerProject] })
    expect(x.from).toHaveBeenCalledTimes(1)
  })
  it('renders the shared model with scoped reads, but no privileged links', async () => {
    const x = setup()
    const result = await loadOrganizationProjectCommandCenter('handlarborsen')
    expect(result?.project.name).toBe('Project')
    expect(result?.links.newWorkflow).toBeNull()
    expect(result?.links.approvals).toBeNull()
    expect(result?.outputs.items).toEqual([])
    expect(x.from).toHaveBeenCalledWith('workflows')
    expect(x.from).toHaveBeenCalledWith('runs')
    expect(x.filters).toContainEqual({ field: 'project_id', value: ownerProject })
  })
})
