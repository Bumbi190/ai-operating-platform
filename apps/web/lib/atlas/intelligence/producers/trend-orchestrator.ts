/**
 * lib/atlas/intelligence/producers/trend-orchestrator.ts — Trend Orchestrator Shell
 *
 * Imperative shell. Owns all I/O. Pure `buildTrend` core has zero I/O.
 *
 * For each metric extractor resolved from the ContextRequest:
 *   1. Fetches the time series from the signals layer
 *   2. Extracts numeric values using the metric-driven extractor (not kind-driven)
 *   3. Calls `buildTrend` (pure core)
 *   4. Supersedes the prior trend for this (metric, projectId) scope
 *   5. Returns all produced trend objects
 *
 * Series extraction is metric-driven (via MetricExtractor.extract), not
 * hard-coded per signal kind. This is the Epic 1 fix for the plan's G6 partial
 * gap: the orchestrator shell, not the producer core, knows how to extract values.
 *
 * P2: no retained state between calls.
 * P6: no direct service calls in the producer core.
 */

import { querySignals } from '../../signals'
import type { SignalRecord } from '../../signals'
import { createIntelligenceStore } from '../postgres-store'
import type { IntelligenceStore } from '../store'
import type { IntelligenceObject, TrendBody } from '../types'
import { resolveMetricExtractors } from '../context-request'
import type { MetricExtractor } from '../context-request'
import { buildTrend } from './trend-producer'
import type { TimeSeriesPoint } from './trend-producer'

export interface RunTrendArgs {
  projectId:     string | null
  windowSince?:  string
  windowUntil?:  string
  store?:        IntelligenceStore
}

export async function runTrendProducer(
  args: RunTrendArgs,
): Promise<IntelligenceObject<TrendBody>[]> {
  const { projectId } = args
  const until  = args.windowUntil ?? new Date().toISOString()
  const since  = args.windowSince ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const window = { since, until }
  const store  = args.store ?? createIntelligenceStore()
  const scope  = projectId ? 'project' : 'global'

  // ── 1. Resolve metric extractors ─────────────────────────────────────────
  const extractors: MetricExtractor[] = resolveMetricExtractors({
    scope,
    projectId,
    intents: ['revenue', 'audience', 'content_performance', 'agent_activity'],
    window,
  })

  // ── 2. Fetch + extract each metric's time series in parallel ─────────────
  const seriesMap = await Promise.all(
    extractors.map(async (ext): Promise<{ ext: MetricExtractor; points: TimeSeriesPoint[] }> => {
      const signals: SignalRecord[] = await querySignals({
        kind:       ext.query.kind,
        projectIds: ext.query.projectIds,
        since:      ext.query.since,
        until:      ext.query.until,
        limit:      ext.query.limit,
      }).catch((err: unknown) => {
        console.warn(`[trend-orchestrator] signal query ${ext.query.kind} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
        return []
      })

      const points: TimeSeriesPoint[] = signals.flatMap(s => {
        const value = ext.extract(s.payload as Record<string, unknown>)
        if (value === null) return []
        return [{ value, producedAt: s.producedAt, signalId: s.id }]
      })

      return { ext, points }
    }),
  )

  // ── 3. Build and persist trends ───────────────────────────────────────────
  const results: IntelligenceObject<TrendBody>[] = []

  for (const { ext, points } of seriesMap) {
    if (points.length === 0) continue   // no data → skip (graceful cold-start)

    // Load prior trends for confidence boosting (read max 3)
    const priorTrends = await store.query<TrendBody>({
      kinds:      ['trend'],
      projectId,
      subjectId:  ext.metric,
      subjectKind: 'metric',
      limit:      3,
    }).catch(() => [])

    const draft = buildTrend({ metric: ext.metric, projectId, window, series: points, priorTrends })
    if (!draft) continue

    // Supersede prior trend for this metric
    const prior = priorTrends[0]  // already sorted newest-first
    let result: IntelligenceObject<TrendBody>
    if (prior) {
      result = await store.supersede<TrendBody>(prior.id, draft)
    } else {
      result = await store.append<TrendBody>(draft)
    }

    console.log(
      `[trend-orchestrator] produced trend ${result.id} ` +
      `(metric=${ext.metric}, direction=${result.body.direction}, ` +
      `points=${points.length}, r2=${result.body.r2.toFixed(2)}, ` +
      `confidence=${result.confidence.toFixed(3)})`,
    )
    results.push(result)
  }

  return results
}
