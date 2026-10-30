/**
 * Display-only projection over the TWO existing, owner-verified Atlas readers.
 * Does not read contacts, messages, policies or approvals itself.
 * Null means unavailable: never convert a failed read to zero.
 */
type Metric = { key: string; source: string; count: number }
type SalesRead =
  | { status: 'ok'; observedAt: string; metrics: readonly Metric[] }
  | { status: 'unavailable' | 'not_permitted' }

export type ReplyStage = {
  replyJobStatus: string
  currentApprovalStatus: string
  currentSendStatus: string
  count: number
}
type ReplyRead =
  | {
      status: 'ok'
      observedAt: string
      replyJobsTotal: number
      replyCurrentDraftsTotal: number
      replyDraftRevisionsTotal: number
      sendJobsTotal: number
      sendJobsNotLinkedToCurrentRevision: number
      lifecycle: readonly ReplyStage[]
      sendPolicy: {
        total: number
        enabledUnexpired: number
        enabledButExpired: number
        disabled: number
      }
      latestTimingRule: { minWaitSeconds: number; maxReminders: number } | null
    }
  | { status: 'unavailable' | 'not_permitted' }

export function buildCommunicationsOverview(sales: SalesRead, reply: ReplyRead) {
  function metric(key: string): number | null {
    if (sales.status !== 'ok') return null
    const matches = sales.metrics.filter(row => row.key === key)
    return matches.length === 1 && Number.isSafeInteger(matches[0].count) && matches[0].count >= 0
      ? matches[0].count : null
  }
  function stageTotal(
    key: 'replyJobStatus' | 'currentApprovalStatus' | 'currentSendStatus',
    value: string,
  ): number | null {
    if (reply.status !== 'ok' || !reply.lifecycle.every(stage =>
      Number.isSafeInteger(stage.count) && stage.count >= 0)) return null
    return reply.lifecycle.reduce((sum, stage) => sum + (stage[key] === value ? stage.count : 0), 0)
  }
  return {
    salesStatus: sales.status,
    replyStatus: reply.status,
    salesObservedAt: sales.status === 'ok' ? sales.observedAt : null,
    replyObservedAt: reply.status === 'ok' ? reply.observedAt : null,
    inboxMessages: metric('synced_inbox_messages_total'),
    mailboxConnections: metric('mailbox_connections_total'),
    contacts: metric('sales_contacts_total'),
    suppressedContacts: metric('sales_contacts_suppressed_flag'),
    confirmedContacts: metric('sales_contacts_confirmed_flag'),
    excludedContacts: metric('sales_contacts_excluded_flag'),
    salesJobs: metric('sales_jobs_total'),
    currentDrafts: reply.status === 'ok' ? reply.replyCurrentDraftsTotal : null,
    historicalAndCurrentDraftRevisions: reply.status === 'ok' ? reply.replyDraftRevisionsTotal : null,
    replyJobs: reply.status === 'ok' ? reply.replyJobsTotal : null,
    awaitingReview: stageTotal('replyJobStatus', 'awaiting_review'),
    approvedCurrentDrafts: stageTotal('currentApprovalStatus', 'approved'),
    smtpAcceptedCurrentDrafts: stageTotal('currentSendStatus', 'smtp_accepted'),
    sendJobsTotal: reply.status === 'ok' ? reply.sendJobsTotal : null,
    sendJobsNotLinkedToCurrentRevision: reply.status === 'ok'
      ? reply.sendJobsNotLinkedToCurrentRevision : null,
    stages: reply.status === 'ok' ? [...reply.lifecycle] : null,
    policy: reply.status === 'ok' ? reply.sendPolicy : null,
    timing: reply.status === 'ok' ? reply.latestTimingRule : null,
    // The readers contain no recipient-delivery receipts or send permission.
    recipientDeliveryVerified: false as const,
    sendingPermittedByOverview: false as const,
  }
}

export type CommunicationsOverview = ReturnType<typeof buildCommunicationsOverview>
