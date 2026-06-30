/**
 * lib/atlas/intelligence/store.ts — IntelligenceStore Interface
 *
 * The sole Memory boundary for EI output artifacts. All writes from EI
 * orchestrators go through this interface. EI never calls the DB directly
 * (P6). The interface is the swap point for future storage backends.
 *
 * Append-only by convention: producers never delete or update body/evidence.
 * `supersede()` marks the prior artifact as superseded and writes the new one
 * atomically, preserving the full reasoning track record (§8.4, §13.3).
 *
 * P2: the store is stateful; EI is not. EI writes artifacts here and reads
 * them back in the next cycle as inputs — the dotted feedback loop in §2.
 */

import type { IntelligenceDraft, IntelligenceObject, IntelligenceKind } from './types'

// ── Query args ─────────────────────────────────────────────────────────────────

export interface QueryArgs {
  /** Filter to one or more artifact kinds. */
  kinds?:        IntelligenceKind[]
  /** null = global artifacts; string = project-scoped; omit = all. */
  projectId?:    string | null
  subjectKind?:  string
  subjectId?:    string
  /** Only return artifacts not yet superseded. Default: true. */
  notSuperseded?: boolean
  /** ISO timestamp — only return artifacts produced at or after. */
  since?:        string
  limit?:        number
}

// ── Store interface ───────────────────────────────────────────────────────────

export interface IntelligenceStore {
  /**
   * Append a new artifact. Assigns id and sets supersededBy to null.
   * Returns the persisted object with its generated id.
   */
  append<B>(draft: IntelligenceDraft<B>): Promise<IntelligenceObject<B>>

  /**
   * Atomically append the new draft and mark the prior artifact as superseded.
   * If priorId is not found, falls back to append-only (no error).
   * Returns the new persisted object.
   */
  supersede<B>(priorId: string, draft: IntelligenceDraft<B>): Promise<IntelligenceObject<B>>

  /**
   * Query artifacts. Returns newest-first by default.
   */
  query<B>(args: QueryArgs): Promise<IntelligenceObject<B>[]>

  /**
   * Fetch a single artifact by id, or null. Required for evidence drill-down:
   * an EvidenceEntry carries a sourceId, and consumers (Executive Intelligence)
   * resolve nested chains (insight → trend → signal) by id.
   */
  getById<B>(id: string): Promise<IntelligenceObject<B> | null>
}
