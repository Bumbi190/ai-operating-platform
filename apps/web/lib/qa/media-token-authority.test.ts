/**
 * /api/media/token — Settings S0 authority, made project-scoped (2026-09-14).
 *
 * S0 made replacing a publishing credential take the platform operator's authority,
 * kept project ownership, audited every replacement before it happened and proved
 * nothing is ever read back. The owner decisions of 2026-09-14 (1A · 3O1) make this
 * route the one place a project's social account is chosen:
 *
 *   Project → Platform → Verified External Account → Credential
 *
 *   · the project is explicit (project_id) and must be the operator's own — there is
 *     no default, first or implicit project;
 *   · the platform, asked with the credential, names the account — never the request
 *     body, never an environment variable;
 *   · that account must be the project's verified binding (matched), become it with a
 *     first credential (created), or become it through an explicit, audited account
 *     change (rebound) — and one external account belongs to one project only (O1);
 *   · every refusal happens before anything is stored.
 *
 * WHAT IS REAL. The operator predicate and its allowlist, project access, and the
 * provider attestation (lib/media/social-identity.ts), driven by a simulated Graph API
 * behind a stubbed fetch — so the account that decides is the one the platform
 * answered with, and every credential's path to the platform is observable.
 *
 * WHAT IS FAKED. The session, the database, the credential store, the audit writer
 * and the binding store. The fake binding store keeps the O1 semantics the table's
 * unique indexes enforce; the table itself is proven against real Postgres in
 * social-account-bindings-sql.test.ts, and the audit row's construction in
 * platform-credential-events.test.ts.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const APP = resolve(__dirname, '../..')
const ME = '0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const SOMEONE_ELSE = '9d3b7a51-2c4e-4f6a-8b1d-3e5f7a9c1b2d'
const OPERATOR_EMAIL = 'operator@omnira.test'
/** The operator's project with verified Instagram, Facebook and YouTube bindings (The Prompt's shape). */
const PROJECT = '33333333-3333-4333-8333-333333333333'
/** Another project the operator owns, with no binding yet (Familje-Stunden's shape). */
const SIBLING = '44444444-4444-4444-8444-444444444444'
/** A project someone else owns. */
const FOREIGN = '55555555-5555-4555-8555-555555555555'

const IG_ACCOUNT = '17841437027967629'
const IG_OTHER = '17841400000000002'
const IG_THIRD = '17841400000000003'
const PAGE = '1138612202672850'
const PAGE_OTHER = '2000000000000002'
const PERSON = '100000000000001'

/** Instagram login → IG_ACCOUNT. */
const IG_TOKEN = `IGAA${'i'.repeat(80)}`
/** Instagram login → IG_OTHER. */
const IG_OTHER_TOKEN = `IGAA${'o'.repeat(80)}`
/** Rejected by Instagram. */
const IG_BAD_TOKEN = `IGAA${'b'.repeat(80)}`
/** A Facebook user who manages PAGE and PAGE_OTHER. */
const FB_USER_TOKEN = `EAAB${'x'.repeat(80)}`
/** A Facebook user who manages PAGE_OTHER only. */
const FB_OTHER_USER_TOKEN = `EAAC${'w'.repeat(80)}`
const LONG_TOKEN = `EAAL${'z'.repeat(80)}`
const LONG_OTHER_TOKEN = `EAAM${'v'.repeat(80)}`
const PAGE_TOKEN = `EAAP${'y'.repeat(80)}`
const PAGE_OTHER_TOKEN = `EAAQ${'u'.repeat(80)}`
const APP_SECRET = 'meta-app-secret-value'
/** The retired environment fallbacks, set so that any use of them would show. */
const ENV_SENTINELS: Record<string, string> = {
  INSTAGRAM_ACCESS_TOKEN: `IGAA${'e'.repeat(80)}`,
  FACEBOOK_PAGE_ACCESS_TOKEN: `EAAE${'e'.repeat(80)}`,
  FACEBOOK_PAGE_ID: '999999999999999',
  INSTAGRAM_USER_ID: '17849999999999999',
}
const SECRETS = [
  IG_TOKEN, IG_OTHER_TOKEN, IG_BAD_TOKEN, FB_USER_TOKEN, FB_OTHER_USER_TOKEN,
  LONG_TOKEN, LONG_OTHER_TOKEN, PAGE_TOKEN, PAGE_OTHER_TOKEN, APP_SECRET,
  ENV_SENTINELS.INSTAGRAM_ACCESS_TOKEN, ENV_SENTINELS.FACEBOOK_PAGE_ACCESS_TOKEN,
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Op = [string, string, unknown]
interface AuditEvent {
  operationId: string
  projectId: string
  platform: string
  actor: string
  outcome: string
  detail?: Record<string, unknown>
  externalAccountId?: string | null
  bindingAction?: string | null
}
interface FakeBinding {
  bindingId: string
  projectId: string
  platform: 'instagram' | 'facebook' | 'youtube'
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
interface NewBindingInput {
  projectId: string
  platform: 'instagram' | 'facebook'
  externalAccountId: string
  accountLabel: string | null
  boundBy: string
}
type Answer = { status: number; body: unknown } | Error

let SEEN: { table: string; ops: Op[] }[] = []
let USER: { id: string; email: string | null } | null = null
let PROJECTS: Record<string, unknown>[] = []
let MEDIA_SCRIPTS: Record<string, unknown>[] = []
let STORED: Record<string, unknown>[] = []
let STORE_FAILS = false
let FETCHED: { url: string; bearer: string | null }[] = []
let PROVIDER: (url: string, bearer: string | null) => Answer = graph
let EVENTS: AuditEvent[] = []
let EVENT_FAILS = new Set<string>()
let ORDER: string[] = []
let BINDINGS: FakeBinding[] = []
let BINDING_READS: string[] = []
let BINDING_READ_FAILS = false
let BINDING_WRITES: Record<string, unknown>[] = []
let CREATE_FAILURE: string | null = null
let REBIND_FAILURE: string | null = null
let bindingSeq = 0

// ── A simulated Graph API ───────────────────────────────────────────────────

const ok = (body: unknown): Answer => ({ status: 200, body })
/** A Graph refusal that quotes the credential back, as real provider errors can. */
const rejected = (credential: string | null): Answer =>
  ({ status: 400, body: { error: { message: `Invalid OAuth access token: ${credential}`, type: 'OAuthException', code: 190 } } })

function graph(url: string, bearer: string | null): Answer {
  if (url.startsWith('https://graph.facebook.com/v21.0/oauth/access_token?')) {
    const input = new URL(url).searchParams.get('fb_exchange_token')
    return input === FB_USER_TOKEN ? ok({ access_token: LONG_TOKEN })
      : input === FB_OTHER_USER_TOKEN ? ok({ access_token: LONG_OTHER_TOKEN })
      : rejected(input)
  }
  if (url === 'https://graph.instagram.com/v21.0/me?fields=user_id,username') {
    return bearer === IG_TOKEN ? ok({ user_id: IG_ACCOUNT, username: 'theprompt.news' })
      : bearer === IG_OTHER_TOKEN ? ok({ user_id: IG_OTHER, username: 'someone.else' })
      : rejected(bearer)
  }
  if (url === 'https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username}&limit=200') {
    return bearer === FB_USER_TOKEN
      ? ok({ data: [{ instagram_business_account: { id: IG_OTHER, username: 'someone.else' } }] })
      : rejected(bearer)
  }
  if (url === 'https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&limit=200') {
    return bearer === LONG_TOKEN ? ok({ data: [{ id: PAGE, access_token: PAGE_TOKEN }, { id: PAGE_OTHER, access_token: PAGE_OTHER_TOKEN }] })
      : bearer === LONG_OTHER_TOKEN ? ok({ data: [{ id: PAGE_OTHER, access_token: PAGE_OTHER_TOKEN }] })
      : rejected(bearer)
  }
  if (url === 'https://graph.facebook.com/v21.0/me?fields=id,name') {
    return bearer === PAGE_TOKEN ? ok({ id: PAGE, name: 'The Prompt' })
      : bearer === PAGE_OTHER_TOKEN ? ok({ id: PAGE_OTHER, name: 'Another Page' })
      : bearer === LONG_TOKEN || bearer === LONG_OTHER_TOKEN ? ok({ id: PERSON, name: 'A Person' })
      : rejected(bearer)
  }
  if (/^https:\/\/graph\.facebook\.com\/v21\.0\/[^/?]+\?fields=post_id$/.test(url)) return ok({ post_id: 'post-1' })
  if (url.includes('/insights?metric=post_impressions')) return ok({ data: [] })
  return { status: 404, body: { error: { message: 'Unknown path', code: 803 } } }
}

// ── Seams ───────────────────────────────────────────────────────────────────

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
        : table === 'media_scripts' ? MEDIA_SCRIPTS.map((r) => ({ ...r }))
        : []
      const q: any = {
        select: (columns: string) => { rec.ops.push(['select', columns, null]); return q },
        eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter((r) => r[c] === v); return q },
        not: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolveRows: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolveRows, reject),
      }
      return q
    },
  }),
}))

vi.mock('@/lib/media/token-store', () => ({
  storeCredential: async (projectId: string, platform: string, input: { accessToken: string; accountId: string; expiresAt: Date | null }) => {
    ORDER.push('store')
    STORED.push({ projectId, platform, ...input })
    return STORE_FAILS ? { ok: false } : { ok: true }
  },
  readStoredCredential: async () => { throw new Error('the token route never reads a stored credential') },
}))

vi.mock('@/lib/media/credential-events', () => ({
  recordCredentialEvent: async (input: AuditEvent) => {
    ORDER.push(`event:${input.outcome}`)
    EVENTS.push(JSON.parse(JSON.stringify(input)))
    return EVENT_FAILS.has(input.outcome) ? { ok: false, code: '42501' } : { ok: true }
  },
}))

vi.mock('@/lib/media/social-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/social-bindings')>()
  const active = () => BINDINGS.filter((b) => b.supersededAt === null)
  const visible = ({ supersededAt: _superseded, ...binding }: FakeBinding) => binding
  const bind = (input: NewBindingInput) => {
    const created = fakeBinding(input.projectId, input.platform, input.externalAccountId, input.accountLabel, 'provider_attested', input.boundBy)
    BINDINGS.push(created)
    return created
  }
  return {
    ...actual,
    readActiveBinding: async (projectId: string, platform: string) => {
      ORDER.push('binding:read')
      BINDING_READS.push(`${projectId}:${platform}`)
      if (BINDING_READ_FAILS) return { ok: false }
      const found = active().find((b) => b.projectId === projectId && b.platform === platform)
      return { ok: true, binding: found ? visible(found) : null }
    },
    createBinding: async (input: NewBindingInput) => {
      ORDER.push('binding:create')
      BINDING_WRITES.push({ op: 'create', ...input })
      if (CREATE_FAILURE) return { ok: false, failure: CREATE_FAILURE }
      // O1, as social_account_bindings_account_single_project enforces it.
      if (active().some((b) => b.platform === input.platform && b.externalAccountId === input.externalAccountId)) {
        return { ok: false, failure: 'account_bound_to_other_project' }
      }
      if (active().some((b) => b.projectId === input.projectId && b.platform === input.platform)) {
        return { ok: false, failure: 'project_already_bound' }
      }
      return { ok: true, bindingId: bind(input).bindingId }
    },
    rebindAccount: async (input: NewBindingInput & { expectedBindingId: string }) => {
      ORDER.push('binding:rebind')
      BINDING_WRITES.push({ op: 'rebind', ...input })
      if (REBIND_FAILURE) return { ok: false, failure: REBIND_FAILURE }
      const current = active().find((b) => b.projectId === input.projectId && b.platform === input.platform)
      if (!current || current.bindingId !== input.expectedBindingId) return { ok: false, failure: 'binding_changed' }
      // One transaction in the database: a refused insert leaves the old binding active.
      if (active().some((b) => b !== current && b.platform === input.platform && b.externalAccountId === input.externalAccountId)) {
        return { ok: false, failure: 'account_bound_to_other_project' }
      }
      current.supersededAt = new Date().toISOString()
      return { ok: true, bindingId: bind(input).bindingId }
    },
    recordProviderAttestation: async (binding: { bindingId: string }, accountLabel: string | null) => {
      ORDER.push('binding:attest')
      BINDING_WRITES.push({ op: 'attest', bindingId: binding.bindingId, accountLabel })
      return true
    },
  }
})

function fakeBinding(
  projectId: string,
  platform: FakeBinding['platform'],
  externalAccountId: string,
  accountLabel: string | null = null,
  verification: FakeBinding['verification'] = 'provider_attested',
  boundBy = 'migration:social_account_bindings_the_prompt_evidence',
): FakeBinding {
  bindingSeq += 1
  return {
    bindingId: `77777777-7777-4777-8777-${String(bindingSeq).padStart(12, '0')}`,
    projectId, platform, externalAccountId, accountLabel,
    credentialSource: platform === 'youtube' ? 'platform_env_transitional' : 'project_store',
    verification,
    verifiedAt: '2026-09-14T06:15:00.000Z',
    boundBy,
    boundAt: '2026-09-14T12:00:00.000Z',
    blockedAt: null,
    blockedReason: null,
    supersededAt: null,
  }
}

const activeBinding = (projectId: string, platform: string) =>
  BINDINGS.find((b) => b.supersededAt === null && b.projectId === projectId && b.platform === platform) ?? null

const ENV_KEYS = ['PLATFORM_OPERATOR_EMAILS', 'BREVO_ADMIN_EMAIL', 'META_APP_ID', 'META_APP_SECRET', ...Object.keys(ENV_SENTINELS)]
const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

beforeEach(() => {
  vi.resetModules()
  SEEN = []
  STORED = []
  STORE_FAILS = false
  FETCHED = []
  EVENTS = []
  EVENT_FAILS = new Set()
  ORDER = []
  BINDING_READS = []
  BINDING_READ_FAILS = false
  BINDING_WRITES = []
  CREATE_FAILURE = null
  REBIND_FAILURE = null
  bindingSeq = 0
  USER = { id: ME, email: OPERATOR_EMAIL }
  PROJECTS = [
    { id: PROJECT, owner_id: ME },
    { id: SIBLING, owner_id: ME },
    { id: FOREIGN, owner_id: SOMEONE_ELSE },
  ]
  // Another project's post comes first: a probe that ignored the project would find it.
  MEDIA_SCRIPTS = [
    { project_id: FOREIGN, facebook_post_id: 'foreign-video' },
    { project_id: PROJECT, facebook_post_id: 'video-1' },
  ]
  BINDINGS = [
    fakeBinding(PROJECT, 'instagram', IG_ACCOUNT, 'theprompt.news', 'runtime_evidence'),
    fakeBinding(PROJECT, 'facebook', PAGE, null, 'runtime_evidence'),
    fakeBinding(PROJECT, 'youtube', 'UCUM9JDi75ziLssYcGLo8IPA', null, 'runtime_evidence'),
  ]
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR_EMAIL
  delete process.env.BREVO_ADMIN_EMAIL
  process.env.META_APP_ID = 'meta-app-id'
  process.env.META_APP_SECRET = APP_SECRET
  for (const [key, value] of Object.entries(ENV_SENTINELS)) process.env[key] = value
  PROVIDER = graph
  vi.stubGlobal('fetch', async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input)
    const authorization = init?.headers?.Authorization ?? null
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
    ORDER.push('fetch')
    FETCHED.push({ url, bearer })
    const answer = PROVIDER(url, bearer)
    if (answer instanceof Error) throw answer
    return { status: answer.status, json: async () => answer.body }
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

const touched = () => ({
  reads: SEEN.length, bindingReads: BINDING_READS.length, fetches: FETCHED.length,
  stored: STORED.length, events: EVENTS.length, bindingWrites: BINDING_WRITES.length,
})
const NOTHING = { reads: 0, bindingReads: 0, fetches: 0, stored: 0, events: 0, bindingWrites: 0 }
const INSTAGRAM = { project_id: PROJECT, platform: 'instagram', token: IG_TOKEN, expires_days: 60 }
const FACEBOOK = { project_id: PROJECT, platform: 'facebook', token: FB_USER_TOKEN }

// ─────────────────────────────────────────────────────────────────────────────

describe('/api/media/token · the platform operator comes first', () => {
  it('an unauthenticated request is 401 and reaches nothing', async () => {
    USER = null
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(401)
    expect(touched()).toEqual(NOTHING)
  })

  it('an owner who is not the platform operator is refused before any read, binding, provider contact, store or audit event', async () => {
    USER = { id: ME, email: 'owner-but-not-operator@omnira.test' }
    const res = await post(FACEBOOK)
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ error: 'Forbidden', denied: 'platform_operator_required' })
    expect(touched()).toEqual(NOTHING)
  })

  it('with no operator configured nobody passes — absence of configuration is absence of authority', async () => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    delete process.env.BREVO_ADMIN_EMAIL
    const { res } = await postLogged(INSTAGRAM)
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

  it('in the source: operator, shape, ownership, binding, attempted event, attestation, binding decision, store, terminal event', () => {
    const code = readFileSync(resolve(APP, 'app/api/media/token/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const body = code.slice(code.indexOf('export async function POST'))
    const sequence = [
      'resolvePlatformOperator()',
      'request.json()',
      'isProjectId(projectId)',
      'resolveProjectAccess()',
      'assertProjectAllowed(projectId, access.allowedProjectIds)',
      'readActiveBinding(projectId, platform)',
      "outcome: 'attempted'",
      'if (!attempted.ok)',
      'attestInstagramCredential(token',
      'attestFacebookPage(exchange.token',
      'createBinding(',
      'rebindAccount(',
      'storeCredential(projectId, platform',
      'recordProviderAttestation(binding!',
      "outcome: 'replaced'",
    ]
    const positions = sequence.map((needle) => body.indexOf(needle))
    sequence.forEach((needle, i) => expect(positions[i], needle).toBeGreaterThan(-1))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // The helpers above POST exchange, probe and phrase refusals; none stores, binds or audits.
    const helpers = code.slice(0, code.indexOf('export async function POST'))
    expect(helpers).not.toMatch(/storeCredential\s*\(|createBinding\s*\(|rebindAccount\s*\(|recordCredentialEvent\s*\(|recordProviderAttestation\s*\(/)
  })
})

describe('/api/media/token · the project is explicit, and it must be the operator’s own', () => {
  it('no project_id is a 400 — there is no default, first or implicit project, even for an operator who owns exactly one', async () => {
    PROJECTS = [{ id: PROJECT, owner_id: ME }]
    for (const projectId of [undefined, null, '', 'ai-media-automation', 42, PROJECT.replace(/-/g, '')]) {
      const res = await post({ platform: 'instagram', token: IG_TOKEN, ...(projectId === undefined ? {} : { project_id: projectId }) })
      expect(res.status, String(projectId)).toBe(400)
      expect(res.json.error).toMatch(/project_id/)
    }
    expect(touched()).toEqual(NOTHING)
  })

  it('a project the operator does not own — or that does not exist — is refused before its binding is read, a platform is asked or anything is audited', async () => {
    for (const projectId of [FOREIGN, '66666666-6666-4666-8666-666666666666']) {
      const res = await post({ ...INSTAGRAM, project_id: projectId })
      expect(res.status).toBe(403)
      expect(res.json).toEqual({ error: 'Forbidden' })
    }
    expect(BINDING_READS).toEqual([])
    expect(FETCHED).toEqual([])
    expect(STORED).toEqual([])
    expect(EVENTS).toEqual([])
    expect(BINDING_WRITES).toEqual([])
  })

  it('the credential lands on exactly the project named — never on a sibling project the operator also owns', async () => {
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: IG_OTHER_TOKEN })
    expect(res.status).toBe(200)
    expect(BINDING_READS).toEqual([`${SIBLING}:instagram`])
    expect(STORED.map((s) => s.projectId)).toEqual([SIBLING])
    expect(EVENTS.map((e) => e.projectId)).toEqual([SIBLING, SIBLING])
    expect(activeBinding(SIBLING, 'instagram')?.externalAccountId).toBe(IG_OTHER)
    expect(activeBinding(PROJECT, 'instagram')?.externalAccountId).toBe(IG_ACCOUNT)
  })

  it('the request cannot choose the account: ids in the body are ignored, and the platform’s answer decides', async () => {
    const res = await post({
      ...INSTAGRAM, account_id: IG_OTHER, external_account_id: IG_OTHER, user_id: IG_OTHER, instagram_account_id: IG_OTHER,
    })
    expect(res.status).toBe(200)
    expect(res.json.account).toEqual({ id: IG_ACCOUNT, label: 'theprompt.news', binding_action: 'matched' })
    expect(STORED[0]).toMatchObject({ accountId: IG_ACCOUNT })
    expect(JSON.stringify(BINDINGS)).not.toContain(IG_OTHER)
  })

  it('refused request shapes answer 400 and reach nothing — not a binding, not a platform, not an audit event', async () => {
    for (const body of [
      { project_id: PROJECT, platform: 'tiktok', token: IG_TOKEN },
      { project_id: PROJECT, platform: 'youtube', token: IG_TOKEN },
      { project_id: PROJECT, platform: 'instagram', token: 'too-short' },
      { project_id: PROJECT, platform: 'instagram', token: 12345 },
      { ...INSTAGRAM, expires_days: 'sixty' },
      { ...INSTAGRAM, expires_days: -1 },
      { ...INSTAGRAM, expires_days: 1e9 },
      { ...INSTAGRAM, page_id: PAGE },
      { ...FACEBOOK, page_id: 'not a page id!' },
      { ...FACEBOOK, change_account: 'yes' },
      null,
      [INSTAGRAM],
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(touched()).toEqual(NOTHING)
  })
})

describe('/api/media/token · Instagram — the platform names the account, the project’s binding decides', () => {
  it('matched — a credential for the bound account is stored for it, the attestation recorded, the replacement audited as matched', async () => {
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({
      ok: true, replaced: true, platform: 'instagram', project_id: PROJECT,
      account: { id: IG_ACCOUNT, label: 'theprompt.news', binding_action: 'matched' },
      operation_id: expect.stringMatching(UUID),
    })
    expect(FETCHED).toEqual([{ url: 'https://graph.instagram.com/v21.0/me?fields=user_id,username', bearer: IG_TOKEN }])
    expect(STORED).toEqual([{ projectId: PROJECT, platform: 'instagram', accessToken: IG_TOKEN, accountId: IG_ACCOUNT, expiresAt: expect.any(Date) }])
    expect(BINDING_WRITES).toEqual([{ op: 'attest', bindingId: activeBinding(PROJECT, 'instagram')!.bindingId, accountLabel: 'theprompt.news' }])
    expect(ORDER).toEqual(['binding:read', 'event:attempted', 'fetch', 'store', 'binding:attest', 'event:replaced'])
    expect(EVENTS[1]).toMatchObject({ outcome: 'replaced', externalAccountId: IG_ACCOUNT, bindingAction: 'matched' })
  })

  it('account_mismatch — a credential for another Instagram account is refused before anything is stored, and the binding is untouched', async () => {
    const before = JSON.stringify(BINDINGS)
    const res = await post({ ...INSTAGRAM, token: IG_OTHER_TOKEN })
    expect(res.status).toBe(409)
    expect(res.json).toMatchObject({ ok: false, replaced: false, refusal: 'account_mismatch' })
    expect(res.json.error).toMatch(/Byt konto/)
    expect(STORED).toEqual([])
    expect(BINDING_WRITES).toEqual([])
    expect(JSON.stringify(BINDINGS)).toBe(before)
    expect(EVENTS.map((e) => [e.outcome, e.detail ?? null, e.externalAccountId ?? null])).toEqual([
      ['attempted', null, null],
      ['failed', { failure_stage: 'account_mismatch' }, IG_OTHER],
    ])
  })

  it('a Facebook-login credential that cannot reach the bound Instagram account is a mismatch too — nothing attested, nothing stored', async () => {
    const res = await post({ ...INSTAGRAM, token: FB_USER_TOKEN })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('account_mismatch')
    expect(STORED).toEqual([])
    expect(EVENTS[1]).toMatchObject({ outcome: 'failed', detail: { failure_stage: 'account_mismatch' }, externalAccountId: null })
  })

  it('created — a project without an Instagram binding binds the attested account with its first credential', async () => {
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: IG_OTHER_TOKEN })
    expect(res.status).toBe(200)
    expect(res.json.account).toEqual({ id: IG_OTHER, label: 'someone.else', binding_action: 'created' })
    expect(BINDING_WRITES).toEqual([{
      op: 'create', projectId: SIBLING, platform: 'instagram', externalAccountId: IG_OTHER, accountLabel: 'someone.else', boundBy: `user:${ME}`,
    }])
    expect(ORDER).toEqual(['binding:read', 'event:attempted', 'fetch', 'binding:create', 'store', 'event:replaced'])
    expect(STORED).toEqual([{ projectId: SIBLING, platform: 'instagram', accessToken: IG_OTHER_TOKEN, accountId: IG_OTHER, expiresAt: null }])
    expect(EVENTS[1]).toMatchObject({ outcome: 'replaced', externalAccountId: IG_OTHER, bindingAction: 'created' })
  })

  it('O1 — an account already bound to another project is refused, and nothing moves: not the binding, not a credential', async () => {
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: IG_TOKEN })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('account_bound_to_other_project')
    expect(STORED).toEqual([])
    expect(activeBinding(SIBLING, 'instagram')).toBeNull()
    expect(activeBinding(PROJECT, 'instagram')?.externalAccountId).toBe(IG_ACCOUNT)
    expect(EVENTS[1]).toMatchObject({
      outcome: 'failed', detail: { failure_stage: 'account_bound_to_other_project' }, externalAccountId: IG_ACCOUNT,
    })
  })

  it('O1 holds for an account change too — a project cannot take over another project’s account', async () => {
    BINDINGS.push(fakeBinding(SIBLING, 'instagram', IG_OTHER, 'someone.else'))
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: IG_TOKEN, change_account: true })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('account_bound_to_other_project')
    expect(STORED).toEqual([])
    expect(activeBinding(SIBLING, 'instagram')?.externalAccountId).toBe(IG_OTHER)
    expect(activeBinding(PROJECT, 'instagram')?.externalAccountId).toBe(IG_ACCOUNT)
  })

  it('a first binding that loses a race is refused, never merged', async () => {
    CREATE_FAILURE = 'project_already_bound'
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: IG_OTHER_TOKEN })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('binding')
    expect(STORED).toEqual([])
  })

  it('rebound — an explicit account change supersedes the old binding, stores the new account’s credential and is audited as rebound', async () => {
    const old = activeBinding(PROJECT, 'instagram')!
    const res = await post({ ...INSTAGRAM, token: IG_OTHER_TOKEN, change_account: true })
    expect(res.status).toBe(200)
    expect(res.json.account).toEqual({ id: IG_OTHER, label: 'someone.else', binding_action: 'rebound' })
    expect(BINDING_WRITES).toEqual([{
      op: 'rebind', projectId: PROJECT, platform: 'instagram', expectedBindingId: old.bindingId,
      externalAccountId: IG_OTHER, accountLabel: 'someone.else', boundBy: `user:${ME}`,
    }])
    expect(old.supersededAt).not.toBeNull()
    expect(activeBinding(PROJECT, 'instagram')?.externalAccountId).toBe(IG_OTHER)
    expect(STORED).toEqual([{ projectId: PROJECT, platform: 'instagram', accessToken: IG_OTHER_TOKEN, accountId: IG_OTHER, expiresAt: expect.any(Date) }])
    expect(EVENTS[1]).toMatchObject({ outcome: 'replaced', externalAccountId: IG_OTHER, bindingAction: 'rebound' })
  })

  it('an account change to the account already bound is refused — replacing the credential needs no account change', async () => {
    const res = await post({ ...INSTAGRAM, change_account: true })
    expect(res.status).toBe(400)
    expect(res.json.refusal).toBe('binding')
    expect(BINDING_WRITES).toEqual([])
    expect(STORED).toEqual([])
  })

  it('an account change needs a bound account to change: none bound → 400 before any platform contact or audit event', async () => {
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: IG_OTHER_TOKEN, change_account: true })
    expect(res.status).toBe(400)
    expect(FETCHED).toEqual([])
    expect(EVENTS).toEqual([])
    expect(STORED).toEqual([])
  })

  it('a binding that changed while the request ran is refused, and nothing is stored', async () => {
    REBIND_FAILURE = 'binding_changed'
    const res = await post({ ...INSTAGRAM, token: IG_OTHER_TOKEN, change_account: true })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('binding')
    expect(STORED).toEqual([])
  })

  it('an unreadable binding is a 503 before any audit event, platform contact or store', async () => {
    BINDING_READ_FAILS = true
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(503)
    expect(res.json).toMatchObject({ ok: false, replaced: false })
    expect(EVENTS).toEqual([])
    expect(FETCHED).toEqual([])
    expect(STORED).toEqual([])
  })
})

describe('/api/media/token · Facebook — the verified page, not just a token', () => {
  it('matched — the bound page is the target, its own page token is stored, and the page Meta confirmed is returned by name', async () => {
    const res = await post(FACEBOOK)
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({
      ok: true, platform: 'facebook', exchanged: true, pageResolved: true, readInsightsOk: true,
      account: { id: PAGE, label: 'The Prompt', binding_action: 'matched' },
    })
    expect(STORED).toEqual([{ projectId: PROJECT, platform: 'facebook', accessToken: PAGE_TOKEN, accountId: PAGE, expiresAt: null }])
    expect(BINDING_WRITES).toEqual([{ op: 'attest', bindingId: activeBinding(PROJECT, 'facebook')!.bindingId, accountLabel: 'The Prompt' }])
    expect(EVENTS[1]).toMatchObject({
      outcome: 'replaced', externalAccountId: PAGE, bindingAction: 'matched',
      detail: { exchanged: true, page_resolved: true, read_insights_ok: true },
    })
  })

  it('a page token pasted directly is the page itself — confirmed by Meta without an exchange', async () => {
    const res = await post({ ...FACEBOOK, token: PAGE_TOKEN })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ exchanged: false, account: { id: PAGE, binding_action: 'matched' } })
    expect(STORED[0]).toMatchObject({ accessToken: PAGE_TOKEN, accountId: PAGE })
  })

  it('a page id that is not the bound page is refused before any contact — changing page is an explicit account change', async () => {
    const res = await post({ ...FACEBOOK, page_id: PAGE_OTHER })
    expect(res.status).toBe(400)
    expect(res.json.error).toMatch(/Byt konto/)
    expect(FETCHED).toEqual([])
    expect(EVENTS).toEqual([])
    const same = await post({ ...FACEBOOK, page_id: PAGE })
    expect(same.status).toBe(200)
  })

  it('a first Facebook binding names its page, and Meta must confirm the credential reaches it', async () => {
    const unnamed = await post({ project_id: SIBLING, platform: 'facebook', token: FB_USER_TOKEN })
    expect(unnamed.status).toBe(400)
    expect(FETCHED).toEqual([])
    expect(EVENTS).toEqual([])

    const named = await post({ project_id: SIBLING, platform: 'facebook', token: FB_OTHER_USER_TOKEN, page_id: PAGE_OTHER })
    expect(named.status).toBe(200)
    expect(named.json.account).toEqual({ id: PAGE_OTHER, label: 'Another Page', binding_action: 'created' })
    expect(STORED).toEqual([{ projectId: SIBLING, platform: 'facebook', accessToken: PAGE_OTHER_TOKEN, accountId: PAGE_OTHER, expiresAt: null }])
    expect(activeBinding(SIBLING, 'facebook')).toMatchObject({ externalAccountId: PAGE_OTHER, accountLabel: 'Another Page', verification: 'provider_attested' })
  })

  it('a credential that does not reach the bound page is an account mismatch — nothing stored, the binding untouched', async () => {
    const res = await post({ ...FACEBOOK, token: FB_OTHER_USER_TOKEN })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('account_mismatch')
    expect(STORED).toEqual([])
    expect(activeBinding(PROJECT, 'facebook')?.externalAccountId).toBe(PAGE)
  })

  it('O1 — a page already bound to another project cannot be bound again', async () => {
    const res = await post({ project_id: SIBLING, platform: 'facebook', token: FB_USER_TOKEN, page_id: PAGE })
    expect(res.status).toBe(409)
    expect(res.json.refusal).toBe('account_bound_to_other_project')
    expect(STORED).toEqual([])
    expect(activeBinding(SIBLING, 'facebook')).toBeNull()
  })

  it('changing page is a rebind to a page no other project has', async () => {
    const res = await post({ ...FACEBOOK, page_id: PAGE_OTHER, change_account: true })
    expect(res.status).toBe(200)
    expect(res.json.account).toEqual({ id: PAGE_OTHER, label: 'Another Page', binding_action: 'rebound' })
    expect(STORED[0]).toMatchObject({ projectId: PROJECT, accessToken: PAGE_OTHER_TOKEN, accountId: PAGE_OTHER })
    expect(activeBinding(PROJECT, 'facebook')?.externalAccountId).toBe(PAGE_OTHER)
  })

  it('the read_insights diagnostic reads only the named project’s own posts', async () => {
    await post(FACEBOOK)
    const scriptReads = SEEN.filter((s) => s.table === 'media_scripts')
    expect(scriptReads).toHaveLength(1)
    expect(scriptReads[0].ops).toContainEqual(['eq', 'project_id', PROJECT])
    expect(FETCHED.map((f) => f.url).join(' ')).not.toContain('foreign-video')
    expect(FETCHED.map((f) => f.url)).toContain('https://graph.facebook.com/v21.0/video-1?fields=post_id')
  })
})

describe('/api/media/token · an attestation failure is a refusal, and nothing is stored', () => {
  it('a platform that cannot be reached is a 503 — the attempt is audited as failed and nothing is stored', async () => {
    PROVIDER = () => new Error(`connect ETIMEDOUT graph.instagram.com ${IG_TOKEN}`)
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(503)
    expect(res.json.refusal).toBe('provider_verification')
    expect(STORED).toEqual([])
    expect(BINDING_WRITES).toEqual([])
    expect(EVENTS.map((e) => [e.outcome, e.detail ?? null])).toEqual([
      ['attempted', null], ['failed', { failure_stage: 'provider_verification' }],
    ])
  })

  it('a credential the platform rejects is a 400, whatever the platform says about it', async () => {
    const res = await post({ ...INSTAGRAM, token: IG_BAD_TOKEN })
    expect(res.status).toBe(400)
    expect(res.json.refusal).toBe('provider_verification')
    expect(res.text).not.toMatch(/OAuth/)
    expect(STORED).toEqual([])
  })

  it('a Facebook-login credential reaching several Instagram accounts is refused when no binding says which', async () => {
    PROVIDER = (url, bearer) => url.includes('instagram_business_account')
      ? ok({ data: [{ instagram_business_account: { id: IG_OTHER } }, { instagram_business_account: { id: IG_THIRD } }] })
      : graph(url, bearer)
    const res = await post({ project_id: SIBLING, platform: 'instagram', token: FB_USER_TOKEN })
    expect(res.status).toBe(400)
    expect(res.json.refusal).toBe('provider_verification')
    expect(BINDING_WRITES).toEqual([])
    expect(STORED).toEqual([])
  })
})

describe('/api/media/token · write-only — no secret leaves, and no environment credential is used', () => {
  it('no token, secret or platform message reaches a response, a log line or an audit event — on success and on every refusal', async () => {
    const outputs: string[] = []
    const run = async (body: unknown, arrange: () => void = () => {}) => {
      arrange()
      const { res, logged } = await postLogged(body)
      outputs.push(res.text, logged)
      STORE_FAILS = false
      EVENT_FAILS = new Set()
      PROVIDER = graph
    }
    await run(INSTAGRAM)
    await run({ ...INSTAGRAM, token: IG_OTHER_TOKEN })
    await run({ ...INSTAGRAM, token: IG_BAD_TOKEN })
    await run(FACEBOOK)
    await run({ ...FACEBOOK, token: FB_OTHER_USER_TOKEN })
    await run({ project_id: SIBLING, platform: 'instagram', token: IG_TOKEN })
    await run(INSTAGRAM, () => { PROVIDER = () => new Error(`socket hang up ${IG_TOKEN}`) })
    await run(INSTAGRAM, () => { STORE_FAILS = true })
    await run(FACEBOOK, () => { EVENT_FAILS.add('attempted') })
    await run(FACEBOOK, () => { EVENT_FAILS.add('replaced') })
    await run(INSTAGRAM, () => { STORE_FAILS = true; EVENT_FAILS.add('failed') })
    const everything = [...outputs, JSON.stringify(EVENTS), JSON.stringify(BINDINGS), JSON.stringify(BINDING_WRITES)].join('\n')
    for (const secret of SECRETS) expect(everything, 'a credential escaped').not.toContain(secret)
    for (const platformText of ['OAuthException', 'Invalid OAuth', 'socket hang up', 'ETIMEDOUT', 'access_token']) {
      expect(everything, platformText).not.toContain(platformText)
    }
  })

  it('credentials travel as Authorization headers — only Meta’s own token exchange carries the pasted Facebook credential in its request', async () => {
    await post(INSTAGRAM)
    await post(FACEBOOK)
    for (const { url } of FETCHED) {
      for (const token of [IG_TOKEN, LONG_TOKEN, PAGE_TOKEN]) expect(url).not.toContain(token)
      if (url.includes(FB_USER_TOKEN)) expect(url.startsWith('https://graph.facebook.com/v21.0/oauth/access_token?')).toBe(true)
    }
    expect(FETCHED.filter((f) => f.bearer !== null).map((f) => f.bearer)).toEqual([IG_TOKEN, LONG_TOKEN, PAGE_TOKEN, PAGE_TOKEN, PAGE_TOKEN])
  })

  it('the retired environment credentials are set and change nothing: no environment token or id is sent, stored or bound', async () => {
    await post(INSTAGRAM)
    await post(FACEBOOK)
    const unnamed = await post({ project_id: SIBLING, platform: 'facebook', token: FB_USER_TOKEN })
    expect(unnamed.status).toBe(400)
    const reached = JSON.stringify({ FETCHED, STORED, BINDINGS, BINDING_WRITES, EVENTS })
    for (const value of Object.values(ENV_SENTINELS)) expect(reached).not.toContain(value)
    expect(activeBinding(SIBLING, 'facebook')).toBeNull()
    const route = readFileSync(resolve(APP, 'app/api/media/token/route.ts'), 'utf8')
    for (const name of Object.keys(ENV_SENTINELS)) expect(route, name).not.toContain(name)
  })
})

describe('/api/media/token · credential replacement audit — attempted first, fail-closed', () => {
  it('attempted, then the platform, then the binding decision and the store, then replaced — under one server-generated operation id', async () => {
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(200)
    const [attempted, replaced] = EVENTS
    expect(attempted).toEqual({
      operationId: expect.stringMatching(UUID), projectId: PROJECT, platform: 'instagram', actor: `user:${ME}`, outcome: 'attempted',
    })
    expect(replaced).toEqual({
      operationId: attempted.operationId, projectId: PROJECT, platform: 'instagram', actor: `user:${ME}`, outcome: 'replaced',
      detail: { expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) },
      externalAccountId: IG_ACCOUNT, bindingAction: 'matched',
    })
    expect(res.json.operation_id).toBe(attempted.operationId)
  })

  it('Instagram without an expiry records replaced with an empty detail', async () => {
    const res = await post({ project_id: PROJECT, platform: 'instagram', token: IG_TOKEN })
    expect(res.status).toBe(200)
    expect(EVENTS.map((e) => [e.outcome, e.detail ?? null])).toEqual([['attempted', null], ['replaced', {}]])
  })

  it('Facebook: the attempt is recorded before the first Graph call', async () => {
    await post(FACEBOOK)
    expect(ORDER.slice(0, 3)).toEqual(['binding:read', 'event:attempted', 'fetch'])
    expect(ORDER.filter((o) => o !== 'fetch')).toEqual(['binding:read', 'event:attempted', 'store', 'binding:attest', 'event:replaced'])
  })

  it('no attempted event, no replacement: nothing is contacted, bound or stored, and the failure is truthful', async () => {
    EVENT_FAILS.add('attempted')
    const { res, logged } = await postLogged({ project_id: SIBLING, platform: 'facebook', token: FB_USER_TOKEN, page_id: PAGE_OTHER })
    expect(res.status).toBe(503)
    expect(res.json).toMatchObject({ ok: false, replaced: false, operation_id: expect.stringMatching(UUID) })
    expect(res.json.error).toMatch(/inte genomförts/)
    expect(FETCHED).toEqual([])
    expect(BINDING_WRITES).toEqual([])
    expect(STORED).toEqual([])
    expect(ORDER).toEqual(['binding:read', 'event:attempted'])
    expect(logged).toContain(res.json.operation_id)
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it('a failed store is recorded as failed, with its stage and the attested account, under the same operation', async () => {
    STORE_FAILS = true
    const res = await post(INSTAGRAM)
    expect(res.status).toBe(500)
    expect(res.json).toMatchObject({ ok: false, replaced: false, refusal: 'store' })
    expect(EVENTS.map((e) => e.outcome)).toEqual(['attempted', 'failed'])
    expect(EVENTS[1]).toMatchObject({ detail: { failure_stage: 'store' }, externalAccountId: IG_ACCOUNT, operationId: EVENTS[0].operationId })
    expect(res.json.operation_id).toBe(EVENTS[0].operationId)
  })

  it('a failed store after an account change fails closed: the binding names the new account, and the old credential no longer matches it', async () => {
    STORE_FAILS = true
    const res = await post({ ...INSTAGRAM, token: IG_OTHER_TOKEN, change_account: true })
    expect(res.status).toBe(500)
    expect(res.json.error).toMatch(/matchar inte längre/)
    expect(activeBinding(PROJECT, 'instagram')?.externalAccountId).toBe(IG_OTHER)
    expect(EVENTS[1]).toMatchObject({ outcome: 'failed', detail: { failure_stage: 'store' }, externalAccountId: IG_OTHER })
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
    expect(logged).toContain(PROJECT)
    expect(logged).toContain('42501')
    for (const secret of SECRETS) {
      expect(logged).not.toContain(secret)
      expect(res.text).not.toContain(secret)
    }
  })

  it('a refusal whose failed event also cannot be written stays truthful: replaced false, the audit gap flagged', async () => {
    STORE_FAILS = true
    EVENT_FAILS.add('failed')
    const { res, logged } = await postLogged(INSTAGRAM)
    expect(res.status).toBe(500)
    expect(res.json).toMatchObject({ ok: false, replaced: false, audit_incident: 'terminal_event_not_recorded' })
    expect(logged).toMatch(/not replaced/)
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it('the operation id is the server’s: a client-supplied one is ignored, and every attempt gets its own', async () => {
    const forged = '00000000-0000-4000-8000-000000000000'
    await post({ ...INSTAGRAM, operation_id: forged, operationId: forged })
    await post(INSTAGRAM)
    const ids = EVENTS.map((e) => e.operationId)
    expect(ids).not.toContain(forged)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).toBe(ids[3])
    expect(ids[0]).not.toBe(ids[2])
  })

  it('every audit event is built from the named fields and allowlisted detail keys only', async () => {
    await post(FACEBOOK)
    await post(INSTAGRAM)
    await post({ ...INSTAGRAM, token: IG_OTHER_TOKEN })
    for (const e of EVENTS) {
      for (const key of Object.keys(e)) {
        expect(['actor', 'bindingAction', 'detail', 'externalAccountId', 'operationId', 'outcome', 'platform', 'projectId']).toContain(key)
      }
      for (const key of Object.keys(e.detail ?? {})) {
        expect(['exchanged', 'page_resolved', 'read_insights_ok', 'expires_at', 'failure_stage']).toContain(key)
      }
      if (e.outcome === 'attempted') expect(e.externalAccountId ?? null).toBeNull()
    }
  })
})

describe('/api/media/token · the one place a project’s account is chosen and its credential stored', () => {
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
  const source = (f: string) => readFileSync(f, 'utf8')
  const callers = (name: string, definedIn: string) => FILES()
    .filter((f) => rel(f) !== definedIn && new RegExp(`\\b${name}\\s*\\(`).test(source(f)))
    .map(rel)
    .sort()

  it('platform_tokens is written, and its credential read, only by the token store; storing is this route and the refresh cron', () => {
    const files = FILES()
    expect(files.filter((f) => /from\(\s*'platform_tokens'\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(source(f))).map(rel))
      .toEqual(['lib/media/token-store.ts'])
    expect(files.filter((f) => /from\(\s*'platform_tokens'\s*\)[\s\S]{0,200}?\.select\(\s*'[^']*access_token/.test(source(f))).map(rel))
      .toEqual(['lib/media/token-store.ts'])
    expect(callers('storeCredential', 'lib/media/token-store.ts'))
      .toEqual(['app/api/media/cron/refresh-tokens/route.ts', 'app/api/media/token/route.ts'])
    expect(callers('readStoredCredential', 'lib/media/token-store.ts'))
      .toEqual(['app/api/media/cron/refresh-tokens/route.ts', 'lib/media/social-credentials.ts'])
  })

  it('platform_credential_events is written only by its writer, and the writer is called only by this route', () => {
    const files = FILES()
    expect(files.filter((f) => /from\(\s*'platform_credential_events'\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(source(f))).map(rel))
      .toEqual(['lib/media/credential-events.ts'])
    expect(callers('recordCredentialEvent', 'lib/media/credential-events.ts')).toEqual(['app/api/media/token/route.ts'])
  })

  it('social_account_bindings is written only by its module; bindings are created or changed only here; only the YouTube upload confirmation blocks one', () => {
    const files = FILES()
    expect(files.filter((f) => /from\(\s*'social_account_bindings'\s*\)[\s\S]{0,300}?\.(insert|upsert|update|delete)\(/.test(source(f))).map(rel))
      .toEqual(['lib/media/social-bindings.ts'])
    expect(files.filter((f) => /rpc\(\s*'social_account_rebind'/.test(source(f))).map(rel)).toEqual(['lib/media/social-bindings.ts'])
    expect(callers('createBinding', 'lib/media/social-bindings.ts')).toEqual(['app/api/media/token/route.ts'])
    expect(callers('rebindAccount', 'lib/media/social-bindings.ts')).toEqual(['app/api/media/token/route.ts'])
    expect(callers('recordProviderAttestation', 'lib/media/social-bindings.ts'))
      .toEqual(['app/api/media/token/route.ts', 'lib/media/credential-health.ts'])
    expect(callers('blockBinding', 'lib/media/social-bindings.ts')).toEqual(['lib/media/social-credentials.ts'])
  })
})
