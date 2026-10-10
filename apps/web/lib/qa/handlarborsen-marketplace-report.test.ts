import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const adminCreated = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { adminCreated(); throw new Error('createAdminClient must not run in this test') },
}))

import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
  MARKETPLACE_METRIC_KEYS,
  type MarketplaceMetricKey,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  FACT_BLOCK_HEADER,
  MARKETPLACE_METRIC_DEFINITIONS,
  SNAPSHOT_SELECT_COLUMNS,
  STALE_AFTER_HOURS,
  buildMarketplaceReport,
  renderHandlarborsenFactBlock,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  loadHandlarborsenMarketplaceReport,
  readHandlarborsenFactBlock,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'

const NOW = new Date('2026-10-10T11:00:00.000Z')

function row(overrides: Record<string, unknown> = {}, metrics: Partial<Record<MarketplaceMetricKey, number | null>> = {}) {
  const base: Record<string, unknown> = {
    project_id: HANDLARBORSEN_PROJECT_ID,
    snapshot_date: '2026-10-10',
    observed_at: '2026-10-10T10:22:00.000Z',
    captured_at: '2026-10-10T10:22:01.000Z',
    schema_version: 1,
    window_hours: 24,
    completeness: 'complete',
    unavailable: {},
  }
  MARKETPLACE_METRIC_KEYS.forEach((key, i) => { base[key] = 100 + i })
  return { ...base, ...metrics, ...overrides }
}

function fakeDb(opts: { project?: unknown; rows?: unknown[]; projectError?: unknown; rowsError?: unknown }) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = []
  return {
    calls,
    from(table: string) {
      const rec = { table, ops: [] as Array<[string, unknown[]]> }
      calls.push(rec)
      const b: any = {
        select: (...a: unknown[]) => { rec.ops.push(['select', a]); return b },
        eq: (...a: unknown[]) => { rec.ops.push(['eq', a]); return b },
        order: (...a: unknown[]) => { rec.ops.push(['order', a]); return b },
        limit: async (...a: unknown[]) => {
          rec.ops.push(['limit', a])
          return { data: opts.rows ?? [], error: opts.rowsError ?? null }
        },
        maybeSingle: async () => ({
          data: 'project' in opts ? opts.project : { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG, atlas_mode: 'observer' },
          error: opts.projectError ?? null,
        }),
      }
      return b
    },
  }
}

describe('metric definitions', () => {
  it('cover exactly the 11 collector metrics, each with a Swedish label', () => {
    expect(MARKETPLACE_METRIC_DEFINITIONS.map((d) => d.key).sort()).toEqual([...MARKETPLACE_METRIC_KEYS].sort())
    expect(MARKETPLACE_METRIC_DEFINITIONS).toHaveLength(11)
    for (const d of MARKETPLACE_METRIC_DEFINITIONS) expect(d.label).toMatch(/[A-Za-zÅÄÖåäö]/)
  })
  it('selects named columns only', () => {
    expect(SNAPSHOT_SELECT_COLUMNS).not.toContain('*')
    for (const key of MARKETPLACE_METRIC_KEYS) expect(SNAPSHOT_SELECT_COLUMNS).toContain(key)
  })
})

describe('buildMarketplaceReport', () => {
  it('presents the latest complete snapshot with all 11 values from the row', () => {
    const report = buildMarketplaceReport([row()], NOW)
    expect(report.state).toBe('ok')
    expect(report.latest?.completeness).toBe('complete')
    expect(report.latest?.availableCount).toBe(11)
    expect(report.latest?.metrics.map((m) => m.value)).toEqual(MARKETPLACE_METRIC_KEYS.map((_, i) => 100 + i))
    expect(report.latest?.freshness).toBe('fresh')
  })

  it('keeps an unavailable metric null with its reason, never 0', () => {
    const r = row(
      { completeness: 'partial', unavailable: { bids_total: 'query_failed' } },
      { bids_total: null },
    )
    const report = buildMarketplaceReport([r], NOW)
    const bids = report.latest!.metrics.find((m) => m.key === 'bids_total')!
    expect(bids.value).toBeNull()
    expect(bids.reasonLabel).toBe('Kunde inte beräknas hos Handlarbörsen')
    expect(report.latest?.completeness).toBe('partial')
    expect(report.latest?.unavailableCount).toBe(1)
  })

  it('a genuine zero stays a zero', () => {
    const report = buildMarketplaceReport([row({}, { bids_total: 0 })], NOW)
    expect(report.latest!.metrics.find((m) => m.key === 'bids_total')!.value).toBe(0)
  })

  it('reports no_snapshot for an empty table without inventing values', () => {
    const report = buildMarketplaceReport([], NOW)
    expect(report.state).toBe('no_snapshot')
    expect(report.latest).toBeNull()
    expect(renderHandlarborsenFactBlock(report)).toBeNull()
  })

  it.each([
    ['wrong project', { project_id: '00000000-0000-0000-0000-000000000001' }],
    ['wrong schema', { schema_version: 2 }],
    ['wrong window', { window_hours: 12 }],
    ['bad completeness', { completeness: 'full' }],
    ['complete but a metric is null', {}],
    ['bad observed_at', { observed_at: 'yesterday' }],
    ['negative count', {}],
    ['fractional count', {}],
  ])('rejects a corrupt latest row (%s) and shows nothing', (name, overrides) => {
    const metrics: Partial<Record<MarketplaceMetricKey, number | null>> =
      name === 'complete but a metric is null' ? { bids_total: null }
      : name === 'negative count' ? { bids_total: -1 }
      : name === 'fractional count' ? { bids_total: 1.5 }
      : {}
    const report = buildMarketplaceReport([row(overrides, metrics)], NOW)
    expect(report.state).toBe('invalid_snapshot')
    expect(report.latest).toBeNull()
    expect(renderHandlarborsenFactBlock(report)).toBeNull()
  })

  it('does not fall back to an older snapshot when the newest one is corrupt', () => {
    const report = buildMarketplaceReport(
      [row({ snapshot_date: '2026-10-09' }), row({ snapshot_date: '2026-10-10', schema_version: 9 })],
      NOW,
    )
    expect(report.state).toBe('invalid_snapshot')
    expect(report.latest).toBeNull()
  })

  it('flags a report older than the freshness window as stale', () => {
    const later = new Date(Date.parse('2026-10-10T10:22:00.000Z') + (STALE_AFTER_HOURS + 1) * 3_600_000)
    expect(buildMarketplaceReport([row()], later).latest?.freshness).toBe('stale')
  })
})

describe('history and comparison', () => {
  it('with a single snapshot there is no comparison and no claim of change', () => {
    const report = buildMarketplaceReport([row()], NOW)
    expect(report.history.snapshotCount).toBe(1)
    expect(report.history.comparison).toEqual({ available: false, reason: 'no_previous_snapshot' })
    const text = renderHandlarborsenFactBlock(report)!
    expect(text).toContain('Ingen tidigare rapport finns')
    expect(text).toContain('INTE påstå')
    expect(text).not.toMatch(/\+\d|ökat med|minskat med/)
  })

  it('computes deltas for totals and current levels only, never for 24 h windows', () => {
    const report = buildMarketplaceReport(
      [
        row({ snapshot_date: '2026-10-09' }, { companies_registered_total: 8, bids_last_24h: 1 }),
        row({ snapshot_date: '2026-10-10' }, { companies_registered_total: 10, bids_last_24h: 5 }),
      ],
      NOW,
    )
    const c = report.history.comparison
    expect(c.available).toBe(true)
    if (!c.available) return
    expect(c.previousDate).toBe('2026-10-09')
    expect(c.daysBetween).toBe(1)
    expect(c.deltas.companies_registered_total).toBe(2)
    expect('bids_last_24h' in c.deltas).toBe(false)
  })

  it('skips a delta when either side is unavailable', () => {
    const report = buildMarketplaceReport(
      [
        row({ snapshot_date: '2026-10-09', completeness: 'partial' }, { bids_total: null }),
        row({ snapshot_date: '2026-10-10' }, { bids_total: 7 }),
      ],
      NOW,
    )
    const c = report.history.comparison
    expect(c.available && 'bids_total' in c.deltas).toBe(false)
  })

  it('counts and skips invalid older rows without breaking the latest', () => {
    const report = buildMarketplaceReport(
      [row({ snapshot_date: '2026-10-10' }), row({ snapshot_date: '2026-10-08', schema_version: 3 })],
      NOW,
    )
    expect(report.state).toBe('ok')
    expect(report.history.skippedInvalid).toBe(1)
    expect(report.history.comparison.available).toBe(false)
  })
})

describe('Atlas fact block', () => {
  it('lists all 11 metrics in Swedish with the quality line, from stored values', () => {
    const text = renderHandlarborsenFactBlock(buildMarketplaceReport([row()], NOW))!
    expect(text).toContain(FACT_BLOCK_HEADER)
    for (const def of MARKETPLACE_METRIC_DEFINITIONS) expect(text).toContain(`- ${def.label}: `)
    expect(text).toContain('komplett — 11 av 11 mätvärden')
    expect(text).toContain('observer')
  })

  it('renders an unavailable metric as Okänt with the reason, not 0', () => {
    const r = row({ completeness: 'partial', unavailable: { offers_last_24h: 'invalid_count' } }, { offers_last_24h: null })
    const text = renderHandlarborsenFactBlock(buildMarketplaceReport([r], NOW))!
    expect(text).toContain('- Erbjudanden senaste 24 h: Okänt (Ogiltigt värde från källan)')
    expect(text).toContain('"Okänt" är inte noll')
  })

  it('warns when the report is stale', () => {
    const later = new Date(Date.parse('2026-10-10T10:22:00.000Z') + 48 * 3_600_000)
    expect(renderHandlarborsenFactBlock(buildMarketplaceReport([row()], later))!).toContain('kan vara inaktuell')
  })

  it('states deltas only when a previous report exists', () => {
    const text = renderHandlarborsenFactBlock(buildMarketplaceReport(
      [row({ snapshot_date: '2026-10-09' }, { companies_registered_total: 8 }), row({}, { companies_registered_total: 10 })],
      NOW,
    ))!
    expect(text).toContain('Jämförelse mot rapporten 2026-10-09')
    expect(text).toContain('- Registrerade företag: +2')
    expect(text).not.toContain('Ingen tidigare rapport finns')
  })
})

describe('loadHandlarborsenMarketplaceReport — authorization', () => {
  const project = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG }

  it.each([
    ['empty allow-list', project, []],
    ['project outside the allow-list', project, ['11111111-1111-1111-1111-111111111111']],
    ['another project id', { id: '11111111-1111-1111-1111-111111111111', slug: 'handlarborsen' }, ['11111111-1111-1111-1111-111111111111']],
    ['right id, wrong slug', { id: HANDLARBORSEN_PROJECT_ID, slug: 'familje-stunden' }, [HANDLARBORSEN_PROJECT_ID]],
  ])('refuses %s without creating a client or reading', async (_n, p, allowed) => {
    adminCreated.mockClear()
    const db = fakeDb({})
    const result = await loadHandlarborsenMarketplaceReport(p, { allowedProjectIds: allowed }, { db })
    expect(result).toEqual({ status: 'not_permitted' })
    expect(db.calls).toHaveLength(0)
    expect(adminCreated).not.toHaveBeenCalled()
  })

  it('reads only the fixed project, with named columns, newest first, bounded', async () => {
    const db = fakeDb({ rows: [row()] })
    const result = await loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] }, { db, now: NOW })
    expect(result.status).toBe('ok')
    const snap = db.calls.find((c) => c.table === 'handlarborsen_marketplace_snapshots')!
    expect(snap.ops).toContainEqual(['eq', ['project_id', HANDLARBORSEN_PROJECT_ID]])
    expect(snap.ops).toContainEqual(['order', ['snapshot_date', { ascending: false }]])
    expect(snap.ops.find(([op]) => op === 'limit')?.[1]).toEqual([30])
    expect(JSON.stringify(snap.ops.find(([op]) => op === 'select'))).not.toContain('*')
  })

  it('reads nothing from the snapshots table when the project is not observer/active', async () => {
    const db = fakeDb({ project: { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG, atlas_mode: 'paused' }, rows: [row()] })
    const result = await loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] }, { db })
    expect(result.status === 'ok' && result.report.state).toBe('not_enabled')
    expect(db.calls.map((c) => c.table)).toEqual(['projects'])
  })

  it('reports read_failed (not zeros) when the read errors, without leaking the error text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const db = fakeDb({ rowsError: { code: '42501', message: 'permission denied for table secret_stuff' } })
    const result = await loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] }, { db })
    expect(result.status === 'ok' && result.report.state).toBe('read_failed')
    expect(result.status === 'ok' && result.report.latest).toBeNull()
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret_stuff')
    spy.mockRestore()
  })
})

describe('readHandlarborsenFactBlock — Atlas reader', () => {
  const req = (over: Record<string, unknown> = {}) => ({
    scope: 'project', projectId: HANDLARBORSEN_PROJECT_ID, intents: [],
    window: { since: '', until: '' }, modality: 'chat', outputBudget: 1, ...over,
  }) as any

  it('returns a block for a project-scoped Handlarbörsen request inside the allow-list', async () => {
    const db = fakeDb({ rows: [row()] })
    const block = await readHandlarborsenFactBlock(req(), { db, allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] }, NOW)
    expect(block?.text).toContain(FACT_BLOCK_HEADER)
    expect(block?.meta).toEqual({ snapshotDate: '2026-10-10', completeness: 'complete', comparisonAvailable: false })
  })

  it.each([
    ['global scope', req({ scope: 'global', projectId: null }), [HANDLARBORSEN_PROJECT_ID]],
    ['another project', req({ projectId: '11111111-1111-1111-1111-111111111111' }), [HANDLARBORSEN_PROJECT_ID]],
    ['not in the allow-list', req(), []],
  ])('contributes nothing for %s', async (_n, request, allowed) => {
    const db = fakeDb({ rows: [row()] })
    expect(await readHandlarborsenFactBlock(request, { db, allowedProjectIds: allowed })).toBeNull()
    expect(db.calls).toHaveLength(0)
  })

  it('contributes nothing (not zeros) when no verified report exists, and never throws', async () => {
    expect(await readHandlarborsenFactBlock(req(), { db: fakeDb({ rows: [] }), allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] })).toBeNull()
    const exploding = { from() { throw new Error('boom') } }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await readHandlarborsenFactBlock(req(), { db: exploding, allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] })).toBeNull()
  })
})

describe('read-only boundary (source scan)', () => {
  const root = join(__dirname, '..', '..')
  const files = [
    'lib/atlas/project-analytics/handlarborsen-marketplace-read.ts',
    'lib/atlas/project-analytics/handlarborsen-marketplace-report.ts',
    'app/(platform)/projects/[slug]/marketplace/page.tsx',
    'components/platform/vnext/HandlarborsenMarketplaceReport.tsx',
  ]
  const sources = files.map((f) => ({ f, s: readFileSync(join(root, f), 'utf8') }))

  it('never writes, deletes, calls RPCs, or fetches', () => {
    for (const { f, s } of sources) {
      expect(s, f).not.toMatch(/\.(insert|upsert|update|delete|rpc)\(/)
      expect(s, f).not.toMatch(/\bfetch\(/)
    }
  })
  it('the page and component never touch the admin client or the table directly', () => {
    for (const { f, s } of sources.filter(({ f }) => f.endsWith('.tsx'))) {
      expect(s, f).not.toMatch(/createAdminClient|handlarborsen_marketplace_snapshots/)
    }
  })
  it('hardcodes none of the example statistics', () => {
    for (const { f, s } of sources) expect(s, f).not.toMatch(/\b10 registrerade|"?companies_registered_total"?\s*[:=]\s*\d/)
  })
})
