/**
 * /api/business/leads — Phase 2 dual-accept.
 *
 * These drive the REAL route handlers against a controllable session, a
 * controllable credential store and a captured `createLead`, so what is proven
 * is what the route actually does rather than what a re-implementation would.
 * The credential verification is the real `requireProjectApiScope` from Phase 1
 * — only the database beneath it is substituted.
 *
 * The property under test is asymmetry: session and legacy keep the semantics
 * they already had, the credential path gets stricter ones, and neither leaks
 * into the other.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const ROUTE_PATH = 'app/api/business/leads/route.ts'
const AUTH_PATH  = 'lib/business/leads-auth.ts'

const LEGACY_KEY = 'legacy-global-key-value-do-not-change'
const PROJECT_A  = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PROJECT_B  = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const CRED_ID    = 'cccccccc-3333-4333-8333-cccccccccccc'

// ── Controllable dependencies ────────────────────────────────────────────────

let sessionUser: { id: string } | null = null
let sessionThrows = false

let credentialRow: Record<string, unknown> | null = null
/** Every project that exists, with its owner. Ownership drives allowedProjectIds. */
let allProjects: { id: string; slug: string; owner_id: string }[] = []
let projectsError: unknown = null
let credentialError: unknown = null
let credentialUpdates: { patch: Record<string, unknown>; id: unknown }[] = []

let createLeadCalls: unknown[] = []
let listLeadsCalls: unknown[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (sessionThrows) throw new Error('no session context')
    return { auth: { getUser: async () => ({ data: { user: sessionUser } }) } }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'project_api_credentials') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: credentialRow, error: credentialError }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_c: string, id: unknown) => { credentialUpdates.push({ patch, id }); return { error: null } },
          }),
        }
      }
      if (table === 'projects') {
        // Supports both chains the code uses:
        //   getAllowedProjectIds : .select('id').eq('owner_id', u)      → awaited
        //   scoped slug lookup   : .select('id').eq('slug', s).in('id', […]).maybeSingle()
        //   credential check     : .select('id').eq('id', p).maybeSingle()
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
          maybeSingle: async () => ({ data: projectsError ? null : (rows()[0] ?? null), error: projectsError }),
          then: (res: (x: unknown) => unknown, rej: (x: unknown) => unknown) =>
            Promise.resolve({ data: projectsError ? null : rows().map(p => ({ id: p.id })), error: projectsError })
              .then(res, rej),
        }
        return b
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.mock('@/lib/business/store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/business/store')>()
  return {
    ...actual,
    createLead: async (input: unknown) => { createLeadCalls.push(input); return { id: 'lead-1', ...(input as object) } },
    listLeads:  async (opts: unknown) => { listLeadsCalls.push(opts); return [] },
  }
})

const { GET, POST } = await import('@/app/api/business/leads/route')
const { generateProjectApiCredential } = await import('@/lib/auth/project-api-credentials')
const { resolveLeadsAuth, isCredentialNamespace } = await import('@/lib/business/leads-auth')

// ── Helpers ──────────────────────────────────────────────────────────────────

function seedCredential(overrides: Record<string, unknown> = {}, project = PROJECT_A): string {
  const cred = generateProjectApiCredential()
  credentialRow = {
    id: CRED_ID,
    project_id: project,
    secret_hash: cred.secretHash,
    scopes: ['business.leads.create'],
    enabled: true,
    revoked_at: null,
    expires_at: null,
    ...overrides,
  }
  allProjects = [{ id: project, slug: 'cred-project', owner_id: 'someone-else' }]
  return cred.token
}

const post = (body: unknown, token?: string) =>
  new Request('https://x.test/api/business/leads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

const get = (token?: string) =>
  new Request('https://x.test/api/business/leads?project_id=' + PROJECT_A, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

/**
 * Files under `dir` containing `pattern`.
 *
 * `execFileSync` with an argument vector, never a shell string: the repository
 * path contains spaces ("AI Operating Platform"), so an interpolated
 * `grep -rl x ${dir}` word-splits into non-existent paths, grep errors, and a
 * `|| true` turns that into an empty result. An assertion built that way
 * reports "nothing imports this" whether or not anything does — it cannot fail.
 * That is exactly how this check first passed while being broken.
 */
function filesContaining(pattern: string, dir: string): string[] {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
  try {
    return execFileSync('grep', ['-rl', pattern, dir], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
  } catch (e) {
    // grep exits 1 on no match — that is a real empty result, not a failure.
    const err = e as { status?: number }
    if (err.status === 1) return []
    throw e
  }
}

beforeEach(() => {
  sessionUser = null; sessionThrows = false
  credentialRow = null; allProjects = []; credentialError = null; projectsError = null
  credentialUpdates = []; createLeadCalls = []; listLeadsCalls = []
  process.env.AIOPS_API_KEY = LEGACY_KEY
})

afterEach(() => { vi.restoreAllMocks() })

// ── 1. Legacy AIOPS_API_KEY — REMOVED (Phase 4B3) ───────────────────────────

/**
 * The inversion of what this block used to assert.
 *
 * Every case here uses a VALID legacy key — the exact value the server has in
 * `AIOPS_API_KEY`, the one that returned 201 before 4B3. A wrong-key test would
 * prove only that a wrong value is refused, which was already true and would
 * stay true if the whole legacy branch came back. Using the working key is what
 * makes these tests fail the moment the capability is restored.
 */
describe('legacy AIOPS_API_KEY path is gone', () => {
  it('refuses a valid legacy key on POST, and writes nothing', async () => {
    const body = { project_slug: 'familje-stunden', name: 'A', email: 'a@b.c', source: 'pyssel' }
    const res = await POST(post(body, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('refuses a valid legacy key naming a project id outright', async () => {
    const res = await POST(post({ project_id: PROJECT_B, name: 'B' }, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('refuses a valid legacy key on GET, and reads nothing', async () => {
    const res = await GET(get(LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(listLeadsCalls).toHaveLength(0)
  })

  it('refuses a wrong key too', async () => {
    const res = await POST(post({ project_id: PROJECT_A }, 'not-the-key'))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('refuses a missing key', async () => {
    const res = await POST(post({ project_id: PROJECT_A }))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  /**
   * The discriminator that proves the route no longer REACHES `requireApiKey`.
   *
   * With the env var unset, the old code answered 500 "AIOPS_API_KEY is not
   * configured on the server" — a server-config error, distinguishable from a
   * denial. If any path still reached that helper, this would be 500. It is a
   * plain 401, which no other refactor produces by accident.
   */
  it('answers 401, not the old 500, when AIOPS_API_KEY is unset', async () => {
    delete process.env.AIOPS_API_KEY
    const res = await POST(post({ project_id: PROJECT_A }, 'anything'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(createLeadCalls).toHaveLength(0)
  })

  it('no longer emits the legacy 401 body', async () => {
    const res = await POST(post({}, 'wrong'))
    expect((await res.json()).error).toBe('Unauthorized')
  })

  /** A credential must still work with no global key present at all. */
  it('leaves the credential path working when AIOPS_API_KEY is unset', async () => {
    delete process.env.AIOPS_API_KEY
    const token = seedCredential()
    const res = await POST(post({ email: 'a@b.c' }, token))
    expect(res.status).toBe(201)
    expect(createLeadCalls).toEqual([{ project_id: PROJECT_A, email: 'a@b.c' }])
  })

  it('never touches project_api_credentials for a non-omn token', async () => {
    await POST(post({ project_slug: 'x' }, LEGACY_KEY))
    expect(credentialUpdates).toHaveLength(0)
  })
})


// ── 2. Session — must not regress ────────────────────────────────────────────

describe('user session path', () => {
  it('creates a lead when the UI names a project the user owns', async () => {
    sessionUser = { id: 'user-1' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-1' }]
    const res = await POST(post({ project_id: PROJECT_A, name: 'C', email: null, source: 'manual' }))
    expect(res.status).toBe(201)
    // The verified id is written; the body's project key never reaches the store.
    expect(createLeadCalls).toEqual([
      { project_id: PROJECT_A, name: 'C', email: null, source: 'manual' },
    ])
  })

  it('takes precedence over a bearer token', async () => {
    sessionUser = { id: 'user-1' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-1' }]
    const res = await POST(post({ project_id: PROJECT_A }, 'anything-at-all'))
    expect(res.status).toBe(201)
  })

  it('does NOT fall through to key auth when there is no session', async () => {
    sessionUser = null
    const res = await POST(post({ project_id: PROJECT_A }, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies when the session lookup throws and only a legacy key is offered', async () => {
    // The throw is still swallowed — it must not become a 500 — but there is no
    // longer a key path underneath it to land on.
    sessionThrows = true
    const res = await POST(post({ project_id: PROJECT_A }, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('still reaches the credential path when the session lookup throws', async () => {
    sessionThrows = true
    const token = seedCredential()
    const res = await POST(post({ email: 'a@b.c' }, token))
    expect(res.status).toBe(201)
  })

  it('denies an unauthenticated caller with no token', async () => {
    sessionUser = null
    const res = await POST(post({ project_id: PROJECT_A }))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('refuses a project the user does not own', async () => {
    // This assertion used to encode the vulnerability itself: it asserted that
    // the body decided the project. LEADS_SESSION_PROJECT_SCOPE inverted it.
    sessionUser = { id: 'user-1' }
    allProjects = [
      { id: PROJECT_A, slug: 'a', owner_id: 'user-1' },
      { id: PROJECT_B, slug: 'b', owner_id: 'someone-else' },
    ]
    const res = await POST(post({ project_id: PROJECT_B, name: 'D' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('never touches project_api_credentials', async () => {
    sessionUser = { id: 'user-1' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-1' }]
    await POST(post({ project_id: PROJECT_A }))
    expect(credentialUpdates).toHaveLength(0)
  })
})

// ── 3. Project credential — accept ───────────────────────────────────────────

describe('project credential path', () => {
  it('creates a lead scoped to the credential project', async () => {
    const token = seedCredential()
    const res = await POST(post({ name: 'E', email: 'e@f.g', source: 'pyssel' }, token))
    expect(res.status).toBe(201)
    expect(createLeadCalls[0]).toEqual({
      project_id: PROJECT_A, name: 'E', email: 'e@f.g', source: 'pyssel',
    })
  })

  it('accepts the documented lead fields and nothing else', async () => {
    const token = seedCredential()
    await POST(post({
      name: 'F', email: 'f@g.h', source: 's', status: 'new', value_sek: 100,
      // Not part of the credential contract:
      injected: 'x', created_at: '1999-01-01', id: 'forged',
    }, token))
    expect(Object.keys(createLeadCalls[0] as object).sort()).toEqual(
      ['email', 'name', 'project_id', 'source', 'status', 'value_sek'],
    )
  })

  it('omits absent optional fields rather than sending undefined', async () => {
    const token = seedCredential()
    await POST(post({ name: 'G' }, token))
    expect(createLeadCalls[0]).toEqual({ project_id: PROJECT_A, name: 'G' })
  })
})

// ── 4. Project binding ───────────────────────────────────────────────────────

describe('project binding — credential is the only source', () => {
  it('a project-A credential writes to A', async () => {
    const token = seedCredential({}, PROJECT_A)
    await POST(post({ name: 'H' }, token))
    expect((createLeadCalls[0] as { project_id: string }).project_id).toBe(PROJECT_A)
  })

  it('a project-B credential writes to B', async () => {
    const token = seedCredential({}, PROJECT_B)
    await POST(post({ name: 'I' }, token))
    expect((createLeadCalls[0] as { project_id: string }).project_id).toBe(PROJECT_B)
  })

  it('refuses a body naming another project', async () => {
    const token = seedCredential({}, PROJECT_A)
    const res = await POST(post({ project_id: PROJECT_B, name: 'J' }, token))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('project_from_credential_only:project_id')
    expect(createLeadCalls).toHaveLength(0)
  })

  it('refuses project_slug too', async () => {
    const token = seedCredential({}, PROJECT_A)
    const res = await POST(post({ project_slug: 'other', name: 'K' }, token))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('project_from_credential_only:project_slug')
    expect(createLeadCalls).toHaveLength(0)
  })

  it('refuses the body naming its OWN project — presence is the refusal', async () => {
    const token = seedCredential({}, PROJECT_A)
    const res = await POST(post({ project_id: PROJECT_A, name: 'L' }, token))
    expect(res.status).toBe(400)
    expect(createLeadCalls).toHaveLength(0)
  })

  it.each([
    ['project_id: null',   { project_id: null, name: 'M' }],
    ['project_slug: null', { project_slug: null, name: 'N' }],
    ['project_id: ""',     { project_id: '', name: 'O' }],
  ])('refuses a present-but-empty project key: %s', async (_label, body) => {
    // `undefined` is deliberately absent: JSON.stringify drops it, so it never
    // reaches the server as a present key and cannot be refused there.
    const token = seedCredential()
    const res = await POST(post(body, token))
    expect(res.status).toBe(400)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('ignores a query-string project — the route reads none on POST', async () => {
    const token = seedCredential({}, PROJECT_A)
    const req = new Request(`https://x.test/api/business/leads?project_id=${PROJECT_B}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'O' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect((createLeadCalls[0] as { project_id: string }).project_id).toBe(PROJECT_A)
  })

  it('ignores a project-naming header', async () => {
    const token = seedCredential({}, PROJECT_A)
    const req = new Request('https://x.test/api/business/leads', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-project-id': PROJECT_B,
      },
      body: JSON.stringify({ name: 'P' }),
    })
    await POST(req)
    expect((createLeadCalls[0] as { project_id: string }).project_id).toBe(PROJECT_A)
  })

  it('rejects a non-object body on the credential path', async () => {
    const token = seedCredential()
    const res = await POST(post(['not', 'an', 'object'], token))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('body_must_be_object')
  })
})

// ── 5. Credential lifecycle and scope — deny ─────────────────────────────────

describe('project credential — fail closed', () => {
  const denied = async (overrides: Record<string, unknown>, expected = 401) => {
    const token = seedCredential(overrides)
    const res = await POST(post({ name: 'X' }, token))
    expect(res.status).toBe(expected)
    expect(createLeadCalls).toHaveLength(0)
    expect(credentialUpdates).toHaveLength(0)
    return res
  }

  it('denies a disabled credential',  () => denied({ enabled: false }))
  it('denies a revoked credential',   () => denied({ revoked_at: new Date().toISOString() }))
  it('denies an expired credential',  () => denied({ expires_at: new Date(Date.now() - 1000).toISOString() }))

  it('denies the wrong scope with 403', () => denied({ scopes: ['business.leads'] }, 403))
  it('denies an empty scope list with 403', () => denied({ scopes: [] }, 403))
  it('denies a wildcard scope with 403', () => denied({ scopes: ['*'] }, 403))
  it('denies a prefix wildcard with 403', () => denied({ scopes: ['business.*'] }, 403))
  it('denies a longer scope with 403', () => denied({ scopes: ['business.leads.create.other'] }, 403))

  it('denies a wrong secret', async () => {
    seedCredential()
    const res = await POST(post({ name: 'X' }, `omn_0123456789abcdef_${'A'.repeat(43)}`))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies an unknown prefix', async () => {
    seedCredential()
    credentialRow = null
    const res = await POST(post({ name: 'X' }, `omn_ffffffffffffffff_${'B'.repeat(43)}`))
    expect(res.status).toBe(401)
  })

  it('denies on a database error', async () => {
    const token = seedCredential()
    credentialError = { message: 'db down' }
    const res = await POST(post({ name: 'X' }, token))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies when the project no longer exists', async () => {
    const token = seedCredential()
    allProjects = []
    const res = await POST(post({ name: 'X' }, token))
    expect(res.status).toBe(401)
  })

  it('denies a credential token on GET — V1 has no read scope', async () => {
    const token = seedCredential()
    const res = await GET(get(token))
    expect(res.status).toBe(401)
    expect(listLeadsCalls).toHaveLength(0)
  })
})

// ── 6. Namespace separation — no fallback to legacy ──────────────────────────

describe('namespace separation', () => {
  it.each([
    ['malformed omn_ token',       'omn_not-a-real-token'],
    ['omn_ prefix only',           'omn_'],
    ['omn_ with short secret',     `omn_0123456789abcdef_${'a'.repeat(10)}`],
    ['omn_ with bad prefix chars', `omn_ZZZZZZZZZZZZZZZZ_${'a'.repeat(43)}`],
  ])('denies %s without falling back to the legacy key', async (_label, token) => {
    seedCredential()
    const res = await POST(post({ name: 'X' }, token))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('does NOT accept an omn_ token even when it equals the legacy key', async () => {
    // The decisive case: if the namespace check ran after the legacy compare,
    // or fell through on failure, this would create a lead.
    process.env.AIOPS_API_KEY = 'omn_pretending-to-be-a-credential'
    const res = await POST(post({ name: 'X' }, 'omn_pretending-to-be-a-credential'))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('routes a bare omn_ header with no Bearer prefix to the credential path', async () => {
    // requireApiKey strips an optional `Bearer `, so the namespace test must use
    // the same extraction or this would reach the legacy compare.
    process.env.AIOPS_API_KEY = 'omn_bare-header-value'
    const req = new Request('https://x.test/api/business/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'omn_bare-header-value' },
      body: JSON.stringify({ name: 'X' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies a non-omn_ token instead of continuing anywhere', async () => {
    const res = await POST(post({ project_slug: 'x' }, LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
    // and it never reached the credential verifier either
    expect(credentialUpdates).toHaveLength(0)
  })

  it('classifies namespace membership by prefix alone', () => {
    expect(isCredentialNamespace('omn_anything')).toBe(true)
    expect(isCredentialNamespace('omn_')).toBe(true)
    expect(isCredentialNamespace('OMN_upper')).toBe(false)
    expect(isCredentialNamespace('xomn_')).toBe(false)
    expect(isCredentialNamespace('sk-live-123')).toBe(false)
    expect(isCredentialNamespace(null)).toBe(false)
  })

  it('never falls through in the resolver source', () => {
    const src = read(AUTH_PATH)
    const branch = src.slice(src.indexOf('if (isCredentialNamespace(token))'))
    const body = branch.slice(0, branch.indexOf('\n  // 3.'))
    // Every exit inside the namespace branch must be a return.
    expect(body).not.toMatch(/requireApiKey/)
    expect(body.match(/return/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

// ── 7. last_used_at ──────────────────────────────────────────────────────────

describe('last_used_at', () => {
  it('stamps only after credential and scope both pass', async () => {
    const token = seedCredential()
    await POST(post({ name: 'X' }, token))
    expect(credentialUpdates).toHaveLength(1)
    expect(credentialUpdates[0].id).toBe(CRED_ID)
    expect(Object.keys(credentialUpdates[0].patch)).toEqual(['last_used_at'])
  })

  it('does not stamp when the scope check fails', async () => {
    const token = seedCredential({ scopes: ['business.leads'] })
    await POST(post({ name: 'X' }, token))
    expect(credentialUpdates).toHaveLength(0)
  })

  it('does not stamp when the credential is revoked', async () => {
    const token = seedCredential({ revoked_at: new Date().toISOString() })
    await POST(post({ name: 'X' }, token))
    expect(credentialUpdates).toHaveLength(0)
  })

  it('writes nothing derived from the lead body', async () => {
    const token = seedCredential()
    await POST(post({ name: 'X', email: 'leak@example.com' }, token))
    expect(JSON.stringify(credentialUpdates)).not.toContain('leak@example.com')
  })
})

// ── 8. Containment — Phase 2 is leads only ───────────────────────────────────

describe('containment', () => {
  it('no other route imports the leads auth resolver', () => {
    const hits = filesContaining('business/leads-auth', `${WEB_ROOT}/app`)
    expect(hits).toEqual([`${WEB_ROOT}/app/api/business/leads/route.ts`])
  })

  it('no other route imports the credential primitive', () => {
    const hits = filesContaining('auth/project-api-credentials', `${WEB_ROOT}/app`)
    expect(hits).toEqual([])
  })

  it.each(['campaigns', 'revenue'])('gives /api/business/%s no credential access', name => {
    // 4B1 moved these to resolveBusinessAuth for SESSION scoping. What this
    // assertion owns is that they gained no project-credential capability and
    // did not borrow the leads resolver — the legacy class still reaches
    // requireApiKey through the shared business resolver.
    // 4B2 made these session-only. The durable property is that they gained no
    // project-credential capability and did not borrow the leads resolver.
    const src = read(`app/api/business/${name}/route.ts`)
    expect(src).toContain("from '@/lib/auth/session'")
    expect(src).not.toContain('leads-auth')
    expect(src).not.toContain('project-api-credentials')
    expect(src).not.toContain('business.leads.create')
    // And they can no longer reach the global key at all.
    expect(src).not.toMatch(/from '@\/lib\/api-auth'/)
  })

  it('leaves /api/chat/tts untouched by the credential surface', () => {
    const src = read('app/api/chat/tts/route.ts')
    expect(src).not.toContain('leads-auth')
    expect(src).not.toContain('project-api-credentials')
  })

  it('leaves lib/api-auth.ts unchanged in shape', () => {
    const src = read('lib/api-auth.ts')
    expect(src).toContain('export function requireApiKey')
    expect(src).toContain('export async function requireUserOrApiKey')
    expect(src).toContain('process.env.AIOPS_API_KEY')
    expect(src).not.toContain('project-api-credentials')
  })

  it('keeps /api/v1 absent', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    expect(existsSync(resolve(WEB_ROOT, 'app/api/v1'))).toBe(false)
  })

  it('grants the credential path no capability beyond create', () => {
    const src = read(ROUTE_PATH)
    // GET passes the no-read-scope sentinel; only POST names a scope.
    expect(src).toContain('const NO_READ_SCOPE = null')
    expect(src).toContain("const CREATE_SCOPE = 'business.leads.create'")
    expect(src).not.toMatch(/business\.leads\.(read|list|update|delete)/)
  })

  it('keeps the resolver server-only', () => {
    expect(read(AUTH_PATH)).toContain("import 'server-only'")
  })
})

// ── 9. Secret containment ────────────────────────────────────────────────────

describe('secret containment', () => {
  it('never returns the token or its hash in a response', async () => {
    const token = seedCredential()
    const res = await POST(post({ name: 'X' }, token))
    const text = await res.text()
    expect(text).not.toContain(token)
    expect(text).not.toContain(credentialRow!.secret_hash as string)
  })

  it('never puts the credential in a denial response', async () => {
    const token = seedCredential({ scopes: [] })
    const res = await POST(post({ name: 'X' }, token))
    const text = await res.text()
    expect(text).not.toContain(token)
  })

  it('never logs the token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map(m => vi.spyOn(console, m).mockImplementation(() => {}))
    const token = seedCredential()
    await POST(post({ name: 'X' }, token))
    credentialError = { message: 'db down' }
    await POST(post({ name: 'X' }, token))
    const printed = spies.flatMap(s => s.mock.calls.flat()).map(String).join(' ')
    expect(printed).not.toContain(token)
    spies.forEach(s => s.mockRestore())
  })

  it('does not spread the request body into the security context', () => {
    const src = read(AUTH_PATH)
    expect(src).not.toContain('...body')
    expect(src).not.toContain('request.json')
  })

  it('never reads a project from the body in the credential branch', () => {
    // The PROJECT_KEYS guard refuses these bodies before construction, which
    // makes a `body.project_id ?? principal.projectId` fallback unreachable —
    // and therefore invisible to a behavioural test. Assert it at the source so
    // the fallback cannot be introduced and sit dormant until someone later
    // relaxes the guard, at which point it would silently become live.
    const src = read(ROUTE_PATH)
    const branch = src.slice(src.indexOf("if (auth.auth.kind === 'project_credential')"))
    const body = branch.slice(0, branch.indexOf('// Session and legacy'))
    expect(body).toContain('auth.auth.principal.projectId')
    expect(body).not.toMatch(/body\.project_id/)
    expect(body).not.toMatch(/body\.project_slug/)
    expect(body).not.toMatch(/project_id:\s*\(?body/)
  })

  it('builds the credential lead input by pick, never by spread', () => {
    const src = read(ROUTE_PATH)
    const branch = src.slice(src.indexOf("if (auth.auth.kind === 'project_credential')"))
    const body = branch.slice(0, branch.indexOf('// Session and legacy'))
    expect(body).not.toContain('...body')
    expect(body).toContain('CREDENTIAL_LEAD_FIELDS')
  })
})

// ── 10. Resolver contract ────────────────────────────────────────────────────

describe('resolveLeadsAuth', () => {
  it('reports the auth class rather than a bare ok', async () => {
    sessionUser = { id: 'user-9' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-9' }]
    const r1 = await resolveLeadsAuth(post({}), 'business.leads.create')
    expect(r1.ok && r1.auth).toEqual({ kind: 'user', userId: 'user-9' })

    sessionUser = null
    const r2 = await resolveLeadsAuth(post({}, LEGACY_KEY), 'business.leads.create')
    expect(r2.ok).toBe(false)

    const token = seedCredential()
    const r3 = await resolveLeadsAuth(post({}, token), 'business.leads.create')
    expect(r3.ok && r3.auth.kind).toBe('project_credential')
    expect(r3.ok && r3.auth.kind === 'project_credential' && r3.auth.principal.projectId).toBe(PROJECT_A)
  })

  it('never labels the legacy key as a project credential', async () => {
    const r = await resolveLeadsAuth(post({}, LEGACY_KEY), 'business.leads.create')
    expect(r.ok && r.auth.kind).not.toBe('project_credential')
    expect(JSON.stringify(r)).not.toContain('principal')
  })
})
