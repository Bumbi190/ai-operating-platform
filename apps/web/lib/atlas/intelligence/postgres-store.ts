/**
 * lib/atlas/intelligence/postgres-store.ts — Supabase IntelligenceStore Implementation
 *
 * Pure infrastructure. No producer or consumer logic lives here.
 * This is the storage implementation behind the IntelligenceStore interface.
 *
 * Uses createAdminClient() — correct here because this is Memory infrastructure,
 * not EI reaching out to an external service (P6: EI never calls this directly;
 * orchestrator shells call this via the IntelligenceStore interface boundary).
 *
 * Cast to `any`: atlas_intelligence is not yet in the generated Supabase types.
 * Pattern is identical to how signals.ts handles atlas_signals post-migration.
 * Regenerate types with `supabase gen types typescript` after applying migrations.
 *
 * `createIntelligenceStore` is the swap point for a future graph backend.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { IntelligenceDraft, IntelligenceObject, IntelligenceKind } from './types'
import type { IntelligenceStore, QueryArgs } from './store'
import { createEntityRegistry, type EntityRegistry } from './entity-registry'

// ── DB row shape (private) ────────────────────────────────────────────────────

interface DbRow {
  id:            string
  kind:          string
  project_id:    string | null
  subject_kind:  string | null
  subject_id:    string | null
  subject_name:  string | null
  body:          unknown
  evidence:      unknown
  confidence:    number
  produced_at:   string
  produced_by:   string
  superseded_by: string | null
  window_since:  string | null
  window_until:  string | null
}

const SELECT_COLS = [
  'id', 'kind', 'project_id',
  'subject_kind', 'subject_id', 'subject_name',
  'body', 'evidence', 'confidence',
  'produced_at', 'produced_by', 'superseded_by',
  'window_since', 'window_until',
].join(', ')

function rowToObject<B>(row: DbRow): IntelligenceObject<B> {
  return {
    id:           row.id,
    kind:         row.kind as IntelligenceKind,
    projectId:    row.project_id,
    subject:      row.subject_kind && row.subject_id
      ? { kind: row.subject_kind as any, id: row.subject_id, name: row.subject_name ?? undefined }
      : null,
    body:         row.body as B,
    evidence:     (row.evidence as any) ?? [],
    confidence:   row.confidence,
    producedAt:   row.produced_at,
    producedBy:   row.produced_by,
    supersededBy: row.superseded_by,
    window:       row.window_since && row.window_until
      ? { since: row.window_since, until: row.window_until }
      : null,
  }
}

function draftToInsert<B>(draft: IntelligenceDraft<B>): Record<string, unknown> {
  return {
    kind:         draft.kind,
    project_id:   draft.projectId,
    subject_kind: draft.subject?.kind ?? null,
    subject_id:   draft.subject?.id   ?? null,
    subject_name: draft.subject?.name ?? null,
    body:         draft.body,
    evidence:     draft.evidence,
    confidence:   draft.confidence,
    produced_by:  draft.producedBy,
    window_since: draft.window?.since  ?? null,
    window_until: draft.window?.until  ?? null,
  }
}

// ── Implementation ────────────────────────────────────────────────────────────

class PostgresIntelligenceStore implements IntelligenceStore {
  private readonly entities: EntityRegistry = createEntityRegistry()

  private table() {
    return (createAdminClient() as any).from('atlas_intelligence')
  }

  /** Best-effort: reconcile a persisted artifact's subject into the canonical registry. */
  private async reconcileEntity<B>(obj: IntelligenceObject<B>): Promise<void> {
    if (!obj.subject) return
    try {
      await this.entities.upsertFromSubject(obj.subject, obj.projectId)
    } catch (err) {
      console.warn(
        `[atlas-intelligence] entity reconcile failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async append<B>(draft: IntelligenceDraft<B>): Promise<IntelligenceObject<B>> {
    const { data, error } = await this.table()
      .insert(draftToInsert(draft))
      .select(SELECT_COLS)
      .single()

    if (error) throw new Error(`[atlas-intelligence] append failed: ${error.message}`)
    if (!data)  throw new Error('[atlas-intelligence] append returned no row')
    const obj = rowToObject<B>(data as DbRow)
    await this.reconcileEntity(obj)
    return obj
  }

  async supersede<B>(priorId: string, draft: IntelligenceDraft<B>): Promise<IntelligenceObject<B>> {
    const db = createAdminClient()

    // 1. Append the new artifact.
    const { data: newRow, error: insertErr } = await (db as any).from('atlas_intelligence')
      .insert(draftToInsert(draft))
      .select(SELECT_COLS)
      .single()

    if (insertErr) throw new Error(`[atlas-intelligence] supersede.insert failed: ${insertErr.message}`)
    if (!newRow)   throw new Error('[atlas-intelligence] supersede.insert returned no row')

    const newObj = rowToObject<B>(newRow as DbRow)

    // 2. Mark the prior artifact as superseded. If not found, continue silently.
    const { error: updateErr } = await (db as any).from('atlas_intelligence')
      .update({ superseded_by: newObj.id })
      .eq('id', priorId)
      .is('superseded_by', null)  // only supersede once

    if (updateErr) {
      console.warn(`[atlas-intelligence] supersede.update failed (non-fatal): ${updateErr.message}`)
    }

    await this.reconcileEntity(newObj)
    return newObj
  }

  async query<B>(args: QueryArgs): Promise<IntelligenceObject<B>[]> {
    let q = (createAdminClient() as any)
      .from('atlas_intelligence')
      .select(SELECT_COLS)
      .order('produced_at', { ascending: false })
      .limit(args.limit ?? 50)

    if (args.kinds && args.kinds.length > 0) {
      q = q.in('kind', args.kinds)
    }
    if (args.projectId !== undefined) {
      if (args.projectId === null) {
        q = q.is('project_id', null)
      } else {
        q = q.eq('project_id', args.projectId)
      }
    }
    if (args.subjectKind) q = q.eq('subject_kind', args.subjectKind)
    if (args.subjectId)   q = q.eq('subject_id',   args.subjectId)
    if (args.since)       q = q.gte('produced_at',  args.since)

    // Default: only return non-superseded artifacts
    const notSuperseded = args.notSuperseded !== false
    if (notSuperseded) q = q.is('superseded_by', null)

    const { data, error } = await q
    if (error) throw new Error(`[atlas-intelligence] query failed: ${error.message}`)
    return ((data ?? []) as DbRow[]).map(rowToObject<B>)
  }

  async getById<B>(id: string): Promise<IntelligenceObject<B> | null> {
    const { data, error } = await (createAdminClient() as any)
      .from('atlas_intelligence')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`[atlas-intelligence] getById failed: ${error.message}`)
    return data ? rowToObject<B>(data as DbRow) : null
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an IntelligenceStore backed by Supabase/Postgres.
 * This is the swap point for a future graph backend.
 */
export function createIntelligenceStore(): IntelligenceStore {
  return new PostgresIntelligenceStore()
}
