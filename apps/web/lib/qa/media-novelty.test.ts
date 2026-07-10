import { describe, expect, it, vi } from 'vitest'
import {
  buildDeterministicNoveltyFields,
  canonicalizeUrl,
  candidateIdempotencyIdentity,
  candidateIdempotencyKey,
  createEventFingerprint,
  persistCandidateWithNoveltyReview,
  reviewCandidateNovelty,
  validateNoveltyVerdict,
} from '@/lib/media/novelty'

function makePrior(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'prior-1',
    project_id: 'prompt',
    title: 'OpenAI releases GPT-5 for developers',
    summary: 'OpenAI released GPT-5 with a new coding benchmark.',
    key_insight: 'Developers get a stronger coding model.',
    url: 'https://openai.com/news/gpt-5',
    source_name: 'OpenAI',
    status: 'scripted',
    novelty_verdict: 'new',
    novelty_reasoning: 'Previously approved.',
    created_at: '2026-07-06T08:00:00Z',
  }
  const deterministic = buildDeterministicNoveltyFields(base)
  return { ...base, ...deterministic, ...overrides }
}

function makeEvidenceDb(items: unknown[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = []
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          in: () => ({
            order: () => ({
              limit: async () => {
                calls.push({ table, op: 'evidence', payload: value })
                return { data: items, error: null }
              },
            }),
          }),
        }),
        order: () => ({ limit: async () => ({ data: items, error: null }) }),
      }),
    }),
    calls,
  }
  return db as any
}

function makePersistDb(existingItems: unknown[] = [], options: {
  missingAgent?: boolean
  runInsertError?: boolean
  runInsertErrorOnce?: boolean
  finalUpdateErrorOnce?: boolean
} = {}) {
  const rows: Record<string, any>[] = []
  const updates: Array<{ table: string; patch: Record<string, any> }> = []
  const runs: Record<string, any> = {}
  let runCounter = 0
  let claimCounter = 0
  let shouldFailRunInsert = options.runInsertError === true || options.runInsertErrorOnce === true
  let shouldFailFinalUpdate = options.finalUpdateErrorOnce === true

  function intakeResult(row: Record<string, any>, acquired: boolean) {
    return {
      news_item_id: row.id,
      status: row.status,
      novelty_claim_id: row.novelty_claim_id ?? null,
      novelty_claim_acquired: acquired,
      novelty_verdict: row.novelty_verdict ?? null,
      novelty_confidence: row.novelty_confidence ?? null,
      novelty_matched_item_ids: row.novelty_matched_item_ids ?? [],
      novelty_reasoning: row.novelty_reasoning ?? null,
      novelty_new_facts: row.novelty_new_facts ?? [],
      novelty_policy_outcome: row.novelty_policy_outcome ?? null,
      novelty_workflow_run_id: row.novelty_workflow_run_id ?? null,
    }
  }

  function updateBuilder(table: string, payload: Record<string, any>) {
    const filters: Record<string, any> = {}
    const builder: any = {
      eq: (field: string, value: unknown) => {
        filters[field] = value
        return builder
      },
      select: () => builder,
      single: async () => ({ data: rows.find(row => row.id === filters.id) ?? null, error: null }),
      maybeSingle: async () => ({ data: rows.find(row => row.id === filters.id) ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => {
        const result = (() => {
          updates.push({ table, patch: payload })
          if (table === 'media_news_items') {
            if (shouldFailFinalUpdate && payload.status) {
              shouldFailFinalUpdate = false
              return { data: null, error: { message: 'final update down' } }
            }
            const row = rows.find(candidate =>
              (!filters.id || candidate.id === filters.id)
              && (!filters.novelty_claim_id || candidate.novelty_claim_id === filters.novelty_claim_id)
            )
            if (row) Object.assign(row, payload)
          }
          if (table === 'runs') {
            const run = runs[String(filters.id)]
            if (run) Object.assign(run, payload)
          }
          return { data: null, error: null }
        })()
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return builder
  }

  const db = {
    rpc: async (name: string, args: Record<string, any>) => {
      if (name !== 'claim_media_news_candidate') return { data: null, error: { message: `unknown rpc ${name}` } }
      let row = rows.find(candidate => candidate.candidate_idempotency_key === args.p_candidate_idempotency_key)
      let acquired = false
      if (!row) {
        claimCounter += 1
        row = {
          id: 'news-1',
          project_id: args.p_project_id,
          run_id: args.p_run_id,
          title: args.p_title,
          summary: args.p_summary,
          url: args.p_url,
          source_name: args.p_source_name,
          status: 'pending_novelty_review',
          raw_output: args.p_raw_output,
          canonical_url: args.p_canonical_url,
          normalized_title: args.p_normalized_title,
          event_fingerprint: args.p_event_fingerprint,
          candidate_idempotency_key: args.p_candidate_idempotency_key,
          candidate_identity: args.p_candidate_identity,
          candidate_source_id: args.p_candidate_source_id,
          candidate_published_at: args.p_candidate_published_at,
          novelty_claim_id: `claim-${claimCounter}`,
          novelty_claimed_at: new Date().toISOString(),
          novelty_matched_item_ids: [],
          novelty_new_facts: [],
        }
        rows.push(row)
        acquired = true
      } else if (row.status === 'pending_novelty_review' && !row.novelty_claim_id) {
        claimCounter += 1
        row.novelty_claim_id = `claim-${claimCounter}`
        row.novelty_claimed_at = new Date().toISOString()
        acquired = true
      }
      return { data: [intakeResult(row, acquired)], error: null }
    },
    from: (table: string) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options.missingAgent ? null : {
                    id: 'agent-1',
                    name: 'Editorial Duplicate & Freshness Reviewer',
                    model: 'claude-haiku-4-5-20251001',
                    system_prompt: 'seeded reviewer prompt',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'workflows') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'workflow-1', name: 'Editorial Duplicate Review' }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'runs') {
        return {
          select: () => ({
            eq: (_field: string, value: string) => ({
              maybeSingle: async () => ({ data: runs[value] ?? null, error: null }),
            }),
          }),
          insert: (payload: Record<string, any>) => ({
            select: () => ({
              single: async () => {
                if (shouldFailRunInsert) {
                  if (options.runInsertErrorOnce) shouldFailRunInsert = false
                  return { data: null, error: { message: 'run insert down' } }
                }
                runCounter += 1
                const id = `run-${runCounter}`
                runs[id] = { id, status: payload.status, context: payload.context }
                return { data: { id }, error: null }
              },
            }),
          }),
          update: (payload: Record<string, any>) => updateBuilder(table, payload),
        }
      }
      return {
        update: (payload: Record<string, any>) => updateBuilder(table, payload),
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => ({
                  neq: async () => ({ data: existingItems, error: null }),
                  then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
                    Promise.resolve({ data: existingItems, error: null }).then(resolve, reject),
                }),
              }),
            }),
          }),
        }),
      }
    },
    rows,
    updates,
    runs,
  }
  return db as any
}

describe('media novelty deterministic safeguards', () => {
  it('1. canonicalizes exact same URL', () => {
    expect(canonicalizeUrl('https://www.OpenAI.com/news/gpt-5/')).toBe('https://openai.com/news/gpt-5')
  })

  it('2. removes tracking parameters from the same URL', () => {
    expect(canonicalizeUrl('https://openai.com/news/gpt-5?utm_source=x&fbclid=y&a=1')).toBe('https://openai.com/news/gpt-5?a=1')
  })

  it('2a. builds a deterministic project-scoped idempotency key from canonical URL', () => {
    const left = candidateIdempotencyKey({
      project_id: 'project-a',
      title: 'OpenAI releases GPT-5',
      url: 'https://www.openai.com/news/gpt-5?utm_source=social',
    })
    const right = candidateIdempotencyKey({
      project_id: 'project-a',
      title: 'OpenAI releases GPT-5',
      url: 'https://openai.com/news/gpt-5',
    })
    const otherProject = candidateIdempotencyKey({
      project_id: 'project-b',
      title: 'OpenAI releases GPT-5',
      url: 'https://openai.com/news/gpt-5',
    })

    expect(left).toBe(right)
    expect(left).not.toBe(otherProject)
    expect(left).toMatch(/^media-candidate:v1:[a-f0-9]{64}$/)
  })

  it('2b. falls back to source item or title identity when a URL is unavailable', () => {
    expect(candidateIdempotencyIdentity({
      project_id: 'project-a',
      title: 'Newswire item',
      source_name: 'AI Wire',
      source_item_id: 'item-42',
    })).toBe('source-item:ai wire:item-42')

    expect(candidateIdempotencyIdentity({
      project_id: 'project-a',
      title: 'OpenAI releases GPT-5 for developers',
      source_name: 'AI Wire',
      source_published_at: '2026-07-08T10:00:00Z',
    })).toBe('fallback:ai wire:openai releases gpt-5 developers:2026-07-08T10:00:00Z')
  })

  it('3. blocks different URLs reporting the same event when the event fingerprint matches', async () => {
    const prior = makePrior({ url: 'https://theverge.com/openai-gpt5' })
    const db = makeEvidenceDb([prior])
    const candidate = {
      project_id: 'prompt',
      title: 'OpenAI releases GPT-5 for developers',
      summary: 'OpenAI released GPT-5 with a new coding benchmark.',
      key_insight: 'Developers get a stronger coding model.',
      url: 'https://techcrunch.com/openai-gpt5',
      ...buildDeterministicNoveltyFields({
        project_id: 'prompt',
        title: 'OpenAI releases GPT-5 for developers',
        summary: 'OpenAI released GPT-5 with a new coding benchmark.',
        key_insight: 'Developers get a stronger coding model.',
      }),
    }

    const verdict = await reviewCandidateNovelty(db, candidate)
    expect(verdict.verdict).toBe('duplicate')
    expect(verdict.matchedItemIds).toEqual(['prior-1'])
  })

  it('4. allows a similar topic but genuinely different event through model review', async () => {
    const db = makeEvidenceDb([makePrior()])
    const candidate = {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      key_insight: 'Admins can now track model spend.',
      url: 'https://anthropic.com/news/analytics',
      ...buildDeterministicNoveltyFields({
        project_id: 'prompt',
        title: 'Anthropic launches Claude analytics dashboard',
        summary: 'Anthropic introduced usage analytics for enterprise teams.',
        key_insight: 'Admins can now track model spend.',
      }),
    }
    const reviewer = vi.fn(async () => ({
      verdict: 'new',
      confidence: 0.91,
      matchedItemIds: [],
      reasoning: 'Different company, action, and central claim.',
    }))

    const verdict = await reviewCandidateNovelty(db, candidate, { reviewer })
    expect(verdict.verdict).toBe('new')
    expect(reviewer).toHaveBeenCalledOnce()
  })

  it('5. accepts a material update with new facts', () => {
    const verdict = validateNoveltyVerdict({
      verdict: 'material_update',
      confidence: 0.88,
      matchedItemIds: ['prior-1'],
      newFacts: ['GPT-5 pricing changed after launch.'],
      reasoning: 'Same launch, new pricing fact.',
    })
    expect(verdict?.verdict).toBe('material_update')
    if (verdict?.verdict === 'material_update') expect(verdict.newFacts).toHaveLength(1)
  })

  it('6. preserves uncertain model results as fail-closed', () => {
    expect(validateNoveltyVerdict({
      verdict: 'uncertain',
      confidence: 0.35,
      matchedItemIds: ['prior-1'],
      reasoning: 'Insufficient evidence to distinguish update from duplicate.',
    })?.verdict).toBe('uncertain')
  })

  it('7. rejects invalid model output', () => {
    expect(validateNoveltyVerdict({ verdict: 'new', confidence: 2, matchedItemIds: [], reasoning: 'bad' })).toBeNull()
    expect(validateNoveltyVerdict({ verdict: 'material_update', confidence: 0.8, matchedItemIds: [], reasoning: 'missing facts' })).toBeNull()
  })

  it('8. converts model/provider failure into uncertain', async () => {
    const db = makeEvidenceDb([])
    const candidate = {
      project_id: 'prompt',
      title: 'New AI event',
      summary: 'A new event happened.',
      url: 'https://example.com/new',
      ...buildDeterministicNoveltyFields({ project_id: 'prompt', title: 'New AI event', summary: 'A new event happened.' }),
    }
    const verdict = await reviewCandidateNovelty(db, candidate, { reviewer: async () => { throw new Error('provider down') } })
    expect(verdict).toMatchObject({ verdict: 'uncertain', confidence: 0 })
  })

  it('15. duplicate candidate creates no downstream production state', async () => {
    const db = makePersistDb([makePrior()])
    const result = await persistCandidateWithNoveltyReview(db, {
      project_id: 'prompt',
      title: 'OpenAI releases GPT-5 for developers',
      summary: 'OpenAI released GPT-5 with a new coding benchmark.',
      key_insight: 'Developers get a stronger coding model.',
      url: 'https://openai.com/news/gpt-5?utm_campaign=social',
    })
    expect(result.status).toBe('duplicate_blocked')
    expect(db.rows[0].status).toBe('pending_novelty_review')
    expect(db.updates.find((u: any) => u.table === 'media_news_items' && u.patch.status)?.patch.status).toBe('duplicate_blocked')
  })

  it('16. novelty-passed candidate still requires editorial approval', async () => {
    const db = makePersistDb([])
    const result = await persistCandidateWithNoveltyReview(db, {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      key_insight: 'Admins can now track model spend.',
      url: 'https://anthropic.com/news/analytics',
    }, {
      reviewer: async () => ({
        verdict: 'new',
        confidence: 0.92,
        matchedItemIds: [],
        reasoning: 'No matching same-project event.',
      }),
    })

    expect(result.status).toBe('novelty_passed')
    expect(db.rows[0].status).toBe('pending_novelty_review')
    const newsUpdate = db.updates.find((u: any) => u.table === 'media_news_items' && u.patch.status)?.patch
    expect(newsUpdate.status).toBe('pending_editorial_review')
    expect(newsUpdate.novelty_policy_outcome).toBe('novelty_passed')
    expect(newsUpdate.novelty_workflow_run_id).toBe('run-1')
  })

  it('16a. retrying the same completed candidate returns one news row and creates no second run', async () => {
    const db = makePersistDb([])
    const reviewer = vi.fn(async () => ({
      verdict: 'new',
      confidence: 0.92,
      matchedItemIds: [],
      reasoning: 'No matching same-project event.',
    }))
    const input = {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      key_insight: 'Admins can now track model spend.',
      url: 'https://anthropic.com/news/analytics',
    }

    const first = await persistCandidateWithNoveltyReview(db, input, { reviewer })
    const second = await persistCandidateWithNoveltyReview(db, input, { reviewer })

    expect(first.newsItemId).toBe('news-1')
    expect(second.newsItemId).toBe('news-1')
    expect(db.rows).toHaveLength(1)
    expect(Object.keys(db.runs)).toHaveLength(1)
    expect(reviewer).toHaveBeenCalledOnce()
  })

  it('16b. retry after run creation failure resumes the same candidate row', async () => {
    const db = makePersistDb([], { runInsertErrorOnce: true })
    const input = {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      url: 'https://anthropic.com/news/analytics',
    }

    await expect(persistCandidateWithNoveltyReview(db, input, {
      reviewer: async () => ({ verdict: 'new', confidence: 0.92, matchedItemIds: [], reasoning: 'No match.' }),
    })).rejects.toThrow(/novelty run insert failed/)

    const retry = await persistCandidateWithNoveltyReview(db, input, {
      reviewer: async () => ({ verdict: 'new', confidence: 0.92, matchedItemIds: [], reasoning: 'No match.' }),
    })

    expect(retry.newsItemId).toBe('news-1')
    expect(db.rows).toHaveLength(1)
    expect(retry.status).toBe('novelty_passed')
  })

  it('16c. retry after reviewer failure creates an auditable second attempt on the same candidate', async () => {
    const db = makePersistDb([])
    const input = {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      url: 'https://anthropic.com/news/analytics',
    }

    await expect(persistCandidateWithNoveltyReview(db, input, {
      reviewer: async () => { throw new Error('provider down') },
    })).rejects.toThrow(/provider down/)

    const retry = await persistCandidateWithNoveltyReview(db, input, {
      reviewer: async () => ({ verdict: 'new', confidence: 0.92, matchedItemIds: [], reasoning: 'No match.' }),
    })

    expect(retry.newsItemId).toBe('news-1')
    expect(db.rows).toHaveLength(1)
    expect(Object.keys(db.runs)).toEqual(['run-1', 'run-2'])
    expect(db.runs['run-1'].status).toBe('failed')
    expect(db.runs['run-2'].status).toBe('done')
  })

  it('16d. retry after final result persistence failure replays the completed run without another model call', async () => {
    const db = makePersistDb([], { finalUpdateErrorOnce: true })
    const reviewer = vi.fn(async () => ({
      verdict: 'new',
      confidence: 0.92,
      matchedItemIds: [],
      reasoning: 'No matching same-project event.',
    }))
    const input = {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      url: 'https://anthropic.com/news/analytics',
    }

    await expect(persistCandidateWithNoveltyReview(db, input, { reviewer })).rejects.toThrow(/final update down/)
    const retry = await persistCandidateWithNoveltyReview(db, input, { reviewer })

    expect(retry.newsItemId).toBe('news-1')
    expect(retry.status).toBe('novelty_passed')
    expect(db.rows).toHaveLength(1)
    expect(Object.keys(db.runs)).toHaveLength(1)
    expect(reviewer).toHaveBeenCalledOnce()
  })

  it('18. cannot persist novelty_passed without the seeded durable reviewer agent', async () => {
    const db = makePersistDb([], { missingAgent: true })
    await expect(persistCandidateWithNoveltyReview(db, {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      url: 'https://anthropic.com/news/analytics',
    }, {
      reviewer: async () => ({ verdict: 'new', confidence: 0.92, matchedItemIds: [], reasoning: 'No match.' }),
    })).rejects.toThrow(/Seeded agent not found/)
    expect(db.updates.find((u: any) => u.table === 'media_news_items' && u.patch.status)).toBeUndefined()
  })

  it('19. cannot persist novelty_passed when durable run creation fails', async () => {
    const db = makePersistDb([], { runInsertError: true })
    await expect(persistCandidateWithNoveltyReview(db, {
      project_id: 'prompt',
      title: 'Anthropic launches Claude analytics dashboard',
      summary: 'Anthropic introduced usage analytics for enterprise teams.',
      url: 'https://anthropic.com/news/analytics',
    }, {
      reviewer: async () => ({ verdict: 'new', confidence: 0.92, matchedItemIds: [], reasoning: 'No match.' }),
    })).rejects.toThrow(/novelty run insert failed/)
    expect(db.updates.find((u: any) => u.table === 'media_news_items' && u.patch.status)).toBeUndefined()
  })

  it('17. keeps project isolation in evidence lookups', async () => {
    const db = makeEvidenceDb([])
    const fingerprint = createEventFingerprint({
      title: 'OpenAI releases GPT-5',
      summary: 'OpenAI released GPT-5.',
    })
    const candidate = {
      project_id: 'prompt-project',
      title: 'OpenAI releases GPT-5',
      summary: 'OpenAI released GPT-5.',
      url: 'https://openai.com/gpt-5',
      canonical_url: 'https://openai.com/gpt-5',
      normalized_title: 'openai releases gpt-5',
      event_fingerprint: fingerprint,
    }
    await reviewCandidateNovelty(db, candidate, {
      reviewer: async () => ({ verdict: 'new', confidence: 0.9, matchedItemIds: [], reasoning: 'No same-project evidence.' }),
    })
    expect(db.calls[0]).toMatchObject({ table: 'media_news_items', payload: 'prompt-project' })
  })
})