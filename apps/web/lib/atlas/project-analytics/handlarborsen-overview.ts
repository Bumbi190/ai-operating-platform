/**
 * lib/atlas/project-analytics/handlarborsen-overview.ts — report → project-page KPI model (P1D.3).
 *
 * Pure. Picks which of the 11 stored metrics lead the project page and which form the
 * 24 h activity band, and turns freshness, quality and history into plain statements.
 * Every figure is a value from the stored report (null stays null); the only text that
 * speaks about change is built from a real previous snapshot, and carries no arrow.
 */

import type { MarketplaceMetricKey } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  COLLECTION_TODAY_LABELS,
  type CollectionStatus,
  COMPLETENESS_LABELS,
  REPORT_STATE_MESSAGES,
  STALE_AFTER_HOURS,
  formatAge,
  formatStockholm,
  type MarketplaceReport,
  type MetricView,
} from './handlarborsen-marketplace-report'

/** The six headline figures, in reading order. */
export const HEADLINE_KEYS: readonly MarketplaceMetricKey[] = [
  'companies_registered_total',
  'companies_verified_total',
  'vehicles_published_active',
  'vehicles_reserved',
  'bids_total',
  'deals_completed_total',
]

/** The five 24 h window metrics. Together with HEADLINE_KEYS they are all 11. */
export const ACTIVITY_KEYS: readonly MarketplaceMetricKey[] = [
  'vehicles_published_last_24h',
  'bids_last_24h',
  'interests_last_24h',
  'offers_last_24h',
  'deals_completed_last_24h',
]

export interface OverviewItem { key: string; label: string; value: number | null; note: string | null }

export type HandlarborsenOverviewModel =
  | { kind: 'note'; title: string; text: string; tone: 'error' | 'empty' }
  | {
      kind: 'kpi'
      headline: OverviewItem[]
      activity: OverviewItem[]
      meta: Array<{ label: string; value: string; tone?: 'ok' | 'warning' }>
      notices: Array<{ tone: 'warning'; text: string }>
      historyText: string
    }

function item(metric: MetricView, deltaText: string | null): OverviewItem {
  return {
    key: metric.key,
    label: metric.label,
    value: metric.value,
    note: metric.value === null ? metric.reasonLabel : deltaText,
  }
}

/** Collection rows for the meta list. Empty when the audit rows could not be read: nothing is claimed. */
function collectionMeta(collection: CollectionStatus | null): Array<{ label: string; value: string; tone?: 'ok' | 'warning' }> {
  if (!collection) return []
  const last = collection.lastSuccess
  return [
    {
      label: 'Senaste lyckade insamling',
      value: last ? `${formatStockholm(last.ranAt)} · ${formatAge(last.ageHours)} sedan` : 'Ingen lyckad insamling registrerad',
    },
    { label: 'Dagens insamling', ...COLLECTION_TODAY_LABELS[collection.today] },
  ]
}

export function buildHandlarborsenOverview(report: MarketplaceReport): HandlarborsenOverviewModel {
  if (report.state !== 'ok' || !report.latest) {
    const state = report.state === 'ok' ? 'no_snapshot' : report.state
    const message = REPORT_STATE_MESSAGES[state]
    // No report to show, but the audit rows can still say that today's collection failed.
    const failure = report.collection?.latestAttemptFailed ? ' Det senaste insamlingsförsöket misslyckades.' : ''
    return { kind: 'note', title: message.title, text: `${message.body}${failure}`, tone: message.tone }
  }

  const { latest, history } = report
  const comparison = history.comparison
  const byKey = new Map(latest.metrics.map((m) => [m.key, m]))

  // Change is stated only against a real previous snapshot, only for stock-type metrics
  // (the report model leaves 24 h metrics out of `deltas`), and only in words and signs.
  const deltaText = (key: MarketplaceMetricKey): string | null => {
    if (!comparison.available) return null
    const delta = comparison.deltas[key]
    if (delta === undefined) return null
    return `${delta > 0 ? '+' : ''}${delta} sedan ${comparison.previousDate}`
  }

  const pick = (keys: readonly MarketplaceMetricKey[], withDelta: boolean): OverviewItem[] =>
    keys.map((key) => item(byKey.get(key) as MetricView, withDelta ? deltaText(key) : null))

  const notices: Array<{ tone: 'warning'; text: string }> = []
  if (latest.freshness === 'stale') {
    notices.push({
      tone: 'warning',
      text: `Rapporten är äldre än ${STALE_AFTER_HOURS} tim och kan vara inaktuell.`,
    })
  }
  if (report.collection?.latestAttemptFailed) {
    notices.push({
      tone: 'warning',
      text: 'Det senaste insamlingsförsöket misslyckades eller gav ingen ny rapport. Siffrorna är från den senast sparade rapporten.',
    })
  }
  if (latest.completeness !== 'complete') {
    notices.push({
      tone: 'warning',
      text: `${latest.unavailableCount} mätvärden saknas i rapporten och visas som okända, inte som noll.`,
    })
  }

  return {
    kind: 'kpi',
    headline: pick(HEADLINE_KEYS, true),
    activity: pick(ACTIVITY_KEYS, false),
    meta: [
      { label: 'Uppmätt', value: `${formatStockholm(latest.observedAt)} · ${formatAge(latest.ageHours)} sedan` },
      {
        label: 'Aktualitet',
        value: latest.freshness === 'fresh' ? 'Aktuell' : `Äldre än ${STALE_AFTER_HOURS} tim`,
        tone: latest.freshness === 'fresh' ? 'ok' : 'warning',
      },
      {
        label: 'Datakvalitet',
        value: `${COMPLETENESS_LABELS[latest.completeness]} · ${latest.availableCount} av ${latest.metrics.length} mätvärden`,
        tone: latest.completeness === 'complete' ? 'ok' : 'warning',
      },
      ...collectionMeta(report.collection),
    ],
    notices,
    historyText: comparison.available
      ? `${history.snapshotCount} rapporter sparade. Förändring mot rapporten ${comparison.previousDate} visas på totaler och aktuella nivåer; ` +
        'värden för senaste 24 h jämförs inte mellan dagar. Varje sparad dag finns i den fullständiga statistikrapporten.'
      : 'Det finns bara en rapport. Utveckling över tid visas först när fler rapporter har sparats — ingen ökning eller minskning kan bedömas nu.',
  }
}
