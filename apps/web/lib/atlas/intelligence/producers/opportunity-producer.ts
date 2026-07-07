/**
 * lib/atlas/intelligence/producers/opportunity-producer.ts — Opportunity Producer
 *
 * Pure functional core. No I/O, no retained state. P1, P2, P3, P4.
 *
 * Mirrors risk-producer.ts with positive valence: produces an `opportunity`
 * artifact when rising trends indicate a positive deviation from expected
 * trajectory. Returns null when no factual driver exists.
 *
 * Canonical §9: "an opportunity is a deviation with positive expected utility."
 * Same unified operation as risk, opposite sign (§4, Collapse 1).
 */

import type {
  IntelligenceObject, IntelligenceDraft,
  OpportunityBody, TrendBody, InsightBody, BriefBody,
  EvidenceChain,
} from '../types'
import { hasFactualGrounding, propagateConfidence, horizonFromMagnitude } from './assessment'

export const OPPORTUNITY_PRODUCER_VERSION = 'opportunity-producer-1.0.0'

export interface OpportunityInput {
  projectId:  string | null
  window:     { since: string; until: string }
  trends:     IntelligenceObject<TrendBody>[]
  insights:   IntelligenceObject<InsightBody>[]
  briefs:     IntelligenceObject<BriefBody>[]
  narrative?: string
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Build an opportunity artifact from rising trend drivers.
 * Returns null when no factual grounding exists (§9 invariant).
 */
export function buildOpportunity(input: OpportunityInput): IntelligenceDraft<OpportunityBody> | null {
  const { projectId, window, trends, insights, briefs, narrative } = input

  // Identify rising trends as the factual drivers
  const risingTrends = trends.filter(
    t => t.body.direction === 'rising' && t.body.changeRatio > 0.03,
  )

  // ── Factual grounding invariant ───────────────────────────────────────────
  const allSignalEvidence: EvidenceChain = risingTrends.flatMap(t =>
    t.evidence.filter(e => e.sourceKind === 'signal'),
  )
  if (allSignalEvidence.length === 0) return null

  // ── Evidence chain ────────────────────────────────────────────────────────
  const evidence: EvidenceChain = [
    ...allSignalEvidence,
    ...risingTrends.map(t => ({
      sourceId:   t.id,
      sourceKind: 'atlas_intelligence' as const,
      label:      `trend:${t.body.metric} ${t.body.direction} (+${(t.body.changeRatio * 100).toFixed(1)}%)`,
      producedAt: t.producedAt,
    })),
    ...insights.filter(i => i.body.pattern === 'acceleration').map(i => ({
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

  if (!hasFactualGrounding(evidence)) return null

  // ── Affected metrics ──────────────────────────────────────────────────────
  const affectedMetrics = risingTrends.map(t => t.body.metric)

  // ── Magnitude & expected gain ─────────────────────────────────────────────
  const avgChange  = risingTrends.reduce((sum, t) => sum + t.body.changeRatio, 0) / risingTrends.length
  const magnitude  = Math.min(avgChange, 1)
  const avgR2      = risingTrends.reduce((sum, t) => sum + t.body.r2, 0) / risingTrends.length
  const expectedGain = Math.min(magnitude * 0.7 + avgR2 * 0.3, 0.95)

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = propagateConfidence(risingTrends.map(t => t.confidence)) * 0.9

  // ── Subject & description ─────────────────────────────────────────────────
  const subject     = affectedMetrics[0] ?? 'platform'
  const metricList  = affectedMetrics.join(', ')
  const description = narrative
    ?? `Stigande trend på ${metricList} — positiv avvikelse som kan förstärkas.`

  const actions = deriveActions(affectedMetrics)

  return {
    kind:      'opportunity',
    projectId,
    subject:   { kind: 'metric', id: subject, name: subject },
    body: {
      subject,
      description,
      affectedMetrics,
      expectedGain,
      magnitude,
      horizon:    horizonFromMagnitude(magnitude),
      actions,
      projectId,
    },
    evidence,
    confidence,
    producedAt: new Date().toISOString(),
    producedBy: OPPORTUNITY_PRODUCER_VERSION,
    window,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveActions(metrics: string[]): string[] {
  const actions: string[] = []
  if (metrics.some(m => m.includes('mrr') || m.includes('revenue'))) {
    actions.push('Accelerera tillväxten med riktade erbjudanden till befintliga prenumeranter.')
  }
  if (metrics.some(m => m.includes('follower') || m.includes('social'))) {
    actions.push('Förstärk pågående innehållsstrategi — tillväxtmomentumet är positivt.')
  }
  if (actions.length === 0) {
    actions.push('Analysera bakomliggande drivkraft och skala framgångsfaktorn.')
  }
  return actions
}
