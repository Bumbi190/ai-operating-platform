/**
 * lib/atlas/intelligence/producers/executive-brief-orchestrator.ts
 * Apex Daily Executive Brief — imperative shell.
 *
 * Owns all I/O; the `buildExecutiveBrief` core owns none. This shell:
 *   1. resolves the scope (global portfolio vs one project) and window
 *   2. reads the already-persisted intelligence artifacts through the
 *      IntelligenceStore boundary — never signals, never the database directly
 *   3. reads the prior apex brief for continuity (§13.3)
 *   4. calls the pure core
 *   5. persists via append / supersede (append-only track record, §8.4)
 *
 * Memory boundary: the apex deliberately consumes NO Memory. It synthesises
 * reasoning that already carries its own evidence down to signal and memory
 * roots — the input-tier brief is what resolves Memory, and it does so only
 * through the sanctioned recall seam and the Context Request boundary. The apex
 * therefore has no Memory import at all, which is the strongest available form
 * of "the sanctioned path is not bypassed".
 *
 * Horizon mapping follows §13.2: a portfolio-wide run is the Morning brief
 * ("what deserves my attention today"), a project-scoped run is the Project
 * brief ("what is the real state of this project").
 *
 * P2: no retained state between calls. P6: no external service calls in the core.
 */

import { createIntelligenceStore } from '../postgres-store'
import type { IntelligenceStore } from '../store'
import type {
  BriefBody,
  ExecutiveBriefBody,
  ExecutiveBriefHorizon,
  InsightBody,
  IntelligenceObject,
  OpportunityBody,
  RiskBody,
  TrendBody,
} from '../types'
import { buildExecutiveBrief } from './executive-brief-producer'

/** Matches the input-tier brief orchestrator's reporting window. */
const DEFAULT_WINDOW_DAYS = 7

/** Read caps: enough context to synthesise, bounded so one scope cannot blow up. */
const READ_LIMITS = { briefs: 5, trends: 20, insights: 5, risks: 10, opportunities: 10 } as const

export interface RunExecutiveBriefArgs {
  projectId:    string | null
  /** Defaults per §13.2: global → morning, project → project. */
  horizon?:     ExecutiveBriefHorizon
  windowSince?: string
  windowUntil?: string
  store?:       IntelligenceStore
  /** Injected clock; the produced artifact stamps this value. */
  now?:         string
}

export async function runExecutiveBriefProducer(
  args: RunExecutiveBriefArgs,
): Promise<IntelligenceObject<ExecutiveBriefBody>> {
  const { projectId } = args
  const store   = args.store ?? createIntelligenceStore()
  const now     = args.now ?? new Date().toISOString()
  const until   = args.windowUntil ?? now
  const since   = args.windowSince ?? new Date(Date.parse(now) - DEFAULT_WINDOW_DAYS * 86_400_000).toISOString()
  const window  = { since, until }
  const scope: 'project' | 'global' = projectId ? 'project' : 'global'
  const horizon = args.horizon ?? (projectId ? 'project' : 'morning')

  // ── 1. Read the persisted inputs through the store boundary ───────────────
  //   Every query is scope-bound: `projectId` is passed explicitly, so a
  //   project run reads only that project and a global run reads only global
  //   (project_id IS NULL) artifacts. Non-superseded only, by store default.
  const [briefs, trends, insights, risks, opportunities, priorBriefs] = await Promise.all([
    store.query<BriefBody>({ kinds: ['brief'], projectId, limit: READ_LIMITS.briefs }).catch(() => []),
    store.query<TrendBody>({ kinds: ['trend'], projectId, limit: READ_LIMITS.trends }).catch(() => []),
    store.query<InsightBody>({ kinds: ['insight'], projectId, limit: READ_LIMITS.insights }).catch(() => []),
    store.query<RiskBody>({ kinds: ['risk'], projectId, limit: READ_LIMITS.risks }).catch(() => []),
    store.query<OpportunityBody>({ kinds: ['opportunity'], projectId, limit: READ_LIMITS.opportunities }).catch(() => []),
    store.query<ExecutiveBriefBody>({ kinds: ['executive_brief'], projectId, limit: 1 }).catch(() => []),
  ])

  const priorBrief = priorBriefs[0] ?? null

  // ── 2. Pure synthesis ─────────────────────────────────────────────────────
  const draft = buildExecutiveBrief({
    scope, projectId, window, horizon,
    briefs, trends, insights, risks, opportunities,
    priorBrief,
    now,
  })

  // ── 3. Persist, superseding the brief this one read for continuity ────────
  const result = priorBrief
    ? await store.supersede<ExecutiveBriefBody>(priorBrief.id, draft)
    : await store.append<ExecutiveBriefBody>(draft)

  console.log(
    `[executive-brief-orchestrator] produced executive_brief ${result.id} ` +
    `(scope=${scope}, horizon=${horizon}, projectId=${projectId ?? 'global'}, ` +
    `sourced=${result.body.sourcedFrom.length}, changes=${result.body.whatChanged.length}, ` +
    `recommendations=${result.body.recommendations.length}, ` +
    `needsYou=${result.body.whatNeedsYou.length}, ` +
    `noMaterialChange=${result.body.noMaterialChange}, ` +
    `confidence=${result.confidence.toFixed(3)})`,
  )

  return result
}
