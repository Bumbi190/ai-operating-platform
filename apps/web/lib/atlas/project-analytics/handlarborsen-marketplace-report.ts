/**
 * lib/atlas/project-analytics/handlarborsen-marketplace-report.ts — pure report model (P1D).
 *
 * Turns stored `handlarborsen_marketplace_snapshots` rows into the one shape both the
 * project page and Atlas read: a validated latest report, Swedish labels for all 11
 * metrics, freshness, and a history/comparison block. No I/O, no clock of its own
 * (`now` is a parameter), no database, no model call.
 *
 * HONESTY RULES (each one is tested):
 *  - A row is shown as a report only if it passes the same contract the collector
 *    enforces. A corrupt latest row yields `invalid_snapshot` and NO values.
 *  - `null` is "unavailable at the source", never 0. It stays null end to end.
 *  - Nothing is said to have risen or fallen without a previous valid snapshot. With
 *    fewer than two snapshots the comparison is `unavailable`, and the Atlas fact block
 *    says so in as many words.
 *  - Deltas exist only for stock-type metrics (totals and current levels). A 24 h window
 *    metric is a different window each day, so it is never differenced.
 *  - Values are never hardcoded: every number rendered comes from a stored row.
 */

import {
  HANDLARBORSEN_PROJECT_ID,
  MARKETPLACE_METRIC_KEYS,
  type MarketplaceCompleteness,
  type MarketplaceMetricKey,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'

// ── Metric definitions (Swedish) ──────────────────────────────────────────────

/** total = cumulative count, current = level right now, window24h = the 24 h before observed_at. */
export type MetricKind = 'total' | 'current' | 'window24h'
export type MetricGroup = 'Företag' | 'Fordon' | 'Bud och intresse' | 'Affärer'

export interface MetricDefinition {
  key: MarketplaceMetricKey
  label: string
  group: MetricGroup
  kind: MetricKind
}

export const MARKETPLACE_METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { key: 'companies_registered_total',  label: 'Registrerade företag',              group: 'Företag',          kind: 'total' },
  { key: 'companies_verified_total',    label: 'Verifierade företag',               group: 'Företag',          kind: 'total' },
  { key: 'vehicles_published_active',   label: 'Publicerade fordon',                group: 'Fordon',           kind: 'current' },
  { key: 'vehicles_reserved',           label: 'Reserverade fordon',                group: 'Fordon',           kind: 'current' },
  { key: 'vehicles_published_last_24h', label: 'Nya fordon senaste 24 h',           group: 'Fordon',           kind: 'window24h' },
  { key: 'bids_total',                  label: 'Bud totalt',                        group: 'Bud och intresse', kind: 'total' },
  { key: 'bids_last_24h',               label: 'Bud senaste 24 h',                  group: 'Bud och intresse', kind: 'window24h' },
  { key: 'interests_last_24h',          label: 'Intresseanmälningar senaste 24 h',  group: 'Bud och intresse', kind: 'window24h' },
  { key: 'offers_last_24h',             label: 'Erbjudanden senaste 24 h',          group: 'Bud och intresse', kind: 'window24h' },
  { key: 'deals_completed_total',       label: 'Slutförda affärer totalt',          group: 'Affärer',          kind: 'total' },
  { key: 'deals_completed_last_24h',    label: 'Slutförda affärer senaste 24 h',    group: 'Affärer',          kind: 'window24h' },
]

export const METRIC_GROUP_ORDER: readonly MetricGroup[] = ['Företag', 'Fordon', 'Bud och intresse', 'Affärer']

export const COMPLETENESS_LABELS: Record<MarketplaceCompleteness, string> = {
  complete: 'Komplett',
  partial: 'Ofullständig',
  unavailable: 'Otillgänglig',
}

export const UNAVAILABLE_REASON_LABELS: Record<string, string> = {
  query_failed: 'Kunde inte beräknas hos Handlarbörsen',
  invalid_count: 'Ogiltigt värde från källan',
}
export const UNKNOWN_REASON_LABEL = 'Orsak saknas'

/** The collector's cadence is daily; beyond this a report is shown as possibly out of date. */
export const STALE_AFTER_HOURS = 26
/** How many snapshots the reader fetches — enough for later week/month comparisons. */
export const HISTORY_LIMIT = 30

// ── Stored row (exactly the columns the reader selects) ───────────────────────

export const SNAPSHOT_SELECT_COLUMNS = [
  'project_id', 'snapshot_date', 'observed_at', 'captured_at', 'schema_version',
  'window_hours', 'completeness', 'unavailable', ...MARKETPLACE_METRIC_KEYS,
].join(', ')

export type SnapshotRow = {
  project_id: unknown
  snapshot_date: unknown
  observed_at: unknown
  captured_at: unknown
  schema_version: unknown
  window_hours: unknown
  completeness: unknown
  unavailable: unknown
} & Record<MarketplaceMetricKey, unknown>

// ── Report model ──────────────────────────────────────────────────────────────

export interface MetricView {
  key: MarketplaceMetricKey
  label: string
  group: MetricGroup
  kind: MetricKind
  /** null = unavailable at the source. Never 0 by substitution. */
  value: number | null
  /** Why the source could not supply it; only set when value is null. */
  reasonLabel: string | null
}

export interface ReportSnapshot {
  snapshotDate: string
  observedAt: string
  capturedAt: string
  completeness: MarketplaceCompleteness
  availableCount: number
  unavailableCount: number
  metrics: MetricView[]
  ageHours: number
  freshness: 'fresh' | 'stale'
}

export type Comparison =
  | { available: false; reason: 'no_previous_snapshot' }
  | {
      available: true
      previousDate: string
      daysBetween: number
      /** Only stock-type metrics, and only where both snapshots hold a value. */
      deltas: Partial<Record<MarketplaceMetricKey, number>>
    }

export type ReportState =
  | 'ok'
  /** No snapshot has been stored yet. */
  | 'no_snapshot'
  /** The newest stored row failed validation; nothing from it is shown. */
  | 'invalid_snapshot'
  /** The read itself failed. */
  | 'read_failed'
  /** The project is not in observer or active mode. */
  | 'not_enabled'

export interface MarketplaceReport {
  state: ReportState
  latest: ReportSnapshot | null
  history: {
    /** Valid snapshots in the fetched window (including the latest). */
    snapshotCount: number
    /** Rows skipped because they failed validation. */
    skippedInvalid: number
    previous: ReportSnapshot | null
    comparison: Comparison
  }
}

export function emptyReport(state: Exclude<ReportState, 'ok'>): MarketplaceReport {
  return {
    state,
    latest: null,
    history: {
      snapshotCount: 0,
      skippedInvalid: 0,
      previous: null,
      comparison: { available: false, reason: 'no_previous_snapshot' },
    },
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const COMPLETENESS_VALUES: readonly string[] = ['complete', 'partial', 'unavailable']

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

function isStoredCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Re-checks a stored row against the contract the collector wrote it under. Returns the
 * typed values, or null if anything deviates (so a hand-edited or corrupt row is never
 * presented as a verified report).
 */
export function validateSnapshotRow(row: unknown): {
  snapshotDate: string
  observedAt: string
  capturedAt: string
  completeness: MarketplaceCompleteness
  metrics: Record<MarketplaceMetricKey, number | null>
  reasons: Partial<Record<MarketplaceMetricKey, string>>
} | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>

  if (r.project_id !== HANDLARBORSEN_PROJECT_ID) return null
  if (r.schema_version !== 1 || r.window_hours !== 24) return null
  if (typeof r.snapshot_date !== 'string' || !ISO_DATE.test(r.snapshot_date)) return null
  if (!isValidTimestamp(r.observed_at) || !isValidTimestamp(r.captured_at)) return null
  if (typeof r.completeness !== 'string' || !COMPLETENESS_VALUES.includes(r.completeness)) return null

  const metrics = {} as Record<MarketplaceMetricKey, number | null>
  let nullCount = 0
  for (const key of MARKETPLACE_METRIC_KEYS) {
    const value = r[key]
    if (value === null) { metrics[key] = null; nullCount += 1 }
    else if (isStoredCount(value)) metrics[key] = value
    else return null
  }

  // completeness must agree with the values, or the label would lie about the data.
  const total = MARKETPLACE_METRIC_KEYS.length
  const expected: MarketplaceCompleteness =
    nullCount === 0 ? 'complete' : nullCount === total ? 'unavailable' : 'partial'
  if (r.completeness !== expected) return null

  const reasons: Partial<Record<MarketplaceMetricKey, string>> = {}
  const unavailable = r.unavailable
  if (typeof unavailable === 'object' && unavailable !== null && !Array.isArray(unavailable)) {
    for (const key of MARKETPLACE_METRIC_KEYS) {
      const reason = (unavailable as Record<string, unknown>)[key]
      if (metrics[key] === null && typeof reason === 'string') reasons[key] = reason
    }
  }

  return {
    snapshotDate: r.snapshot_date,
    observedAt: r.observed_at as string,
    capturedAt: r.captured_at as string,
    completeness: r.completeness as MarketplaceCompleteness,
    metrics,
    reasons,
  }
}

// ── Building ──────────────────────────────────────────────────────────────────

function toSnapshot(valid: NonNullable<ReturnType<typeof validateSnapshotRow>>, nowMs: number): ReportSnapshot {
  const metrics: MetricView[] = MARKETPLACE_METRIC_DEFINITIONS.map((def) => {
    const value = valid.metrics[def.key]
    const reason = valid.reasons[def.key]
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      kind: def.kind,
      value,
      reasonLabel: value === null ? (reason ? UNAVAILABLE_REASON_LABELS[reason] ?? UNKNOWN_REASON_LABEL : UNKNOWN_REASON_LABEL) : null,
    }
  })
  const availableCount = metrics.filter((m) => m.value !== null).length
  const ageHours = Math.max(0, (nowMs - new Date(valid.observedAt).getTime()) / 3_600_000)
  return {
    snapshotDate: valid.snapshotDate,
    observedAt: valid.observedAt,
    capturedAt: valid.capturedAt,
    completeness: valid.completeness,
    availableCount,
    unavailableCount: metrics.length - availableCount,
    metrics,
    ageHours,
    freshness: ageHours > STALE_AFTER_HOURS ? 'stale' : 'fresh',
  }
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000)
}

/** Deltas for stock-type metrics only; both sides must hold a real value. */
export function compareSnapshots(latest: ReportSnapshot, previous: ReportSnapshot | null): Comparison {
  if (!previous || previous.snapshotDate >= latest.snapshotDate) {
    return { available: false, reason: 'no_previous_snapshot' }
  }
  const deltas: Partial<Record<MarketplaceMetricKey, number>> = {}
  for (const metric of latest.metrics) {
    if (metric.kind === 'window24h') continue
    const before = previous.metrics.find((m) => m.key === metric.key)?.value ?? null
    if (metric.value !== null && before !== null) deltas[metric.key] = metric.value - before
  }
  return {
    available: true,
    previousDate: previous.snapshotDate,
    daysBetween: daysBetween(previous.snapshotDate, latest.snapshotDate),
    deltas,
  }
}

/** Builds the report from stored rows (any order). Pure. */
export function buildMarketplaceReport(rows: readonly unknown[], now: Date = new Date()): MarketplaceReport {
  if (rows.length === 0) return emptyReport('no_snapshot')
  const nowMs = now.getTime()

  const valid: NonNullable<ReturnType<typeof validateSnapshotRow>>[] = []
  let skippedInvalid = 0
  for (const row of rows) {
    const parsed = validateSnapshotRow(row)
    if (parsed) valid.push(parsed)
    else skippedInvalid += 1
  }
  valid.sort((a, b) => (a.snapshotDate < b.snapshotDate ? 1 : a.snapshotDate > b.snapshotDate ? -1 : 0))

  // The newest STORED row decides. If it is corrupt we do not quietly fall back to an
  // older one and present it as the latest report.
  const newestStored = rows
    .map((r) => (typeof r === 'object' && r !== null ? (r as Record<string, unknown>).snapshot_date : null))
    .filter((d): d is string => typeof d === 'string')
    .sort()
    .pop()
  if (valid.length === 0 || (newestStored !== undefined && valid[0].snapshotDate !== newestStored)) {
    const report = emptyReport('invalid_snapshot')
    report.history.skippedInvalid = skippedInvalid
    return report
  }

  const latest = toSnapshot(valid[0], nowMs)
  const previous = valid.length > 1 ? toSnapshot(valid[1], nowMs) : null
  return {
    state: 'ok',
    latest,
    history: {
      snapshotCount: valid.length,
      skippedInvalid,
      previous,
      comparison: compareSnapshots(latest, previous),
    },
  }
}

// ── Presentation helpers (shared by the page and the fact block) ──────────────

const STOCKHOLM = 'Europe/Stockholm'

export function formatStockholm(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    timeZone: STOCKHOLM,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatAge(ageHours: number): string {
  if (ageHours < 1) return 'mindre än en timme'
  if (ageHours < 48) return `${Math.floor(ageHours)} tim`
  return `${Math.floor(ageHours / 24)} dygn`
}

// ── Atlas fact block ──────────────────────────────────────────────────────────

export const FACT_BLOCK_HEADER = '[HANDLARBÖRSEN — MARKNADSPLATSSTATISTIK (faktaunderlag, observer)]'

function renderValue(metric: MetricView): string {
  return metric.value === null ? `Okänt (${metric.reasonLabel ?? UNKNOWN_REASON_LABEL})` : String(metric.value)
}

/**
 * The text Atlas may use as factual ground for analysis. Mirrors exactly what the page
 * shows. It instructs the reader up front what NOT to infer. Returns null when there is
 * no verified report, so absence never reads as "all zeros".
 */
export function renderHandlarborsenFactBlock(report: MarketplaceReport): string | null {
  if (report.state !== 'ok' || !report.latest) return null
  const { latest, history } = report

  const lines: string[] = [
    `\n\n${FACT_BLOCK_HEADER}`,
    `Rapport för ${latest.snapshotDate}, uppmätt ${formatStockholm(latest.observedAt)} (svensk tid), ${formatAge(latest.ageHours)} gammal.`,
    `Datakvalitet: ${COMPLETENESS_LABELS[latest.completeness].toLowerCase()} — ${latest.availableCount} av ${latest.metrics.length} mätvärden tillgängliga.`,
  ]
  if (latest.freshness === 'stale') {
    lines.push(`OBS: rapporten är äldre än ${STALE_AFTER_HOURS} tim och kan vara inaktuell.`)
  }
  lines.push('Källa: Handlarbörsens statistik-API, aggregerade antal (inga personuppgifter).')

  for (const group of METRIC_GROUP_ORDER) {
    lines.push(`${group}:`)
    for (const metric of latest.metrics.filter((m) => m.group === group)) {
      lines.push(`- ${metric.label}: ${renderValue(metric)}`)
    }
  }

  const { comparison } = history
  if (!comparison.available) {
    lines.push(
      'Historik: Ingen tidigare rapport finns. Du får INTE påstå att något har ökat, minskat eller utvecklats — det finns inget underlag för jämförelse.',
    )
  } else {
    lines.push(
      `Jämförelse mot rapporten ${comparison.previousDate} (${comparison.daysBetween} dygn tidigare), endast totaler och aktuella nivåer:`,
    )
    const defs = MARKETPLACE_METRIC_DEFINITIONS.filter((d) => d.key in comparison.deltas)
    if (defs.length === 0) lines.push('- Inga mätvärden finns i båda rapporterna.')
    for (const def of defs) {
      const delta = comparison.deltas[def.key] as number
      lines.push(`- ${def.label}: ${delta > 0 ? '+' : ''}${delta}`)
    }
    lines.push('Mätvärden för "senaste 24 h" jämförs inte mellan dagar.')
  }

  lines.push(
    'Regler: "Okänt" är inte noll. Siffror får bara användas som de står här; hitta inte på saknade värden. Bedöm inte trend utan jämförelse. Atlas är i observer-läge: rapportera och analysera, agera inte.',
  )
  return lines.join('\n')
}
