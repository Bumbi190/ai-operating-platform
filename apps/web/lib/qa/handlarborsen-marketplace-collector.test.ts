import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const recordSignal = vi.fn()
vi.mock('@/lib/atlas/signals', () => ({
  recordSignal: (...args: unknown[]) => recordSignal(...args),
}))

type Op = { table: string; op: string; args: unknown[] }
let ops: Op[] = []
let projectRow: Record<string, unknown> | null = null
let projectQueryError: unknown = null
let rpcError: unknown = null
/** Overrides the modelled database answer (undefined = use the model below). */
let rpcOverride: unknown = undefined
/** In-memory model of public.handlarborsen_store_marketplace_snapshot, keyed by snapshot date.
 *  It mirrors the decision table of the SQL; the SQL itself is proven against a real Postgres
 *  by docs/handlarborsen-p1e/verify-guarded-store.sh. */
let stored = new Map<string, { obs: string; avail: number; completeness: string }>()
const KEYS = [
  'companies_registered_total','companies_verified_total','vehicles_published_active','vehicles_reserved',
  'vehicles_published_last_24h','bids_total','bids_last_24h','interests_last_24h','offers_last_24h',
  'deals_completed_total','deals_completed_last_24h',
]
function modelStore(args: { p_snapshot_date: string; p_observed_at: string; p_metrics: Record<string, number | null> }) {
  const avail = KEYS.filter((k) => args.p_metrics[k] !== null).length
  const completeness = avail === 11 ? 'complete' : avail === 0 ? 'unavailable' : 'partial'
  const base = { snapshot_date: args.p_snapshot_date, completeness, available_count: avail }
  const old = stored.get(args.p_snapshot_date)
  const put = () => stored.set(args.p_snapshot_date, { obs: args.p_observed_at, avail, completeness })
  if (!old) { put(); return { ...base, outcome: 'inserted', stored: true } }
  const existing = { existing_completeness: old.completeness, existing_available_count: old.avail, existing_observed_at: old.obs }
  if (avail > old.avail) { put(); return { ...base, outcome: 'upgraded', stored: true, reason: null, ...existing } }
  if (avail === old.avail && args.p_observed_at > old.obs) { put(); return { ...base, outcome: 'refreshed', stored: true, reason: null, ...existing } }
  if (avail === old.avail && args.p_observed_at === old.obs) return { ...base, outcome: 'unchanged', stored: false, reason: null, ...existing }
  return { ...base, outcome: 'rejected', stored: false, reason: avail < old.avail ? 'lower_quality' : 'older_observation', ...existing }
}
const adminCreated = vi.fn()

function fakeDb() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown[]]> = []
      const builder: any = {
        select: (...a: unknown[]) => { filters.push(['select', a]); return builder },
        eq: (...a: unknown[]) => { filters.push(['eq', a]); return builder },
        in: (...a: unknown[]) => { filters.push(['in', a]); return builder },
        maybeSingle: async () => {
          ops.push({ table, op: 'maybeSingle', args: filters as unknown[] })
          return { data: projectRow, error: projectQueryError }
        },
        upsert: async (...a: unknown[]) => {
          ops.push({ table, op: 'upsert', args: a })
          return { error: null }
        },
        insert: async (...a: unknown[]) => {
          ops.push({ table, op: 'insert', args: a })
          return { error: null }
        },
      }
      return builder
    },
    rpc: async (fn: string, args: any) => {
      ops.push({ table: `rpc:${fn}`, op: 'rpc', args: [args] })
      if (rpcError) return { data: null, error: rpcError }
      return { data: rpcOverride !== undefined ? rpcOverride : modelStore(args), error: null }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { adminCreated(); return fakeDb() },
}))

import {
  HANDLARBORSEN_METRICS_URL,
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
  HandlarborsenMarketplaceCollector,
  MARKETPLACE_METRIC_KEYS,
  isEligibleHandlarborsenProject,
  parseMarketplaceMetrics,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { BaseCollector, type StoreDeclined } from '@/lib/atlas/collectors/types'
import { GET } from '@/app/api/collectors/handlarborsen/marketplace/route'

const TOKEN = 'h'.repeat(40)
const CRON = 'c'.repeat(40)
const COUNTS: Record<string, number> = {
  companies_registered_total: 12, companies_verified_total: 9, vehicles_published_active: 40,
  vehicles_reserved: 3, vehicles_published_last_24h: 5, bids_total: 77, bids_last_24h: 8,
  interests_last_24h: 4, offers_last_24h: 2, deals_completed_total: 6, deals_completed_last_24h: 1,
}

function okMetric(key: string) { return { status: 'ok', value: COUNTS[key] } }

function body(overrides: Record<string, unknown> = {}, metricOverrides: Record<string, unknown> = {}) {
  const metrics: Record<string, unknown> = {}
  for (const key of MARKETPLACE_METRIC_KEYS) metrics[key] = okMetric(key)
  Object.assign(metrics, metricOverrides)
  return {
    status: 'ok', schema_version: 1, observed_at: new Date().toISOString(), window_hours: 24,
    metrics, ...overrides,
  }
}

const UNAVAIL = { status: 'unavailable', value: null, reason: 'query_failed' }

let fetchMock: ReturnType<typeof vi.fn>
function respond(payload: unknown, status = 200) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  fetchMock.mockImplementation(async () => new Response(text, { status }))
}

const ctx = (over: Record<string, unknown> = {}) => ({
  db: fakeDb() as never, projectId: HANDLARBORSEN_PROJECT_ID, projectSlug: HANDLARBORSEN_PROJECT_SLUG,
  snapshotDate: '2026-10-10', ...over,
})

beforeEach(() => {
  ops = []; projectRow = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG, atlas_mode: 'observer' }
  projectQueryError = null; rpcError = null; rpcOverride = undefined; stored = new Map()
  recordSignal.mockReset().mockResolvedValue({ id: 'sig-1' })
  adminCreated.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', TOKEN)
  vi.stubEnv('CRON_SECRET', CRON)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  respond(body())
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const STORE_FN = 'rpc:handlarborsen_store_marketplace_snapshot'
const storeCalls = () => ops.filter((o) => o.table === STORE_FN)
const storeArgs = (i = 0) => storeCalls()[i].args[0] as { p_snapshot_date: string; p_observed_at: string; p_unavailable: Record<string, string>; p_metrics: Record<string, number | null> }
/** The snapshot table must never be written directly: the guarded function is the only path. */
const directSnapshotWrites = () => ops.filter((o) => o.table === 'handlarborsen_marketplace_snapshots')

describe('HandlarborsenMarketplaceCollector — contract and storage', () => {
  it('collects the 11 metrics, stores a project-bound snapshot and emits one signal', async () => {
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('ok')
    expect(result.metadata).toMatchObject({ completeness: 'complete', available_count: 11, unavailable_count: 0 })

    expect(storeCalls()).toHaveLength(1)
    expect(directSnapshotWrites()).toHaveLength(0)
    expect(Object.keys(storeArgs()).sort()).toEqual(['p_metrics', 'p_observed_at', 'p_snapshot_date', 'p_unavailable'])
    expect(storeArgs()).toMatchObject({ p_snapshot_date: '2026-10-10', p_unavailable: {}, p_metrics: COUNTS })

    expect(recordSignal).toHaveBeenCalledTimes(1)
    expect(recordSignal.mock.calls[0][0]).toMatchObject({
      projectId: HANDLARBORSEN_PROJECT_ID, source: 'handlarborsen', kind: 'handlarborsen.marketplace_snapshot',
    })
    expect(recordSignal.mock.calls[0][0].payload).toMatchObject({ storage_outcome: 'inserted' })
  })

  it('calls only the fixed HTTPS URL with a bearer, no redirects, no caching', async () => {
    await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(HANDLARBORSEN_METRICS_URL)
    expect(String(url).startsWith('https://')).toBe(true)
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' })
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('keeps unavailable metrics null and flags the run as partial (never zero)', async () => {
    respond(body({}, { bids_total: UNAVAIL, bids_last_24h: { status: 'unavailable', value: null, reason: 'invalid_count' } }))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('ok')
    expect(result.metadata).toMatchObject({
      completeness: 'partial', available_count: 9, unavailable_count: 2,
      unavailable: { bids_total: 'query_failed', bids_last_24h: 'invalid_count' },
    })
    const sent = storeArgs()
    expect(sent.p_metrics.bids_total).toBeNull()
    expect(sent.p_metrics.bids_last_24h).toBeNull()
    expect(sent.p_metrics.companies_verified_total).toBe(9)
    expect(sent.p_unavailable).toEqual({ bids_total: 'query_failed', bids_last_24h: 'invalid_count' })
    expect('p_completeness' in sent).toBe(false) // derived by the database, never trusted from the caller
    const signalPayload = recordSignal.mock.calls[0][0].payload
    expect((signalPayload.metrics as Record<string, unknown>).bids_total).toBeNull()
  })

  it('marks a run with no available metric as unavailable, all null', async () => {
    const all = Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((k) => [k, UNAVAIL]))
    respond(body({}, all))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.metadata).toMatchObject({ completeness: 'unavailable', available_count: 0 })
    for (const key of MARKETPLACE_METRIC_KEYS) expect(storeArgs().p_metrics[key]).toBeNull()
  })

  it('dry run fetches and validates but writes nothing', async () => {
    const result = await new HandlarborsenMarketplaceCollector().run(ctx({ dryRun: true }))
    expect(result.status).toBe('ok')
    expect(storeCalls()).toHaveLength(0)
    expect(ops).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('a failed snapshot write is NEVER a successful collection: error, no signal, no DB text', async () => {
    rpcError = { message: 'relation "x" does not exist, host db.secret.internal', code: '42P01' }
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(result.error).toBe('snapshot_store_failed')
    expect(result.signalKind).toBeNull()
    expect(result.signalId).toBeNull()
    expect(result.metadata).toEqual({ store_failed: true })
    expect(recordSignal).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/secret|does not exist|42P01/)
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toMatch(/secret.internal|does not exist/) // only the code reaches the server log
  })

  it('dry run never touches the snapshot table, so it works even when that table is missing', async () => {
    rpcError = { message: 'relation does not exist', code: '42P01' }
    const result = await new HandlarborsenMarketplaceCollector().run(ctx({ dryRun: true }))
    expect(result.status).toBe('ok')
    expect(ops).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('other collectors are unchanged: storeRequired defaults to false and a store failure stays non-fatal', async () => {
    class Legacy extends BaseCollector {
      readonly id = 'test.legacy'; readonly signalKind = 'test.kind'; readonly version = 't-1'; readonly source = 'test'
      async fetch() { return {} }
      validate(raw: unknown) { return raw }
      normalize() { return { a: 1 } as Record<string, unknown> }
      async store() { throw new Error('boom') }
    }
    const legacy = new Legacy()
    expect(legacy.storeRequired).toBe(false)
    expect(new HandlarborsenMarketplaceCollector().storeRequired).toBe(true)
    const result = await legacy.run(ctx({ projectId: 'p', projectSlug: 's' }))
    expect(result.status).toBe('ok')
    expect(result.metadata.__store_error).toBe('boom')
    expect(recordSignal).toHaveBeenCalledTimes(1)
  })
})

describe('HandlarborsenMarketplaceCollector — configuration, identity, failures', () => {
  it.each([
    ['missing', undefined],
    ['too short', 'short'],
    ['equal to CRON_SECRET', CRON],
  ])('skips without fetching when the token is %s', async (_l, value) => {
    vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', value ?? '')
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storeCalls()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it.each([
    ['another project id', { projectId: '77cda551-57c9-4dc0-b019-1bb6438777f7' }],
    ['another slug', { projectSlug: 'familje-stunden' }],
    ['no project', { projectId: null, projectSlug: null }],
  ])('refuses %s before any network or write', async (_l, over) => {
    const result = await new HandlarborsenMarketplaceCollector().run(ctx(over))
    expect(result.status).toBe('error')
    expect(result.error).toBe('handlarborsen_project_not_allowed')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storeCalls()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('reports a network failure as an error without leaking the token or the cause', async () => {
    fetchMock.mockRejectedValue(new Error(`connect ECONNREFUSED Bearer ${TOKEN}`))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(result.error).toBe('handlarborsen_metrics_network_error')
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(storeCalls()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it.each([401, 403, 500, 503, 302])('reports HTTP %s as an error and writes nothing', async (status) => {
    respond({ status: 'unconfigured' }, status)
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(result.error).toBe(`handlarborsen_metrics_http_${status}`)
    expect(storeCalls()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  const stale = new Date(Date.now() - 3_600_000).toISOString()
  it.each<[string, unknown]>([
    ['not json', 'not json'],
    ['a json array', []],
    ['status not ok', body({ status: 'error' })],
    ['unknown schema_version', body({ schema_version: 2 })],
    ['wrong window', body({ window_hours: 12 })],
    ['malformed observed_at', body({ observed_at: '2026-10-10' })],
    ['non-UTC observed_at', body({ observed_at: '2026-10-10T12:00:00+02:00' })],
    ['stale observed_at', body({ observed_at: stale })],
    ['an extra envelope field', body({ extra: 1 })],
    ['a missing metric', (() => { const b = body(); delete (b.metrics as Record<string, unknown>).bids_total; return b })()],
    ['an extra metric', body({}, { vin_count: okMetric('bids_total') })],
    ['a negative value', body({}, { bids_total: { status: 'ok', value: -1 } })],
    ['a fractional value', body({}, { bids_total: { status: 'ok', value: 1.5 } })],
    ['a string value', body({}, { bids_total: { status: 'ok', value: '5' } })],
    ['an ok metric with a reason', body({}, { bids_total: { status: 'ok', value: 1, reason: 'query_failed' } })],
    ['an extra metric field', body({}, { bids_total: { status: 'ok', value: 1, note: 'x' } })],
    ['an unavailable metric with value 0', body({}, { bids_total: { status: 'unavailable', value: 0, reason: 'query_failed' } })],
    ['an unavailable metric with an unknown reason', body({}, { bids_total: { status: 'unavailable', value: null, reason: 'whatever' } })],
    ['an unavailable metric without a reason', body({}, { bids_total: { status: 'unavailable', value: null } })],
    ['an unknown metric status', body({}, { bids_total: { status: 'pending', value: 1 } })],
    ['an oversized body', JSON.stringify(body()) + ' '.repeat(20_000)],
  ])('rejects %s: error, no snapshot, no signal', async (_l, payload) => {
    respond(payload)
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(storeCalls()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('the deadline covers the response body: a stalled body is aborted and reported as a timeout', async () => {
    vi.useFakeTimers()
    try {
      let aborted = false
      fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"status":'))
            init.signal.addEventListener('abort', () => {
              aborted = true
              controller.error(new DOMException('aborted', 'AbortError'))
            })
          },
        })
        return new Response(stream, { status: 200 }) // headers arrive; the body never finishes
      })
      const pending = new HandlarborsenMarketplaceCollector().run(ctx())
      await vi.advanceTimersByTimeAsync(9_000)
      expect(aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(2_000)
      const result = await pending
      expect(aborted).toBe(true)
      expect(result.status).toBe('error')
      expect(result.error).toBe('handlarborsen_metrics_timeout')
      expect(storeCalls()).toHaveLength(0)
      expect(recordSignal).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops reading an endless body at the size cap instead of buffering it', async () => {
    let pulls = 0
    let cancelled = false
    fetchMock.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(4_096).fill(0x20)) },
      cancel() { cancelled = true },
    }), { status: 200 }))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(result.error).toBe('handlarborsen_metrics_invalid:body_too_large')
    expect(pulls).toBeLessThanOrEqual(8) // 16 KiB cap, 4 KiB chunks (plus stream read-ahead)
    expect(cancelled).toBe(true)
  })

  it('rejects an oversized declared content-length without reading the body', async () => {
    const text = vi.fn()
    fetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-length': '1000000' }),
      body: { cancel: vi.fn().mockResolvedValue(undefined), getReader: text },
    })
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.error).toBe('handlarborsen_metrics_invalid:body_too_large')
    expect(text).not.toHaveBeenCalled()
  })

  it('does not read the body of a non-200 answer', async () => {
    const getReader = vi.fn()
    const cancel = vi.fn().mockResolvedValue(undefined)
    fetchMock.mockResolvedValue({ status: 503, headers: new Headers(), body: { getReader, cancel } })
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.error).toBe('handlarborsen_metrics_http_503')
    expect(getReader).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalled()
  })

  it('reports a body that errors mid-stream as a network error without leaking detail', async () => {
    fetchMock.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error(`socket reset Bearer ${TOKEN}`)) },
    }), { status: 200 }))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.error).toBe('handlarborsen_metrics_network_error')
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it('rejects a body that is not valid UTF-8', async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), { status: 200 }))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.error).toBe('handlarborsen_metrics_invalid:not_utf8')
  })

  it('parseMarketplaceMetrics accepts the exact contract and nothing else', () => {
    const parsed = parseMarketplaceMetrics(body())
    expect(Object.keys(parsed.metrics).sort()).toEqual([...MARKETPLACE_METRIC_KEYS].sort())
    expect(parsed.unavailable).toEqual({})
  })
})

describe('isEligibleHandlarborsenProject', () => {
  const good = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG }
  it.each([
    [{ ...good, atlas_mode: 'observer' }, true],
    [{ ...good, atlas_mode: 'active' }, true],
    [{ ...good, atlas_mode: 'hibernate' }, false],
    [{ ...good, atlas_mode: 'archived' }, false],
    [{ ...good, atlas_mode: undefined }, false],
    [{ id: 'x', slug: HANDLARBORSEN_PROJECT_SLUG, atlas_mode: 'observer' }, false],
    [{ id: HANDLARBORSEN_PROJECT_ID, slug: 'gainpilot', atlas_mode: 'observer' }, false],
    [null, false],
  ])('%j -> %s', (project, expected) => {
    expect(isEligibleHandlarborsenProject(project as never)).toBe(expected)
  })
})

describe('GET /api/collectors/handlarborsen/marketplace', () => {
  const call = (qs = '', auth: string | null = `Bearer ${CRON}`) =>
    GET(new Request(`http://localhost/api/collectors/handlarborsen/marketplace${qs}`, auth ? { headers: { authorization: auth } } : {}))

  it.each([[null], ['Bearer nope'], [`Basic ${CRON}`], [`Bearer ${TOKEN}`]])('rejects auth %s with 401 and does nothing', async (auth) => {
    const res = await call('', auth)
    expect(res.status).toBe(401)
    expect(adminCreated).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call()).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('looks the project up by fixed id + slug + collectable mode only, ignoring request input', async () => {
    const res = await call('?url=http://evil.example&project=familje-stunden&id=other&dry_run=1')
    expect(res.status).toBe(200)
    const lookup = ops.find((o) => o.op === 'maybeSingle')!
    expect(lookup.table).toBe('projects')
    expect(lookup.args).toEqual(expect.arrayContaining([
      ['eq', ['id', HANDLARBORSEN_PROJECT_ID]],
      ['eq', ['slug', HANDLARBORSEN_PROJECT_SLUG]],
      ['in', ['atlas_mode', ['active', 'observer']]],
    ]))
    expect(fetchMock.mock.calls.every((c) => c[0] === HANDLARBORSEN_METRICS_URL)).toBe(true)
  })

  it.each([[null], [{ id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG, atlas_mode: 'hibernate' }], [{ id: 'other', slug: 'handlarborsen', atlas_mode: 'observer' }]])(
    'does not run when the project row is not eligible (%j)', async (row) => {
      projectRow = row
      const res = await call()
      expect(res.status).toBe(200)
      expect((await res.json()).runs).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
      expect(ops.filter((o) => o.op !== 'maybeSingle')).toHaveLength(0)
      expect(recordSignal).not.toHaveBeenCalled()
    })

  it('dry_run=1 returns the reviewed metrics and writes no snapshot, signal or collector_runs row', async () => {
    const res = await call('?dry_run=1')
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.dryRun).toBe(true)
    expect(json.runs[0]).toMatchObject({ status: 'ok', completeness: 'complete' })
    expect(json.runs[0].metrics.bids_total).toBe(77)
    expect(ops.filter((o) => o.op !== 'maybeSingle')).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('a real run writes one snapshot, one signal and one collector_runs row', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).runs[0]).toMatchObject({ status: 'ok', storage: 'inserted' })
    expect(storeCalls()).toHaveLength(1)
    expect(recordSignal).toHaveBeenCalledTimes(1)
    const runs = ops.filter((o) => o.table === 'collector_runs' && o.op === 'insert')
    expect(runs).toHaveLength(1)
    expect(runs[0].args[0]).toMatchObject({ collector_id: 'handlarborsen.marketplace', project_id: HANDLARBORSEN_PROJECT_ID, status: 'ok' })
  })

  it('reports a missing credential as skipped with a reason, fabricating nothing', async () => {
    vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', '')
    const json = await (await call('?dry_run=1')).json()
    expect(json.runs[0]).toMatchObject({ status: 'skipped', reason: 'credential_missing' })
    expect(json.runs[0].metrics).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces partial completeness and never leaks the token in the response', async () => {
    respond(body({}, { vehicles_reserved: UNAVAIL }))
    const res = await call('?dry_run=1')
    const text = await res.text()
    expect(JSON.parse(text).runs[0]).toMatchObject({ completeness: 'partial', unavailable: { vehicles_reserved: 'query_failed' } })
    expect(JSON.parse(text).runs[0].metrics.vehicles_reserved).toBeNull()
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain(CRON)
  })

  it('a failed snapshot write returns 500, records an error run, emits no signal and leaks nothing', async () => {
    rpcError = { message: 'permission denied for table handlarborsen_marketplace_snapshots', code: '42501' }
    const res = await call()
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(JSON.parse(text).runs[0]).toMatchObject({ status: 'error', error: 'snapshot_store_failed', signalId: null })
    expect(text).not.toMatch(/permission denied|42501|handlarborsen_marketplace_snapshots/)
    expect(recordSignal).not.toHaveBeenCalled()
    const runs = ops.filter((o) => o.table === 'collector_runs' && o.op === 'insert')
    expect(runs).toHaveLength(1)
    expect(runs[0].args[0]).toMatchObject({
      collector_id: 'handlarborsen.marketplace', status: 'error', error_message: 'snapshot_store_failed',
      signal_id: null, signal_kind: null, metadata: { store_failed: true },
    })
  })

  it('dry_run=1 succeeds even when the snapshot table is unavailable', async () => {
    rpcError = { message: 'relation does not exist', code: '42P01' }
    const res = await call('?dry_run=1')
    expect(res.status).toBe(200)
    expect(ops.filter((o) => o.op !== 'maybeSingle')).toHaveLength(0)
  })

  it('returns 500 when the collector fails validation', async () => {
    respond(body({ schema_version: 9 }))
    const res = await call()
    expect(res.status).toBe(500)
    expect(storeCalls()).toHaveLength(0)
  })
})

describe('guarded daily storage (P1E)', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  const run = (over: Record<string, unknown> = {}) => new HandlarborsenMarketplaceCollector().run(ctx(over))
  const partial = () => body({}, { bids_total: UNAVAIL, vehicles_reserved: UNAVAIL, offers_last_24h: UNAVAIL })
  const signalOutcomes = () => recordSignal.mock.calls.map((c) => (c[0].payload as Record<string, unknown>).storage_outcome)

  it('first run: snapshot stored, one signal emitted, nothing written to the table directly', async () => {
    const result = await run()
    expect(result.status).toBe('ok')
    expect(storeCalls()).toHaveLength(1)
    expect(directSnapshotWrites()).toHaveLength(0)
    expect(signalOutcomes()).toEqual(['inserted'])
    expect(stored.size).toBe(1)
  })

  it('two runs the same day leave one snapshot: a newer observation refreshes it, an identical one changes nothing', async () => {
    respond(body({ observed_at: minutesAgo(5) }))
    expect((await run()).status).toBe('ok')
    respond(body({ observed_at: minutesAgo(1) }))
    expect((await run()).status).toBe('ok')
    expect(stored.size).toBe(1)
    expect(signalOutcomes()).toEqual(['inserted', 'refreshed'])

    // The very same observation again: the database keeps its row, the run is skipped, no signal.
    respond(body({ observed_at: minutesAgo(1) }))
    rpcOverride = undefined
    const sameObserved = stored.get('2026-10-10')!.obs
    respond(body({ observed_at: sameObserved }))
    const again = await run()
    expect(again.status).toBe('skipped')
    expect(again.error).toBe('snapshot_not_stored:unchanged')
    expect(again.signalId).toBeNull()
    expect(recordSignal).toHaveBeenCalledTimes(2)
    expect(stored.size).toBe(1)
  })

  it('complete followed by partial: the complete report survives, the run is skipped, NO signal and no success claim', async () => {
    respond(body({ observed_at: minutesAgo(5) }))
    await run()
    respond({ ...partial(), observed_at: minutesAgo(1) })
    const result = await run()

    expect(stored.get('2026-10-10')).toMatchObject({ completeness: 'complete', avail: 11 })
    expect(result.status).toBe('skipped')
    expect(result.error).toBe('snapshot_not_stored:lower_quality')
    expect(result.signalKind).toBeNull()
    expect(result.signalId).toBeNull()
    expect(recordSignal).toHaveBeenCalledTimes(1) // only the first, complete run
    expect(result.metadata).toMatchObject({
      storage_outcome: 'rejected', storage_reason: 'lower_quality',
      observed: { completeness: 'partial', available_count: 8 },
      existing: { completeness: 'complete', available_count: 11 },
    })
    expect(result.metadata).not.toHaveProperty('metrics') // the audit row records the decision, not a fake save
  })

  it('partial followed by complete: the partial report is upgraded and the signal says so', async () => {
    respond({ ...partial(), observed_at: minutesAgo(5) })
    await run()
    expect(stored.get('2026-10-10')).toMatchObject({ completeness: 'partial', avail: 8 })
    respond(body({ observed_at: minutesAgo(1) }))
    const result = await run()
    expect(result.status).toBe('ok')
    expect(stored.get('2026-10-10')).toMatchObject({ completeness: 'complete', avail: 11 })
    expect(signalOutcomes()).toEqual(['inserted', 'upgraded'])
    expect(result.metadata).toMatchObject({ storage_outcome: 'upgraded' })
  })

  it('an older observation never replaces a newer one of the same quality', async () => {
    respond(body({ observed_at: minutesAgo(1) }))
    await run()
    const kept = stored.get('2026-10-10')!.obs
    respond(body({ observed_at: minutesAgo(6) }))
    const result = await run()
    expect(result.status).toBe('skipped')
    expect(result.error).toBe('snapshot_not_stored:older_observation')
    expect(stored.get('2026-10-10')!.obs).toBe(kept)
    expect(recordSignal).toHaveBeenCalledTimes(1)
  })

  it('a new date creates a new historical report and leaves the earlier one untouched', async () => {
    respond(body({ observed_at: minutesAgo(1) }))
    await run({ snapshotDate: '2026-10-09' })
    const yesterday = { ...stored.get('2026-10-09')! }
    respond(body({ observed_at: minutesAgo(0) }))
    const today = await run({ snapshotDate: '2026-10-10' })
    expect(today.status).toBe('ok')
    expect([...stored.keys()].sort()).toEqual(['2026-10-09', '2026-10-10'])
    expect(stored.get('2026-10-09')).toEqual(yesterday)
    expect(storeArgs(1).p_snapshot_date).toBe('2026-10-10') // each call targets exactly one date
  })

  it('concurrent runs: both reach the database function, which alone decides; at most one row results', async () => {
    const [a, b] = await Promise.all([run(), run()])
    expect(storeCalls()).toHaveLength(2)
    expect(stored.size).toBe(1)
    expect([a.status, b.status].every((x) => x === 'ok' || x === 'skipped')).toBe(true)
  })

  it('refuses to trust a malformed or inconsistent database answer', async () => {
    for (const answer of [
      null, 'ok', {}, { outcome: 'inserted' },
      { outcome: 'weird', stored: true, completeness: 'complete', available_count: 11 },
      { outcome: 'inserted', stored: false, completeness: 'complete', available_count: 11 },
      { outcome: 'rejected', stored: false, reason: 'nope', completeness: 'complete', available_count: 11 },
      { outcome: 'inserted', stored: true, completeness: 'partial', available_count: 11 }, // disagrees with what was sent
    ]) {
      recordSignal.mockClear()
      rpcOverride = answer
      const result = await run()
      expect(result.status).toBe('error')
      expect(result.error).toBe('snapshot_store_failed')
      expect(recordSignal).not.toHaveBeenCalled()
    }
  })

  it('a missing token, a network failure or invalid statistics never reach the database function', async () => {
    vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', '')
    expect((await run()).status).toBe('skipped')
    vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', TOKEN)
    fetchMock.mockImplementation(async () => { throw new Error('socket hang up') })
    expect((await run()).status).toBe('error')
    respond(body({}, { bids_total: { status: 'ok', value: -3 } }))
    expect((await run()).status).toBe('error')
    respond(body({}, { bids_total: { status: 'ok', value: null } }))
    expect((await run()).status).toBe('error')
    expect(storeCalls()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('null is never turned into 0 on the way to the database', async () => {
    respond(body({}, { bids_total: UNAVAIL }))
    await run()
    const sent = storeArgs()
    expect(sent.p_metrics.bids_total).toBeNull()
    expect(Object.values(sent.p_metrics).filter((v) => v === 0)).toHaveLength(0)
    expect(sent.p_unavailable).toEqual({ bids_total: 'query_failed' })
  })

  it('dry run performs no database call at all, even for the guarded store', async () => {
    const result = await run({ dryRun: true })
    expect(result.status).toBe('ok')
    expect(ops).toHaveLength(0)
    expect(stored.size).toBe(0)
  })

  it('another collector whose store returns nothing is unaffected; one that declines is skipped without a signal', async () => {
    class Plain extends BaseCollector {
      readonly id: string = 'test.plain'; readonly signalKind = 'test.kind'; readonly version = 't-1'; readonly source = 'test'
      async fetch() { return {} }
      validate(raw: unknown) { return raw }
      normalize() { return { a: 1 } as Record<string, unknown> }
      async store(): Promise<void | StoreDeclined> { /* returns nothing */ }
    }
    class Declining extends Plain {
      readonly id: string = 'test.declining'
      async store(): Promise<void | StoreDeclined> { return { declined: true as const, reason: 'nope', metadata: { why: 'test' } } }
    }
    const plain = await new Plain().run(ctx({ projectId: 'p', projectSlug: 's' }))
    expect(plain.status).toBe('ok')
    expect(recordSignal).toHaveBeenCalledTimes(1)
    recordSignal.mockClear()
    const declined = await new Declining().run(ctx({ projectId: 'p', projectSlug: 's' }))
    expect(declined).toMatchObject({ status: 'skipped', error: 'nope', signalId: null, metadata: { why: 'test' } })
    expect(recordSignal).not.toHaveBeenCalled()
  })

  describe('through the route', () => {
    const call = () => GET(new Request('http://localhost/api/collectors/handlarborsen/marketplace', { headers: { authorization: `Bearer ${CRON}` } }))
    const auditRows = () => ops.filter((o) => o.table === 'collector_runs' && o.op === 'insert').map((o) => o.args[0] as Record<string, any>)

    it('first run: snapshot + signal + one audit row that says what was stored', async () => {
      const json = await (await call()).json()
      expect(json).toMatchObject({ ok: true })
      expect(json.runs[0]).toMatchObject({ status: 'ok', storage: 'inserted', completeness: 'complete' })
      expect(recordSignal).toHaveBeenCalledTimes(1)
      expect(auditRows()).toHaveLength(1)
      expect(auditRows()[0]).toMatchObject({ status: 'ok', signal_kind: 'handlarborsen.marketplace_snapshot', metadata: { storage_outcome: 'inserted' } })
    })

    it('a declined snapshot is reported as skipped with the reason: no signal, an honest audit row, still HTTP 200', async () => {
      await call()
      respond(partial())
      const res = await call()
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.runs[0]).toMatchObject({ status: 'skipped', storage: 'rejected', reason: 'snapshot_not_stored:lower_quality', signalId: null })
      expect(json.runs[0].completeness).toBeUndefined()
      expect(recordSignal).toHaveBeenCalledTimes(1)
      const rows = auditRows()
      expect(rows).toHaveLength(2)
      expect(rows[1]).toMatchObject({
        status: 'skipped', signal_id: null, signal_kind: null, error_message: 'snapshot_not_stored:lower_quality',
        metadata: { storage_outcome: 'rejected', storage_reason: 'lower_quality' },
      })
    })

    it('dry_run=1 stays fully read-only: no database function, no signal, no audit row', async () => {
      const res = await GET(new Request('http://localhost/api/collectors/handlarborsen/marketplace?dry_run=1', { headers: { authorization: `Bearer ${CRON}` } }))
      expect(res.status).toBe(200)
      expect(ops.filter((o) => o.op !== 'maybeSingle')).toHaveLength(0)
      expect(recordSignal).not.toHaveBeenCalled()
    })
  })
})

describe('migration 20261010130000_handlarborsen_guarded_snapshot_store.sql', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261010130000_handlarborsen_guarded_snapshot_store.sql'), 'utf8',
  ).replace(/\r\n/g, '\n')
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  const SIG = 'public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb)'

  it('creates one function and changes one table privilege; it schedules nothing and touches no data', () => {
    expect(code.match(/CREATE (OR REPLACE )?FUNCTION/gi)).toHaveLength(1)
    expect(code).not.toMatch(/cron\./i)
    expect(code).not.toMatch(/\b(CREATE TABLE|ALTER TABLE|DROP|TRUNCATE|CREATE POLICY|CREATE TRIGGER)\b/i)
    // The only top-level DELETE/UPDATE keywords are inside the function body (the guarded UPDATE).
    expect(code.match(/\bDELETE\b/gi)).toBeNull()
  })

  it('is a pinned-search-path SECURITY DEFINER bound to the fixed project, with no project parameter', () => {
    expect(code).toMatch(/SECURITY DEFINER\s+SET search_path = ''/)
    expect(code).toContain(`'${HANDLARBORSEN_PROJECT_ID}'`)
    expect(code).toMatch(/p_snapshot_date date,\s+p_observed_at\s+timestamptz,\s+p_unavailable\s+jsonb,\s+p_metrics\s+jsonb\s*\)/)
    expect(code).not.toMatch(/p_project|p_completeness/)
    // Every table reference inside the function is schema-qualified.
    expect(code.match(/(?:FROM|INTO|UPDATE)\s+(?!public\.|jsonb_object_keys|unnest|v_old|v_inserted)\w+/gi)?.filter((m) => /handlarborsen_marketplace_snapshots/.test(m)) ?? []).toHaveLength(0)
  })

  it('decides under a row lock and only writes today, derived completeness, non-negative integers', () => {
    expect(code).toMatch(/ON CONFLICT \(project_id, snapshot_date\) DO NOTHING/)
    expect(code).toMatch(/FOR UPDATE;/)
    expect(code).toContain("p_snapshot_date <> (now() AT TIME ZONE 'UTC')::date")
    expect(code).toContain("'^[0-9]{1,15}$'")
    expect(code).toMatch(/v_completeness := CASE/)
    for (const outcome of ['inserted', 'upgraded', 'refreshed', 'unchanged', 'rejected', 'lower_quality', 'older_observation']) {
      expect(code).toContain(`'${outcome}'`)
    }
    // null is never coalesced to 0 anywhere in the function.
    expect(code).not.toMatch(/coalesce\([^)]*,\s*0\s*\)/i)
  })

  it('grants EXECUTE to service_role only and removes the direct write path', () => {
    expect(code).toContain(`REVOKE ALL ON FUNCTION ${SIG} FROM PUBLIC;`)
    expect(code).toContain(`REVOKE ALL ON FUNCTION ${SIG} FROM anon;`)
    expect(code).toContain(`REVOKE ALL ON FUNCTION ${SIG} FROM authenticated;`)
    expect(code).toContain(`GRANT EXECUTE ON FUNCTION ${SIG} TO service_role;`)
    expect((code.match(/GRANT [^;]+;/g) ?? [])).toHaveLength(1)
    expect(code).toContain('REVOKE INSERT, UPDATE ON TABLE public.handlarborsen_marketplace_snapshots FROM service_role;')
    expect(code).not.toMatch(/GRANT [^;]*\b(anon|authenticated|PUBLIC)\b/)
  })

  it('documents its own rollback', () => {
    expect(sql).toMatch(/ROLLBACK/)
    expect(sql).toContain('GRANT INSERT, UPDATE ON TABLE public.handlarborsen_marketplace_snapshots TO service_role;')
  })
})

describe('migration 20261010100000_handlarborsen_marketplace_snapshots.sql', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261010100000_handlarborsen_marketplace_snapshots.sql'), 'utf8',
  )
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

  it('creates exactly one table and touches nothing else', () => {
    expect(code.match(/CREATE TABLE/gi)).toHaveLength(1)
    expect(code).not.toMatch(/\b(DROP|TRUNCATE|(?<!ON )DELETE|UPDATE\s+public|ALTER TABLE public\.(?!handlarborsen_marketplace_snapshots))/i)
    expect(code).not.toMatch(/cron\.|SECURITY DEFINER|CREATE (OR REPLACE )?FUNCTION/i)
  })

  it('enables RLS, revokes every role (stripping default service_role privileges), then grants service_role SELECT/INSERT/UPDATE only', () => {
    expect(code).toMatch(/ENABLE ROW LEVEL SECURITY/)
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.handlarborsen_marketplace_snapshots FROM ${role}`))
    }
    const grants = code.match(/GRANT [^;]+;/g) ?? []
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatch(/^GRANT SELECT, INSERT, UPDATE ON TABLE public.handlarborsen_marketplace_snapshots TO service_role;$/)
    // The revoke from service_role must precede the grant, or default privileges would survive.
    expect(code.indexOf('FROM service_role')).toBeLessThan(code.indexOf('GRANT SELECT'))
    expect(code).not.toMatch(/CREATE POLICY/i)
  })

  it('is bound to the Handlarbörsen project and the v1 contract, with nullable metrics', () => {
    expect(code).toContain(`project_id = '${HANDLARBORSEN_PROJECT_ID}'::uuid`)
    expect(code).toMatch(/REFERENCES public\.projects\(id\)/)
    expect(code).toMatch(/UNIQUE \(project_id, snapshot_date\)/)
    for (const key of MARKETPLACE_METRIC_KEYS) {
      expect(code).toMatch(new RegExp(`^\\s+${key}\\s+bigint,?\\s*$`, 'm'))
    }
  })
})
