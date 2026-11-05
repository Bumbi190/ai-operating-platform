import { describe, expect, it } from 'vitest'
import { deriveHandlarborsenGrowthBrief } from '@/lib/atlas/project-analytics/handlarborsen-growth-brief'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'

const now = new Date('2026-11-04T20:00:00.000Z')
function report(registered: number | null, verified: number | null, observedAt = '2026-11-04T06:55:00.000Z', dataScope = 'production_excluding_quarantined_test'): MarketplaceReport {
  return {
    state: 'ok',
    latest: {
      observedAt,
      freshness: 'fresh',
      dataScope,
      metrics: [
        { key: 'companies_registered_total', value: registered },
        { key: 'companies_verified_total', value: verified },
      ],
    },
  } as MarketplaceReport
}
const traffic: HandlarborsenTraffic = {
  status: 'available', days: [], totalPageviews: 2, visitorsToday: 1,
  registrationPageviews: 0, checkedAt: '2026-11-04T16:00:00.000Z',
  firstDate: '2026-10-29', lastDate: '2026-11-04',
}

describe('Nova growth brief — evidence-only, read-only', () => {
  it('produces grounded manual review notes with separate sources, not a conversion ratio', () => {
    const result = deriveHandlarborsenGrowthBrief(report(10, 3), traffic, now)
    expect(result.status).toBe('review')
    expect(result.observations).toHaveLength(2)
    expect(result.provenance).toHaveLength(2)
    expect(result.checks.some(x => x.includes('väntande företagsverifieringar'))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/konverteringsgrad på|%/)
  })
  it('interprets zero pageviews as a measurement check rather than lack of interest', () => {
    const result = deriveHandlarborsenGrowthBrief(report(10, 3), traffic, now)
    expect(result.checks.some(x => x.includes('noll visningar bevisar inte'))).toBe(true)
  })
  it('blocks stale or legacy business data and unverified counts', () => {
    expect(deriveHandlarborsenGrowthBrief(report(10, 3, '2026-11-01T06:55:00.000Z'), traffic, now).status).toBe('insufficient_data')
    expect(deriveHandlarborsenGrowthBrief(report(10, 3, '2026-11-04T06:55:00.000Z', 'legacy_all_organisations'), traffic, now).status).toBe('insufficient_data')
    expect(deriveHandlarborsenGrowthBrief(report(2, 3), traffic, now).status).toBe('insufficient_data')
  })
  it('fails closed for missing PostHog and avoids a fabricated registration observation', () => {
    const result = deriveHandlarborsenGrowthBrief(report(10, 3), null, now)
    expect(result.status).toBe('insufficient_data')
    expect(result.observations.some(x => x.includes('Registreringssidan visades'))).toBe(false)
  })
})
