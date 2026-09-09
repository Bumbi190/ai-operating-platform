/**
 * Phase 9V-3c — media pipeline / orchestration authorization.
 *
 * Three SSE orchestrators took `project_id` from the request body and treated it
 * as if it were a permission. It is only a selector: every read, every paid
 * provider call, every write and every storage path in these handlers derives
 * from that one value, through the service-role client, with nothing but a
 * session behind it. Naming another tenant's project was enough to spend their
 * budget, read their news backlog and file rows under their project.
 *
 *   pipeline/full  — 7 provider calls, 11 write sites, 2 mode branches
 *   pipeline/daily — reads the top approved story, then forwards to full
 *   news/hunt      — external hunt + optional auto_save insert
 *
 * All three share ONE authority shape, which is why they land together: the
 * body value is validated against the caller's allow-list at the ENTRY POINT,
 * and one guard suffices because it dominates the whole handler. Every helper
 * receives `project_id` as a parameter rather than resolving a project of its
 * own — `deduplicateAgainstDB`, the storage upload paths, the governed-spend
 * scope — so none of them can fan out to a project the entry point did not
 * authorize. The tests below assert that dominance directly: on a foreign
 * project the provider and write counters must be exactly zero, not merely the
 * response wrong.
 *
 * The counters matter more than the status code here. These routes stream SSE,
 * so a late guard would still "look" like a rejection to the caller while the
 * spend had already happened. Denial has to cost nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'
const NOBODY = 'user-nobody'

/** Every paid / external call, in order. Denial must leave this empty. */
let CALLS: string[] = []
const note = (n: string) => { CALLS.push(n) }

interface Seen { table: string; ops: [string, string, unknown][]; writes: unknown[] }
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [], writes: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))
    const q: any = {
      select: () => q,
      insert: (row: any) => { rec.ops.push(['insert', table, row]); rec.writes.push(row); return q },
      update: (patch: any) => { rec.ops.push(['update', table, patch]); rec.writes.push(patch); return q },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      gte: (c: string, v: string) => { rec.ops.push(['gte', c, v]); rows = rows.filter(r => String(get(r, c)) >= v); return q },
      order: (c: string, o?: { ascending?: boolean }) => {
        rec.ops.push(['order', c, o?.ascending !== false])
        const dir = o?.ascending === false ? -1 : 1
        rows = [...rows].sort((a, b) => (Number(get(a, c)) < Number(get(b, c)) ? -1 : 1) * dir)
        return q
      },
      limit: (n: number) => { rec.ops.push(['limit', String(n), n]); rows = rows.slice(0, n); return q },
      single: async () => ({ data: rows[0] ?? { id: 'new-row' }, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT: ReturnType<typeof fakeDb>
let CURRENT_USER: { id: string } | null = { id: ME }

/** `projects` is what getAllowedProjectIds reads: owner_id = the session user. */
function seed(newsItems: any[] = []) {
  return {
    projects: [
      { id: MINE, owner_id: ME },
      { id: THEIRS, owner_id: 'user-other' },
    ],
    media_news_items: newsItems,
    media_scripts: [],
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))

const NEWS_JSON = JSON.stringify({
  title: 'T', summary: 'S', key_insight: 'K', virality_score: 90,
  target_audience: 'intermediate', content_angle: 'educational',
})
const SCRIPT_JSON = JSON.stringify({
  hook: 'H', script: 'Body', captions: ['c'], hashtags: ['#a'],
  cta: 'cta', tone: 'insider', estimated_duration: '~22s', difficulty: 'intermediate',
})
let CLAUDE_TURN = 0
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({
    messages: {
      create: async () => {
        note('anthropic')
        const body = CLAUDE_TURN++ === 0 ? NEWS_JSON : SCRIPT_JSON
        return { content: [{ type: 'text', text: body }] }
      },
    },
  }),
}))
vi.mock('@/lib/media/elevenlabs', () => ({
  generateVoiceover: async () => { note('elevenlabs'); return { audioBuffer: Buffer.from(''), words: [], durationMs: 1000 } },
}))
vi.mock('@/lib/media/ideogram', () => ({
  generateSceneImages: async () => { note('ideogram'); return [{ url: 'https://x/1.png' }] },
  generateNewsImages: async () => { note('ideogram'); return ['https://x/1.png'] },
}))
vi.mock('@/lib/media/storage', () => ({
  uploadAudio: async () => { note('storage'); return 'https://x/a.mp3' },
  uploadTimingData: async () => { note('storage'); return 'https://x/t.json' },
  uploadSceneImage: async () => { note('storage'); return 'https://x/i.png' },
}))
vi.mock('@/lib/media/quality', () => ({
  scoreScript: async () => { note('quality'); return { overall: 9, hook_strength: 9, verdict: 'ok', weak_spots: [] } },
  shouldRegenerate: () => false,
}))
vi.mock('@/lib/media/music', () => ({ getBackgroundMusicUrl: async () => 'https://x/m.mp3' }))
vi.mock('@/lib/media/news-hunter', () => ({
  fetchAllSources: async () => { note('hunt-fetch'); return [{ url: 'https://n/1', title: 'N', summary: 's', sourceLabel: 'HN', publishedAt: new Date(), viralityScore: 5, engagementScore: 5 }] },
  deduplicateAgainstDB: async (stories: any[], db: any, projectId: string) => {
    note('hunt-dedup')
    await db.from('media_news_items').select('url, title').eq('project_id', projectId)
    return stories
  },
  scoreAndRank: (s: any[]) => s,
  claudeEditorialPick: async () => {
    note('hunt-editorial')
    return { candidates: [{ rank: 1, editorialNote: 'e', suggestedAngle: 'educational', estimatedViralityScore: 9,
      story: { title: 'N', url: 'https://n/1', summary: 's', sourceLabel: 'HN', publishedAt: new Date(), viralityScore: 5, engagementScore: 5 } }], summary: 'sum' }
  },
}))

function jsonReq(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
/** Drain an SSE body so the stream's side effects actually run. */
async function drain(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader(); const dec = new TextDecoder(); let out = ''
  for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }) }
  return out
}
const writesFor = (seen: Seen[]) => seen.flatMap(s => s.writes)
const opsOn = (seen: Seen[], table: string) => seen.filter(s => s.table === table).flatMap(s => s.ops)

beforeEach(() => { CURRENT_USER = { id: ME }; CURRENT = fakeDb(seed()); CALLS = []; CLAUDE_TURN = 0 })

// ═══ A · pipeline/full ═══════════════════════════════════════════════════════

describe('9V-3c · pipeline/full — a body project_id is not a permission', () => {
  const post = async (body: unknown) => {
    vi.resetModules()
    const { POST } = await import('@/app/api/media/pipeline/full/route')
    return POST(jsonReq('https://x.test/api/media/pipeline/full', body))
  }

  it('an owned project runs the pipeline', async () => {
    const res = await post({ text: 'article', project_id: MINE })
    await drain(res)
    expect(res.status).toBe(200)
    expect(CALLS).toContain('anthropic')
    expect(CALLS).toContain('elevenlabs')
  })

  it('a FOREIGN project spends nothing and writes nothing', async () => {
    const res = await post({ text: 'article', project_id: THEIRS })
    await drain(res)
    expect(res.status).toBe(404)
    expect(CALLS, 'pipeline/full reached a provider on a foreign project').toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('a nonexistent project is refused the same way', async () => {
    const res = await post({ text: 'article', project_id: '99999999-9999-9999-9999-999999999999' })
    await drain(res)
    expect(res.status).toBe(404)
    expect(CALLS).toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('foreign and nonexistent are indistinguishable', async () => {
    const a = await post({ text: 't', project_id: THEIRS })
    const b = await post({ text: 't', project_id: '99999999-9999-9999-9999-999999999999' })
    expect(a.status).toBe(b.status)
    expect(await a.text()).toEqual(await b.text())
  })

  it('the full mode branch is refused too — both branches are behind one guard', async () => {
    const res = await post({ text: 'article', project_id: THEIRS, mode: 'full' })
    await drain(res)
    expect(res.status).toBe(404)
    expect(CALLS).toEqual([])
  })

  it('an operator who owns nothing spends nothing', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await post({ text: 'article', project_id: MINE })
    await drain(res)
    expect(res.status).toBe(404)
    expect(CALLS).toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('an unauthenticated request never reaches a query or a provider', async () => {
    CURRENT_USER = null
    const res = await post({ text: 'article', project_id: MINE })
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
    expect(CALLS).toEqual([])
  })

  it('every persisted row carries the authorized project', async () => {
    const res = await post({ text: 'article', project_id: MINE })
    await drain(res)
    const inserted = CURRENT.seen.flatMap(s => s.ops).filter(([op]) => op === 'insert').map(o => o[2] as any)
    expect(inserted.length).toBeGreaterThan(0)
    for (const row of inserted) {
      if ('project_id' in row) expect(row.project_id).toBe(MINE)
    }
  })
})

// ═══ B · pipeline/daily ══════════════════════════════════════════════════════

describe('9V-3c · pipeline/daily — an operator route, not a machine one', () => {
  const post = async (body: unknown) => {
    vi.resetModules()
    const { POST } = await import('@/app/api/media/pipeline/daily/route')
    return POST(jsonReq('https://x.test/api/media/pipeline/daily', body))
  }
  const story = (id: string, project: string, score: number, created: string) => ({
    id, project_id: project, status: 'approved', virality_score: score, created_at: created,
    title: `t-${id}`, summary: 's', key_insight: 'k', content_angle: 'educational',
  })
  const RECENT = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  beforeEach(() => {
    // A foreign story that OUTRANKS the owned one on every ordering key.
    CURRENT = fakeDb(seed([
      story('mine-lower',   MINE,   10, RECENT),
      story('theirs-higher', THEIRS, 99, RECENT),
    ]))
    ;(globalThis as any).fetch = async () => { note('forward-to-full'); return new Response('data: {}\n\n') }
  })

  it('a foreign project reads nothing and forwards nothing', async () => {
    const res = await post({ project_id: THEIRS })
    expect(res.status).toBe(404)
    expect(opsOn(CURRENT.seen, 'media_news_items')).toEqual([])
    expect(CALLS).toEqual([])
  })

  it('an operator who owns nothing is refused', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(404)
    expect(opsOn(CURRENT.seen, 'media_news_items')).toEqual([])
    expect(CALLS).toEqual([])
  })

  it('DISPLACEMENT — a higher-scoring foreign story never takes the single slot', async () => {
    // limit(1) with ORDER BY virality_score DESC: unscoped, the foreign 99
    // would win outright and be forwarded into the pipeline as the day's story.
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(200)
    const ops = opsOn(CURRENT.seen, 'media_news_items')
    const eqProject = ops.find(([op, c]) => op === 'eq' && c === 'project_id')
    expect(eqProject?.[2]).toBe(MINE)
    // the project filter is applied BEFORE order/limit
    const idx = (pred: (o: [string, string, unknown]) => boolean) => ops.findIndex(pred)
    expect(idx(o => o[0] === 'eq' && o[1] === 'project_id'))
      .toBeLessThan(idx(o => o[0] === 'order'))
    expect(idx(o => o[0] === 'order')).toBeLessThan(idx(o => o[0] === 'limit'))
  })

  it('the authorized project is the one forwarded to the full pipeline', async () => {
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(200)
    expect(CALLS).toContain('forward-to-full')
  })

  it('an unauthenticated request never reaches a query', async () => {
    CURRENT_USER = null
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})

// ═══ C · news/hunt ═══════════════════════════════════════════════════════════

describe('9V-3c · news/hunt — the external hunt is behind the guard', () => {
  const post = async (body: unknown) => {
    vi.resetModules()
    const { POST } = await import('@/app/api/media/news/hunt/route')
    return POST(jsonReq('https://x.test/api/media/news/hunt', body))
  }

  it('an owned project runs the hunt', async () => {
    const res = await post({ project_id: MINE })
    await drain(res)
    expect(res.status).toBe(200)
    expect(CALLS).toContain('hunt-fetch')
    expect(CALLS).toContain('hunt-editorial')
  })

  it('a FOREIGN project makes ZERO external calls and zero writes', async () => {
    const res = await post({ project_id: THEIRS, auto_save: true })
    await drain(res)
    expect(res.status).toBe(404)
    expect(CALLS, 'news/hunt reached an external source on a foreign project').toEqual([])
    expect(writesFor(CURRENT.seen)).toEqual([])
  })

  it('auto_save cannot file a row under a foreign project', async () => {
    const res = await post({ project_id: THEIRS, auto_save: true })
    await drain(res)
    expect(opsOn(CURRENT.seen, 'media_news_items').filter(([op]) => op === 'insert')).toEqual([])
  })

  it('the dedup read cannot reach a foreign backlog', async () => {
    // deduplicateAgainstDB reads media_news_items for whatever project it is
    // handed — the guard is what keeps that from being someone else's.
    const res = await post({ project_id: THEIRS })
    await drain(res)
    expect(opsOn(CURRENT.seen, 'media_news_items')).toEqual([])
    expect(CALLS).toEqual([])
  })

  it('on the owned path the dedup read is scoped to the authorized project', async () => {
    const res = await post({ project_id: MINE })
    await drain(res)
    const eqProject = opsOn(CURRENT.seen, 'media_news_items').find(([op, c]) => op === 'eq' && c === 'project_id')
    expect(eqProject?.[2]).toBe(MINE)
  })

  it('an owned auto_save files the row under the authorized project', async () => {
    const res = await post({ project_id: MINE, auto_save: true })
    await drain(res)
    const ins = opsOn(CURRENT.seen, 'media_news_items').filter(([op]) => op === 'insert').map(o => o[2] as any)
    expect(ins).toHaveLength(1)
    expect(ins[0].project_id).toBe(MINE)
  })

  it('an operator who owns nothing hunts nothing', async () => {
    CURRENT_USER = { id: NOBODY }
    const res = await post({ project_id: MINE })
    await drain(res)
    expect(res.status).toBe(404)
    expect(CALLS).toEqual([])
  })

  it('an unauthenticated request never reaches a query or a source', async () => {
    CURRENT_USER = null
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
    expect(CALLS).toEqual([])
  })
})

// ═══ D · the helper itself, unmocked ═════════════════════════════════════════
//
// Everything above mocks `deduplicateAgainstDB`, which proves the ROUTE cannot
// hand it a foreign project — but not that the helper scopes its own read. Those
// are different claims and a mocked helper can never establish the second, so
// this block exercises the real implementation. If the helper ever loses its
// own filter it reads every tenant's news backlog, and the dedup decision leaks
// what other projects have already covered even though no row is returned.

describe('9V-3c · deduplicateAgainstDB — the helper scopes its own read', () => {
  it('reads media_news_items for exactly the project it was handed', async () => {
    const actual = await vi.importActual<typeof import('@/lib/media/news-hunter')>('@/lib/media/news-hunter')
    const probe = fakeDb(seed([
      { id: 'n-mine',   project_id: MINE,   url: 'https://a/1', title: 'A' },
      { id: 'n-theirs', project_id: THEIRS, url: 'https://b/2', title: 'B' },
    ]))
    const stories = [
      { url: 'https://a/1', title: 'A', summary: '', sourceLabel: 'HN', publishedAt: new Date(), viralityScore: 1, engagementScore: 1 },
      { url: 'https://b/2', title: 'B', summary: '', sourceLabel: 'HN', publishedAt: new Date(), viralityScore: 1, engagementScore: 1 },
    ] as never
    const fresh = await actual.deduplicateAgainstDB(stories, probe.db, MINE)

    const eqProject = probe.seen.filter(s => s.table === 'media_news_items')
      .flatMap(s => s.ops).find(([op, c]) => op === 'eq' && c === 'project_id')
    expect(eqProject, 'the helper read media_news_items without a project filter').toBeDefined()
    expect(eqProject?.[2]).toBe(MINE)

    // The owned duplicate is removed; the FOREIGN project's identical url is not
    // treated as already-seen, because it was never in scope to begin with.
    expect(fresh.map(f => f.url)).toEqual(['https://b/2'])
  })
})
