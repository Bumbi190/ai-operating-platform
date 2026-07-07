/**
 * lib/atlas/intelligence/producers/insight-producer.ts — Insight Producer
 *
 * Pure functional core. No I/O, no retained state. P1, P2, P3, P4.
 *
 * Detects cross-metric patterns by reasoning over existing trend and brief
 * artifacts. Produces an InsightBody classifying the pattern as:
 *   acceleration  — multiple metrics all rising and change accelerating
 *   deceleration  — multiple metrics falling or change rate slowing
 *   divergence    — metrics moving in opposite directions simultaneously
 *   plateau       — metrics were moving but are now flat
 *   no_pattern    — insufficient data or no clear cross-metric pattern
 *
 * Confidence is propagated from the source trend confidences (§8.2).
 *
 * Canonical refs: §8.1 (pattern detection), §8.2 (confidence propagation).
 */

import type { IntelligenceObject, IntelligenceDraft, InsightBody, TrendBody, BriefBody, EvidenceChain } from '../types'
import { propagateConfidence } from './assessment'

export const INSIGHT_PRODUCER_VERSION = 'insight-producer-1.0.0'

export interface InsightInput {
  projectId:  string | null
  window:     { since: string; until: string }
  trends:     IntelligenceObject<TrendBody>[]
  briefs:     IntelligenceObject<BriefBody>[]
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Derive a cross-metric insight from trend and brief artifacts.
 * Always returns a draft (never null); may emit `no_pattern` when data
 * is insufficient rather than guessing (§8.5 — make the gap explicit).
 */
export function buildInsight(input: InsightInput): IntelligenceDraft<InsightBody> {
  const { projectId, window, trends, briefs } = input

  // ── Evidence chain ────────────────────────────────────────────────────────
  const evidence: EvidenceChain = [
    ...trends.map(t => ({
      sourceId:   t.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `trend:${t.body.metric} ${t.body.direction}`,
      producedAt: t.producedAt,
    })),
    ...briefs.slice(0, 2).map(b => ({
      sourceId:   b.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `brief:${b.body.scope} @ ${b.producedAt.slice(0, 10)}`,
      producedAt: b.producedAt,
    })),
  ]

  // ── Insufficient data ─────────────────────────────────────────────────────
  const actionableTrends = trends.filter(t => t.body.direction !== 'insufficient_data')
  if (actionableTrends.length === 0) {
    return makeInsight(projectId, window, evidence, 'no_pattern', [], 0.1,
      'Otillräckliga trenddata för att identifiera ett mönster.')
  }

  // ── Pattern detection ─────────────────────────────────────────────────────
  const rising  = actionableTrends.filter(t => t.body.direction === 'rising')
  const falling = actionableTrends.filter(t => t.body.direction === 'falling')
  const flat    = actionableTrends.filter(t => t.body.direction === 'flat')

  const allMetrics  = actionableTrends.map(t => t.body.metric)
  const sourceConfs = actionableTrends.map(t => t.confidence)

  // Divergence: some rising, some falling simultaneously
  if (rising.length > 0 && falling.length > 0) {
    const risingNames  = rising.map(t => t.body.metric).join(', ')
    const fallingNames = falling.map(t => t.body.metric).join(', ')
    const conf = propagateConfidence(sourceConfs) * 0.9
    return makeInsight(projectId, window, evidence, 'divergence', allMetrics, conf,
      `Divergerande mönster: ${risingNames} stiger medan ${fallingNames} faller.`)
  }

  // Acceleration: all rising with increasing slope vs prior
  if (rising.length === actionableTrends.length && rising.length >= 2) {
    const conf = propagateConfidence(rising.map(t => t.confidence)) * 0.85
    const names = rising.map(t => t.body.metric).join(', ')
    return makeInsight(projectId, window, evidence, 'acceleration', allMetrics, conf,
      `Acceleration: ${names} stiger samstämmigt.`)
  }

  // Deceleration: all falling
  if (falling.length === actionableTrends.length && falling.length >= 2) {
    const conf = propagateConfidence(falling.map(t => t.confidence)) * 0.85
    const names = falling.map(t => t.body.metric).join(', ')
    return makeInsight(projectId, window, evidence, 'deceleration', allMetrics, conf,
      `Deceleration: ${names} faller samstämmigt.`)
  }

  // Plateau: all flat
  if (flat.length === actionableTrends.length && flat.length >= 1) {
    const conf = propagateConfidence(flat.map(t => t.confidence)) * 0.75
    const names = flat.map(t => t.body.metric).join(', ')
    return makeInsight(projectId, window, evidence, 'plateau', allMetrics, conf,
      `Platå: ${names} har stabiliserats utan signifikant rörelse.`)
  }

  // Single rising or single falling — degenerate, emit no_pattern
  if (actionableTrends.length === 1) {
    const t   = actionableTrends[0]
    const conf = t.confidence * 0.5
    return makeInsight(projectId, window, evidence, 'no_pattern', allMetrics, conf,
      `Enbart ${t.body.metric} (${t.body.direction}); otillräckligt för korsmetrisk analys.`)
  }

  // Mixed single types with no cross-metric pattern
  const conf = propagateConfidence(sourceConfs) * 0.4
  return makeInsight(projectId, window, evidence, 'no_pattern', allMetrics, conf,
    'Inget tydligt korsmetriskt mönster identifierat.')
}

// ── Private helpers ───────────────────────────────────────────────────────────

function makeInsight(
  projectId:   string | null,
  window:      { since: string; until: string },
  evidence:    EvidenceChain,
  pattern:     InsightBody['pattern'],
  metrics:     string[],
  confidence:  number,
  description: string,
): IntelligenceDraft<InsightBody> {
  return {
    kind:      'insight',
    projectId,
    subject:   null,
    body:      { pattern, metrics, projectId, description, window },
    evidence,
    confidence: Math.min(Math.max(confidence, 0), 1),
    producedAt: new Date().toISOString(),
    producedBy: INSIGHT_PRODUCER_VERSION,
    window,
  }
}
