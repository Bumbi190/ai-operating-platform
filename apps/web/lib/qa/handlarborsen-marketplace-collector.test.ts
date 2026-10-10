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
let upsertError: unknown = null
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
          return { error: upsertError }
        },
        insert: async (...a: unknown[]) => {
          ops.push({ table, op: 'insert', args: a })
          return { error: null }
        },
      }
      return builder
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
  fetchMock.mockResolvedValue({ status, text: vi.fn().mockResolvedValue(text) })
}

const ctx = (over: Record<string, unknown> = {}) => ({
  db: fakeDb() as never, projectId: HANDLARBORSEN_PROJECT_ID, projectSlug: HANDLARBORSEN_PROJECT_SLUG,
  snapshotDate: '2026-10-10', ...over,
})

beforeEach(() => {
  ops = []; projectRow = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG, atlas_mode: 'observer' }
  projectQueryError = null; upsertError = null
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

const upserts = () => ops.filter((o) => o.op === 'upsert')

describe('HandlarborsenMarketplaceCollector — contract and storage', () => {
  it('collects the 11 metrics, stores a project-bound snapshot and emits one signal', async () => {
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('ok')
    expect(result.metadata).toMatchObject({ completeness: 'complete', available_count: 11, unavailable_count: 0 })

    expect(upserts()).toHaveLength(1)
    const row = upserts()[0].args[0] as Record<string, unknown>
    expect(upserts()[0].table).toBe('handlarborsen_marketplace_snapshots')
    expect(upserts()[0].args[1]).toEqual({ onConflict: 'project_id,snapshot_date' })
    expect(row).toMatchObject({ project_id: HANDLARBORSEN_PROJECT_ID, snapshot_date: '2026-10-10', completeness: 'complete', schema_version: 1, window_hours: 24, ...COUNTS })

    expect(recordSignal).toHaveBeenCalledTimes(1)
    expect(recordSignal.mock.calls[0][0]).toMatchObject({
      projectId: HANDLARBORSEN_PROJECT_ID, source: 'handlarborsen', kind: 'handlarborsen.marketplace_snapshot',
    })
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
    const row = upserts()[0].args[0] as Record<string, unknown>
    expect(row.bids_total).toBeNull()
    expect(row.bids_last_24h).toBeNull()
    expect(row.companies_verified_total).toBe(9)
    expect(row.completeness).toBe('partial')
    const signalPayload = recordSignal.mock.calls[0][0].payload
    expect((signalPayload.metrics as Record<string, unknown>).bids_total).toBeNull()
  })

  it('marks a run with no available metric as unavailable, all null', async () => {
    const all = Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((k) => [k, UNAVAIL]))
    respond(body({}, all))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.metadata).toMatchObject({ completeness: 'unavailable', available_count: 0 })
    const row = upserts()[0].args[0] as Record<string, unknown>
    for (const key of MARKETPLACE_METRIC_KEYS) expect(row[key]).toBeNull()
  })

  it('dry run fetches and validates but writes nothing', async () => {
    const result = await new HandlarborsenMarketplaceCollector().run(ctx({ dryRun: true }))
    expect(result.status).toBe('ok')
    expect(upserts()).toHaveLength(0)
    expect(ops).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('a failing snapshot write is non-fatal and still emits the signal', async () => {
    upsertError = { message: 'db down' }
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('ok')
    expect(result.metadata.__store_error).toContain('upsert failed')
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
    expect(upserts()).toHaveLength(0)
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
    expect(upserts()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it('reports a network failure as an error without leaking the token or the cause', async () => {
    fetchMock.mockRejectedValue(new Error(`connect ECONNREFUSED Bearer ${TOKEN}`))
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(result.error).toBe('handlarborsen_metrics_network_error')
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(upserts()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
  })

  it.each([401, 403, 500, 503, 302])('reports HTTP %s as an error and writes nothing', async (status) => {
    respond({ status: 'unconfigured' }, status)
    const result = await new HandlarborsenMarketplaceCollector().run(ctx())
    expect(result.status).toBe('error')
    expect(result.error).toBe(`handlarborsen_metrics_http_${status}`)
    expect(upserts()).toHaveLength(0)
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
    expect(upserts()).toHaveLength(0)
    expect(recordSignal).not.toHaveBeenCalled()
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
    expect(upserts()).toHaveLength(1)
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

  it('returns 500 when the collector fails validation', async () => {
    respond(body({ schema_version: 9 }))
    const res = await call()
    expect(res.status).toBe(500)
    expect(upserts()).toHaveLength(0)
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

  it('enables RLS, revokes every client role, and grants only service_role', () => {
    expect(code).toMatch(/ENABLE ROW LEVEL SECURITY/)
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.handlarborsen_marketplace_snapshots FROM ${role}`))
    }
    const grants = code.match(/GRANT [^;]+;/g) ?? []
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatch(/TO service_role;$/)
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
