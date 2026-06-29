/**
 * lib/atlas/intelligence/postgres-store.ts — Postgres implementation of
 * IntelligenceStore (v1 backend).
 *
 * Pure infrastructure: CRUD + row mapping over public.atlas_intelligence and
 * public.atlas_entities. NO producer logic and NO consumer logic lives here —
 * those land in P1+ and only ever call the IntelligenceStore interface.
 *
 * The new tables are not yet in the generated Database types (regenerate with
 * `supabase gen types typescript` after the migration applies). Until then the
 * client is cast to `any` before `.from(...)` so the unknown table names and
 * columns do not raise overload / SelectQueryError. Mirrors the cast convention
 * in lib/atlas/signals.ts; remove once types are regenerated.
 *
 * P0 scope: implementation exists but is NOT wired to any caller. Importing it
 * has no side effects. See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Entity,
  EntityRef,
  EvidenceChain,
  Finding,
  IntelligenceDraft,
  IntelligenceKind,
  IntelligenceObject,
  Subject,
  SubjectKind,
} from './types'
import type { ContextQuery, IntelligenceStore } from './store'

const DEFAULT_LIMIT = 50

const INTEL_COLS =
  'id, kind, subject_kind, subject_ref, project_id, summary, findings, body, ' +
  'confidence, evidence, produced_by, version, produced_at, valid_until, superseded_by'

const ENTITY_COLS = 'kind, key, display_name, attributes'

// ── Row shapes (private; mapped to/from domain types at the boundary) ───────────

interface IntelRow {
  id: string
  kind: string
  subject_kind: string
  subject_ref: string | null
  project_id: string | null
  summary: string
  findings: unknown
  body: unknown
  confidence: number
  evidence: unknown
  produced_by: string
  version: string
  produced_at: string
  valid_until: string | null
  superseded_by: string | null
}

interface EntityRow {
  kind: string
  key: string
  display_name: string
  attributes: unknown
}

function rowToObject<B>(row: IntelRow): IntelligenceObject<B> {
  return {
    id: row.id,
    kind: row.kind as IntelligenceKind,
    subject: { kind: row.subject_kind as SubjectKind, ref: row.subject_ref },
    projectId: row.project_id,
    summary: row.summary,
    findings: (row.findings ?? []) as Finding[],
    body: (row.body ?? {}) as B,
    confidence: row.confidence,
    evidence: (row.evidence ?? []) as EvidenceChain,
    producedBy: row.produced_by,
    version: row.version,
    producedAt: row.produced_at,
    validUntil: row.valid_until,
    supersededBy: row.superseded_by,
  }
}

function rowToEntity(row: EntityRow): Entity {
  return {
    kind: row.kind as Entity['kind'],
    key: row.key,
    displayName: row.display_name,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
  }
}

export class PostgresIntelligenceStore implements IntelligenceStore {
  async record<B = Record<string, unknown>>(
    draft: IntelligenceDraft<B>,
  ): Promise<IntelligenceObject<B>> {
    const db = createAdminClient()
    const subject: Subject = draft.subject
    const { data, error } = await (db as any).from('atlas_intelligence')
      .insert({
        kind: draft.kind,
        subject_kind: subject.kind,
        subject_ref: subject.ref,
        project_id: draft.projectId ?? null,
        summary: draft.summary,
        findings: draft.findings,
        body: draft.body,
        confidence: draft.confidence,
        evidence: draft.evidence,
        produced_by: draft.producedBy,
        version: draft.version,
        valid_until: draft.validUntil ?? null,
      })
      .select(INTEL_COLS)
      .single()

    if (error) throw new Error(`[atlas-intelligence] record failed: ${error.message}`)
    if (!data) throw new Error('[atlas-intelligence] record returned no row')
    return rowToObject<B>(data as unknown as IntelRow)
  }

  async supersede(id: string, supersededById: string): Promise<void> {
    const db = createAdminClient()
    const { error } = await (db as any).from('atlas_intelligence')
      .update({ superseded_by: supersededById })
      .eq('id', id)

    if (error) throw new Error(`[atlas-intelligence] supersede failed: ${error.message}`)
  }

  async getById<B = Record<string, unknown>>(
    id: string,
  ): Promise<IntelligenceObject<B> | null> {
    const db = createAdminClient()
    const { data, error } = await (db as any)
      .from('atlas_intelligence')
      .select(INTEL_COLS)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`[atlas-intelligence] getById failed: ${error.message}`)
    if (!data) return null
    return rowToObject<B>(data as unknown as IntelRow)
  }

  async getLatest<B = Record<string, unknown>>(
    query: ContextQuery,
  ): Promise<IntelligenceObject<B> | null> {
    const rows = await this.query<B>({ ...query, limit: 1 })
    return rows[0] ?? null
  }

  async query<B = Record<string, unknown>>(
    query: ContextQuery,
  ): Promise<IntelligenceObject<B>[]> {
    const db = createAdminClient()
    let q = (db as any).from('atlas_intelligence').select(INTEL_COLS)

    if (query.subject?.kind) q = q.eq('subject_kind', query.subject.kind)
    if (query.subject?.ref !== undefined && query.subject.ref !== null) {
      q = q.eq('subject_ref', query.subject.ref)
    }
    if (query.projectId === null) q = q.is('project_id', null)
    else if (query.projectId !== undefined) q = q.eq('project_id', query.projectId)
    if (query.kinds && query.kinds.length > 0) q = q.in('kind', query.kinds)
    if (query.since) q = q.gte('produced_at', query.since.toISOString())
    if (query.minConfidence !== undefined) q = q.gte('confidence', query.minConfidence)
    // latestOnly defaults to true → exclude superseded objects.
    if (query.latestOnly !== false) q = q.is('superseded_by', null)

    q = q.order('produced_at', { ascending: false }).limit(query.limit ?? DEFAULT_LIMIT)

    const { data, error } = await q
    if (error) throw new Error(`[atlas-intelligence] query failed: ${error.message}`)
    return ((data ?? []) as unknown as IntelRow[]).map((r) => rowToObject<B>(r))
  }

  async upsertEntity(entity: Entity): Promise<Entity> {
    const db = createAdminClient()
    const { data, error } = await (db as any).from('atlas_entities')
      .upsert(
        {
          kind: entity.kind,
          key: entity.key,
          display_name: entity.displayName,
          attributes: entity.attributes ?? {},
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'kind,key' },
      )
      .select(ENTITY_COLS)
      .single()

    if (error) throw new Error(`[atlas-intelligence] upsertEntity failed: ${error.message}`)
    if (!data) throw new Error('[atlas-intelligence] upsertEntity returned no row')
    return rowToEntity(data as unknown as EntityRow)
  }

  async getEntity(ref: EntityRef): Promise<Entity | null> {
    const db = createAdminClient()
    const { data, error } = await (db as any).from('atlas_entities')
      .select(ENTITY_COLS)
      .eq('kind', ref.kind)
      .eq('key', ref.key)
      .maybeSingle()

    if (error) throw new Error(`[atlas-intelligence] getEntity failed: ${error.message}`)
    if (!data) return null
    return rowToEntity(data as unknown as EntityRow)
  }
}

/** Default store instance. Swap the implementation here when a graph backend lands. */
export function createIntelligenceStore(): IntelligenceStore {
  return new PostgresIntelligenceStore()
}
