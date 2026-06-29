/**
 * lib/atlas/intelligence/store.ts — IntelligenceStore repository contract.
 *
 * The ONLY access path to the Atlas Intelligence domain. Producers write through
 * it; consumers (Context Retrieval for Manager / agents / The Prompt) read
 * through it. Nothing else touches atlas_intelligence directly — this keeps the
 * layer storage-agnostic.
 *
 * v1 implementation: PostgresIntelligenceStore (./postgres-store.ts).
 * A graph backend (e.g. Graphify) can implement THIS interface later without
 * changing any producer or consumer.
 *
 * P0 scope: interface + Postgres implementation only. No producers wired, no
 * behavior change. See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.
 */

import type {
  Entity,
  EntityRef,
  IntelligenceObject,
  IntelligenceDraft,
  IntelligenceKind,
  SubjectKind,
  Confidence,
} from './types'

/**
 * Context Retrieval filters. All optional → the broadest query returns recent
 * platform-wide intelligence. This is the single read contract consumers use.
 */
export interface ContextQuery {
  subject?: { kind: SubjectKind; ref?: string | null }
  /** Project scope. `null` matches platform-global objects explicitly. */
  projectId?: string | null
  kinds?: IntelligenceKind[]
  /** Lower bound on produced_at. */
  since?: Date
  /** Minimum confidence (0–1). */
  minConfidence?: Confidence
  /** Exclude superseded objects. Defaults to true. */
  latestOnly?: boolean
  /** Max rows. Defaults to a store-defined cap. */
  limit?: number
}

/**
 * Repository over the Intelligence domain. Append-only by convention: there is
 * no update or hard delete — the lifecycle is `supersede`.
 */
export interface IntelligenceStore {
  // ── Intelligence objects ──────────────────────────────────────────────────

  /** Persist a new intelligence object. Returns the stored object with id/timestamp. */
  record<B = Record<string, unknown>>(
    draft: IntelligenceDraft<B>,
  ): Promise<IntelligenceObject<B>>

  /** Mark `id` as superseded by a newer object. No hard delete; track record is kept. */
  supersede(id: string, supersededById: string): Promise<void>

  /** Fetch a single intelligence object by id, or null. */
  getById<B = Record<string, unknown>>(
    id: string,
  ): Promise<IntelligenceObject<B> | null>

  /** Most recent matching object, or null. */
  getLatest<B = Record<string, unknown>>(
    query: ContextQuery,
  ): Promise<IntelligenceObject<B> | null>

  /** Context Retrieval — all matching objects, newest first. The consumer read door. */
  query<B = Record<string, unknown>>(
    query: ContextQuery,
  ): Promise<IntelligenceObject<B>[]>

  // ── Entities (canonical subjects) ─────────────────────────────────────────

  /** Idempotent upsert on (kind, key). Returns the canonical entity. */
  upsertEntity(entity: Entity): Promise<Entity>

  /** Fetch a canonical entity by reference, or null. */
  getEntity(ref: EntityRef): Promise<Entity | null>
}
