/**
 * lib/qa/bugscanner-run-authorization.test.ts — Phase 9AA, POST /api/bugscanner/run.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The session branch compared `user.email !== process.env.BREVO_ADMIN_EMAIL`.
 * With the admin address unset and a session that carries no email, that is
 * `undefined !== undefined` — false — and the caller was admitted. Supabase
 * sessions can lack an email (phone and anonymous identities; auth.users.email
 * is nullable), and an empty or whitespace env value fails the same way. The
 * admitted path builds a service-role client, reads every tenant's failed runs,
 * calls four outbound endpoints, emails the operator, and returns the per-check
 * details — failed-run ids and error text included.
 *
 * ── WHAT IS REAL AND WHAT IS FAKE ──────────────────────────────────────────
 * The real POST handler and the real bugscanner checker and report builder run.
 * Only their edges are replaced: the Supabase session, the service-role client,
 * global fetch and the Brevo sender — each one counted, because a guard that
 * fires AFTER the service-role read or the email still returns 401 and would
 * pass a status-code-only test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ADMIN = 'ops@example.com'
const SECRET = 'bugscanner-test-secret'

let CALLS: string[] = []
let SESSION_USER: { id: string; email?: string | null } | null = null
let SESSION_READS = 0

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => { SESSION_READS++; return { data: { user: SESSION_USER } } } },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    CALLS.push('admin:client')
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'order']) chain[m] = () => chain
    chain.limit = async () => ({ data: [], error: null })
    return { from: (table: string) => { CALLS.push(`admin:read:${table}`); return chain } }
  },
}))

vi.mock('@/lib/email/brevo', () => ({
  sendAdminNotification: async () => { CALLS.push('email:send'); return { success: true } },
}))

const ENV_KEYS = ['BREVO_ADMIN_EMAIL', 'BUGSCANNER_SECRET'] as const
let savedEnv: Record<string, string | undefined> = {}
function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const k of ENV_KEYS) {
    const v = k in values ? values[k] : undefined
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

beforeEach(() => {
  CALLS = []
  SESSION_USER = null
  SESSION_READS = 0
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { CALLS.push(`fetch:${url}`); return new Response('ok', { status: 200 }) }))
})
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k] }
  vi.unstubAllGlobals()
})

async function post(headers: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/bugscanner/run/route')
  const res = await POST(new Request('https://x.test/api/bugscanner/run', { method: 'POST', headers }))
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}
const counts = () => ({
  adminClients: CALLS.filter(c => c === 'admin:client').length,
  adminReads: CALLS.filter(c => c.startsWith('admin:read:')).length,
  emails: CALLS.filter(c => c === 'email:send').length,
  outbound: CALLS.filter(c => c.startsWith('fetch:')).length,
})
/** Denial must cost nothing: no service-role client, no read, no email, no outbound call. */
function expectDeniedForFree(r: { status: number }) {
  expect(r.status).toBe(401)
  expect(counts()).toEqual({ adminClients: 0, adminReads: 0, emails: 0, outbound: 0 })
}

describe('Phase 9AA — bugscanner/run session path fails closed', () => {
  it.each([
    ['1  no session user', { admin: ADMIN }, null],
    ['2  admin env undefined, session has no email', { admin: undefined }, { id: 'u1' }],
    ['2b admin env undefined, session email undefined explicitly', { admin: undefined }, { id: 'u1', email: undefined }],
    ['3  admin env empty', { admin: '' }, { id: 'u1', email: '' }],
    ['4  admin env whitespace-only', { admin: '   ' }, { id: 'u1', email: '   ' }],
    ['5  user.email undefined', { admin: ADMIN }, { id: 'u1' }],
    ['6  user.email null', { admin: ADMIN }, { id: 'u1', email: null }],
    ['7  user.email empty', { admin: ADMIN }, { id: 'u1', email: '' }],
    ['8  wrong email', { admin: ADMIN }, { id: 'u1', email: 'someone@example.com' }],
    ['9  mixed-case wrong address', { admin: ADMIN }, { id: 'u1', email: 'OPS@Example.org' }],
    ['10 whitespace-only user email', { admin: ADMIN }, { id: 'u1', email: '  \t ' }],
    ['   admin env unset, user email set', { admin: undefined }, { id: 'u1', email: ADMIN }],
  ] as const)('%s → 401, and nothing ran', async (_n, env, user) => {
    setEnv({ BREVO_ADMIN_EMAIL: env.admin })
    SESSION_USER = user as typeof SESSION_USER
    expectDeniedForFree(await post())
  })

  it('the historical fail-open is closed: unset admin + email-less session no longer runs the scan', async () => {
    setEnv({})
    SESSION_USER = { id: 'phone-only-user' }
    const r = await post()
    expectDeniedForFree(r)
    expect(r.body).toEqual({ error: 'Unauthorized' })
  })
})

describe('Phase 9AA — bugscanner/run positive controls', () => {
  it('the configured admin, exact address → runs', async () => {
    setEnv({ BREVO_ADMIN_EMAIL: ADMIN })
    SESSION_USER = { id: 'admin', email: ADMIN }
    const r = await post()
    expect(r.status).toBe(200)
    expect(counts()).toEqual({ adminClients: 1, adminReads: 1, emails: 1, outbound: 4 })
  })

  it('case-normalised equivalent → runs (the platform-operator normalisation)', async () => {
    setEnv({ BREVO_ADMIN_EMAIL: 'Ops@Example.COM' })
    SESSION_USER = { id: 'admin', email: 'ops@example.com' }
    expect((await post()).status).toBe(200)
  })

  it('whitespace-normalised equivalent → runs', async () => {
    setEnv({ BREVO_ADMIN_EMAIL: `  ${ADMIN}  ` })
    SESSION_USER = { id: 'admin', email: ADMIN }
    expect((await post()).status).toBe(200)
  })

  it('the response payload keeps its shape', async () => {
    setEnv({ BREVO_ADMIN_EMAIL: ADMIN })
    SESSION_USER = { id: 'admin', email: ADMIN }
    const r = await post()
    expect(Object.keys(r.body).sort()).toEqual(['checks', 'checksRun', 'emailSent', 'ok', 'summary'])
    expect(r.body.checksRun).toBe(5)
  })
})

describe('Phase 9AA — the BUGSCANNER_SECRET machine path is unchanged', () => {
  it('a valid bearer runs without any session', async () => {
    setEnv({ BUGSCANNER_SECRET: SECRET, BREVO_ADMIN_EMAIL: ADMIN })
    SESSION_USER = null
    const r = await post({ Authorization: `Bearer ${SECRET}` })
    expect(r.status).toBe(200)
    expect(SESSION_READS, 'the machine path consulted the session').toBe(0)
    expect(counts().adminReads).toBe(1)
  })

  it('a valid bearer runs even when BREVO_ADMIN_EMAIL is unset — machine authority is the secret', async () => {
    setEnv({ BUGSCANNER_SECRET: SECRET })
    expect((await post({ Authorization: `Bearer ${SECRET}` })).status).toBe(200)
  })

  it('a wrong bearer falls through to the session path and is denied', async () => {
    setEnv({ BUGSCANNER_SECRET: SECRET, BREVO_ADMIN_EMAIL: ADMIN })
    expectDeniedForFree(await post({ Authorization: 'Bearer nope' }))
  })

  it('with no secret configured, "Bearer undefined" is not a credential', async () => {
    setEnv({ BREVO_ADMIN_EMAIL: ADMIN })
    expectDeniedForFree(await post({ Authorization: 'Bearer undefined' }))
  })

  it('an empty secret is not a credential either', async () => {
    setEnv({ BUGSCANNER_SECRET: '', BREVO_ADMIN_EMAIL: ADMIN })
    expectDeniedForFree(await post({ Authorization: 'Bearer ' }))
  })
})

describe('Phase 9AA — ordering: authority is decided before anything runs', () => {
  it('the guard sits before the scan, the service-role client and the email in the source', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'app/api/bugscanner/run/route.ts'), 'utf8')
    const guard = src.indexOf("return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })")
    expect(guard).toBeGreaterThan(0)
    for (const effect of ['await runBugScan()', 'await sendAdminNotification(']) {
      expect(src.indexOf(effect), effect).toBeGreaterThan(guard)
    }
    expect(src).toMatch(/normalizeEmail\(process\.env\.BREVO_ADMIN_EMAIL\)/)
  })
})
