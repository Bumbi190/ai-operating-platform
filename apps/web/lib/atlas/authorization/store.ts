/**
 * lib/atlas/authorization/store.ts — append-only authorization event store.
 *
 * The ONLY persistence boundary for authority acts. It exposes `append` and
 * reads: there is deliberately no update and no delete method, so the immutable
 * history required by §11.60 and §27.207 cannot be violated through this
 * interface. The database enforces the same rule independently (see the
 * migration's reject trigger) — TypeScript convention alone is not the guard.
 *
 * `atlas_authorizations` is service-role only; this module is server-side.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { AuthorizationEvent } from './types'

type AnyDb = any

export interface AuthorizationEventStore {
  /** Append one immutable act. Never updates or deletes. */
  append(event: AuthorizationEvent): Promise<AuthorizationEvent>
  /** Full ordered history of one aggregate. Empty when unknown. */
  history(authorizationId: string): Promise<AuthorizationEvent[]>
  /** Every event for one project, newest chains first. Bounded. */
  byProject(projectId: string, limit?: number): Promise<AuthorizationEvent[]>
  /** Every event for one pinned target within a project. Bounded. */
  byTarget(projectId: string, targetType: string, targetId: string, limit?: number): Promise<AuthorizationEvent[]>
}

interface Row {
  event_id: string
  authorization_id: string
  event_type: string
  occurred_at: string
  project_id: string
  principal_id: string
  authority_basis: string
  action_kind: string
  authority_description: string | null
  target_type: string
  target_id: string
  target_version_hash: string
  conditions: unknown
  evidence: unknown
  expires_at: string | null
  superseded_by: string | null
  reason: string | null
}

const COLS = [
  'event_id', 'authorization_id', 'event_type', 'occurred_at', 'project_id',
  'principal_id', 'authority_basis', 'action_kind', 'authority_description',
  'target_type', 'target_id', 'target_version_hash',
  'conditions', 'evidence', 'expires_at', 'superseded_by', 'reason',
].join(', ')

function rowToEvent(row: Row): AuthorizationEvent {
  return {
    eventId:         row.event_id,
    authorizationId: row.authorization_id,
    type:            row.event_type as AuthorizationEvent['type'],
    occurredAt:      row.occurred_at,
    projectId:       row.project_id,
    principalId:     row.principal_id,
    authorityBasis:  row.authority_basis as AuthorizationEvent['authorityBasis'],
    target: {
      targetType:  row.target_type,
      targetId:    row.target_id,
      versionHash: row.target_version_hash,
    },
    authority: {
      actionKind:  row.action_kind,
      description: row.authority_description ?? '',
    },
    conditions:   (row.conditions as AuthorizationEvent['conditions']) ?? [],
    evidence:     (row.evidence as AuthorizationEvent['evidence']) ?? [],
    expiresAt:    row.expires_at,
    supersededBy: row.superseded_by,
    reason:       row.reason,
  }
}

function eventToRow(event: AuthorizationEvent): Record<string, unknown> {
  return {
    event_id:              event.eventId,
    authorization_id:      event.authorizationId,
    event_type:            event.type,
    occurred_at:           event.occurredAt,
    project_id:            event.projectId,
    principal_id:          event.principalId,
    authority_basis:       event.authorityBasis,
    action_kind:           event.authority.actionKind,
    authority_description: event.authority.description,
    target_type:           event.target.targetType,
    target_id:             event.target.targetId,
    target_version_hash:   event.target.versionHash,
    conditions:            event.conditions,
    evidence:              event.evidence,
    expires_at:            event.expiresAt,
    superseded_by:         event.supersededBy,
    reason:                event.reason,
  }
}

class PostgresAuthorizationEventStore implements AuthorizationEventStore {
  private table(): AnyDb {
    return (createAdminClient() as AnyDb).from('atlas_authorizations')
  }

  async append(event: AuthorizationEvent): Promise<AuthorizationEvent> {
    const { data, error } = await this.table().insert(eventToRow(event)).select(COLS).single()
    if (error) throw new Error(`[atlas-authorization] append failed: ${error.message}`)
    if (!data) throw new Error('[atlas-authorization] append returned no row')
    return rowToEvent(data as Row)
  }

  async history(authorizationId: string): Promise<AuthorizationEvent[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('authorization_id', authorizationId)
      .order('occurred_at', { ascending: true })
      .order('event_id', { ascending: true })
    if (error) throw new Error(`[atlas-authorization] history failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToEvent)
  }

  async byProject(projectId: string, limit = 200): Promise<AuthorizationEvent[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`[atlas-authorization] byProject failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToEvent)
  }

  async byTarget(projectId: string, targetType: string, targetId: string, limit = 200): Promise<AuthorizationEvent[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('project_id', projectId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('occurred_at', { ascending: true })
      .limit(limit)
    if (error) throw new Error(`[atlas-authorization] byTarget failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToEvent)
  }
}

export function createAuthorizationEventStore(): AuthorizationEventStore {
  return new PostgresAuthorizationEventStore()
}
