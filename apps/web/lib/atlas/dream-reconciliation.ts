/**
 * Canonical Dream finding lifecycle.
 *
 * `dream_issues` is an observation ledger, `manager_tasks` is execution
 * progress, and `atlas_actions` is action history.  None of those is resolution
 * truth.  Only the immutable reconciliation events reduced here decide a
 * finding's current disposition.
 *
 * A finding with no state event is deliberately UNVERIFIED.  This is the
 * compatibility boundary that prevents old model-authored prose from becoming a
 * verified active incident merely because it exists in `dream_issues`.
 */

export type DreamDisposition =
  | 'active'
  | 'resolved'
  | 'superseded'
  | 'invalidated'
  | 'unverified'

export type DreamReconciliationEventType =
  | 'implementation_evidence_recorded'
  | 'verification_evidence_recorded'
  | 'activated'
  | 'resolved'
  | 'superseded'
  | 'invalidated'
  | 'marked_unverified'
  | 'reopened'

export interface DreamReconciliationEvent {
  eventId: string
  eventSeq?: number | null
  eventType: DreamReconciliationEventType
  evidenceKind?: string | null
  evidenceLocator?: string | null
  evidenceDigest?: string | null
  supersedingFindingIdentity?: string | null
  occurredAt: string
  recordedAt: string
}

export interface DreamDispositionState {
  disposition: DreamDisposition
  supersededBy: string | null
  currentActiveSince: string | null
  lastVerifiedAt: string | null
  lastTransitionAt: string | null
}

const STATE_EVENTS = new Set<DreamReconciliationEventType>([
  'activated', 'resolved', 'superseded', 'invalidated', 'marked_unverified', 'reopened',
])

function compareEvents(a: DreamReconciliationEvent, b: DreamReconciliationEvent): number {
  if (a.eventSeq != null && b.eventSeq != null && a.eventSeq !== b.eventSeq) {
    return a.eventSeq - b.eventSeq
  }
  const recorded = a.recordedAt.localeCompare(b.recordedAt)
  if (recorded !== 0) return recorded
  const occurred = a.occurredAt.localeCompare(b.occurredAt)
  if (occurred !== 0) return occurred
  return a.eventId.localeCompare(b.eventId)
}

/** One deterministic reducer used by Dream, Atlas context, and tool reads. */
export function reduceDreamDisposition(
  input: readonly DreamReconciliationEvent[],
): DreamDispositionState {
  const events = [...input].sort(compareEvents)
  let disposition: DreamDisposition = 'unverified'
  let supersededBy: string | null = null
  let currentActiveSince: string | null = null
  let lastVerifiedAt: string | null = null
  let lastTransitionAt: string | null = null

  for (const event of events) {
    if (event.eventType === 'verification_evidence_recorded') {
      lastVerifiedAt = event.occurredAt
      continue
    }
    if (!STATE_EVENTS.has(event.eventType)) continue

    lastTransitionAt = event.occurredAt
    switch (event.eventType) {
      case 'activated':
      case 'reopened':
        disposition = 'active'
        supersededBy = null
        currentActiveSince = event.occurredAt
        break
      case 'resolved':
        disposition = 'resolved'
        supersededBy = null
        currentActiveSince = null
        break
      case 'superseded':
        disposition = 'superseded'
        supersededBy = event.supersedingFindingIdentity ?? null
        currentActiveSince = null
        break
      case 'invalidated':
        disposition = 'invalidated'
        supersededBy = null
        currentActiveSince = null
        break
      case 'marked_unverified':
        disposition = 'unverified'
        supersededBy = null
        currentActiveSince = null
        break
    }
  }

  return { disposition, supersededBy, currentActiveSince, lastVerifiedAt, lastTransitionAt }
}

type AnyDb = any

interface EventRow {
  event_id: string
  event_seq?: number | null
  finding_id: string
  event_type: DreamReconciliationEventType
  evidence_kind?: string | null
  evidence_locator?: string | null
  evidence_digest?: string | null
  superseding_finding_identity?: string | null
  occurred_at: string
  recorded_at: string
}

function toEvent(row: EventRow): DreamReconciliationEvent {
  return {
    eventId: row.event_id,
    eventSeq: row.event_seq ?? null,
    eventType: row.event_type,
    evidenceKind: row.evidence_kind ?? null,
    evidenceLocator: row.evidence_locator ?? null,
    evidenceDigest: row.evidence_digest ?? null,
    supersedingFindingIdentity: row.superseding_finding_identity ?? null,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
  }
}

/**
 * Project-scoped bulk read.  The project predicate is intentional even though
 * finding ids are UUIDs: callers use a service-role client that bypasses RLS.
 */
export async function loadDreamDispositionStates(
  db: AnyDb,
  projectId: string,
  findingIds: string[],
): Promise<Map<string, DreamDispositionState>> {
  const states = new Map<string, DreamDispositionState>()
  for (const id of findingIds) states.set(id, reduceDreamDisposition([]))
  if (!projectId || findingIds.length === 0) return states

  try {
    const { data } = await (db.from('dream_issue_reconciliation_events') as any)
      .select('event_id, event_seq, finding_id, event_type, evidence_kind, evidence_locator, evidence_digest, superseding_finding_identity, occurred_at, recorded_at')
      .eq('project_id', projectId)
      .in('finding_id', findingIds)
      .order('event_seq', { ascending: true })

    const grouped = new Map<string, DreamReconciliationEvent[]>()
    for (const row of (data ?? []) as EventRow[]) {
      const events = grouped.get(row.finding_id) ?? []
      events.push(toEvent(row))
      grouped.set(row.finding_id, events)
    }
    for (const id of findingIds) states.set(id, reduceDreamDisposition(grouped.get(id) ?? []))
  } catch {
    // Fail closed: unavailable reconciliation truth is not evidence of ACTIVE.
  }
  return states
}
