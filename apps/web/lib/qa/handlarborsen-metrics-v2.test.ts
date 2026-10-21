import { buildMarketplaceAnalysisSource } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-source'
import { afterEach, expect, it, vi } from 'vitest'
import {
  parseMarketplaceMetrics,
  MARKETPLACE_METRIC_KEYS,
  HANDLARBORSEN_PROJECT_ID,
  HandlarborsenMarketplaceCollector,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  buildMarketplaceReport,
  renderHandlarborsenFactBlock,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  buildHandlarborsenTrendPanels,
  trendLineSegments,
} from '@/lib/atlas/project-analytics/handlarborsen-trends'
const now = new Date('2026-10-17T12:00:00Z')
function wire() {
  return {
    status: 'ok',
    schema_version: 2,
    observed_at: now.toISOString(),
    window_hours: 24,
    data_scope: 'production_excluding_quarantined_test',
    definition_id: 'handlarborsen-production-v2',
    excluded_test_organisations: 2,
    metrics: Object.fromEntries(
      MARKETPLACE_METRIC_KEYS.map((k) => [k, { status: 'ok', value: 3 }]),
    ),
  }
}
function row(version: number, date: string) {
  return {
    project_id: HANDLARBORSEN_PROJECT_ID,
    snapshot_date: date,
    observed_at: date + 'T10:00:00.000Z',
    captured_at: date + 'T10:00:01.000Z',
    schema_version: version,
    window_hours: 24,
    completeness: 'complete',
    unavailable: {},
    ...Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((k) => [k, version === 2 ? 3 : 10])),
    ...(version === 2
      ? {
          definition_id: 'handlarborsen-production-v2',
          data_scope: 'production_excluding_quarantined_test',
          excluded_test_organisations: 2,
        }
      : {
          definition_id: 'handlarborsen-legacy-v1',
          data_scope: 'legacy_all_organisations',
          excluded_test_organisations: null,
        }),
  }
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
it('strictly decodes explicit v2 definition and keeps unavailable values null', () => {
  const value = wire()
  value.metrics.bids_total = { status: 'unavailable', value: null, reason: 'query_failed' } as never
  const parsed = parseMarketplaceMetrics(value, now.getTime())
  expect(parsed).toMatchObject({
    definitionId: 'handlarborsen-production-v2',
    dataScope: 'production_excluding_quarantined_test',
    excludedTestOrganisations: 2,
  })
  expect(parsed.metrics.bids_total).toBeNull()
})
it.each([
  { definition_id: 'other' },
  { data_scope: 'all' },
  { excluded_test_organisations: -1 },
  { unexpected: 'sensitive' },
])('rejects malformed definition metadata %s', (patch) => {
  expect(() => parseMarketplaceMetrics({ ...wire(), ...patch }, now.getTime())).toThrow()
})
it('mixed_definition_history_has_no_growth_delta and includes Swedish change marker', () => {
  const report = buildMarketplaceReport([row(2, '2026-10-17'), row(1, '2026-10-16')], now)
  expect(report.state).toBe('ok')
  const mixedHistory = report.history
  expect(mixedHistory.growthDelta).toBeNull()
  expect(mixedHistory.comparison).toMatchObject({ available: false, reason: 'definition_changed' })
  expect(renderHandlarborsenFactBlock(report)).toContain('Definitionen har ändrats')
  const panel = buildHandlarborsenTrendPanels(report)[0]
  expect(trendLineSegments(panel.observations, 'first')).toEqual([])
})
it('compares two production snapshots with the same definition normally', () => {
  const report = buildMarketplaceReport([row(2, '2026-10-17'), row(2, '2026-10-16')], now)
  expect(report.history.comparison).toMatchObject({
    available: true,
    deltas: { companies_registered_total: 0 },
  })
  expect(report.history.growthDelta).toBe(0)
})
it('stores simultaneous legacy and v2 observations without choosing the older same-day row', () => {
  const legacy = row(1, '2026-10-17'),
    production = row(2, '2026-10-17')
  const report = buildMarketplaceReport([legacy, production, row(1, '2026-10-16')], now)
  expect(report.latest).toMatchObject({ definitionId: 'handlarborsen-production-v2' })
  expect(report.history.growthDelta).toBeNull()
})
it('defaults collector to v1 until the explicit server-side switch', async () => {
  vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', 'x'.repeat(40))
  vi.stubEnv('HANDLARBORSEN_METRICS_SCHEMA_VERSION', '')
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(wire()), { status: 200 })),
    )
  vi.stubGlobal('fetch', fetch)
  const collector = new HandlarborsenMarketplaceCollector()
  await collector.fetch({
    projectId: HANDLARBORSEN_PROJECT_ID,
    projectSlug: 'handlarborsen',
  } as never)
  expect(fetch.mock.calls[0][0]).toBe('https://www.handlarborsen.se/api/internal/atlas-metrics')
  vi.stubEnv('HANDLARBORSEN_METRICS_SCHEMA_VERSION', '2')
  await collector.fetch({
    projectId: HANDLARBORSEN_PROJECT_ID,
    projectSlug: 'handlarborsen',
  } as never)
  expect(fetch.mock.calls[1][0]).toBe(
    'https://www.handlarborsen.se/api/internal/atlas-metrics?schema_version=2',
  )
})

it('preserves immutable v1 analysis-source binding when legacy metadata columns are selected', () => {
  const source = buildMarketplaceAnalysisSource(
    [{ id: 'e8000000-0000-4000-8000-000000000001', ...row(1, '2026-10-17') }],
    undefined,
  )
  expect(source).not.toBeNull()
  expect(source?.snapshots[0].schema_version).toBe(1)
})
it('never relabels production v2 as an immutable v1 analysis source', () => {
  expect(
    buildMarketplaceAnalysisSource(
      [{ id: 'e8000000-0000-4000-8000-000000000002', ...row(2, '2026-10-17') }],
      undefined,
    ),
  ).toBeNull()
})

it.each([3, null])(
  'does not call a changed or unavailable exclusion population growth (%s)',
  (excluded) => {
    const latest = { ...row(2, '2026-10-17'), excluded_test_organisations: excluded }
    const report = buildMarketplaceReport([latest, row(2, '2026-10-16')], now)
    expect(report.history.growthDelta).toBeNull()
    expect(report.history.comparison).toMatchObject({
      available: false,
      reason: 'exclusion_changed',
    })
    expect(renderHandlarborsenFactBlock(report)).toContain('Urvalet av testdata')
    const panel = buildHandlarborsenTrendPanels(report)[0]
    expect(trendLineSegments(panel.observations, 'first')).toEqual([])
  },
)
