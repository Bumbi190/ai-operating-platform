/**
 * lib/atlas/memory/record-event.ts — Atlas Memory M4: the emit API.
 *
 * `recordMemoryEvent()` is the single way the app writes a memory event. It calls
 * the `public.atlas_record_event(...)` SECURITY DEFINER wrapper (ADR v3 §4 — the
 * `atlas` schema is NEVER PostgREST-exposed; access is wrapper-only, the claim_runs
 * pattern). `atlas.memory_events` is the single canonical writable memory store;
 * `atlas.memories` is derived from it by consolidation and is never written here.
 *
 * Non-throwing (like reportBug): a memory write must never break the host
 * operation. Callers AWAIT it all the same (Memory Slice 2A). A detached promise
 * does not survive a serverless request — production recorded 2 of 11 article
 * reviews, each 90–114 s late, because the RPC only resumed when a later request
 * reused the frozen function instance. Awaiting a call that cannot throw costs
 * one round trip and nothing else.
 *
 * Every product event is project-scoped and carries a non-empty `sourceId`:
 *   • `(source, source_id, event_type)` is unique in atlas.memory_events, so a
 *     retry of the same emit is deduped by the database. A NULL source_id is
 *     never deduped, so an event without one is refused, never written.
 *   • `world`/`org` scope is reserved for a future platform layer (M5+). The SQL
 *     wrapper still accepts it; this API does not, so no product emitter can
 *     create memory that every recall would return.
 *   Malformed input is refused BEFORE any write and reported as `rejected`.
 *
 * Flag-gated by ATLAS_MEMORY (default OFF). When off, recordMemoryEvent is an inert
 * no-op (returns { skipped:true }) — so even an accidentally-wired caller writes
 * nothing until the flag is on.
 *
 * `eventTypeToClass` is the central event_type → memory_class mapping. It MUST stay
 * in sync with the wrapper's episodic test (outcome/reflection/correction) and the
 * consolidation function (Commit 3). The unit test pins the mapping.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type MemoryEventType =
  | 'observation' | 'decision' | 'outcome' | 'feedback'
  | 'fact_assertion' | 'reflection' | 'correction'

export type MemoryClass = 'episodic' | 'semantic' | 'procedural' | 'decision'

/** Central taxonomy mapping. Episodic classes bypass consolidation (matches the wrapper). */
export function eventTypeToClass(eventType: MemoryEventType): MemoryClass {
  switch (eventType) {
    case 'decision':       return 'decision'
    case 'feedback':       return 'procedural'
    case 'observation':    return 'procedural'
    case 'fact_assertion': return 'semantic'
    case 'outcome':        return 'episodic'
    case 'reflection':     return 'episodic'
    case 'correction':     return 'episodic'
  }
}

/** Read at call time so a flag flip takes effect without a restart (and tests can toggle). */
export function isMemoryEnabled(): boolean {
  return process.env.ATLAS_MEMORY === '1'
}

export interface RecordMemoryEventInput {
  /** Product events are always project-scoped. world/org are reserved (M5+) and refused here. */
  scope: 'project'
  eventType: MemoryEventType
  content: string
  source: string
  /** The owning project, derived server-side from persisted state — never from the request. */
  projectId: string
  entityKind?: string
  entityId?: string
  subject?: string | null
  structured?: Record<string, unknown>
  confidence?: number
  /**
   * Provenance + idempotency. Required and non-empty: re-emitting the same
   * (source, sourceId, eventType) is deduped by the database.
   */
  sourceId: string
  dedupeKey?: string | null
  occurredAt?: string
}

/** Why an emit was refused before any write. */
export type MemoryEventRejection = 'invalid_scope' | 'missing_project' | 'missing_source_id'

export interface RecordMemoryEventResult {
  id: string | null
  /** true when an idempotent (source,sourceId,eventType) duplicate was suppressed. */
  deduped: boolean
  /** true when ATLAS_MEMORY is off → nothing was attempted. */
  skipped: boolean
  /** Set when the input was malformed: nothing was written. */
  rejected?: MemoryEventRejection
}

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * The checks that decide an event's owner and identity. Pure. Runs on the value
 * actually received, so an untyped caller cannot slip past the compile-time types.
 */
export function validateMemoryEventInput(input: RecordMemoryEventInput): MemoryEventRejection | null {
  if (input?.scope !== 'project') return 'invalid_scope'
  if (!isNonEmpty(input.projectId)) return 'missing_project'
  if (!isNonEmpty(input.sourceId)) return 'missing_source_id'
  return null
}

/**
 * Emit a memory event via the public wrapper. NEVER throws — a refused input or a
 * DB/config error is logged and returns { id:null }. Pass an existing admin `db` to
 * reuse a client (emitters already hold one); otherwise one is created lazily
 * (only when enabled).
 */
export async function recordMemoryEvent(
  input: RecordMemoryEventInput,
  db?: AnyDb,
): Promise<RecordMemoryEventResult> {
  if (!isMemoryEnabled()) {
    return { id: null, deduped: false, skipped: true }
  }

  try {
    const rejected = validateMemoryEventInput(input)
    if (rejected) {
      console.error(`[atlas-memory] recordMemoryEvent refused (source=${String(input?.source)}): ${rejected}`)
      return { id: null, deduped: false, skipped: false, rejected }
    }

    const client: AnyDb = db ?? createAdminClient()
    const { data, error } = await client.rpc('atlas_record_event', {
      p_scope:       input.scope,
      p_event_type:  input.eventType,
      p_content:     input.content,
      p_source:      input.source,
      p_project_id:  input.projectId,
      p_entity_kind: input.entityKind ?? '',
      p_entity_id:   input.entityId ?? '',
      p_subject:     input.subject ?? null,
      p_structured:  input.structured ?? {},
      p_confidence:  input.confidence ?? 0.5,
      p_source_id:   input.sourceId,
      p_dedupe_key:  input.dedupeKey ?? null,
      p_occurred_at: input.occurredAt ?? null,
    })

    if (error) {
      console.error(`[atlas-memory] recordMemoryEvent failed (source=${input.source}): ${error.message}`)
      return { id: null, deduped: false, skipped: false }
    }
    const id = (data as string | null) ?? null
    // The wrapper returns NULL only on an idempotent conflict (a successful insert
    // returns the new id).
    return { id, deduped: id === null, skipped: false }
  } catch (err) {
    console.error(`[atlas-memory] recordMemoryEvent threw (swallowed): ${err instanceof Error ? err.message : String(err)}`)
    return { id: null, deduped: false, skipped: false }
  }
}
