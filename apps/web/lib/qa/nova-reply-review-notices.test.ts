import { beforeEach, describe, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  access: vi.fn(), admin: vi.fn(), enabled: vi.fn(), read: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: f.access }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: f.admin }))
vi.mock('@/lib/sales/feature', () => ({ salesEnabled: f.enabled }))
vi.mock('@/lib/sales/replies/store', () => ({ readReplyDrafts: f.read }))

import { GET } from '@/app/api/sales/replies/review-notices/route'
import { HANDLARBORSEN_PROJECT_ID as HB } from '@/lib/atlas/collectors/handlarborsen-marketplace'

const principal = { ok: true, userId: 'owner', allowedProjectIds: [HB] }
const job = (id: string, changes = {}) => ({
  id, createdAt: '2026-10-28T10:00:00Z', status: 'awaiting_review',
  sourceCurrent: true, newerIncoming: false,
  source: { from: 'secret@example.invalid', subject: 'PRIVATE MAIL SUBJECT' }, ...changes,
})
const draft = (id: string, jobId: string, changes = {}) => ({
  id, jobId, current: true, approvalId: 'approval-' + id,
  status: 'pending', questions: [],
  body: 'PRIVATE DRAFT BODY', subject: 'PRIVATE DRAFT SUBJECT', ...changes,
})

beforeEach(() => {
  vi.resetAllMocks()
  f.access.mockResolvedValue(principal)
  f.enabled.mockReturnValue(true)
  f.admin.mockReturnValue({ name: 'mock-admin' })
  f.read.mockResolvedValue({ jobs: [], drafts: [], sendingEnabled: false })
})

describe('Nova owner-only in-app reply reminders', () => {
  it('fails closed before constructing service-role when the session or project owner is missing', async () => {
    f.access.mockResolvedValueOnce({ ok: false })
    expect((await GET()).status).toBe(404)
    f.access.mockResolvedValueOnce({ ...principal, allowedProjectIds: ['another-project'] })
    expect((await GET()).status).toBe(404)
    expect(f.admin).not.toHaveBeenCalled()
    expect(f.read).not.toHaveBeenCalled()
  })

  it('does not read or notify when Sales is disabled', async () => {
    f.enabled.mockReturnValue(false)
    expect((await GET()).status).toBe(404)
    expect(f.admin).not.toHaveBeenCalled()
    expect(f.read).not.toHaveBeenCalled()
  })

  it('only returns actionable pending approval IDs, never private email bodies, names or recipients', async () => {
    f.read.mockResolvedValue({
      jobs: [
        job('fresh'), job('stale', { sourceCurrent: false }),
        job('newer', { newerIncoming: true }),
        job('cancelled', { status: 'cancelled' }),
        job('failed', { status: 'failed' }), job('obsolete'),
        job('needs-questions'), job('approved'),
      ],
      drafts: [
        draft('a', 'fresh'), draft('b', 'stale'), draft('c', 'newer'),
        draft('d', 'cancelled'), draft('g', 'failed'),
        draft('h', 'obsolete', { current: false }),
        draft('e', 'needs-questions', { questions: ['Missing source'] }),
        draft('f', 'approved', { status: 'approved' }),
      ],
      sendingEnabled: false,
    })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const payload = await response.json()
    expect(payload).toEqual({ state: 'ok', pendingCount: 1, approvalIds: ['approval-a'], mayHaveMore: false })
    expect(JSON.stringify(payload)).not.toMatch(/PRIVATE|secret@example|recipient|sender|body|subject|sendJob/i)
    expect(f.admin).toHaveBeenCalledOnce()
    expect(f.read).toHaveBeenCalledWith({ name: 'mock-admin' }, principal, { projectId: HB })
  })

  it('returns unavailable (not a fake zero) when the owner-gated SQL read fails', async () => {
    f.read.mockRejectedValue(Error('secret sql details'))
    const response = await GET()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({ state: 'unavailable' })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('deduplicates approvals and does not invent a complete count for a bounded source', async () => {
    f.read.mockResolvedValue({
      jobs: Array.from({ length: 50 }, (_, i) => job(String(i))),
      drafts: [draft('a', '0'), draft('b', '0', { approvalId: 'approval-a' })],
    })
    expect(await (await GET()).json()).toEqual({
      state: 'ok', pendingCount: 1, approvalIds: ['approval-a'], mayHaveMore: true,
    })
  })
})
