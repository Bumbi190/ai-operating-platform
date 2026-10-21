import { createHash } from 'node:crypto'
import { canonicalJson } from '@/lib/atlas/mission/binding'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
  MARKETPLACE_METRIC_KEYS,
  type MarketplaceMetricKey,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type { MetricDefinition } from './handlarborsen-marketplace-report'
// Immutable V1 definitions: SQL pins this same contract; future report edits must not rewrite history.
const V1_METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    key: 'companies_registered_total',
    label: 'Registrerade företag',
    group: 'Företag',
    kind: 'total',
  },
  {
    key: 'companies_verified_total',
    label: 'Verifierade företag',
    group: 'Företag',
    kind: 'total',
  },
  {
    key: 'vehicles_published_active',
    label: 'Publicerade fordon',
    group: 'Fordon',
    kind: 'current',
  },
  {
    key: 'vehicles_reserved',
    label: 'Reserverade fordon',
    group: 'Fordon',
    kind: 'current',
  },
  {
    key: 'vehicles_published_last_24h',
    label: 'Nya fordon senaste 24 h',
    group: 'Fordon',
    kind: 'window24h',
  },
  {
    key: 'bids_total',
    label: 'Bud totalt',
    group: 'Bud och intresse',
    kind: 'total',
  },
  {
    key: 'bids_last_24h',
    label: 'Bud senaste 24 h',
    group: 'Bud och intresse',
    kind: 'window24h',
  },
  {
    key: 'interests_last_24h',
    label: 'Intresseanmälningar senaste 24 h',
    group: 'Bud och intresse',
    kind: 'window24h',
  },
  {
    key: 'offers_last_24h',
    label: 'Erbjudanden senaste 24 h',
    group: 'Bud och intresse',
    kind: 'window24h',
  },
  {
    key: 'deals_completed_total',
    label: 'Slutförda affärer totalt',
    group: 'Affärer',
    kind: 'total',
  },
  {
    key: 'deals_completed_last_24h',
    label: 'Slutförda affärer senaste 24 h',
    group: 'Affärer',
    kind: 'window24h',
  },
]
export type RawSnapshot = {
  id: string
  project_id: string
  snapshot_date: string
  observed_at: string
  captured_at: string
  schema_version: 1
  window_hours: 24
  completeness: 'complete' | 'partial' | 'unavailable'
  unavailable: Partial<Record<MarketplaceMetricKey, string>>
} & Record<MarketplaceMetricKey, string | null>
export type RawRun = {
  id: string
  project_id: string
  collector_id: string
  status: 'ok' | 'skipped' | 'error'
  ran_at: string
  snapshot_date: string | null
  storage_outcome: string | null
}
export const ANALYSIS_SEMANTICS = V1_METRIC_DEFINITIONS.map((d) => ({
  ...d,
  populationCaveat: d.key === 'companies_verified_total' ? 'population_unverified' : null,
  coverage: null,
  collectorVersion: null,
}))
export interface AnalysisSourceEnvelopeV1 {
  schemaVersion: 1
  reportContractVersion: 'handlarborsen-marketplace-report-1'
  projectId: string
  slug: string
  auditReadable: boolean
  semantics: typeof ANALYSIS_SEMANTICS
  snapshots: RawSnapshot[]
  runs: RawRun[]
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function exactKeys(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join('|') === [...keys].sort().join('|')
  )
}
export function canonicalTimestamp(v: unknown): string {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  )
    throw Error('invalid_source_time')
  const t = Date.parse(v)
  if (!Number.isFinite(t)) throw Error('invalid_source_time')
  const fraction = (v.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0')
  return new Date(t).toISOString().slice(0, 19) + '.' + fraction + 'Z'
}
function count(v: unknown): string | null {
  if (v === null) return null
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v)
  if (typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= BigInt('9007199254740991')) return v
  throw Error('invalid_source_count')
}
export function normalizeAnalysisSource(
  rows: unknown[],
  runs: unknown[] | undefined,
): AnalysisSourceEnvelopeV1 | null {
  try {
    if (rows.length > 30 || (runs?.length ?? 0) > 30) throw Error()
    const snapshots = rows
      .map((v) => {
        if (
          !exactKeys(v, [
            'id',
            'project_id',
            'snapshot_date',
            'observed_at',
            'captured_at',
            'schema_version',
            'window_hours',
            'completeness',
            'unavailable',
            ...MARKETPLACE_METRIC_KEYS,
          ])
        )
          throw Error()
        if (
          typeof v.id !== 'string' ||
          !UUID.test(v.id) ||
          v.project_id !== HANDLARBORSEN_PROJECT_ID ||
          v.schema_version !== 1 ||
          v.window_hours !== 24 ||
          typeof v.snapshot_date !== 'string'
        )
          throw Error()
        const metrics = Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((k) => [k, count(v[k])])) as Record<
          MarketplaceMetricKey,
          string | null
        >
        const reasons = v.unavailable
        if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) throw Error()
        for (const [k, r] of Object.entries(reasons))
          if (
            !MARKETPLACE_METRIC_KEYS.includes(k as MarketplaceMetricKey) ||
            metrics[k as MarketplaceMetricKey] !== null ||
            !['query_failed', 'invalid_count'].includes(r as string)
          )
            throw Error()
        const n = Object.values(metrics).filter((x) => x === null).length
        if (v.completeness !== (n === 0 ? 'complete' : n === 11 ? 'unavailable' : 'partial')) throw Error()
        for (const k of MARKETPLACE_METRIC_KEYS) if (metrics[k] === null && !(k in reasons)) throw Error()
        const observed_at = canonicalTimestamp(v.observed_at),
          captured_at = canonicalTimestamp(v.captured_at)
        if (observed_at.slice(0, 10) !== v.snapshot_date) throw Error()
        return { ...v, ...metrics, observed_at, captured_at } as RawSnapshot
      })
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date) || b.id.localeCompare(a.id))
    const audit = (runs ?? [])
      .map((v) => {
        if (
          !exactKeys(v, [
            'id',
            'project_id',
            'collector_id',
            'status',
            'ran_at',
            'snapshot_date',
            'storage_outcome',
          ])
        )
          throw Error()
        if (
          typeof v.id !== 'string' ||
          !UUID.test(v.id) ||
          v.project_id !== HANDLARBORSEN_PROJECT_ID ||
          v.collector_id !== 'handlarborsen.marketplace' ||
          !['ok', 'skipped', 'error'].includes(v.status as string)
        )
          throw Error()
        for (const k of ['snapshot_date', 'storage_outcome'])
          if (v[k] !== null && typeof v[k] !== 'string') throw Error()
        return { ...v, ran_at: canonicalTimestamp(v.ran_at) } as RawRun
      })
      .sort((a, b) => b.ran_at.localeCompare(a.ran_at) || b.id.localeCompare(a.id))
    return {
      schemaVersion: 1,
      reportContractVersion: 'handlarborsen-marketplace-report-1',
      projectId: HANDLARBORSEN_PROJECT_ID,
      slug: HANDLARBORSEN_PROJECT_SLUG,
      auditReadable: runs !== undefined,
      semantics: structuredClone(ANALYSIS_SEMANTICS),
      snapshots,
      runs: audit,
    }
  } catch {
    return null
  }
}
export function validateAnalysisSource(v: unknown): AnalysisSourceEnvelopeV1 | null {
  if (
    !exactKeys(v, [
      'schemaVersion',
      'reportContractVersion',
      'projectId',
      'slug',
      'auditReadable',
      'semantics',
      'snapshots',
      'runs',
    ]) ||
    !Array.isArray(v.snapshots) ||
    !Array.isArray(v.runs) ||
    typeof v.auditReadable !== 'boolean'
  )
    return null
  const s = normalizeAnalysisSource(v.snapshots, v.auditReadable ? v.runs : undefined)
  return s && canonicalJson(s) === canonicalJson(v) ? s : null
}
const hex = (v: string | null) => (v === null ? null : Buffer.from(v, 'utf8').toString('hex'))
export function encodeAnalysisSource(s: AnalysisSourceEnvelopeV1): string {
  if (!validateAnalysisSource(s)) throw Error('invalid_source')
  return canonicalJson([
    1,
    hex(s.reportContractVersion),
    hex(s.projectId),
    hex(s.slug),
    s.auditReadable,
    s.semantics.map((d) =>
      [d.key, d.label, d.group, d.kind, d.populationCaveat, d.coverage, d.collectorVersion].map(hex),
    ),
    s.snapshots.map((r) => [
      hex(r.id),
      hex(r.project_id),
      hex(r.snapshot_date),
      hex(r.observed_at),
      hex(r.captured_at),
      r.schema_version,
      r.window_hours,
      hex(r.completeness),
      ...MARKETPLACE_METRIC_KEYS.flatMap((k) => [hex(r[k]), hex(r.unavailable[k] ?? null)]),
    ]),
    s.runs.map((r) =>
      [r.id, r.project_id, r.collector_id, r.status, r.ran_at, r.snapshot_date, r.storage_outcome].map(hex),
    ),
  ])
}
export const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex')
export const hashAnalysisSource = (s: AnalysisSourceEnvelopeV1) => sha256(encodeAnalysisSource(s))
export function sourceReportRows(s: AnalysisSourceEnvelopeV1) {
  return s.snapshots.map((r) => ({
    ...r,
    ...Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((k) => [k, r[k] === null ? null : Number(r[k])])),
  }))
}
