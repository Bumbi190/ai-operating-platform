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
 * Signal kind:  handlarborsen.marketplace_snapshot
 * Version:      handlarborsen-marketplace-collector-1.0.0
 * Cadence:      none yet — no cron is scheduled in this phase.
 */

import { BaseCollector, type CollectorContext } from './types'

export const HANDLARBORSEN_COLLECTOR_VERSION = 'handlarborsen-marketplace-collector-1.0.0'
export const HANDLARBORSEN_PROJECT_ID = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
export const HANDLARBORSEN_PROJECT_SLUG = 'handlarborsen'
/** Canonical production host (the apex domains 308-redirect here). Fixed on purpose. */
export const HANDLARBORSEN_METRICS_URL = 'https://www.handlarborsen.se/api/internal/atlas-metrics'
export const HANDLARBORSEN_TOKEN_ENV = 'HANDLARBORSEN_METRICS_TOKEN'

const MIN_TOKEN_LENGTH = 32
const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_CHARS = 16_384
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

// ── Collector ─────────────────────────────────────────────────────────────────

export class HandlarborsenMarketplaceCollector extends BaseCollector {
  readonly id         = 'handlarborsen.marketplace'
  readonly signalKind = 'handlarborsen.marketplace_snapshot'
  readonly version    = HANDLARBORSEN_COLLECTOR_VERSION
  readonly source     = 'handlarborsen'

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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
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
      throw new Error('handlarborsen_metrics_network_error')
    } finally {
      clearTimeout(timer)
    }

    if (response.status !== 200) throw new Error(`handlarborsen_metrics_http_${response.status}`)

    let text: string
    try {
      text = await response.text()
    } catch {
      throw new Error('handlarborsen_metrics_network_error')
    }
    if (text.length > MAX_BODY_CHARS) throw new Error('handlarborsen_metrics_invalid:body_too_large')
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('handlarborsen_metrics_invalid:not_json')
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

  async store(payload: Record<string, unknown>, ctx: CollectorContext): Promise<void> {
    if (ctx.projectId !== HANDLARBORSEN_PROJECT_ID) return
    const metrics = payload.metrics as Record<MarketplaceMetricKey, number | null>
    // handlarborsen_marketplace_snapshots is not in generated types — established cast.
    const { error } = await (ctx.db as any).from('handlarborsen_marketplace_snapshots').upsert(
      {
        project_id:     ctx.projectId,
        snapshot_date:  ctx.snapshotDate,
        observed_at:    payload.observed_at,
        captured_at:    new Date().toISOString(),
        schema_version: 1,
        window_hours:   24,
        completeness:   payload.completeness,
        unavailable:    payload.unavailable,
        ...metrics,
      },
      { onConflict: 'project_id,snapshot_date' },
    )
    if (error) throw new Error(`handlarborsen_marketplace_snapshots upsert failed: ${error.message}`)
  }
}
