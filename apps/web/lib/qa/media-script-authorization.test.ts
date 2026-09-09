/**
 * Script-rooted media spend / publish authorization (Phase 9V-3a).
 *
 * Five routes take a script id from the caller, fetch the `media_scripts` row,
 * read `script.project_id` — and never check it. Then they spend real money or
 * publish externally. The id was doing double duty as both selector and
 * permission, which it cannot be: these lookups run through the service-role
 * client, so the row comes back regardless of who asked.
 *
 * WHY THEY LOOKED SAFE. Every one of them already passes
 * `projectScope({ projectId })` into governed spend, so a reader scanning for a
 * project reference finds one. That is BILLING attribution:
 * `lib/cost/governed-spend.ts` has zero references to getAllowedProjectIds,
 * assertProjectAllowed or auth.getUser, and it attributes to a fixed platform
 * slug. Budget accounting is not an access boundary, and this file exists to
 * make the difference explicit.
 *
 * ORDERING IS THE POINT, not just the filter. Authorization now precedes the
 * first paid provider call and the first external publish, so a denied request
 * costs nothing — no ElevenLabs, no Ideogram, no Anthropic, no Lambda render,
 * no Instagram post — and writes nothing. Asserting only "the response was 404"
 * would miss a route that refuses *after* paying.
 *
 * The regenerate route has TWO independent side-effect branches; both read the
 * single guarded row, so one guard dominates both, and the tests drive each
 * branch separately rather than assuming that.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const OWNED = 'ms-mine'
const FOREIGN = 'ms-theirs'
const ABSENT = 'ms-nope'

/** Every metered or outbound call any of the five routes can make. */
let CALLS: string[] = []
const record = (name: string) => (..._a: unknown[]) => { CALLS.push(name); return undefined as never }

function seed() {
  return {
    projects: [{ id: MINE, owner_id: ME }, { id: THEIRS, owner_id: 'user-other' }],
    media_scripts: [
      { id: OWNED, project_id: MINE, hook: 'min hook', script: 'min text', cta: '', hashtags: [],
        video_url: 'https://cdn.test/v.mp4', video_status: 'ready', status: 'draft',
        audio_url: 'https://cdn.test/a.mp3', timing_url: 'https://cdn.test/t.json', duration_ms: 1000,
        images: ['https://cdn.test/i.png'], media_news_items: null },
      { id: FOREIGN, project_id: THEIRS, hook: 'SECRET hook', script: 'SECRET text', cta: '', hashtags: [],
        video_url: 'https://cdn.test/secret.mp4', video_status: 'ready', status: 'draft',
        audio_url: 'https://cdn.test/s.mp3', timing_url: 'https://cdn.test/s.json', duration_ms: 1000,
        images: ['https://cdn.test/s.png'], media_news_items: null },
    ],
  }
}

interface Seen { table: string; ops: [string, string, unknown][] }
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))
    const q: any = {
      select: () => q,
      update: (patch: any) => { rec.ops.push(['update', table, patch]); return q },
      insert: (row: any) => { rec.ops.push(['insert', table, row]); return q },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT: ReturnType<typeof fakeDb>
let CURRENT_USER: { id: string } | null = { id: ME }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))

// ── Every paid provider and outbound publisher, instrumented ────────────────
vi.mock('@/lib/media/elevenlabs', () => ({
  generateVoiceover: async () => { CALLS.push('elevenlabs'); return { audioBuffer: Buffer.from(''), words: [], durationMs: 1 } },
}))
vi.mock('@/lib/media/ideogram', () => ({
  generateSceneImages: async () => { CALLS.push('ideogram'); return [{ url: 'https://x/1.png' }] },
  generateNewsImages: async () => { CALLS.push('ideogram'); return ['https://x/1.png'] },
}))
vi.mock('@/lib/media/lambda-render', () => ({
  startLambdaRender: async () => { CALLS.push('lambda-render'); return { renderId: 'r1', bucketName: 'b1' } },
  getLambdaRenderProgress: async () => ({ done: false, progress: 0 }),
}))
vi.mock('@/lib/media/instagram', () => ({
  postReelToInstagram: async () => { CALLS.push('instagram'); return { id: 'ig1', permalink: 'https://ig/1' } },
  buildInstagramCaption: () => 'caption',
}))
vi.mock('@/lib/media/facebook', () => ({
  postReelToFacebook: async () => { CALLS.push('facebook'); return { id: 'fb1', permalink: 'https://fb/1' } },
}))
// `getAnthropic` is SYNCHRONOUS in the route (`const claude = getAnthropic(...)`),
// so an async mock would hand it a Promise and `.messages` would be undefined.
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({
    messages: {
      create: async () => {
        CALLS.push('anthropic')
        return { content: [{ type: 'text', text: JSON.stringify({ hook: 'h', script: 's', cta: 'c', hashtags: [] }) }] }
      },
    },
  }),
}))
// Downstream helpers that would otherwise reach the network on the OWNED path.
// They are stubbed so the positive-path assertion proves the guard lets an owned
// script through, without this suite depending on real infrastructure.
vi.mock('@/lib/media/video-props', () => ({
  buildVideoInputProps: async () => ({ hook: 'h', words: [], images: [], durationMs: 1000 }),
}))
vi.mock('@/lib/governance/execution-dispatch', () => ({
  assertExecutionDispatchAllowed: async () => {},
  isExecutionStopped: () => false,
}))
vi.mock('@/lib/media/storage', () => ({
  uploadAudio: async () => { CALLS.push('storage'); return 'https://x/a' },
  uploadTimingData: async () => { CALLS.push('storage'); return 'https://x/t' },
  uploadSceneImage: async () => { CALLS.push('storage'); return 'https://x/i' },
}))
vi.mock('@/lib/media/channel-persistence', () => ({
  persistChannelSuccess: async () => { CALLS.push('persist') },
}))

const writes = (seen: Seen[]) =>
  seen.flatMap(s => s.ops).filter(([op]) => op === 'update' || op === 'insert')
const scopeArg = (seen: Seen[]) =>
  seen.flatMap(s => s.ops).find(([op, c]) => op === 'in' && c === 'project_id')?.[2] as string[] | undefined

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** The five routes, each reduced to "call it with this script id". */
const ROUTES: Array<{ name: string; provider: string; call: (id: string) => Promise<Response> }> = [
  { name: 'media/voice', provider: 'elevenlabs', call: async (id) => {
      const { POST } = await import('@/app/api/media/voice/route')
      return POST(jsonReq('https://x.test/api/media/voice', { script_id: id, text: 'hej', voice: 'victoria' })) } },
  { name: 'media/images/generate', provider: 'ideogram', call: async (id) => {
      const { POST } = await import('@/app/api/media/images/generate/route')
      return POST(jsonReq('https://x.test/api/media/images/generate', { script_id: id })) } },
  { name: 'media/publish/instagram', provider: 'instagram', call: async (id) => {
      const { POST } = await import('@/app/api/media/publish/instagram/route')
      return POST(jsonReq('https://x.test/api/media/publish/instagram', { scriptId: id })) } },
  { name: 'media/render/start', provider: 'lambda-render', call: async (id) => {
      const { POST } = await import('@/app/api/media/render/start/route')
      return POST(jsonReq('https://x.test/api/media/render/start', { scriptId: id })) } },
  { name: 'media/scripts/[id]/regenerate', provider: 'anthropic', call: async (id) => {
      const { POST } = await import('@/app/api/media/scripts/[id]/regenerate/route')
      return POST(jsonReq('https://x.test/api/media/scripts/x/regenerate', { what: 'script' }),
                  { params: Promise.resolve({ id }) }) } },
]

async function run(fn: () => Promise<Response>) {
  vi.resetModules()
  CURRENT = fakeDb(seed())
  CALLS = []
  const res = await fn()
  return { res, calls: CALLS, seen: CURRENT.seen }
}

beforeEach(() => { CURRENT_USER = { id: ME }; CURRENT = fakeDb(seed()); CALLS = [] })

// ═══ The denial boundary, proved per route ═══════════════════════════════════

for (const r of ROUTES) {
  describe(`9V-3a · ${r.name} — a script id is a selector, not a permission`, () => {
    it('a FOREIGN script spends nothing, publishes nothing and writes nothing', async () => {
      const { res, calls, seen } = await run(() => r.call(FOREIGN))
      expect(res.status).toBe(404)
      expect(calls, `${r.name} reached a provider on a foreign script`).toEqual([])
      expect(writes(seen)).toEqual([])
    })

    it('a MISSING script spends nothing and writes nothing', async () => {
      const { res, calls, seen } = await run(() => r.call(ABSENT))
      expect(res.status).toBe(404)
      expect(calls).toEqual([])
      expect(writes(seen)).toEqual([])
    })

    it('foreign and missing are indistinguishable', async () => {
      const a = await run(() => r.call(FOREIGN))
      const b = await run(() => r.call(ABSENT))
      expect(a.res.status).toBe(b.res.status)
      expect(await a.res.text()).toEqual(await b.res.text())
    })

    it('an operator who owns nothing is refused, at zero cost', async () => {
      CURRENT_USER = { id: 'nobody' }
      const { res, calls, seen } = await run(() => r.call(OWNED))
      expect(res.status).toBe(404)
      expect(scopeArg(seen)).toEqual([IMPOSSIBLE_PROJECT_ID])
      expect(calls).toEqual([])
      expect(writes(seen)).toEqual([])
      CURRENT_USER = { id: ME }
    })

    it('an unauthenticated request never reaches a provider or a query', async () => {
      CURRENT_USER = null
      const { res, calls, seen } = await run(() => r.call(OWNED))
      expect(res.status).toBe(401)
      expect(calls).toEqual([])
      expect(seen).toHaveLength(0)
      CURRENT_USER = { id: ME }
    })

    it('the lookup carries the caller allow-list, applied in the query', async () => {
      const { seen } = await run(() => r.call(OWNED))
      expect(scopeArg(seen)).toEqual([MINE])
    })

    it('an OWNED script still reaches its provider — the guard is not a blanket refusal', async () => {
      const { calls } = await run(() => r.call(OWNED))
      expect(calls, `${r.name} never reached ${r.provider} for an owned script`).toContain(r.provider)
    })
  })
}

// ═══ regenerate: both branches, separately ═══════════════════════════════════

describe('9V-3a · regenerate — one guard dominates BOTH side-effect branches', () => {
  const call = async (id: string, what: 'script' | 'image' | 'both') => {
    const { POST } = await import('@/app/api/media/scripts/[id]/regenerate/route')
    return POST(jsonReq('https://x.test/api/media/scripts/x/regenerate', { what }),
                { params: Promise.resolve({ id }) })
  }

  for (const what of ['script', 'image', 'both'] as const) {
    it(`the '${what}' branch spends nothing on a foreign script`, async () => {
      // Driven per branch rather than assuming the first guard covers the rest:
      // a later branch that re-resolved the script could bypass it.
      const { res, calls, seen } = await run(() => call(FOREIGN, what))
      expect(res.status).toBe(404)
      expect(calls).toEqual([])
      expect(writes(seen)).toEqual([])
    })
  }

  it("the 'image' branch still reaches Ideogram for an owned script", async () => {
    const { calls } = await run(() => call(OWNED, 'image'))
    expect(calls).toContain('ideogram')
  })
})
