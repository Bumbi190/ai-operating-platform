/**
 * lib/atlas/intelligence/entity-registry.ts — Canonical Entity Registry
 *
 * The single canonical identity layer shared by Signals, Intelligence, Memory
 * and future Executive Intelligence. Cognitive artifacts reference entities by
 * natural key (kind, key, projectId) rather than ad-hoc strings, so identity is
 * stable and de-duplicated across the platform (canonical §14).
 *
 * Backed by public.atlas_entities. Access goes through this interface only — the
 * swap point for a future graph backend, mirroring IntelligenceStore. Subjects
 * on persisted artifacts are reconciled here so the registry stays authoritative
 * without each producer minting divergent identifiers.
 *
 * Cast to `any`: atlas_entities is not yet in the generated Supabase types
 * (regenerate after applying migrations). Same pattern as postgres-store.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Subject } from './types'

// ── Domain types ────────────────────────────────────────────────────────────────

export type EntityKind = Subject['kind'] // 'project' | 'metric' | 'tenant' | 'content'

export interface Entity {
  id:        string
  kind:      EntityKind
  key:       string
  projectId: string | null
  name:      string | null
  meta:      Record<string, unknown>
}

export interface EntityRef {
  kind:      EntityKind
  key:       string
  projectId: string | null
}

export interface EntityUpsert {
  kind:      EntityKind
  key:       string
  projectId: string | null
  name?:     string | null
  meta?:     Record<string, unknown>
}

// ── Registry interface ──────────────────────────────────────────────────────────

export interface EntityRegistry {
  /** Idempotent upsert on the natural key (kind, key, projectId). */
  upsert(e: EntityUpsert): Promise<Entity>
  /** Reconcile a persisted artifact's subject into the registry. Null subject → null. */
  upsertFromSubject(subject: Subject | null, projectId: string | null): Promise<Entity | null>
  /** Resolve a canonical entity by natural key, or null. */
  get(ref: EntityRef): Promise<Entity | null>
}

// ── DB mapping ──────────────────────────────────────────────────────────────────

interface EntityRow {
  id:         string
  kind:       string
  key:        string
  project_id: string | null
  name:       string | null
  meta:       unknown
}

const ENTITY_COLS = 'id, kind, key, project_id, name, meta'

function rowToEntity(row: EntityRow): Entity {
  return {
    id:        row.id,
    kind:      row.kind as EntityKind,
    key:       row.key,
    projectId: row.project_id,
    name:      row.name,
    meta:      (row.meta as Record<string, unknown>) ?? {},
  }
}

// ── Postgres implementation ─────────────────────────────────────────────────────

class PostgresEntityRegistry implements EntityRegistry {
  async upsert(e: EntityUpsert): Promise<Entity> {
    const { data, error } = await (createAdminClient() as any)
      .from('atlas_entities')
      .upsert(
        {
          kind:       e.kind,
          key:        e.key,
          project_id: e.projectId,
          name:       e.name ?? null,
          meta:       e.meta ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'kind,key,project_id' },
      )
      .select(ENTITY_COLS)
      .single()

    if (error) throw new Error(`[atlas-entities] upsert failed: ${error.message}`)
    if (!data)  throw new Error('[atlas-entities] upsert returned no row')
    return rowToEntity(data as EntityRow)
  }

  async upsertFromSubject(subject: Subject | null, projectId: string | null): Promise<Entity | null> {
    if (!subject) return null
    return this.upsert({
      kind:      subject.kind,
      key:       subject.id,
      projectId,
      name:      subject.name ?? null,
    })
  }

  async get(ref: EntityRef): Promise<Entity | null> {
    let q = (createAdminClient() as any)
      .from('atlas_entities')
      .select(ENTITY_COLS)
      .eq('kind', ref.kind)
      .eq('key', ref.key)

    q = ref.projectId === null ? q.is('project_id', null) : q.eq('project_id', ref.projectId)

    const { data, error } = await q.maybeSingle()
    if (error) throw new Error(`[atlas-entities] get failed: ${error.message}`)
    return data ? rowToEntity(data as EntityRow) : null
  }
}

/** Create the canonical EntityRegistry. Swap point for a future graph backend. */
export function createEntityRegistry(): EntityRegistry {
  return new PostgresEntityRegistry()
}
