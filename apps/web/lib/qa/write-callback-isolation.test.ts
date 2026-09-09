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
      insert: (row: any) => { rec.ops.push(['insert', table, row]); return q },
      order: () => q,
      limit: () => q,
      single: async () => ({ data: rows[0] ?? { id: 'new-row' }, error: null }),
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
const find = (seen: Seen[], t: string, ...must: string[]) =>
  seen.filter(s => s.table === t).find(r => {
    const o = r.ops.map(([op, c]) => `${op}:${c}`)
    return must.every(m => o.includes(m))
  })
/** The `.in()` value on ONE recorded query (the 9V-1 `scopeArg` scans all of them). */
const scopeIn = (rec: Seen | undefined, col: string) =>
  rec?.ops.find(([op, c]) => op === 'in' && c === col)?.[2] as string[] | undefined
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

// ═══ Phase 9V-2 · foreign-key attribution ════════════════════════════════════
//
// Two POST methods accepted a client-supplied foreign key as attribution with
// session auth only. Same shape, different severity, and the tests keep that
// distinction rather than flattening it:
//
//   POST /api/approvals      — the row lands in ANOTHER tenant's approval queue,
//     because approvals.project_id is nullable and ownership resolves through
//     the run (Phase 9L). Higher severity.
//   POST /api/conversations  — the row stays user_id-owned, so the creator is
//     still the only reader; what leaks is a false project label. Lower
//     severity, still a definite integrity bug.
//
// The conversations policy came from the database, not from inference: 90 of 91
// live rows are projectless and four of five callers post `{}` or an explicit
// null, so omitting the field had to stay valid. Only a SUPPLIED value is
// validated, and a foreign one is REFUSED rather than rewritten to null —
// silently nulling would look identical to success on a surface where almost
// every row is projectless.

const OWNED_RUN = 'run-mine'
const FOREIGN_RUN = 'run-theirs'

function seedAttribution() {
  return {
    projects: [
      { id: MINE, owner_id: ME },
      { id: THEIRS, owner_id: 'user-other' },
    ],
    runs: [
      { id: OWNED_RUN, project_id: MINE },
      { id: FOREIGN_RUN, project_id: THEIRS },
    ],
    approvals: [],
    conversations: [],
  }
}

/** The routes take NextRequest and read `.json()`; give them that shape. */
function jsonReq(url: string, body: unknown) {
  const req: any = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  req.nextUrl = new URL(url)
  return req as never
}

const inserts = (seen: Seen[], table: string) =>
  seen.filter(s => s.table === table).flatMap(s => s.ops).filter(([op]) => op === 'insert').map(o => o[2])

describe('9V-2 · approvals POST — a body run_id is not a permission', () => {
  const post = async (body: unknown) => {
    vi.resetModules()
    const { POST } = await import('@/app/api/approvals/route')
    return POST(jsonReq('https://x.test/api/approvals', body))
  }
  beforeEach(() => { CURRENT = fakeDb(seedAttribution()) })

  it('an owned run inserts the approval', async () => {
    const res = await post({ run_id: OWNED_RUN, output_key: 'k', content: 'c' })
    expect(res.status).toBe(201)
    const rows = inserts(CURRENT.seen, 'approvals')
    expect(rows).toHaveLength(1)
    expect((rows[0] as any).run_id).toBe(OWNED_RUN)
    expect((rows[0] as any).status).toBe('pending')
  })

  it('a FOREIGN run inserts nothing', async () => {
    const res = await post({ run_id: FOREIGN_RUN, output_key: 'k', content: 'SECRET' })
    expect(res.status).toBe(404)
    expect(inserts(CURRENT.seen, 'approvals')).toHaveLength(0)
  })

  it('a missing run inserts nothing', async () => {
    const res = await post({ run_id: 'run-nope', output_key: 'k', content: 'c' })
    expect(res.status).toBe(404)
    expect(inserts(CURRENT.seen, 'approvals')).toHaveLength(0)
  })

  it('foreign and missing are indistinguishable', async () => {
    const foreign = await post({ run_id: FOREIGN_RUN, output_key: 'k', content: 'c' })
    const missing = await post({ run_id: 'run-nope', output_key: 'k', content: 'c' })
    expect(foreign.status).toBe(missing.status)
    expect(await foreign.json()).toEqual(await missing.json())
  })

  it('the run lookup carries the allow-list, and the insert uses the proven id', async () => {
    await post({ run_id: OWNED_RUN, output_key: 'k', content: 'c' })
    const lookup = find(CURRENT.seen, 'runs', 'eq:id', 'in:project_id')
    expect(lookup, 'run lookup not scoped').toBeTruthy()
    expect(scopeIn(lookup, 'project_id')).toEqual([MINE])
  })

  it('a client-supplied project_id cannot become authority', async () => {
    const res = await post({ run_id: FOREIGN_RUN, output_key: 'k', content: 'c', project_id: THEIRS })
    expect(res.status).toBe(404)
    expect(inserts(CURRENT.seen, 'approvals')).toHaveLength(0)
  })

  it('an operator who owns nothing inserts nothing', async () => {
    CURRENT_USER = { id: 'nobody' }
    const res = await post({ run_id: OWNED_RUN, output_key: 'k', content: 'c' })
    expect(res.status).toBe(404)
    expect(scopeIn(find(CURRENT.seen, 'runs', 'eq:id', 'in:project_id'), 'project_id'))
      .toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(inserts(CURRENT.seen, 'approvals')).toHaveLength(0)
  })

  it('an unauthenticated request never reaches a query', async () => {
    CURRENT_USER = null
    const res = await post({ run_id: OWNED_RUN, output_key: 'k', content: 'c' })
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})

describe('9V-2 · conversations POST — a supplied project must be owned', () => {
  const post = async (body: unknown) => {
    vi.resetModules()
    const { POST } = await import('@/app/api/conversations/route')
    return POST(jsonReq('https://x.test/api/conversations', body))
  }
  beforeEach(() => { CURRENT = fakeDb(seedAttribution()) })

  it('an omitted project_id still creates a projectless conversation', async () => {
    // 90 of 91 live rows and four of five callers do exactly this.
    const res = await post({})
    expect(res.status).toBe(201)
    const rows = inserts(CURRENT.seen, 'conversations')
    expect(rows).toHaveLength(1)
    expect((rows[0] as any).project_id).toBeNull()
    expect((rows[0] as any).user_id).toBe(ME)
  })

  it('an explicit null project_id behaves the same', async () => {
    const res = await post({ project_id: null, title: 'Ny' })
    expect(res.status).toBe(201)
    expect((inserts(CURRENT.seen, 'conversations')[0] as any).project_id).toBeNull()
  })

  it('an owned project_id is accepted and persisted', async () => {
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(201)
    expect((inserts(CURRENT.seen, 'conversations')[0] as any).project_id).toBe(MINE)
  })

  it('a FOREIGN project_id is refused — and NOT rewritten to null', async () => {
    // Rewriting would look identical to success to the caller.
    const res = await post({ project_id: THEIRS })
    expect(res.status).toBe(404)
    expect(inserts(CURRENT.seen, 'conversations')).toHaveLength(0)
  })

  it('a nonexistent project_id is refused', async () => {
    const res = await post({ project_id: '99999999-9999-9999-9999-999999999999' })
    expect(res.status).toBe(404)
    expect(inserts(CURRENT.seen, 'conversations')).toHaveLength(0)
  })

  it('foreign and nonexistent are indistinguishable', async () => {
    const foreign = await post({ project_id: THEIRS })
    const missing = await post({ project_id: '99999999-9999-9999-9999-999999999999' })
    expect(foreign.status).toBe(missing.status)
    expect(await foreign.json()).toEqual(await missing.json())
  })

  it('user_id is always the session user, never the body', async () => {
    const res = await post({ user_id: 'user-other', title: 'spoof' })
    expect(res.status).toBe(201)
    expect((inserts(CURRENT.seen, 'conversations')[0] as any).user_id).toBe(ME)
  })

  it('an operator who owns nothing cannot attach any project', async () => {
    CURRENT_USER = { id: 'nobody' }
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(404)
    expect(inserts(CURRENT.seen, 'conversations')).toHaveLength(0)
  })

  it('an operator who owns nothing may still create a projectless conversation', async () => {
    // Projectless creation needs no project authority, so it must not become
    // collateral damage of the new guard.
    CURRENT_USER = { id: 'nobody' }
    const res = await post({})
    expect(res.status).toBe(201)
    expect((inserts(CURRENT.seen, 'conversations')[0] as any).project_id).toBeNull()
  })

  it('an unauthenticated request never reaches a query', async () => {
    CURRENT_USER = null
    const res = await post({ project_id: MINE })
    expect(res.status).toBe(401)
    expect(CURRENT.seen).toHaveLength(0)
  })
})
