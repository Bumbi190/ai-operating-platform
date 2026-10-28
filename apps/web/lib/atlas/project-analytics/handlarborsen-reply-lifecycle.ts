import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

/**
 * Correlates only NON-IDENTIFYING technical stages of existing sales records.
 * No customer data, mail headers, message text, recipient, policy address,
 * secrets or external workflow content is fetched or returned.
 *
 * No writes. Bounded project+owner scoped SELECTs and a fail-closed result on
 * truncated/failed snapshots. The observation is not transaction-atomic.
 */
type ReadContext = { db: any; userId: string; allowedProjectIds: string[]; now?: Date }
type Row = Record<string, unknown>
const PROJECT = HANDLARBORSEN_PROJECT_ID
const MAX_ROWS = 200

const JOB_STATES = new Set(['queued', 'running', 'needs_input', 'awaiting_review', 'failed', 'reconciling', 'cancelled'])
const SEND_STATES = new Set(['queued', 'claimed', 'dispatching', 'smtp_accepted', 'failed_before_send', 'delivery_unknown', 'cancelled'])
const APPROVAL_STATES = new Set(['pending', 'approved', 'rejected', 'returned', 'expired', 'cancelled', 'superseded'])

function stringField(row: Row, key: string): string {
  const value = row[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error('invalid_metadata')
  return value
}

function knownState(row: Row, key: string, states: Set<string>): string {
  const value = stringField(row, key)
  // Unexpected database values must not be presented as an approved state.
  if (!states.has(value)) throw new Error('unrecognized_stage')
  return value
}

async function sourceRows(
  db: any, table: string, fields: string, userId: string | null,
  selectedIds?: readonly string[],
): Promise<Row[]> {
  // All table names, fields and filters are caller-owned static constants.
  let query = db.from(table).select(fields, { count: 'exact' }).eq('project_id', PROJECT)
  if (userId) query = query.eq('owner_id', userId)
  if (selectedIds) query = query.in('id', selectedIds)
  const { data, count, error } = await query.range(0, MAX_ROWS - 1)
  if (error || !Number.isSafeInteger(count) || count < 0 || count > MAX_ROWS ||
      !Array.isArray(data) || data.length !== count ||
      data.some(value => !value || typeof value !== 'object' || Array.isArray(value))) {
    throw new Error('bounded_metadata_unavailable')
  }
  return data as Row[]
}

export async function readHandlarborsenReplyLifecycle(context: ReadContext) {
  const { db, userId, allowedProjectIds } = context
  if (!userId || !assertProjectAllowed(PROJECT, allowedProjectIds)) {
    return { status: 'not_permitted' as const }
  }

  // The shared service-role DB bypasses RLS. Independently prove this caller
  // actually OWNS the fixed project before any privileged source query.
  try {
    const { data: project, error } = await db.from('projects')
      .select('id,slug,atlas_mode').eq('id', PROJECT).eq('owner_id', userId).maybeSingle()
    if (error || project?.id !== PROJECT || project?.slug !== HANDLARBORSEN_PROJECT_SLUG ||
        !['observer', 'active'].includes(project?.atlas_mode)) {
      return { status: 'not_permitted' as const }
    }
  } catch {
    return { status: 'not_permitted' as const }
  }

  try {
    const at = context.now ?? new Date()
    const observedAt = at.toISOString()
    const [jobs, drafts, sends, policies, rules] = await Promise.all([
      sourceRows(db, 'sales_reply_jobs', 'id,status', userId),
      sourceRows(db, 'sales_reply_draft_revisions', 'id,job_id,approval_id,is_current', null),
      sourceRows(db, 'sales_send_jobs', 'revision_id,status', userId),
      sourceRows(db, 'sales_send_policies', 'enabled,expires_at', userId),
      sourceRows(db, 'sales_contact_timing_rules', 'version,min_wait_seconds,max_reminders', userId),
    ])

    const jobById = new Map(jobs.map(job => {
      const id = stringField(job, 'id')
      knownState(job, 'status', JOB_STATES)
      return [id, job] as const
    }))
    if (jobById.size !== jobs.length) throw new Error('duplicate_job')

    const revisionIds = new Set<string>()
    const currentDraftByJob = new Map<string, Row>()
    for (const draft of drafts) {
      const revisionId = stringField(draft, 'id')
      const jobId = stringField(draft, 'job_id')
      if (revisionIds.has(revisionId) || !jobById.has(jobId) || typeof draft.is_current !== 'boolean') {
        throw new Error('invalid_revision_link')
      }
      revisionIds.add(revisionId)
      if (draft.approval_id !== null && draft.approval_id !== undefined &&
          typeof draft.approval_id !== 'string') throw new Error('invalid_approval_link')
      if (draft.is_current) {
        if (currentDraftByJob.has(jobId)) throw new Error('multiple_current_revisions')
        currentDraftByJob.set(jobId, draft)
      }
    }

    const approvalIds = [...new Set([...currentDraftByJob.values()]
      .map(row => row.approval_id).filter((id): id is string => typeof id === 'string'))]
    const approvals = approvalIds.length
      ? await sourceRows(db, 'approvals', 'id,status', null, approvalIds)
      : []
    const approvalById = new Map(approvals.map(row =>
      [stringField(row, 'id'), knownState(row, 'status', APPROVAL_STATES)] as const))
    if (approvalById.size !== approvalIds.length || approvals.length !== approvalIds.length) {
      throw new Error('missing_approval')
    }

    const sendByRevision = new Map<string, string>()
    for (const send of sends) {
      const revisionId = stringField(send, 'revision_id')
      const status = knownState(send, 'status', SEND_STATES)
      if (!revisionIds.has(revisionId) || sendByRevision.has(revisionId)) {
        throw new Error('invalid_send_link')
      }
      sendByRevision.set(revisionId, status)
    }

    const lifecycle = new Map<string, {
      replyJobStatus: string
      currentApprovalStatus: string
      currentSendStatus: string
      count: number
    }>()
    for (const job of jobs) {
      const current = currentDraftByJob.get(stringField(job, 'id'))
      const replyJobStatus = knownState(job, 'status', JOB_STATES)
      const currentApprovalStatus = !current ? 'no_current_draft'
        : typeof current.approval_id === 'string'
          ? (approvalById.get(current.approval_id) ?? 'unavailable')
          : 'no_approval'
      const currentSendStatus = !current ? 'no_current_draft'
        : sendByRevision.get(stringField(current, 'id')) ?? 'no_send_job'
      if (currentApprovalStatus === 'unavailable') throw new Error('missing_approval')
      const key = [replyJobStatus, currentApprovalStatus, currentSendStatus].join('|')
      const group = lifecycle.get(key)
      if (group) group.count++
      else lifecycle.set(key, { replyJobStatus, currentApprovalStatus, currentSendStatus, count: 1 })
    }

    let enabledUnexpired = 0
    let expired = 0
    let disabled = 0
    for (const policy of policies) {
      if (typeof policy.enabled !== 'boolean') throw new Error('invalid_policy')
      const expiry = Date.parse(stringField(policy, 'expires_at'))
      if (!Number.isFinite(expiry)) throw new Error('invalid_policy_expiry')
      if (!policy.enabled) disabled++
      else if (expiry <= at.getTime()) expired++
      else enabledUnexpired++
    }
    const ordered = [...rules].sort((a, b) => Number(b.version) - Number(a.version))
    for (const rule of ordered) {
      if (typeof rule.version !== 'number' || !Number.isSafeInteger(rule.version) || rule.version < 1 ||
          typeof rule.min_wait_seconds !== 'number' || !Number.isSafeInteger(rule.min_wait_seconds) || rule.min_wait_seconds < 0 ||
          typeof rule.max_reminders !== 'number' || !Number.isSafeInteger(rule.max_reminders) || rule.max_reminders < 0) {
        throw new Error('invalid_timing_rule')
      }
    }
    const latestRule = ordered[0] ?? null

    return {
      status: 'ok' as const,
      source: 'handlarborsen_project_scoped_reply_metadata',
      observedAt,
      dataScope: 'handlarborsen_only' as const,
      readMethod: 'bounded_project_scoped_technical_metadata_only' as const,
      consistency: 'non_atomic_multi_table_observation' as const,
      maximumRowsPerSource: MAX_ROWS,
      replyJobsTotal: jobs.length,
      replyCurrentDraftsTotal: currentDraftByJob.size,
      replyDraftRevisionsTotal: drafts.length,
      sendJobsTotal: sends.length,
      sendJobsNotLinkedToCurrentRevision: sends.filter(send => {
        const id = stringField(send, 'revision_id')
        return ![...currentDraftByJob.values()].some(draft => draft.id === id)
      }).length,
      lifecycle: [...lifecycle.values()].sort((a, b) =>
        a.replyJobStatus.localeCompare(b.replyJobStatus) ||
        a.currentApprovalStatus.localeCompare(b.currentApprovalStatus) ||
        a.currentSendStatus.localeCompare(b.currentSendStatus)),
      sendPolicy: { total: policies.length, enabledUnexpired, enabledButExpired: expired, disabled },
      latestTimingRule: latestRule ? {
        minWaitSeconds: latestRule.min_wait_seconds as number,
        maxReminders: latestRule.max_reminders as number,
      } : null,
      deliveredToRecipientVerified: false as const,
      contactPermissionInferred: false as const,
      sendingEnabledByThisTool: false as const,
      limitations: [
        'Reply-jobbets bearbetningsstatus, den aktuella utkastrevisionens godkännande och det kopplade skickajobbets status är OLIKA dimensioner.',
        'Ett awaiting_review-jobb kan ha ett approved utkast och ett smtp_accepted-jobb utan att uppgifterna motsäger varandra.',
        'smtp_accepted visar acceptans hos SMTP-servern, inte leverans eller läsning hos mottagaren.',
        'En tidigare godkänd revision är INTE ett nytt godkännande eller utskickstillstånd.',
        'Sändpolicyns giltighet avser enbart avläsningstidpunkten; ingen giltig policy ger i sig rätt att kontakta någon.',
        'Regler om väntetid och antal påminnelser är bara registrerad konfiguration; ingen faktisk påminnelse har exekverats genom denna läsning.',
        'Tekniska ID:n används endast för korrelation i serverminnet och visas aldrig för modellen.',
        'Alla källor läses separat, inte transaktionsatomärt. Vid saknad/ogiltig metadata ges inget delvis resultat eller påhittade nollor.',
      ],
    }
  } catch {
    return { status: 'unavailable' as const, reason: 'reply_metadata_unavailable' as const }
  }
}
