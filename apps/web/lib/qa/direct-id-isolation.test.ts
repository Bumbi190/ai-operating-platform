/**
 * Direct by-id ownership isolation (Phase 9D).
 *
 * A route shaped `/.../[id]` hands an attacker the one thing a service-role
 * read needs: a primary key. `createAdminClient()` bypasses RLS, so
 * `.eq('id', id)` alone answers for EVERY row in the database.
 *
 * `atlas/content/[id]` did exactly that. It rendered the full article — title,
 * summary, body, QA report, model, cost, destination — for any id a signed-in
 * operator typed, in any project. Two of its sibling write endpoints
 * (`hero-image`, `sync`) had the same shape, and the hero-image one spends real
 * money on image generation.
 *
 * The guard is deliberately part of the QUERY for the read, and immediate and
 * server-side for the writes. Fetching first and checking after would still
 * pull a foreign row into this process, and hiding a button is not a check —
 * the request can be made without the page.
 *
 * Foreign and nonexistent must be INDISTINGUISHABLE. "This exists but is not
 * yours" confirms the row exists, which is itself the disclosure.
 *
 * `chat/[id]` is deliberately NOT changed here: it already carries
 * `.eq('user_id', user.id)`, which is a stronger, more direct ownership check
 * than a project scope for a user-owned conversation. Its Phase 9B
 * classification was a false positive from a sweep that searched for
 * project-scope helper names. These tests pin that guard so it cannot silently
 * regress into the gap it was mistakenly reported to have.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scopeProjectFilter, IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const CONTENT_DETAIL = read('app/(platform)/atlas/content/[id]/page.tsx')
const CHAT_DETAIL = read('app/(platform)/chat/[id]/page.tsx')
const HERO_ROUTE = read('app/api/content/articles/[id]/hero-image/route.ts')
const SYNC_ROUTE = read('app/api/content/articles/[id]/sync/route.ts')
const REVIEW_ROUTE = read('app/api/content/articles/[id]/review/route.ts')

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const CONTENT_CODE = codeOnly(CONTENT_DETAIL)
const CHAT_CODE = codeOnly(CHAT_DETAIL)

// ── A fake PostgREST builder that APPLIES filters ────────────────────────────

/**
 * Chainable, thenable, and it actually filters. A recorder proves a clause was
 * written; only a filter proves the clause excludes the row it exists to
 * exclude — which is the whole property under test for a by-id route.
 */
function fakeDb(tables: Record<string, any[]>) {
  const seen: { table: string; filters: [string, unknown][] }[] = []
  const from = (table: string) => {
    const rec = { table, filters: [] as [string, unknown][] }
    seen.push(rec)
    let rows = [...(tables[table] ?? [])]
    const q: any = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val])
        rows = rows.filter(r => r[col] === val)
        return q
      },
      in: (col: string, vals: unknown[]) => {
        rec.filters.push([col, vals])
        rows = rows.filter(r => vals.includes(r[col]))
        return q
      },
      order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) =>
        Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

const MINE = 'p-mine'
const THEIRS = 'p-theirs'

/** The content detail read, exactly as the page performs it. */
async function readContent(db: any, id: string, allowed: string[]) {
  const { data } = await db
    .from('website_content')
    .select('*')
    .eq('id', id)
    .in('project_id', scopeProjectFilter(allowed))
    .maybeSingle()
  return data
}

const CONTENT_ROWS = [
  { id: 'c-mine', project_id: MINE, title: 'Mine', payload: { body: 'ok' } },
  { id: 'c-theirs', project_id: THEIRS, title: 'SECRET', payload: { body: 'CONFIDENTIAL' } },
]

// ═══ Content detail — read ═══════════════════════════════════════════════════

describe('9D · atlas/content/[id] — the read is ownership-scoped', () => {
  it('an owned id renders', async () => {
    const { db } = fakeDb({ website_content: CONTENT_ROWS })
    const row = await readContent(db, 'c-mine', [MINE])
    expect(row?.id).toBe('c-mine')
  })

  it('a FOREIGN id returns nothing — the row never reaches the process', async () => {
    const { db } = fakeDb({ website_content: CONTENT_ROWS })
    const row = await readContent(db, 'c-theirs', [MINE])
    expect(row).toBeNull()
    expect(JSON.stringify(row)).not.toContain('CONFIDENTIAL')
  })

  it('a foreign id is INDISTINGUISHABLE from a nonexistent id', async () => {
    const { db } = fakeDb({ website_content: CONTENT_ROWS })
    const foreign = await readContent(db, 'c-theirs', [MINE])
    const missing = await readContent(db, 'no-such-id', [MINE])
    expect(foreign).toEqual(missing)     // both null → both notFound()
  })

  it('an EMPTY allow-list fails closed, and issues the impossible id', async () => {
    const { db, seen } = fakeDb({ website_content: CONTENT_ROWS })
    expect(await readContent(db, 'c-mine', [])).toBeNull()
    expect(seen[0].filters).toContainEqual(['project_id', [IMPOSSIBLE_PROJECT_ID]])
  })

  it('BOTH predicates are applied — id alone never selects a row', async () => {
    const { db, seen } = fakeDb({ website_content: CONTENT_ROWS })
    await readContent(db, 'c-mine', [MINE])
    const cols = seen[0].filters.map(([c]) => c)
    expect(cols).toContain('id')
    expect(cols).toContain('project_id')
  })

  it('the page performs the scope in the query, not after fetching', () => {
    // The `.in(...)` must sit inside the same chain as the `.eq('id', …)`.
    const stmt = CONTENT_CODE.slice(
      CONTENT_CODE.indexOf("from('website_content')"),
      CONTENT_CODE.indexOf('if (!row)'),
    )
    expect(stmt).toMatch(/\.eq\('id', params\.id\)/)
    expect(stmt).toMatch(/\.in\('project_id', scopeProjectFilter\(allowedProjectIds\)\)/)
  })

  it('resolves the allow-list through the canonical boundary, with no fallback', () => {
    expect(CONTENT_CODE).toMatch(/getAllowedProjectIds\(db, user\.id\)/)
    expect(CONTENT_CODE).not.toMatch(/allowedProjectIds\[0\]|projects\[0\]/)
    expect(CONTENT_CODE).not.toMatch(/searchParams|params\.project|project_id\s*=\s*[^ ]*query/)
  })

  it('discloses nothing about a foreign row — no diagnostic, no redirect', () => {
    // Comment-stripped: the page's own comment EXPLAINS why it discloses
    // nothing, and matching that prose instead of rendered output would fail on
    // the documentation rather than on the behaviour.
    expect(CONTENT_CODE).not.toMatch(/another project|other project|not yours|forbidden/i)
    // notFound() is the single outcome; nothing redirects into an owned project.
    expect(CONTENT_CODE).toMatch(/if \(!row\) notFound\(\)/)
    const afterRead = CONTENT_CODE.slice(CONTENT_CODE.indexOf('if (!row)'))
    expect(afterRead).not.toMatch(/redirect\(/)
  })

  it('renders no secondary project-owned read that would need its own scope', () => {
    // The whole page is built from the single scoped row; a second admin read
    // here would need scoping of its own.
    const reads = [...CONTENT_CODE.matchAll(/\.from\('(\w+)'\)/g)].map(m => m[1])
    expect(reads).toEqual(['website_content'])
  })
})

// ═══ Content detail — reachable writes ═══════════════════════════════════════

describe('9D · content write endpoints enforce ownership server-side', () => {
  const ROUTES: [string, string][] = [
    ['hero-image', HERO_ROUTE],
    ['sync', SYNC_ROUTE],
    ['review', REVIEW_ROUTE],
  ]

  it('every by-id article write checks the row against the caller’s projects', () => {
    for (const [name, src] of ROUTES) {
      const code = codeOnly(src)
      expect(code, `${name} must resolve the allow-list`).toMatch(/getAllowedProjectIds/)
      expect(code, `${name} must assert ownership`).toMatch(/assertProjectAllowed/)
    }
  })

  it('ownership is checked BEFORE the side-effecting call', () => {
    for (const [name, src, effect] of [
      ['hero-image', HERO_ROUTE, 'generateHeroImage('],
      ['sync', SYNC_ROUTE, 'syncPublishedArticle('],
    ] as const) {
      const code = codeOnly(src)
      const guard = code.indexOf('assertProjectAllowed')
      const call = code.lastIndexOf(effect)
      expect(guard, `${name}: no guard`).toBeGreaterThan(-1)
      expect(call, `${name}: no effect call`).toBeGreaterThan(-1)
      expect(call, `${name}: effect runs before the guard`).toBeGreaterThan(guard)
    }
  })

  it('a refused write is indistinguishable from a missing article', () => {
    // Both branches answer 404 with the same body; a 403 would confirm the
    // article exists in someone else's project.
    for (const [name, src] of [['hero-image', HERO_ROUTE], ['sync', SYNC_ROUTE]] as const) {
      const code = codeOnly(src)
      const notFoundResponses = [...code.matchAll(/status: 404/g)].length
      expect(notFoundResponses, `${name} needs both 404 branches`).toBe(2)
      expect(code, `${name} must not reveal a foreign row via 403`).not.toMatch(/status: 403/)
    }
  })

  it('the UI hiding a control is not treated as authorization', () => {
    // The detail page renders the buttons only for pending_review, but the
    // endpoints do not rely on that.
    expect(CONTENT_DETAIL).toMatch(/row\.status === 'pending_review'/)
    for (const [, src] of ROUTES) {
      expect(codeOnly(src)).toMatch(/assertProjectAllowed/)
    }
  })
})

// ═══ Chat detail — already guarded, pinned so it cannot regress ══════════════

describe('9D · chat/[id] — user ownership was already enforced', () => {
  const CONVS = [
    { id: 'k-mine', user_id: 'u-1', title: 'Mine', project_id: MINE },
    { id: 'k-theirs', user_id: 'u-2', title: 'SECRET', project_id: THEIRS },
  ]
  const MSGS = [
    { conversation_id: 'k-mine', role: 'user', content: 'hello' },
    { conversation_id: 'k-theirs', role: 'user', content: 'CONFIDENTIAL' },
  ]

  /** The conversation read, exactly as the page performs it. */
  const readConv = async (db: any, id: string, userId: string) =>
    (await db.from('conversations').select('*').eq('id', id).eq('user_id', userId).maybeSingle()).data

  it('an owned conversation loads', async () => {
    const { db } = fakeDb({ conversations: CONVS })
    expect((await readConv(db, 'k-mine', 'u-1'))?.id).toBe('k-mine')
  })

  it('a FOREIGN conversation returns nothing — no title, no metadata', async () => {
    const { db } = fakeDb({ conversations: CONVS })
    const conv = await readConv(db, 'k-theirs', 'u-1')
    expect(conv).toBeNull()
    expect(JSON.stringify(conv)).not.toContain('SECRET')
  })

  it('a foreign id is indistinguishable from a nonexistent one', async () => {
    const { db } = fakeDb({ conversations: CONVS })
    expect(await readConv(db, 'k-theirs', 'u-1')).toEqual(await readConv(db, 'nope', 'u-1'))
  })

  it('messages are fetched ONLY after ownership resolves — the transitive guarantee', () => {
    // `conversation_messages` has neither project_id nor user_id; its only link
    // is `conversation_id`. It therefore cannot be scoped on its own, and its
    // safety rests entirely on the conversation being ownership-checked first
    // and the page bailing out before the message query runs.
    const convAt = CHAT_CODE.indexOf("from('conversations')")
    const bailAt = CHAT_CODE.indexOf('if (!conv)')
    const msgAt = CHAT_CODE.indexOf("from('conversation_messages')")
    expect(convAt).toBeGreaterThan(-1)
    expect(bailAt).toBeGreaterThan(convAt)
    expect(msgAt).toBeGreaterThan(bailAt)
  })

  it('the conversation query carries BOTH the id and the owner predicate', () => {
    const stmt = CHAT_CODE.slice(
      CHAT_CODE.indexOf("from('conversations')"),
      CHAT_CODE.indexOf('if (!conv)'),
    )
    expect(stmt).toMatch(/\.eq\('id', id\)/)
    expect(stmt).toMatch(/\.eq\('user_id', user\.id\)/)
  })

  it('a foreign conversation never reaches the message query', async () => {
    const { db, seen } = fakeDb({ conversations: CONVS, conversation_messages: MSGS })
    const conv = await readConv(db, 'k-theirs', 'u-1')
    if (conv) throw new Error('guard failed — foreign conversation resolved')
    expect(seen.some(s => s.table === 'conversation_messages')).toBe(false)
  })

  it('discloses nothing on refusal — a neutral redirect, no diagnostic', () => {
    expect(CHAT_CODE).toMatch(/if \(!conv\) redirect\('\/chat'\)/)
    expect(CHAT_CODE).not.toMatch(/another project|not yours|forbidden|unauthorized/i)
  })
})
