/**
 * lib/atlas/intelligence/producers/brief-orchestrator.ts — Brief Orchestrator Shell
 *
 * Imperative shell: owns all I/O. The pure `buildBrief` core never touches
 * the DB or network (P1, P6). This shell:
 *   1. Builds a ContextRequest and resolves it to signal queries (§6)
 *   2. Executes the queries against the signals layer
 *   3. Recalls memory (injected; currently empty — wired in a later sprint)
 *   4. Calls `buildBrief` (pure core, zero I/O)
 *   5. Supersedes the prior brief of the same scope (append-only track record §8.4)
 *   6. Returns the persisted IntelligenceObject
 *
 * P2: no retained state between calls.
 * P6: no direct service calls inside the producer core. All I/O lives here.
 */

import { querySignals } from '../../signals'
import type { SignalRecord } from '../../signals'
import { createIntelligenceStore } from '../postgres-store'
import type { IntelligenceStore } from '../store'
import type { IntelligenceObject, BriefBody, MemoryItem } from '../types'
import { resolveContextRequest } from '../context-request'
import { buildBrief } from './brief-producer'

const ALL_INTENTS = ['revenue', 'audience', 'content_performance', 'agent_activity'] as const

export interface RunBriefArgs {
  projectId:    string | null
  /** ISO timestamp. Defaults to 7 days ago. */
  windowSince?: string
  /** ISO timestamp. Defaults to now. */
  windowUntil?: string
  /** Injected store — used for supersession lookup and write. Defaults to Postgres. */
  store?:       IntelligenceStore
  /** Injected memory recall function. Empty by default until memory layer is wired. */
  memoryRecall?: (projectId: string | null) => Promise<MemoryItem[]>
}

export async function runBriefProducer(
  args: RunBriefArgs,
): Promise<IntelligenceObject<BriefBody>> {
  const { projectId } = args
  const until   = args.windowUntil ?? new Date().toISOString()
  const since   = args.windowSince ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const window  = { since, until }
  const store   = args.store ?? createIntelligenceStore()
  const scope   = projectId ? 'project' : 'global'

  // ── 1. Resolve context request → signal queries ─────────────────────────
  const queries = resolveContextRequest({
    scope,
    projectId,
    intents: [...ALL_INTENTS],
    window,
  })

  // ── 2. Execute signal queries in parallel ────────────────────────────────
  const signalArrays = await Promise.all(
    queries.map(q =>
      querySignals({
        kind:       q.kind,
        projectIds: q.projectIds,
        source:     q.source,
        since:      q.since,
        until:      q.until,
        limit:      q.limit,
      }).catch((err: unknown) => {
        console.warn(`[brief-orchestrator] signal query ${q.kind} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
        return [] as SignalRecord[]
      }),
    ),
  )
  const signals = signalArrays.flat()

  // ── 3. Recall memory ─────────────────────────────────────────────────────
  const memoryRecall = args.memoryRecall ?? (async () => [])
  const memoryItems: MemoryItem[] = await memoryRecall(projectId).catch(() => [])

  // ── 4. Build the brief (pure core, zero I/O) ─────────────────────────────
  const draft = buildBrief({ scope, projectId, window, signals, memoryItems })

  // ── 5. Supersede prior brief of same scope ────────────────────────────────
  const prior = await store.query<BriefBody>({
    kinds:     ['brief'],
    projectId,
    limit:     1,
  }).catch(() => [])

  let result: IntelligenceObject<BriefBody>
  if (prior.length > 0) {
    result = await store.supersede<BriefBody>(prior[0].id, draft)
  } else {
    result = await store.append<BriefBody>(draft)
  }

  console.log(
    `[brief-orchestrator] produced brief ${result.id} ` +
    `(scope=${scope}, projectId=${projectId ?? 'global'}, ` +
    `signals=${signals.length}, confidence=${result.confidence.toFixed(3)})`,
  )

  return result
}
