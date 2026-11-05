import type { MarketplaceReport } from './handlarborsen-marketplace-report'
import type { RealDealerMetricsV3 } from './handlarborsen-real-dealer-v3'

export function safeCompanyCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** Explicit v3 selection never falls back to the older snapshot population.
 * Omitted v3 preserves the existing collaborator snapshot view.
 */
export function companyPopulation(
  report: MarketplaceReport,
  now: Date,
  realDealerMetrics?: RealDealerMetricsV3 | null,
) {
  const empty = { registered: null, verified: null, observedAt: null, scope: null, fresh: false } as const
  if (realDealerMetrics !== undefined) {
    if (realDealerMetrics?.status !== 'available') return empty
    const age = now.getTime() - Date.parse(realDealerMetrics.observedAt)
    const registered = safeCompanyCount(realDealerMetrics.registered)
    const verified = safeCompanyCount(realDealerMetrics.verified)
    if (!Number.isFinite(age) || age < -60_000 || age > 26 * 60 * 60 * 1000 ||
      registered === null || verified === null || verified > registered) return empty
    return { registered, verified, observedAt: realDealerMetrics.observedAt,
      scope: 'classified_real_external_dealers', fresh: true }
  }
  const latest = report.state === 'ok' && report.latest?.dataScope === 'production_excluding_quarantined_test'
    ? report.latest : null
  if (!latest) return empty
  const registered = safeCompanyCount(latest.metrics.find(x => x.key === 'companies_registered_total')?.value)
  const sourceVerified = safeCompanyCount(latest.metrics.find(x => x.key === 'companies_verified_total')?.value)
  const verified = registered !== null && sourceVerified !== null && sourceVerified <= registered ? sourceVerified : null
  const age = now.getTime() - Date.parse(latest.observedAt)
  return { registered, verified, observedAt: latest.observedAt, scope: latest.dataScope,
    fresh: Number.isFinite(age) && age >= 0 && age <= 26 * 60 * 60 * 1000 && latest.freshness === 'fresh' }
}
