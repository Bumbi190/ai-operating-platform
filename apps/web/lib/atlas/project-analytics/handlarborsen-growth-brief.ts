import type { RealDealerMetricsV3 } from './handlarborsen-real-dealer-v3'
import { companyPopulation } from './handlarborsen-company-population'
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
  realDealerMetrics?: RealDealerMetricsV3 | null,
): GrowthBrief {
  const population = companyPopulation(report, now, realDealerMetrics)
  const { registered, verified, fresh } = population
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

  if (validCompanyCounts && population.observedAt) {
    observations.push(`Handlarbörsen hade ${registered} registrerade och ${verified} verifierade ${realDealerMetrics !== undefined ? "externa handlare enligt v3" : "företag vid senaste rapporten"}.`)
    provenance.push(`Handlarbörsen · ${realDealerMetrics !== undefined ? "v3-API" : "företagssnapshot"} · observerad ${population.observedAt} · ${population.scope}`)
    if (fresh && registered > verified)
      checks.push(realDealerMetrics !== undefined
        ? 'Granska verifieringsstatus i ordinarie handläggningsflöde; skillnaden mellan registrerade och verifierade visar inte hur många ansökningar som väntar.'
        : 'Granska väntande företagsverifieringar i ordinarie handläggningsflöde; inga konton ändras automatiskt.')
  } else {
    checks.push(realDealerMetrics !== undefined
      ? 'Kontrollera att Handlarbörsens v3-API ger aktuella, verifierade antal externa handlare; äldre rapporter används inte som reserv.'
      : 'Kontrollera att en aktuell, verifierad produktionssnapshot innehåller jämförbara företagsantal.')
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
