/**
 * lib/atlas/delegation/store.ts — append-only delegation record store.
 *
 * The only persistence boundary for Delegation Envelopes. As with the Mission
 * and Decision ledgers there is deliberately no `update` and no `delete`: an
 * accepted envelope whose bounds could be edited afterwards is not a contract
 * (§21.18), and the database enforces the same rule independently with reject
 * triggers.
 *
 * `atlas_delegation_ledger` is service-role only; this module is server-side.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { DelegationRecord } from './types'

type AnyDb = any

export interface DelegationLedgerStore {
  /** Append one immutable act. Never updates or deletes. */
  append(record: DelegationRecord): Promise<DelegationRecord>
  /** Full lineage of one envelope, canonical order. Empty when unknown. */
  lineage(envelopeId: string): Promise<DelegationRecord[]>
  /** Every record for one project, newest first. Bounded. */
  byProject(projectId: string, limit?: number): Promise<DelegationRecord[]>
  /** Every record for one mission, newest first. Bounded. */
  byMission(missionId: string, limit?: number): Promise<DelegationRecord[]>
}

interface Row {
  record_id: string
  envelope_id: string
  project_id: string
  act_type: string
  occurred_at: string
  mission_id: string
  mission_version: number
  mission_bound_hash: string
  envelope: unknown
  rejections: unknown
  replan: unknown
  actor_kind: string
  actor_id: string | null
  note: string | null
  revoked_reason: string | null
  lineage_sequence: number
}

const COLS = [
  'record_id', 'envelope_id', 'project_id', 'act_type', 'occurred_at',
  'mission_id', 'mission_version', 'mission_bound_hash',
  'envelope', 'rejections', 'replan',
  'actor_kind', 'actor_id', 'note', 'revoked_reason', 'lineage_sequence',
].join(', ')

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function rowToRecord(row: Row): DelegationRecord {
  return {
    recordId:   row.record_id,
    envelopeId: row.envelope_id,
    projectId:  row.project_id,
    actType:    row.act_type as DelegationRecord['actType'],
    occurredAt: row.occurred_at,
    missionId:  row.mission_id,
    missionVersion: row.mission_version,
    missionBoundHash: row.mission_bound_hash,
    envelope:   (row.envelope as DelegationRecord['envelope']) ?? null,
    rejections: arr(row.rejections),
    replan:     (row.replan as DelegationRecord['replan']) ?? null,
    actorKind:  row.actor_kind as DelegationRecord['actorKind'],
    actorId:    row.actor_id,
    note:       row.note,
    revokedReason: (row.revoked_reason as DelegationRecord['revokedReason']) ?? null,
    lineageSequence: row.lineage_sequence,
  }
}

function recordToRow(record: DelegationRecord): Record<string, unknown> {
  return {
    record_id:   record.recordId,
    envelope_id: record.envelopeId,
    project_id:  record.projectId,
    act_type:    record.actType,
    occurred_at: record.occurredAt,
    mission_id:  record.missionId,
    mission_version: record.missionVersion,
    mission_bound_hash: record.missionBoundHash,
    envelope:    record.envelope,
    rejections:  record.rejections,
    replan:      record.replan,
    actor_kind:  record.actorKind,
    actor_id:    record.actorId,
    note:        record.note,
    revoked_reason: record.revokedReason,
    lineage_sequence: record.lineageSequence,
  }
}

class PostgresDelegationLedgerStore implements DelegationLedgerStore {
  private table(): AnyDb {
    return (createAdminClient() as AnyDb).from('atlas_delegation_ledger')
  }

  async append(record: DelegationRecord): Promise<DelegationRecord> {
    const { data, error } = await this.table().insert(recordToRow(record)).select(COLS).single()
    if (error) {
      // 23505 is a unique index refusing the write: either a second deciding
      // act, or two writers claiming the same lineage position. Both are
      // conflicts rather than failures — exactly one writer won.
      const code = (error as { code?: string }).code
      if (code === '23505') throw new DelegationConflictError(error.message)
      throw new Error(`[atlas-delegation-ledger] append failed: ${error.message}`)
    }
    if (!data) throw new Error('[atlas-delegation-ledger] append returned no row')
    return rowToRecord(data as Row)
  }

  async lineage(envelopeId: string): Promise<DelegationRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('envelope_id', envelopeId)
      // Matches the pure core's canonical order. The core re-sorts regardless
      // — this is never the authority on ordering.
      .order('lineage_sequence', { ascending: true })
    if (error) throw new Error(`[atlas-delegation-ledger] lineage failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }

  async byProject(projectId: string, limit = 200): Promise<DelegationRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`[atlas-delegation-ledger] byProject failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }

  async byMission(missionId: string, limit = 200): Promise<DelegationRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('mission_id', missionId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`[atlas-delegation-ledger] byMission failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }
}

/** Raised when the database refuses a second deciding act on one envelope. */
export class DelegationConflictError extends Error {}

export function createDelegationLedgerStore(): DelegationLedgerStore {
  return new PostgresDelegationLedgerStore()
}
