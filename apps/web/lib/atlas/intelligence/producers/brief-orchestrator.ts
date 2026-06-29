/**
 * lib/atlas/intelligence/producers/brief-orchestrator.ts — imperative shell for
 * the Brief Producer.
 *
 * Loads facts (signals) and optional memory, calls the pure `buildBrief`, and
 * persists the result via IntelligenceStore. This is the ONLY place the Brief
 * Producer touches I/O. Nothing here computes the brief — that is the pure core.
 *
 * Memory enrichment is dependency-injected (`memoryRecall`). There is no memory
 * read API yet (atlas.memories is wrapper-gated and ATLAS_MEMORY is off), so the
 * default is a no-op recall returning []. When a recall wrapper lands, pass it in
 * here — the producer already supports memory evidence with no further change.
 *
 * P1 note: requires the atlas_intelligence migration to be applied before it can
 * run. It is not wired to any cron/route yet. See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.
 */

import { querySignals, type SignalRecord } from '@/lib/atlas/signals'
import { createIntelligenceStore } from '../postgres-store'
import type { IntelligenceStore } from '../store'
import type { IntelligenceObject } from '../types'
import {
  buildBrief,
  type BriefBody,
  type BriefMemoryContext,
} from './brief-producer'

/** Project-scoped signal kinds the brief loads. */
const PROJECT_SIGNAL_KINDS = ['stripe.mrr_snapshot', 'social.account_snapshot'] as const
/** Global (project-agnostic) signal kinds. */
const GLOBAL_SIGNAL_KINDS = ['impact_score'] as const

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Memory recall seam. Resolves consolidated-memory context for the window. */
export type MemoryRecall = (args: {
  projectId: string | null
  since: string
  until: string
}) => Promise<BriefMemoryContext[]>

const noMemoryRecall: MemoryRecall = async () => []

export interface RunBriefArgs {
  /** Project scope. Null = platform-global brief. */
  projectId: string | null
  /** Window start (ISO). Defaults to 7 days before `until`. */
  since?: string
  /** Window end (ISO). Defaults to now. */
  until?: string
  /** Override the store (tests / future graph backend). */
  store?: IntelligenceStore
  /** Inject memory enrichment. Defaults to a no-op. */
  memoryRecall?: MemoryRecall
}

/**
 * Produce and persist one brief intelligence object for the given scope/window.
 * Returns the stored object (with id + producedAt).
 */
export async function runBriefProducer(
  args: RunBriefArgs,
): Promise<IntelligenceObject<BriefBody>> {
  const until = args.until ?? new Date().toISOString()
  const since = args.since ?? new Date(Date.parse(until) - SEVEN_DAYS_MS).toISOString()
  const store = args.store ?? createIntelligenceStore()
  const recall = args.memoryRecall ?? noMemoryRecall

  const signals: SignalRecord[] = []

  if (args.projectId) {
    for (const kind of PROJECT_SIGNAL_KINDS) {
      const rows = await querySignals({
        kind,
        projectIds: [args.projectId],
        since,
        until,
      })
      signals.push(...rows)
    }
  }

  for (const kind of GLOBAL_SIGNAL_KINDS) {
    const rows = await querySignals({ kind, since, until })
    signals.push(...rows)
  }

  const memory = await recall({ projectId: args.projectId, since, until })

  const draft = buildBrief({
    projectId: args.projectId,
    window: { since, until },
    signals,
    memory,
  })

  return store.record<BriefBody>(draft)
}
