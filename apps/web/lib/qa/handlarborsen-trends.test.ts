import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
;(globalThis as unknown as { React: typeof React }).React = React
vi.mock('server-only', () => ({}))

import {
  HANDLARBORSEN_PROJECT_ID,
  MARKETPLACE_METRIC_KEYS,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { buildMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  buildHandlarborsenTrendPanels,
  trendLineSegments,
  TREND_HISTORY_DAYS,
} from '@/lib/atlas/project-analytics/handlarborsen-trends'
import { HandlarborsenTrends } from '@/components/platform/vnext/HandlarborsenTrends'

const NOW = new Date('2026-10-11T12:00:00Z')
const base: Record<string, number | null> = {
  companies_registered_total: 10,
  companies_verified_total: 6,
  vehicles_published_active: 2,
  vehicles_reserved: 2,
  vehicles_published_last_24h: 1,
  bids_total: 2,
  bids_last_24h: 0,
  interests_last_24h: 0,
  offers_last_24h: 0,
  deals_completed_total: 2,
  deals_completed_last_24h: 0,
}
function snap(date = '2026-10-10', overrides: Record<string, unknown> = {}) {
  return {
    project_id: HANDLARBORSEN_PROJECT_ID,
    snapshot_date: date,
    observed_at: date + 'T10:22:48.000Z',
    captured_at: date + 'T10:22:48.000Z',
    schema_version: 1,
    window_hours: 24,
    completeness: 'complete',
    unavailable: {},
    ...Object.fromEntries(
      MARKETPLACE_METRIC_KEYS.map((key) => [key, base[key]]),
    ),
    ...overrides,
  }
}
const report = (rows: unknown[] = [snap()]) =>
  buildMarketplaceReport(rows, NOW, [])
const html = (rows: unknown[] = [snap()]) =>
  renderToStaticMarkup(
    createElement(HandlarborsenTrends, { report: report(rows) }),
  )

describe('Handlarbörsen read-only trend charts', () => {
  it('uses only the six stored stock/cumulative counts, not 24-hour windows', () => {
    const panels = buildHandlarborsenTrendPanels(report())
    expect(panels).toHaveLength(3)
    expect(panels.map((p) => p.id)).toEqual([
      'companies',
      'vehicles',
      'trading',
    ])
    expect(panels.flatMap((p) => [p.first.key, p.second.key])).toEqual([
      'companies_registered_total',
      'companies_verified_total',
      'vehicles_published_active',
      'vehicles_reserved',
      'bids_total',
      'deals_completed_total',
    ])
    expect(panels.map((p) => p.observations[0])).toEqual([
      { date: '2026-10-10', first: 10, second: 6 },
      { date: '2026-10-10', first: 2, second: 2 },
      { date: '2026-10-10', first: 2, second: 2 },
    ])
  })

  it('renders attractive single-date bars, not fabricated historical lines', () => {
    const out = html()
    expect(out).toContain('Utveckling och nuläge')
    expect(out).toContain('Ännu finns bara en dagsrapport')
    expect(out).toContain('Senaste dagsrapport')
    expect(out).toContain('width:100%')
    expect(out).toContain('width:60%')
    expect(out).toContain('Registrerade totalt')
    expect(out).not.toContain('Historiska mätpunkter')
    expect(out).not.toContain('<svg')
    expect(out.match(/<time\b/g)).toHaveLength(1)
    expect(out).toMatch(/datetime="2026-10-10"/i)
    expect(out).toContain('En faktisk observation')
    expect(out).toContain('En andra verifierad, sparad UTC-dagsrapport')
    expect(out).not.toContain('2026-10-11')
    expect(out).not.toMatch(/konverteringsgrad|MRR|SEK/)
  })

  it('renders real points after two distinct stored dates, and a table of exact values', () => {
    const rows = [
      snap('2026-10-11', { companies_registered_total: 13, bids_total: 4 }),
      snap('2026-10-10'),
    ]
    const panels = buildHandlarborsenTrendPanels(report(rows))
    expect(panels[0].mode).toBe('history')
    expect(panels[0].observations.map((r) => r.date)).toEqual([
      '2026-10-10',
      '2026-10-11',
    ])
    const out = html(rows)
    expect(out).toContain('Historiska mätpunkter')
    expect(out.match(/<svg\b/g)).toHaveLength(3)
    expect(out.match(/<circle\b/g)).toHaveLength(12)
    expect(out).not.toContain('hb-history-empty')
    expect(out).toContain('Visa exakta historiska värden')
    expect(out).toContain('2026-10-10')
    expect(out).toContain('2026-10-11')
    expect(out).toContain('13')
    expect(out).toContain('4')
  })

  it('does not connect unknown metric values or absent calendar days', () => {
    const obs = [
      { date: '2026-10-01', first: 0, second: 2 },
      { date: '2026-10-02', first: null, second: 3 },
      { date: '2026-10-05', first: 4, second: 4 },
      { date: '2026-10-06', first: 7, second: null },
      { date: '2026-10-07', first: 0, second: 1 },
    ]
    expect(trendLineSegments(obs, 'first')).toEqual([
      [2, 3],
      [3, 4],
    ]) // true zero is valid
    expect(trendLineSegments(obs, 'second')).toEqual([[0, 1]])
    const rows = [
      snap('2026-10-11', {
        completeness: 'partial',
        bids_total: null,
        unavailable: { bids_total: 'query_failed' },
      }),
    ]
    expect(
      buildHandlarborsenTrendPanels(report(rows))[2].observations[0].first,
    ).toBeNull()
    const out = html(rows)
    expect(out).toContain('Okänt')
    expect(out).toContain('Värde saknas')
    expect(out).toContain('2')
  })

  it('caps and preserves only actual dates without interpolating missing days', () => {
    const rows = Array.from({ length: 22 }, (_, i) =>
      snap(new Date(Date.UTC(2026, 9, 10 - i)).toISOString().slice(0, 10)),
    )
    const panels = buildHandlarborsenTrendPanels(report(rows))
    expect(panels[0].observations).toHaveLength(TREND_HISTORY_DAYS)
    expect(panels[0].observations.at(-1)?.date).toBe('2026-10-10')
    expect(panels[0].observations[0].date).toBe('2026-09-27')
  })

  it('refuses to render a chart when the newest snapshot cannot be verified', () => {
    expect(buildHandlarborsenTrendPanels(report([]))).toEqual([])
    expect(html([])).toBe('')
    expect(html([snap('2026-10-10', { companies_registered_total: -1 })])).toBe(
      '',
    )
  })

  it('is a server-only projection without a new client bundle or source queries', () => {
    const read = (name: string) =>
      readFileSync(resolve(__dirname, '../..', name), 'utf8')
    const component = read('components/platform/vnext/HandlarborsenTrends.tsx')
    const model = read('lib/atlas/project-analytics/handlarborsen-trends.ts')
    expect(component).not.toContain("'use client'")
    expect(component).toContain('buildHandlarborsenTrendPanels(report)')
    for (const source of [component, model]) {
      expect(source).not.toMatch(
        /createAdminClient|\.from\(|fetch\(|supabase|Math\.random|setInterval/,
      )
    }
  })
})
