import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDeterministicNoveltyFields, candidateIdempotencyIdentity, candidateIdempotencyKey } from '@/lib/media/novelty'

const mocks = vi.hoisted(() => ({
  currentDb: null as any,
  runNewsHunter: vi.fn(),
  logRun: vi.fn(),
  anthropicCreate: vi.fn(),
  callHermesTrends: vi.fn(),
  callHermesScrape: vi.fn(),
  callHermesRead: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mocks.currentDb,
}))

vi.mock('@/lib/media/news-hunter', () => ({
  runNewsHunter: mocks.runNewsHunter,
}))

vi.mock('@/lib/media/run-log', () => ({
  logRun: mocks.logRun,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: vi.fn(() => ({
    messages: { create: mocks.anthropicCreate },
  })),
}))

vi.mock('@/lib/media/hermes', () => ({
  callHermesScrape: mocks.callHermesScrape,
  callHermesRead: mocks.callHermesRead,
  callHermesTrends: mocks.callHermesTrends,
  callHermesCompetitors: vi.fn(),
  isHermesConfigured: () => false,
}))

vi.mock('@/lib/media/quality', () => ({
  scoreScript: vi.fn(async () => ({ overall: 9, hook_strength: 9, passed: true, verdict: 'pass', weak_spots: [] })),
  shouldRegenerate: vi.fn(() => false),
}))

vi.mock('@/lib/media/script-prompt', () => ({
  NEWS_SYSTEM: 'news-system',
  buildScriptSystem: () => 'script-system',
}))

vi.mock('@/lib/cost/track', () => ({
  logLlmCost: vi.fn(),
}))

vi.mock('@/lib/atlas/content-tags', () => ({
  classifyTopic: () => 'ai-news',
}))

import { GET as newsCronGET } from '@/app/api/media/news/cron/route'
import { GET as step1GET } from '@/app/api/media/cron/step1/route'

function makeCandidate(url = 'https://techcrunch.com/old-story') {
  return {
    rank: 1,
    story: {
      title: 'Old story resurfaced',
      url,
      summary: 'A previously covered story is trending again.',
      source: 'rss_techcrunch',
      sourceLabel: 'TechCrunch AI',
      publishedAt: new Date('2026-07-06T06:00:00Z'),
      engagementScore: 0,
      authorityWeight: 0.8,
      viralityScore: 82,
    },
    editorialNote: 'Good but already persisted.',
    suggestedAngle: 'educational',
    estimatedViralityScore: 82,
  }
}

function makeHunterResult(url?: string) {
  return {
    fetchedAt: '2026-07-06T06:30:00Z',
    totalFetched: 1,
    afterDedup: 1,
    candidates: [makeCandidate(url)],
    claudeSummary: 'One candidate.',
  }
}

function makePrior(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'prior-1',
    project_id: 'project-1',
    title: 'Old story resurfaced',
    summary: 'A previously covered story is trending again.',
    key_insight: 'Good but already persisted.',
    url: 'https://techcrunch.com/old-story',
    source_name: 'TechCrunch AI',
    status: 'scripted',
    novelty_verdict: 'new',
    novelty_reasoning: 'Previously approved.',
    created_at: '2026-07-05T08:00:00Z',
  }
  return { ...base, ...buildDeterministicNoveltyFields(base), ...overrides }
}

/**
 * Route-level fake database that models the atomic candidate-intake RPC
 * (`claim_media_news_candidate`) plus the durable novelty-review tables
 * (agents / workflows / runs) and evidence lookups the reviewer performs.
 */
function makeRouteDb(opts: {
  priors?: Array<Record<string, any>>
  rpcError?: { message: string }
  seedRows?: Array<Record<string, any>>
  projectRows?: Array<Record<string, any>>
} = {}) {
  const rows: Record<string, any>[] = [...(opts.seedRows ?? [])]
  const priors = opts.priors ?? []
  const updates: Array<{ table: string; patch: Record<string, any> }> = []
  const inserts: Record<string, unknown[]> = {}
  const runs: Record<string, any> = {}
  let runCounter = 0
  let claimCounter = 0
  let newsCounter = rows.length
  const projectRows = opts.projectRows ?? [{ id: 'project-1', name: 'The Prompt', slug: 'ai-media-automation' }]

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
      in: (field: string, values: unknown[]) => {
        filters[`${field}:in`] = values
        return builder
      },
      select: () => builder,
      single: async () => ({ data: rows.find(row => row.id === filters.id) ?? null, error: null }),
      maybeSingle: async () => ({ data: rows.find(row => row.id === filters.id) ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => {
        const result = (() => {
          updates.push({ table, patch: payload })
          if (table === 'media_news_items') {
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

  function evidenceBuilder() {
    const filters: Record<string, any> = {}
    const finish = async () => {
      const source = [...priors, ...rows]
      const data = source.filter(item =>
        (!filters.project_id || item.project_id === filters.project_id)
        && (!filters.statuses || filters.statuses.includes(item.status))
        && (!filters.excludeId || item.id !== filters.excludeId))
      return { data, error: null }
    }
    const chain: any = {
      eq: (field: string, value: unknown) => {
        filters[field] = value
        return chain
      },
      in: (_field: string, values: string[]) => {
        filters.statuses = values
        return chain
      },
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      neq: (_field: string, value: string) => {
        filters.excludeId = value
        return chain
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
        finish().then(resolve, reject),
    }
    return chain
  }

  function projectsBuilder() {
    const chain: any = {
      eq: () => chain,
      limit: () => chain,
      single: async () => ({ data: projectRows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: projectRows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: projectRows, error: null }).then(resolve),
    }
    return chain
  }

  function insertBuilder(table: string, payload: unknown) {
    ;(inserts[table] ??= []).push(payload)
    const chain: any = {
      select: () => chain,
      single: async () => ({ data: { id: `${table}-1` }, error: null }),
    }
    return chain
  }

  const db = {
    rpc: async (name: string, args: Record<string, any>) => {
      if (opts.rpcError) return { data: null, error: opts.rpcError }
      if (name !== 'claim_media_news_candidate') return { data: null, error: { message: `unknown rpc ${name}` } }
      let row = rows.find(candidate => candidate.candidate_idempotency_key === args.p_candidate_idempotency_key)
      let acquired = false
      if (!row) {
        claimCounter += 1
        newsCounter += 1
        row = {
          id: `news-${newsCounter}`,
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
      if (table === 'projects') {
        return { select: () => projectsBuilder() }
      }
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
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
      if (table === 'media_news_items') {
        return {
          select: () => evidenceBuilder(),
          insert: (payload: unknown) => insertBuilder(table, payload),
          update: (payload: Record<string, any>) => updateBuilder(table, payload),
        }
      }
      return {
        select: () => evidenceBuilder(),
        insert: (payload: unknown) => insertBuilder(table, payload),
        update: (payload: Record<string, any>) => updateBuilder(table, payload),
      }
    },
    rows,
    updates,
    inserts,
    runs,
  }
  return db as any
}

function cronRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer test-secret' },
  })
}

function newVerdictResponse(confidence = 0.9) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        verdict: 'new',
        confidence,
        matchedItemIds: [],
        reasoning: 'Genuinely different event from all prior items.',
      }),
    }],
  }
}

describe('News Hunter persistence contract', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    mocks.runNewsHunter.mockReset()
    mocks.logRun.mockReset()
    mocks.anthropicCreate.mockReset()
    mocks.callHermesTrends.mockReset()
    mocks.callHermesScrape.mockReset()
    mocks.callHermesRead.mockReset()
    mocks.logRun.mockResolvedValue('run-log-1')
    mocks.callHermesTrends.mockResolvedValue(null)
    mocks.runNewsHunter.mockResolvedValue(makeHunterResult())
  })

  it('news cron blocks a deterministic duplicate (tracking params stripped) through the intake RPC and records it durably', async () => {
    // Same story, but the hunter saw it behind tracking parameters.
    mocks.runNewsHunter.mockResolvedValue(makeHunterResult('https://techcrunch.com/old-story?utm_campaign=social&utm_source=x'))
    const db = makeRouteDb({ priors: [makePrior()] })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.projects).toHaveLength(1)
    expect(json.projects[0]).toMatchObject({ status: 'duplicate_blocked' })
    expect(json.projects[0].verdict).toMatchObject({ verdict: 'duplicate' })
    // The candidate row exists as an auditable duplicate_blocked record — the
    // exact-intake row is reused, never a second active row for the same URL.
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0].status).toBe('duplicate_blocked')
    expect(db.rows[0].novelty_workflow_run_id).toBe('run-1')
    expect(db.runs['run-1'].status).toBe('done')
    // Deterministic duplicate: no model call, no script work.
    expect(mocks.anthropicCreate).not.toHaveBeenCalled()
    expect(db.inserts.media_scripts ?? []).toHaveLength(0)
    expect(mocks.logRun).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'Fetch AI News',
      status: 'done',
      context: { storiesSaved: 0 },
    }))
  })

  it('news cron exposes intake RPC failures as endpoint failures with no model or script work', async () => {
    const db = makeRouteDb({ rpcError: { message: 'database write failed' } })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(500)
    const json = await res.json()

    expect(json.projects[0]).toMatchObject({ status: 'error' })
    expect(String(json.projects[0].error)).toContain('database write failed')
    // Fail-closed: intake failure means no candidate row, no review run,
    // no model call, and no script insert.
    expect(db.rows).toHaveLength(0)
    expect(Object.keys(db.runs)).toHaveLength(0)
    expect(mocks.anthropicCreate).not.toHaveBeenCalled()
    expect(db.inserts.media_scripts ?? []).toHaveLength(0)
    expect(mocks.logRun).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'Fetch AI News',
      status: 'failed',
      context: { storiesSaved: 0 },
    }))
  })

  it('step1 treats duplicate-only candidates as no-work and does not create a script', async () => {
    const db = makeRouteDb({ priors: [makePrior()] })
    mocks.currentDb = db

    const res = await step1GET(cronRequest('/api/media/cron/step1'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json).toMatchObject({
      status: 'duplicate_existing_story',
      duplicateCount: 1,
    })
    expect(db.inserts.media_scripts ?? []).toHaveLength(0)
    expect(mocks.anthropicCreate).not.toHaveBeenCalled()
  })

  it('news cron persists a newly claimed candidate through durable review into pending_editorial_review', async () => {
    mocks.anthropicCreate.mockResolvedValue(newVerdictResponse(0.9))
    const db = makeRouteDb()
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.projects[0]).toMatchObject({
      status: 'awaiting_editorial_review',
      newsItemId: 'news-1',
    })
    expect(db.rows).toHaveLength(1)
    // Editorial authority preserved: novelty pass lands in
    // pending_editorial_review, never approved.
    expect(db.rows[0].status).toBe('pending_editorial_review')
    expect(db.rows[0].novelty_policy_outcome).toBe('novelty_passed')
    expect(db.rows[0].novelty_workflow_run_id).toBe('run-1')
    expect(db.runs['run-1'].status).toBe('done')
    expect(mocks.logRun).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'Fetch AI News',
      status: 'done',
      context: { storiesSaved: 1 },
    }))
  })

  it('news cron retry of the same candidate reuses the completed row without a second run or model call', async () => {
    mocks.anthropicCreate.mockResolvedValue(newVerdictResponse(0.9))
    const db = makeRouteDb()
    mocks.currentDb = db

    const first = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(first.status).toBe(200)
    const second = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(second.status).toBe(200)
    const json = await second.json()

    expect(json.projects[0]).toMatchObject({
      status: 'awaiting_editorial_review',
      newsItemId: 'news-1',
    })
    expect(db.rows).toHaveLength(1)
    expect(Object.keys(db.runs)).toHaveLength(1)
    expect(mocks.anthropicCreate).toHaveBeenCalledTimes(1)
  })

  it('news cron claims an existing pending candidate row instead of creating a second row', async () => {
    mocks.anthropicCreate.mockResolvedValue(newVerdictResponse(0.9))
    const candidate = makeCandidate()
    const candidateInput = {
      project_id: 'project-1',
      title: candidate.story.title,
      summary: candidate.story.summary,
      url: candidate.story.url,
      source_name: candidate.story.sourceLabel,
      key_insight: candidate.editorialNote,
    }
    const pendingRow = {
      id: 'news-0',
      project_id: 'project-1',
      title: candidate.story.title,
      summary: candidate.story.summary,
      url: candidate.story.url,
      status: 'pending_novelty_review',
      candidate_idempotency_key: candidateIdempotencyKey(candidateInput),
      candidate_identity: candidateIdempotencyIdentity(candidateInput),
      novelty_claim_id: null,
      novelty_matched_item_ids: [],
      novelty_new_facts: [],
      ...buildDeterministicNoveltyFields(candidateInput),
    }
    const db = makeRouteDb({ seedRows: [pendingRow] })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.projects[0]).toMatchObject({
      status: 'awaiting_editorial_review',
      newsItemId: 'news-0',
    })
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0].status).toBe('pending_editorial_review')
  })

  it('news cron retry after a failed review attempt reuses the candidate and keeps the failed run as audit history', async () => {
    mocks.anthropicCreate
      .mockRejectedValueOnce(new Error('model down'))
      .mockResolvedValue(newVerdictResponse(0.9))
    const db = makeRouteDb()
    mocks.currentDb = db

    const first = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(first.status).toBe(500)
    const firstJson = await first.json()
    expect(firstJson.projects[0]).toMatchObject({ status: 'error' })
    expect(db.rows).toHaveLength(1)
    expect(db.runs['run-1'].status).toBe('failed')

    const second = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(second.status).toBe(200)
    const json = await second.json()

    expect(json.projects[0]).toMatchObject({
      status: 'awaiting_editorial_review',
      newsItemId: 'news-1',
    })
    // Same candidate row; a second, auditable run completed the review.
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0].status).toBe('pending_editorial_review')
    expect(Object.keys(db.runs)).toHaveLength(2)
    expect(db.runs['run-2'].status).toBe('done')
  })

  it('news cron keeps novelty evidence project-scoped: a same-event prior in another project does not block', async () => {
    mocks.anthropicCreate.mockResolvedValue(newVerdictResponse(0.85))
    const db = makeRouteDb({ priors: [makePrior({ project_id: 'other-project' })] })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.projects[0]).toMatchObject({ status: 'awaiting_editorial_review' })
    expect(db.rows[0].status).toBe('pending_editorial_review')
    // The model reviewer ran because no same-project deterministic match existed.
    expect(mocks.anthropicCreate).toHaveBeenCalledTimes(1)
  })

  it('news cron passes a genuinely different candidate through model review', async () => {
    mocks.anthropicCreate.mockResolvedValue(newVerdictResponse(0.91))
    mocks.runNewsHunter.mockResolvedValue({
      ...makeHunterResult('https://anthropic.com/news/analytics'),
      candidates: [{
        ...makeCandidate('https://anthropic.com/news/analytics'),
        story: {
          ...makeCandidate('https://anthropic.com/news/analytics').story,
          title: 'Anthropic launches Claude analytics dashboard',
          summary: 'Anthropic introduced usage analytics for enterprise teams.',
        },
      }],
    })
    const db = makeRouteDb({ priors: [makePrior()] })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.projects[0]).toMatchObject({ status: 'awaiting_editorial_review' })
    expect(db.rows[0].status).toBe('pending_editorial_review')
    expect(db.rows[0].novelty_verdict).toBe('new')
    expect(mocks.anthropicCreate).toHaveBeenCalledTimes(1)
  })
})
