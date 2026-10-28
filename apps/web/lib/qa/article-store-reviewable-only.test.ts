/**
 * saveGeneratedArticle(writeMode: 'reviewable_only') — the article job's write.
 *
 * An automated re-run must never pull an approved/published/rejected article
 * back into pending_review, and the UPDATE itself must carry the status
 * predicate so an approval racing the write wins.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

let existing: Record<string, unknown> | null = null
let ops: Array<{ op: string; filters: Array<[string, unknown]>; row?: Record<string, unknown> }> = []
let updateReturns: unknown = { id: 'wc-1', external_id: 'omnira_n1' }
let insertError: { code?: string; message: string } | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'projects') {
        return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'p1' } }) }) }) }) }
      }
      const rec = { op: 'select', filters: [] as Array<[string, unknown]>, row: undefined as Record<string, unknown> | undefined }
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { rec.filters.push([c, v]); return q }
      q.update = (row: Record<string, unknown>) => { rec.op = 'update'; rec.row = row; ops.push(rec); return q }
      q.insert = (row: Record<string, unknown>) => { rec.op = 'insert'; rec.row = row; ops.push(rec); return q }
      q.upsert = (row: Record<string, unknown>) => { rec.op = 'upsert'; rec.row = row; ops.push(rec); return q }
      q.maybeSingle = async () => {
        if (rec.op === 'select') return { data: existing, error: null }
        if (rec.op === 'insert' && insertError) return { data: null, error: insertError }
        return { data: rec.op === 'update' ? updateReturns : { id: 'wc-new', external_id: 'omnira_n1' }, error: null }
      }
      q.single = async () => ({ data: { id: 'wc-up', external_id: 'omnira_n1' }, error: null })
      return q
    },
  }),
}))

import { saveGeneratedArticle } from '@/lib/article/store'

const generated = {
  draft: { title: 'T', summary: 'S', body: 'B', category: 'news', tags: [], hero_image_prompt: null, source_name: null, source_url: null,
    _meta: { grounding: 'strong', tier: 'deep', model: 'm', tokensIn: 1, tokensOut: 1, estCostUsd: 0.01, bodyWordCount: 1 } },
  qa: { pass: true, confidence: 'high', issues: [], slop: { score: 0, verdict: 'clean' }, copyOverlap: { ratio: 0, violation: false, windowSize: 15 }, structuralOk: true },
  payload: { version: 1 as const, external_id: 'omnira_n1', title: 'T', body: 'B' },
} as unknown as Parameters<typeof saveGeneratedArticle>[0]['generated']

beforeEach(() => { existing = null; ops = []; updateReturns = { id: 'wc-1', external_id: 'omnira_n1' }; insertError = null })

describe("saveGeneratedArticle writeMode 'reviewable_only'", () => {
  it.each(['published', 'approved', 'rejected', 'scheduled', 'failed'])('existing %s row is left untouched', async (status) => {
    existing = { id: 'wc-1', status, hero_image_status: null }
    const r = await saveGeneratedArticle({ generated, newsItemId: 'n1', writeMode: 'reviewable_only' })
    expect(r).toMatchObject({ id: 'wc-1', status: null, skippedReason: `existing_row_${status}` })
    expect(ops).toHaveLength(0)
  })

  it('pending_review row is updated WITH a status predicate; extraMeta is merged', async () => {
    existing = { id: 'wc-1', status: 'pending_review', hero_image_status: null }
    const r = await saveGeneratedArticle({ generated, newsItemId: 'n1', writeMode: 'reviewable_only', extraMeta: { factcheck_required: true } })
    expect(r).toMatchObject({ id: 'wc-1', status: 'pending_review' })
    expect(ops[0].op).toBe('update')
    expect(ops[0].filters).toContainEqual(['status', 'pending_review'])
    expect((ops[0].row!.meta as Record<string, unknown>).factcheck_required).toBe(true)
  })

  it('approval that lands between read and update wins (0 rows updated → skipped)', async () => {
    existing = { id: 'wc-1', status: 'pending_review', hero_image_status: null }
    updateReturns = null
    const r = await saveGeneratedArticle({ generated, newsItemId: 'n1', writeMode: 'reviewable_only' })
    expect(r).toMatchObject({ status: null, skippedReason: 'left_pending_review_concurrently' })
  })

  it('new article is INSERTED (never upserted); a concurrent insert is reported, not overwritten', async () => {
    const r = await saveGeneratedArticle({ generated, newsItemId: 'n1', writeMode: 'reviewable_only' })
    expect(r).toMatchObject({ id: 'wc-new', status: 'pending_review' })
    expect(ops.map((o) => o.op)).toEqual(['insert'])
    ops = []; insertError = { code: '23505', message: 'duplicate key' }
    const r2 = await saveGeneratedArticle({ generated, newsItemId: 'n1', writeMode: 'reviewable_only' })
    expect(r2).toMatchObject({ id: null, skippedReason: 'concurrent_insert' })
  })

  it('default mode keeps the existing upsert behaviour', async () => {
    existing = { id: 'wc-1', status: 'published', hero_image_status: null }
    const r = await saveGeneratedArticle({ generated, newsItemId: 'n1' })
    expect(r).toMatchObject({ id: 'wc-up', status: 'pending_review' })
    expect(ops.map((o) => o.op)).toEqual(['upsert'])
  })
})
