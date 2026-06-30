/**
 * lib/atlas/intelligence/producers/risk-producer.ts — Risk Producer
 *
 * Pure functional core. No I/O, no retained state. P1, P2, P3, P4.
 *
 * Produces a `risk` artifact when falling or plateau trends show that a
 * negative deviation from expected trajectory is plausible. Returns null
 * when there is no factual driver — a risk without factual grounding must
 * not be emitted (§9, hasFactualGrounding invariant).
 *
 * likelihood and confidence are kept strictly independent:
 *   likelihood = probability this risk materialises (domain estimate)
 *   confidence = how sure EI is of this assessment (evidence quality)
 *
 * Canonical refs: §9 (Deviation & Significance — negative sign), P3, P4.
 */

import type {
  IntelligenceObject, IntelligenceDraft,
  RiskBody, TrendBody, InsightBody, BriefBody,
  EvidenceChain,
} from '../types'
import { hasFactualGrounding, propagateConfidence, metricImportance, horizonFromMagnitude } from './assessment'

export const RISK_PRODUCER_VERSION = 'risk-producer-1.0.0'

export interface RiskInput {
  projectId:  string | null
  window:     { since: string; until: string }
  trends:     IntelligenceObject<TrendBody>[]
  insights:   IntelligenceObject<InsightBody>[]
  briefs:     IntelligenceObject<BriefBody>[]
  /** Optional narrative override (e.g. from LLM); deterministic summary used when absent. */
  narrative?: string
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Build a risk artifact from falling trend drivers.
 * Returns null when no factual grounding exists (§9 invariant).
 */
export function buildRisk(input: RiskInput): IntelligenceDraft<RiskBody> | null {
  const { projectId, window, trends, insights, briefs, narrative } = input

  // Identify falling trends as the factual drivers
  const fallingTrends = trends.filter(
    t => t.body.direction === 'falling' && Math.abs(t.body.changeRatio) > 0.03,
  )

  // ── Factual grounding invariant ───────────────────────────────────────────
  // Collect all signal-sourced evidence from falling trends
  const allSignalEvidence: EvidenceChain = fallingTrends.flatMap(t =>
    t.evidence.filter(e => e.sourceKind === 'signal'),
  )
  if (allSignalEvidence.length === 0) return null   // no factual driver

  // ── Evidence chain ────────────────────────────────────────────────────────
  const evidence: EvidenceChain = [
    ...allSignalEvidence,
    ...fallingTrends.map(t => ({
      sourceId:   t.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `trend:${t.body.metric} ${t.body.direction} (Δ${(t.body.changeRatio * 100).toFixed(1)}%)`,
      producedAt: t.producedAt,
    })),
    ...insights.filter(i => i.body.pattern === 'deceleration' || i.body.pattern === 'divergence').map(i => ({
      sourceId:   i.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `insight:${i.body.pattern}`,
      producedAt: i.producedAt,
    })),
    ...briefs.slice(0, 1).map(b => ({
      sourceId:   b.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `brief:${b.body.scope}`,
      producedAt: b.producedAt,
    })),
  ]

  // Final invariant check: evidence chain must have factual grounding
  if (!hasFactualGrounding(evidence)) return null

  // ── Affected metrics ──────────────────────────────────────────────────────
  const affectedMetrics = fallingTrends.map(t => t.body.metric)

  // ── Magnitude ─────────────────────────────────────────────────────────────
  const avgAbsChange = fallingTrends.reduce((sum, t) => sum + Math.abs(t.body.changeRatio), 0)
    / fallingTrends.length
  const magnitude = Math.min(avgAbsChange, 1)

  // ── Likelihood ────────────────────────────────────────────────────────────
  // Driven by trend R² (how strong the signal is) + magnitude
  const avgR2 = fallingTrends.reduce((sum, t) => sum + t.body.r2, 0) / fallingTrends.length
  const likelihood = Math.min(0.5 + avgR2 * 0.3 + magnitude * 0.2, 0.95)

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = propagateConfidence(fallingTrends.map(t => t.confidence)) * 0.9

  // ── Subject & description ─────────────────────────────────────────────────
  const subject = affectedMetrics[0] ?? 'platform'
  const metricList = affectedMetrics.join(', ')
  const description = narrative
    ?? `Fallande trend på ${metricList} — negativ avvikelse från förväntad bana under perioden.`

  const mitigations = deriveMitigations(affectedMetrics)

  return {
    kind:      'risk',
    projectId,
    subject:   { kind: 'metric', id: subject, name: subject },
    body: {
      subject,
      description,
      affectedMetrics,
      likelihood,
      magnitude,
      horizon:     horizonFromMagnitude(magnitude),
      mitigations,
      projectId,
    },
    evidence,
    confidence,
    producedAt: new Date().toISOString(),
    producedBy: RISK_PRODUCER_VERSION,
    window,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveMitigations(metrics: string[]): string[] {
  const mitigations: string[] = []
  if (metrics.some(m => m.includes('mrr') || m.includes('revenue'))) {
    mitigations.push('Granska churn och prenumerationsflöde.')
  }
  if (metrics.some(m => m.includes('follower') || m.includes('social'))) {
    mitigations.push('Öka publiceringsfrekvens eller experimentera med innehållsformat.')
  }
  if (mitigations.length === 0) {
    mitigations.push('Granska underliggande datakvalitet och insamlingsprocess.')
  }
  return mitigations
}
