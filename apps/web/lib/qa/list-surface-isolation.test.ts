/**
 * Platform list-surface isolation (Phase 9G).
 *
 * Two list surfaces read project-owned data through the SERVICE-ROLE client,
 * which bypasses RLS, and neither re-applied the project boundary.
 *
 *   atlas/content   `website_content` (the whole editorial queue: titles,
 *                   summaries, QA verdicts, models, costs, destination URLs)
 *                   AND `media_news_items` (the Generate-Article picker's
 *                   headlines). TWO project-owned tables on one page — scoping
 *                   one and leaving the other global is still a leak, which is
 *                   why a test here asserts both independently.
 *
 *   chat            the project PICKER listed every project in the database —
 *                   id, name and slug — to any signed-in operator. Names and
 *                   slugs alone disclose what other tenants are working on.
 *
 * THE CHAT CONVERSATION LIST IS NOT PART OF THAT. It was already correct via
 * `conversations.user_id`, and this phase deliberately does not touch it. The
 * two dimensions coexist on one page and must not be conflated: a conversation
 * is USER-owned, a project is PROJECT-authorised. A regression test below pins
 * that the conversation query keeps its `user_id` predicate and does not drift
 * into project semantics — a conversation may carry no project at all, so that
 * substitution would weaken it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scopeProjectFilter, IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const CONTENT_LIST = read('app/(platform)/atlas/content/page.tsx')
const CHAT_LIST = read('app/(platform)/chat/page.tsx')

const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const CONTENT_CODE = codeOnly(CONTENT_LIST)
const CHAT_CODE = codeOnly(CHAT_LIST)

/**
 * Slice between two markers, searching for `end` AFTER `start`, asserting both.
 * An unguarded indexOf pair yields '' when `end` precedes `start`, and '' passes
 * every negative assertion — a silent pass on a check that never ran.
 */
function between(src: string, start: string, end: string): string {
  const from = src.indexOf(start)
  expect(from, `start marker not found: ${start}`).toBeGreaterThan(-1)
  const to = src.indexOf(end, from + start.length)
  expect(to, `end marker not found after start: ${end}`).toBeGreaterThan(from)
  return src.slice(from, to)
}

// ── A fake builder that APPLIES filters ──────────────────────────────────────
// A recorder proves a clause was written; only a filter proves it excludes the
// row it exists to exclude.
interface Seen { table: string; filters: [string, unknown][] }

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, filters: [] }
    seen.push(rec)
    let rows = [...(tables[table] ?? [])]
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { rec.filters.push([c, v]); rows = rows.filter(r => r[c] === v); return q },
      in: (c: string, v: unknown[]) => { rec.filters.push([c, v]); rows = rows.filter(r => v.includes(r[c])); return q },
      order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

const MINE = 'p-mine'
const THEIRS = 'p-theirs'
const ME = 'user-me'

const CONTENT = [
  { id: 'wc-mine', project_id: MINE, title: 'My article', status: 'pending_review' },
  { id: 'wc-theirs', project_id: THEIRS, title: 'SECRET-ARTICLE', status: 'pending_review' },
]
const NEWS = [
  { id: 'n-mine', project_id: MINE, title: 'My headline', status: 'new' },
  { id: 'n-theirs', project_id: THEIRS, title: 'SECRET-HEADLINE', status: 'new' },
]
const PROJECTS = [
  { id: MINE, name: 'My Project', slug: 'my-project' },
  { id: THEIRS, name: 'SECRET-PROJECT-NAME', slug: 'secret-project-slug' },
]
const CONVERSATIONS = [
  { id: 'c-mine', user_id: ME, title: 'Mine', project_id: MINE },
  { id: 'c-theirs', user_id: 'user-other', title: 'SECRET-CONVERSATION', project_id: THEIRS },
]

/** The two content-list reads, exactly as the page performs them. */
const readContent = async (db: any, allowed: string[]) =>
  (await db.from('website_content').select('*')
    .in('project_id', scopeProjectFilter(allowed))
    .order().limit(200)).data
const readNews = async (db: any, allowed: string[]) =>
  (await db.from('media_news_items').select('*')
    .in('project_id', scopeProjectFilter(allowed))
    .eq('status', 'new').order().limit(30)).data
/** The picker read, exactly as the page performs it. */
const readPicker = async (db: any, allowed: string[]) =>
  (await db.from('projects').select('*')
    .in('id', scopeProjectFilter(allowed)).order()).data

// ═══ Content list ════════════════════════════════════════════════════════════

describe('9G · atlas/content list — both project-owned tables are scoped', () => {
  const seed = () => fakeDb({ website_content: CONTENT, media_news_items: NEWS })

  it('owned website_content is included', async () => {
    const { db } = seed()
    expect((await readContent(db, [MINE])).map((r: any) => r.id)).toEqual(['wc-mine'])
  })

  it('foreign website_content is excluded — no title, no row', async () => {
    const { db } = seed()
    const rows = await readContent(db, [MINE])
    expect(rows.map((r: any) => r.project_id)).not.toContain(THEIRS)
    expect(JSON.stringify(rows)).not.toContain('SECRET-ARTICLE')
  })

  it('owned media_news_items is included', async () => {
    const { db } = seed()
    expect((await readNews(db, [MINE])).map((r: any) => r.id)).toEqual(['n-mine'])
  })

  it('foreign media_news_items is excluded — the picker cannot show foreign headlines', async () => {
    const { db } = seed()
    const rows = await readNews(db, [MINE])
    expect(rows.map((r: any) => r.project_id)).not.toContain(THEIRS)
    expect(JSON.stringify(rows)).not.toContain('SECRET-HEADLINE')
  })

  it('an EMPTY scope excludes every project-owned row from both tables', async () => {
    const { db, seen } = seed()
    expect(await readContent(db, [])).toEqual([])
    expect(await readNews(db, [])).toEqual([])
    for (const q of seen) {
      expect(q.filters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
    }
  })

  it('ONE scoped source cannot hide another unscoped one — both carry a scope clause', () => {
    // Statement-bounded: each read is cut at the start of the next, so a clause
    // belonging to the neighbouring query can never satisfy this assertion.
    const wc = between(CONTENT_CODE, "from('website_content')", "from('media_news_items')")
    expect(wc).toMatch(/\.in\('project_id', scopedIds\)/)

    const news = between(CONTENT_CODE, "from('media_news_items')", 'const byStatus')
    expect(news).toMatch(/\.in\('project_id', scopedIds\)/)
  })

  it('scope comes from the canonical boundary, with no fallback', () => {
    expect(CONTENT_CODE).toMatch(/getAllowedProjectIds\(db, user\.id\)/)
    expect(CONTENT_CODE).toMatch(/scopeProjectFilter\(allowedProjectIds\)/)
    expect(CONTENT_CODE).not.toMatch(/allowedProjectIds\[0\]|projects\[0\]/)
    expect(CONTENT_CODE).not.toMatch(/\.in\('project_id', allowedProjectIds\)/)
  })

  it('the Atlas view-awareness refs are built from the scoped rows only', () => {
    // `visibleRefs` publishes on-screen record ids into Atlas's context. It is
    // derived from `rows`, so scoping the query scopes this too — but only as
    // long as nothing re-reads the table for it.
    const refs = between(CONTENT_CODE, 'const visibleRefs', '</OSPage>')
    expect(refs).not.toMatch(/\.from\(/)
    expect(CONTENT_CODE).toMatch(/const visibleRefs = rows\./)
  })
})

// ═══ Chat project picker ═════════════════════════════════════════════════════

describe('9G · chat project picker — only authorised projects', () => {
  const seed = () => fakeDb({ projects: PROJECTS, conversations: CONVERSATIONS })

  it('an allowed project appears', async () => {
    const { db } = seed()
    expect((await readPicker(db, [MINE])).map((p: any) => p.id)).toEqual([MINE])
  })

  it('a foreign project does not appear at all', async () => {
    const { db } = seed()
    expect((await readPicker(db, [MINE])).map((p: any) => p.id)).not.toContain(THEIRS)
  })

  it('a foreign project NAME is never rendered', async () => {
    const { db } = seed()
    expect(JSON.stringify(await readPicker(db, [MINE]))).not.toContain('SECRET-PROJECT-NAME')
  })

  it('a foreign project SLUG is never rendered', async () => {
    const { db } = seed()
    expect(JSON.stringify(await readPicker(db, [MINE]))).not.toContain('secret-project-slug')
  })

  it('an EMPTY scope shows no projects, never all of them', async () => {
    const { db, seen } = seed()
    expect(await readPicker(db, [])).toEqual([])
    expect(seen[0].filters).toContainEqual(['id', [IMPOSSIBLE_PROJECT_ID]])
  })

  it('the picker query is scoped by id through the canonical boundary', () => {
    const picker = between(CHAT_CODE, "from('projects')", '.order(')
    expect(picker).toMatch(/\.in\('id', scopeProjectFilter\(await getAllowedProjectIds\(db, user\.id\)\)\)/)
  })

  it('no first-project or global fallback on the page', () => {
    expect(CHAT_CODE).not.toMatch(/projects\[0\]|allowedProjectIds\[0\]/)
    expect(CHAT_CODE).not.toMatch(/projects \?\? \[\]\s*:/)
  })
})

// ═══ Chat conversations — regression, NOT changed by 9G ══════════════════════

describe('9G · the conversation list keeps its own ownership dimension', () => {
  it('conversations are still scoped by user_id', () => {
    const conv = between(CHAT_CODE, "from('conversations')", "from('projects')")
    expect(conv).toMatch(/\.eq\('user_id', user\.id\)/)
  })

  it('9G did NOT replace user ownership with project semantics', () => {
    // A conversation may carry no project at all, so scoping it by project
    // would both weaken and break it. The predicate must stay user_id.
    const conv = between(CHAT_CODE, "from('conversations')", "from('projects')")
    expect(conv).not.toMatch(/\.in\('project_id'/)
    expect(conv).not.toMatch(/scopeProjectFilter/)
  })

  it('a foreign user’s conversation is still excluded behaviourally', async () => {
    const { db } = fakeDb({ conversations: CONVERSATIONS })
    const rows = (await db.from('conversations').select('*').eq('user_id', ME).order().limit(50)).data
    expect(rows.map((c: any) => c.id)).toEqual(['c-mine'])
    expect(JSON.stringify(rows)).not.toContain('SECRET-CONVERSATION')
  })

  it('the two dimensions are applied to different tables, not merged', () => {
    const conv = between(CHAT_CODE, "from('conversations')", "from('projects')")
    const picker = between(CHAT_CODE, "from('projects')", '.order(')
    expect(conv).toMatch(/user_id/)
    expect(conv).not.toMatch(/getAllowedProjectIds/)
    expect(picker).toMatch(/getAllowedProjectIds/)
    expect(picker).not.toMatch(/user_id/)
  })
})
