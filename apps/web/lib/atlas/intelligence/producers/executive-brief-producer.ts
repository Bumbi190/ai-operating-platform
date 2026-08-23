/**
 * lib/atlas/intelligence/producers/executive-brief-producer.ts
 * Apex Daily Executive Brief — pure functional core.
 *
 * Synthesises already-persisted intelligence artifacts (brief · trend · insight ·
 * risk · opportunity) into the canonical five-section shape of §13.1. It is the
 * apex of the Executive layer: the input-tier `brief` reports a situation, this
 * one says what it means and what the founder should do about it.
 *
 * "The objective is not summarization; it is executive awareness." (§13)
 *
 * Purity contract (P1, P2, P6) — enforced by test:
 *   • no database, network, Supabase, Memory or filesystem access
 *   • no clock read: `now` is injected, so identical input ⇒ identical output
 *   • no action execution and no authority of any kind
 *
 * Signed judgement comes from the canonical §9 artifacts (risk / opportunity),
 * never from a hardcoded per-metric polarity table. Trends and insights report
 * movement; risks and opportunities say whether that movement is good or bad.
 *
 * Canonical refs: §9 (deviation & significance), §13.1 (brief shape),
 * §13.2 (horizons), §13.3 (briefs are persisted artifacts read back as input),
 * canonical book §8.7 (brief structure), §8.15 (material changes), §8.17 (no
 * material change), §8.22 (project scope integrity).
 */

import type {
  BriefBody,
  Confidence,
  EvidenceChain,
  EvidenceEntry,
  ExecutiveBriefBody,
  ExecutiveBriefHorizon,
  ExecutiveBriefSection,
  ExecutiveRecommendation,
  InsightBody,
  IntelligenceDraft,
  IntelligenceObject,
  OpportunityBody,
  RiskBody,
  TrendBody,
} from '../types'
import { hasFactualGrounding, propagateConfidence, sortById } from './assessment'

export const EXECUTIVE_BRIEF_PRODUCER_VERSION = 'executive-brief-producer-1.0.0'

/** §13.1 keeps "what needs you" deliberately short — cognitive load is the budget. */
export const MAX_WHAT_NEEDS_YOU = 5
/** A recommendation the founder cannot act on is noise; cap the decision set too. */
export const MAX_RECOMMENDATIONS = 5
/** Below this fractional movement a trend is not a material change (§8.15/§8.16). */
export const MATERIAL_CHANGE_RATIO = 0.05

// ── Input ─────────────────────────────────────────────────────────────────────

export interface ExecutiveBriefInput {
  scope:     'project' | 'global'
  projectId: string | null
  window:    { since: string; until: string }
  horizon:   ExecutiveBriefHorizon
  /** Already-resolved, already-scoped intelligence artifacts. */
  briefs:        IntelligenceObject<BriefBody>[]
  trends:        IntelligenceObject<TrendBody>[]
  insights:      IntelligenceObject<InsightBody>[]
  risks:         IntelligenceObject<RiskBody>[]
  opportunities: IntelligenceObject<OpportunityBody>[]
  /** Most recent apex brief for the same scope, for continuity (§13.3). */
  priorBrief: IntelligenceObject<ExecutiveBriefBody> | null
  /** Injected clock. The core never reads time itself. */
  now: string
}

// ── Core ──────────────────────────────────────────────────────────────────────

export function buildExecutiveBrief(input: ExecutiveBriefInput): IntelligenceDraft<ExecutiveBriefBody> {
  const { scope, projectId, window, horizon, now } = input

  // ── 1. Admissibility ──────────────────────────────────────────────────────
  //   Two filters, both fail-closed:
  //     • superseded artifacts are stale reasoning and never contribute (§8.4)
  //     • an artifact from another project can never enter this brief (§8.22)
  //   Global scope consumes only global (projectId === null) artifacts, so a
  //   world brief cannot silently widen into project-scoped material.
  const admissible = <B>(objects: IntelligenceObject<B>[]): IntelligenceObject<B>[] =>
    sortById(objects.filter(o => o.supersededBy === null && o.projectId === projectId))

  const briefs        = admissible(input.briefs)
  const trends        = admissible(input.trends)
  const insights      = admissible(input.insights)
  const risks         = admissible(input.risks)
  const opportunities = admissible(input.opportunities)

  const consumed: IntelligenceObject<unknown>[] = [
    ...briefs, ...trends, ...insights, ...risks, ...opportunities,
  ]

  // ── 2. Evidence chain (P4) ────────────────────────────────────────────────
  //   One entry per consumed artifact, plus the prior brief when present. The
  //   apex never re-cites raw signals: it cites the reasoning it consumed, and
  //   that reasoning carries its own chain down to the signal roots.
  const evidence: EvidenceChain = [
    ...consumed.map(objectEvidence),
    ...(input.priorBrief ? [objectEvidence(input.priorBrief)] : []),
  ]

  // ── 3. Signed metric polarity from the canonical §9 artifacts ─────────────
  const negativeMetrics = new Set(risks.flatMap(r => r.body.affectedMetrics))
  const positiveMetrics = new Set(opportunities.flatMap(o => o.body.affectedMetrics))

  // ── 4. What changed (§8.15) ───────────────────────────────────────────────
  const whatChanged: ExecutiveBriefSection[] = [
    ...trends.filter(isMaterialTrend).map(trend => ({
      label:     trend.body.metric,
      detail:    describeTrend(trend.body),
      direction: metricDirection(trend.body.metric, negativeMetrics, positiveMetrics),
      confidence: trend.confidence,
      evidence:  [objectEvidence(trend)],
    })),
    ...insights.filter(i => i.body.pattern !== 'no_pattern').map(insight => ({
      label:     insight.body.pattern,
      detail:    insight.body.description,
      direction: patternDirection(insight.body, negativeMetrics, positiveMetrics),
      confidence: insight.confidence,
      evidence:  [objectEvidence(insight)],
    })),
  ]

  // ── 5. What it means ──────────────────────────────────────────────────────
  //   Interpretation, not restatement (P3). Each line ties a signed finding to
  //   its implication for the goals in play.
  const whatItMeans: ExecutiveBriefSection[] = [
    ...risks.map(risk => ({
      label:     risk.body.subject,
      detail:    `${risk.body.description} Expected exposure is ${describeExposure(risk.body.likelihood * risk.body.magnitude)} over the ${readableHorizon(risk.body.horizon)}.`,
      direction: 'negative' as const,
      confidence: risk.confidence,
      evidence:  [objectEvidence(risk)],
    })),
    ...opportunities.map(opportunity => ({
      label:     opportunity.body.subject,
      detail:    `${opportunity.body.description} Expected upside is ${describeExposure(opportunity.body.expectedGain * opportunity.body.magnitude)} over the ${readableHorizon(opportunity.body.horizon)}.`,
      direction: 'positive' as const,
      confidence: opportunity.confidence,
      evidence:  [objectEvidence(opportunity)],
    })),
  ]

  // ── 6. What I recommend ───────────────────────────────────────────────────
  //   A recommendation may only rest on a finding that reaches factual
  //   grounding, so an unsupported recommendation cannot appear (§9, P4).
  const recommendations: ExecutiveRecommendation[] = [
    ...risks
      .filter(risk => hasFactualGrounding(risk.evidence) && risk.body.mitigations.length > 0)
      .map(risk => ({
        summary:        risk.body.mitigations[0],
        counterfactual: `Do nothing: ${risk.body.subject} continues on its current path with ${describeExposure(risk.body.likelihood * risk.body.magnitude)} expected exposure.`,
        defeater:       `A reversal in ${listMetrics(risk.body.affectedMetrics)} would retire this recommendation.`,
        confidence:     risk.confidence,
        evidence:       [objectEvidence(risk)],
      })),
    ...opportunities
      .filter(opportunity => hasFactualGrounding(opportunity.evidence) && opportunity.body.actions.length > 0)
      .map(opportunity => ({
        summary:        opportunity.body.actions[0],
        counterfactual: `Do nothing: ${describeExposure(opportunity.body.expectedGain * opportunity.body.magnitude)} expected upside in ${listMetrics(opportunity.body.affectedMetrics)} is left unclaimed.`,
        defeater:       `A stall in ${listMetrics(opportunity.body.affectedMetrics)} would retire this recommendation.`,
        confidence:     opportunity.confidence,
        evidence:       [objectEvidence(opportunity)],
      })),
  ]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_RECOMMENDATIONS)

  // ── 7. What needs you (§10 gate) ──────────────────────────────────────────
  //   Near-term signed findings only. Mid-term material is in the brief body;
  //   it does not claim the founder's attention today.
  const whatNeedsYou: ExecutiveBriefSection[] = [
    ...risks.filter(r => r.body.horizon === 'near_term').map(risk => ({
      label:     `Risk · ${risk.body.subject}`,
      detail:    risk.body.mitigations[0] ?? risk.body.description,
      direction: 'negative' as const,
      confidence: risk.confidence,
      evidence:  [objectEvidence(risk)],
    })),
    ...opportunities.filter(o => o.body.horizon === 'near_term').map(opportunity => ({
      label:     `Opportunity · ${opportunity.body.subject}`,
      detail:    opportunity.body.actions[0] ?? opportunity.body.description,
      direction: 'positive' as const,
      confidence: opportunity.confidence,
      evidence:  [objectEvidence(opportunity)],
    })),
  ]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_WHAT_NEEDS_YOU)

  // ── 8. Confidence ─────────────────────────────────────────────────────────
  //   Propagated from the artifacts actually consumed (§8.2). With nothing to
  //   reason over the brief is still a valid artifact, at floor confidence.
  const confidence: Confidence = consumed.length === 0
    ? 0.1
    : propagateConfidence(consumed.map(o => o.confidence))

  // ── 9. Situation and §8.17 honesty ────────────────────────────────────────
  const noMaterialChange = whatChanged.length === 0
  const situation = deriveSituation({
    scope, noMaterialChange, whatChanged, risks, opportunities, briefs,
    consumedCount: consumed.length,
    priorBrief: input.priorBrief,
  })

  return {
    kind:      'executive_brief',
    projectId,
    subject:   projectId ? { kind: 'project', id: projectId } : null,
    body: {
      horizon,
      scope,
      projectId,
      window,
      situation,
      whatChanged,
      whatItMeans,
      recommendations,
      whatNeedsYou,
      noMaterialChange,
      sourcedFrom: consumed.map(o => o.id),
      priorBriefId: input.priorBrief?.id ?? null,
    },
    evidence,
    confidence,
    producedAt: now,
    producedBy: EXECUTIVE_BRIEF_PRODUCER_VERSION,
    window,
  }
}

// ── Private helpers (all pure) ────────────────────────────────────────────────

function objectEvidence(object: IntelligenceObject<unknown>): EvidenceEntry {
  return {
    sourceId:   object.id,
    sourceKind: 'atlas_intelligence',
    label:      `${object.kind}:${object.producedBy}`,
    producedAt: object.producedAt,
  }
}

function isMaterialTrend(trend: IntelligenceObject<TrendBody>): boolean {
  if (trend.body.direction === 'insufficient_data') return false
  if (trend.body.direction === 'flat') return false
  return Math.abs(trend.body.changeRatio) >= MATERIAL_CHANGE_RATIO
}

function metricDirection(
  metric: string,
  negative: Set<string>,
  positive: Set<string>,
): ExecutiveBriefSection['direction'] {
  const isNegative = negative.has(metric)
  const isPositive = positive.has(metric)
  // A metric named by both a risk and an opportunity is genuinely ambiguous;
  // reporting it as neutral is honest, inventing a winner is not.
  if (isNegative && isPositive) return 'neutral'
  if (isNegative) return 'negative'
  if (isPositive) return 'positive'
  return 'neutral'
}

function patternDirection(
  insight: InsightBody,
  negative: Set<string>,
  positive: Set<string>,
): ExecutiveBriefSection['direction'] {
  const directions = new Set(insight.metrics.map(m => metricDirection(m, negative, positive)))
  directions.delete('neutral')
  return directions.size === 1 ? [...directions][0] : 'neutral'
}

function describeTrend(trend: TrendBody): string {
  const pct = Math.round(Math.abs(trend.changeRatio) * 100)
  const move = trend.direction === 'rising' ? 'up' : 'down'
  return `${trend.metric} is ${move} ${pct}% across the window (R²=${trend.r2.toFixed(2)}, ${trend.pointCount} points).`
}

function describeExposure(value: number): string {
  if (value >= 0.5) return 'high'
  if (value >= 0.2) return 'moderate'
  return 'low'
}

function readableHorizon(horizon: 'near_term' | 'mid_term'): string {
  return horizon === 'near_term' ? 'near term' : 'mid term'
}

function listMetrics(metrics: string[]): string {
  return metrics.length > 0 ? metrics.join(', ') : 'the underlying metrics'
}

interface SituationInput {
  scope: 'project' | 'global'
  noMaterialChange: boolean
  whatChanged: ExecutiveBriefSection[]
  risks: IntelligenceObject<RiskBody>[]
  opportunities: IntelligenceObject<OpportunityBody>[]
  briefs: IntelligenceObject<BriefBody>[]
  consumedCount: number
  priorBrief: IntelligenceObject<ExecutiveBriefBody> | null
}

/**
 * One reasoned sentence (§13.1). Never a list, never manufactured urgency
 * (§8.17). Continuity is stated when a prior brief was read (§13.3).
 */
function deriveSituation(input: SituationInput): string {
  const { scope, noMaterialChange, whatChanged, risks, opportunities, consumedCount, priorBrief } = input
  const where = scope === 'global' ? 'the portfolio' : 'this project'

  if (consumedCount === 0) {
    return `No intelligence artifacts were available for ${where} in this window, so no executive judgement can be offered yet.`
  }
  if (noMaterialChange) {
    const continuity = priorBrief ? ' The position is unchanged since the previous brief.' : ''
    return `No material change in ${where} across the window; ${consumedCount} intelligence artifacts were reviewed and none crossed the materiality threshold.${continuity}`
  }

  const nearTermRisks = risks.filter(r => r.body.horizon === 'near_term').length
  const pressure =
    nearTermRisks > 0 ? `${nearTermRisks} near-term risk${nearTermRisks === 1 ? '' : 's'} carry the most weight`
    : opportunities.length > 0 ? `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} carry the most weight`
    : 'no signed finding dominates'

  return `${whatChanged.length} material change${whatChanged.length === 1 ? '' : 's'} in ${where} across the window, where ${pressure}.`
}
