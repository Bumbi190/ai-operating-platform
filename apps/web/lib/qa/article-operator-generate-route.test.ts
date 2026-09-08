/**
 * Tests for POST /api/content/articles/operator-generate.
 *
 * Verifies the operator wrapper:
 *   • Requires a Supabase session (mirrors /review's auth posture)
 *   • Resolves the news_item from media_news_items via news_item_id
 *   • Delegates to the SAME generateArticle + saveGeneratedArticle library
 *     functions that the cron path uses — no parallel pipeline
 *   • Stamps generated_by with `atlas:<operator>` so Atlas reporting can
 *     distinguish operator-triggered articles from cron-triggered ones
 *   • Returns { id, external_id, status, qa, meta } on success
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { SYSTEM_A_PROJECT_SLUG as REAL_DESTINATION_SLUG } from '@/lib/article/store'

let mockUser: { id?: string; email?: string } | null = null
let mockNewsRow: Record<string, unknown> | null = null
let mockNewsError: { message: string } | null = null
let generateThrows: Error | null = null
let saveThrows: Error | null = null
let capturedSave: Record<string, unknown> | null = null
let capturedGenerateInput: { newsItem: unknown; opts: unknown } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
  }),
}))

/**
 * Phase 9H — the route now proves the news item belongs to the caller BEFORE
 * spending anything, so the admin mock has to serve two tables and, crucially,
 * APPLY the project filter. A mock that ignored `.in('project_id', …)` would
 * let every ownership test pass against an unguarded route.
 */
let mockOwnedProjectIds: string[] = []
/** The System A destination as the database holds it. */
let mockDestinationSlug: string = REAL_DESTINATION_SLUG
/** null = the destination project row does not exist at all. */
let mockDestinationProjectId: string | null = 'p-dest'
/** Every predicate set the route used to look the destination up. */
let destinationLookups: Record<string, unknown>[] = []
/** Every predicate the route issued against media_news_items, in order. */
let newsFilters: [string, unknown][] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'projects') {
        // Two different shapes hit this table:
        //   getAllowedProjectIds : select('id').eq('owner_id', uid)          → awaited
        //   destination lookup   : select('id').eq('slug', s).in('id', …).maybeSingle()
        // The builder serves both and APPLIES the destination predicates —
        // a mock that ignored them would let the destination tests pass
        // against a route with no destination guard at all.
        const preds: Record<string, unknown> = {}
        const b: any = {
          select: () => b,
          eq: (col: string, val: unknown) => { preds[col] = val; return b },
          in: (col: string, vals: unknown[]) => { preds[col] = vals; return b },
          maybeSingle: async () => {
            destinationLookups.push({ ...preds })
            const slugOk = preds.slug === mockDestinationSlug
            const ids = (preds.id as string[]) ?? []
            const idOk = mockDestinationProjectId !== null && ids.includes(mockDestinationProjectId)
            return { data: slugOk && idOk ? { id: mockDestinationProjectId } : null, error: null }
          },
          then: (ok: any) =>
            Promise.resolve({ data: mockOwnedProjectIds.map(id => ({ id })), error: null }).then(ok),
        }
        return b
      }
      if (table !== 'media_news_items') throw new Error(`unexpected table: ${table}`)
      const filters: [string, unknown][] = newsFilters
      const builder: any = {
        select: () => builder,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return builder },
        in: (c: string, v: unknown[]) => { filters.push([c, v]); return builder },
        maybeSingle: async () => {
          if (mockNewsError) return { data: null, error: mockNewsError }
          if (!mockNewsRow) return { data: null, error: null }
          // Apply every recorded predicate, exactly as PostgREST would.
          const passes = filters.every(([col, val]) =>
            Array.isArray(val)
              ? val.includes((mockNewsRow as Record<string, unknown>)[col] as never)
              : (mockNewsRow as Record<string, unknown>)[col] === val)
          return { data: passes ? mockNewsRow : null, error: null }
        },
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/article', () => ({
  generateArticle: async (newsItem: unknown, opts: unknown) => {
    capturedGenerateInput = { newsItem, opts }
    if (generateThrows) throw generateThrows
    return {
      draft: {
        title: 'Generated Article',
        summary: 'A summary.',
        body: 'Body.',
        category: 'news',
        tags: [],
        hero_image_prompt: null,
        source_url: null,
        source_name: 'Wired AI',
        _meta: { model: 'claude-sonnet-4-6', estCostUsd: 0.012 },
      },
      qa: { pass: true, issues: [], confidence: 'high' },
      payload: { external_id: 'omnira_news-1', title: 'Generated Article' },
    }
  },
}))

vi.mock('@/lib/article/store', async (importOriginal) => {
  // The destination slug comes from the REAL module, not a literal invented
  // here: the route must authorise the same project the writer writes to, and a
  // test that hard-coded the value would keep passing if the constant moved.
  const actual = await importOriginal<typeof import('@/lib/article/store')>()
  return {
    SYSTEM_A_PROJECT_SLUG: actual.SYSTEM_A_PROJECT_SLUG,
    saveGeneratedArticle: async (args: Record<string, unknown>) => {
      capturedSave = args
      if (saveThrows) throw saveThrows
      return { id: 'row-uuid', externalId: 'omnira_news-1', status: 'pending_review' as const }
    },
  }
})

import { POST } from '@/app/api/content/articles/operator-generate/route'

const NEWS_ITEM_ID = '7712219e-259a-43ce-ac51-5bdae071ebf1'

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/content/articles/operator-generate', () => {
  beforeEach(() => {
    mockUser = null
    mockNewsRow = null
    mockNewsError = null
    generateThrows = null
    saveThrows = null
    capturedSave = null
    capturedGenerateInput = null
    // Default for the pre-existing tests: the caller owns BOTH the news item's
    // project and the System A destination, so every path below behaves exactly
    // as it did before Phase 9J.
    mockOwnedProjectIds = ['p-mine', 'p-dest']
    mockDestinationSlug = REAL_DESTINATION_SLUG
    mockDestinationProjectId = 'p-dest'
    destinationLookups = []
  })

  it('401 when no session', async () => {
    mockUser = null
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'standard' }))
    expect(res.status).toBe(401)
    expect(capturedGenerateInput).toBeNull()
    expect(capturedSave).toBeNull()
  })

  it('400 when news_item_id is missing', async () => {
    mockUser = { id: 'op-1', email: 'op@example.com' }
    const res = await POST(jsonPost({ tier: 'standard' }))
    expect(res.status).toBe(400)
    expect(capturedGenerateInput).toBeNull()
  })

  it('404 when news_item is not in media_news_items', async () => {
    mockUser = { id: 'op-1', email: 'op@example.com' }
    mockNewsRow = null
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'standard' }))
    expect(res.status).toBe(404)
    expect(capturedGenerateInput).toBeNull()
  })

  it('happy path: delegates to generateArticle+saveGeneratedArticle and returns ids', async () => {
    mockUser = { id: 'op-1', email: 'andre@example.com' }
    mockNewsRow = { project_id: 'p-mine',
      id: NEWS_ITEM_ID,
      title: 'Anthropic Files Confidential IPO',
      summary: 'Summary.',
      key_insight: null,
      url: 'https://wired.com/x',
      source_name: 'Wired AI',
      content_angle: null,
    }
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'deep' }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json).toMatchObject({
      ok: true,
      id: 'row-uuid',
      external_id: 'omnira_news-1',
      status: 'pending_review',
    })

    // tier flows through to generateArticle opts.
    expect(capturedGenerateInput).not.toBeNull()
    expect((capturedGenerateInput!.opts as Record<string, unknown>).tier).toBe('deep')
    expect((capturedGenerateInput!.opts as Record<string, unknown>).publishedAt).toBeNull()

    // save called with operator stamp + news_item linkage.
    expect(capturedSave).not.toBeNull()
    expect(capturedSave!.newsItemId).toBe(NEWS_ITEM_ID)
    expect(capturedSave!.sourceKind).toBe('news_item')
    expect(capturedSave!.contentType).toBe('article')
    expect(capturedSave!.generatedBy).toBe('atlas:andre@example.com')
  })

  it('500 (ok:false) when generateArticle throws', async () => {
    mockUser = { id: 'op-1', email: 'op@example.com' }
    mockNewsRow = { project_id: 'p-mine',
      id: NEWS_ITEM_ID, title: 'X', summary: null, key_insight: null,
      url: null, source_name: null, content_angle: null,
    }
    generateThrows = new Error('Anthropic API error 503')
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, tier: 'standard' }))
    expect(res.status).toBe(500)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.ok).toBe(false)
    expect(String(json.error)).toContain('Anthropic API error 503')
    expect(capturedSave).toBeNull()
  })
})

// ═══ Phase 9H · ownership before spend ═══════════════════════════════════════

/**
 * The severe property here is not that a foreign article gets written — it is
 * that a foreign news item's CONTENT is read and then paid for. `news_item_id`
 * arrives in the request body and proves nothing, and the service-role client
 * bypasses RLS, so an unscoped lookup answered for every news item in the
 * database and fed the answer straight into a model call.
 *
 * These assertions are behavioural, against the real route with the generator
 * and the store mocked, because the thing that must be proven is a COUNT: a
 * foreign request must reach the paid boundary zero times. Grepping the source
 * for `assertProjectAllowed` would prove the guard is spelled, not that it runs
 * before the money does.
 */
const FOREIGN_NEWS = {
  project_id: 'p-theirs',
  id: NEWS_ITEM_ID,
  title: 'SECRET-HEADLINE',
  summary: 'SECRET-SUMMARY',
  key_insight: 'SECRET-INSIGHT',
  url: 'https://secret.example/leak',
  source_name: 'SECRET-SOURCE',
  content_angle: 'SECRET-ANGLE',
}

const OWNED_NEWS = {
  project_id: 'p-mine',
  id: NEWS_ITEM_ID,
  title: 'My headline',
  summary: 'My summary',
  key_insight: null,
  url: null,
  source_name: 'Wired AI',
  content_angle: null,
}

describe('9H · operator-generate — ownership precedes spend', () => {
  beforeEach(() => {
    // A sibling describe's beforeEach does not run for this block, so every
    // piece of shared module state is reset here explicitly. Leaving
    // `capturedGenerateInput` from a previous test would make a spend assertion
    // read as a leak that never happened — and, worse, could hide a real one.
    mockUser = { id: 'u-1', email: 'op@example.com' }
    mockNewsRow = null
    mockNewsError = null
    generateThrows = null
    saveThrows = null
    capturedSave = null
    capturedGenerateInput = null
    // Owns the source project AND the System A destination.
    mockOwnedProjectIds = ['p-mine', 'p-dest']
    newsFilters = []
    mockDestinationSlug = REAL_DESTINATION_SLUG
    mockDestinationProjectId = 'p-dest'
    destinationLookups = []
  })

  it('an OWNED news item proceeds: generation runs and the article is saved', async () => {
    mockNewsRow = OWNED_NEWS
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(res.status).toBe(200)
    expect(capturedGenerateInput, 'generation should have run').not.toBeNull()
    expect(capturedSave, 'article should have been saved').not.toBeNull()
  })

  it('a FOREIGN news item reaches the paid generator ZERO times', async () => {
    mockNewsRow = FOREIGN_NEWS
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(res.status).toBe(404)
    expect(capturedGenerateInput, 'paid generation must NOT have been reached').toBeNull()
  })

  it('a FOREIGN news item is never persisted as an article', async () => {
    mockNewsRow = FOREIGN_NEWS
    await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(capturedSave).toBeNull()
  })

  it('NO foreign field can reach the generation input — the exfiltration test', async () => {
    mockNewsRow = FOREIGN_NEWS
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    const everything = JSON.stringify({ capturedGenerateInput, capturedSave, body: await res.json() })
    for (const secret of ['SECRET-HEADLINE', 'SECRET-SUMMARY', 'SECRET-INSIGHT', 'SECRET-SOURCE', 'SECRET-ANGLE', 'secret.example']) {
      expect(everything, `${secret} leaked`).not.toContain(secret)
    }
  })

  it('a foreign id is INDISTINGUISHABLE from a nonexistent one', async () => {
    mockNewsRow = FOREIGN_NEWS
    const foreign = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    const foreignBody = await foreign.json()

    mockNewsRow = null
    const missing = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    const missingBody = await missing.json()

    expect(foreign.status).toBe(missing.status)
    expect(foreignBody).toEqual(missingBody)
    // 403 would confirm the row exists; the sibling /review route settled 404.
    expect(foreign.status).toBe(404)
  })

  it('a NONEXISTENT id spends nothing either', async () => {
    mockNewsRow = null
    await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(capturedGenerateInput).toBeNull()
    expect(capturedSave).toBeNull()
  })

  it('an EMPTY allow-list fails closed — an owned-looking row is still refused', async () => {
    mockNewsRow = OWNED_NEWS
    mockOwnedProjectIds = []
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(res.status).toBe(404)
    expect(capturedGenerateInput).toBeNull()
    expect(capturedSave).toBeNull()
  })

  it('an empty allow-list is issued as the IMPOSSIBLE id, not as some other project', async () => {
    // A 404 alone does not prove fail-closed: a fallback to any project the
    // fixture does not belong to produces the same 404. What must be true is
    // that the QUERY carried the impossible id — `scopeProjectFilter`'s whole
    // contract. Without this, replacing it with a fallback passes every other
    // assertion here.
    mockNewsRow = OWNED_NEWS
    mockOwnedProjectIds = []
    await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(newsFilters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
  })

  it('a populated allow-list is passed through unchanged', async () => {
    mockNewsRow = OWNED_NEWS
    mockOwnedProjectIds = ['p-mine', 'p-other-of-mine', 'p-dest']
    await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(newsFilters).toContainEqual(['project_id', ['p-mine', 'p-other-of-mine', 'p-dest']])
  })

  it('a client-supplied project id cannot authorise anything', async () => {
    mockNewsRow = FOREIGN_NEWS
    // The body carries the foreign project explicitly; the route must ignore it.
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID, project_id: 'p-theirs' }))
    expect(res.status).toBe(404)
    expect(capturedGenerateInput).toBeNull()
  })

  it('401 is still decided before any ownership read or spend', async () => {
    mockUser = null
    mockNewsRow = OWNED_NEWS
    const res = await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    expect(res.status).toBe(401)
    expect(capturedGenerateInput).toBeNull()
  })

  it('project_id is used to authorise, not passed into the generator', async () => {
    mockNewsRow = OWNED_NEWS
    await POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
    const sent = capturedGenerateInput!.newsItem as Record<string, unknown>
    expect(sent.title).toBe('My headline')
    expect(sent).not.toHaveProperty('project_id')
  })
})

// ═══ Phase 9J · destination project authorization ════════════════════════════

/**
 * Owning the SOURCE says nothing about the DESTINATION.
 *
 * `saveGeneratedArticle` always lands the row in the System A project and
 * resolves that destination AFTER generation has already been paid for, so the
 * check cannot live there — an operator authorised for the news item could
 * still write into a project they do not own, and would be billed for the
 * privilege. These are two independent boundaries and the matrix below is what
 * keeps them independent: source-owned/destination-foreign is the case that
 * exists ONLY because the destination guard exists.
 *
 * Every assertion is a COUNT at the paid boundary. A refusal that arrives after
 * `generateArticle` has run is not a refusal — the money is already spent.
 */
describe('9J · destination authorization precedes spend', () => {
  const SOURCE_OWNED = {
    project_id: 'p-mine', id: NEWS_ITEM_ID, title: 'My headline', summary: 'My summary',
    key_insight: null, url: null, source_name: 'Wired AI', content_angle: null,
  }
  const SOURCE_FOREIGN = { ...SOURCE_OWNED, project_id: 'p-theirs', title: 'SECRET-HEADLINE' }

  const run = () => POST(jsonPost({ news_item_id: NEWS_ITEM_ID }))
  const spentNothing = () => {
    expect(capturedGenerateInput, 'paid generation must not have run').toBeNull()
    expect(capturedSave, 'article must not have been persisted').toBeNull()
  }

  beforeEach(() => {
    mockUser = { id: 'u-1', email: 'op@example.com' }
    mockNewsRow = null
    mockNewsError = null
    generateThrows = null
    saveThrows = null
    capturedSave = null
    capturedGenerateInput = null
    newsFilters = []
    destinationLookups = []
    mockDestinationSlug = REAL_DESTINATION_SLUG
    mockDestinationProjectId = 'p-dest'
    mockOwnedProjectIds = ['p-mine', 'p-dest']
  })

  it('source owned + destination owned → proceeds, generates, persists', async () => {
    mockNewsRow = SOURCE_OWNED
    const res = await run()
    expect(res.status).toBe(200)
    expect(capturedGenerateInput).not.toBeNull()
    expect(capturedSave).not.toBeNull()
  })

  it('source owned + destination FOREIGN → zero generation, zero persistence', async () => {
    // The case that exists only because the destination guard does.
    mockNewsRow = SOURCE_OWNED
    mockOwnedProjectIds = ['p-mine']          // owns the source, NOT the destination
    const res = await run()
    expect(res.status).toBe(404)
    spentNothing()
  })

  it('a foreign destination leaks no destination metadata', async () => {
    mockNewsRow = SOURCE_OWNED
    mockOwnedProjectIds = ['p-mine']
    const res = await run()
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('p-dest')
    expect(body).not.toContain(REAL_DESTINATION_SLUG)
    expect(body).not.toMatch(/destination|another project|not yours|owner/i)
  })

  it('source FOREIGN + destination owned → zero generation (9H preserved)', async () => {
    mockNewsRow = SOURCE_FOREIGN
    const res = await run()
    expect(res.status).toBe(404)
    spentNothing()
  })

  it('source FOREIGN + destination FOREIGN → zero generation', async () => {
    mockNewsRow = SOURCE_FOREIGN
    mockOwnedProjectIds = []
    const res = await run()
    expect(res.status).toBe(404)
    spentNothing()
  })

  it('destination MISSING entirely → zero generation, zero persistence', async () => {
    mockNewsRow = SOURCE_OWNED
    mockDestinationProjectId = null           // no such project row
    const res = await run()
    expect(res.status).toBe(404)
    spentNothing()
  })

  it('an EMPTY allow-list denies both boundaries and spends nothing', async () => {
    mockNewsRow = SOURCE_OWNED
    mockOwnedProjectIds = []
    const res = await run()
    expect(res.status).toBe(404)
    spentNothing()
  })

  it('the destination lookup is scoped by the caller’s allow-list, not left open', async () => {
    mockNewsRow = SOURCE_OWNED
    await run()
    expect(destinationLookups.length).toBeGreaterThan(0)
    const probe = destinationLookups[0]
    expect(probe.slug, 'destination must be looked up by the canonical slug').toBe(REAL_DESTINATION_SLUG)
    expect(probe.id, 'destination must be constrained to owned ids').toEqual(['p-mine', 'p-dest'])
  })

  it('an empty allow-list is denied at the SOURCE, before the destination is even queried', async () => {
    // The two guards are ordered, so this is what actually happens: with no
    // allowed projects the scoped source read returns nothing and the request
    // is refused there. The destination lookup is never reached — asserting it
    // carried the impossible id would be asserting a query that does not run.
    mockNewsRow = SOURCE_OWNED
    mockOwnedProjectIds = []
    const res = await run()
    expect(res.status).toBe(404)
    expect(newsFilters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
    expect(destinationLookups, 'destination must not be queried after a source refusal').toEqual([])
    spentNothing()
  })

  it('the destination guard is what refuses when ONLY the destination is unowned', async () => {
    // The complement of the test above: here the source passes, so the refusal
    // can only be the destination guard. Without it the request would generate.
    mockNewsRow = SOURCE_OWNED
    mockOwnedProjectIds = ['p-mine']
    const res = await run()
    expect(res.status).toBe(404)
    expect(newsFilters.length, 'source was queried and passed').toBeGreaterThan(0)
    expect(destinationLookups.length, 'destination was the guard that fired').toBe(1)
    spentNothing()
  })

  it('the destination is never taken from the request body', async () => {
    mockNewsRow = SOURCE_OWNED
    mockOwnedProjectIds = ['p-mine']          // does not own the real destination
    // Every shape a client might try to smuggle a destination through.
    const res = await POST(jsonPost({
      news_item_id: NEWS_ITEM_ID,
      project_id: 'p-mine',
      destination_project_id: 'p-mine',
      destination_slug: 'p-mine',
      user_id: 'someone-else',
    }))
    expect(res.status).toBe(404)
    spentNothing()
    // The lookup still used the canonical slug, not anything from the body.
    expect(destinationLookups[0]?.slug).toBe(REAL_DESTINATION_SLUG)
  })

  it('BOTH authorizations complete before the generator is ever reached', async () => {
    // Ordering as behaviour: by the time generation runs, the source query and
    // the destination query have both been issued.
    mockNewsRow = SOURCE_OWNED
    await run()
    expect(newsFilters.length, 'source was not queried').toBeGreaterThan(0)
    expect(destinationLookups.length, 'destination was not queried').toBeGreaterThan(0)
    expect(capturedGenerateInput, 'generation should have run for an authorised pair').not.toBeNull()
  })
})
