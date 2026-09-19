import { describe, expect, it } from 'vitest'
import {
  reduceDreamDisposition,
  type DreamReconciliationEvent,
  type DreamReconciliationEventType,
} from '@/lib/atlas/dream-reconciliation'
import { dreamLiveSummary, getDreamFindings, resolveDreamFinding } from '@/lib/atlas/dream'

function event(
  eventSeq: number,
  eventType: DreamReconciliationEventType,
  extra: Partial<DreamReconciliationEvent> = {},
): DreamReconciliationEvent {
  const time = `2026-09-19T12:00:${String(eventSeq).padStart(2, '0')}.000Z`
  return {
    eventId: `event-${eventSeq}`,
    eventSeq,
    eventType,
    occurredAt: time,
    recordedAt: time,
    ...extra,
  }
}

describe('Dream reconciliation reducer — one canonical lifecycle', () => {
  it('defaults legacy/no-event findings to UNVERIFIED', () => {
    expect(reduceDreamDisposition([]).disposition).toBe('unverified')
  })

  it.each([
    ['activated', 'active'],
    ['resolved', 'resolved'],
    ['superseded', 'superseded'],
    ['invalidated', 'invalidated'],
    ['marked_unverified', 'unverified'],
  ] as const)('reduces %s to %s', (eventType, disposition) => {
    expect(reduceDreamDisposition([event(1, eventType)]).disposition).toBe(disposition)
  })

  it('replays by database event order and reopens terminal state only from a reopened event', () => {
    const state = reduceDreamDisposition([
      event(4, 'reopened'),
      event(2, 'activated'),
      event(3, 'resolved'),
      event(1, 'verification_evidence_recorded'),
    ])
    expect(state.disposition).toBe('active')
    expect(state.currentActiveSince).toBe('2026-09-19T12:00:04.000Z')
    expect(state.lastVerifiedAt).toBe('2026-09-19T12:00:01.000Z')
  })

  it('preserves the canonical successor of a superseded finding', () => {
    const state = reduceDreamDisposition([
      event(1, 'superseded', { supersedingFindingIdentity: 'canonical_issue' }),
    ])
    expect(state).toMatchObject({ disposition: 'superseded', supersededBy: 'canonical_issue' })
  })

  it('evidence and recurring prose do not themselves change disposition', () => {
    expect(reduceDreamDisposition([
      event(1, 'implementation_evidence_recorded'),
      event(2, 'verification_evidence_recorded'),
    ]).disposition).toBe('unverified')
  })
})

interface QueryState {
  eq: Record<string, unknown>
  in: Record<string, unknown[]>
}

function makeDb(seed: Record<string, any[]>) {
  function query(table: string) {
    const state: QueryState = { eq: {}, in: {} }
    const builder: any = {
      select() { return builder },
      eq(column: string, value: unknown) { state.eq[column] = value; return builder },
      in(column: string, values: unknown[]) { state.in[column] = values; return builder },
      order() { return builder },
      limit() { return builder },
      then(resolve: (value: { data: any[]; error: null }) => unknown) {
        let rows = [...(seed[table] ?? [])]
        for (const [column, value] of Object.entries(state.eq)) rows = rows.filter(row => row[column] === value)
        for (const [column, values] of Object.entries(state.in)) rows = rows.filter(row => values.includes(row[column]))
        resolve({ data: rows, error: null })
      },
    }
    return builder
  }
  return { from: (table: string) => query(table) }
}

const PROJECT = 'project-1'
const baseIssue = {
  project_id: PROJECT,
  severity: 'critical',
  latest_action: 'fix it',
  latest_memory_key: 'dream_old',
  manager_task_id: null,
  occurrences: 3,
  first_seen_at: '2026-06-08T00:00:00.000Z',
  last_seen_at: '2026-09-19T00:00:00.000Z',
}

function row(id: string, issue_id: string, latest_insight: string) {
  return { ...baseIssue, id, issue_id, latest_insight }
}

function storedEvent(finding_id: string, event_seq: number, event_type: DreamReconciliationEventType, extra = {}) {
  return {
    project_id: PROJECT, finding_id, event_seq, event_type, event_id: `${finding_id}-${event_seq}`,
    occurred_at: `2026-09-19T12:00:0${event_seq}.000Z`,
    recorded_at: `2026-09-19T12:00:0${event_seq}.000Z`,
    ...extra,
  }
}

describe('Dream reads and live context use reconciliation-aware ACTIVE only', () => {
  const seed = {
    projects: [{ id: PROJECT, name: 'The Prompt' }, { id: 'foreign', name: 'Foreign' }],
    dream_issues: [
      row('active-id', 'step_logs_missing', 'Verified missing step logs'),
      row('resolved-id', 'ig_self_account_id', 'Stale 107-day Instagram prose'),
      row('unknown-id', 'legacy_unknown', 'Unverified legacy warning'),
      { ...row('duplicate-id', 'critical_escalation_ig_self_account', 'Duplicate'), severity: 'warning' },
      row('invalid-id', 'bad_inference', 'Invalidated model guess'),
    ],
    dream_issue_reconciliation_events: [
      storedEvent('active-id', 1, 'verification_evidence_recorded'),
      storedEvent('active-id', 2, 'activated'),
      storedEvent('resolved-id', 3, 'resolved'),
      storedEvent('duplicate-id', 4, 'superseded', { superseding_finding_identity: 'ig_self_account_id' }),
      storedEvent('invalid-id', 5, 'invalidated'),
    ],
    manager_tasks: [],
  }

  it('counts severity only for ACTIVE and retains every disposition in history', async () => {
    const result = await getDreamFindings(makeDb(seed), PROJECT)
    expect(result.counts).toEqual({ critical: 1, warning: 0, info: 0, total: 1 })
    expect(result.lifecycle).toEqual({ active: 1, resolved: 1, superseded: 1, invalidated: 1, unverified: 1 })
    expect(result.findings.find(f => f.issueId === 'ig_self_account_id')?.disposition).toBe('resolved')
    expect(result.findings.find(f => f.issueId === 'legacy_unknown')?.disposition).toBe('unverified')
  })

  it('injects only verified ACTIVE warnings and respects the project allow-list', async () => {
    const summary = await dreamLiveSummary(makeDb(seed), [PROJECT])
    expect(summary).toContain('Verified missing step logs')
    expect(summary).not.toContain('107-day Instagram')
    expect(summary).not.toContain('Unverified legacy')
    expect(summary).not.toContain('Duplicate')
    expect(summary).not.toContain('Invalidated model')
    expect(summary).not.toContain('Foreign')
  })
})

function makeResolutionDb(projectId = PROJECT, taskProjectId = projectId) {
  const issue = { id: 'finding-1', project_id: projectId, issue_id: 'verified_issue', manager_task_id: 'task-1' }
  const task = { id: 'task-1', project_id: taskProjectId, status: 'pending', result: null as string | null }
  const events: any[] = [
    { ...storedEvent(issue.id, 1, 'verification_evidence_recorded'), project_id: projectId },
    { ...storedEvent(issue.id, 2, 'activated'), project_id: projectId },
  ]

  function query(table: string) {
    const filters: Record<string, unknown> = {}
    let mode: 'select' | 'update' | 'upsert' = 'select'
    let payload: any = null
    const builder: any = {
      select() { return builder },
      eq(column: string, value: unknown) { filters[column] = value; return builder },
      in() { return builder },
      order() { return builder },
      update(value: any) { mode = 'update'; payload = value; return builder },
      upsert(value: any) { mode = 'upsert'; payload = value; return builder },
      maybeSingle() { return run() },
      then(resolve: (value: any) => unknown) { return run().then(resolve) },
    }
    async function run() {
      if (table === 'dream_issues') {
        const match = issue.project_id === filters.project_id && issue.issue_id === filters.issue_id
        return { data: match ? issue : null, error: null }
      }
      if (table === 'manager_tasks' && mode === 'update') {
        const match = task.id === filters.id && task.project_id === filters.project_id
        if (!match) return { data: null, error: { message: 'scope mismatch' } }
        Object.assign(task, payload)
        return { data: task, error: null }
      }
      if (table === 'dream_issue_reconciliation_events' && mode === 'upsert') {
        if (payload.project_id !== projectId || payload.finding_id !== issue.id) {
          return { data: null, error: { message: 'cross-project denied' } }
        }
        if (!events.some(e => e.source_key === payload.source_key)) {
          events.push({
            ...payload,
            event_id: `written-${events.length}`,
            event_seq: events.length + 1,
            occurred_at: '2026-09-19T13:00:00.000Z',
            recorded_at: '2026-09-19T13:00:00.000Z',
          })
        }
        return { data: payload, error: null }
      }
      if (table === 'dream_issue_reconciliation_events') {
        return { data: events.filter(e => e.project_id === filters.project_id), error: null }
      }
      return { data: null, error: { message: `unexpected ${table}` } }
    }
    return builder
  }

  return { db: { from: (table: string) => query(table) }, task, events }
}

describe('Dream resolution boundary', () => {
  it('records task completion + operator attestation before canonical RESOLVED', async () => {
    const { db, task, events } = makeResolutionDb()
    const result = await resolveDreamFinding(db, {
      projectId: PROJECT,
      issueId: 'verified_issue',
      result: 'fixed',
      actorPrincipal: 'user:11111111-1111-4111-8111-111111111111',
      sourceKey: 'atlas-chat:tool-1',
      evidenceLocator: 'atlas-chat-tool:tool-1',
    })
    expect(result).toMatchObject({ ok: true, status: 'resolved' })
    expect(task).toMatchObject({ status: 'done', result: 'fixed' })
    expect(events.slice(-3).map(e => e.event_type)).toEqual([
      'implementation_evidence_recorded', 'verification_evidence_recorded', 'resolved',
    ])
    expect(events.at(-2)).toMatchObject({ evidence_kind: 'operator_attestation' })
  })

  it('fails closed before writes for a cross-project finding identity', async () => {
    const { db, task, events } = makeResolutionDb('foreign-project')
    const result = await resolveDreamFinding(db, {
      projectId: PROJECT,
      issueId: 'verified_issue',
      actorPrincipal: 'user:11111111-1111-4111-8111-111111111111',
      sourceKey: 'atlas-chat:tool-foreign',
      evidenceLocator: 'atlas-chat-tool:tool-foreign',
    })
    expect(result.ok).toBe(false)
    expect(task.status).toBe('pending')
    expect(events).toHaveLength(2)
  })

  it('does not claim resolution when the linked task is outside the project', async () => {
    const { db, task, events } = makeResolutionDb(PROJECT, 'foreign-project')
    const result = await resolveDreamFinding(db, {
      projectId: PROJECT,
      issueId: 'verified_issue',
      actorPrincipal: 'user:11111111-1111-4111-8111-111111111111',
      sourceKey: 'atlas-chat:tool-foreign-task',
      evidenceLocator: 'atlas-chat-tool:tool-foreign-task',
    })
    expect(result.ok).toBe(false)
    expect(task.status).toBe('pending')
    expect(events).toHaveLength(2)
  })
})
