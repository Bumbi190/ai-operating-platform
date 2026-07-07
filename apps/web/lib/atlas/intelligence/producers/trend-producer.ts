/**
 * lib/atlas/intelligence/producers/trend-producer.ts — Trend Producer
 *
 * Pure functional core. No I/O, no retained state. P1, P2, P3, P4.
 *
 * Detects trends in a numeric time series using ordinary least-squares
 * linear regression. Confidence is derived deterministically from R²,
 * point count, and a boost from consistent prior intelligence (§8.2).
 *
 * Returns null when the series has zero points (graceful cold-start).
 * `insufficient_data` direction is emitted for 1 point (no regression).
 *
 * Canonical refs: §8.1 (hypotheses as first-class objects — trends are
 * candidate hypotheses about direction), §8.2 (calibrated confidence).
 */

import type { SignalRecord } from '../../signals'
import type { IntelligenceDraft, TrendBody, EvidenceChain, IntelligenceObject } from '../types'
import { linearRegression, scaleConfidenceByVolume } from './assessment'

export const TREND_PRODUCER_VERSION = 'trend-producer-1.0.0'

/** A single point in a numeric time series. */
export interface TimeSeriesPoint {
  value:      number
  producedAt: string   // ISO timestamp
  signalId:   string
}

export interface TrendInput {
  metric:       string
  projectId:    string | null
  window:       { since: string; until: string }
  /** Time series, any order (sorted internally). */
  series:       TimeSeriesPoint[]
  /** Prior trend objects for confidence boosting. Newest-first. */
  priorTrends:  IntelligenceObject<TrendBody>[]
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Build a trend artifact from a numeric time series.
 * Returns null when series is empty (no data yet — normal at cold start).
 */
export function buildTrend(input: TrendInput): IntelligenceDraft<TrendBody> | null {
  const { metric, projectId, window, series, priorTrends } = input

  if (series.length === 0) return null

  // Sort ascending by timestamp for regression
  const sorted = [...series].sort(
    (a, b) => new Date(a.producedAt).getTime() - new Date(b.producedAt).getTime(),
  )

  const baseline = sorted[0].value
  const current  = sorted[sorted.length - 1].value

  // ── Evidence chain ────────────────────────────────────────────────────────
  const evidence: EvidenceChain = sorted.map(p => ({
    sourceId:   p.signalId,
    sourceKind: 'signal' as const,
    label:      `${metric} @ ${p.producedAt.slice(0, 10)}`,
    producedAt: p.producedAt,
  }))

  // Add evidence from prior trends used for confidence boost
  for (const t of priorTrends.slice(0, 3)) {
    evidence.push({
      sourceId:   t.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `prior trend:${metric} @ ${t.producedAt.slice(0, 10)}`,
      producedAt: t.producedAt,
    })
  }

  // ── Handle single-point case ──────────────────────────────────────────────
  if (sorted.length === 1) {
    return {
      kind:      'trend',
      projectId,
      subject:   { kind: 'metric', id: metric, name: metric },
      body: {
        metric,
        projectId,
        direction:   'insufficient_data',
        changeRatio: 0,
        r2:          0,
        pointCount:  1,
        window,
        baseline,
        current,
        slope:       0,
      },
      evidence,
      confidence:  0.1,
      producedAt:  new Date().toISOString(),
      producedBy:  TREND_PRODUCER_VERSION,
      window,
    }
  }

  // ── Linear regression ─────────────────────────────────────────────────────
  // Use day-index as t to keep numerics stable
  const t0 = new Date(sorted[0].producedAt).getTime()
  const MS_PER_DAY = 86_400_000
  const points = sorted.map(p => ({
    t: (new Date(p.producedAt).getTime() - t0) / MS_PER_DAY,
    v: p.value,
  }))

  const reg = linearRegression(points)

  // ── Direction & changeRatio ───────────────────────────────────────────────
  const changeRatio = baseline !== 0
    ? (current - baseline) / Math.abs(baseline)
    : 0

  const FLAT_THRESHOLD = 0.03   // < 3% change → flat
  let direction: TrendBody['direction']
  if (Math.abs(changeRatio) < FLAT_THRESHOLD) {
    direction = 'flat'
  } else {
    direction = reg.slope >= 0 ? 'rising' : 'falling'
  }

  // ── Confidence ───────────────────────────────────────────────────────────
  // Base from R² (regression quality) scaled by data volume
  const baseConf    = reg.r2 * 0.8          // max 0.8 from R² alone
  const scaledConf  = scaleConfidenceByVolume(baseConf, sorted.length)

  // Boost for consistent prior trends (same direction repeated)
  const sameDirPriors = priorTrends.filter(t => t.body.direction === direction).length
  const priorBoost    = Math.min(sameDirPriors * 0.03, 0.09)   // max +0.09

  const confidence = Math.min(scaledConf + priorBoost, 0.92)

  return {
    kind:      'trend',
    projectId,
    subject:   { kind: 'metric', id: metric, name: metric },
    body: {
      metric,
      projectId,
      direction,
      changeRatio,
      r2:        reg.r2,
      pointCount: sorted.length,
      window,
      baseline,
      current,
      slope:     reg.slope,
    },
    evidence,
    confidence,
    producedAt: new Date().toISOString(),
    producedBy: TREND_PRODUCER_VERSION,
    window,
  }
}
