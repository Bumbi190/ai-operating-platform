/**
 * vNext Phase 15 — Content Center (`/atlas/content`).
 *
 * Four risks carry this surface, and the suite is organised around them:
 *
 *   1. HIDING OR REWRITING STATE. The page this replaces grouped four of the six
 *      statuses the schema allows, so a `failed` publish — which the review route
 *      really writes — and a `scheduled` row never appeared. And stored fields can
 *      contradict status: regenerating a published article resets `status` while
 *      the publish record stays. The surface must show every stored status, raw
 *      when unknown, and report a contradiction without resolving it.
 *
 *   2. CLAIMING WHAT ATLAS CANNOT SEE. QA is the generator's self-assessment,
 *      cost is an estimate, and a publishing address is a record — not proof a
 *      page is live. None may be promoted into more than it is.
 *
 *   3. GROWING A PARALLEL ACTION PATH. The only action here is the existing
 *      Generate Article drawer, mounted unchanged. Approve, reject, publish and
 *      hero images stay on the article page behind their existing routes.
 *
 *   4. LEAKING ACROSS THE OWNER BOUNDARY, and LOSING THE ROLLBACK.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleContentCenter,
  ownedProjects,
  qaVerdict,
  safeHttpUrl,
  type AssembleContentInput,
  type ContentCenterModel,
} from '@/lib/os/content-center'
import {
  CONTENT_LIMITS,
  CONTENT_STATUS_LABELS,
  DISAGREEMENT_NOTE,
  GENERATION_NOTE,
  NEWS_UNREADABLE_NOTE,
  NOT_RECORDED_LABEL,
  QA_NOTE,
  COST_NOTE,
  STATUS_NOTE,
  UNKNOWN_STATUS_LABEL,
  UNREADABLE_LABEL,
} from '@/lib/os/content-center-shared'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { destinationLabel } from '@/lib/nav/registry'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` })
  },
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments explain which symbols this surface deliberately does NOT call, so
 *  every "must not reference" assertion reads the code without them. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
/** Rendered text only — hashed CSS-module class names carry digits of their own. */
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MINE = '11111111-1111-1111-1111-111111111111'
const MINE2 = '33333333-3333-3333-3333-333333333333'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'wc-1',
  project_id: MINE,
  content_type: 'article',
  title: 'AI i skolan',
  summary: 'Kort sammanfattning',
  status: 'pending_review',
  status_reason: 'Generated; awaiting Atlas review',
  model: 'claude-sonnet-4-6',
  cost_usd: 0.0123,
  qa: { pass: true, confidence: 'medium', issues: [] },
  created_at: '2026-08-27T11:39:12.000Z',
  updated_at: '2026-08-27T11:39:12.000Z',
  reviewed_at: null,
  published_at: null,
  publish_operation: null,
  publish_error: null,
  rejection_reason: null,
  scheduled_at: null,
  destination_url: null,
  hero_image_status: 'pending',
  ...over,
})

const news = (over: Record<string, unknown> = {}) => ({
  id: 'n-1', project_id: MINE, title: 'Rubrik', source_name: 'Källa', virality_score: 7,
  created_at: '2026-09-10T08:00:00.000Z', ...over,
})

const input = (over: Partial<AssembleContentInput> = {}): AssembleContentInput => ({
  scopeIds: [MINE, MINE2],
  content: { ok: true, rows: [row()] },
  news: { ok: true, rows: [news()] },
  projects: { ok: true, rows: [{ id: MINE, name: 'The Prompt', slug: 'ai-media-automation', color: '#6366f1' }] },
  ...over,
})

const render = async (model: ContentCenterModel) => {
  const { ContentCenter } = await import('@/components/platform/vnext/ContentCenter')
  return renderToStaticMarkup(React.createElement(ContentCenter, { model }))
}

/** One lane's markup, by its stored status. */
const lane = (html: string, status: string) => {
  const i = html.indexOf(`data-lane="${status}"`)
  return i < 0 ? '' : html.slice(i, html.indexOf('</section>', i))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Status — every stored value, never folded
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · every stored status is shown', () => {
  it('failed and scheduled rows get lanes — the replaced page never showed them', () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [
        row({ id: 'f', status: 'failed', publish_error: '502 from publisher' }),
        row({ id: 's', status: 'scheduled', scheduled_at: '2026-10-01T06:00:00.000Z' }),
      ] },
    }))
    expect(model.lanes.map((l) => l.status)).toEqual(['pending_review', 'failed', 'scheduled'])
  })

  it('the legacy body really does group only four statuses', () => {
    const legacy = read('app/(platform)/atlas/content/ContentLegacy.tsx')
    const groups = [...legacy.matchAll(/\{ key: '([a-z_]+)'/g)].map((m) => m[1])
    expect(groups).toEqual(['pending_review', 'approved', 'published', 'rejected'])
  })

  it('the review queue lane is always present, even empty', async () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ status: 'published' })] } }))
    expect(model.lanes[0].status).toBe('pending_review')
    expect(lane(await render(model), 'pending_review')).toContain('Ingen artikel väntar på granskning')
  })

  it('a status outside the schema keeps its raw value, in its own lane', async () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ status: 'weird_state' })] } }))
    const unknown = model.lanes.find((l) => l.status === 'weird_state')!
    expect(unknown.known).toBe(false)
    const html = await render(model)
    expect(lane(html, 'weird_state')).toContain(UNKNOWN_STATUS_LABEL)
    expect(lane(html, 'weird_state')).toContain('weird_state')
    expect(model.counts!.unknown).toBe(1)
  })

  it('counts cover all six statuses and the total', () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [
        row({ id: 'a', status: 'published' }), row({ id: 'b', status: 'published' }), row({ id: 'c', status: 'rejected' }),
      ] },
    }))
    expect(model.counts).toEqual({
      pending_review: 0, failed: 0, scheduled: 0, approved: 0, published: 2, rejected: 1, unknown: 0, total: 3,
    })
  })

  it('an unreadable queue has no counts — never zeros', async () => {
    const model = assembleContentCenter(input({ content: { ok: false, rows: [] } }))
    expect(model.counts).toBeNull()
    expect(model.lanes.every((l) => l.cards.length === 0)).toBe(true)
    const html = await render(model)
    expect(html).toContain('det är inte samma sak som en tom kö')
    expect(html).not.toContain('data-lane=')
  })

  it('rows handed in beside ok:false are never shown', () => {
    const model = assembleContentCenter(input({ content: { ok: false, rows: [row()] } }))
    expect(model.cards).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Stored contradictions — reported, never resolved
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · a publish record beside another status is reported, not resolved', () => {
  const regenerated = () => row({
    id: 'babe', status: 'pending_review', status_reason: 'Generated; awaiting Atlas review',
    destination_url: 'https://theprompt.se/artiklar/ai-i-skolan', published_at: '2026-07-08T21:16:27.000Z',
    publish_operation: 'created',
  })

  it('a pending row carrying a publish record is flagged — production\'s regenerated article', () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [regenerated()] } }))
    expect(model.cards[0].publishRecordedWithoutPublishedStatus).toBe(true)
    expect(model.attention).toContainEqual(expect.objectContaining({ kind: 'status_disagreement' }))
  })

  it('a rejected row carrying a publish record is flagged too', () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [row({ status: 'rejected', published_at: '2026-06-08T12:15:08.000Z' })] },
    }))
    expect(model.cards[0].publishRecordedWithoutPublishedStatus).toBe(true)
  })

  it('a published row with its publish record is not a contradiction', () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [row({ status: 'published', published_at: '2026-06-08T12:15:08.000Z', destination_url: 'https://theprompt.se/a' })] },
    }))
    expect(model.cards[0].publishRecordedWithoutPublishedStatus).toBe(false)
    expect(model.attention.some((a) => a.kind === 'status_disagreement')).toBe(false)
  })

  it('the flag never rewrites the stored status', async () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [regenerated()] } }))
    expect(model.cards[0].status).toBe('pending_review')
    expect(model.lanes.find((l) => l.status === 'pending_review')!.cards).toHaveLength(1)
    expect(model.lanes.find((l) => l.status === 'published')).toBeUndefined()
    const card = lane(await render(model), 'pending_review')
    expect(card).toContain(CONTENT_STATUS_LABELS.pending_review)
    expect(card).toContain('Fälten motsäger varandra')
  })

  it('the attention explains the contradiction without choosing a side', async () => {
    const html = await render(assembleContentCenter(input({ content: { ok: true, rows: [regenerated()] } })))
    expect(html).toContain(DISAGREEMENT_NOTE)
    expect(textOf(html)).not.toMatch(/\blive\b(?! just nu)|är publicerad nu|syns på webbplatsen/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · What Atlas cannot see — a record, not an observation
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · records are not promoted into observations', () => {
  it('an http(s) publishing address is a link labelled as recorded', async () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [row({ status: 'published', destination_url: 'https://theprompt.se/a', published_at: '2026-06-08T12:00:00.000Z' })] },
    }))
    const html = await render(model)
    expect(html).toContain('href="https://theprompt.se/a"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Bokförd publiceringsadress')
    expect(html).toContain(STATUS_NOTE)
  })

  it('a stored non-http address is never rendered as a link', async () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,x')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl('https://theprompt.se/a')).toBe('https://theprompt.se/a')
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ destination_url: 'javascript:alert(1)' })] } }))
    expect(model.cards[0].destinationUrl).toBeNull()
    expect(model.cards[0].destinationUnsafe).toBe(true)
    const html = await render(model)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('inte en http- eller https-adress')
  })

  it('an unsafe stored address still counts as a publish record', () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ destination_url: 'javascript:alert(1)' })] } }))
    expect(model.cards[0].publishRecordedWithoutPublishedStatus).toBe(true)
  })

  it('QA is the generator\'s verdict — absent is never a pass', () => {
    expect(qaVerdict({ pass: true })).toBe('pass')
    expect(qaVerdict({ pass: false })).toBe('fail')
    expect(qaVerdict({ pass: 'true' })).toBe('absent')
    expect(qaVerdict({})).toBe('absent')
    expect(qaVerdict(null)).toBe('absent')
  })

  it('QA is labelled automatic and explained', async () => {
    const html = await render(assembleContentCenter(input()))
    expect(html).toContain('Automatisk QA')
    expect(html).toContain(QA_NOTE)
  })

  it('a published article whose QA failed says so on its card', async () => {
    const html = await render(assembleContentCenter(input({
      content: { ok: true, rows: [row({ status: 'published', qa: { pass: false, confidence: 'low', issues: ['x'] } })] },
    })))
    expect(lane(html, 'published')).toContain('Publicerad med underkänd QA')
  })

  it('cost is an estimate, and a missing one is not zero', async () => {
    const { formatUsd } = await import('@/components/platform/vnext/ContentCenter')
    expect(formatUsd(null)).toBe(NOT_RECORDED_LABEL)
    expect(formatUsd(0.0123)).toBe('$0.0123')
    const html = await render(assembleContentCenter(input({ content: { ok: true, rows: [row({ cost_usd: null })] } })))
    expect(html).toContain('Beräknad genereringskostnad')
    expect(html).toContain(COST_NOTE)
    expect(textOf(lane(html, 'pending_review'))).not.toMatch(/\$0\.00\b/)
  })

  it('a hero image that is generating is only "generating" — no stuck verdict is invented', async () => {
    const html = await render(assembleContentCenter(input({ content: { ok: true, rows: [row({ hero_image_status: 'generating' })] } })))
    expect(html).toContain('Genereras')
    expect(textOf(html)).not.toMatch(/fastnat|hängt sig|stuck|timeout/i)
  })

  it('a hero status the schema does not know is shown raw, and none is "not recorded"', async () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ id: 'a', hero_image_status: 'mystery' }), row({ id: 'b', hero_image_status: null })] } }))
    const html = await render(model)
    expect(html).toContain('mystery')
    expect(html).toContain(NOT_RECORDED_LABEL)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Attention — stored conditions only
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · attention is derived from stored conditions', () => {
  it('pending review, failed publishes and contradictions each raise attention', () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [
        row({ id: 'p1' }), row({ id: 'p2' }),
        row({ id: 'f', status: 'failed', publish_error: '502' }),
        row({ id: 'r', status: 'rejected', published_at: '2026-06-08T12:00:00.000Z' }),
      ] },
    }))
    expect(model.attention.map((a) => a.kind)).toEqual(['pending_review', 'publish_failed', 'status_disagreement'])
    expect(model.attention[0]).toEqual({ kind: 'pending_review', count: 2 })
  })

  it('a failed publish shows its stored error, or says none was recorded', async () => {
    const withError = await render(assembleContentCenter(input({ content: { ok: true, rows: [row({ status: 'failed', publish_error: '502 from publisher' })] } })))
    expect(withError).toContain('502 from publisher')
    const without = await render(assembleContentCenter(input({ content: { ok: true, rows: [row({ status: 'failed', publish_error: null })] } })))
    expect(without).toContain('Inget fel är bokfört.')
  })

  it('a read that reached its cap is labelled — counts become a floor', async () => {
    const rows = Array.from({ length: CONTENT_LIMITS.rows }, (_, i) => row({ id: `r${i}`, status: 'published' }))
    const model = assembleContentCenter(input({ content: { ok: true, rows } }))
    expect(model.truncated).toBe(true)
    expect(model.attention).toContainEqual({ kind: 'truncated', limit: CONTENT_LIMITS.rows })
    expect(await render(model)).toContain('antalen är en undre gräns')
  })

  it('every unreadable source is named', () => {
    const model = assembleContentCenter(input({ news: { ok: false, rows: [] }, projects: { ok: false, rows: [] } }))
    expect(model.attention).toContainEqual({ kind: 'source_unreadable', source: 'news' })
    expect(model.attention).toContainEqual({ kind: 'source_unreadable', source: 'projects' })
  })

  it('the all-clear text only renders when nothing needs attention', async () => {
    const clear = await render(assembleContentCenter(input({ content: { ok: true, rows: [row({ status: 'published' })] } })))
    expect(clear).toContain('Ingen artikel väntar på granskning, ingen publicering har misslyckats')
    const busy = await render(assembleContentCenter(input()))
    expect(busy).not.toContain('Ingen artikel väntar på granskning, ingen publicering har misslyckats')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Actions — the existing drawer, and links to the existing article page
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · actions reuse what exists', () => {
  const COMPONENT = read('components/platform/vnext/ContentCenter.tsx')

  it('mounts the existing Generate Article drawer, not a new one', () => {
    expect(COMPONENT).toMatch(/import \{ GenerateArticleDrawer \} from '@\/app\/\(platform\)\/atlas\/content\/GenerateArticleDrawer'/)
    expect(codeOnly(COMPONENT)).toMatch(/<GenerateArticleDrawer newsItems=\{model\.newsItems\} \/>/)
  })

  it('renders the drawer with owned news items only', async () => {
    const model = assembleContentCenter(input({
      news: { ok: true, rows: [news(), news({ id: 'n-foreign', project_id: THEIRS, title: 'SECRET-HEADLINE' })] },
    }))
    expect(model.newsItems.map((n) => n.id)).toEqual(['n-1'])
    const html = await render(model)
    expect(html).toContain('Generate Article')
    expect(html).toContain(GENERATION_NOTE)
    expect(html).not.toContain('SECRET-HEADLINE')
  })

  it('does not offer generation when the news source could not be read', async () => {
    const html = await render(assembleContentCenter(input({ news: { ok: false, rows: [] } })))
    expect(html).not.toContain('Generate Article')
    expect(html).toContain(NEWS_UNREADABLE_NOTE)
  })

  it('offers no review, publish or hero-image control of its own', () => {
    for (const src of [COMPONENT, read('lib/os/content-center.ts'), read('lib/os/content-center-shared.ts')]) {
      const code = codeOnly(src)
      expect(code).not.toMatch(/ReviewActions|HeroImageActions|\/review|\/hero-image|\/sync|publishArticle|fetch\(/)
    }
  })

  it('every card links to the existing article page, from the registry base path', async () => {
    const model = assembleContentCenter(input())
    expect(model.cards[0].href).toBe('/atlas/content/wc-1')
    expect(await render(model)).toContain('href="/atlas/content/wc-1"')
    expect(codeOnly(read('lib/os/content-center.ts'))).toMatch(/destinationBasePath\('content_queue'\)/)
    expect(codeOnly(read('lib/os/content-center.ts'))).not.toMatch(/'\/atlas\/content/)
  })

  it('Atlas view awareness publishes the rows on screen, as the replaced page did', () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ id: 'a', title: null })] } }))
    expect(model.visibleRefs).toEqual([{ domain: 'website_content', id: 'a', label: '(article)' }])
    expect(codeOnly(COMPONENT)).toMatch(/<ViewVisibleSync refs=\{model\.visibleRefs\} \/>/)
  })

  it('the destination is labelled Content Center, one identity with the vNext nav', () => {
    expect(destinationLabel('content_queue')).toBe('Content Center')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Ownership
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · owned rows only', () => {
  it('a foreign row never becomes a card, a count or a view ref', () => {
    const model = assembleContentCenter(input({
      content: { ok: true, rows: [row(), row({ id: 'wc-foreign', project_id: THEIRS, title: 'SECRET-ARTICLE' })] },
    }))
    expect(model.cards.map((c) => c.id)).toEqual(['wc-1'])
    expect(model.counts!.total).toBe(1)
    expect(JSON.stringify(model.visibleRefs)).not.toContain('SECRET-ARTICLE')
  })

  it('a row with no project is never shown', () => {
    const model = assembleContentCenter(input({ content: { ok: true, rows: [row({ project_id: null })] } }))
    expect(model.cards).toEqual([])
  })

  it('the project label table itself only ever holds owned projects', () => {
    // Mutation 18 survived the first pass: cards are filtered before they look a
    // project up, so a foreign row in the table could not label a card — the
    // guard was unobservable. It is now a contract of its own.
    const table = ownedProjects(
      [{ id: MINE, name: 'The Prompt' }, { id: THEIRS, name: 'SECRET-PROJECT' }, { id: null, name: 'x' }],
      [MINE],
    )
    expect([...table.keys()]).toEqual([MINE])
    expect(ownedProjects([{ id: THEIRS, name: 'SECRET-PROJECT' }], [IMPOSSIBLE_PROJECT_ID]).size).toBe(0)
  })

  it('a foreign project name never labels anything', () => {
    const model = assembleContentCenter(input({
      projects: { ok: true, rows: [{ id: THEIRS, name: 'SECRET-PROJECT', slug: 's', color: null }] },
    }))
    expect(JSON.stringify(model)).not.toContain('SECRET-PROJECT')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Generation — the rollback branch returns before the vNext read
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · generation branch', () => {
  beforeEach(() => { vi.resetModules() })

  const mountPage = async (cookie: string | null) => {
    let loaderCalls = 0
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookie && n === 'omnira_ui' ? { value: cookie } : undefined) }),
    }))
    vi.doMock('@/lib/os/content-center', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/content-center')>()),
      loadContentCenter: async () => { loaderCalls += 1; return assembleContentCenter(input()) },
    }))
    vi.doMock('@/app/(platform)/atlas/content/ContentLegacy', () => ({
      ContentLegacy: () => React.createElement('div', null, 'LEGACY BODY'),
    }))
    const mod = await import('@/app/(platform)/atlas/content/page')
    const el = await mod.default()
    return { html: renderToStaticMarkup(el as React.ReactElement), loaderCalls: () => loaderCalls }
  }

  it('legacy renders the moved body and never reaches the vNext loader', async () => {
    const { html, loaderCalls } = await mountPage('legacy')
    expect(html).toContain('LEGACY BODY')
    expect(loaderCalls()).toBe(0)
  })

  it('the default generation is vNext', async () => {
    const { html } = await mountPage(null)
    expect(html).not.toContain('LEGACY BODY')
  })

  it('the page branches before it constructs the loader', () => {
    const src = codeOnly(read('app/(platform)/atlas/content/page.tsx'))
    const branch = src.indexOf('<ContentLegacy />')
    const load = src.indexOf('loadContentCenter(')
    expect(branch).toBeGreaterThan(-1)
    expect(load).toBeGreaterThan(branch)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8 · The read — session-scoped, bounded, fail-closed
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · the loader', () => {
  beforeEach(() => {
    vi.doUnmock('@/lib/os/content-center')
    vi.doUnmock('next/headers')
    vi.doUnmock('@/app/(platform)/atlas/content/ContentLegacy')
    vi.resetModules()
  })

  const TABLES = () => ({
    website_content: [row(), row({ id: 'wc-foreign', project_id: THEIRS, title: 'SECRET-ARTICLE' })],
    media_news_items: [news(), news({ id: 'n-foreign', project_id: THEIRS, title: 'SECRET-HEADLINE' })],
    projects: [
      { id: MINE, name: 'The Prompt', slug: 'ai-media-automation', color: '#6366f1' },
      { id: THEIRS, name: 'SECRET-PROJECT', slug: 's', color: null },
    ],
  })

  const fakeAdmin = (tables: Record<string, any[]>, fail: string[]) => {
    const calls: Array<{ table: string; ops: string[] }> = []
    const from = (table: string) => {
      const rec = { table, ops: [] as string[] }
      calls.push(rec)
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => { rec.ops.push('select'); return q },
        in: (c: string, v: string[]) => { rec.ops.push(`in:${c}=${v.join(',')}`); rows = rows.filter((r) => v.includes(r[c])); return q },
        eq: (c: string, v: string) => { rec.ops.push(`eq:${c}=${v}`); return q },
        order: (c: string) => { rec.ops.push(`order:${c}`); return q },
        limit: (n: number) => { rec.ops.push(`limit:${n}`); rows = rows.slice(0, n); return q },
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(fail.includes(table) ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }).then(ok, err),
      }
      return q
    }
    return { db: { from }, calls }
  }

  const mountLoader = async (o: { allowed?: string[]; fail?: string[]; accessOk?: boolean } = {}) => {
    const fake = fakeAdmin(TABLES(), o.fail ?? [])
    vi.doMock('@/lib/auth/project-access', () => ({
      resolveProjectAccess: async () =>
        o.accessOk === false ? { ok: false, response: null } : { ok: true, userId: 'user-me', allowedProjectIds: o.allowed ?? [MINE] },
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.db }))
    const { loadContentCenter } = await import('@/lib/os/content-center')
    const model = await loadContentCenter()
    return { model, calls: fake.calls }
  }

  const opsFor = (calls: Array<{ table: string; ops: string[] }>, table: string) =>
    calls.find((c) => c.table === table)?.ops ?? []

  it('returns null — and reads nothing — when the scope cannot be resolved', async () => {
    const { model, calls } = await mountLoader({ accessOk: false })
    expect(model).toBeNull()
    expect(calls).toEqual([])
  })

  it('scopes the queue inside the query, ahead of its ordering and cap', async () => {
    const { calls } = await mountLoader()
    const ops = opsFor(calls, 'website_content')
    expect(ops).toEqual(['select', `in:project_id=${MINE}`, 'order:created_at', `limit:${CONTENT_LIMITS.rows}`])
  })

  it('scopes the news picker to owned, new items', async () => {
    const { calls } = await mountLoader()
    expect(opsFor(calls, 'media_news_items')).toEqual([
      'select', `in:project_id=${MINE}`, 'eq:status=new', 'order:created_at', `limit:${CONTENT_LIMITS.news}`,
    ])
  })

  it('scopes project names on the identity column', async () => {
    const { calls } = await mountLoader()
    expect(opsFor(calls, 'projects')).toEqual(['select', `in:id=${MINE}`])
  })

  it('foreign rows never reach the model through the real read path', async () => {
    const { model } = await mountLoader()
    expect(JSON.stringify(model)).not.toMatch(/SECRET-ARTICLE|SECRET-HEADLINE|SECRET-PROJECT/)
  })

  it('an empty allow-list fails closed on every read, with no first-project fallback', async () => {
    const { model, calls } = await mountLoader({ allowed: [] })
    expect(opsFor(calls, 'website_content')).toContain(`in:project_id=${IMPOSSIBLE_PROJECT_ID}`)
    expect(opsFor(calls, 'media_news_items')).toContain(`in:project_id=${IMPOSSIBLE_PROJECT_ID}`)
    expect(opsFor(calls, 'projects')).toContain(`in:id=${IMPOSSIBLE_PROJECT_ID}`)
    expect(model!.cards).toEqual([])
  })

  it('a failing queue read is unreadable, not empty', async () => {
    const { model } = await mountLoader({ fail: ['website_content'] })
    expect(model!.state).toBe('error')
    expect(model!.counts).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Static boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · boundaries the surface must not cross', () => {
  const LOADER = read('lib/os/content-center.ts')
  const SHARED = read('lib/os/content-center-shared.ts')
  const COMPONENT = read('components/platform/vnext/ContentCenter.tsx')
  const all = [['loader', LOADER], ['component', COMPONENT], ['shared', SHARED]] as const

  it('writes nothing — no action, no mutation, no rpc', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/'use server'|\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(/)
    }
  })

  it('resolves the scope server-side and fails closed', () => {
    const code = codeOnly(LOADER)
    expect(code).toMatch(/resolveProjectAccess\(\)/)
    expect(code).toMatch(/if \(!access\.ok\) return null/)
    expect(code).toMatch(/scopeProjectFilter\(access\.allowedProjectIds\)/)
    expect(code).not.toMatch(/allowedProjectIds\[0\]|projects\[0\]/)
  })

  it('reads no environment and triggers no generation, publish, Memory or Dream', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(
        /process\.env|generateArticle|saveGeneratedArticle|generateHeroImage|syncPublishedArticle|recordMemoryEvent|atlas\/memory|runDreamCycleForProject/,
      )
    }
  })

  it('the shared half stays client-safe', () => {
    expect(codeOnly(SHARED)).not.toMatch(/server-only|supabase|createClient|from\('/)
  })

  it('the loader stays server-only', () => {
    expect(LOADER).toMatch(/^import 'server-only'/m)
  })

  it('the component is a server component and installs no handlers of its own', () => {
    expect(COMPONENT).not.toMatch(/'use client'/)
    expect(codeOnly(COMPONENT)).not.toMatch(/addEventListener|onKeyDown|onClick|useEffect|useState/)
  })

  it('the stop authority is nowhere near this surface', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/PauseToggle|toggleAutomationPause|toggleProjectExecutionPause/)
    }
  })

  it('the article detail route and its actions are untouched by this phase', () => {
    const detail = read('app/(platform)/atlas/content/[id]/page.tsx')
    expect(detail).toMatch(/\.in\('project_id', scopeProjectFilter\(allowedProjectIds\)\)/)
    expect(detail).toMatch(/<ReviewActions id=\{row\.id\} \/>/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Rollback — the legacy body is byte-identical
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · the rollback body is the body it replaced', () => {
  const LEGACY = read('app/(platform)/atlas/content/ContentLegacy.tsx')

  it('is pinned by hash, its own doc comment included', () => {
    const body = LEGACY.slice(LEGACY.indexOf('/**\n * Atlas → Content Center  (System A'))
    expect(createHash('sha256').update(body).digest('hex'))
      .toBe('c039a6572c539be3864cbb38f44ada08f3f90cbe8a7ecdec110e107d769bcb0a')
  })

  it('keeps its own scoped service-role reads and the same drawer', () => {
    expect(LEGACY).toMatch(/getAllowedProjectIds\(db, user\.id\)/)
    expect(LEGACY).toMatch(/<GenerateArticleDrawer newsItems=\{newsItems\} \/>/)
    expect(LEGACY).toMatch(/from '\.\/GenerateArticleDrawer'/)
  })

  it('the segment config moved to the page, which owns it for both generations', () => {
    expect(LEGACY).not.toMatch(/export const dynamic/)
    expect(read('app/(platform)/atlas/content/page.tsx')).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11 · Render + layout
// ─────────────────────────────────────────────────────────────────────────────

describe('content center · rendered surface and layout', () => {
  const CSS = read('components/platform/vnext/ContentCenter.module.css')

  it('the loading state claims nothing about the data', async () => {
    const { ContentCenterLoading } = await import('@/components/platform/vnext/ContentCenter')
    const html = renderToStaticMarkup(React.createElement(ContentCenterLoading))
    expect(textOf(html)).not.toMatch(/\d/)
    expect(html).toContain('Content Center')
  })

  it('prints no invented progress, health or performance figure', async () => {
    const html = await render(assembleContentCenter(input()))
    expect(textOf(html)).not.toMatch(/%|framsteg|hälsa|prestanda|engagemang|visningar|klick/i)
  })

  it('an unreadable project list does not hide the queue', async () => {
    const model = assembleContentCenter(input({ projects: { ok: false, rows: [] } }))
    expect(model.cards).toHaveLength(1)
    expect(await render(model)).toContain('Projektnamnen kunde inte läsas')
  })

  it('declares its own font, rem sizes, no sideways scroll, wrapping text', () => {
    expect(CSS).toMatch(/font-family: var\(--font-geist-sans\)/)
    expect(CSS).not.toMatch(/font-size:\s*\d+px/)
    expect(CSS).toMatch(/overflow-x: hidden/)
    expect(CSS).toMatch(/overflow-wrap: anywhere/)
  })

  it('reflows on a phone, honours reduced motion and keeps focus visible', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\)/)
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(CSS).toMatch(/\.inspect:focus-visible/)
    expect(CSS).toMatch(/\.summary:focus-visible/)
  })

  it('unreadable content is labelled, not blank', async () => {
    const html = await render(assembleContentCenter(input({ content: { ok: false, rows: [] } })))
    expect(html).toContain(UNREADABLE_LABEL)
  })
})
