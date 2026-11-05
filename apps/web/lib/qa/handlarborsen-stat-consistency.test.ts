import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { registrationJourneySteps, HandlarborsenRegistrationJourney } from '@/components/platform/vnext/HandlarborsenRegistrationJourney'
import { HandlarborsenMarketplaceReport } from '@/components/platform/vnext/HandlarborsenMarketplaceReport'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
import { deriveHandlarborsenGrowthBrief } from '@/lib/atlas/project-analytics/handlarborsen-growth-brief'
import { buildMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { HANDLARBORSEN_PROJECT_ID, MARKETPLACE_METRIC_KEYS } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type { RealDealerMetricsV3 } from '@/lib/atlas/project-analytics/handlarborsen-real-dealer-v3'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'

;(globalThis as unknown as { React: typeof React }).React = React
const now = new Date('2026-11-05T12:00:00Z')
const real: RealDealerMetricsV3 = { status: 'available', observedAt: '2026-11-05T11:59:00Z', registered: 1, verified: 1, testOrganisations: 8, internalOrganisations: 2, unclassifiedOrganisations: 0 }
const traffic: HandlarborsenTraffic = { status: 'available', days: [], totalPageviews: 2, registrationPageviews: 0, visitorsToday: 0, checkedAt: now.toISOString(), firstDate: '2026-10-30', lastDate: '2026-11-05' }
function report(production = false) {
  const row: Record<string, unknown> = { project_id: HANDLARBORSEN_PROJECT_ID, snapshot_date: '2026-11-05', observed_at: '2026-11-05T06:55:00Z', captured_at: '2026-11-05T06:55:01Z', schema_version: production ? 2 : 1, window_hours: 24, completeness: 'complete', unavailable: {} }
  if (production) Object.assign(row, { definition_id: 'handlarborsen-production-v2', data_scope: 'production_excluding_quarantined_test', excluded_test_organisations: 8 })
  for (const key of MARKETPLACE_METRIC_KEYS) row[key] = 0
  row.companies_registered_total = 11
  row.companies_verified_total = 3
  return buildMarketplaceReport([row], now)
}

describe('classified v3 population is consistent across statistics views', () => {
  it('uses v3 rather than the old 11/3 population in the registration view', () => {
    expect(registrationJourneySteps(report(), traffic, real, now).map(x => x.value)).toEqual([0, 1, 1])
    const html = renderToStaticMarkup(createElement(HandlarborsenRegistrationJourney, { report: report(), traffic, realDealerMetrics: real, now }))
    expect(html).toContain('Riktiga externa handlare')
    expect(html).toContain('classified_real_external_dealers')
    expect(html).not.toContain('produktionssnapshot innehåller')
    expect(html).not.toContain('konverteringsgrad på')
  })
  it('does not fall back to v2 counts when the v3 source is unavailable', () => {
    expect(registrationJourneySteps(report(true), traffic, { status: 'unavailable', reason: 'source_unavailable' }, now).map(x => x.value)).toEqual([0, null, null])
  })
  it.each([
    { ...real, observedAt: '2026-11-01T12:00:00Z' },
    { ...real, registered: 1, verified: 2 },
    { ...real, observedAt: '2026-11-05T13:00:00Z' },
  ])('does not present stale or invalid v3 counts as current', data => {
    expect(registrationJourneySteps(report(true), traffic, data, now).map(x => x.value)).toEqual([0, null, null])
  })
  it('uses v3 evidence for the review brief without inventing pending applicants', () => {
    const result = deriveHandlarborsenGrowthBrief(report(), traffic, now, real)
    expect(result.status).toBe('review')
    expect(result.observations.join(' ')).toContain('1 registrerade och 1 verifierade')
    expect(result.provenance.join(' ')).toContain('classified_real_external_dealers')
    expect(result.checks.join(' ')).not.toContain('väntande företagsverifieringar')
  })
  it('shows the classified population above a clearly labelled historical report', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenMarketplaceReport, { slug: 'handlarborsen', name: 'Handlarbörsen', report: report(), realDealerMetrics: real }))
    expect(html).toContain('Riktiga handlare – separat från testdata')
    expect(html).toContain('Testdata ingår')
    expect(html).toContain('Historiskt revisionsunderlag')
    expect(html.indexOf('Riktiga handlare')).toBeLessThan(html.indexOf('Historiskt revisionsunderlag'))
    expect(html).toContain('Registrerade företag')
    expect(html).toContain('>11<')
    expect(html).not.toContain('>110<')
  })
})

describe('statistics composition', () => {
  it('forwards the owner v3 read into the journey as well as the top KPI panel', () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenOverview, { report: report(), reportHref: '/projects/handlarborsen/marketplace', realDealerMetrics: real, traffic, now }))
    const journey = html.slice(html.indexOf('id="hb-registration-journey-title"'))
    expect(journey).toContain('Riktiga externa handlare')
    expect(journey).toContain('classified_real_external_dealers')
    expect(journey).not.toContain('verifierad produktionsrapport saknas')
  })
  it('retains real zero v3 values without borrowing a nonzero historical total', () => {
    expect(registrationJourneySteps(report(true), traffic, { ...real, registered: 0, verified: 0 }, now).map(x => x.value)).toEqual([0, 0, 0])
  })
  it('keeps a missing historical report independent of an available v3 source', () => {
    const missing = buildMarketplaceReport([], now)
    const html = renderToStaticMarkup(createElement(HandlarborsenMarketplaceReport, { slug: 'handlarborsen', name: 'Handlarbörsen', report: missing, realDealerMetrics: real }))
    expect(html).toContain('Riktiga externa handlare')
    expect(html).toContain('>1</strong>')
    expect(html).not.toContain('>11<')
  })
})
