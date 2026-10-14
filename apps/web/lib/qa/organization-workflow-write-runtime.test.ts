import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  scope: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.user } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/organization-project-read', () => ({
  resolveOrganizationReadScope: mocks.scope,
}))

import { POST } from '@/app/api/organization/projects/[slug]/workflows/route'
import { PATCH } from '@/app/api/organization/projects/[slug]/workflows/[id]/route'
import { isSameOriginJson, parseSafeWorkflowMetadata } from '@/lib/auth/organization-workflow-write'
const PROJECT = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const WORKFLOW = '11111111-1111-4111-8111-111111111111'
const ORIGIN = 'https://app.omniraos.se'

function request(method: 'POST' | 'PATCH', path: string, payload: unknown, origin = ORIGIN) {
  return new Request(ORIGIN + path, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
function db({ currentProject = { id: PROJECT, slug: 'handlarborsen' }, row = {
  id: WORKFLOW, name: 'Draft', description: null, active: false, trigger: 'manual', created_at: '2026-10-14',
} } = {}) {
  const project = {
    select: vi.fn(() => project),
    eq: vi.fn(() => project),
    in: vi.fn(() => project),
    maybeSingle: vi.fn(async () => ({ data: currentProject, error: null })),
  }
  const workflow = {
    insert: vi.fn(() => workflow),
    update: vi.fn(() => workflow),
    select: vi.fn(() => workflow),
    eq: vi.fn(() => workflow),
    single: vi.fn(async () => ({ data: row, error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }
  const from = vi.fn((table: string) => table === 'projects' ? project : workflow)
  mocks.admin.mockReturnValue({ from })
  return { project, workflow, from }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'collaborator-uuid' } }, error: null })
  mocks.scope.mockResolvedValue({
    role: { active: true, role: 'collaborator' },
    projectIds: [PROJECT],
  })
})
describe('Handlarbörsen bounded workflow mutations', () => {
  it('rejects foreign origin or non-JSON before service-role access', async () => {
    db()
    const req = request('POST', '/api/organization/projects/handlarborsen/workflows', { name: 'X' }, 'https://foreign.example')
    expect(isSameOriginJson(req)).toBe(false)
    expect((await POST(req, { params: { slug: 'handlarborsen' } })).status).toBe(403)
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('rejects executable or privileged fields with no workflow writes', async () => {
    const ctx = db()
    for (const extras of [{ steps: [{ name: 'execute' }] }, { active: true }, { trigger: 'cron' }, { cron_expr: '* * * * *' }, { side_effect_class: 'autonomous' }]) {
      const res = await POST(request('POST', '/api/organization/projects/handlarborsen/workflows', { name: 'Test', ...extras }), { params: { slug: 'handlarborsen' } })
      expect(res.status).toBe(400)
    }
    expect(ctx.workflow.insert).not.toHaveBeenCalled()
  })
  it('creates only inert manual drafts on canonical Handlarbörsen', async () => {
    const ctx = db()
    const res = await POST(request('POST', '/api/organization/projects/handlarborsen/workflows', { name: ' Ny idé ', description: 'Granska först' }), { params: { slug: 'handlarborsen' } })
    expect(res.status).toBe(201)
    expect(ctx.workflow.insert).toHaveBeenCalledWith({
      project_id: PROJECT, name: 'Ny idé', description: 'Granska först',
      steps: [], trigger: 'manual', cron_expr: null, active: false,
    })
    expect(ctx.project.in).toHaveBeenCalledWith('id', [PROJECT])
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('fails closed for revoked, unknown and non-Handlarbörsen actors', async () => {
    const ctx = db()
    mocks.scope.mockResolvedValue({ role: { active: false, role: null }, projectIds: [PROJECT] })
    expect((await POST(request('POST', '/api/organization/projects/handlarborsen/workflows', { name: 'X' }), { params: { slug: 'handlarborsen' } })).status).toBe(403)
    expect(ctx.workflow.insert).not.toHaveBeenCalled()
    mocks.scope.mockResolvedValue({ role: { active: true, role: 'collaborator' }, projectIds: [PROJECT] })
    expect((await POST(request('POST', '/api/organization/projects/familje-stunden/workflows', { name: 'X' }), { params: { slug: 'familje-stunden' } })).status).toBe(403)
    expect(ctx.workflow.insert).not.toHaveBeenCalled()
  })
  it('fails closed when the resolved project identity differs', async () => {
    const ctx = db({ currentProject: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'handlarborsen' } })
    expect((await POST(request('POST', '/api/organization/projects/handlarborsen/workflows', { name: 'X' }), { params: { slug: 'handlarborsen' } })).status).toBe(403)
    expect(ctx.workflow.insert).not.toHaveBeenCalled()
  })
  it('updates only display metadata bound to both workflow ID and project ID', async () => {
    const ctx = db()
    const res = await PATCH(request('PATCH', '/api/organization/projects/handlarborsen/workflows/' + WORKFLOW, { name: 'Uppdaterat' }), { params: { slug: 'handlarborsen', id: WORKFLOW } })
    expect(res.status).toBe(200)
    expect(ctx.workflow.update).toHaveBeenCalledWith({ name: 'Uppdaterat' })
    expect(ctx.workflow.eq).toHaveBeenCalledWith('id', WORKFLOW)
    expect(ctx.workflow.eq).toHaveBeenCalledWith('project_id', PROJECT)
  })
  it('refuses activation, deletion, arbitrary fields or bad IDs on PATCH', async () => {
    const ctx = db()
    for (const patch of [{ active: true }, { steps: [] }, { trigger: 'cron' }, { project_id: PROJECT }]) {
      const res = await PATCH(request('PATCH', '/api/organization/projects/handlarborsen/workflows/' + WORKFLOW, patch), { params: { slug: 'handlarborsen', id: WORKFLOW } })
      expect(res.status).toBe(400)
    }
    expect((await PATCH(request('PATCH', '/api/organization/projects/handlarborsen/workflows/invalid', { name: 'X' }), { params: { slug: 'handlarborsen', id: 'invalid' } })).status).toBe(400)
    expect(ctx.workflow.update).not.toHaveBeenCalled()
  })
  it('enforces strict names and descriptions', () => {
    expect(parseSafeWorkflowMetadata({ name: ' ', description: '' }, true)).toBeNull()
    expect(parseSafeWorkflowMetadata({ name: 'x'.repeat(121) }, true)).toBeNull()
    expect(parseSafeWorkflowMetadata({ name: 'A', description: 'x'.repeat(1601) }, true)).toBeNull()
    expect(parseSafeWorkflowMetadata({ description: null }, false)).toEqual({ description: null })
    expect(parseSafeWorkflowMetadata({ name: ' A ' }, true)).toEqual({ name: 'A' })
  })
})
