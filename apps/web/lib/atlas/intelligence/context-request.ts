/**
 * lib/atlas/intelligence/context-request.ts — Context Framing Boundary
 *
 * Implements the canonical §6 boundary: EI states the *shape* of context it
 * needs (ContextRequest); Memory/signals layer resolves it to actual data.
 *
 * The ContextRequest replaces hard-coded signal-kind lists in orchestrators
 * (partial G6 fix). Orchestrators call `resolveContextRequest` to obtain
 * the signal queries to execute — the producer cores never see kind names.
 *
 * The resolver lives in this module (the orchestrator shell), not in any
 * producer core, so the cores remain independent of the signal schema.
 *
 * Canonical ref: §6 (EI states shape, not what fills it).
 * Implementation note: full G6 closure requires Memory itself to resolve
 * intent → data. This intermediate step removes the coupling from producer
 * cores, which is the critical boundary. Memory-level resolution is deferred.
 */

// ── ContextRequest ────────────────────────────────────────────────────────────

/**
 * An intent-level request for context. EI states what *kind* of knowledge it
 * needs; the resolver translates to actual signal queries.
 *
 * Intents map to business domains, not to storage artefacts:
 *   revenue            — MRR, subscription metrics, churn
 *   audience           — social follower counts, account snapshots
 *   content_performance — engagement rates, content scores
 *   agent_activity     — agent run success/failure rates
 */
export interface ContextRequest {
  scope:      'project' | 'global'
  projectId?: string | null
  intents:    ContextIntent[]
  window:     { since: string; until: string }
}

export type ContextIntent = 'revenue' | 'audience' | 'content_performance' | 'agent_activity'

// ── Signal query shape ────────────────────────────────────────────────────────

/**
 * A resolved query against the signals layer.
 * Matches the signature of `querySignals` from lib/atlas/signals.ts.
 */
export interface SignalQuery {
  kind:        string
  projectIds?: string[]
  source?:     string
  since?:      string
  until?:      string
  limit?:      number
}

/**
 * A metric extractor: given a signal query result, maps a payload to a
 * numeric value for trend analysis. Null = skip this signal (malformed payload).
 */
export interface MetricExtractor {
  metric:  string
  query:   SignalQuery
  extract: (payload: Record<string, unknown>) => number | null
}

// ── Intent → signal kind mapping ──────────────────────────────────────────────

/**
 * Maps each ContextIntent to one or more SignalQueries.
 * This is the only place in the EI layer that names specific signal kinds.
 * Update this map when new collectors are added; producer cores are unaffected.
 */
export function resolveContextRequest(req: ContextRequest): SignalQuery[] {
  const { projectId, window, intents } = req
  const projectIds = projectId ? [projectId] : undefined

  const queries: SignalQuery[] = []

  for (const intent of intents) {
    switch (intent) {
      case 'revenue':
        queries.push({
          kind:       'stripe.mrr_snapshot',
          projectIds,
          since:      window.since,
          until:      window.until,
          limit:      90,
        })
        break

      case 'audience':
        queries.push({
          kind:       'social.account_snapshot',
          projectIds,
          since:      window.since,
          until:      window.until,
          limit:      90,
        })
        break

      case 'content_performance':
        // Content score signals — may not exist yet; orchestrators handle empty gracefully
        queries.push({
          kind:       'content.impact_score',
          projectIds,
          since:      window.since,
          until:      window.until,
          limit:      90,
        })
        break

      case 'agent_activity':
        // Agent run signals — may not exist yet; orchestrators handle empty gracefully
        queries.push({
          kind:       'agent.run_summary',
          projectIds,
          since:      window.since,
          until:      window.until,
          limit:      90,
        })
        break
    }
  }

  return queries
}

// ── Metric extractors ─────────────────────────────────────────────────────────

/**
 * Returns MetricExtractors for trend analysis.
 * Each extractor knows how to pull one numeric value from a signal payload
 * for a given intent. Used by the trend orchestrator.
 */
export function resolveMetricExtractors(req: ContextRequest): MetricExtractor[] {
  const { projectId, window, intents } = req
  const projectIds = projectId ? [projectId] : undefined
  const extractors: MetricExtractor[] = []

  for (const intent of intents) {
    switch (intent) {
      case 'revenue':
        extractors.push({
          metric:  'mrr_sek',
          query: { kind: 'stripe.mrr_snapshot', projectIds, since: window.since, until: window.until, limit: 90 },
          extract: (p) => typeof p.mrr_sek === 'number' ? p.mrr_sek : null,
        })
        extractors.push({
          metric:  'active_subscribers',
          query: { kind: 'stripe.mrr_snapshot', projectIds, since: window.since, until: window.until, limit: 90 },
          extract: (p) => typeof p.active_subscribers === 'number' ? p.active_subscribers : null,
        })
        break

      case 'audience': {
        // social.account_snapshot has nested platforms; extract total followers
        const extractFollowers = (p: Record<string, unknown>): number | null => {
          const platforms = p.platforms as Record<string, Record<string, unknown> | null> | undefined
          if (!platforms) return null
          let total = 0
          let found = false
          for (const snap of Object.values(platforms)) {
            if (!snap) continue
            const f = snap.followers
            if (typeof f === 'number') { total += f; found = true }
          }
          return found ? total : null
        }
        extractors.push({
          metric:  'total_followers',
          query: { kind: 'social.account_snapshot', projectIds, since: window.since, until: window.until, limit: 90 },
          extract: extractFollowers,
        })
        break
      }

      case 'content_performance':
        extractors.push({
          metric:  'content_score',
          query: { kind: 'content.impact_score', projectIds, since: window.since, until: window.until, limit: 90 },
          extract: (p) => typeof p.score === 'number' ? p.score : null,
        })
        break

      case 'agent_activity':
        extractors.push({
          metric:  'agent_success_rate',
          query: { kind: 'agent.run_summary', projectIds, since: window.since, until: window.until, limit: 90 },
          extract: (p) => typeof p.success_rate === 'number' ? p.success_rate : null,
        })
        break
    }
  }

  return extractors
}
