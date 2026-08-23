/**
 * PHASE 4B3 — the global AIOPS_API_KEY class is gone from /api/business/leads.
 *
 * This was the LAST HTTP surface that accepted the shared global key. What this
 * file owns is the removal itself: that the capability is gone rather than
 * merely renamed, that nothing fell through to a second chance, and that the
 * two remaining classes are untouched by the removal.
 *
 * ── WHY EVERY NEGATIVE USES A VALID KEY ──────────────────────────────────────
 *
 * `VALID_LEGACY_KEY` is set into `process.env.AIOPS_API_KEY` and then presented
 * as the bearer. It is the exact value that returned 201 before this phase. A
 * wrong-key test would prove only that a wrong value is refused — which was
 * already true, and would stay true if the entire legacy branch were restored.
 * Only the working key can distinguish "removed" from "still there".
 *
 * ── THE 401-NOT-500 DISCRIMINATOR ────────────────────────────────────────────
 *
 * With `AIOPS_API_KEY` unset, `requireApiKey` answered 500 "AIOPS_API_KEY is
 * not configured on the server". That status is reachable from nowhere else in
 * this route, so a plain 401 under the same conditions is positive evidence
 * that the route no longer REACHES the helper — not just that it stopped
 * accepting the value. Source greps can be fooled by a comment; this cannot.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const LEADS      = 'app/api/business/leads/route.ts'
const LEADS_AUTH = 'lib/business/leads-auth.ts'

const VALID_LEGACY_KEY = 'legacy-global-key-value-do-not-change'
const PROJECT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const CRED_ID   = 'cccccccc-3333-4333-8333-cccccccccccc'

// ── Controllable dependencies ────────────────────────────────────────────────

let sessionUser: { id: string } | null = null
let sessionThrows = false
let credentialRow: Record<string, unknown> | null = null
let allProjects: { id: string; slug: string; owner_id: string }[] = []
let credentialUpdates: unknown[] = []
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
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: credentialRow, error: null }) }) }),
          update: () => ({ eq: async () => { credentialUpdates.push(1); return { error: null } } }),
        }
      }
      if (table === 'projects') {
        const f: Record<string, unknown> = {}
        const rows = () => allProjects.filter(p =>
          (f.owner_id === undefined || p.owner_id === f.owner_id) &&
          (f.slug === undefined || p.slug === f.slug) &&
          (f.id === undefined || p.id === f.id) &&
          (f.__inVals === undefined || (f.__inVals as string[]).includes(p.id)))
        const b: Record<string, unknown> = {
          select: () => b,
          eq: (c: string, v: unknown) => { f[c] = v; return b },
          in: (_c: string, v: string[]) => { f.__inVals = v; return b },
          maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
          then: (res: (x: unknown) => unknown, rej: (x: unknown) => unknown) =>
            Promise.resolve({ data: rows().map(p => ({ id: p.id })), error: null }).then(res, rej),
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
const { resolveLeadsAuth } = await import('@/lib/business/leads-auth')

function seedCredential(overrides: Record<string, unknown> = {}): string {
  const cred = generateProjectApiCredential()
  credentialRow = {
    id: CRED_ID,
    project_id: PROJECT_A,
    secret_hash: cred.secretHash,
    scopes: ['business.leads.create'],
    enabled: true,
    revoked_at: null,
    expires_at: null,
    ...overrides,
  }
  allProjects = [{ id: PROJECT_A, slug: 'cred-project', owner_id: 'someone-else' }]
  return cred.token
}

/** POST with a raw Authorization header, so bare (non-`Bearer`) values are testable. */
const postRaw = (body: unknown, authHeader?: string) =>
  new Request('https://x.test/api/business/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authHeader ? { authorization: authHeader } : {}) },
    body: JSON.stringify(body),
  })

const post = (body: unknown, token?: string) => postRaw(body, token ? `Bearer ${token}` : undefined)

const getRaw = (authHeader?: string) =>
  new Request('https://x.test/api/business/leads?project_id=' + PROJECT_A, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
const get = (token?: string) => getRaw(token ? `Bearer ${token}` : undefined)

beforeEach(() => {
  sessionUser = null; sessionThrows = false
  credentialRow = null; allProjects = []
  credentialUpdates = []; createLeadCalls = []; listLeadsCalls = []
  process.env.AIOPS_API_KEY = VALID_LEGACY_KEY
})
afterEach(() => { vi.restoreAllMocks() })

// ── 1. Valid legacy key — the capability is gone ─────────────────────────────

describe('valid legacy key no longer authenticates', () => {
  const bodies: [string, Record<string, unknown>][] = [
    ['the send-pyssel-lead body',   { project_slug: 'familje-stunden', email: 'a@b.c', source: 'pyssel', status: 'new' }],
    ['a project_id body',           { project_id: PROJECT_B, name: 'X' }],
    ['a body naming no project',    { email: 'a@b.c' }],
    ['an empty body',               {}],
  ]

  for (const [label, body] of bodies) {
    it(`POST with ${label} → 401 and no write`, async () => {
      const res = await POST(post(body, VALID_LEGACY_KEY))
      expect(res.status).toBe(401)
      expect(createLeadCalls).toHaveLength(0)
    })
  }

  it('GET → 401 and no read', async () => {
    const res = await GET(get(VALID_LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(listLeadsCalls).toHaveLength(0)
  })

  it('is denied identically whether the key is right or wrong', async () => {
    const right = await POST(post({ email: 'a@b.c' }, VALID_LEGACY_KEY))
    const wrong = await POST(post({ email: 'a@b.c' }, 'completely-different-value'))
    expect(right.status).toBe(wrong.status)
    expect(await right.json()).toEqual(await wrong.json())
  })

  it('resolveLeadsAuth never returns ok for it', async () => {
    const r = await resolveLeadsAuth(post({}, VALID_LEGACY_KEY), 'business.leads.create')
    expect(r.ok).toBe(false)
  })

  it('never reports a legacy_api_key class, because none exists', async () => {
    const r = await resolveLeadsAuth(post({}, VALID_LEGACY_KEY), 'business.leads.create')
    expect(JSON.stringify(r)).not.toContain('legacy_api_key')
  })
})

// ── 2. Missing-env invariant: 401, never the old 500 ─────────────────────────

describe('AIOPS_API_KEY unset', () => {
  beforeEach(() => { delete process.env.AIOPS_API_KEY })

  for (const [label, call] of [
    ['POST, no bearer',        () => POST(post({ email: 'a@b.c' }))],
    ['POST, non-omn bearer',   () => POST(post({ email: 'a@b.c' }, 'anything-at-all'))],
    ['GET, no bearer',         () => GET(get())],
    ['GET, non-omn bearer',    () => GET(get('anything-at-all'))],
  ] as [string, () => Promise<Response>][]) {
    it(`${label} → 401, not 500`, async () => {
      const res = await call()
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    })
  }

  it('never emits the old server-config error', async () => {
    const res = await POST(post({}, 'anything'))
    expect(JSON.stringify(await res.json())).not.toContain('AIOPS_API_KEY')
  })

  it('leaves the credential path fully working', async () => {
    const token = seedCredential()
    const res = await POST(post({ email: 'a@b.c', source: 'pyssel' }, token))
    expect(res.status).toBe(201)
    expect(createLeadCalls).toEqual([{ project_id: PROJECT_A, email: 'a@b.c', source: 'pyssel' }])
  })

  it('leaves the session path fully working', async () => {
    sessionUser = { id: 'user-1' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-1' }]
    const res = await POST(post({ project_id: PROJECT_A, email: 'a@b.c' }))
    expect(res.status).toBe(201)
  })
})

// ── 3. Token namespace semantics (fail closed, no parser for strangers) ──────

describe('bearer classification', () => {
  it('an unknown bearer never reaches the credential verifier', async () => {
    const res = await POST(post({ email: 'a@b.c' }, 'sk-live-not-ours'))
    expect(res.status).toBe(401)
    expect(credentialUpdates).toHaveLength(0)
    expect(createLeadCalls).toHaveLength(0)
  })

  const strangers = [
    ['a JWT-shaped token',  'eyJhbGciOiJIUzI1NiJ9.e30.x'],
    ['an empty bearer',     ''],
    ['whitespace only',     '   '],
    ['a near-miss prefix',  'omnx_abcdef'],
    ['an uppercase prefix', 'OMN_abcdef'],
    ['a prefix-suffix',     'xomn_abcdef'],
  ] as const

  for (const [label, tok] of strangers) {
    it(`${label} → 401, never 500`, async () => {
      const res = await POST(postRaw({ email: 'a@b.c' }, `Bearer ${tok}`))
      expect(res.status).toBe(401)
      expect(createLeadCalls).toHaveLength(0)
    })
  }

  it('a malformed omn_ token is a terminal deny, not a fallthrough', async () => {
    process.env.AIOPS_API_KEY = 'omn_pretending-to-be-the-global-key'
    const res = await POST(post({ email: 'a@b.c' }, 'omn_pretending-to-be-the-global-key'))
    expect(res.status).not.toBe(201)
    expect(createLeadCalls).toHaveLength(0)
  })

  /**
   * A BARE `omn_…` header with no `Bearer ` prefix. The namespace test extracts
   * loosely and claims it; the verifier extracts strictly and refuses it. That
   * asymmetry is the fail-closed direction: claimed-then-refused, never
   * unclaimed-and-passed-along.
   */
  it('a bare omn_ header with no Bearer prefix is claimed and then refused', async () => {
    const token = seedCredential()
    const res = await POST(postRaw({ email: 'a@b.c' }, token))
    expect(res.status).not.toBe(201)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('a bare non-omn header is refused too', async () => {
    const res = await POST(postRaw({ email: 'a@b.c' }, VALID_LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(createLeadCalls).toHaveLength(0)
  })
})

// ── 4. GET semantics ────────────────────────────────────────────────────────

describe('GET', () => {
  it('denies a valid credential — V1 defines no read scope', async () => {
    const token = seedCredential()
    const res = await GET(get(token))
    expect(res.status).toBe(401)
    expect(listLeadsCalls).toHaveLength(0)
  })

  it('denies a credential without ever verifying it', async () => {
    const token = seedCredential()
    await GET(get(token))
    expect(credentialUpdates).toHaveLength(0)
  })

  it('still serves a logged-in user', async () => {
    sessionUser = { id: 'user-1' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-1' }]
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(listLeadsCalls).toHaveLength(1)
  })
})

// ── 5. Session precedence survives the removal ──────────────────────────────

describe('session precedence', () => {
  beforeEach(() => {
    sessionUser = { id: 'user-1' }
    allProjects = [{ id: PROJECT_A, slug: 'a', owner_id: 'user-1' }]
  })

  it('a valid session wins over a stale legacy bearer', async () => {
    const res = await POST(post({ project_id: PROJECT_A, email: 'a@b.c' }, VALID_LEGACY_KEY))
    expect(res.status).toBe(201)
    expect(createLeadCalls).toEqual([{ project_id: PROJECT_A, email: 'a@b.c' }])
  })

  it('a valid session wins over a credential-looking bearer', async () => {
    const res = await POST(post({ project_id: PROJECT_A, email: 'a@b.c' }, 'omn_something_or_other'))
    expect(res.status).toBe(201)
    expect(credentialUpdates).toHaveLength(0)
  })

  it('an Authorization header cannot sabotage a valid session', async () => {
    for (const h of ['Bearer ', 'Bearer omn_', 'Basic zzz', 'garbage']) {
      createLeadCalls = []
      const res = await POST(postRaw({ project_id: PROJECT_A, email: 'a@b.c' }, h))
      expect(res.status).toBe(201)
    }
  })

  it('session project scoping is intact — a foreign project is refused', async () => {
    allProjects.push({ id: PROJECT_B, slug: 'b', owner_id: 'someone-else' })
    const res = await POST(post({ project_id: PROJECT_B, email: 'a@b.c' }))
    expect(res.status).toBe(403)
    expect(createLeadCalls).toHaveLength(0)
  })
})

// ── 6. Credential path preserved exactly ────────────────────────────────────

describe('project credential preserved', () => {
  it('creates a lead on the credential project', async () => {
    const token = seedCredential()
    const res = await POST(post({ email: 'a@b.c', source: 'pyssel', status: 'new' }, token))
    expect(res.status).toBe(201)
    expect(createLeadCalls).toEqual([
      { project_id: PROJECT_A, email: 'a@b.c', source: 'pyssel', status: 'new' },
    ])
  })

  for (const key of ['project_id', 'project_slug']) {
    it(`refuses a body naming ${key}, before any write`, async () => {
      const token = seedCredential()
      const res = await POST(post({ email: 'a@b.c', [key]: PROJECT_B }, token))
      expect(res.status).toBe(400)
      expect(createLeadCalls).toHaveLength(0)
    })
  }

  const denials: [string, Record<string, unknown>][] = [
    ['wrong scope', { scopes: ['business.leads.read'] }],
    ['no scopes',   { scopes: [] }],
    ['revoked',     { revoked_at: '2020-01-01T00:00:00Z' }],
    ['disabled',    { enabled: false }],
    ['expired',     { expires_at: '2020-01-01T00:00:00Z' }],
  ]
  for (const [label, over] of denials) {
    it(`denies a ${label} credential without writing`, async () => {
      const token = seedCredential(over)
      const res = await POST(post({ email: 'a@b.c' }, token))
      expect(res.status).not.toBe(201)
      expect(createLeadCalls).toHaveLength(0)
    })
  }

  it('denies a token whose secret does not match the stored hash', async () => {
    seedCredential()
    const other = generateProjectApiCredential()
    const res = await POST(post({ email: 'a@b.c' }, other.token))
    expect(res.status).not.toBe(201)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('denies an unknown credential id', async () => {
    const cred = generateProjectApiCredential()
    credentialRow = null
    const res = await POST(post({ email: 'a@b.c' }, cred.token))
    expect(res.status).not.toBe(201)
    expect(createLeadCalls).toHaveLength(0)
  })

  it('no denial falls back to any other class', async () => {
    // A denied credential while a VALID legacy key sits in the environment.
    const token = seedCredential({ enabled: false })
    const res = await POST(post({ email: 'a@b.c' }, token))
    expect(res.status).not.toBe(201)
    expect(createLeadCalls).toHaveLength(0)
  })
})

// ── 7. Source invariants ────────────────────────────────────────────────────

describe('source invariants', () => {
  it('leads-auth no longer imports or calls requireApiKey', () => {
    const src = read(LEADS_AUTH)
    expect(src).not.toContain("from '@/lib/api-auth'")
    expect(src).not.toContain('requireApiKey(')
    expect(src).not.toContain('process.env.AIOPS_API_KEY')
  })

  it('leads-auth no longer defines a legacy class', () => {
    expect(read(LEADS_AUTH)).not.toContain("kind: 'legacy_api_key'")
  })

  it('the route no longer carries a debt marker or a legacy tail', () => {
    const src = read(LEADS)
    expect(src).not.toContain('TRANSITIONAL SECURITY DEBT')
    expect(src).not.toContain('legacy_api_key')
    expect(src).not.toMatch(/createLead\(body\)/)
  })

  it('the credential machinery is still there', () => {
    const src = read(LEADS_AUTH)
    expect(src).toContain('requireProjectApiScope')
    expect(src).toContain('CREDENTIAL_TOKEN_PREFIX')
    expect(src).toContain('isCredentialNamespace')
    expect(src).toContain("kind: 'project_credential'")
    expect(src).toContain("kind: 'user'")
  })

  it('the unhandled tail denies rather than writes', () => {
    // Slice from the exhaustiveness guard, NOT from the user branch — that
    // branch legitimately ends in a createLead, and slicing from it would make
    // this assert the opposite of what it means to.
    const src = read(LEADS)
    const tail = src.slice(src.indexOf('const unhandled: never'))
    expect(tail).toContain('status: 401')
    expect(tail).not.toContain('createLead')
  })
})

// ── 8. Global surface: ZERO routes reach the global key ─────────────────────

describe('global legacy HTTP surface', () => {
  const routeFiles = () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    // execFileSync with an argv, never a shell string — the repo path contains
    // spaces, and a shell-interpolated find would word-split into nothing and
    // make this assertion unfalsifiable.
    return execFileSync('find', [`${WEB_ROOT}/app/api`, '-name', 'route.ts'], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
  }

  it('finds route files at all — the scan must be able to fail', () => {
    expect(routeFiles().length).toBeGreaterThan(20)
  })

  it('no route reaches requireApiKey or requireUserOrApiKey, directly or via one hop', () => {
    const reaching = routeFiles().filter(f => {
      const src = readFileSync(f, 'utf8')
      if (/require(Api|UserOrApi)Key\s*\(/.test(src)) return true
      for (const m of src.matchAll(/from '@\/(lib\/[a-z0-9/-]+)'/g)) {
        const dep = resolve(WEB_ROOT, `${m[1]}.ts`)
        if (existsSync(dep) && /require(Api|UserOrApi)Key\s*\(/.test(readFileSync(dep, 'utf8'))) return true
      }
      return false
    }).map(f => f.replace(`${WEB_ROOT}/app/api`, '').replace('/route.ts', ''))

    expect(reaching).toEqual([])
  })

  it('no route file reads AIOPS_API_KEY', () => {
    const reading = routeFiles().filter(f => /process\.env\.AIOPS_API_KEY/.test(readFileSync(f, 'utf8')))
    expect(reading).toEqual([])
  })

  /**
   * `api-auth.ts` is deliberately LEFT IN PLACE. 4B3 removes an auth class, not
   * a module: the secrets stay as rollback material until the removal is
   * verified in production, and deleting the helper now would make that
   * rollback a code change rather than an env change.
   */
  it('keeps api-auth.ts intact, including requireCronAuth', () => {
    const src = read('lib/api-auth.ts')
    expect(src).toContain('export function requireApiKey')
    expect(src).toContain('export async function requireUserOrApiKey')
    expect(src).toContain('export function requireCronAuth')
  })

  it('leaves cron auth untouched and still reachable', () => {
    // Cron routes read process.env.CRON_SECRET directly rather than calling
    // requireCronAuth, so that env read is what proves the class still exists.
    const cronRoutes = routeFiles().filter(f => /process\.env\.CRON_SECRET/.test(readFileSync(f, 'utf8')))
    expect(cronRoutes.length).toBeGreaterThan(10)
  })
})
