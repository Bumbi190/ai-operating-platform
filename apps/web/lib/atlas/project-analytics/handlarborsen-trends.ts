/**
 * Handlarbörsen chart model: deterministic, read-only projection of the single
 * authorization-scoped MarketplaceReport already used by Command Center.
 *
 * Exactly two count metrics per panel; no fake points, currency or rates.
 * Only stored UTC snapshot dates are considered, and 24-hour windows are
 * excluded from these cumulative/current-level charts.
 */
import type { MarketplaceMetricKey } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type {
  MarketplaceReport,
  ReportSnapshot,
} from './handlarborsen-marketplace-report'

export const TREND_HISTORY_DAYS = 14

export type TrendId = 'companies' | 'vehicles' | 'trading'
export type TrendPair = {
  key: MarketplaceMetricKey
  label: string
}
export type TrendObservation = {
  date: string
  first: number | null
  second: number | null
}
export interface TrendPanelModel {
  id: TrendId
  title: string
  description: string
  note: string
  first: TrendPair
  second: TrendPair
  observations: TrendObservation[]
  mode: 'snapshot' | 'history'
}

const PANELS: readonly Omit<TrendPanelModel, 'observations' | 'mode'>[] = [
  {
    id: 'companies',
    title: 'Företag',
    description: 'Registrerade och verifierade företag',
    note: 'Registrerade är historiskt totalantal; verifierade är aktuell status. Ingen andel beräknas.',
    first: { key: 'companies_registered_total', label: 'Registrerade totalt' },
    second: { key: 'companies_verified_total', label: 'Verifierade nu' },
  },
  {
    id: 'vehicles',
    title: 'Fordon',
    description: 'Publicerade och reserverade fordon',
    note: 'Båda är ögonblicksbilder av två skilda fordonsstatusar, inte inflöde eller försäljning.',
    first: { key: 'vehicles_published_active', label: 'Publicerade nu' },
    second: { key: 'vehicles_reserved', label: 'Reserverade nu' },
  },
  {
    id: 'trading',
    title: 'Handel',
    description: 'Bud och slutförda affärer',
    note: 'Separata ackumulerade totaler. Bud och affärer hör inte nödvändigtvis till samma fordon.',
    first: { key: 'bids_total', label: 'Bud totalt' },
    second: { key: 'deals_completed_total', label: 'Slutförda affärer totalt' },
  },
]

function count(
  snapshot: ReportSnapshot,
  key: MarketplaceMetricKey,
): number | null {
  const metric = snapshot.metrics.find(
    (m) => m.key === key && m.kind !== 'window24h',
  )
  return metric?.value ?? null
}

export function buildHandlarborsenTrendPanels(
  report: MarketplaceReport,
): TrendPanelModel[] {
  if (report.state !== 'ok' || !report.latest) return []
  // Reader already validated the source rows. Limit and reverse without
  // inventing dates between stored reports or interpolating missing values.
  const snapshots = report.history.series.slice(0, TREND_HISTORY_DAYS).reverse()

  return PANELS.map((panel) => ({
    ...panel,
    observations: snapshots.map((snapshot) => ({
      date: snapshot.snapshotDate,
      first: count(snapshot, panel.first.key),
      second: count(snapshot, panel.second.key),
    })),
    mode: snapshots.length >= 2 ? 'history' : 'snapshot',
  }))
}

/** A segment is only valid between consecutive stored UTC days, with both
 * endpoints actually known. Null and absent calendar days break the line. */
export function trendLineSegments(
  observations: readonly TrendObservation[],
  series: 'first' | 'second',
): Array<readonly [number, number]> {
  const segments: Array<readonly [number, number]> = []
  for (let i = 1; i < observations.length; i += 1) {
    const a = observations[i - 1]
    const b = observations[i]
    const dayGap =
      (Date.parse(b.date + 'T00:00:00Z') - Date.parse(a.date + 'T00:00:00Z')) /
      86_400_000
    if (dayGap === 1 && a[series] !== null && b[series] !== null) {
      segments.push([i - 1, i])
    }
  }
  return segments
}
