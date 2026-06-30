/**
 * lib/atlas/intelligence/producers/assessment-orchestrator.ts — Assessment Orchestrator Shell
 *
 * Imperative shell. Owns all I/O. Pure `buildRisk` and `buildOpportunity`
 * cores have zero I/O.
 *
 * Reads trend, insight, and brief objects from the store (produced earlier
 * in the same cron run), then calls both risk and opportunity producers.
 * Both are called against the same pre-loaded context — no double scan (§9).
 *
 * NOTE: This orchestrator runs risk and opportunity as two separate calls,
 * which is the Epic 1 interim shape. Epic 3 replaces this with a single
 * Deviation & Significance operation (deviation-orchestrator.ts) that
 * handles both signs in one unified pass. This file will be marked
 * @deprecated at Epic 3 and removed in a subsequent cleanup.
 *
 * P2: no retained state.
 * P6: no direct service calls in the producer cores.
 */

import { createIntelligenceStore } from '../postgres-store'
import type { IntelligenceStore } from '../store'
import type { IntelligenceObject, RiskBody, OpportunityBody, TrendBody, InsightBody, BriefBody } from '../types'
import { buildRisk } from './risk-producer'
import { buildOpportunity } from './opportunity-producer'

export interface RunAssessmentArgs {
  projectId:     string | null
  windowSince?:  string
  windowUntil?:  string
  store?:        IntelligenceStore
}

export interface AssessmentResult {
  risk?:        IntelligenceObject<RiskBody>
  opportunity?: IntelligenceObject<OpportunityBody>
}

export async function runAssessmentProducer(
  args: RunAssessmentArgs,
): Promise<AssessmentResult> {
  const { projectId } = args
  const until  = args.windowUntil ?? new Date().toISOString()
  const since  = args.windowSince ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const window = { since, until }
  const store  = args.store ?? createIntelligenceStore()

  // ── 1. Load input artifacts (shared context — no double scan) ─────────────
  const [trends, insights, briefs] = await Promise.all([
    store.query<TrendBody>({ kinds: ['trend'], projectId, limit: 20 }).catch(() => []),
    store.query<InsightBody>({ kinds: ['insight'], projectId, limit: 5 }).catch(() => []),
    store.query<BriefBody>({ kinds: ['brief'], projectId, limit: 3 }).catch(() => []),
  ])

  const sharedInput = { projectId, window, trends, insights, briefs }

  const result: AssessmentResult = {}

  // ── 2. Risk assessment ────────────────────────────────────────────────────
  const riskDraft = buildRisk(sharedInput)
  if (riskDraft) {
    const prior = await store.query<RiskBody>({ kinds: ['risk'], projectId, limit: 1 }).catch(() => [])
    result.risk = prior.length > 0
      ? await store.supersede<RiskBody>(prior[0].id, riskDraft)
      : await store.append<RiskBody>(riskDraft)

    console.log(
      `[assessment-orchestrator] produced risk ${result.risk.id} ` +
      `(likelihood=${result.risk.body.likelihood.toFixed(2)}, ` +
      `confidence=${result.risk.confidence.toFixed(3)})`,
    )
  }

  // ── 3. Opportunity assessment ─────────────────────────────────────────────
  const oppDraft = buildOpportunity(sharedInput)
  if (oppDraft) {
    const prior = await store.query<OpportunityBody>({ kinds: ['opportunity'], projectId, limit: 1 }).catch(() => [])
    result.opportunity = prior.length > 0
      ? await store.supersede<OpportunityBody>(prior[0].id, oppDraft)
      : await store.append<OpportunityBody>(oppDraft)

    console.log(
      `[assessment-orchestrator] produced opportunity ${result.opportunity.id} ` +
      `(expectedGain=${result.opportunity.body.expectedGain.toFixed(2)}, ` +
      `confidence=${result.opportunity.confidence.toFixed(3)})`,
    )
  }

  if (!result.risk && !result.opportunity) {
    console.log(
      `[assessment-orchestrator] no risk or opportunity (scope=${projectId ?? 'global'}) — ` +
      'insufficient falling/rising trends with factual grounding',
    )
  }

  return result
}
