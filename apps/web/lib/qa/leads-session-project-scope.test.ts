/**
 * LEADS_SESSION_PROJECT_SCOPE — the session path may only write to a project
 * the authenticated user actually owns.
 *
 * THE HOLE THIS CLOSES. Authenticating a user is not authorizing a project.
 * Before this, POST /api/business/leads proved only that someone was logged in
 * and handed the body to `createLead`, whose `resolveProjectId` takes
 * `project_id` verbatim and resolves `project_slug` service-role with no owner
 * filter. Any logged-in user could write a lead into any tenant's project.
 *
 * The tests drive the REAL route against a projects table with real ownership,
 * so `getAllowedProjectIds` runs for actual rather than stubbed input. The
 * decisive assertion in almost every case is not the status code but
 * `createLeadCalls` — a denial that still reached the store would be a failure
 * dressed as a 403.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const ROUTE_PATH = 'app/api/business/leads/route.ts'
const AUTH_PATH  = 'lib/business/leads-auth.ts'
const SHARED_AUTH_PATH = 'lib/business/business-auth.ts'

const LEGACY_KEY = 'legacy-global-key'
const USER       = 'user-owner-1'
const OTHER_USER = 'user-owner-2'
const PROJ_A     = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PROJ_A2    = 'a2a2a2a2-1111-4111-8111-a2a2a2a2a2a2'
const PROJ_B     = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const UNKNOWN    = 'dddddddd-4444-4444-8444-dddddddddddd'

let sessionUser: { id: string } | null = null
/** Successive getUser results, for a session that changes mid-request. */
let sessionSequence: ({ id: string } | null)[] | null = null
/** Simulates a driver returning BOTH a row and an error — data must not win. */
let projectsErrorWithData = false
let allProjects: { id: string; slug: string; owner_id: string }[] = []
let projectsError: unknown = null
let createLeadCalls: unknown[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        const user = sessionSequence !== null
          ? (sessionSequence.shift() ?? null)
          : sessionUser
        return { data: { user } }
      },
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'projects') throw new Error(`unexpected table: ${table}`)
      const f: Record<string, unknown> = {}
      const rows = () => allProjects.filter(p =>
        (f.owner_id === undefined || p.owner_id === f.owner_id) &&
        (f.slug === undefined || p.slug === f.slug) &&
        (f.id === undefined || p.id === f.id) &&
        (f.__inVals === undefined || (f.__inVals as string[]).includes(
          p[f.__inCol as 'id' | 'slug'] as string)))
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { f[c] = v; return b },
        in: (c: string, v: string[]) => { f.__inCol = c; f.__inVals = v; return b },
        maybeSingle: async () => ({
          // When a driver reports an error, a row alongside it must never be
          // trusted — that is what the `error ||` guard defends.
          data: projectsErrorWithData ? (rows()[0] ?? null) : (projectsError ? null : (rows()[0] ?? null)),
          error: projectsErrorWithData ? { message: 'partial failure' } : projectsError,
        }),
        then: (res: (x: unknown) => unknown, rej: (x: unknown) => unknown) =>
          Promise.resolve({ data: projectsError ? null : rows().map(p => ({ id: p.id })), error: projectsError })
            .then(res, rej),
      }
      return b
    },
  }),
}))

vi.mock('@/lib/business/store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/business/store')>()
  return {
    ...actual,
    createLead: async (input: unknown) => { createLeadCalls.push(input); return { id: 'lead-1', ...(input as object) } },
    listLeads:  async () => [],
  }
})

const { POST } = await import('@/app/api/business/leads/route')

const post = (body: unknown, token?: string) =>
  new Request('https://x.test/api/business/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

/** The world: A and A2 owned by USER, B owned by someone else. */
function seedWorld() {
  allProjects = [
    { id: PROJ_A,  slug: 'alpha',  owner_id: USER },
    { id: PROJ_A2, slug: 'alpha2', owner_id: USER },
    { id: PROJ_B,  slug: 'beta',   owner_id: OTHER_USER },
  ]
}

beforeEach(() => {
  sessionUser = { id: USER }
  sessionSequence = null
  projectsErrorWithData = false
  projectsError = null
  createLeadCalls = []
  seedWorld()
  process.env.AIOPS_API_KEY = LEGACY_KEY
})

afterEach(() => { vi.restoreAllMocks() })

// ── 1. project_id ────────────────────────────────────────────────────────────

describe('session + project_id', () => {
  it('allows a project the user owns', async () => {
    const res = await POST(post({ project_id: PROJ_A, name: 'X' }))
    expect(res.status).toBe(201)
    expect(createLeadCalls).toEqual([{ project_id: PROJ_A, name: 'X' }])
  })

  it('allows every project the user owns, not just the first', async () => {
    for (const id of [PROJ_A, PROJ_A2]) {
      createLeadCalls = []
      const res = await POST(post({ project_id: id, name: 'X' }))
      expect(res.status).toBe(201)
      expect((createLeadCalls[0] as { project_id: string }).project_id).toBe(id)
    }
  })

  it('DENIES a project owned by someone else, and never reaches the store', async () => {
    const res = await POST(post({ project_id: PROJ_B, name: 'X' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies a project id that does not exist', async () => {
    const res = await POST(post({ project_id: UNKNOWN, name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('answers identically for foreign and unknown — no existence oracle', async () => {
    const foreign = await POST(post({ project_id: PROJ_B, name: 'X' }))
    const unknown = await POST(post({ project_id: UNKNOWN, name: 'X' }))
    expect(foreign.status).toBe(unknown.status)
    expect(await foreign.text()).toBe(await unknown.text())
  })

  it('denies when the user owns nothing at all', async () => {
    sessionUser = { id: 'user-with-no-projects' }
    const res = await POST(post({ project_id: PROJ_A, name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies a non-string project_id', async () => {
    for (const bad of [42, true, { id: PROJ_A }, [PROJ_A]]) {
      createLeadCalls = []
      const res = await POST(post({ project_id: bad, name: 'X' }))
      expect(res.status).toBe(403)
      expect(createLeadCalls).toHaveLength(0)
    }
  })
})

// ── 2. project_slug ──────────────────────────────────────────────────────────

describe('session + project_slug', () => {
  it('allows a slug the user owns and writes the RESOLVED id', async () => {
    const res = await POST(post({ project_slug: 'alpha', name: 'X' }))
    expect(res.status).toBe(201)
    // The slug never reaches the store; the resolved, verified id does.
    expect(createLeadCalls).toEqual([{ project_id: PROJ_A, name: 'X' }])
  })

  it('DENIES a slug owned by someone else', async () => {
    const res = await POST(post({ project_slug: 'beta', name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies an unknown slug', async () => {
    const res = await POST(post({ project_slug: 'does-not-exist', name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('answers identically for foreign and unknown slugs — no existence oracle', async () => {
    // The dangerous one: a slug MUST be resolved to be checked, so a naive
    // "resolve globally, then authorize" would distinguish these two and leak
    // every tenant's project names.
    const foreign = await POST(post({ project_slug: 'beta', name: 'X' }))
    const unknown = await POST(post({ project_slug: 'no-such-slug', name: 'X' }))
    expect(foreign.status).toBe(unknown.status)
    expect(await foreign.text()).toBe(await unknown.text())
  })

  it('denies every slug when the user owns nothing', async () => {
    sessionUser = { id: 'user-with-no-projects' }
    for (const slug of ['alpha', 'beta', 'nope']) {
      createLeadCalls = []
      const res = await POST(post({ project_slug: slug, name: 'X' }))
      expect(res.status).toBe(403)
      expect(createLeadCalls).toHaveLength(0)
    }
  })

  it('denies an empty or non-string slug', async () => {
    for (const bad of ['', 7, true, ['alpha']]) {
      createLeadCalls = []
      const res = await POST(post({ project_slug: bad, name: 'X' }))
      expect(res.status).toBe(403)
      expect(createLeadCalls).toHaveLength(0)
    }
  })

  it('prefers project_id when both are given, and still authorizes it', async () => {
    const res = await POST(post({ project_id: PROJ_B, project_slug: 'alpha', name: 'X' }))
    // project_id is checked first and is foreign — a slug the user DOES own
    // must not rescue it.
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })
})

// ── 3. Fail closed ───────────────────────────────────────────────────────────

describe('session — fail closed', () => {
  it('denies when the project lookup errors', async () => {
    projectsError = { message: 'db down' }
    const res = await POST(post({ project_id: PROJ_A, name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies a slug when the lookup errors', async () => {
    projectsError = { message: 'db down' }
    const res = await POST(post({ project_slug: 'alpha', name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies a slug when the driver returns a row AND an error', async () => {
    // A row arriving next to an error is not a result. Without the `error ||`
    // guard the row would be accepted and the write would proceed on data the
    // database never confirmed.
    projectsErrorWithData = true
    const res = await POST(post({ project_slug: 'alpha', name: 'X' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies when the session disappears between the two reads', async () => {
    // resolveLeadsAuth sees a user; resolveProjectAccess, reading a moment
    // later, does not. Its own fail-closed contract must hold — the earlier
    // read must not be treated as standing authorization.
    sessionSequence = [{ id: USER }, null]
    const res = await POST(post({ project_id: PROJ_A, name: 'X' }))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('keeps the pre-existing 400 when no project is named at all', async () => {
    const res = await POST(post({ name: 'X' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(
      'Okänt projekt — ange project_id eller giltig project_slug',
    )
    expect(createLeadCalls).toHaveLength(0)
  })

  it('rejects a non-object body before authorizing anything', async () => {
    const res = await POST(post(['nope']))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('body_must_be_object')
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies a null project_id rather than writing an unattributed lead', async () => {
    // /api/leads permits a null project; this route never did, and the store
    // would have thrown. Keep it a refusal, not a silent global write.
    const res = await POST(post({ project_id: null, name: 'X' }))
    expect(res.status).toBe(400)
    expect(createLeadCalls).toHaveLength(0)
  })
})

// ── 4. The write carries only the verified project ───────────────────────────

describe('store boundary', () => {
  it('never passes a body-supplied project key to createLead', async () => {
    await POST(post({ project_id: PROJ_A, project_slug: 'beta', name: 'X' }))
    const input = createLeadCalls[0] as Record<string, unknown>
    expect(input.project_slug).toBeUndefined()
    expect(input.project_id).toBe(PROJ_A)
  })

  it('drops fields outside the documented lead contract', async () => {
    await POST(post({
      project_id: PROJ_A, name: 'X', email: 'e@f.g', source: 's', status: 'new', value_sek: 1,
      injected: 'x', id: 'forged', created_at: '1999-01-01',
    }))
    expect(Object.keys(createLeadCalls[0] as object).sort()).toEqual(
      ['email', 'name', 'project_id', 'source', 'status', 'value_sek'],
    )
  })

  it('builds the input by pick, never by spread', () => {
    const src = read(ROUTE_PATH)
    const branch = src.slice(src.indexOf("if (auth.auth.kind === 'user')"))
    const body = branch.slice(0, branch.indexOf('// Legacy global-key path'))
    expect(body).not.toContain('...body')
    expect(body).toContain('project.projectId')
    expect(body).toContain('SESSION_LEAD_FIELDS')
    // The verified id is written, never the body value that was checked.
    expect(body).not.toMatch(/project_id:\s*body/)
  })
})

// ── 5. Canonical boundary, not an ad-hoc one ─────────────────────────────────

describe('canonical boundary', () => {
  it('authorizes through resolveProjectAccess and assertProjectAllowed', () => {
    // 4B1 moved the resolver into lib/business/business-auth.ts so campaigns
    // and revenue share ONE implementation with leads. The property is
    // unchanged — leads must still authorize through the canonical boundary —
    // so the assertion follows the delegation instead of pinning a location.
    expect(read(AUTH_PATH)).toContain("from '@/lib/business/business-auth'")
    const shared = read(SHARED_AUTH_PATH)
    expect(shared).toContain("from '@/lib/auth/project-access'")
    expect(shared).toContain('resolveProjectAccess()')
    expect(shared).toContain('assertProjectAllowed(')
    expect(shared).toContain('projectForbidden()')
  })

  it('scopes the slug lookup with the canonical isolation primitive', () => {
    const src = read(SHARED_AUTH_PATH)
    expect(src).toContain("from '@/lib/atlas/isolation'")
    expect(src).toContain('scopeToProjects(')
    // A bare global slug lookup would be the oracle this exists to prevent.
    expect(src).not.toMatch(/from\('projects'\)\s*\.select\([^)]*\)\s*\.eq\('slug'[^)]*\)\s*\.maybeSingle/)
  })

  it('implements no parallel ownership check', () => {
    const src = read(SHARED_AUTH_PATH)
    expect(src).not.toContain('owner_id')
    expect(src).not.toContain('getAllowedProjectIds(')
  })

  it('cross-checks the two session reads instead of trusting either alone', () => {
    const src = read(SHARED_AUTH_PATH)
    expect(src).toContain('access.userId !== sessionUserId')
  })

  it('denies when the two session reads disagree', async () => {
    // The resolver saw USER; project access sees OTHER_USER. Neither wins.
    const { resolveSessionLeadProject } = await import('@/lib/business/leads-auth')
    sessionUser = { id: OTHER_USER }
    const r = await resolveSessionLeadProject({ project_id: PROJ_B }, USER)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })
})

// ── 6. The other two paths are untouched ─────────────────────────────────────

describe('other auth paths unchanged', () => {
  it('legacy key no longer has a whole-body contract — it has no contract', async () => {
    sessionUser = null
    const body = { project_slug: 'beta', name: 'X', source: 'pyssel' }
    const res = await POST(post(body, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('legacy key can no longer write a project the session user could not', async () => {
    sessionUser = null
    const res = await POST(post({ project_id: PROJ_B, name: 'X' }, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('legacy key is still rejected when wrong', async () => {
    sessionUser = null
    const res = await POST(post({ project_id: PROJ_A }, 'wrong'))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('no longer records transitional debt, because there is none', () => {
    const src = read(ROUTE_PATH)
    expect(src).not.toContain('TRANSITIONAL SECURITY DEBT')
    expect(src).not.toContain('legacy_api_key')
  })

  it('leaves the credential branch untouched by the session change', () => {
    const src = read(ROUTE_PATH)
    const cred = src.slice(src.indexOf("if (auth.auth.kind === 'project_credential')"))
    const body = cred.slice(0, cred.indexOf("if (auth.auth.kind === 'user')"))
    expect(body).toContain('auth.auth.principal.projectId')
    expect(body).toContain('PROJECT_KEYS')
    expect(body).not.toContain('resolveSessionLeadProject')
  })
})
