/**
 * lib/atlas/intelligence/producers/insight-orchestrator.ts — Insight Orchestrator Shell
 *
 * Imperative shell. Owns all I/O. Pure `buildInsight` core has zero I/O.
 *
 * Reads recently-produced trend and brief objects from the store (produced
 * in the same cron run or the prior run), then calls `buildInsight` (pure)
 * to derive cross-metric patterns.
 *
 * One insight is produced per (projectId, window) scope per run.
 * Prior insight is superseded to maintain the track record (§8.4).
 *
 * P2: no retained state.
 * P6: no direct service calls in the producer core.
 */

import { createIntelligenceStore } from '../postgres-store'
import type { IntelligenceStore } from '../store'
import type { IntelligenceObject, InsightBody, TrendBody, BriefBody } from '../types'
import { buildInsight } from './insight-producer'

export interface RunInsightArgs {
  projectId:     string | null
  windowSince?:  string
  windowUntil?:  string
  store?:        IntelligenceStore
}

export async function runInsightProducer(
  args: RunInsightArgs,
): Promise<IntelligenceObject<InsightBody>> {
  const { projectId } = args
  const until  = args.windowUntil ?? new Date().toISOString()
  const since  = args.windowSince ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const window = { since, until }
  const store  = args.store ?? createIntelligenceStore()

  // ── 1. Load input artifacts from store ───────────────────────────────────
  const [trends, briefs] = await Promise.all([
    store.query<TrendBody>({ kinds: ['trend'], projectId, limit: 20 }).catch(() => []),
    store.query<BriefBody>({ kinds: ['brief'], projectId, limit: 5  }).catch(() => []),
  ])

  // ── 2. Build insight (pure core, zero I/O) ────────────────────────────────
  const draft = buildInsight({ projectId, window, trends, briefs })

  // ── 3. Supersede prior insight of same scope ──────────────────────────────
  const prior = await store.query<InsightBody>({
    kinds:     ['insight'],
    projectId,
    limit:     1,
  }).catch(() => [])

  let result: IntelligenceObject<InsightBody>
  if (prior.length > 0) {
    result = await store.supersede<InsightBody>(prior[0].id, draft)
  } else {
    result = await store.append<InsightBody>(draft)
  }

  console.log(
    `[insight-orchestrator] produced insight ${result.id} ` +
    `(pattern=${result.body.pattern}, ` +
    `metrics=[${result.body.metrics.join(', ')}], ` +
    `confidence=${result.confidence.toFixed(3)})`,
  )

  return result
}
