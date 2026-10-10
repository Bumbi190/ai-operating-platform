/**
 * lib/atlas/collectors/handlarborsen-marketplace.ts — Handlarbörsen Marketplace Collector.
 *
 * Read-only. Pulls the 11 aggregate marketplace counts from Handlarbörsen's
 * GET /api/internal/atlas-metrics (Bumbi190/handlarborsen docs/ATLAS_METRICS_API.md,
 * schema_version 1), stores a project-bound daily snapshot and emits a
 * "handlarborsen.marketplace_snapshot" Atlas signal.
 *
 * Identity and destination are FIXED in code: one project id/slug and one HTTPS URL.
 * Nothing here accepts a URL, host or project from a request, and redirects are
 * refused so the bearer token can never be forwarded to another host.
 *
 * Credential: HANDLARBORSEN_METRICS_TOKEN (server env only, same value as
 * Handlarbörsen's ATLAS_METRICS_TOKEN). Not platform_tokens (social media) and not
 * project_api_credentials (hashed inbound keys). Missing or unusable => the run is
 * 'skipped'; no value is ever invented.
 *
 * An unavailable metric stays null end to end. It is never coerced to 0, and a
 * run with any null is flagged completeness = 'partial' (or 'unavailable').
 *
 * Storage is GUARDED (P1E): the snapshot is written only through the database function
 * handlarborsen_store_marketplace_snapshot, which decides atomically under a row lock
 * whether the observation may replace what is stored for today. A complete report is never
 * replaced by a less complete one, an older observation never replaces a newer one of equal
 * quality, and earlier days are immutable. When the database declines, the run is 'skipped'
 * with the reason and NO signal is emitted, so nothing claims a save that did not happen.
 *
 * Signal kind:  handlarborsen.marketplace_snapshot
 * Version:      handlarborsen-marketplace-collector-1.1.0
 * Cadence:      daily 06:55 UTC by the pg_cron job omnira_handlarborsen_marketplace, once
 *               that job has been activated (a separate, manually approved step; see
 *               docs/handlarborsen-p1e/). The route itself schedules nothing.
 */

import { BaseCollector, type CollectorContext, type StoreDeclined } from './types'

export const HANDLARBORSEN_COLLECTOR_VERSION = 'handlarborsen-marketplace-collector-1.1.0'
export const HANDLARBORSEN_PROJECT_ID = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
export const HANDLARBORSEN_PROJECT_SLUG = 'handlarborsen'
/** Canonical production host (the apex domains 308-redirect here). Fixed on purpose. */
export const HANDLARBORSEN_METRICS_URL = 'https://www.handlarborsen.se/api/internal/atlas-metrics'
export const HANDLARBORSEN_TOKEN_ENV = 'HANDLARBORSEN_METRICS_TOKEN'

const MIN_TOKEN_LENGTH = 32
const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 16_384
/** observed_at must be this close to now; guards against replayed or stale answers. */
const MAX_OBSERVATION_SKEW_MS = 10 * 60_000

export const MARKETPLACE_METRIC_KEYS = [
  'companies_registered_total',
  'companies_verified_total',
  'vehicles_published_active',
  'vehicles_reserved',
  'vehicles_published_last_24h',
  'bids_total',
  'bids_last_24h',
  'interests_last_24h',
  'offers_last_24h',
  'deals_completed_total',
  'deals_completed_last_24h',
] as const

export type MarketplaceMetricKey = (typeof MARKETPLACE_METRIC_KEYS)[number]
export type UnavailableReason = 'query_failed' | 'invalid_count'
const UNAVAILABLE_REASONS: readonly string[] = ['query_failed', 'invalid_count']

export type MarketplaceCompleteness = 'complete' | 'partial' | 'unavailable'

export interface ParsedMarketplaceMetrics {
  observedAt: string
  /** null = unavailable at the source. Never 0 by substitution. */
  metrics: Record<MarketplaceMetricKey, number | null>
  unavailable: Partial<Record<MarketplaceMetricKey, UnavailableReason>>
}

// ── Eligibility ───────────────────────────────────────────────────────────────

/** Only the verified Handlarbörsen project, and only while observer or active. */
export function isEligibleHandlarborsenProject(
  project: { id?: unknown; slug?: unknown; atlas_mode?: unknown } | null | undefined,
): boolean {
  return (
    !!project &&
    project.id === HANDLARBORSEN_PROJECT_ID &&
    project.slug === HANDLARBORSEN_PROJECT_SLUG &&
    (project.atlas_mode === 'observer' || project.atlas_mode === 'active')
  )
}

// ── Credential ────────────────────────────────────────────────────────────────

export type MetricsCredential =
  | { ok: true; token: string }
  | { ok: false; reason: 'credential_missing' | 'credential_invalid' }

/** Reads the token. Never returns or logs it outside the ok branch. */
export function resolveMetricsCredential(env: NodeJS.ProcessEnv = process.env): MetricsCredential {
  const token = env[HANDLARBORSEN_TOKEN_ENV]
  if (!token) return { ok: false, reason: 'credential_missing' }
  // Too short, or the same value as the cron secret (a leaked cron credential must not
  // double as the metrics credential): treat as unusable rather than send it.
  if (token.length < MIN_TOKEN_LENGTH || (env.CRON_SECRET && token === env.CRON_SECRET)) {
    return { ok: false, reason: 'credential_invalid' }
  }
  return { ok: true, token }
}

// ── Strict contract validation ────────────────────────────────────────────────

function fail(code: string): never {
  throw new Error(`handlarborsen_metrics_invalid:${code}`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(obj: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(obj).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) fail(code)
}

/** Throws on any deviation from the schema_version 1 contract. */
export function parseMarketplaceMetrics(raw: unknown, nowMs: number = Date.now()): ParsedMarketplaceMetrics {
  if (!isPlainObject(raw)) fail('body_not_object')
  exactKeys(raw, ['status', 'schema_version', 'observed_at', 'window_hours', 'metrics'], 'envelope_keys')
  if (raw.status !== 'ok') fail('status')
  if (raw.schema_version !== 1) fail('schema_version')
  if (raw.window_hours !== 24) fail('window_hours')

  const observedAt = raw.observed_at
  if (typeof observedAt !== 'string') fail('observed_at_type')
  const parsed = new Date(observedAt)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== observedAt) fail('observed_at_format')
  if (Math.abs(nowMs - parsed.getTime()) > MAX_OBSERVATION_SKEW_MS) fail('observed_at_skew')

  const rawMetrics = raw.metrics
  if (!isPlainObject(rawMetrics)) fail('metrics_not_object')
  exactKeys(rawMetrics, MARKETPLACE_METRIC_KEYS, 'metric_keys')

  const metrics = {} as Record<MarketplaceMetricKey, number | null>
  const unavailable: Partial<Record<MarketplaceMetricKey, UnavailableReason>> = {}

  for (const key of MARKETPLACE_METRIC_KEYS) {
    const metric = rawMetrics[key]
    if (!isPlainObject(metric)) fail('metric_not_object')
    if (metric.status === 'ok') {
      exactKeys(metric, ['status', 'value'], 'metric_ok_keys')
      const value = metric.value
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('metric_value')
      metrics[key] = value
    } else if (metric.status === 'unavailable') {
      exactKeys(metric, ['status', 'value', 'reason'], 'metric_unavailable_keys')
      if (metric.value !== null) fail('metric_unavailable_value')
      if (typeof metric.reason !== 'string' || !UNAVAILABLE_REASONS.includes(metric.reason)) {
        fail('metric_reason')
      }
      metrics[key] = null
      unavailable[key] = metric.reason as UnavailableReason
    } else {
      fail('metric_status')
    }
  }

  return { observedAt, metrics, unavailable }
}

export function completenessOf(metrics: Record<MarketplaceMetricKey, number | null>): MarketplaceCompleteness {
  const available = MARKETPLACE_METRIC_KEYS.filter((k) => metrics[k] !== null).length
  if (available === MARKETPLACE_METRIC_KEYS.length) return 'complete'
  return available === 0 ? 'unavailable' : 'partial'
}

// ── Bounded body read ─────────────────────────────────────────────────────────

function failureCode(controller: AbortController): string {
  return controller.signal.aborted ? 'handlarborsen_metrics_timeout' : 'handlarborsen_metrics_network_error'
}

/**
 * Reads the body incrementally and stops as soon as MAX_BODY_BYTES is exceeded, so an
 * oversized or endless answer is never buffered. Subject to the same abort signal as
 * the request: a stalled body hits the overall deadline.
 */
async function readBodyCapped(response: Response, controller: AbortController): Promise<string> {
  const declared = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('handlarborsen_metrics_invalid:body_too_large')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('handlarborsen_metrics_invalid:no_body')

  const chunks: Uint8Array[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('handlarborsen_metrics_invalid:body_too_large')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('handlarborsen_metrics_invalid:')) throw error
    throw new Error(failureCode(controller))
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('handlarborsen_metrics_invalid:not_utf8')
  }
}

// ── Collector ─────────────────────────────────────────────────────────────────

export class HandlarborsenMarketplaceCollector extends BaseCollector {
  readonly id         = 'handlarborsen.marketplace'
  readonly signalKind = 'handlarborsen.marketplace_snapshot'
  readonly version    = HANDLARBORSEN_COLLECTOR_VERSION
  readonly source     = 'handlarborsen'
  /** A run without its stored snapshot is a failed run: no signal, status 'error'. */
  readonly storeRequired = true

  /**
   * Returns null when the credential is unusable (=> skipped, nothing fetched).
   * Throws, with a fixed message that never contains the token, on a wrong
   * project, a network failure, a non-200 answer, an oversized or non-JSON body.
   */
  async fetch(ctx: CollectorContext): Promise<unknown> {
    if (ctx.projectId !== HANDLARBORSEN_PROJECT_ID || ctx.projectSlug !== HANDLARBORSEN_PROJECT_SLUG) {
      throw new Error('handlarborsen_project_not_allowed')
    }

    const credential = resolveMetricsCredential()
    if (!credential.ok) return null

    // One deadline covers the whole exchange: connecting, headers AND the body. The
    // timer is cleared only after the body has been read (or the attempt has failed).
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      let response: Response
      try {
        response = await fetch(HANDLARBORSEN_METRICS_URL, {
          method: 'GET',
          headers: { authorization: `Bearer ${credential.token}`, accept: 'application/json' },
          redirect: 'error', // never follow a redirect with the bearer attached
          cache: 'no-store',
          signal: controller.signal,
        })
      } catch {
        throw new Error(failureCode(controller))
      }

      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error(`handlarborsen_metrics_http_${response.status}`)
      }

      const text = await readBodyCapped(response, controller)
      try {
        return JSON.parse(text)
      } catch {
        throw new Error('handlarborsen_metrics_invalid:not_json')
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** null => skip (no credential). Anything malformed throws => status 'error'. */
  validate(raw: unknown): ParsedMarketplaceMetrics | null {
    if (raw === null || raw === undefined) return null
    return parseMarketplaceMetrics(raw)
  }

  normalize(valid: unknown, ctx: CollectorContext): Record<string, unknown> {
    const m = valid as ParsedMarketplaceMetrics
    const completeness = completenessOf(m.metrics)
    const unavailableKeys = Object.keys(m.unavailable)
    return {
      source_schema_version: 1,
      observed_at:           m.observedAt,
      window_hours:          24,
      completeness,
      available_count:       MARKETPLACE_METRIC_KEYS.length - unavailableKeys.length,
      unavailable_count:     unavailableKeys.length,
      unavailable:           m.unavailable,
      metrics:               m.metrics,
      snapshot_date:         ctx.snapshotDate,
      project_id:            ctx.projectId,
    }
  }

  /**
   * Hands the observation to the guarded database function. Returns undefined when the
   * snapshot was stored (inserted, upgraded or refreshed) and a StoreDeclined when the
   * database deliberately kept what it had (rejected, unchanged). Throws a fixed code on a
   * real failure, which storeRequired turns into status 'error'.
   */
  async store(payload: Record<string, unknown>, ctx: CollectorContext): Promise<void | StoreDeclined> {
    if (ctx.projectId !== HANDLARBORSEN_PROJECT_ID) return
    const metrics = payload.metrics as Record<MarketplaceMetricKey, number | null>
    // The function is not in generated types — established cast. Completeness is derived
    // by the database from the metrics; only the values and the reasons are sent.
    const { data, error } = await (ctx.db as any).rpc('handlarborsen_store_marketplace_snapshot', {
      p_snapshot_date: ctx.snapshotDate,
      p_observed_at:   payload.observed_at,
      p_unavailable:   payload.unavailable,
      p_metrics:       metrics,
    })
    // Fixed code only: the database error text must not travel into logs, the run record or the response.
    if (error) {
      console.error(`[handlarborsen.marketplace] snapshot store failed (code: ${(error as { code?: string }).code ?? 'unknown'})`)
      throw new Error('handlarborsen_snapshot_store_failed')
    }

    const result = parseStoreResult(data)
    if (!result || result.completeness !== payload.completeness) {
      console.error('[handlarborsen.marketplace] snapshot store returned an unexpected answer')
      throw new Error('handlarborsen_snapshot_store_failed')
    }

    // What actually happened, for the signal payload and the audit log.
    payload.storage_outcome = result.outcome
    if (result.stored) return

    return {
      declined: true,
      reason:   `snapshot_not_stored:${result.reason ?? result.outcome}`,
      metadata: {
        storage_outcome:  result.outcome,
        storage_reason:   result.reason,
        snapshot_date:    ctx.snapshotDate,
        project_id:       ctx.projectId,
        observed:         { completeness: result.completeness, available_count: result.availableCount, observed_at: payload.observed_at },
        existing:         { completeness: result.existingCompleteness, available_count: result.existingAvailableCount, observed_at: result.existingObservedAt },
      },
    }
  }
}

export type StoreOutcome = 'inserted' | 'upgraded' | 'refreshed' | 'unchanged' | 'rejected'
const STORED_OUTCOMES: readonly string[] = ['inserted', 'upgraded', 'refreshed']
const DECLINED_OUTCOMES: readonly string[] = ['unchanged', 'rejected']
const REJECT_REASONS: readonly string[] = ['lower_quality', 'older_observation']

interface ParsedStoreResult {
  outcome: StoreOutcome
  stored: boolean
  reason: string | null
  completeness: string
  availableCount: number
  existingCompleteness: string | null
  existingAvailableCount: number | null
  existingObservedAt: string | null
}

/** Strict: anything but the documented answer of the database function is a failure, not a guess. */
export function parseStoreResult(data: unknown): ParsedStoreResult | null {
  if (!isPlainObject(data)) return null
  const outcome = data.outcome
  if (typeof outcome !== 'string') return null
  const stored = STORED_OUTCOMES.includes(outcome)
  if (!stored && !DECLINED_OUTCOMES.includes(outcome)) return null
  if (data.stored !== stored) return null
  const reason = data.reason ?? null
  if (outcome === 'rejected' ? typeof reason !== 'string' || !REJECT_REASONS.includes(reason) : reason !== null) return null
  if (typeof data.completeness !== 'string' || !Number.isInteger(data.available_count)) return null
  const existing = outcome === 'inserted'
  return {
    outcome: outcome as StoreOutcome,
    stored,
    reason: reason as string | null,
    completeness: data.completeness,
    availableCount: data.available_count as number,
    existingCompleteness: existing ? null : (typeof data.existing_completeness === 'string' ? data.existing_completeness : null),
    existingAvailableCount: existing ? null : (Number.isInteger(data.existing_available_count) ? (data.existing_available_count as number) : null),
    existingObservedAt: existing ? null : (typeof data.existing_observed_at === 'string' ? data.existing_observed_at : null),
  }
}
