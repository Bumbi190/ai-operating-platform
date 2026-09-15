/**
 * Project-scoped YouTube (Y2a) — connecting ONE project's YouTube channel with Google OAuth.
 *
 * Owner lock, 2026-09-14: Project → Platform → Verified External Account → Credential.
 * Owner decisions, 2026-09-15:
 *   - the platform's existing Web OAuth client;
 *   - scopes youtube.upload, youtube.readonly and yt-analytics.readonly;
 *   - the redirect URI https://ai-operating-platform-web.vercel.app/api/media/youtube/oauth/callback;
 *   - tokens stored per project, as Instagram and Facebook's are.
 * No cutover, no test publishing, Y1 untouched — and The Prompt's channel can only ever be
 * bound to The Prompt.
 *
 * The routes run for real, with the real OAuth module (state, PKCE, consent URL), the
 * real identity calls against a stubbed fetch, the real operator predicate and project
 * access. The session, database, token store, binding store and audit writer are faked
 * so every outcome can be forced and every write observed.
 *
 *   · START — who may begin, for which project; the state stored (its hash only); the
 *     consent URL exact.
 *   · CALLBACK — the state consumed once, and only by its operator; audit before any
 *     provider call; Google's answer, the grant and the channel each refused on their own
 *     terms; the binding decided by O1 before anything is stored — except the Y1
 *     migration, stored first so a refused move leaves publishing untouched.
 *   · ISOLATION — a channel another project holds is never stored or bound here.
 *   · NOTHING LEAKS — no token, code, state, verifier or secret in a redirect, a log line
 *     or an audit event.
 *   · THE CODEBASE, read — who may touch the state, the client and the exchange.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const APP = resolve(__dirname, '../..')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ME = '0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const OTHER_OPERATOR = '9d3b7a51-2c4e-4f6a-8b1d-3e5f7a9c1b2d'
const OPERATOR_EMAIL = 'operator@omnira.test'
const PROMPT = '33333333-3333-4333-8333-333333333333'
const FAMILY = '44444444-4444-4444-8444-444444444444'
const FOREIGN = '55555555-5555-4555-8555-555555555555'
const CHANNEL_PROMPT = 'UCUM9JDi75ziLssYcGLo8IPA'
const CHANNEL_FAMILY = 'UCfamily000000000000000'
const CHANNEL_OTHER = 'UCother00000000000000000'
const CLIENT_ID = 'client-id.apps.googleusercontent.com'
const CLIENT_SECRET = 'GOCSPX-platform-client-secret'
const Y1_REFRESH = `1//y1-${'e'.repeat(60)}`
const REDIRECT_URI = 'https://ai-operating-platform-web.vercel.app/api/media/youtube/oauth/callback'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50'
const UPLOAD = 'https://www.googleapis.com/auth/youtube.upload'
const READ = 'https://www.googleapis.com/auth/youtube.readonly'
const ANALYTICS = 'https://www.googleapis.com/auth/yt-analytics.readonly'

type Answer = { status: number; body: unknown } | Error
interface Grant { refresh: string | null; access: string; scopes: string[] }
interface StateRow {
  state_hash: string
  project_id: string
  platform: string
  actor: string
  change_account: boolean
  code_verifier: string | null
  expired: boolean
  consumed: boolean
}
interface FakeBinding {
  bindingId: string
  projectId: string
  platform: string
  externalAccountId: string
  accountLabel: string | null
  credentialSource: 'project_store' | 'platform_env_transitional'
  verification: 'provider_attested' | 'runtime_evidence'
  verifiedAt: string
  boundBy: string
  boundAt: string
  blockedAt: string | null
  blockedReason: string | null
  supersededAt: string | null
}

let USER: { id: string; email: string | null } | null = null
let PROJECTS: Record<string, unknown>[] = []
let ORDER: string[] = []
let STATES: StateRow[] = []
let STATE_INSERTS: Record<string, unknown>[] = []
let STATE_INSERT_FAILS = false
let CONSUMES: string[] = []
let STORED: { projectId: string; platform: string; accessToken: string; accountId: string; expiresAt: Date | null }[] = []
let STORE_FAILS = false
let EVENTS: Record<string, any>[] = []
let EVENT_FAILS = new Set<string>()
let BINDINGS: FakeBinding[] = []
let BINDING_READ_FAILS = false
let BINDING_WRITES: Record<string, unknown>[] = []
let REBIND_FAILURE: string | null = null
let bindingSeq = 0
let CODES: Record<string, Grant | Answer> = {}
let CHANNELS: Record<string, Answer> = {}
let FETCHED: { url: string; method: string; body: string | null; bearer: string | null }[] = []

// ── Seams ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: USER } }) } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'social_oauth_states') {
        return {
          insert: async (row: Record<string, unknown>) => {
            STATE_INSERTS.push({ ...row })
            if (STATE_INSERT_FAILS) return { error: { code: '42501', message: 'permission denied' } }
            STATES.push({ ...(row as unknown as StateRow), expired: false, consumed: false })
            return { error: null }
          },
        }
      }
      let rows: Record<string, unknown>[] = table === 'projects' ? PROJECTS.map((r) => ({ ...r })) : []
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q },
        in: () => q,
        is: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, err),
      }
      return q
    },
    // public.social_oauth_state_consume, as the migration defines it: once, while live.
    rpc: async (fn: string, args: { p_state_hash: string }) => {
      CONSUMES.push(args.p_state_hash)
      if (fn !== 'social_oauth_state_consume') return { data: null, error: { code: '42883' } }
      const row = STATES.find((s) => s.state_hash === args.p_state_hash && !s.consumed && !s.expired)
      if (!row) return { data: [], error: null }
      const verifier = row.code_verifier
      row.consumed = true
      row.code_verifier = null
      return {
        data: [{ project_id: row.project_id, platform: row.platform, actor: row.actor, change_account: row.change_account, code_verifier: verifier }],
        error: null,
      }
    },
  }),
}))

vi.mock('@/lib/media/token-store', () => ({
  storeCredential: async (projectId: string, platform: string, input: { accessToken: string; accountId: string; expiresAt: Date | null }) => {
    ORDER.push('store')
    STORED.push({ projectId, platform, ...input })
    return STORE_FAILS ? { ok: false } : { ok: true }
  },
  readStoredCredential: async () => { throw new Error('a connection never reads a stored credential') },
}))

vi.mock('@/lib/media/credential-events', () => ({
  recordCredentialEvent: async (input: Record<string, unknown>) => {
    ORDER.push(`event:${input.outcome}`)
    EVENTS.push(JSON.parse(JSON.stringify(input)))
    return EVENT_FAILS.has(String(input.outcome)) ? { ok: false, code: '42501' } : { ok: true }
  },
}))

vi.mock('@/lib/media/social-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/social-bindings')>()
  const active = () => BINDINGS.filter((b) => b.supersededAt === null)
  const visible = ({ supersededAt: _superseded, ...binding }: FakeBinding) => binding
  return {
    ...actual,
    readActiveBinding: async (projectId: string, platform: string) => {
      ORDER.push('binding:read')
      if (BINDING_READ_FAILS) return { ok: false }
      const found = active().find((b) => b.projectId === projectId && b.platform === platform)
      return { ok: true, binding: found ? visible(found) : null }
    },
    createBinding: async (input: any) => {
      ORDER.push('binding:create')
      BINDING_WRITES.push({ op: 'create', ...input })
      // O1, as social_account_bindings_account_single_project enforces it.
      if (active().some((b) => b.platform === input.platform && b.externalAccountId === input.externalAccountId)) {
        return { ok: false, failure: 'account_bound_to_other_project' }
      }
      if (active().some((b) => b.projectId === input.projectId && b.platform === input.platform)) {
        return { ok: false, failure: 'project_already_bound' }
      }
      const created = fakeBinding(input.projectId, input.platform, input.externalAccountId, { accountLabel: input.accountLabel, boundBy: input.boundBy })
      BINDINGS.push(created)
      return { ok: true, bindingId: created.bindingId }
    },
    rebindAccount: async (input: any) => {
      ORDER.push('binding:rebind')
      BINDING_WRITES.push({ op: 'rebind', ...input })
      if (REBIND_FAILURE) return { ok: false, failure: REBIND_FAILURE }
      const current = active().find((b) => b.projectId === input.projectId && b.platform === input.platform)
      if (!current || current.bindingId !== input.expectedBindingId) return { ok: false, failure: 'binding_changed' }
      // One transaction in the database: a refused insert leaves the old binding active.
      if (active().some((b) => b !== current && b.platform === input.platform && b.externalAccountId === input.externalAccountId)) {
        return { ok: false, failure: 'account_bound_to_other_project' }
      }
      current.supersededAt = '2026-09-15T20:00:00.000Z'
      const next = fakeBinding(input.projectId, input.platform, input.externalAccountId, { accountLabel: input.accountLabel, boundBy: input.boundBy })
      BINDINGS.push(next)
      return { ok: true, bindingId: next.bindingId }
    },
    recordProviderAttestation: async (binding: { bindingId: string }, label: string | null) => {
      ORDER.push('binding:attest')
      BINDING_WRITES.push({ op: 'attest', bindingId: binding.bindingId, label })
      return true
    },
  }
})

function fakeBinding(projectId: string, platform: string, externalAccountId: string, over: Partial<FakeBinding> = {}): FakeBinding {
  bindingSeq += 1
  return {
    bindingId: `77777777-7777-4777-8777-${String(bindingSeq).padStart(12, '0')}`,
    projectId, platform, externalAccountId,
    accountLabel: null,
    credentialSource: 'project_store',
    verification: 'provider_attested',
    verifiedAt: '2026-09-15T06:15:00.000Z',
    boundBy: `user:${ME}`,
    boundAt: '2026-09-15T12:00:00.000Z',
    blockedAt: null,
    blockedReason: null,
    supersededAt: null,
    ...over,
  }
}

const ENV_KEYS = ['PLATFORM_OPERATOR_EMAILS', 'BREVO_ADMIN_EMAIL', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']
const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

beforeEach(() => {
  vi.resetModules()
  USER = { id: ME, email: OPERATOR_EMAIL }
  PROJECTS = [{ id: PROMPT, owner_id: ME }, { id: FAMILY, owner_id: ME }, { id: FOREIGN, owner_id: OTHER_OPERATOR }]
  ORDER = []
  STATES = []
  STATE_INSERTS = []
  STATE_INSERT_FAILS = false
  CONSUMES = []
  STORED = []
  STORE_FAILS = false
  EVENTS = []
  EVENT_FAILS = new Set()
  BINDING_READ_FAILS = false
  BINDING_WRITES = []
  REBIND_FAILURE = null
  bindingSeq = 0
  BINDINGS = [
    fakeBinding(PROMPT, 'youtube', CHANNEL_PROMPT, {
      credentialSource: 'platform_env_transitional', verification: 'runtime_evidence',
      boundBy: 'migration:social_account_bindings_the_prompt_evidence',
    }),
    fakeBinding(PROMPT, 'instagram', '17841437027967629'),
  ]
  CODES = {}
  CHANNELS = {}
  FETCHED = []
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR_EMAIL
  delete process.env.BREVO_ADMIN_EMAIL
  process.env.YOUTUBE_CLIENT_ID = CLIENT_ID
  process.env.YOUTUBE_CLIENT_SECRET = CLIENT_SECRET
  process.env.YOUTUBE_REFRESH_TOKEN = Y1_REFRESH
  vi.stubGlobal('fetch', async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
    const url = String(input)
    const authorization = init?.headers?.Authorization ?? null
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
    const body = init?.body == null ? null : String(init.body)
    ORDER.push(url === TOKEN_URL ? 'fetch:token' : 'fetch:channels')
    FETCHED.push({ url, method: init?.method ?? 'GET', body, bearer })
    let answer: Answer
    if (url === TOKEN_URL) {
      const code = new URLSearchParams(body ?? '').get('code') ?? ''
      const grant = CODES[code]
      answer = !grant
        ? { status: 400, body: { error: 'invalid_grant', error_description: `Bad Request ${code}` } }
        : grant instanceof Error || 'status' in grant
          ? grant
          : { status: 200, body: {
              access_token: grant.access, ...(grant.refresh ? { refresh_token: grant.refresh } : {}),
              scope: grant.scopes.join(' '), token_type: 'Bearer', expires_in: 3599,
            } }
    } else if (url.startsWith('https://www.googleapis.com/youtube/v3/channels')) {
      answer = CHANNELS[bearer ?? ''] ?? { status: 401, body: { error: { code: 401, message: `invalid credentials ${bearer}` } } }
    } else {
      answer = { status: 404, body: { error: 'unexpected' } }
    }
    if (answer instanceof Error) throw answer
    const { status, body: payload } = answer
    return { status, ok: status >= 200 && status < 300, json: async () => payload } as unknown as Response
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = ORIGINAL_ENV[key]
  }
})

// ── Drivers ─────────────────────────────────────────────────────────────────

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const last = <T>(items: T[]): T => items[items.length - 1]
const activeYouTube = () => BINDINGS.filter((b) => b.supersededAt === null && b.platform === 'youtube')

async function start(body: unknown) {
  const { POST } = await import('@/app/api/media/youtube/oauth/start/route')
  const res = await POST(new Request('https://ai-operating-platform-web.vercel.app/api/media/youtube/oauth/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  const text = await res.text()
  return { status: res.status, text, json: text ? JSON.parse(text) : null, headers: res.headers }
}

async function callback(query: Record<string, string>, origin = 'https://ai-operating-platform-web.vercel.app') {
  const { GET } = await import('@/app/api/media/youtube/oauth/callback/route')
  const url = new URL('/api/media/youtube/oauth/callback', origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const res = await GET(new Request(url.toString()))
  const location = res.headers.get('location') ?? ''
  return { status: res.status, location, code: new URL(location).searchParams.get('youtube'), headers: res.headers }
}

/** Starts a connection for real and returns the state Google would echo back. */
async function begin(projectId: string, changeAccount = false) {
  const res = await start(changeAccount ? { project_id: projectId, change_account: true } : { project_id: projectId })
  expect(res.status).toBe(200)
  const consent = new URL(res.json.authorization_url)
  const state = consent.searchParams.get('state')!
  const row = STATES.find((s) => s.state_hash === sha256(state))!
  return { state, verifier: row.code_verifier!, consent }
}

const channelsOf = (...items: { id: string; title: string }[]): Answer =>
  ({ status: 200, body: { items: items.map((item) => ({ id: item.id, snippet: { title: item.title } })) } })

/** Google's answer for a code: the grant, and what YouTube says its access token acts as. */
function google(code: string, channel: { id: string; title: string } | Answer, over: Partial<Grant> = {}) {
  const grant: Grant = { refresh: `1//refresh-${code}`, access: `ya29.${code}`, scopes: [UPLOAD, READ, ANALYTICS], ...over }
  CODES[code] = grant
  CHANNELS[grant.access] = channel instanceof Error || 'status' in channel ? channel : channelsOf(channel)
  return grant
}

async function logged<T>(run: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const lines: string[] = []
  const capture = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  const spies = (['error', 'warn', 'log', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(capture))
  try {
    return { result: await run(), logged: lines.join('\n') }
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('youtube connection · start — who may begin, for which project', () => {
  it('unauthenticated is 401 and a signed-in owner who is not the platform operator is 403 — before anything is read or recorded', async () => {
    USER = null
    expect((await start({ project_id: PROMPT })).status).toBe(401)
    USER = { id: ME, email: 'owner-not-operator@omnira.test' }
    const denied = await logged(() => start({ project_id: PROMPT }))
    expect(denied.result.status).toBe(403)
    expect(denied.result.json).toEqual({ error: 'Forbidden', denied: 'platform_operator_required' })
    expect({ STATE_INSERTS, ORDER }).toEqual({ STATE_INSERTS: [], ORDER: [] })
  })

  it('the project is explicit and must be the operator’s own — no default, slug or foreign project', async () => {
    for (const body of [{}, { project_id: 'ai-media-automation' }, { project_id: PROMPT, change_account: 'yes' }, [PROMPT]]) {
      expect((await start(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect((await start({ project_id: FOREIGN })).status).toBe(403)
    expect({ STATE_INSERTS, ORDER }).toEqual({ STATE_INSERTS: [], ORDER: [] })
  })

  it('without the platform’s OAuth client, with an unreadable binding, or asking to change a channel the project does not have, nothing is begun', async () => {
    delete process.env.YOUTUBE_CLIENT_SECRET
    expect(await start({ project_id: PROMPT })).toMatchObject({ status: 503, json: { refusal: 'oauth_client_not_configured' } })
    process.env.YOUTUBE_CLIENT_SECRET = CLIENT_SECRET
    BINDING_READ_FAILS = true
    expect(await start({ project_id: PROMPT })).toMatchObject({ status: 503, json: { refusal: 'binding_unreadable' } })
    BINDING_READ_FAILS = false
    expect((await start({ project_id: FAMILY, change_account: true })).status).toBe(400)
    expect(STATE_INSERTS).toEqual([])
    STATE_INSERT_FAILS = true
    expect(await start({ project_id: FAMILY })).toMatchObject({ status: 503, json: { refusal: 'state_unavailable' } })
    expect(STATES).toEqual([])
  })

  it('a state is recorded for exactly this operator and project — its hash, never the state — and the consent URL is exact', async () => {
    const res = await start({ project_id: FAMILY })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys(res.json).sort()).toEqual(['authorization_url', 'ok', 'project_id'])
    const consent = new URL(res.json.authorization_url)
    const state = consent.searchParams.get('state')!
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(STATE_INSERTS).toHaveLength(1)
    const row = STATE_INSERTS[0] as Record<string, string>
    expect(row).toEqual({
      state_hash: sha256(state), project_id: FAMILY, platform: 'youtube', actor: `user:${ME}`,
      change_account: false, code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    })
    expect(JSON.stringify(STATE_INSERTS)).not.toContain(state)
    expect(`${consent.origin}${consent.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(consent.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: `${UPLOAD} ${READ} ${ANALYTICS}`,
      access_type: 'offline',
      prompt: 'consent select_account',
      state,
      code_challenge: createHash('sha256').update(row.code_verifier).digest('base64url'),
      code_challenge_method: 'S256',
    })
    for (const secret of [CLIENT_SECRET, Y1_REFRESH, row.code_verifier]) expect(res.text).not.toContain(secret)
    expect(FETCHED).toEqual([])
  })

  it('every start is a new state; a channel change is recorded as asked', async () => {
    const first = await begin(PROMPT)
    const second = await begin(PROMPT, true)
    expect(first.state).not.toBe(second.state)
    expect(first.verifier).not.toBe(second.verifier)
    expect(STATES.map((s) => `${s.project_id}:${s.change_account}`)).toEqual([`${PROMPT}:false`, `${PROMPT}:true`])
  })
})

describe('youtube connection · callback — the state is consumed once, and only by the operator it was issued to', () => {
  it('no session or no operator: nothing is consumed, audited or asked', async () => {
    const { state } = await begin(FAMILY)
    USER = null
    expect((await callback({ state, code: 'c1' })).code).toBe('session_required')
    USER = { id: ME, email: 'owner-not-operator@omnira.test' }
    expect((await callback({ state, code: 'c1' })).code).toBe('operator_required')
    expect({ CONSUMES, EVENTS, FETCHED }).toEqual({ CONSUMES: [], EVENTS: [], FETCHED: [] })
  })

  it('a malformed, unknown, expired or replayed state is state_invalid — nothing audited, nothing asked', async () => {
    for (const state of ['', 'short', `${'x'.repeat(43)}!`]) expect((await callback({ state, code: 'c1' })).code, state).toBe('state_invalid')
    expect(CONSUMES).toEqual([])
    expect((await callback({ state: 'A'.repeat(43), code: 'c1' })).code).toBe('state_invalid')
    const expired = await begin(FAMILY)
    last(STATES).expired = true
    expect((await callback({ state: expired.state, code: 'c1' })).code).toBe('state_invalid')
    expect({ EVENTS, FETCHED }).toEqual({ EVENTS: [], FETCHED: [] })

    const used = await begin(FAMILY)
    google('c2', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    expect((await callback({ state: used.state, code: 'c2' })).code).toBe('connected')
    const events = EVENTS.length
    const fetched = FETCHED.length
    expect((await callback({ state: used.state, code: 'c2' })).code).toBe('state_invalid')
    expect({ events: EVENTS.length, fetched: FETCHED.length }).toEqual({ events, fetched })
  })

  it('a state issued to another operator is refused and spent — the right operator cannot use it afterwards either', async () => {
    const { state } = await begin(FAMILY)
    google('c3', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    USER = { id: OTHER_OPERATOR, email: OPERATOR_EMAIL }
    const wrong = await logged(() => callback({ state, code: 'c3' }))
    expect(wrong.result.code).toBe('state_invalid')
    expect(wrong.logged).not.toContain(state)
    USER = { id: ME, email: OPERATOR_EMAIL }
    expect((await callback({ state, code: 'c3' })).code).toBe('state_invalid')
    expect({ EVENTS, FETCHED, STORED }).toEqual({ EVENTS: [], FETCHED: [], STORED: [] })
  })

  it('a project the operator no longer owns is refused before anything is audited or asked', async () => {
    const { state } = await begin(FAMILY)
    PROJECTS = PROJECTS.filter((p) => p.id !== FAMILY)
    expect((await callback({ state, code: 'c4' })).code).toBe('project_forbidden')
    expect({ EVENTS, FETCHED }).toEqual({ EVENTS: [], FETCHED: [] })
  })

  it('an attempt that cannot be audited contacts nobody and stores nothing', async () => {
    const { state } = await begin(FAMILY)
    google('c5', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    EVENT_FAILS.add('attempted')
    const run = await logged(() => callback({ state, code: 'c5' }))
    expect(run.result.code).toBe('audit_unavailable')
    expect({ FETCHED, STORED, BINDING_WRITES }).toEqual({ FETCHED: [], STORED: [], BINDING_WRITES: [] })
  })

  it('every answer lands on Inställningar at the pinned production origin — never the request’s host — uncached and without a referrer', async () => {
    const { state } = await begin(FAMILY)
    const res = await callback({ state, code: 'unknown-code' }, 'https://evil.example')
    expect(res.status).toBe(303)
    expect(res.location).toBe('https://ai-operating-platform-web.vercel.app/settings?youtube=authorization_failed')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

describe('youtube connection · callback — Google’s answer, the grant and the channel, each on its own terms', () => {
  it('a declined consent is audited as authorization_denied, and nothing is asked', async () => {
    const { state } = await begin(FAMILY)
    expect((await callback({ state, error: 'access_denied' })).code).toBe('authorization_denied')
    expect(EVENTS.map((e) => [e.outcome, e.detail?.failure_stage ?? null])).toEqual([['attempted', null], ['failed', 'authorization_denied']])
    expect(FETCHED).toEqual([])
  })

  it('the code is exchanged with its own PKCE verifier and the pinned redirect URI — never with the Y1 refresh token', async () => {
    const { state, verifier } = await begin(FAMILY)
    google('c6', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    await callback({ state, code: 'c6' })
    expect(FETCHED.map((f) => f.url)).toEqual([TOKEN_URL, CHANNELS_URL])
    expect(Object.fromEntries(new URLSearchParams(FETCHED[0].body ?? ''))).toEqual({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: 'c6', code_verifier: verifier,
      redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
    })
    expect(FETCHED[1]).toMatchObject({ method: 'GET', bearer: 'ya29.c6' })
    expect(JSON.stringify(FETCHED)).not.toContain(Y1_REFRESH)
  })

  it('a refused code, provider trouble, no refresh token or any missing scope stores and binds nothing', async () => {
    const cases: [() => void, string, string][] = [
      [() => { CODES.c7 = { status: 400, body: { error: 'invalid_grant' } } }, 'authorization_failed', 'code_exchange'],
      [() => { CODES.c7 = { status: 503, body: { error: 'backendError' } } }, 'provider_unavailable', 'code_exchange'],
      [() => { google('c7', { id: CHANNEL_FAMILY, title: 'F' }, { refresh: null }) }, 'refresh_token_missing', 'refresh_token_missing'],
      [() => { google('c7', { id: CHANNEL_FAMILY, title: 'F' }, { scopes: [UPLOAD, READ] }) }, 'scope_missing', 'scope_missing'],
      [() => { google('c7', { id: CHANNEL_FAMILY, title: 'F' }, { scopes: [UPLOAD, ANALYTICS] }) }, 'scope_missing', 'scope_missing'],
      [() => { google('c7', { id: CHANNEL_FAMILY, title: 'F' }, { scopes: [READ, ANALYTICS] }) }, 'scope_missing', 'scope_missing'],
    ]
    for (const [arrange, code, stage] of cases) {
      CODES = {}
      CHANNELS = {}
      arrange()
      const { state } = await begin(FAMILY)
      expect((await callback({ state, code: 'c7' })).code, code).toBe(code)
      expect(last(EVENTS), code).toMatchObject({ outcome: 'failed', detail: { failure_stage: stage } })
    }
    expect({ STORED, BINDING_WRITES }).toEqual({ STORED: [], BINDING_WRITES: [] })
  })

  it('no channel, several channels, a refused token or trouble at YouTube stores and binds nothing', async () => {
    const cases: [Answer, string, string][] = [
      [{ status: 200, body: { items: [] } }, 'channel_missing', 'provider_verification'],
      [channelsOf({ id: CHANNEL_FAMILY, title: 'F' }, { id: CHANNEL_OTHER, title: 'O' }), 'channel_ambiguous', 'account_ambiguous'],
      [{ status: 401, body: { error: { code: 401 } } }, 'authorization_failed', 'provider_verification'],
      [{ status: 500, body: { error: { code: 500 } } }, 'provider_unavailable', 'provider_verification'],
    ]
    for (const [answer, code, stage] of cases) {
      CODES = {}
      CHANNELS = {}
      google('c8', answer)
      const { state } = await begin(FAMILY)
      expect((await callback({ state, code: 'c8' })).code, code).toBe(code)
      expect(last(EVENTS), code).toMatchObject({ outcome: 'failed', detail: { failure_stage: stage } })
    }
    expect({ STORED, BINDING_WRITES }).toEqual({ STORED: [], BINDING_WRITES: [] })
  })
})

describe('youtube connection · callback — the channel is bound by O1 before anything is stored', () => {
  it('created: a project’s first channel is bound to it, then its own connection stored — one terminal event names the channel', async () => {
    const { state } = await begin(FAMILY)
    const grant = google('c9', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    ORDER = []
    expect((await callback({ state, code: 'c9' })).code).toBe('connected')
    expect(ORDER).toEqual(['event:attempted', 'fetch:token', 'fetch:channels', 'binding:read', 'binding:create', 'store', 'event:replaced'])
    expect(BINDING_WRITES).toEqual([{
      op: 'create', projectId: FAMILY, platform: 'youtube', externalAccountId: CHANNEL_FAMILY, accountLabel: 'Familje-Stunden', boundBy: `user:${ME}`,
    }])
    expect(STORED).toEqual([{ projectId: FAMILY, platform: 'youtube', accessToken: grant.refresh, accountId: CHANNEL_FAMILY, expiresAt: null }])
    expect(EVENTS[0]).toEqual({ operationId: expect.stringMatching(UUID), projectId: FAMILY, platform: 'youtube', actor: `user:${ME}`, outcome: 'attempted' })
    expect(EVENTS[1]).toEqual({
      operationId: EVENTS[0].operationId, projectId: FAMILY, platform: 'youtube', actor: `user:${ME}`,
      outcome: 'replaced', externalAccountId: CHANNEL_FAMILY, bindingAction: 'created',
    })
    expect(EVENTS).toHaveLength(2)
  })

  it('isolation: The Prompt’s channel is never bound or stored for another project', async () => {
    const { state } = await begin(FAMILY)
    google('c10', { id: CHANNEL_PROMPT, title: 'The Prompt' })
    expect((await callback({ state, code: 'c10' })).code).toBe('channel_bound_to_other_project')
    expect(last(EVENTS)).toMatchObject({
      outcome: 'failed', projectId: FAMILY, externalAccountId: CHANNEL_PROMPT, detail: { failure_stage: 'account_bound_to_other_project' },
    })
    expect(STORED).toEqual([])
    expect(activeYouTube().map((b) => `${b.projectId}:${b.externalAccountId}:${b.credentialSource}`))
      .toEqual([`${PROMPT}:${CHANNEL_PROMPT}:platform_env_transitional`])
  })

  it('isolation: a channel change onto The Prompt’s channel is refused, and the project keeps its own channel', async () => {
    BINDINGS.push(fakeBinding(FAMILY, 'youtube', CHANNEL_FAMILY))
    const { state } = await begin(FAMILY, true)
    google('c11', { id: CHANNEL_PROMPT, title: 'The Prompt' })
    expect((await callback({ state, code: 'c11' })).code).toBe('channel_bound_to_other_project')
    expect(STORED).toEqual([])
    expect(activeYouTube().map((b) => `${b.projectId}:${b.externalAccountId}`).sort())
      .toEqual([`${PROMPT}:${CHANNEL_PROMPT}`, `${FAMILY}:${CHANNEL_FAMILY}`].sort())
  })

  it('migrated: The Prompt’s own connection for its bound channel is stored FIRST, then the Y1 binding moves to the project store', async () => {
    const { state } = await begin(PROMPT)
    const grant = google('c12', { id: CHANNEL_PROMPT, title: 'The Prompt' })
    ORDER = []
    expect((await callback({ state, code: 'c12' })).code).toBe('migrated')
    expect(ORDER).toEqual(['event:attempted', 'fetch:token', 'fetch:channels', 'binding:read', 'store', 'binding:rebind', 'event:replaced'])
    expect(STORED).toEqual([{ projectId: PROMPT, platform: 'youtube', accessToken: grant.refresh, accountId: CHANNEL_PROMPT, expiresAt: null }])
    expect(activeYouTube().map((b) => `${b.projectId}:${b.externalAccountId}:${b.credentialSource}:${b.accountLabel}`))
      .toEqual([`${PROMPT}:${CHANNEL_PROMPT}:project_store:The Prompt`])
    expect(last(EVENTS)).toMatchObject({ outcome: 'replaced', projectId: PROMPT, externalAccountId: CHANNEL_PROMPT, bindingAction: 'migrated' })
  })

  it('a refused move leaves the Y1 binding — and publishing through it — exactly as it was, and says the move did not complete', async () => {
    const { state } = await begin(PROMPT)
    google('c13', { id: CHANNEL_PROMPT, title: 'The Prompt' })
    REBIND_FAILURE = 'binding_changed'
    expect((await callback({ state, code: 'c13' })).code).toBe('migration_incomplete')
    expect(activeYouTube().map((b) => b.credentialSource)).toEqual(['platform_env_transitional'])
    expect(STORED.map((s) => `${s.projectId}:${s.accountId}`)).toEqual([`${PROMPT}:${CHANNEL_PROMPT}`])
    expect(last(EVENTS)).toMatchObject({ outcome: 'failed', detail: { failure_stage: 'binding' } })
  })

  it('a store that fails during the move changes nothing: no rebind is attempted', async () => {
    const { state } = await begin(PROMPT)
    google('c14', { id: CHANNEL_PROMPT, title: 'The Prompt' })
    STORE_FAILS = true
    expect((await callback({ state, code: 'c14' })).code).toBe('store_failed')
    expect(BINDING_WRITES).toEqual([])
    expect(activeYouTube().map((b) => b.credentialSource)).toEqual(['platform_env_transitional'])
  })

  it('matched: a project-store channel renews its own connection and records YouTube’s attestation', async () => {
    const own = fakeBinding(FAMILY, 'youtube', CHANNEL_FAMILY)
    BINDINGS.push(own)
    const { state } = await begin(FAMILY)
    google('c15', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    ORDER = []
    expect((await callback({ state, code: 'c15' })).code).toBe('reconnected')
    expect(ORDER).toEqual(['event:attempted', 'fetch:token', 'fetch:channels', 'binding:read', 'store', 'binding:attest', 'event:replaced'])
    expect(BINDING_WRITES).toEqual([{ op: 'attest', bindingId: own.bindingId, label: 'Familje-Stunden' }])
  })

  it('another channel without an explicit change, a change to the same channel, or the channel of a blocked binding is refused', async () => {
    BINDINGS.push(fakeBinding(FAMILY, 'youtube', CHANNEL_FAMILY))
    let run = await begin(FAMILY)
    google('c16', { id: CHANNEL_OTHER, title: 'Other' })
    expect((await callback({ state: run.state, code: 'c16' })).code).toBe('channel_mismatch')
    run = await begin(FAMILY, true)
    google('c17', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    expect((await callback({ state: run.state, code: 'c17' })).code).toBe('already_connected')
    BINDINGS.find((b) => b.projectId === FAMILY && b.platform === 'youtube')!.blockedAt = '2026-09-15T12:00:00.000Z'
    run = await begin(FAMILY)
    google('c18', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    expect((await callback({ state: run.state, code: 'c18' })).code).toBe('binding_blocked')
    expect(STORED).toEqual([])
    expect(BINDING_WRITES).toEqual([])
  })

  it('rebound: an explicit change to a channel no other project holds binds it, then stores its connection', async () => {
    BINDINGS.push(fakeBinding(FAMILY, 'youtube', CHANNEL_FAMILY))
    const { state } = await begin(FAMILY, true)
    google('c19', { id: CHANNEL_OTHER, title: 'Other' })
    ORDER = []
    expect((await callback({ state, code: 'c19' })).code).toBe('channel_changed')
    expect(ORDER).toEqual(['event:attempted', 'fetch:token', 'fetch:channels', 'binding:read', 'binding:rebind', 'store', 'event:replaced'])
    expect(STORED.map((s) => `${s.projectId}:${s.accountId}`)).toEqual([`${FAMILY}:${CHANNEL_OTHER}`])
    expect(last(EVENTS)).toMatchObject({ outcome: 'replaced', bindingAction: 'rebound', externalAccountId: CHANNEL_OTHER })
  })

  it('audit integrity: a connection whose terminal event is lost stands and says so; a refusal whose event is lost says nothing was connected', async () => {
    let run = await begin(FAMILY)
    google('c20', { id: CHANNEL_FAMILY, title: 'Familje-Stunden' })
    EVENT_FAILS.add('replaced')
    const connected = await logged(() => callback({ state: run.state, code: 'c20' }))
    expect(connected.result.code).toBe('connected_audit_incident')
    expect(connected.logged).toMatch(/AUDIT INTEGRITY INCIDENT/)
    expect(STORED).toHaveLength(1)
    EVENT_FAILS = new Set(['failed'])
    run = await begin(FAMILY)
    const refused = await logged(() => callback({ state: run.state, error: 'access_denied' }))
    expect(refused.result.code).toBe('audit_incomplete')
  })
})

describe('youtube connection · nothing a token, code, state or secret can ride on', () => {
  it('no redirect, audit event or log line carries a token, code, state, verifier or secret — and the start answer no secret', async () => {
    const lines: string[] = []
    const locations: string[] = []
    const secrets: string[] = [CLIENT_SECRET, Y1_REFRESH]
    const scenario = async (projectId: string, channel: { id: string; title: string }, code: string, over: Partial<Grant> = {}) => {
      const res = await start({ project_id: projectId })
      const consent = new URL(res.json.authorization_url)
      const state = consent.searchParams.get('state')!
      const verifier = last(STATES).code_verifier!
      for (const secret of [CLIENT_SECRET, Y1_REFRESH, verifier]) expect(res.text).not.toContain(secret)
      const grant = google(code, channel, over)
      secrets.push(state, verifier, grant.access, code, ...(grant.refresh ? [grant.refresh] : []))
      const out = await logged(() => callback({ state, code }))
      locations.push(out.result.location)
      lines.push(out.logged)
    }
    await scenario(FAMILY, { id: CHANNEL_FAMILY, title: 'Familje-Stunden' }, `4/0A-code-${'a'.repeat(40)}`)
    await scenario(PROMPT, { id: CHANNEL_PROMPT, title: 'The Prompt' }, `4/0A-code-${'b'.repeat(40)}`)
    await scenario(FAMILY, { id: CHANNEL_FAMILY, title: 'Familje-Stunden' }, `4/0A-code-${'c'.repeat(40)}`, { scopes: [UPLOAD] })
    EVENT_FAILS.add('replaced')
    await scenario(PROMPT, { id: CHANNEL_PROMPT, title: 'The Prompt' }, `4/0A-code-${'d'.repeat(40)}`)
    const everything = JSON.stringify({ lines, locations, EVENTS, BINDING_WRITES })
    for (const secret of secrets) expect(everything).not.toContain(secret)
    for (const location of locations) expect(new URL(location).search).toMatch(/^\?youtube=[a-z_]+$/)
  })
})

describe('youtube connection · the codebase, read', () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (entry === 'node_modules' || entry === '.next' || entry === 'qa') continue
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }
  const FILES = () => ['app', 'components', 'lib'].flatMap((d) => sourceFiles(resolve(APP, d)))
  const rel = (f: string) => relative(APP, f)
  const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  const callers = (name: string, definedIn: string) => FILES()
    .filter((f) => rel(f) !== definedIn && new RegExp(`\\b${name}\\s*\\(`).test(code(f)))
    .map(rel)
    .sort()

  it('the state is touched only by the OAuth module; the start route records it, the callback consumes it and alone exchanges a code', () => {
    expect(FILES().filter((f) => /social_oauth_state/.test(code(f))).map(rel)).toEqual(['lib/media/youtube-oauth.ts'])
    expect(callers('recordOAuthState', 'lib/media/youtube-oauth.ts')).toEqual(['app/api/media/youtube/oauth/start/route.ts'])
    expect(callers('consumeOAuthState', 'lib/media/youtube-oauth.ts')).toEqual(['app/api/media/youtube/oauth/callback/route.ts'])
    expect(callers('exchangeYouTubeAuthorizationCode', 'lib/media/social-identity.ts')).toEqual(['app/api/media/youtube/oauth/callback/route.ts'])
  })

  it('the redirect URI is the registered one, pinned in code — never built from a request, a header or the environment', () => {
    expect(code(resolve(APP, 'lib/media/youtube-oauth.ts'))).toContain(`export const YOUTUBE_OAUTH_REDIRECT_URI = '${REDIRECT_URI}'`)
    for (const file of ['lib/media/youtube-oauth.ts', 'app/api/media/youtube/oauth/start/route.ts', 'app/api/media/youtube/oauth/callback/route.ts']) {
      expect(code(resolve(APP, file)), file).not.toMatch(/process\.env|headers\.get\(|x-forwarded|nextUrl|NEXT_PUBLIC_APP_URL|\.origin\b/)
    }
  })

  it('the scopes are exactly upload, channel read and analytics read — and a grant needs all three', async () => {
    const { YOUTUBE_OAUTH_SCOPES, hasRequiredYouTubeScopes } = await import('@/lib/media/youtube-oauth')
    expect([...YOUTUBE_OAUTH_SCOPES]).toEqual([UPLOAD, READ, ANALYTICS])
    expect(hasRequiredYouTubeScopes([ANALYTICS, READ, UPLOAD, 'openid'])).toBe(true)
    for (const missing of [UPLOAD, READ, ANALYTICS]) {
      expect(hasRequiredYouTubeScopes([UPLOAD, READ, ANALYTICS].filter((s) => s !== missing)), missing).toBe(false)
    }
  })

  it('the migration keeps the state server-only and credential-blind, on pinned search paths', () => {
    const sql = readFileSync(resolve(APP, 'supabase/migrations/20260915170000_youtube_project_oauth.sql'), 'utf8')
      .replace(/--.*$/gm, '').toLowerCase()
    expect(sql).toMatch(/alter table public\.social_oauth_states enable row level security/)
    expect(sql).toMatch(/revoke all on table public\.social_oauth_states from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/grant select, insert, update on table public\.social_oauth_states to service_role/)
    expect(sql).not.toMatch(/create policy|disable row level security|grant [^;]* to (anon|authenticated)|drop table|delete from|truncate/)
    const table = sql.slice(sql.indexOf('create table public.social_oauth_states ('), sql.indexOf('constraint social_oauth_states_state_hash_shape'))
    expect([...table.matchAll(/^\s+([a-z_]+)\s+(text|uuid|boolean|timestamptz)\b/gm)].map((m) => m[1]))
      .toEqual(['state_hash', 'project_id', 'platform', 'actor', 'change_account', 'code_verifier', 'created_at', 'expires_at', 'consumed_at'])
    expect(sql).toMatch(/check \(\(consumed_at is null\) = \(code_verifier is not null\)\)/)
    for (const fn of ['social_oauth_states_guard_insert', 'social_oauth_states_guard_update', 'social_oauth_state_consume']) {
      const body = sql.slice(sql.indexOf(`create or replace function public.${fn}`))
      expect(body.slice(0, body.indexOf('as $$')), fn).toMatch(/set search_path = ''/)
    }
  })
})
