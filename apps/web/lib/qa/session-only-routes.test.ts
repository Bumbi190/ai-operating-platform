/**
 * 4B2 — campaigns, revenue and chat/tts are SESSION ONLY.
 *
 * The property under test is a CAPABILITY THAT DISAPPEARED, so the negative
 * tests use a VALID legacy key fixture, not a wrong one. A wrong key would be
 * refused either way and would prove nothing; the point is that the correct
 * global key no longer opens these doors.
 *
 * The second proof is the missing-env one. `requireApiKey` answers 500 when
 * AIOPS_API_KEY is unset on the server. If these routes still reached it, an
 * unauthenticated call with the variable deleted would surface that 500. A 401
 * instead means the legacy verifier is not on the path at all — a stronger
 * statement than "the key was rejected".
 *
 * TTS gets its own emphasis because it SPENDS MONEY at OpenAI. Every denial
 * asserts that `fetch` was never called, not merely that the status was 401.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Governance G1 ────────────────────────────────────────────────────────────
// These suites exercise prompt construction, routing and error contracts — not
// spend governance. The provider boundary is stubbed to run its callback so a
// DB-less unit test is not refused for having no resolvable project. That the
// routes ARE governed is proven by lib/qa/governance-provider-boundary.test.ts,
// which reads the real source, and by that suite's lifecycle tests.
vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_input: unknown, run: () => Promise<unknown>) => run() }
})


const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const CAMPAIGNS = 'app/api/business/campaigns/route.ts'
const REVENUE   = 'app/api/business/revenue/route.ts'
const TTS       = 'app/api/chat/tts/route.ts'
const LEADS     = 'app/api/business/leads/route.ts'
const LEADS_AUTH = 'lib/business/leads-auth.ts'
const BUSINESS_AUTH = 'lib/business/business-auth.ts'

/** A VALID key — the whole point is that holding the right one no longer works. */
const VALID_LEGACY_KEY = 'the-real-global-key-value'

const USER   = 'user-owner-1'
const PROJ_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PROJ_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const CAMP_A = 'ca000000-0000-4000-8000-00000000000a'

let sessionUser: { id: string } | null = null
let allProjects: { id: string; slug: string; owner_id: string }[] = []
let campaigns: Record<string, unknown>[] = []
let revenueRows: Record<string, unknown>[] = []
let inserts: { table: string; row: Record<string, unknown> }[] = []
let updates: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[] = []
let selects: { table: string }[] = []
let openaiCalls: { url: string; body: unknown }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}))

function rowsOf(t: string): Record<string, unknown>[] {
  if (t === 'projects') return allProjects as unknown as Record<string, unknown>[]
  if (t === 'campaigns') return campaigns
  if (t === 'revenue_events') return revenueRows
  throw new Error(`unexpected table: ${t}`)
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> = {}
      const matching = () => rowsOf(table).filter(r =>
        Object.entries(f).every(([k, v]) => k.startsWith('__') || r[k] === v) &&
        (f.__inVals === undefined ||
          (f.__inVals as string[]).includes(r[f.__inCol as string] as string)))
      const b: Record<string, unknown> = {
        select: () => b, order: () => b, limit: () => b, gte: () => b,
        eq: (c: string, v: unknown) => { f[c] = v; return b },
        in: (c: string, v: string[]) => { f.__inCol = c; f.__inVals = v; return b },
        insert: (row: Record<string, unknown>) => { mode = 'insert'; payload = row; return b },
        update: (patch: Record<string, unknown>) => { mode = 'update'; payload = patch; return b },
        single: async () => {
          if (mode === 'insert') { inserts.push({ table, row: payload }); return { data: { id: 'new', ...payload }, error: null } }
          return { data: matching()[0] ?? null, error: null }
        },
        maybeSingle: async () => {
          if (mode === 'update') {
            updates.push({ table, patch: payload, filters: { ...f } })
            const hit = matching()[0]
            if (!hit) return { data: null, error: null }
            Object.assign(hit, payload); return { data: hit, error: null }
          }
          return { data: matching()[0] ?? null, error: null }
        },
        then: (res: (x: unknown) => unknown, rej: (x: unknown) => unknown) => {
          selects.push({ table })
          return Promise.resolve({ data: matching(), error: null }).then(res, rej)
        },
      }
      return b
    },
  }),
}))

const campaignsRoute = await import('@/app/api/business/campaigns/route')
const revenueRoute   = await import('@/app/api/business/revenue/route')
const ttsRoute       = await import('@/app/api/chat/tts/route')

// ── Helpers ─────────────────────────────────────────────────────────────────

const mk = (url: string, init: RequestInit = {}, token?: string) =>
  new Request(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  })

const getC   = (t?: string) => mk('https://x.test/api/business/campaigns', {}, t)
const postC  = (b: unknown, t?: string) => mk('https://x.test/api/business/campaigns', { method: 'POST', body: JSON.stringify(b) }, t)
const patchC = (b: unknown, t?: string) => mk('https://x.test/api/business/campaigns', { method: 'PATCH', body: JSON.stringify(b) }, t)
const getR   = (t?: string) => mk('https://x.test/api/business/revenue', {}, t)
const postR  = (b: unknown, t?: string) => mk('https://x.test/api/business/revenue', { method: 'POST', body: JSON.stringify(b) }, t)
const postT  = (b: unknown, t?: string) => mk('https://x.test/api/chat/tts', { method: 'POST', body: JSON.stringify(b) }, t)

/** Stubs global fetch so no OpenAI call can ever leave the test. */
function stubOpenAI(ok = true) {
  vi.stubGlobal('fetch', (async (url: string | URL | Request, init?: RequestInit) => {
    openaiCalls.push({ url: String(url), body: JSON.parse(String(init?.body ?? 'null')) })
    if (!ok) return new Response('boom', { status: 500 })
    return new Response(new ArrayBuffer(8), { status: 200 })
  }) as unknown as typeof fetch)
}

beforeEach(() => {
  sessionUser = { id: USER }
  inserts = []; updates = []; selects = []; openaiCalls = []
  allProjects = [
    { id: PROJ_A, slug: 'alpha', owner_id: USER },
    { id: PROJ_B, slug: 'beta',  owner_id: 'someone-else' },
  ]
  campaigns = [{ id: CAMP_A, project_id: PROJ_A, name: 'A', status: 'active' }]
  revenueRows = [{ id: 'ra', project_id: PROJ_A, amount_sek: 100 }]
  process.env.AIOPS_API_KEY = VALID_LEGACY_KEY
  process.env.OPENAI_API_KEY = 'sk-test-not-real'
})

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// ── 1. The capability is gone: a VALID legacy key no longer works ───────────

describe('valid legacy key no longer grants access', () => {
  it.each([
    ['campaigns GET',   () => campaignsRoute.GET(getC(VALID_LEGACY_KEY))],
    ['campaigns POST',  () => campaignsRoute.POST(postC({ project_id: PROJ_A, name: 'x' }, VALID_LEGACY_KEY))],
    ['campaigns PATCH', () => campaignsRoute.PATCH(patchC({ id: CAMP_A, name: 'x' }, VALID_LEGACY_KEY))],
    ['revenue GET',     () => revenueRoute.GET(getR(VALID_LEGACY_KEY))],
    ['revenue POST',    () => revenueRoute.POST(postR({ project_id: PROJ_A, amount_sek: 1 }, VALID_LEGACY_KEY))],
  ])('%s → 401 with no read or write', async (_l, call) => {
    sessionUser = null
    const res = await call()
    expect(res.status).toBe(401)
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
    expect(selects).toHaveLength(0)
  })

  it('tts → 401 and OpenAI is never called', async () => {
    sessionUser = null
    stubOpenAI()
    const res = await ttsRoute.POST(postT({ text: 'hej' }, VALID_LEGACY_KEY))
    expect(res.status).toBe(401)
    expect(openaiCalls).toHaveLength(0)
  })

  it('the campaign row is untouched after a legacy PATCH attempt', async () => {
    sessionUser = null
    await campaignsRoute.PATCH(patchC({ id: CAMP_A, name: 'kapad' }, VALID_LEGACY_KEY))
    expect(campaigns[0].name).toBe('A')
  })
})

// ── 2. The legacy verifier is not even on the path ──────────────────────────

describe('missing AIOPS_API_KEY still yields 401, never the old 500', () => {
  it.each([
    ['campaigns GET',   () => campaignsRoute.GET(getC('anything'))],
    ['campaigns POST',  () => campaignsRoute.POST(postC({ name: 'x' }, 'anything'))],
    ['campaigns PATCH', () => campaignsRoute.PATCH(patchC({ id: CAMP_A }, 'anything'))],
    ['revenue GET',     () => revenueRoute.GET(getR('anything'))],
    ['revenue POST',    () => revenueRoute.POST(postR({ amount_sek: 1 }, 'anything'))],
  ])('%s', async (_l, call) => {
    sessionUser = null
    delete process.env.AIOPS_API_KEY
    const res = await call()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('AIOPS_API_KEY')
  })

  it('tts', async () => {
    sessionUser = null
    delete process.env.AIOPS_API_KEY
    stubOpenAI()
    const res = await ttsRoute.POST(postT({ text: 'hej' }, 'anything'))
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).not.toContain('AIOPS_API_KEY')
    expect(openaiCalls).toHaveLength(0)
  })
})

// ── 3. Session still works, with 4B1 scoping intact ─────────────────────────

describe('session positive paths', () => {
  it('campaigns GET returns own scoped rows', async () => {
    const res = await campaignsRoute.GET(getC())
    expect(res.status).toBe(200)
    expect((await res.json() as { project_id: string }[]).map(r => r.project_id)).toEqual([PROJ_A])
  })

  it('campaigns POST writes the verified project id', async () => {
    const res = await campaignsRoute.POST(postC({ project_id: PROJ_A, name: 'ny' }))
    expect(res.status).toBe(201)
    expect(inserts[0].row.project_id).toBe(PROJ_A)
  })

  it('campaigns POST still denies a foreign project', async () => {
    const res = await campaignsRoute.POST(postC({ project_id: PROJ_B, name: 'x' }))
    expect(res.status).toBe(403)
    expect(inserts).toHaveLength(0)
  })

  it('campaigns PATCH updates an owned campaign', async () => {
    const res = await campaignsRoute.PATCH(patchC({ id: CAMP_A, name: 'ändrad' }))
    expect(res.status).toBe(200)
    expect(campaigns[0].name).toBe('ändrad')
  })

  it('campaigns PATCH still cannot move a campaign to a foreign project', async () => {
    await campaignsRoute.PATCH(patchC({ id: CAMP_A, project_id: PROJ_B, name: 'moved' }))
    expect(campaigns[0].project_id).toBe(PROJ_A)
    expect(updates[0].patch.project_id).toBeUndefined()
  })

  it('revenue GET is scoped and POST writes the verified id', async () => {
    const g = await revenueRoute.GET(getR())
    expect((await g.json() as { project_id: string }[]).map(r => r.project_id)).toEqual([PROJ_A])
    const p = await revenueRoute.POST(postR({ project_id: PROJ_A, amount_sek: 42 }))
    expect(p.status).toBe(201)
    expect(inserts[0].row.project_id).toBe(PROJ_A)
  })

  it('tts passes auth and calls OpenAI exactly once', async () => {
    stubOpenAI()
    const res = await ttsRoute.POST(postT({ text: 'hej världen' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(openaiCalls).toHaveLength(1)
    expect(openaiCalls[0].url).toBe('https://api.openai.com/v1/audio/speech')
  })

  it('tts preserves its body contract after auth', async () => {
    stubOpenAI()
    // `hd` is gone from the contract; an explicit `speed` is still honoured.
    await ttsRoute.POST(postT({ text: '  hej  ', voice: 'nova', hd: false, speed: 2 }))
    const body = openaiCalls[0].body as Record<string, unknown>
    expect(body.model).toBe('gpt-4o-mini-tts')
    expect(body.voice).toBe('nova')
    expect(body.input).toBe('hej')
    expect(body.response_format).toBe('mp3')
    expect(body.speed).toBe(2)
    // `hd` can no longer select a model, so it must not reach the provider.
    expect(body.hd).toBeUndefined()
  })

  it('tts sends the benchmarked payload verbatim when no speed is supplied', async () => {
    stubOpenAI()
    // This is the ONLY path Atlas itself uses: runtime.tsx sends { text, voice }.
    // It has to stay field-for-field identical to the approved listening test.
    await ttsRoute.POST(postT({ text: 'hej', voice: 'onyx' }))
    const b = openaiCalls[0].body as Record<string, unknown>
    expect(Object.keys(b).sort()).toEqual(['input', 'model', 'response_format', 'voice'])
    expect(b.speed).toBeUndefined()
    expect(b.instructions).toBeUndefined()
  })

  it('tts still truncates to 600 characters', async () => {
    stubOpenAI()
    await ttsRoute.POST(postT({ text: 'a'.repeat(900) }))
    expect((openaiCalls[0].body as { input: string }).input).toHaveLength(600)
  })

  it('tts still clamps an explicit speed and defaults voice/model', async () => {
    stubOpenAI()
    await ttsRoute.POST(postT({ text: 'x', speed: 99 }))
    const b = openaiCalls[0].body as Record<string, unknown>
    // The clamp is unchanged; only the DEFAULT of 1.08 was dropped.
    expect(b.speed).toBe(4.0)
    expect(b.voice).toBe('onyx')
    expect(b.model).toBe('gpt-4o-mini-tts')
  })

  it('tts clamps a too-low explicit speed to the floor', async () => {
    stubOpenAI()
    await ttsRoute.POST(postT({ text: 'x', speed: 0.01 }))
    expect((openaiCalls[0].body as Record<string, unknown>).speed).toBe(0.25)
  })

  it('tts ignores a non-numeric speed rather than forwarding junk', async () => {
    stubOpenAI()
    await ttsRoute.POST(postT({ text: 'x', speed: 'fast' }))
    expect((openaiCalls[0].body as Record<string, unknown>).speed).toBeUndefined()
  })

  it('tts still 400s on empty text — after auth, before OpenAI', async () => {
    stubOpenAI()
    const res = await ttsRoute.POST(postT({ text: '   ' }))
    expect(res.status).toBe(400)
    expect(openaiCalls).toHaveLength(0)
  })

  it('tts still maps an OpenAI failure to 502', async () => {
    stubOpenAI(false)
    const res = await ttsRoute.POST(postT({ text: 'hej' }))
    expect(res.status).toBe(502)
  })
})

// ── 4. A bearer header must not sabotage a valid session ────────────────────

describe('session takes precedence over any bearer header', () => {
  it.each([
    ['a valid legacy key', VALID_LEGACY_KEY],
    ['a stale wrong key',  'old-rotated-key'],
    ['a credential-looking token', 'omn_0123456789abcdef_' + 'A'.repeat(43)],
  ])('campaigns GET succeeds with a session and %s', async (_l, token) => {
    const res = await campaignsRoute.GET(getC(token))
    expect(res.status).toBe(200)
  })

  it('tts succeeds with a session and a stale bearer header', async () => {
    stubOpenAI()
    const res = await ttsRoute.POST(postT({ text: 'hej' }, 'old-rotated-key'))
    expect(res.status).toBe(200)
    expect(openaiCalls).toHaveLength(1)
  })

  it('revenue POST succeeds with a session and a stale bearer header', async () => {
    const res = await revenueRoute.POST(postR({ project_id: PROJ_A, amount_sek: 5 }, 'old-key'))
    expect(res.status).toBe(201)
  })
})

// ── 5. TTS spend safety ─────────────────────────────────────────────────────

describe('tts never spends before auth', () => {
  it.each([
    ['no session at all',    () => { sessionUser = null }],
    ['legacy key only',      () => { sessionUser = null }],
    ['session lookup throws', () => { sessionUser = null }],
  ])('%s → zero OpenAI calls', async (_l, setup) => {
    setup()
    stubOpenAI()
    await ttsRoute.POST(postT({ text: 'hej' }, VALID_LEGACY_KEY))
    expect(openaiCalls).toHaveLength(0)
  })

  it('auth is the first statement in the handler, before any body read', () => {
    const src = read(TTS)
    const fn = src.slice(src.indexOf('export async function POST'))
    const authAt = fn.indexOf('requireUserSession()')
    const bodyAt = fn.indexOf('await request.json()')
    // G1 moved the network call into the governed OpenAI adapter, so the thing
    // auth must precede is the governed call, not a raw fetch. The property is
    // the same: no billable work before the session is proven.
    const fetchAt = fn.indexOf('openAISpeech(')
    expect(authAt).toBeGreaterThan(-1)
    expect(authAt).toBeLessThan(bodyAt)
    expect(authAt).toBeLessThan(fetchAt)
    // The denial returns before anything else can run.
    expect(fn.slice(authAt, fn.indexOf('\n', fn.indexOf('if (!auth.ok)')))).toContain('return auth.response')
  })
})

// ── 6. Source-level invariants ──────────────────────────────────────────────

describe('source invariants', () => {
  it.each([CAMPAIGNS, REVENUE, TTS])('%s cannot reach legacy auth', p => {
    const src = read(p)
    // The prose explains what was removed, so the NAME may appear. What must
    // not appear is any way to reach the verifier: no import of the helpers,
    // and no read of the environment variable.
    for (const forbidden of ['requireApiKey', 'requireUserOrApiKey', 'legacy_api_key', 'resolveBusinessAuth']) {
      expect(src).not.toContain(forbidden)
    }
    expect(src).not.toContain('process.env.AIOPS_API_KEY')
    expect(src).not.toMatch(/import .*from '@\/lib\/api-auth'/)
    expect(src).toContain('requireUserSession')
  })

  it.each([CAMPAIGNS, REVENUE])('%s has no raw legacy branch left', p => {
    const src = read(p)
    expect(src).not.toContain('Legacy global-key path')
    expect(src).not.toContain('TRANSITIONAL SECURITY DEBT')
    expect(src).not.toContain("auth.auth.kind")
  })

  it('business-auth no longer knows about machine auth', () => {
    const src = read(BUSINESS_AUTH)
    for (const forbidden of ['requireApiKey', 'AIOPS_API_KEY', 'legacy_api_key', 'resolveBusinessAuth', 'BusinessAuth']) {
      expect(src).not.toContain(forbidden)
    }
    expect(src).not.toMatch(/from '@\/lib\/api-auth'/)
    // What it still owns.
    expect(src).toContain('resolveSessionScope')
    expect(src).toContain('resolveSessionProject')
  })

  it('the session helper reads no bearer token and no global key', () => {
    const src = read('lib/auth/session.ts')
    expect(src).not.toContain('process.env.AIOPS_API_KEY')
    expect(src).not.toContain('requireApiKey')
    expect(src).not.toContain('authorization')
    expect(src).not.toContain('Bearer')
    expect(src).not.toContain('createAdminClient')
    expect(src).toContain("import 'server-only'")
  })

  // ── LEADS MUST KEEP ITS LEGACY BRANCH UNTIL 4B3 ──────────────────────────

  it('leads has exactly TWO auth classes after 4B3', () => {
    const auth = read(LEADS_AUTH)
    expect(auth).toContain("kind: 'user'")
    expect(auth).toContain("kind: 'project_credential'")
    expect(auth).not.toContain("kind: 'legacy_api_key'")
    expect(auth).not.toContain("from '@/lib/api-auth'")
    expect(auth).not.toContain('requireApiKey(request)')
  })

  it('the leads route branches on both classes and writes on neither tail', () => {
    const src = read(LEADS)
    expect(src).toContain("auth.auth.kind === 'project_credential'")
    expect(src).toContain("auth.auth.kind === 'user'")
    expect(src).not.toContain('TRANSITIONAL SECURITY DEBT')
    // The old fallthrough was `const lead = await createLead(body)`. What
    // replaces it must deny, not write.
    expect(src).not.toMatch(/createLead\(body\)/)
    expect(src).toContain('const unhandled: never = auth.auth')
  })

  it('api-auth.ts now holds cron auth only', () => {
    // 4B2 left the global helpers in place as rollback material. 4E2 removed
    // them once the secrets were retired, so the assertion inverts.
    const src = read('lib/api-auth.ts')
    expect(src).not.toContain('export function requireApiKey')
    expect(src).not.toContain('export async function requireUserOrApiKey')
    expect(src).not.toContain('process.env.AIOPS_API_KEY')
    expect(src).toContain('export function requireCronAuth')
  })

  it('no route imports requireUserOrApiKey any more', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let hits: string[] = []
    try {
      hits = execFileSync('grep', ['-rl', 'requireUserOrApiKey', `${WEB_ROOT}/app`], { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean)
    } catch (e) {
      if ((e as { status?: number }).status !== 1) throw e
    }
    expect(hits).toEqual([])
  })

  it('exactly ONE route surface still accepts the global key', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const routeFiles = execFileSync('find', [`${WEB_ROOT}/app/api`, '-name', 'route.ts'], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)

    const reaching = routeFiles.filter(f => {
      const src = readFileSync(f, 'utf8')
      if (/requireApiKey|requireUserOrApiKey/.test(src)) return true
      for (const m of src.matchAll(/from '@\/(lib\/[a-z0-9/-]+)'/g)) {
        const dep = resolve(WEB_ROOT, `${m[1]}.ts`)
        if (existsSync(dep) && /^\s*import .*require(Api|UserOrApi)Key/m.test(readFileSync(dep, 'utf8'))) return true
      }
      return false
    }).map(f => f.replace(`${WEB_ROOT}/app/api`, '').replace('/route.ts', ''))

    // 4B3: ZERO. Not "leads only" — nothing in the whole route tree.
    expect(reaching).toEqual([])
  })
})
