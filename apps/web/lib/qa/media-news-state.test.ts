import { describe, expect, it } from 'vitest'
import { transitionNewsItemStatus, type NewsStatus } from '@/lib/media/news-state'

function makeDb(row: Record<string, unknown>) {
  const audits: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  return {
    audits,
    updates,
    from: (table: string) => {
      if (table === 'media_duplicate_guard_migration_audit') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            audits.push(payload)
            return { data: null, error: null }
          },
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => {
                  updates.push(patch)
                  return { data: { ...row, ...patch }, error: null }
                },
              }),
            }),
          }),
        }),
      }
    },
  } as any
}

function news(status: NewsStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 'news-1',
    project_id: 'project-1',
    status,
    novelty_verdict: 'new',
    novelty_policy_outcome: 'novelty_passed',
    novelty_reviewed_at: '2026-07-08T12:00:00Z',
    novelty_workflow_run_id: 'run-1',
    novelty_input_evidence: { priorItems: [] },
    candidate_idempotency_key: 'media-candidate:v1:key',
    candidate_identity: 'url:https://example.com/news',
    editorial_approved_at: status === 'approved' || status === 'scripted' || status === 'published'
      ? '2026-07-08T12:05:00Z'
      : null,
    ...overrides,
  }
}

describe('media news state transitions', () => {
  it('blocks duplicate-blocked news from becoming scripted through the generic path', async () => {
    const db = makeDb(news('duplicate_blocked', { novelty_verdict: 'duplicate', novelty_policy_outcome: 'duplicate_blocked' }))
    await expect(transitionNewsItemStatus(db, {
      projectId: 'project-1',
      newsItemId: 'news-1',
      toStatus: 'scripted',
    })).rejects.toThrow(/generic transition/)
    expect(db.updates).toHaveLength(0)
  })

  it('blocks uncertain news from becoming approved without reviewed resolution', async () => {
    const db = makeDb(news('uncertain_requires_review', { novelty_verdict: 'uncertain', novelty_policy_outcome: 'uncertain_requires_review' }))
    await expect(transitionNewsItemStatus(db, {
      projectId: 'project-1',
      newsItemId: 'news-1',
      toStatus: 'approved',
    })).rejects.toThrow(/generic transition/)
    expect(db.updates).toHaveLength(0)
  })

  it('allows approved novelty-passed news to become scripted', async () => {
    const db = makeDb(news('approved'))
    await expect(transitionNewsItemStatus(db, {
      projectId: 'project-1',
      newsItemId: 'news-1',
      toStatus: 'scripted',
    })).resolves.toMatchObject({ status: 'scripted' })
    expect(db.updates[0]).toMatchObject({ status: 'scripted' })
    expect(db.audits[0]).toMatchObject({ audit_type: 'news_state_transition' })
  })

  it('stamps editorial approval evidence when approving novelty-passed news', async () => {
    const db = makeDb(news('pending_editorial_review'))
    await expect(transitionNewsItemStatus(db, {
      projectId: 'project-1',
      newsItemId: 'news-1',
      toStatus: 'approved',
      actor: { id: 'user-1', kind: 'user' },
    })).resolves.toMatchObject({ status: 'approved' })
    expect(db.updates[0]).toMatchObject({
      status: 'approved',
      editorial_approved_by: { id: 'user-1', kind: 'user' },
    })
    expect(db.updates[0].editorial_approved_at).toEqual(expect.any(String))
  })

  it('requires an auditable reason for explicit reviewed resolutions', async () => {
    const db = makeDb(news('material_update_pending', { novelty_verdict: 'material_update', novelty_policy_outcome: 'material_update_pending' }))
    await expect(transitionNewsItemStatus(db, {
      projectId: 'project-1',
      newsItemId: 'news-1',
      toStatus: 'rejected',
      reviewedResolution: true,
      reason: 'Reviewed by operator as not suitable for production.',
      actor: { id: 'user-1', kind: 'user' },
    })).resolves.toMatchObject({ status: 'rejected' })
    expect(db.audits[0]).toMatchObject({ audit_type: 'news_reviewed_resolution' })
  })
})