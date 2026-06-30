/**
 * lib/atlas/intelligence/producers/assessment.ts — Shared Pure Helpers
 *
 * Deterministic, zero-I/O utility functions shared by all producer cores.
 * Every function here is a pure computation: same inputs → same outputs.
 *
 * P2: no retained state, no I/O.
 * Canonical refs: §8.2 (confidence), §8.3 (evidence), §9 (significance).
 */

import type { Confidence, EvidenceChain } from '../types'

// ── Factual grounding ─────────────────────────────────────────────────────────

/**
 * Returns true if at least one evidence entry comes from an actual signal.
 * A risk or opportunity without factual grounding must not be emitted (§9).
 * "Factual" = sourced from a signal (not just memory or config).
 */
export function hasFactualGrounding(evidence: EvidenceChain): boolean {
  return evidence.some(e => e.sourceKind === 'signal')
}

// ── Confidence propagation ────────────────────────────────────────────────────

/**
 * Combine multiple confidence values into one.
 * Uses harmonic mean — pulled down by weak signals, not dominated by strong ones.
 * Empty array returns 0. Single value returns that value unchanged.
 *
 * Canonical §8.2: confidence is calibrated, not averaged naively.
 */
export function propagateConfidence(confidences: Confidence[]): Confidence {
  if (confidences.length === 0) return 0
  if (confidences.length === 1) return clamp(confidences[0])
  const sumReciprocals = confidences.reduce((acc, c) => acc + 1 / Math.max(c, 0.001), 0)
  return clamp(confidences.length / sumReciprocals)
}

/**
 * Scale confidence by the data-volume factor.
 * More data points → higher ceiling; fewer → lower ceiling.
 * Designed so a single point can never exceed 0.4 regardless of R².
 */
export function scaleConfidenceByVolume(base: Confidence, pointCount: number): Confidence {
  const volumeFactor = Math.min(pointCount / 20, 1)   // saturates at 20 points
  return clamp(base * (0.4 + 0.6 * volumeFactor))
}

// ── Significance helpers ──────────────────────────────────────────────────────

/**
 * Assign an importance weight to a metric slug.
 * Higher = more important to the executive view.
 * Revenue metrics are highest; social follower counts are lower.
 * Used for salience ranking inputs (Epic 6) and confidence weighting.
 */
export function metricImportance(metric: string): number {
  if (metric.includes('mrr') || metric.includes('revenue')) return 1.0
  if (metric.includes('subscriber') || metric.includes('churn')) return 0.9
  if (metric.includes('follower')) return 0.6
  if (metric.includes('reach') || metric.includes('impression')) return 0.5
  if (metric.includes('engagement')) return 0.55
  if (metric.includes('score')) return 0.5
  return 0.4
}

/**
 * Classify the time horizon of a deviation based on its magnitude and slope.
 * Large magnitude or steep slope → near-term (action needed now).
 * Smaller → mid-term (monitor).
 */
export function horizonFromMagnitude(magnitude: number): 'near_term' | 'mid_term' {
  return magnitude >= 0.3 ? 'near_term' : 'mid_term'
}

// ── Sorting ───────────────────────────────────────────────────────────────────

/** Stable sort by id. Used for deterministic test output. */
export function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// ── Linear regression ─────────────────────────────────────────────────────────

export interface RegressionResult {
  slope:     number
  intercept: number
  r2:        number
}

/**
 * Ordinary least-squares linear regression on (t_i, v_i) pairs.
 * t_i should be day-indices (0, 1, 2, ...) for stable numerics.
 * Returns slope, intercept, and R² (coefficient of determination).
 * With fewer than 2 points returns { slope:0, intercept: mean|0, r2: 0 }.
 */
export function linearRegression(points: Array<{ t: number; v: number }>): RegressionResult {
  const n = points.length
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 }
  if (n === 1) return { slope: 0, intercept: points[0].v, r2: 0 }

  let sumT = 0, sumV = 0, sumTT = 0, sumTV = 0
  for (const { t, v } of points) {
    sumT  += t
    sumV  += v
    sumTT += t * t
    sumTV += t * v
  }

  const denom = n * sumTT - sumT * sumT
  if (denom === 0) return { slope: 0, intercept: sumV / n, r2: 0 }

  const slope     = (n * sumTV - sumT * sumV) / denom
  const intercept = (sumV - slope * sumT) / n

  // R² = 1 - SS_res / SS_tot
  const meanV  = sumV / n
  let ssTot = 0, ssRes = 0
  for (const { t, v } of points) {
    const predicted = slope * t + intercept
    ssRes += (v - predicted) ** 2
    ssTot += (v - meanV) ** 2
  }

  const r2 = ssTot < 1e-12 ? 0 : clamp(1 - ssRes / ssTot)
  return { slope, intercept, r2 }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clamp(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
