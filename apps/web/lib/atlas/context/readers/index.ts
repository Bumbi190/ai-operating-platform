/**
 * lib/atlas/context/readers/index.ts — Reader registry (Cognitive Loop, Invariant E)
 *
 * The assembler is "a thin merge over independent readers" (canonical
 * Invariant E). This module owns the reader contract and the registry the
 * assembler (Stage 0, Commit 4) will iterate — nothing else. Adding a new
 * source for an existing dimension is a reader-local change; adding a NEW
 * dimension is a deliberate, versioned policy change (precedence slot +
 * allocation) and belongs to its mapped stage, not here.
 *
 * Contract (canonical §6.3 / Invariant E, F):
 *  - A reader is `ContextRequest → block | null`. `null` means "nothing to
 *    contribute" — an absent block, never an error surface.
 *  - Readers NEVER throw. A failed read degrades to `null` (the deadline
 *    wrapper, Commit 3, additionally records drops in `blocksDropped`).
 *  - Every reader self-scopes via `applyProjectScope`/`scopeProjectFilter`
 *    (Invariant E) and every read is bounded (Invariant F).
 *  - No reader reads another reader's output.
 *  - No reader ranks, relevance-truncates, calls a tool, or calls a model
 *    (boundaries L2/§5). ①②③ are bounded factual reads; ④/⑤/constraints
 *    (later commits) delegate ALL selection to Retrieval.
 *
 * The `ReaderEnv` parameter is dependency injection only (db handle + the
 * caller's already-resolved isolation allow-list). It carries no content and
 * makes no decision; the shape of what to read still comes exclusively from
 * the `ContextRequest`.
 *
 * Registered in this commit (CL Commit 2): ① operational, ② activeWork,
 * ③ view. ④ intelligence (Stage 3), ⑤ memory (Stage 2) and the HARD
 * constraints reader (Stage 1 unification) register here in their own
 * commits — the registry shape already reserves their slots.
 */

import type { ContextRequest } from '@/lib/atlas/context/request'
import { readOperational } from './operational'
import { readActiveWork } from './active-work'
import { readView } from './view'

type AnyDb = any

// ── Reader contract ───────────────────────────────────────────────────────────

/** The six context dimensions (canonical §6.5). */
export type ContextDimension =
  | 'constraints'   // HARD · selectActiveDecisions (Stage 1)
  | 'operational'   // SOFT ① gatherAtlasContext
  | 'activeWork'    // SOFT ② atlas_actions + in-flight runs
  | 'view'          // SOFT ③ NormalizedView
  | 'intelligence'  // SOFT ④ queryIntelligence (Stage 3)
  | 'memory'        // SOFT ⑤ recallMemories (Stage 2)

export type ContextChannel = 'hard' | 'soft'

/**
 * One already-bounded block, ready for pure composition. `text` is the
 * rendered block exactly as it would appear in context; `meta` carries the
 * few structured facts the route layer needs (never re-parsed from text).
 */
export interface ContextBlock {
  dimension: ContextDimension
  channel: ContextChannel
  text: string
  meta?: Record<string, unknown>
}

/**
 * Environment handed to a reader by the assembler: the DB handle and the
 * caller's already-resolved project allow-list (see `lib/atlas/isolation.ts`).
 * Never widened by a reader; an empty allow-list must yield zero rows.
 */
export interface ReaderEnv {
  db: AnyDb
  allowedProjectIds: string[]
}

/** `ContextRequest → block | null` (Invariant E). Must never throw. */
export type ContextReader = (req: ContextRequest, env: ReaderEnv) => Promise<ContextBlock | null>

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Fixed soft-channel composition order, stable → volatile (canonical §6.3:
 * ① operational, ② activeWork, ③ view, ④ intelligence, ⑤ memory).
 * The assembler composes in THIS order; the order never depends on content.
 */
export const SOFT_ORDER: readonly ContextDimension[] = [
  'operational',
  'activeWork',
  'view',
  'intelligence',
  'memory',
] as const

/**
 * The registry the assembler iterates. Partial by design: dimensions land
 * here in their mapped commits (④ Stage 3 · ⑤ Stage 2 · constraints Stage 1);
 * the assembler composes whatever is registered and treats missing
 * dimensions as absent blocks.
 */
export const CONTEXT_READERS: Partial<Record<ContextDimension, ContextReader>> = {
  operational: readOperational,
  activeWork: readActiveWork,
  view: readView,
}
