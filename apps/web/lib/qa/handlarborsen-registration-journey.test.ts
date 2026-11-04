import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import { HandlarborsenRegistrationJourney, registrationJourneySteps } from '@/components/platform/vnext/HandlarborsenRegistrationJourney'

(globalThis as unknown as { React: typeof React }).React = React

const report = (registered: number | null, verified: number | null, scope = 'production_excluding_quarantined_test') => ({
  state: 'ok',
  latest: {
    dataScope: scope,
    observedAt: '2026-11-04T06:55:00.000Z',
    metrics: [
      { key: 'companies_registered_total', value: registered },
      { key: 'companies_verified_total', value: verified },
    ],
  },
}) as MarketplaceReport

const traffic = (count: number): HandlarborsenTraffic => ({
  status: 'available',
  days: [],
  totalPageviews: 25,
  registrationPageviews: count,
  visitorsToday: 2,
  checkedAt: '2026-11-04T15:00:00.000Z',
  firstDate: '2026-10-29',
  lastDate: '2026-11-04',
})

describe('Handlarbörsen registration journey', () => {
  it('shows separate sources and periods without inventing a conversion rate', () => {
    const steps = registrationJourneySteps(report(10, 3), traffic(5))
    expect(steps.map(step => step.value)).toEqual([5, 10, 3])
    expect(steps[0].note).toContain('7 UTC-dagar')
    expect(steps[1].note).toContain('2026-11-04')
    const html = renderToStaticMarkup(createElement(HandlarborsenRegistrationJourney, { report: report(10, 3), traffic: traffic(5) }))
    expect(html).toContain('Från intresse till verifierad handlare')
    expect(html).toContain('Ingen konverteringsgrad')
    expect(html).toContain('sidvisning är inte en person')
    expect(html).not.toContain('50 %')
  })

  it('does not replace missing traffic or counts with zeros', () => {
    const steps = registrationJourneySteps(report(null, null))
    expect(steps.map(step => step.value)).toEqual([null, null, null])
    const html = renderToStaticMarkup(createElement(HandlarborsenRegistrationJourney, { report: report(null, null) }))
    expect(html).toContain('—')
    expect(html).not.toContain('>0<')
  })

  it('does not compare legacy/test-inclusive company totals to production pageviews', () => {
    const steps = registrationJourneySteps(report(10, 2, 'legacy_all_organisations'), traffic(2))
    expect(steps.map(step => step.value)).toEqual([2, null, null])
  })

  it('rejects inconsistent or invalid company totals but keeps safe traffic', () => {
    expect(registrationJourneySteps(report(2, 3), traffic(0)).map(step => step.value)).toEqual([0, 2, null])
    expect(registrationJourneySteps(report(-1, 3), traffic(0)).map(step => step.value)).toEqual([0, null, null])
  })

  it('shows unavailable report values as unknown rather than claiming registrations', () => {
    const unavailable = { ...report(8, 3), state: 'read_failed', latest: null } as MarketplaceReport
    expect(registrationJourneySteps(unavailable, traffic(1)).map(step => step.value)).toEqual([1, null, null])
  })
})
