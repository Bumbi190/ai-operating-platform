import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('No DB reads permitted in visual tests')
  },
}))

import {
  HANDLARBORSEN_PROJECT_ID,
  MARKETPLACE_METRIC_KEYS,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { buildMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { buildHandlarborsenVisualPulse } from '@/lib/atlas/project-analytics/handlarborsen-visual-pulse'
import { HandlarborsenVisualPulse } from '@/components/platform/vnext/HandlarborsenVisualPulse'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'

const NOW = new Date('2026-10-11T12:00:00.000Z')
const basicMetrics: Record<string, number | null> = {
  companies_registered_total: 10,
  companies_verified_total: 6,
  vehicles_published_active: 2,
  vehicles_reserved: 2,
  vehicles_published_last_24h: 0,
  bids_total: 2,
  bids_last_24h: 0,
  interests_last_24h: 0,
  offers_last_24h: 0,
  deals_completed_total: 2,
  deals_completed_last_24h: 0,
}

function snapshot(
  date = '2026-10-11',
  observedAt = '2026-10-11T07:00:00.000Z',
  changes: Record<string, unknown> = {},
) {
  const metrics = Object.fromEntries(
    MARKETPLACE_METRIC_KEYS.map((key) => [key, basicMetrics[key]]),
  )
  return {
    project_id: HANDLARBORSEN_PROJECT_ID,
    snapshot_date: date,
    observed_at: observedAt,
    captured_at: observedAt,
    schema_version: 1,
    window_hours: 24,
    completeness: 'complete',
    unavailable: {},
    ...metrics,
    ...changes,
  }
}

const report = (rows = [snapshot()], now = NOW, runs: unknown[] = []) =>
  buildMarketplaceReport(rows, now, runs)

const html = (rows = [snapshot()], now = NOW) =>
  renderToStaticMarkup(
    createElement(HandlarborsenOverview, {
      report: report(rows, now),
      reportHref: '/projects/handlarborsen/marketplace',
    }),
  )

describe('Handlarbörsen visual pulse — verified read-only representation', () => {
  it('maps the six stored stock/cumulative values without fabricating conversion rates', () => {
    const model = buildHandlarborsenVisualPulse(report())!
    expect(model.stages.map((s) => s.title)).toEqual([
      'Företag',
      'Fordon',
      'Handel',
    ])
    expect(model.stages.map((s) => [s.main.value, s.secondary.value])).toEqual([
      [10, 6],
      [2, 2],
      [2, 2],
    ])
    expect(model.snapshotDate).toBe('2026-10-11')
    expect(model.availableCount).toBe(11)
    expect(html()).toContain('inte en uppmätt kundresa eller konvertering')
    expect(html()).not.toContain('konverteringsgrad')
  })

  it('keeps legacy proposals out of Marknadspuls while Atlas retains its manual analysis', () => {
    const model = buildHandlarborsenVisualPulse(report())!
    expect(model.suggestions.map((p) => p.id)).toEqual([
      'history',
      'verification',
      'bids',
    ])
    expect(
      model.suggestions.every(
        (p) => p.evidence.length > 0 && p.nextStep.length > 0,
      ),
    ).toBe(true)
    const out = html()
    const pulse = renderToStaticMarkup(
      createElement(HandlarborsenVisualPulse, {
        report: report(),
        reportHref: '/projects/handlarborsen/marketplace',
      }),
    )
    expect(pulse).not.toContain('Förslag att granska')
    expect(pulse).not.toContain('data-priority=')
    expect(pulse).not.toContain('Förslag:')
    expect(pulse).toContain('Rapport 2026-10-11')
    expect(pulse).toContain('11/11')
    expect(pulse).toContain('Registrerade totalt')
    expect(out).toContain('Atlas Intelligence')
    expect(out).not.toContain('Atlas har beslutat')
  })

  it('prioritizes failed/stale reads and missing values over commercial suggestions', () => {
    const rows = [
      snapshot('2026-10-11', '2026-10-11T07:00:00.000Z', {
        completeness: 'partial',
        bids_total: null,
        unavailable: { bids_total: 'query_failed' },
      }),
    ]
    const late = new Date('2026-10-13T12:00:00.000Z')
    const run = {
      status: 'error',
      ran_at: '2026-10-13T07:00:00.000Z',
      snapshot_date: '2026-10-13',
      storage_outcome: null,
    }
    const model = buildHandlarborsenVisualPulse(report(rows, late, [run]))!
    expect(model.suggestions.map((s) => s.id)).toEqual([
      'collection',
      'quality',
      'history',
    ])
    expect(model.suggestions[0].priority).toBe('check')
    expect(model.stages[2].main).toMatchObject({
      value: null,
      reason: 'Kunde inte beräknas hos Handlarbörsen',
    })
    const out = renderToStaticMarkup(
      createElement(HandlarborsenOverview, {
        report: report(rows, late, [run]),
        reportHref: null,
      }),
    )
    expect(out).toContain('Okänt')
    expect(out).toContain('Kunde inte beräknas')
    expect(out).not.toContain('Öppna underliggande statistikrapport')
  })

  it('never claims a change or generates a chart from one saved day', () => {
    const out = html()
    expect(out).toContain(
      'Förändringar över tid kan visas först efter fler sparade dagsrapporter',
    )
    expect(out).not.toContain('ökade med')
    expect(out).not.toContain('<canvas')
  })

  it('does not suggest a verification gap when verified equals total, or a missing bid when there are bids', () => {
    const a = snapshot('2026-10-11', '2026-10-11T07:00:00.000Z', {
      companies_verified_total: 10,
      bids_last_24h: 2,
    })
    const b = snapshot('2026-10-10', '2026-10-10T07:00:00.000Z', {
      companies_verified_total: 10,
      bids_last_24h: 1,
    })
    const model = buildHandlarborsenVisualPulse(report([a, b]))!
    expect(model.suggestions.map((s) => s.id)).toEqual(['follow-up'])
    expect(model.historyCount).toBe(2)
  })

  it('does not render a visual pulse at all when the stored report is missing or invalid', () => {
    expect(buildHandlarborsenVisualPulse(report([]))).toBeNull()
    expect(
      buildHandlarborsenVisualPulse(
        report([
          snapshot('2026-10-11', '2026-10-11T07:00:00.000Z', {
            companies_registered_total: -7,
          }),
        ]),
      ),
    ).toBeNull()
    const out = html([])
    expect(out).not.toContain('Marknadspuls')
    expect(out).toContain('Ingen rapport')
  })
})

describe('Handlarborsen overview hierarchy', () => {
  it('places charts after KPI and before secondary pulse, collapsing only the breakdown', () => {
    const out = html()
    expect(out.indexOf('id="hb-overview"')).toBeLessThan(out.indexOf('id="hb-trend-heading"'))
    expect(out.indexOf('id="hb-trend-heading"')).toBeLessThan(out.indexOf('id="hb-market-pulse"'))
    const pulse = out.slice(out.indexOf('aria-labelledby="hb-market-pulse"')).split('</section>')[0]
    const disclosure = pulse.match(/<details\b[^>]*>[\s\S]*?<\/details>/)![0]
    expect(disclosure).not.toMatch(/<details[^>]*\bopen/)
    expect(disclosure.match(/data-stage=/g)).toHaveLength(3)
    expect(disclosure).not.toContain('data-priority=')
    expect(pulse).not.toContain('data-priority=')
    expect(pulse).toContain('href="/projects/handlarborsen/marketplace"')
  })
})
