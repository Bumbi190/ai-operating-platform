/**
 * Write / callback isolation — Phase 9V-1: render status.
 *
 * `GET /api/media/render/status/[renderId]` carried the note "no auth required
 * — renderId is a secure random UUID that acts as the access token". That is
 * true of the RESPONSE, which is only progress numbers. It was never true of
 * the WRITE, because the write was not keyed by the token: `scriptId` arrived
 * as a separate query parameter with nothing tying it to `renderId`. Pair a
 * renderId from your own render with somebody else's scriptId and their script
 * flipped to `ready` — with a video_url of your choosing — or to `failed`.
 * No session, through the service-role client. It is the only finding in this
 * programme that needed no credentials at all.
 *
 * Both production callers are authenticated browser pages under `(platform)`,
 * so this is a USER poll. The sibling `render/complete` IS a machine boundary
 * (service-key Bearer) and its model is deliberately not copied: a shared
 * secret shipped to a browser protects nothing.
 *
 * The fix does more than check `scriptId`. `render/start` already persists
 * `render_id` and `render_bucket` on the script row, so the server owns the
 * whole mapping — the request's renderId and bucketName are ignored and the
 * stored values are used instead. That removes the client-controlled provider
 * parameters from the trust path rather than validating them, and it is what
 * the last two tests below pin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

const ME = 'user-me'
const MINE = '11111111-1111-1111-1111-111111111111'
const THEIRS = '22222222-2222-2222-2222-222222222222'

const STORED_RENDER = 'render-owned-abc'
const STORED_BUCKET = 'bucket-owned'

function seed() {
  return {
    projects: [
      { id: MINE, owner_id: ME },
      { id: THEIRS, owner_id: 'user-other' },
    ],
    media_scripts: [
      { id: 'ms-mine', project_id: MINE, render_id: STORED_RENDER, render_bucket: STORED_BUCKET,
        video_url: null, video_status: 'rendering' },
      { id: 'ms-theirs', project_id: THEIRS, render_id: 'render-foreign', render_bucket: 'bucket-foreign',
        video_url: null, video_status: 'rendering' },
      { id: 'ms-mine-unstarted', project_id: MINE, render_id: null, render_bucket: null,
        video_url: null, video_status: 'draft' },
    ],
  }
}

interface Seen { table: string; ops: [string, string, unknown][]; updates: any[] }
const get = (r: any, p: string): unknown => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), r)

function fakeDb(tables: Record<string, any[]>) {
  const seen: Seen[] = []
  const from = (table: string) => {
    const rec: Seen = { table, ops: [], updates: [] }
    seen.push(rec)
    let rows: any[] = (tables[table] ?? []).map(r => ({ ...r }))
    const q: any = {
      select: () => q,
      update: (patch: any) => { rec.ops.push(['update', table, patch]); rec.updates.push(patch); return q },
      eq: (c: string, v: unknown) => { rec.ops.push(['eq', c, v]); rows = rows.filter(r => get(r, c) === v); return q },
      in: (c: string, v: unknown[]) => { rec.ops.push(['in', c, v]); rows = rows.filter(r => v.includes(get(r, c) as never)); return q },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (ok: any, err?: any) => Promise.resolve({ data: rows, error: null }).then(ok, err),
    }
    return q
  }
  return { db: { from } as any, seen }
}

let CURRENT: ReturnType<typeof fakeDb>
let CURRENT_USER: { id: string } | null = { id: ME }
/** Every provider poll, with the arguments it was actually given. */
let PROVIDER_CALLS: Array<{ renderId: string; bucket: string }> = []
let PROVIDER_RESULT: any = { done: false, progress: 0.5 }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => CURRENT.db }))
vi.mock('@/lib/media/lambda-render', () => ({
  getLambdaRenderProgress: async (renderId: string, bucket: string) => {
    PROVIDER_CALLS.push({ renderId, bucket })
    return PROVIDER_RESULT
  },
}))

/** Requests may name any renderId/bucketName — they must not become authority. */
async function call(scriptId: string | null, renderId = 'render-attacker-supplied', bucket = 'bucket-attacker') {
  vi.resetModules()
  const { GET } = await import('@/app/api/media/render/status/[renderId]/route')
  const qs = scriptId === null ? `bucketName=${bucket}` : `scriptId=${scriptId}&bucketName=${bucket}`
  return GET(
    new Request(`https://x.test/api/media/render/status/${renderId}?${qs}`),
    { params: Promise.resolve({ renderId }) },
  )
}

const updatesFor = (seen: Seen[]) => seen.flatMap(s => s.updates)
const scopeArg = (seen: Seen[]) =>
  seen.flatMap(s => s.ops).find(([op, c]) => op === 'in' && c === 'project_id')?.[2] as string[] | undefined

beforeEach(() => {
  CURRENT_USER = { id: ME }
  CURRENT = fakeDb(seed())
  PROVIDER_CALLS = []
  PROVIDER_RESULT = { done: false, progress: 0.5 }
})

describe('9V-1 · render status — an unauthenticated caller can no longer write', () => {
  it('no session is refused, and it costs no provider call and no write', async () => {
    CURRENT_USER = null
    const res = await call('ms-mine')
    expect(res.status).toBe(401)
    expect(PROVIDER_CALLS).toHaveLength(0)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
    expect(CURRENT.seen).toHaveLength(0)     // not a single query ran
  })

  it('a session alone is not enough — a foreign script is refused', async () => {
    const res = await call('ms-theirs')
    expect(res.status).toBe(404)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
  })
})

describe('9V-1 · render status — authorization precedes the provider call and the write', () => {
  it('a foreign script triggers ZERO provider calls', async () => {
    // Ordering matters beyond the leak: the poll has cost and rate-limit impact.
    PROVIDER_RESULT = { done: true, progress: 1, videoUrl: 'https://evil.test/v.mp4' }
    const res = await call('ms-theirs')
    expect(res.status).toBe(404)
    expect(PROVIDER_CALLS).toHaveLength(0)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
  })

  it('a missing script triggers ZERO provider calls', async () => {
    PROVIDER_RESULT = { done: true, progress: 1, videoUrl: 'https://evil.test/v.mp4' }
    const res = await call('ms-does-not-exist')
    expect(res.status).toBe(404)
    expect(PROVIDER_CALLS).toHaveLength(0)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
  })

  it('foreign and missing are indistinguishable', async () => {
    const foreign = await call('ms-theirs')
    const missing = await call('ms-does-not-exist')
    expect(foreign.status).toBe(missing.status)
    expect(await foreign.json()).toEqual(await missing.json())
  })

  it('a script that never started rendering gets the same answer', async () => {
    // Not yours / does not exist / never rendered — one response for all three.
    const res = await call('ms-mine-unstarted')
    const missing = await call('ms-does-not-exist')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await missing.json())
    expect(PROVIDER_CALLS).toHaveLength(0)
  })
})

describe('9V-1 · render status — the owned path still works', () => {
  it('an owned, rendering script polls and reports progress', async () => {
    const res = await call('ms-mine')
    expect(res.status).toBe(200)
    expect((await res.json()).progress).toBe(50)
    expect(PROVIDER_CALLS).toHaveLength(1)
  })

  it('a finished render writes ready + the url on the owned row', async () => {
    PROVIDER_RESULT = { done: true, progress: 1, videoUrl: 'https://cdn.test/ok.mp4' }
    const res = await call('ms-mine')
    expect(res.status).toBe(200)
    const ups = updatesFor(CURRENT.seen)
    expect(ups).toEqual([{ video_url: 'https://cdn.test/ok.mp4', video_status: 'ready' }])
    const eqIds = CURRENT.seen.flatMap(s => s.ops).filter(([op, c]) => op === 'eq' && c === 'id').map(o => o[2])
    expect(eqIds.every(id => id === 'ms-mine')).toBe(true)
  })

  it('a failed render writes failed on the owned row', async () => {
    PROVIDER_RESULT = { done: true, progress: 0, error: 'lambda blew up' }
    await call('ms-mine')
    expect(updatesFor(CURRENT.seen)).toEqual([{ video_status: 'failed' }])
  })
})

describe('9V-1 · render status — client-supplied provider parameters are not authority', () => {
  it('the provider is polled with the STORED render id and bucket, not the request ones', async () => {
    // This is the part that makes the fix more than a scriptId check: even a
    // caller who owns the script cannot aim the poll at another render.
    await call('ms-mine', 'render-attacker-supplied', 'bucket-attacker')
    expect(PROVIDER_CALLS).toEqual([{ renderId: STORED_RENDER, bucket: STORED_BUCKET }])
  })

  it('supplying a foreign script id cannot redirect the write to it', async () => {
    PROVIDER_RESULT = { done: true, progress: 1, videoUrl: 'https://evil.test/v.mp4' }
    await call('ms-theirs', STORED_RENDER, STORED_BUCKET)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
    const eqIds = CURRENT.seen.flatMap(s => s.ops).filter(([op, c]) => op === 'eq' && c === 'id').map(o => o[2])
    expect(eqIds).not.toContain('ms-mine')
  })

  it('a missing scriptId is rejected before anything else happens', async () => {
    const res = await call(null)
    expect(res.status).toBe(400)
    expect(PROVIDER_CALLS).toHaveLength(0)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
  })
})

describe('9V-1 · render status — fail closed', () => {
  it('an operator who owns nothing gets the impossible id and no write', async () => {
    CURRENT_USER = { id: 'nobody' }
    PROVIDER_RESULT = { done: true, progress: 1, videoUrl: 'https://evil.test/v.mp4' }
    const res = await call('ms-mine')
    expect(res.status).toBe(404)
    expect(scopeArg(CURRENT.seen)).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(PROVIDER_CALLS).toHaveLength(0)
    expect(updatesFor(CURRENT.seen)).toHaveLength(0)
  })

  it('the lookup is scoped in the query, not filtered afterwards', async () => {
    await call('ms-mine')
    expect(scopeArg(CURRENT.seen)).toEqual([MINE])
  })
})
