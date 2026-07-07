import { beforeEach, describe, expect, it, vi } from 'vitest'

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

type DbResult = { data: any; error: any }

function duplicateUrlError() {
  return {
    code: '23505',
    message: 'duplicate key value violates unique constraint "unique_project_news_url"',
    details: 'Key (project_id, url) already exists.',
  }
}

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

function makeHunterResult() {
  return {
    fetchedAt: '2026-07-06T06:30:00Z',
    totalFetched: 1,
    afterDedup: 1,
    candidates: [makeCandidate()],
    claudeSummary: 'One duplicate candidate.',
  }
}

function makeDb(opts: {
  mediaNewsInsertResults: DbResult[]
  projectRows?: Array<Record<string, unknown>>
}) {
  const inserts: Record<string, unknown[]> = {}
  const projectRows = opts.projectRows ?? [{ id: 'project-1', name: 'The Prompt', slug: 'ai-media-automation' }]

  function selectBuilder(table: string) {
    const chain: any = {
      eq: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: table === 'projects' ? projectRows[0] : null, error: null }),
      then: (resolve: (value: DbResult) => void) => {
        if (table === 'projects') return Promise.resolve({ data: projectRows, error: null }).then(resolve)
        return Promise.resolve({ data: [], error: null }).then(resolve)
      },
    }
    return chain
  }

  function insertBuilder(table: string, payload: unknown) {
    ;(inserts[table] ??= []).push(payload)
    const chain: any = {
      select: () => chain,
      single: async () => {
        if (table === 'media_news_items') {
          return opts.mediaNewsInsertResults.shift() ?? { data: { id: 'news-1' }, error: null }
        }
        if (table === 'media_scripts') return { data: { id: 'script-1' }, error: null }
        return { data: { id: `${table}-1` }, error: null }
      },
    }
    return chain
  }

  return {
    from: (table: string) => ({
      select: () => selectBuilder(table),
      insert: (payload: unknown) => insertBuilder(table, payload),
      update: (payload: unknown) => ({
        eq: async () => {
          ;(inserts[`${table}:updates`] ??= []).push(payload)
          return { data: null, error: null }
        },
      }),
    }),
    inserts,
  }
}

function cronRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer test-secret' },
  })
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
    mocks.logRun.mockResolvedValue('run-1')
    mocks.callHermesTrends.mockResolvedValue(null)
    mocks.runNewsHunter.mockResolvedValue(makeHunterResult())
  })

  it('news cron reports duplicate/no-work instead of saved when media_news_items insert hits the URL constraint', async () => {
    const db = makeDb({ mediaNewsInsertResults: [{ data: null, error: duplicateUrlError() }] })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.projects).toHaveLength(1)
    expect(json.projects[0]).toMatchObject({
      status: 'duplicate_existing_story',
      reason: 'duplicate_url',
    })
    expect(json.projects[0].newsItemId).toBeUndefined()
    expect(mocks.logRun).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'Fetch AI News',
      status: 'done',
      context: { storiesSaved: 0 },
    }))
  })

  it('news cron exposes non-duplicate persistence failures as endpoint failures', async () => {
    const db = makeDb({
      mediaNewsInsertResults: [{ data: null, error: { code: 'XX000', message: 'database write failed' } }],
    })
    mocks.currentDb = db

    const res = await newsCronGET(cronRequest('/api/media/news/cron'))
    expect(res.status).toBe(500)
    const json = await res.json()

    expect(json.projects[0]).toMatchObject({
      status: 'error',
      error: 'database write failed',
    })
    expect(mocks.logRun).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'Fetch AI News',
      status: 'failed',
      context: { storiesSaved: 0 },
    }))
  })

  it('step1 treats duplicate-only candidates as no-work and does not create a script with news_item_id null', async () => {
    const db = makeDb({ mediaNewsInsertResults: [{ data: null, error: duplicateUrlError() }] })
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
})
