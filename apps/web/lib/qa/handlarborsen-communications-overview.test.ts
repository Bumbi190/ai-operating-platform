import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCommunicationsOverview } from '@/lib/handlarborsen/communications-overview'
import { HandlarborsenCommunications } from '@/components/platform/vnext/HandlarborsenCommunications'

const sourceAt = '2026-10-28T14:33:00.000Z'
const metrics = [
  { key: 'sales_contacts_total', source: 'sales_contacts', count: 139 },
  { key: 'sales_contacts_suppressed_flag', source: 'sales_contacts', count: 139 },
  { key: 'sales_contacts_confirmed_flag', source: 'sales_contacts', count: 57 },
  { key: 'sales_contacts_excluded_flag', source: 'sales_contacts', count: 2 },
  { key: 'synced_inbox_messages_total', source: 'sales_inbox_messages', count: 16 },
  { key: 'mailbox_connections_total', source: 'sales_mailbox_connections', count: 1 },
  { key: 'sales_jobs_total', source: 'sales_jobs', count: 0 },
]
const sales = { status: 'ok' as const, observedAt: sourceAt, metrics }
const reply = {
  status: 'ok' as const, observedAt: '2026-10-28T14:34:00.000Z',
  replyJobsTotal: 1, replyCurrentDraftsTotal: 1, replyDraftRevisionsTotal: 2,
  sendJobsTotal: 1, sendJobsNotLinkedToCurrentRevision: 0,
  lifecycle: [{
    replyJobStatus: 'awaiting_review', currentApprovalStatus: 'approved',
    currentSendStatus: 'smtp_accepted', count: 1,
  }],
  sendPolicy: { total: 1, enabledUnexpired: 0, enabledButExpired: 1, disabled: 0 },
  latestTimingRule: { minWaitSeconds: 1209600, maxReminders: 1 },
}

describe('Handlarbörsen: read-only communications view', () => {
  it('preserves the three distinct reply, approval and SMTP dimensions', () => {
    const out = buildCommunicationsOverview(sales, reply)
    expect(out).toMatchObject({
      replyJobs: 1, awaitingReview: 1, currentDrafts: 1,
      approvedCurrentDrafts: 1, smtpAcceptedCurrentDrafts: 1,
    })
    expect(out.stages).toEqual(reply.lifecycle)
  })

  it('never equates smtp_accepted to recipient delivery or permission to send', () => {
    const out = buildCommunicationsOverview(sales, reply)
    expect(out.recipientDeliveryVerified).toBe(false)
    expect(out.sendingPermittedByOverview).toBe(false)
  })

  it('keeps historical drafts and sends distinct from current revision', () => {
    const out = buildCommunicationsOverview(sales, reply)
    expect(out.historicalAndCurrentDraftRevisions).toBe(2)
    expect(out.currentDrafts).toBe(1)
    expect(out.sendJobsNotLinkedToCurrentRevision).toBe(0)
  })

  it('preserves suppressed/confirmed overlap rather than deriving outreach eligibility', () => {
    const out = buildCommunicationsOverview(sales, reply)
    expect(out.contacts).toBe(139)
    expect(out.suppressedContacts).toBe(139)
    expect(out.confirmedContacts).toBe(57)
    expect(out.sendingPermittedByOverview).toBe(false)
  })

  it('shows inbox counts but does not expose private message or recipient fields', () => {
    const out = buildCommunicationsOverview(sales, reply)
    expect(out.inboxMessages).toBe(16)
    expect(out.mailboxConnections).toBe(1)
    expect(JSON.stringify(out)).not.toMatch(/"recipient"\s*:|"fromEmail"\s*:|"body_text"\s*:|"internal_job_id"\s*:|secret@example/i)
  })

  it('does not use zero to mask failed CRM source reads', () => {
    const out = buildCommunicationsOverview({ status: 'unavailable' }, reply)
    expect(out.inboxMessages).toBeNull()
    expect(out.suppressedContacts).toBeNull()
    expect(out.approvedCurrentDrafts).toBe(1)
    expect(out.salesObservedAt).toBeNull()
  })

  it('does not use zero to mask failed lifecycle source reads', () => {
    const out = buildCommunicationsOverview(sales, { status: 'unavailable' })
    expect(out.currentDrafts).toBeNull()
    expect(out.awaitingReview).toBeNull()
    expect(out.policy).toBeNull()
    expect(out.timing).toBeNull()
    expect(out.inboxMessages).toBe(16)
  })

  it('keeps missing metric keys unavailable rather than inventing zero', () => {
    const out = buildCommunicationsOverview({ ...sales, metrics: [] }, reply)
    expect(out.inboxMessages).toBeNull()
    expect(out.contacts).toBeNull()
  })

  it('treats duplicate and malformed source counts as unavailable', () => {
    const duplicate = buildCommunicationsOverview({ ...sales, metrics: [metrics[0], metrics[0]] }, reply)
    expect(duplicate.contacts).toBeNull()
    const invalid = buildCommunicationsOverview({ ...sales, metrics: [{ ...metrics[0], count: -1 }] }, reply)
    expect(invalid.contacts).toBeNull()
  })

  it('accepts actual empty tables as genuine zero results', () => {
    const out = buildCommunicationsOverview({ ...sales, metrics: [{ key: 'sales_jobs_total', source: 'sales_jobs', count: 0 }] }, {
      ...reply, replyJobsTotal: 0, replyCurrentDraftsTotal: 0, lifecycle: [],
    })
    expect(out.salesJobs).toBe(0)
    expect(out.awaitingReview).toBe(0)
    expect(out.currentDrafts).toBe(0)
  })

  it('renders sourced figures, separate status labels and no made-up delivery receipt', () => {
    const html = renderToStaticMarkup(
      createElement(HandlarborsenCommunications, {
        projectSlug: 'handlarborsen', view: buildCommunicationsOverview(sales, reply),
      }),
    )
    expect(html).toContain('Synkade inkorgsmeddelanden')
    expect(html).toContain('Godkänt utkast')
    expect(html).toContain('Accepterat av SMTP (ej leverans)')
    expect(html).toContain('Suppressed')
    expect(html).toContain('Endast läsning')
    expect(html).not.toContain('Leverans bekräftad')
  })

  it('renders explicit unavailable states instead of fake zeros', () => {
    const html = renderToStaticMarkup(
      createElement(HandlarborsenCommunications, {
        projectSlug: 'handlarborsen',
        view: buildCommunicationsOverview({ status: 'unavailable' }, { status: 'unavailable' }),
      }),
    )
    expect(html).toContain('Ej tillgängligt')
    expect(html).toContain('Svarskedjan kunde inte läsas')
    expect(html).toContain('Sändpolicy kunde inte verifieras')
  })

  it('keeps the page owner-gated and both reads before rendering, with no mutation paths', () => {
    const page = readFileSync(resolve('app/(platform)/projects/[slug]/communications/page.tsx'), 'utf8')
    const component = readFileSync(resolve('components/platform/vnext/HandlarborsenCommunications.tsx'), 'utf8')
    const link = readFileSync(resolve('components/platform/vnext/ProjectCommandCenter.tsx'), 'utf8')
    expect(page).toContain('getProjectBySlug(params.slug)')
    expect(page).toContain('isHandlarborsenProject(project)')
    expect(page).toContain('resolveProjectAccess()')
    expect(page.indexOf('resolveProjectAccess()')).toBeLessThan(page.indexOf('createAdminClient()'))
    expect(page).toContain('access.allowedProjectIds.includes(project.id)')
    expect(page).toContain('readHandlarborsenSalesOverview(context)')
    expect(page).toContain('readHandlarborsenReplyLifecycle(context)')
    expect(page).toContain("if (sales.status === 'not_permitted' || reply.status === 'not_permitted') notFound()")
    expect(link).toContain("hasCover ? '/projects/handlarborsen/communications' : null")
    for (const body of [page, component]) {
      for (const forbidden of ['.insert(', '.update(', '.delete(', '.rpc(', 'sendEmail(', 'fetch(']) {
        expect(body).not.toContain(forbidden)
      }
    }
  })
})
