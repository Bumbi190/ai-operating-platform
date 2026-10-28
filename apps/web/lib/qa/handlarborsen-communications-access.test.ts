import { beforeEach, describe, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  getProject: vi.fn(),
  isHandlarborsen: vi.fn(),
  projectAccess: vi.fn(),
  adminClient: vi.fn(),
  salesRead: vi.fn(),
  replyRead: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: f.getProject }))
vi.mock('@/lib/os/project-command-center', () => ({ isHandlarborsenProject: f.isHandlarborsen }))
vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: f.projectAccess }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: f.adminClient }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-sales-overview', () => ({
  readHandlarborsenSalesOverview: f.salesRead,
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-reply-lifecycle', () => ({
  readHandlarborsenReplyLifecycle: f.replyRead,
}))
vi.mock('@/components/platform/vnext/HandlarborsenCommunications', () => ({
  HandlarborsenCommunications: () => null,
}))

import CommunicationsPage from '@/app/(platform)/projects/[slug]/communications/page'

const HB_ID = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const HB = { id: HB_ID, slug: 'handlarborsen', name: 'Handlarbörsen' }
const admin = { fake: 'admin-handle-do-not-read' }
const validSales = {
  status: 'ok',
  observedAt: '2026-10-28T14:30:00.000Z',
  metrics: [
    { key: 'synced_inbox_messages_total', source: 'sales_inbox_messages', count: 16 },
    { key: 'sales_contacts_suppressed_flag', source: 'sales_contacts', count: 139 },
  ],
}
const validReply = {
  status: 'ok', observedAt: '2026-10-28T14:31:00.000Z',
  replyJobsTotal: 1, replyCurrentDraftsTotal: 1, replyDraftRevisionsTotal: 2,
  sendJobsTotal: 1, sendJobsNotLinkedToCurrentRevision: 0,
  lifecycle: [{ replyJobStatus: 'awaiting_review', currentApprovalStatus: 'approved', currentSendStatus: 'smtp_accepted', count: 1 }],
  sendPolicy: { total: 1, enabledUnexpired: 0, enabledButExpired: 1, disabled: 0 },
  latestTimingRule: { minWaitSeconds: 1209600, maxReminders: 1 },
}

beforeEach(() => {
  vi.resetAllMocks()
  f.getProject.mockResolvedValue(HB)
  f.isHandlarborsen.mockImplementation((project: { id: string; slug: string }) =>
    project?.id === HB_ID && project?.slug === 'handlarborsen')
  f.projectAccess.mockResolvedValue({ ok: true, userId: 'actual-owner', allowedProjectIds: [HB_ID] })
  f.adminClient.mockReturnValue(admin)
  f.salesRead.mockResolvedValue(validSales)
  f.replyRead.mockResolvedValue(validReply)
})

describe('Handlarbörsen communications route: executable owner/safety boundary', () => {
  it('denies a foreign project before evaluating session or privileged sources', async () => {
    f.getProject.mockResolvedValue({ id: 'another-project', slug: 'familje-stunden', name: 'Familje-Stunden' })
    await expect(CommunicationsPage({ params: { slug: 'familje-stunden' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(f.projectAccess).not.toHaveBeenCalled()
    expect(f.adminClient).not.toHaveBeenCalled()
    expect(f.salesRead).not.toHaveBeenCalled()
    expect(f.replyRead).not.toHaveBeenCalled()
  })

  it('denies an unknown project before any service-role client exists', async () => {
    f.getProject.mockResolvedValue(null)
    await expect(CommunicationsPage({ params: { slug: 'missing' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(f.adminClient).not.toHaveBeenCalled()
  })

  it('denies an unauthenticated caller without privileged reads', async () => {
    f.projectAccess.mockResolvedValue({ ok: false })
    await expect(CommunicationsPage({ params: { slug: 'handlarborsen' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(f.adminClient).not.toHaveBeenCalled()
    expect(f.salesRead).not.toHaveBeenCalled()
    expect(f.replyRead).not.toHaveBeenCalled()
  })

  it('denies an authenticated but unlisted owner without privileged reads', async () => {
    f.projectAccess.mockResolvedValue({
      ok: true, userId: 'different-user', allowedProjectIds: ['different-project'],
    })
    await expect(CommunicationsPage({ params: { slug: 'handlarborsen' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(f.adminClient).not.toHaveBeenCalled()
    expect(f.salesRead).not.toHaveBeenCalled()
    expect(f.replyRead).not.toHaveBeenCalled()
  })

  it('reads the existing two sources ONLY for the authenticated owner and fixed project', async () => {
    const element = await CommunicationsPage({ params: { slug: 'handlarborsen' } })
    expect(f.adminClient).toHaveBeenCalledTimes(1)
    expect(f.salesRead).toHaveBeenCalledOnce()
    expect(f.replyRead).toHaveBeenCalledOnce()
    const expected = { db: admin, userId: 'actual-owner', allowedProjectIds: [HB_ID] }
    expect(f.salesRead).toHaveBeenCalledWith(expected)
    expect(f.replyRead).toHaveBeenCalledWith(expected)
    expect(element.props.view).toMatchObject({
      inboxMessages: 16, suppressedContacts: 139, currentDrafts: 1,
      approvedCurrentDrafts: 1, smtpAcceptedCurrentDrafts: 1,
      sendingPermittedByOverview: false, recipientDeliveryVerified: false,
    })
  })

  it('does not render if either privileged reader denies its own owner check', async () => {
    f.replyRead.mockResolvedValue({ status: 'not_permitted' })
    await expect(CommunicationsPage({ params: { slug: 'handlarborsen' } })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders a partially unavailable observation without inventing zero or contact permission', async () => {
    f.salesRead.mockResolvedValue({ status: 'unavailable' })
    const element = await CommunicationsPage({ params: { slug: 'handlarborsen' } })
    expect(element.props.view.inboxMessages).toBeNull()
    expect(element.props.view.currentDrafts).toBe(1)
    expect(element.props.view.sendingPermittedByOverview).toBe(false)
  })
})
