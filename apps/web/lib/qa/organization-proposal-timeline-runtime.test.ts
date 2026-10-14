import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mock = vi.hoisted(() => ({
  getUser: vi.fn(),
  admin: vi.fn(),
  scope: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mock.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mock.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: mock.scope }))
import { GET } from '@/app/api/organization/proposals/route'

const projectId = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const proposalId = '11111111-1111-4111-8111-111111111111'
const outside = '22222222-2222-4222-8222-222222222222'

function reader(items: unknown[], error: unknown = null) {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(async () => ({ data: items, error }))
  return chain
}
function setup({ proposals, events, eventError }: { proposals: unknown[]; events: unknown[]; eventError?: unknown }) {
  const proposalsReader = reader(proposals)
  const eventsReader = reader(events, eventError)
  const from = vi.fn((table: string) => {
    if (table === 'omnira_collaborator_proposals') return proposalsReader
    if (table === 'omnira_collaborator_proposal_events') return eventsReader
    throw Error('Unexpected query: ' + table)
  })
  mock.admin.mockReturnValue({ from })
  return { from, proposalsReader, eventsReader }
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.getUser.mockResolvedValue({ data: { user: { id: 'viewer' } } })
  mock.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [projectId] })
})

describe('proposal timeline read boundary', () => {
  it('rejects anonymous and inactive sessions without any service-role query', async () => {
    const q = setup({ proposals: [], events: [] })
    mock.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    mock.scope.mockResolvedValue({ role: { active: false, role: null }, projectIds: [projectId] })
    expect((await GET()).status).toBe(403)
    expect(q.from).not.toHaveBeenCalled()
  })
  it('returns empty timeline and never queries events when scope has no project IDs', async () => {
    const q = setup({ proposals: [], events: [] })
    mock.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [] })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ proposals: [], events: [] })
    expect(q.from).not.toHaveBeenCalled()
  })
  it('filters out foreign proposal rows and binds event lookup to allowed proposal IDs', async () => {
    const q = setup({
      proposals: [
        { id: proposalId, project_id: projectId, title: 'Authorized' },
        { id: outside, project_id: outside, title: 'Foreign tenant' },
      ],
      events: [
        { proposal_id: proposalId, event: 'submitted', created_at: '2026-10-14T12:00:00Z' },
        { proposal_id: outside, event: 'approved', created_at: '2026-10-14T12:01:00Z' },
      ],
    })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(q.proposalsReader.in).toHaveBeenCalledWith('project_id', [projectId])
    expect(q.eventsReader.in).toHaveBeenCalledWith('proposal_id', [proposalId])
    expect(q.eventsReader.select).toHaveBeenCalledWith('proposal_id, event, created_at')
    const body = await response.json()
    expect(body.proposals).toEqual([{ id: proposalId, project_id: projectId, title: 'Authorized' }])
    expect(body.events).toEqual([{ proposal_id: proposalId, event: 'submitted', created_at: '2026-10-14T12:00:00Z' }])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(JSON.stringify(body)).not.toContain('Foreign tenant')
  })
  it('returns empty event collection when there are no scoped proposals', async () => {
    const q = setup({ proposals: [], events: [{ proposal_id: outside, event: 'approved', created_at: '2026-10-14' }] })
    const result = await GET()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ proposals: [], events: [] })
    expect(q.eventsReader.limit).not.toHaveBeenCalled()
  })
  it('fails closed if audit event read fails rather than claiming no history', async () => {
    const q = setup({
      proposals: [{ id: proposalId, project_id: projectId }],
      events: [],
      eventError: { message: 'temporarily unavailable' },
    })
    const response = await GET()
    expect(response.status).toBe(503)
    expect(q.eventsReader.limit).toHaveBeenCalled()
  })
  it('renders per-proposal audit trail without action execution in the review UI', () => {
    const ui = readFileSync(resolve(process.cwd(), 'app/organization/reviews/ReviewBoard.tsx'), 'utf8')
    expect(ui).toContain('Förslagets händelsehistorik')
    expect(ui).toContain("events.filter(e => e.proposal_id === p.id)")
    expect(ui).toContain('Godkänt av Owner')
    expect(ui).toContain('Avvisat av Owner')
    expect(ui).not.toContain('/api/projects/')
  })
})
