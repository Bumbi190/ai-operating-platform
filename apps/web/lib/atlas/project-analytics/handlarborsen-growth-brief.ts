import type { MarketplaceReport } from './handlarborsen-marketplace-report'
import type { HandlarborsenTraffic } from './handlarborsen-posthog-traffic'

export type GrowthBrief = {
  status: 'review' | 'insufficient_data'
  headline: string
  observations: string[]
  checks: string[]
  provenance: string[]
}

/**
 * Pure, read-only preparation for a human-reviewed Nova growth report.
 * Two separate populations: consented pageviews in 7 UTC days vs cumulative
 * companies at an observed snapshot. Never infer a conversion percentage.
 */
export function deriveHandlarborsenGrowthBrief(
  report: MarketplaceReport,
  traffic: HandlarborsenTraffic | null | undefined,
  now: Date,
): GrowthBrief {
  const latest = report.state === 'ok' && report.latest?.dataScope === 'production_excluding_quarantined_test'
    ? report.latest
    : null
  const observedMs = latest ? Date.parse(latest.observedAt) : NaN
  const nowMs = now.getTime()
  const fresh = latest !== null && Number.isFinite(observedMs) && Number.isFinite(nowMs)
    && observedMs <= nowMs && nowMs - observedMs <= 26 * 60 * 60 * 1000
    && latest.freshness === 'fresh'
  const metric = (key: string) => {
    const value = latest?.metrics.find(entry => entry.key === key)?.value
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  const registered = metric('companies_registered_total')
  const verified = metric('companies_verified_total')
  const validCompanyCounts = registered !== null && verified !== null && verified <= registered

  const trafficValid = traffic?.status === 'available' && typeof traffic.registrationPageviews === 'number'
    && Number.isSafeInteger(traffic.registrationPageviews) && traffic.registrationPageviews >= 0
  const observations: string[] = []
  const checks: string[] = []
  const provenance: string[] = []

  if (trafficValid && traffic?.status === 'available') {
    observations.push(`Registreringssidan visades ${traffic.registrationPageviews} gånger under perioden ${traffic.firstDate}–${traffic.lastDate} (UTC).`)
    provenance.push(`PostHog · /registrera · ${traffic.firstDate}–${traffic.lastDate} UTC · samtyckesbaserad trafik · hämtad ${traffic.checkedAt}`)
    if (traffic.registrationPageviews === 0)
      checks.push('Kontrollera med ett samtyckande testbesök att /registrera registreras; noll visningar bevisar inte att intresset saknas.')
  } else {
    checks.push('Verifiera PostHog-anslutning och datakvalitet innan några slutsatser om registreringsintresse dras.')
  }

  if (validCompanyCounts && latest) {
    observations.push(`Handlarbörsen hade ${registered} registrerade och ${verified} verifierade företag vid senaste rapporten.`)
    provenance.push(`Handlarbörsen · företagssnapshot · observerad ${latest.observedAt} · ${latest.dataScope}`)
    if (fresh && registered > verified)
      checks.push('Granska väntande företagsverifieringar i ordinarie handläggningsflöde; inga konton ändras automatiskt.')
  } else {
    checks.push('Kontrollera att en aktuell, verifierad produktionssnapshot innehåller jämförbara företagsantal.')
  }

  if (!fresh)
    checks.push('Hämta en färsk företagsrapport innan nya prioriteringar görs; befintliga siffror kan vara inaktuella.')

  checks.push('Mät senare ansökningar och verifiering med en separat godkänd definition innan en verklig konverteringsgrad beräknas.')

  return {
    status: trafficValid && validCompanyCounts && fresh ? 'review' : 'insufficient_data',
    headline: trafficValid && validCompanyCounts && fresh
      ? 'Underlag för manuell tillväxtgranskning'
      : 'Underlag ofullständigt – kontrollera källorna',
    observations,
    checks,
    provenance,
  }
}
