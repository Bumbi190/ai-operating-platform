/**
 * The two scheduled credential jobs, project-scoped (2026-09-14).
 *
 *   cron/refresh-tokens — renews each project's stored Instagram credential over the
 *     projects' active Instagram bindings, and stores the renewed credential only while
 *     Instagram still says it is THAT project's bound account. Otherwise the stored one
 *     is kept and an alert names the project and the closed reason.
 *   cron/token-health — verifies every active binding with its own project's
 *     credential, records each verdict for that binding, and warns naming the project.
 *     token_health (keyed by platform alone) is no longer written.
 *
 * Neither job has a default project, an environment token or a platform-wide row, and
 * nothing either returns, logs or alerts carries a credential.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CRON = 'test-cron-secret'
const PROMPT = '33333333-3333-4333-8333-333333333333'
const FAMILY = '44444444-4444-4444-8444-444444444444'
const IG_PROMPT = '17841437027967629'
const IG_FAMILY = '17841400000000002'
const PAGE_PROMPT = '1138612202672850'
/** Instagram login. */
const PROMPT_TOKEN = `IGAA${'p'.repeat(60)}`
/** Facebook login. */
const FAMILY_TOKEN = `EAAB${'f'.repeat(60)}`
const PROMPT_RENEWED = `IGAA${'r'.repeat(60)}`
const FAMILY_RENEWED = `EAAL${'r'.repeat(60)}`
const APP_SECRET = 'meta-app-secret-value'
const SECRETS = [PROMPT_TOKEN, FAMILY_TOKEN, PROMPT_RENEWED, FAMILY_RENEWED, APP_SECRET]
const DAY = 86_400_000

interface Binding {
  bindingId: string; projectId: string; platform: 'instagram' | 'facebook' | 'youtube'; externalAccountId: string
  accountLabel: string | null; credentialSource: string; verification: string; verifiedAt: string; boundBy: string
  boundAt: string; blockedAt: string | null; blockedReason: string | null
}
type Answer = { status: number; body: unknown } | Error

let LIST: { ok: true; bindings: Binding[] } | { ok: false } = { ok: false }
let LIST_CALLS: unknown[] = []
let STORED: Record<string, { accessToken: string; accountId: string | null; expiresAt: Date | null; refreshedAt: Date | null } | null | 'unreadable'> = {}
let STORE_READS: string[] = []
let STORES: Record<string, unknown>[] = []
let STORE_FAILS = false
let IDENTITY: Record<string, unknown> = {}
let ATTESTED: string[] = []
let ALERTS: Record<string, unknown>[] = []
let FETCHED: string[] = []
let PROVIDER: (url: URL) => Answer = renew
let UPDATES: { table: string; row: Record<string, unknown>; filters: unknown[] }[] = []
let TABLES: string[] = []
let PROJECT_ROWS: { id: string; name: string }[] = []
let PREVIOUS: { project_id: string; platform: string; last_warned_threshold: number | null }[] = []
let VERDICTS: Record<string, unknown> = {}
let VERIFIED: string[] = []
let WRITES: Record<string, unknown>[] = []
let WARNINGS: Record<string, unknown>[] = []

vi.mock('@/lib/media/social-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/social-bindings')>()),
  listActiveBindings: async (projectIds?: readonly string[]) => {
    LIST_CALLS.push(projectIds ?? null)
    return LIST
  },
}))

vi.mock('@/lib/media/token-store', () => ({
  readStoredCredential: async (projectId: string, platform: string) => {
    STORE_READS.push(`${platform}:${projectId}`)
    const stored = STORED[`${platform}:${projectId}`]
    if (stored === 'unreadable') return { ok: false }
    return { ok: true, credential: stored ?? null }
  },
  storeCredential: async (projectId: string, platform: string, input: Record<string, unknown>) => {
    STORES.push({ projectId, platform, ...input })
    return STORE_FAILS ? { ok: false } : { ok: true }
  },
}))

vi.mock('@/lib/media/social-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/social-identity')>()),
  attestInstagramCredential: async (token: string, expected: string | null) => {
    ATTESTED.push(`${token}:${expected}`)
    return IDENTITY[token] ?? { ok: false, failure: 'credential_invalid' }
  },
}))

vi.mock('@/lib/media/alert', () => ({
  sendPipelineAlert: async (alert: Record<string, unknown>) => { ALERTS.push(JSON.parse(JSON.stringify(alert))) },
  sendTokenExpiryWarning: async (projectName: string, platform: string, days: number, note: string) => {
    WARNINGS.push({ projectName, platform, days, note })
  },
}))

vi.mock('@/lib/media/credential-health', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/credential-health')>()),
  verifyBindingHealth: async (binding: Binding) => {
    VERIFIED.push(`${binding.platform}:${binding.projectId}`)
    return VERDICTS[`${binding.platform}:${binding.projectId}`]
  },
  writeCredentialHealth: async (binding: Binding, verdict: { status: string }, _checkedAt: string, lastWarnedThreshold?: number | null) => {
    WRITES.push({ projectId: binding.projectId, platform: binding.platform, bindingId: binding.bindingId, status: verdict.status, lastWarnedThreshold })
    return true
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      TABLES.push(table)
      const filters: unknown[] = []
      let update: Record<string, unknown> | null = null
      const q: any = {
        select: () => q,
        in: (c: string, v: unknown) => { filters.push(['in', c, v]); return q },
        eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return q },
        update: (row: Record<string, unknown>) => { update = row; return q },
        then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => {
          if (update) UPDATES.push({ table, row: update, filters })
          const rows = table === 'projects' ? PROJECT_ROWS : table === 'social_credential_health' ? PREVIOUS : []
          return Promise.resolve({ data: update ? null : rows, error: null }).then(ok, err)
        },
      }
      return q
    },
  }),
}))

function renew(url: URL): Answer {
  const endpoint = `${url.origin}${url.pathname}`
  if (endpoint === 'https://graph.instagram.com/refresh_access_token') {
    return url.searchParams.get('access_token') === PROMPT_TOKEN
      ? { status: 200, body: { access_token: PROMPT_RENEWED, token_type: 'bearer', expires_in: 5_184_000 } }
      : { status: 400, body: { error: { message: `Invalid token ${url.searchParams.get('access_token')}` } } }
  }
  if (endpoint === 'https://graph.facebook.com/oauth/access_token') {
    return url.searchParams.get('fb_exchange_token') === FAMILY_TOKEN
      ? { status: 200, body: { access_token: FAMILY_RENEWED, token_type: 'bearer', expires_in: 5_184_000 } }
      : { status: 400, body: { error: { message: 'Invalid exchange' } } }
  }
  return { status: 404, body: {} }
}

let seq = 0
function binding(projectId: string, platform: Binding['platform'], externalAccountId: string): Binding {
  seq += 1
  return {
    bindingId: `77777777-7777-4777-8777-${String(seq).padStart(12, '0')}`, projectId, platform, externalAccountId, accountLabel: null,
    credentialSource: platform === 'youtube' ? 'platform_env_transitional' : 'project_store', verification: 'provider_attested',
    verifiedAt: '2026-09-14T07:00:07.000Z', boundBy: 'migration:social_account_bindings_the_prompt_evidence',
    boundAt: '2026-09-14T12:00:00.000Z', blockedAt: null, blockedReason: null,
  }
}
const identity = (accountId: string, isIgLogin: boolean) => ({
  ok: true, accountId, username: null, isIgLogin,
  apiBase: isIgLogin ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0',
})
const verdict = (status: string, daysLeft: number | null = null) => ({
  status, identityVerified: status === 'ok' || status === 'warning', verifiedAccountId: null, accountLabel: null,
  expiresAt: daysLeft === null ? null : new Date(Date.now() + daysLeft * DAY), daysLeft, refusal: null,
})

const savedEnv = { cron: process.env.CRON_SECRET, appId: process.env.META_APP_ID, appSecret: process.env.META_APP_SECRET }
let logged: string[] = []

beforeEach(() => {
  vi.resetModules()
  seq = 0
  LIST = { ok: true, bindings: [
    binding(PROMPT, 'facebook', PAGE_PROMPT),
    binding(PROMPT, 'instagram', IG_PROMPT),
    binding(PROMPT, 'youtube', 'UCUM9JDi75ziLssYcGLo8IPA'),
    binding(FAMILY, 'instagram', IG_FAMILY),
  ] }
  LIST_CALLS = []
  STORED = {
    [`instagram:${PROMPT}`]: { accessToken: PROMPT_TOKEN, accountId: null, expiresAt: null, refreshedAt: null },
    [`instagram:${FAMILY}`]: { accessToken: FAMILY_TOKEN, accountId: IG_FAMILY, expiresAt: null, refreshedAt: null },
  }
  STORE_READS = []
  STORES = []
  STORE_FAILS = false
  IDENTITY = { [PROMPT_RENEWED]: identity(IG_PROMPT, true), [FAMILY_RENEWED]: identity(IG_FAMILY, false) }
  ATTESTED = []
  ALERTS = []
  FETCHED = []
  PROVIDER = renew
  UPDATES = []
  TABLES = []
  PROJECT_ROWS = [{ id: PROMPT, name: 'The Prompt' }, { id: FAMILY, name: 'Familje-Stunden' }]
  PREVIOUS = []
  VERDICTS = {
    [`facebook:${PROMPT}`]: verdict('ok'),
    [`instagram:${PROMPT}`]: verdict('ok', 60),
    [`youtube:${PROMPT}`]: verdict('ok'),
    [`instagram:${FAMILY}`]: verdict('ok', 58),
  }
  VERIFIED = []
  WRITES = []
  WARNINGS = []
  process.env.CRON_SECRET = CRON
  process.env.META_APP_ID = 'meta-app-id'
  process.env.META_APP_SECRET = APP_SECRET
  logged = []
  for (const method of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')) })
  }
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = new URL(String(input))
    // Parameter names only — the values are credentials.
    FETCHED.push(`${url.origin}${url.pathname}?${[...url.searchParams.keys()].join(',')}`)
    const answer = PROVIDER(url)
    if (answer instanceof Error) throw answer
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const [key, value] of [['CRON_SECRET', savedEnv.cron], ['META_APP_ID', savedEnv.appId], ['META_APP_SECRET', savedEnv.appSecret]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function cron(route: 'refresh-tokens' | 'token-health', authorized = true) {
  const { GET } = route === 'refresh-tokens'
    ? await import('@/app/api/media/cron/refresh-tokens/route')
    : await import('@/app/api/media/cron/token-health/route')
  const res = await GET(new Request(`https://omnira.test/api/media/cron/${route}`, {
    headers: authorized ? { authorization: `Bearer ${CRON}` } : {},
  }))
  const text = await res.text()
  return { status: res.status, text, json: text ? JSON.parse(text) : null }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('cron/refresh-tokens · each project renews its own credential, for its own account', () => {
  it('without the cron secret nothing is listed, read or renewed', async () => {
    const res = await cron('refresh-tokens', false)
    expect(res.status).toBe(401)
    expect({ LIST_CALLS, STORE_READS, FETCHED, STORES }).toEqual({ LIST_CALLS: [], STORE_READS: [], FETCHED: [], STORES: [] })
  })

  it('unreadable bindings renew nothing — there is no fallback project to renew instead', async () => {
    LIST = { ok: false }
    const res = await cron('refresh-tokens')
    expect(res.status).toBe(500)
    expect(res.json).toMatchObject({ ok: false, error: 'bindings_unreadable' })
    expect({ STORE_READS, FETCHED, STORES }).toEqual({ STORE_READS: [], FETCHED: [], STORES: [] })
  })

  it('every project’s Instagram credential is renewed with its own flow and stored for that project once Instagram confirms its account', async () => {
    const res = await cron('refresh-tokens')
    expect(res.status).toBe(200)
    expect(LIST_CALLS).toEqual([null])
    expect(res.json.results.map((r: Record<string, unknown>) => [r.project_id, r.platform, r.status])).toEqual([
      [PROMPT, 'facebook', 'no_refresh_needed'],
      [PROMPT, 'instagram', 'refreshed'],
      [FAMILY, 'instagram', 'refreshed'],
    ])
    expect(STORE_READS).toEqual([`instagram:${PROMPT}`, `instagram:${FAMILY}`])
    expect(FETCHED).toEqual([
      'https://graph.instagram.com/refresh_access_token?grant_type,access_token',
      'https://graph.facebook.com/oauth/access_token?grant_type,client_id,client_secret,fb_exchange_token',
    ])
    expect(ATTESTED).toEqual([`${PROMPT_RENEWED}:${IG_PROMPT}`, `${FAMILY_RENEWED}:${IG_FAMILY}`])
    expect(STORES).toEqual([
      { projectId: PROMPT, platform: 'instagram', accessToken: PROMPT_RENEWED, accountId: IG_PROMPT, expiresAt: expect.any(Date) },
      { projectId: FAMILY, platform: 'instagram', accessToken: FAMILY_RENEWED, accountId: IG_FAMILY, expiresAt: expect.any(Date) },
    ])
    expect(UPDATES.map((u) => [u.table, Object.keys(u.row), u.filters])).toEqual([
      ['social_credential_health', ['last_refreshed_at'], [['eq', 'project_id', PROMPT], ['eq', 'platform', 'instagram']]],
      ['social_credential_health', ['last_refreshed_at'], [['eq', 'project_id', FAMILY], ['eq', 'platform', 'instagram']]],
    ])
    expect(TABLES).not.toContain('token_health')
  })

  it('a renewed credential that answers as another account is never stored — the project keeps its own, and an alert names the project', async () => {
    IDENTITY[FAMILY_RENEWED] = identity(IG_PROMPT, false)
    const res = await cron('refresh-tokens')
    expect(res.status).toBe(500)
    expect(res.json.ok).toBe(false)
    expect(STORES.map((s) => s.projectId)).toEqual([PROMPT])
    expect(ALERTS).toEqual([expect.objectContaining({
      cronRoute: 'cron/refresh-tokens', error: 'refreshed_credential_account_mismatch',
      context: expect.objectContaining({ projectId: FAMILY, accountId: IG_FAMILY }),
    })])
    expect(UPDATES.map((u) => (u.filters as unknown[][])[0][2])).toEqual([PROMPT])
  })

  it('one project’s failure never stops or borrows from another: a refused renewal, an unreachable platform, a failed store', async () => {
    PROVIDER = (url) => url.pathname === '/refresh_access_token' ? { status: 400, body: { error: { message: 'expired' } } } : renew(url)
    let res = await cron('refresh-tokens')
    expect(res.json.results.find((r: Record<string, unknown>) => r.project_id === PROMPT && r.platform === 'instagram'))
      .toMatchObject({ status: 'failed', reason: 'instagram_refresh_http_400' })
    expect(STORES.map((s) => s.projectId)).toEqual([FAMILY])

    STORES = []
    ALERTS = []
    PROVIDER = renew
    IDENTITY[PROMPT_RENEWED] = { ok: false, failure: 'provider_unavailable' }
    res = await cron('refresh-tokens')
    expect(res.json.results.find((r: Record<string, unknown>) => r.project_id === PROMPT && r.platform === 'instagram'))
      .toMatchObject({ status: 'failed', reason: 'refreshed_credential_provider_unavailable' })
    expect(STORES.map((s) => s.projectId)).toEqual([FAMILY])

    STORES = []
    UPDATES = []
    IDENTITY[PROMPT_RENEWED] = identity(IG_PROMPT, true)
    STORE_FAILS = true
    res = await cron('refresh-tokens')
    expect(res.json.results.filter((r: Record<string, unknown>) => r.status === 'failed').map((r: Record<string, unknown>) => r.reason))
      .toEqual(['store_failed', 'store_failed'])
    expect(UPDATES).toEqual([])
  })

  it('no stored credential is skipped without a request; an unreadable one is an alert — neither reaches for another project', async () => {
    STORED[`instagram:${FAMILY}`] = null
    STORED[`instagram:${PROMPT}`] = 'unreadable'
    const res = await cron('refresh-tokens')
    expect(res.json.results.filter((r: Record<string, unknown>) => r.platform === 'instagram')).toEqual([
      { project_id: PROMPT, platform: 'instagram', status: 'failed', reason: 'credential_unreadable' },
      { project_id: FAMILY, platform: 'instagram', status: 'skipped', reason: 'credential_missing' },
    ])
    expect({ FETCHED, STORES, ATTESTED }).toEqual({ FETCHED: [], STORES: [], ATTESTED: [] })
  })

  it('no credential reaches the response, a log line or an alert', async () => {
    const outputs: string[] = []
    outputs.push((await cron('refresh-tokens')).text)
    IDENTITY[FAMILY_RENEWED] = identity(IG_PROMPT, false)
    PROVIDER = (url) => url.pathname === '/refresh_access_token' ? new Error(`socket hang up ${PROMPT_TOKEN}`) : renew(url)
    outputs.push((await cron('refresh-tokens')).text)
    const everything = [...outputs, ...logged, JSON.stringify(ALERTS)].join('\n')
    for (const secret of SECRETS) expect(everything).not.toContain(secret)
    expect(everything).not.toMatch(/socket hang up/)
  })
})

describe('cron/token-health · every binding verified with its own project’s credential', () => {
  it('without the cron secret nothing is verified', async () => {
    expect((await cron('token-health', false)).status).toBe(401)
    expect({ LIST_CALLS, VERIFIED, WRITES }).toEqual({ LIST_CALLS: [], VERIFIED: [], WRITES: [] })
  })

  it('unreadable bindings verify nothing and record nothing', async () => {
    LIST = { ok: false }
    const res = await cron('token-health')
    expect(res.status).toBe(500)
    expect({ VERIFIED, WRITES, WARNINGS }).toEqual({ VERIFIED: [], WRITES: [], WARNINGS: [] })
  })

  it('each active binding is verified and recorded as itself — per project and platform, never a platform-wide row', async () => {
    const res = await cron('token-health')
    expect(res.status).toBe(200)
    const bindings = (LIST as { bindings: Binding[] }).bindings
    expect(VERIFIED).toEqual(bindings.map((b) => `${b.platform}:${b.projectId}`))
    expect(WRITES.map((w) => [w.bindingId, w.projectId, w.platform, w.status])).toEqual(bindings.map((b) => [b.bindingId, b.projectId, b.platform, 'ok']))
    expect(res.json.results.map((r: Record<string, unknown>) => [r.project_id, r.platform, r.status, r.recorded]))
      .toEqual(bindings.map((b) => [b.projectId, b.platform, 'ok', true]))
    expect(TABLES).not.toContain('token_health')
    expect(WARNINGS).toEqual([])
  })

  it('a credential a person must act on warns naming ITS project — and only that project', async () => {
    VERDICTS[`instagram:${FAMILY}`] = verdict('expired')
    VERDICTS[`facebook:${PROMPT}`] = verdict('ok')
    await cron('token-health')
    expect(WARNINGS).toEqual([{ projectName: 'Familje-Stunden', platform: 'instagram', days: 0, note: 'ogiltigt eller utgånget' }])
    expect(WRITES.find((w) => w.projectId === FAMILY)).toMatchObject({ status: 'expired', lastWarnedThreshold: 0 })

    WARNINGS = []
    VERDICTS[`instagram:${FAMILY}`] = verdict('ok', 58)
    VERDICTS[`instagram:${PROMPT}`] = verdict('account_mismatch')
    await cron('token-health')
    expect(WARNINGS).toEqual([{ projectName: 'The Prompt', platform: 'instagram', days: 0, note: 'tillhör inte projektets verifierade konto' }])
  })

  it('expiry warnings step down through 14/7/3/0 per project, repeat daily at three days or fewer, and a failed check changes nothing', async () => {
    LIST = { ok: true, bindings: [binding(PROMPT, 'instagram', IG_PROMPT)] }
    const step = async (previous: number | null, next: ReturnType<typeof verdict>) => {
      PREVIOUS = [{ project_id: PROMPT, platform: 'instagram', last_warned_threshold: previous }]
      VERDICTS[`instagram:${PROMPT}`] = next
      WARNINGS = []
      WRITES = []
      await cron('token-health')
      return { warned: WARNINGS.length, written: WRITES[0].lastWarnedThreshold }
    }
    expect(await step(null, verdict('warning', 6))).toEqual({ warned: 1, written: 7 })
    expect(await step(7, verdict('warning', 6))).toEqual({ warned: 0, written: 7 })
    expect(await step(7, verdict('warning', 2))).toEqual({ warned: 1, written: 3 })
    expect(await step(3, verdict('warning', 2))).toEqual({ warned: 1, written: 3 })
    expect(await step(7, verdict('verification_failed'))).toEqual({ warned: 0, written: 7 })
    expect(await step(7, verdict('ok', 40))).toEqual({ warned: 0, written: null })
  })

  it('project names and previous warnings are read for the bound projects only', async () => {
    await cron('token-health')
    expect(TABLES.filter((t) => t === 'projects' || t === 'social_credential_health')).toEqual(['projects', 'social_credential_health'])
  })
})
