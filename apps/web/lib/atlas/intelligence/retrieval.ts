/**
 * lib/atlas/intelligence/retrieval.ts — Consumer Read API
 *
 * The single read door for downstream consumers of EI cognitive artifacts.
 * EI never reads from this file — it receives prior artifacts as inputs
 * injected by orchestrator shells (P2, P6).
 *
 * This file is read-only: no writes, no side-effects. Writing to the store
 * is exclusively done through the IntelligenceStore interface in orchestrators.
 *
 * The `__setIntelligenceStore` export provides a test seam: inject a mock
 * store in unit tests without touching the Postgres implementation.
 */

import { createIntelligenceStore } from './postgres-store'
import { createEntityRegistry, type Entity, type EntityRef, type EntityRegistry } from './entity-registry'
import type { IntelligenceStore, QueryArgs } from './store'
import type { EvidenceChain, IntelligenceObject } from './types'

// ── Lazy store with test seam ─────────────────────────────────────────────────

let _store: IntelligenceStore | null = null
let _entities: EntityRegistry | null = null

/** Test seam: inject a mock store before calling queryIntelligence. */
export function __setIntelligenceStore(s: IntelligenceStore): void {
  _store = s
}

/** Test seam: inject a mock entity registry before calling getEntity. */
export function __setEntityRegistry(r: EntityRegistry): void {
  _entities = r
}

function getStore(): IntelligenceStore {
  if (!_store) _store = createIntelligenceStore()
  return _store
}

function getEntities(): EntityRegistry {
  if (!_entities) _entities = createEntityRegistry()
  return _entities
}

// ── Public read API ───────────────────────────────────────────────────────────

/**
 * Query EI cognitive artifacts. Newest first. Non-superseded only by default.
 *
 * Used by:
 *   - API read routes (GET /api/atlas/intelligence/brief)
 *   - Voice/UX surfaces to render EI output
 *   - Manager (polling for delegation/knowledge requests in Epic 7)
 *
 * EI orchestrators do NOT call this. They receive prior artifacts via injection.
 */
export async function queryIntelligence<B = unknown>(
  args: QueryArgs,
): Promise<IntelligenceObject<B>[]> {
  return getStore().query<B>(args)
}

/**
 * Convenience: get the single latest artifact of a given kind + scope.
 * Returns null if none exists (e.g., cold start before first cron run).
 */
export async function getLatestIntelligence<B = unknown>(args: {
  kind:       QueryArgs['kinds'] extends Array<infer K> ? K : never
  projectId?: string | null
}): Promise<IntelligenceObject<B> | null> {
  const results = await getStore().query<B>({
    kinds:     [args.kind as any],
    projectId: args.projectId,
    limit:     1,
  })
  return results[0] ?? null
}

/**
 * Fetch a single artifact by id, or null. The drill-down primitive: an
 * EvidenceEntry carries sourceId, so Executive resolves a nested chain
 * (insight → trend → signal) by walking ids through this.
 */
export async function getIntelligenceById<B = unknown>(
  id: string,
): Promise<IntelligenceObject<B> | null> {
  return getStore().getById<B>(id)
}

/**
 * The evidence chain backing one artifact. Evidence travels inline on each
 * object, so this returns its chain directly (empty if the object is absent).
 * Combine with getIntelligenceById to traverse `atlas_intelligence` references
 * to their factual (signal) roots.
 */
export async function getEvidenceChain(id: string): Promise<EvidenceChain> {
  const obj = await getStore().getById(id)
  return obj?.evidence ?? []
}

/** Resolve a canonical entity from the registry, or null. */
export async function getEntity(ref: EntityRef): Promise<Entity | null> {
  return getEntities().get(ref)
}
