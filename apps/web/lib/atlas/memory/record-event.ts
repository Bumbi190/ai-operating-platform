/**
 * lib/atlas/memory/record-event.ts — Atlas Memory M4 Commit 2: emit API.
 *
 * `recordMemoryEvent()` is the single way the app writes a memory event. It calls
 * the `public.atlas_record_event(...)` SECURITY DEFINER wrapper (ADR v3 §4 — the
 * `atlas` schema is NEVER PostgREST-exposed; access is wrapper-only, the claim_runs
 * pattern). Non-throwing side-channel (like reportBug): a memory write must never
 * break the host operation.
 *
 * Flag-gated by ATLAS_MEMORY (default OFF). When off, recordMemoryEvent is an inert
 * no-op (returns { skipped:true }) — so even an accidentally-wired caller writes
 * nothing until the flag is on. No emitters are wired in Commit 2; the drain/approval/
 * dream emitters that call this land in Commit 4.
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
  /** M4 emits only 'project'. world/org are reserved (M5+). */
  scope: 'project' | 'world'
  eventType: MemoryEventType
  content: string
  source: string
  projectId?: string | null
  entityKind?: string
  entityId?: string
  subject?: string | null
  structured?: Record<string, unknown>
  confidence?: number
  /** Provenance + idempotency: with a sourceId, re-emit of the same (source,sourceId,eventType) is deduped. */
  sourceId?: string | null
  dedupeKey?: string | null
  occurredAt?: string
}

export interface RecordMemoryEventResult {
  id: string | null
  /** true when an idempotent (source,sourceId,eventType) duplicate was suppressed. */
  deduped: boolean
  /** true when ATLAS_MEMORY is off → nothing was attempted. */
  skipped: boolean
}

/**
 * Emit a memory event via the public wrapper. NEVER throws — a DB/config error is
 * logged and returns { id:null }. Pass an existing admin `db` to reuse a client
 * (emitters already hold one); otherwise one is created lazily (only when enabled).
 */
export async function recordMemoryEvent(
  input: RecordMemoryEventInput,
  db?: AnyDb,
): Promise<RecordMemoryEventResult> {
  if (!isMemoryEnabled()) return { id: null, deduped: false, skipped: true }

  try {
    const client: AnyDb = db ?? createAdminClient()
    const { data, error } = await client.rpc('atlas_record_event', {
      p_scope:       input.scope,
      p_event_type:  input.eventType,
      p_content:     input.content,
      p_source:      input.source,
      p_project_id:  input.projectId ?? null,
      p_entity_kind: input.entityKind ?? '',
      p_entity_id:   input.entityId ?? '',
      p_subject:     input.subject ?? null,
      p_structured:  input.structured ?? {},
      p_confidence:  input.confidence ?? 0.5,
      p_source_id:   input.sourceId ?? null,
      p_dedupe_key:  input.dedupeKey ?? null,
      p_occurred_at: input.occurredAt ?? null,
    })

    if (error) {
      console.error(`[atlas-memory] recordMemoryEvent failed (source=${input.source}): ${error.message}`)
      return { id: null, deduped: false, skipped: false }
    }
    const id = (data as string | null) ?? null
    // The wrapper returns NULL only on an idempotent conflict (a successful insert,
    // including null-source_id events, returns the new id).
    return { id, deduped: id === null, skipped: false }
  } catch (err) {
    console.error(`[atlas-memory] recordMemoryEvent threw (swallowed): ${err instanceof Error ? err.message : String(err)}`)
    return { id: null, deduped: false, skipped: false }
  }
}
