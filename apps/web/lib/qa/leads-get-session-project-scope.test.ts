/**
 * LEADS_GET_SESSION_PROJECT_SCOPE — GET /api/business/leads reads only the
 * caller's own projects.
 *
 * These drive the REAL route against the REAL `listLeads`, with only the
 * database beneath it substituted. That matters: the hole this closes lived in
 * the store, not the route, so a test that mocked `listLeads` would have been
 * green throughout and proved nothing. The mock records the filters that
 * reached each SELECT, so scoping can be asserted at the query boundary rather
 * than inferred from the rows that came back.
 *
 * ── THE HOLE ─────────────────────────────────────────────────────────────────
 *
 * Authenticating a user is not authorizing a project. GET proved only that
 * someone was logged in and then handed the query to `listLeads`, which ran
 * service-role with NO project predicate. With no filter it returned EVERY lead
 * in EVERY project; with a foreign `project_id` it aimed the query straight at
 * another tenant. Same class as the campaigns/revenue GET holes 4B1 closed —
 * `listCampaigns` got the `applyProjectScope` line and `listLeads` never did.
 *
 * Leads is the one of the three with real production data, which is why the
 * leak test below asserts on FIELD VALUES and not just row counts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const ROUTE = 'app/api/business/leads/route.ts'
const STORE = 'lib/business/store.ts'

const LEGACY_KEY = 'legacy-global-key-value-do-not-change'
const USER       = 'user-owner-1'
const OTHER      = 'user-owner-2'
const PROJ_A     = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PROJ_A2    = 'a2a2a2a2-1111-4111-8111-a2a2a2a2a2a2'
const PROJ_B     = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const UNKNOWN_P  = 'dddddddd-4444-4444-8444-dddddddddddd'
const IMPOSSIBLE = '00000000-0000-0000-0000-000000000000'

/** Distinct, recognisable foreign values — see the leak test. */
const SECRET_EMAIL  = 'foreign-tenant-contact@example-b.test'
const SECRET_NAME   = 'Foreign Tenant Person'
const SECRET_SOURCE = 'foreign-tenant-funnel'
const SECRET_VALUE  = 987654

let sessionUser: { id: string } | null = null
let allProjects: { id: string; slug: string; owner_id: string }[] = []
let leadRows: Record<string, unknown>[] = []
let selects: { table: string; filters: Record<string, unknown> }[] = []

/**
 * `getUser` is called TWICE per request — once by `resolveLeadsAuth` and once
 * by `resolveProjectAccess` inside `resolveSessionScope`. `sessionUserQueue`
 * lets a test answer differently per call, which is the only way to reach the
 * cross-check that fires when the two reads disagree.
 */
let sessionUserQueue: ({ id: string } | null)[] | null = null
let getUserCalls = 0

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        const u = sessionUserQueue
          ? (sessionUserQueue[getUserCalls] ?? sessionUserQueue[sessionUserQueue.length - 1])
          : sessionUser
        getUserCalls++
        return { data: { user: u } }
      },
    },
  }),
}))

function rowsOf(table: string): Record<string, unknown>[] {
  if (table === 'projects') return allProjects as unknown as Record<string, unknown>[]
  if (table === 'leads') return leadRows
  throw new Error(`unexpected table: ${table}`)
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      let lim: number | undefined
      const matching = () => {
        const out = rowsOf(table).filter(r =>
          Object.entries(f).every(([k, v]) =>
            k === '__inCol' || k === '__inVals' ? true : r[k] === v) &&
          (f.__inVals === undefined ||
            (f.__inVals as string[]).includes(r[f.__inCol as string] as string)))
        return lim === undefined ? out : out.slice(0, lim)
      }
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        limit: (n: number) => { lim = n; return b },
        eq: (c: string, v: unknown) => { f[c] = v; return b },
        in: (c: string, v: string[]) => { f.__inCol = c; f.__inVals = v; return b },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (res: (x: unknown) => unknown, rej: (x: unknown) => unknown) => {
          selects.push({ table, filters: { ...f } })
          return Promise.resolve({ data: matching(), error: null }).then(res, rej)
        },
      }
      return b
    },
  }),
}))

const { GET } = await import('@/app/api/business/leads/route')

const get = (qs = '', token?: string) =>
  new Request(`https://x.test/api/business/leads${qs}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

/** The `.in()` values that reached the last SELECT on `table`. */
const scopeOf = (table: string) => {
  const s = [...selects].reverse().find(x => x.table === table)
  return s?.filters.__inVals as string[] | undefined
}
const scopeColOf = (table: string) => {
  const s = [...selects].reverse().find(x => x.table === table)
  return s?.filters.__inCol as string | undefined
}
const idsOf = async (res: Response) => ((await res.json()) as { id: string }[]).map(r => r.id)

beforeEach(() => {
  sessionUser = { id: USER }
  sessionUserQueue = null; getUserCalls = 0
  selects = []
  allProjects = [
    { id: PROJ_A,  slug: 'alpha',  owner_id: USER },
    { id: PROJ_A2, slug: 'alpha2', owner_id: USER },
    { id: PROJ_B,  slug: 'beta',   owner_id: OTHER },
  ]
  leadRows = [
    { id: 'lead-a',  project_id: PROJ_A,  email: 'a@own.test',  name: 'Own A',  source: 'own', status: 'new',       value_sek: 1 },
    { id: 'lead-a2', project_id: PROJ_A2, email: 'a2@own.test', name: 'Own A2', source: 'own', status: 'qualified', value_sek: 2 },
    { id: 'lead-b',  project_id: PROJ_B,  email: SECRET_EMAIL,  name: SECRET_NAME, source: SECRET_SOURCE, status: 'new', value_sek: SECRET_VALUE },
  ]
  process.env.AIOPS_API_KEY = LEGACY_KEY
})

// ── A–F. Read scope ─────────────────────────────────────────────────────────

describe('GET reads only the caller\'s own projects', () => {
  it('A. no filter → own projects only, never the foreign lead', async () => {
    const res = await GET(get())
    expect(res.status).toBe(200)
    const ids = await idsOf(res)
    expect(ids.sort()).toEqual(['lead-a', 'lead-a2'])
    expect(ids).not.toContain('lead-b')
  })

  it('B. own project filter → that project', async () => {
    const ids = await idsOf(await GET(get(`?project_id=${PROJ_A}`)))
    expect(ids).toEqual(['lead-a'])
  })

  it('C. foreign project filter → empty, not foreign rows', async () => {
    const ids = await idsOf(await GET(get(`?project_id=${PROJ_B}`)))
    expect(ids).toEqual([])
  })

  it('D. unknown project filter → empty', async () => {
    const ids = await idsOf(await GET(get(`?project_id=${UNKNOWN_P}`)))
    expect(ids).toEqual([])
  })

  it('C=D. foreign and unknown are indistinguishable — no existence oracle', async () => {
    const foreign = await GET(get(`?project_id=${PROJ_B}`))
    const unknown = await GET(get(`?project_id=${UNKNOWN_P}`))
    expect(foreign.status).toBe(unknown.status)
    expect(await foreign.json()).toEqual(await unknown.json())
  })

  it('E. two owned projects → rows from both, and only those', async () => {
    const ids = await idsOf(await GET(get()))
    expect(ids.sort()).toEqual(['lead-a', 'lead-a2'])
  })

  it('F. a user owning zero projects reads nothing', async () => {
    sessionUser = { id: 'user-with-nothing' }
    const ids = await idsOf(await GET(get()))
    expect(ids).toEqual([])
  })
})

// ── G–H. The predicate itself, at the DB boundary ───────────────────────────

describe('scoping happens at the query boundary', () => {
  it('G. the leads SELECT carries the allow-list', async () => {
    await GET(get())
    expect(scopeOf('leads')?.sort()).toEqual([PROJ_A, PROJ_A2].sort())
    expect(scopeColOf('leads')).toBe('project_id')
  })

  it('G2. a narrowing filter still leaves the allow-list on the query', async () => {
    await GET(get(`?project_id=${PROJ_A}`))
    expect(scopeOf('leads')).toBeDefined()
    expect(scopeColOf('leads')).toBe('project_id')
  })

  it('H. an empty allow-list becomes the impossible id, never an open query', async () => {
    sessionUser = { id: 'user-with-nothing' }
    await GET(get())
    const scope = scopeOf('leads')
    expect(scope).toEqual([IMPOSSIBLE])
    expect(scope).not.toEqual([])
    expect(scope).toBeDefined()
  })

  it('H2. every leads SELECT is scoped — none runs unfiltered', async () => {
    await GET(get())
    await GET(get(`?project_id=${PROJ_A}`))
    await GET(get('?status=new'))
    const leadSelects = selects.filter(s => s.table === 'leads')
    expect(leadSelects.length).toBeGreaterThan(0)
    for (const s of leadSelects) expect(s.filters.__inVals).toBeDefined()
  })
})

// ── I–J. Existing query features still work, inside the scope ───────────────

describe('filters compose with the scope rather than widening it', () => {
  it('I. status filter works within the scope', async () => {
    const ids = await idsOf(await GET(get('?status=qualified')))
    expect(ids).toEqual(['lead-a2'])
  })

  it('I2. a status matching only the foreign lead returns nothing', async () => {
    leadRows.push({ id: 'lead-b2', project_id: PROJ_B, status: 'won', email: SECRET_EMAIL })
    const ids = await idsOf(await GET(get('?status=won')))
    expect(ids).toEqual([])
  })

  it('J. limit still applies and does not widen the scope', async () => {
    const ids = await idsOf(await GET(get('?limit=1')))
    expect(ids).toHaveLength(1)
    expect(ids[0]).not.toBe('lead-b')
    expect(scopeOf('leads')).toBeDefined()
  })
})

// ── 12. Data leak — assert on VALUES, not counts ────────────────────────────

describe('no foreign field value ever reaches the response', () => {
  const cases = ['', `?project_id=${PROJ_B}`, `?project_id=${UNKNOWN_P}`, '?status=new', '?limit=100']

  for (const qs of cases) {
    it(`GET '${qs || '(no query)'}' leaks no foreign value`, async () => {
      const body = await (await GET(get(qs))).text()
      expect(body).not.toContain(SECRET_EMAIL)
      expect(body).not.toContain(SECRET_NAME)
      expect(body).not.toContain(SECRET_SOURCE)
      expect(body).not.toContain(String(SECRET_VALUE))
      expect(body).not.toContain(PROJ_B)
    })
  }
})

// ── 11. Auth regressions (4B3 must not come back) ───────────────────────────

describe('GET auth is unchanged by this fix', () => {
  it('no session → 401', async () => {
    sessionUser = null
    const res = await GET(get())
    expect(res.status).toBe(401)
    expect(selects.filter(s => s.table === 'leads')).toHaveLength(0)
  })

  it('non-omn bearer → 401', async () => {
    sessionUser = null
    expect((await GET(get('', 'sk-live-not-ours'))).status).toBe(401)
  })

  it('a VALID legacy key → 401, and reads nothing', async () => {
    sessionUser = null
    const res = await GET(get('', LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(selects.filter(s => s.table === 'leads')).toHaveLength(0)
  })

  it('a project credential bearer → still denied, NO_READ_SCOPE unchanged', async () => {
    sessionUser = null
    const res = await GET(get('', 'omn_deadbeefdeadbeef_' + 'A'.repeat(43)))
    expect(res.status).toBe(401)
    expect(selects.filter(s => s.table === 'leads')).toHaveLength(0)
  })

  it('a valid session still works despite a stale bearer', async () => {
    const ids = await idsOf(await GET(get('', LEGACY_KEY)))
    expect(ids.sort()).toEqual(['lead-a', 'lead-a2'])
  })

  /**
   * The two session reads disagreeing is the state `resolveSessionScope`'s
   * cross-check exists for — a session that changes between the auth read and
   * the access read. Simulated here by answering the two `getUser` calls
   * differently, which is the only way to reach that branch at all.
   */
  it('fails closed when the two session reads disagree', async () => {
    sessionUserQueue = [{ id: USER }, { id: OTHER }]
    const res = await GET(get())
    expect(res.status).toBe(403)
    expect(selects.filter(s => s.table === 'leads')).toHaveLength(0)
  })

  it('leaks nothing when the two session reads disagree', async () => {
    sessionUserQueue = [{ id: USER }, { id: OTHER }]
    const body = await (await GET(get())).text()
    expect(body).not.toContain(SECRET_EMAIL)
    expect(body).not.toContain('lead-a')
  })

  it('userId comes from the session, never from the query string', async () => {
    const ids = await idsOf(await GET(get(`?user_id=${OTHER}&owner_id=${OTHER}`)))
    expect(ids.sort()).toEqual(['lead-a', 'lead-a2'])
  })
})

// ── 13. Structural invariants ───────────────────────────────────────────────

describe('source invariants', () => {
  it('the GET handler resolves the session scope and passes it down', () => {
    const src = read(ROUTE)
    const getBody = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(getBody).toContain('resolveSessionScope')
    expect(getBody).toContain('allowedProjectIds')
  })

  it('listLeads scopes at the query boundary on project_id', () => {
    // Slice from the end of the (multi-line) signature to the next top-level
    // export, so this reads the BODY. Slicing on the first `\n}` would stop at
    // the signature's own closing brace and assert against nothing.
    const src = read(STORE)
    const fn = src.slice(src.indexOf('export async function listLeads'))
    const bodyStart = fn.indexOf('const db = createAdminClient()')
    const next = fn.indexOf('\nexport ', bodyStart)
    const body = fn.slice(bodyStart, next === -1 ? undefined : next)
    expect(body).toContain('applyProjectScope')
    expect(body).not.toContain('.filter(')
  })

  it('listLeads requires the allow-list — it cannot be called unscoped', () => {
    const src = read(STORE)
    const sig = src.slice(src.indexOf('export async function listLeads'))
    const head = sig.slice(0, sig.indexOf(')'))
    expect(head).toContain('allowedProjectIds: string[]')
    expect(head).not.toContain('allowedProjectIds?')
    // and no `= {}` default, which would reintroduce a callable-with-nothing form
    expect(head).not.toContain('= {}')
  })

  /**
   * The non-user guard in GET cannot be reached through the real resolver:
   * NO_READ_SCOPE denies the credential class and no other class exists. No
   * behavioural test can kill a mutant that deletes it, so it is locked
   * structurally instead — which is the honest coverage for defensive code that
   * exists because the build ignores type errors.
   */
  it('GET keeps its fail-closed guard for a non-user class', () => {
    const src = read(ROUTE)
    const getBody = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(getBody).toContain("auth.auth.kind !== 'user'")
    expect(getBody).toMatch(/status:\s*401/)
    // the guard must come BEFORE the scope resolution and the read
    expect(getBody.indexOf("kind !== 'user'")).toBeLessThan(getBody.indexOf('resolveSessionScope'))
  })

  it('POST is untouched by this change', () => {
    const src = read(ROUTE)
    const post = src.slice(src.indexOf('export async function POST'))
    expect(post).toContain("auth.auth.kind === 'project_credential'")
    expect(post).toContain("auth.auth.kind === 'user'")
    expect(post).toContain('PROJECT_KEYS')
    expect(post).toContain('auth.auth.principal.projectId')
    expect(post).toContain('resolveSessionLeadProject')
    expect(post).toContain('const unhandled: never = auth.auth')
  })

  it('4B3 holds: no legacy class anywhere in leads', () => {
    expect(read(ROUTE)).not.toContain('legacy_api_key')
    expect(read('lib/business/leads-auth.ts')).not.toContain("from '@/lib/api-auth'")
  })
})
