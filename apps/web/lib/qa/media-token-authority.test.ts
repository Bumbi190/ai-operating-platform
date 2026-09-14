/**
 * Settings S0 — /api/media/token: the platform operator first, ownership kept,
 * every replacement audited before it happens, nothing ever read back.
 *
 * The route replaces the PLATFORM's Instagram and Facebook publishing credentials
 * — the ones every pipeline post uses (lib/media/social-destination.ts). Before S0
 * a session that owned the default social project could replace them, while
 * posting with them already required the platform operator (9X/9AC). S0 makes
 * replacing a credential take the same authority as using it, keeps the ownership
 * boundary, and pins that nothing the route returns can carry a token.
 *
 * The operator gate runs through the REAL resolvePlatformOperator and the REAL
 * allowlist (PLATFORM_OPERATOR_EMAILS, then BREVO_ADMIN_EMAIL — the one production
 * sets). Only the session, the database, the token store, the audit writer and
 * fetch are faked, so a denial is proven by what it did NOT touch: no project read,
 * no provider call, no stored token, no audit event.
 *
 * The audit writer is faked so each of its outcomes can be forced. Its own row
 * construction is proven in platform-credential-events.test.ts, and the table's
 * constraints and triggers against real Postgres in
 * platform-credential-events-sql.test.ts.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const APP = resolve(__dirname, '../..')
const ME = 'user-me'
const OPERATOR_EMAIL = 'operator@omnira.test'
const SOCIAL = '33333333-3333-3333-3333-333333333333'
const RAW_TOKEN = `EAAB${'x'.repeat(80)}`
const LONG_TOKEN = `EAAL${'z'.repeat(80)}`
const PAGE_TOKEN = `EAAP${'y'.repeat(80)}`
const APP_SECRET = 'meta-app-secret-value'
const SECRETS = [RAW_TOKEN, LONG_TOKEN, PAGE_TOKEN, APP_SECRET]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Op = [string, string, unknown]
interface AuditEvent {
  operationId: string
  projectId: string
  platform: string
  actor: string
  outcome: string
  detail?: Record<string, unknown>
}

let SEEN: { table: string; ops: Op[] }[] = []
let USER: { id: string; email: string | null } | null = null
let PROJECTS: Record<string, unknown>[] = []
let STORED: unknown[][] = []
let STORE_ERROR: Error | null = null
let FETCHED: string[] = []
let PROVIDER: (url: string) => unknown = () => ({})
let EVENTS: AuditEvent[] = []
let EVENT_FAILS = new Set<string>()
let ORDER: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: USER } }) } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const rec = { table, ops: [] as Op[] }
      SEEN.push(rec)
      let rows: Record<string, unknown>[] =
        table === 'projects' ? PROJECTS.map((r) => ({ ...r }))
        : table === 'media_scripts' ? [{ facebook_post_id: 'video-1', published_at: '2026-09-13' }]
        : []
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter((r) => r[c] === v); return q },
        not: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(ok, err),
      }
      return q
    },
  }),
}))

vi.mock('@/lib/media/token-store', () => ({
  setToken: async (...args: unknown[]) => {
    ORDER.push('store')
    STORED.push(args)
    if (STORE_ERROR) throw STORE_ERROR
  },
}))

vi.mock('@/lib/media/credential-events', () => ({
  recordCredentialEvent: async (input: AuditEvent) => {
    ORDER.push(`event:${input.outcome}`)
    EVENTS.push(JSON.parse(JSON.stringify(input)))
    return EVENT_FAILS.has(input.outcome) ? { ok: false, code: '42501' } : { ok: true }
  },
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  SEEN = []
  STORED = []
  STORE_ERROR = null
  FETCHED = []
  EVENTS = []
  EVENT_FAILS = new Set()
  ORDER = []
  USER = { id: ME, email: OPERATOR_EMAIL }
  PROJECTS = [{ id: SOCIAL, slug: 'ai-media-automation', owner_id: ME }]
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR_EMAIL
  delete process.env.BREVO_ADMIN_EMAIL
  process.env.META_APP_ID = 'meta-app-id'
  process.env.META_APP_SECRET = APP_SECRET
  process.env.FACEBOOK_PAGE_ID = 'page-1'
  PROVIDER = (url) =>
    url.includes('/oauth/access_token') ? { access_token: LONG_TOKEN }
    : url.includes('fields=access_token') ? { access_token: PAGE_TOKEN }
    : url.includes('fields=post_id') ? { post_id: 'post-1' }
    : url.includes('/insights') ? { data: [] }
    : {}
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = String(input)
    ORDER.push('fetch')
    FETCHED.push(url)
    const payload = PROVIDER(url)
    if (payload instanceof Error) throw payload
    return { status: 400, json: async () => payload }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => {
  for (const key of ['PLATFORM_OPERATOR_EMAILS', 'BREVO_ADMIN_EMAIL', 'META_APP_ID', 'META_APP_SECRET', 'FACEBOOK_PAGE_ID']) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = ORIGINAL_ENV[key]
  }
})

async function post(body: unknown) {
  const { POST } = await import('@/app/api/media/token/route')
  const res = await POST(new Request('http://localhost/api/media/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  const text = await res.text()
  return { status: res.status, text, json: text ? JSON.parse(text) : null }
}

/** Run a request with every console channel captured; returns what was logged. */
async function postLogged(body: unknown) {
  const lines: string[] = []
  const capture = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  const spies = (['error', 'warn', 'log', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(capture))
  try {
    const res = await post(body)
    return { res, logged: lines.join('\n') }
  } finally {
    for (const s of spies) s.mockRestore()
  }
}

const touched = () => ({ reads: SEEN.length, fetches: FETCHED.length, stored: STORED.length, events: EVENTS.length })
const NOTHING = { reads: 0, fetches: 0, stored: 0, events: 0 }
const INSTAGRAM = { platform: 'instagram', token: RAW_TOKEN, expires_days: 60 }
const FACEBOOK = { platform: 'facebook', token: RAW_TOKEN }

// ─────────────────────────────────────────────────────────────────────────────

describe('Settings S0 · /api/media/token — the platform operator comes first', () => {
  it('an unauthenticated request is 401 and reaches nothing', async () => {
    USER = null
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(401)
    expect(touched()).toEqual(NOTHING)
  })

  it('an owner who is not the platform operator is refused before any read, exchange, write or audit event', async () => {
    USER = { id: ME, email: 'owner-but-not-operator@omnira.test' }
    const res = await post(FACEBOOK)
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ error: 'Forbidden', denied: 'platform_operator_required' })
    expect(touched()).toEqual(NOTHING)
  })

  it('with no operator configured nobody passes — absence of configuration is absence of authority', async () => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    delete process.env.BREVO_ADMIN_EMAIL
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(403)
    expect(res.json.denied).toBe('platform_operator_required')
    expect(touched()).toEqual(NOTHING)
  })

  it('the BREVO_ADMIN_EMAIL fallback — the configuration production uses — still admits the operator', async () => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    process.env.BREVO_ADMIN_EMAIL = OPERATOR_EMAIL
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(200)
    expect(STORED).toHaveLength(1)
  })

  it('in the source: authority, then shape, then the attempted event, then every exchange and write, then the terminal event', () => {
    const code = readFileSync(resolve(APP, 'app/api/media/token/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const body = code.slice(code.indexOf('export async function POST'))
    const sequence = [
      'resolvePlatformOperator()',
      'resolveProjectAccess()',
      'assertProjectAllowed(',
      'request.json()',
      "outcome: 'attempted'",
      'if (!attempted.ok)',
      'onboardFacebookToken(token)',
      "await setToken('facebook'",
      'await setToken(platform',
      "outcome: replaced ? 'replaced' : 'failed'",
    ]
    const positions = sequence.map((needle) => body.indexOf(needle))
    sequence.forEach((needle, i) => expect(positions[i], needle).toBeGreaterThan(-1))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // The Facebook onboarding helper exchanges but never stores: the store lives in
    // POST, after the attempted event, where the route knows whether it happened.
    const helper = code.slice(code.indexOf('async function onboardFacebookToken'), code.indexOf('export async function POST'))
    expect(helper).not.toMatch(/setToken\s*\(/)
  })
})

describe('Settings S0 · ownership is kept, not replaced by the operator gate', () => {
  it('an operator who does not own the default social project is still refused, before any exchange, write or audit event', async () => {
    PROJECTS = [{ id: SOCIAL, slug: 'ai-media-automation', owner_id: 'user-other' }]
    const res = await post(FACEBOOK)
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ error: 'Forbidden' })
    expect(FETCHED).toEqual([])
    expect(STORED).toEqual([])
    expect(EVENTS).toEqual([])
  })

  it('a missing default social project is a 404, not a write', async () => {
    PROJECTS = [{ id: SOCIAL, slug: 'some-other-project', owner_id: ME }]
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(404)
    expect(FETCHED).toEqual([])
    expect(STORED).toEqual([])
    expect(EVENTS).toEqual([])
  })

  it('a refused request shape answers 400 after the gates, and writes nothing — not even an audit event', async () => {
    for (const body of [
      { platform: 'tiktok', token: RAW_TOKEN },
      { platform: 'instagram', token: 'too-short' },
      { platform: 'instagram', token: 12345 },
      { platform: 'instagram', token: RAW_TOKEN, expires_days: 'sixty' },
      { platform: 'instagram', token: RAW_TOKEN, expires_days: -1 },
      { platform: 'instagram', token: RAW_TOKEN, expires_days: 1e9 },
      null,
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(FETCHED).toEqual([])
    expect(STORED).toEqual([])
    expect(EVENTS).toEqual([])
  })
})

describe('Settings S0 · write-only — no token ever comes back', () => {
  it('Instagram: the operator-owner stores the token, and the response carries none', async () => {
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(200)
    expect(STORED[0][0]).toBe('instagram')
    expect(STORED[0][1]).toBe(RAW_TOKEN)
    expect(res.json).toMatchObject({ ok: true, replaced: true, operation_id: expect.stringMatching(UUID) })
    expect(res.text).not.toContain(RAW_TOKEN)
    expect(res.text).not.toMatch(/access_token/)
  })

  it('Facebook: the exchanged page token is stored, and neither it nor the input nor the app secret is returned', async () => {
    const res = await post(FACEBOOK)
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: true, platform: 'facebook', exchanged: true, pageResolved: true, replaced: true })
    expect(STORED[0]).toEqual(['facebook', PAGE_TOKEN, undefined, { accountId: 'page-1' }])
    for (const secret of SECRETS) expect(res.text).not.toContain(secret)
  })

  it('provider messages are redacted before they reach the operator', async () => {
    PROVIDER = (url) =>
      url.includes('/oauth/access_token') ? { error: { message: `Invalid OAuth token: access_token=${RAW_TOKEN}` } }
      : url.includes('fields=access_token') ? { error: { message: `Token ${RAW_TOKEN} has expired` } }
      : url.includes('fields=post_id') ? { post_id: 'post-1' }
      : { error: { message: `read_insights denied for access_token=${RAW_TOKEN}` } }
    const res = await post(FACEBOOK)
    expect(res.status).toBe(200)
    const warnings: string[] = res.json.warnings
    expect(warnings.length).toBeGreaterThanOrEqual(3)
    expect(warnings.join(' ')).toContain('[REDACTED')
    expect(res.text).not.toContain(RAW_TOKEN)
  })

  it('a thrown provider exception that quotes the token is redacted too', async () => {
    PROVIDER = (url) =>
      url.includes('/oauth/access_token')
        ? new Error(`request to https://graph.facebook.com/oauth/access_token?fb_exchange_token=x&access_token=${RAW_TOKEN} failed`)
        : url.includes('fields=access_token') ? new Error(`socket hang up while sending ${RAW_TOKEN}`)
        : { data: [] }
    const res = await post(FACEBOOK)
    expect(res.status).toBe(200)
    expect(res.text).not.toContain(RAW_TOKEN)
    expect(res.json.warnings.join(' ')).toContain('[REDACTED')
  })

  it('a storage failure whose message quotes a URL is redacted in the 500 body', async () => {
    STORE_ERROR = new Error(`upsert failed at https://db.example/rest?access_token=${RAW_TOKEN}`)
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(500)
    expect(res.text).not.toContain(RAW_TOKEN)
    expect(res.json.error).toContain('[REDACTED]')
  })
})

describe('Settings S0 · credential replacement audit — attempted first, fail-closed', () => {
  it('Instagram: attempted, then the store, then replaced — under one server-generated operation id', async () => {
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(200)
    expect(ORDER).toEqual(['event:attempted', 'store', 'event:replaced'])
    const [attempted, replaced] = EVENTS
    expect(attempted).toEqual({
      operationId: expect.stringMatching(UUID), projectId: SOCIAL, platform: 'instagram', actor: `user:${ME}`, outcome: 'attempted',
    })
    expect(replaced.operationId).toBe(attempted.operationId)
    expect(replaced.outcome).toBe('replaced')
    expect(replaced.detail).toEqual({ expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) })
    expect(res.json.operation_id).toBe(attempted.operationId)
  })

  it('Instagram without an expiry records replaced with an empty detail', async () => {
    const res = await post({ platform: 'instagram', token: RAW_TOKEN })
    expect(res.status).toBe(200)
    expect(EVENTS.map((e) => [e.outcome, e.detail ?? null])).toEqual([['attempted', null], ['replaced', {}]])
  })

  it('Facebook: the attempt is recorded before the first Graph call, and replaced carries only three booleans', async () => {
    const res = await post(FACEBOOK)
    expect(res.status).toBe(200)
    expect(ORDER[0]).toBe('event:attempted')
    expect(ORDER.indexOf('fetch')).toBeGreaterThan(0)
    expect(ORDER.slice(-2)).toEqual(['store', 'event:replaced'])
    expect(EVENTS[1].detail).toEqual({ exchanged: true, page_resolved: true, read_insights_ok: true })
  })

  it('no attempted event, no replacement: nothing is contacted, exchanged or stored, and the failure is truthful', async () => {
    EVENT_FAILS.add('attempted')
    const { res, logged } = await postLogged(FACEBOOK)
    expect(res.status).toBe(503)
    expect(res.json).toMatchObject({ ok: false, replaced: false, operation_id: expect.stringMatching(UUID) })
    expect(res.json.error).toMatch(/inte genomförts/)
    expect(FETCHED).toEqual([])
    expect(STORED).toEqual([])
    expect(ORDER).toEqual(['event:attempted'])
    expect(logged).toContain(res.json.operation_id)
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it('a failed store is recorded as failed, with its stage, under the same operation', async () => {
    STORE_ERROR = new Error('upsert failed')
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(500)
    expect(res.json).toMatchObject({ ok: false, replaced: false })
    expect(EVENTS.map((e) => e.outcome)).toEqual(['attempted', 'failed'])
    expect(EVENTS[1].detail).toEqual({ failure_stage: 'store' })
    expect(EVENTS[1].operationId).toBe(EVENTS[0].operationId)
    expect(res.json.operation_id).toBe(EVENTS[0].operationId)
  })

  it('AUDIT INTEGRITY INCIDENT: replaced but not recorded — a truthful 500, replaced: true, and no rollback', async () => {
    EVENT_FAILS.add('replaced')
    const { res, logged } = await postLogged(FACEBOOK)
    expect(res.status).toBe(500)
    expect(res.json).toMatchObject({
      ok: false, replaced: true, audit_incident: 'terminal_event_not_recorded', operation_id: EVENTS[0].operationId,
    })
    expect(res.json.error).toMatch(/ersattes/)
    // Stored exactly once and never touched again: no second store, no revert, no
    // direct write to platform_tokens.
    expect(STORED).toHaveLength(1)
    expect(ORDER.filter((o) => o === 'store')).toHaveLength(1)
    expect(SEEN.filter((s) => s.table === 'platform_tokens')).toEqual([])
    // The incident is logged as metadata only.
    expect(logged).toMatch(/AUDIT INTEGRITY INCIDENT/)
    expect(logged).toContain(EVENTS[0].operationId)
    expect(logged).toContain('42501')
    for (const secret of SECRETS) {
      expect(logged).not.toContain(secret)
      expect(res.text).not.toContain(secret)
    }
  })

  it('a failed store whose failed event also cannot be written stays truthful: replaced false, the audit gap flagged', async () => {
    STORE_ERROR = new Error('upsert failed')
    EVENT_FAILS.add('failed')
    const { res, logged } = await postLogged(INSTAGRAM)
    expect(res.status).toBe(500)
    expect(res.json).toMatchObject({ ok: false, replaced: false, audit_incident: 'terminal_event_not_recorded' })
    expect(logged).toMatch(/not replaced/)
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it('the operation id is the server\'s: a client-supplied one is ignored, and every attempt gets its own', async () => {
    const forged = '00000000-0000-4000-8000-000000000000'
    await post({ ...INSTAGRAM, operation_id: forged, operationId: forged })
    await post(INSTAGRAM)
    const ids = EVENTS.map((e) => e.operationId)
    expect(ids).not.toContain(forged)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).toBe(ids[3])
    expect(ids[0]).not.toBe(ids[2])
  })
})

describe('Settings S0 · the audit is credential-blind', () => {
  it('no token, secret or provider message reaches any audit event — even when Graph quotes the token back', async () => {
    PROVIDER = (url) =>
      url.includes('/oauth/access_token') ? { error: { message: `Invalid OAuth token: access_token=${RAW_TOKEN}` } }
      : url.includes('fields=access_token') ? { access_token: PAGE_TOKEN }
      : url.includes('fields=post_id') ? { post_id: 'post-1' }
      : { error: { message: `read_insights denied for access_token=${PAGE_TOKEN}` } }
    await post(FACEBOOK)
    STORE_ERROR = new Error(`upsert failed at https://db.example/rest?access_token=${RAW_TOKEN}`)
    await post(INSTAGRAM)
    const events = JSON.stringify(EVENTS)
    expect(EVENTS.map((e) => e.outcome)).toEqual(['attempted', 'replaced', 'attempted', 'failed'])
    for (const needle of [...SECRETS, 'access_token', 'OAuth', 'db.example', 'upsert failed', 'warnings']) {
      expect(events).not.toContain(needle)
    }
  })

  it('every audit event is built from the five named fields and allowlisted detail keys only', async () => {
    await post(FACEBOOK)
    await post(INSTAGRAM)
    for (const e of EVENTS) {
      expect(Object.keys(e).sort()).toEqual(
        e.detail === undefined
          ? ['actor', 'operationId', 'outcome', 'platform', 'projectId']
          : ['actor', 'detail', 'operationId', 'outcome', 'platform', 'projectId'],
      )
      for (const key of Object.keys(e.detail ?? {})) {
        expect(['exchanged', 'page_resolved', 'read_insights_ok', 'expires_at', 'failure_stage']).toContain(key)
      }
    }
  })
})

describe('Settings S0 · Settings is not a new authority source', () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (entry === 'node_modules' || entry === '.next' || entry === 'qa') continue
      const stat = statSync(full)
      if (stat.isDirectory()) out.push(...sourceFiles(full))
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }
  const FILES = () => ['app', 'components', 'lib'].flatMap((d) => sourceFiles(resolve(APP, d)))
  const rel = (f: string) => relative(APP, f)

  it('platform_tokens is written only by the token store, and the store only by this route and the refresh cron', () => {
    const files = FILES()
    const tableWriters = files
      .filter((f) => /from\(\s*'platform_tokens'\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(tableWriters).toEqual(['lib/media/token-store.ts'])
    const storeWriters = files
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return /from '@\/lib\/media\/token-store'/.test(src) && /\bsetToken\s*\(/.test(src) && /import \{[^}]*\bsetToken\b/.test(src)
      })
      .map(rel)
      .sort()
    expect(storeWriters).toEqual(['app/api/media/cron/refresh-tokens/route.ts', 'app/api/media/token/route.ts'])
  })

  it('platform_credential_events is written only by its writer, and the writer is called only by this route', () => {
    const files = FILES()
    const tableWriters = files
      .filter((f) => /from\(\s*'platform_credential_events'\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(tableWriters).toEqual(['lib/media/credential-events.ts'])
    const callers = files
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return /from '@\/lib\/media\/credential-events'/.test(src) && /\brecordCredentialEvent\s*\(/.test(src)
      })
      .map(rel)
    expect(callers).toEqual(['app/api/media/token/route.ts'])
  })
})
