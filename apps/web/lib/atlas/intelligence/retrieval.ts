/**
 * lib/atlas/intelligence/retrieval.ts — Atlas Intelligence read API.
 *
 * The stable, primary read interface for the Intelligence layer. Omnira Manager,
 * future agents, and The Prompt consume intelligence ONLY through these functions
 * (Context Retrieval). They delegate to the active IntelligenceStore, so the
 * backend can change (Postgres → graph) without any consumer change.
 *
 *   getIntelligence(id)      — one object by id
 *   queryIntelligence(query) — Context Retrieval over the domain
 *   getEntity(ref)           — canonical entity from the registry
 *   getEvidenceChain(id)     — the evidence backing one object
 *
 * Writes do NOT belong here — producers write via the store / orchestrators.
 * See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.
 */

import { createIntelligenceStore } from './postgres-store'
import type { ContextQuery, IntelligenceStore } from './store'
import type {
  Entity,
  EntityRef,
  EvidenceChain,
  IntelligenceObject,
} from './types'

// Single lazily-created store. The swap point for a future graph backend; also
// overridable in tests via __setIntelligenceStore.
let activeStore: IntelligenceStore | null = null

function store(): IntelligenceStore {
  return (activeStore ??= createIntelligenceStore())
}

/** Test seam: inject a fake IntelligenceStore (pass null to reset to default). */
export function __setIntelligenceStore(s: IntelligenceStore | null): void {
  activeStore = s
}

/** Fetch a single intelligence object by id, or null. */
export function getIntelligence<B = Record<string, unknown>>(
  id: string,
): Promise<IntelligenceObject<B> | null> {
  return store().getById<B>(id)
}

/**
 * Context Retrieval — all intelligence objects matching the query, newest first.
 * The broadest call returns recent platform-wide intelligence. Defaults to
 * latest-only (superseded objects excluded).
 */
export function queryIntelligence<B = Record<string, unknown>>(
  query: ContextQuery = {},
): Promise<IntelligenceObject<B>[]> {
  return store().query<B>(query)
}

/** Resolve a canonical entity from the registry, or null. */
export function getEntity(ref: EntityRef): Promise<Entity | null> {
  return store().getEntity(ref)
}

/**
 * The evidence chain backing one intelligence object. Returns an empty chain if
 * the object does not exist or carries no evidence.
 */
export async function getEvidenceChain(id: string): Promise<EvidenceChain> {
  const obj = await store().getById(id)
  return obj?.evidence ?? []
}
