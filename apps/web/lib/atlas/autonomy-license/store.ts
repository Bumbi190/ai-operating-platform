/**
 * lib/atlas/autonomy-license/store.ts — the append-only licence event store.
 *
 * The only persistence boundary for autonomy licences. It exposes `append` and
 * reads: there is deliberately no update and no delete method, so §18.274
 * ("Preserve every grant, renewal, restriction, suspension, and revocation")
 * cannot be violated through this interface. The database enforces the same
 * rule independently via reject triggers.
 *
 * `atlas_autonomy_license_events` is SERVER_ONLY: RLS on, zero policies, no
 * grants to anon or authenticated, and `select` only to service_role. This
 * module is server-side.
 *
 * ── WHY `append` GOES THROUGH AN RPC RATHER THAN A TABLE INSERT ────────────
 * Ruling 7: "Concurrency must be structurally serialized so two human acts
 * derived from the same licence generation cannot both become canonical." Two
 * facts make that true, and both live inside the database rather than here:
 *
 *   • the next generation is DERIVED there, under `for update` on the chain, so
 *     no process can name a position it has not locked; and
 *   • the caller's observation is checked against that locked truth BEFORE the
 *     insert, and a mismatch is refused with SQLSTATE 40001 and no row written.
 *
 * The second is what actually catches a stale read. An insert built here from a
 * value this process computed could express neither, and a unique index alone
 * could not either — a stale caller asks for the following generation and never
 * collides.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { LicenseStoreError } from './errors'
import type { LicenseEvent } from './types'
import type { AutonomyLicenseLevel } from './levels'

type AnyDb = any

export interface AppendLicenseEventArgs {
  readonly licenseId: string
  /**
   * The lineage generation this act was DERIVED FROM — the caller's observation,
   * sent to the database so it can refuse a stale one.
   *
   * This is the whole optimistic-concurrency contract. The RPC derives the next
   * generation from committed truth under a lock; without this value a caller
   * that read the chain before another act committed simply receives the next
   * generation and appends a second act built from a view that no longer exists.
   * The unique index cannot catch that, because the stale caller never asks for
   * a generation that already exists.
   *
   * `0` for a fresh `LICENSE_ISSUED` (a lineage that does not exist yet); the
   * derived generation of the chain the caller just read for every other act.
   */
  readonly expectedGeneration: number
  readonly act: LicenseEvent['act']
  readonly projectId: string
  readonly workflowInstanceId: string
  readonly boundDefKey: string
  readonly boundDefHash: string
  readonly licensedLevel: AutonomyLicenseLevel
  readonly allowedActionKinds: readonly string[]
  readonly actionScopeFingerprint: string
  readonly decisionId: string
  readonly decisionVersion: number
  readonly decisionRecordId: string
  readonly effectiveAt: string
  readonly expiresAt: string
  readonly supersededByLicenseId: string | null
  readonly reason: string | null
  /**
   * Server-derived from the authenticated session, never from a request body.
   * The RPC re-validates its shape, so a machine token cannot be laundered into
   * a human authority record even if this boundary passed the wrong thing.
   */
  readonly actor: string
}

/**
 * The exact columns this store selects.
 *
 * EXPORTED so the real-PostgreSQL contract test can compare it against the
 * migrated table. That test is the one that would have caught a schema/store
 * disagreement: an earlier revision of the migration declared `created_at`
 * while this list selects `occurred_at`, and neither the SQL suite nor the unit
 * suite could see it because each tested only its own side.
 */
export const AUTONOMY_LICENSE_EVENT_COLS = [
  'event_id', 'event_seq', 'license_id', 'license_generation', 'act',
  'project_id', 'workflow_instance_id', 'bound_def_key', 'bound_def_hash',
  'licensed_level', 'allowed_action_kinds', 'action_scope_fingerprint',
  'decision_id', 'decision_version', 'decision_record_id',
  'effective_at', 'expires_at', 'superseded_by_license_id', 'reason',
  'actor', 'occurred_at',
].join(', ')

interface Row {
  event_id: string
  event_seq: number | string
  license_id: string
  license_generation: number
  act: string
  project_id: string
  workflow_instance_id: string
  bound_def_key: string
  bound_def_hash: string
  licensed_level: string
  allowed_action_kinds: string[]
  action_scope_fingerprint: string
  decision_id: string
  decision_version: number
  decision_record_id: string
  effective_at: string
  expires_at: string
  superseded_by_license_id: string | null
  reason: string | null
  actor: string
  occurred_at: string
}

function rowToEvent(row: Row): LicenseEvent {
  return {
    eventId:   row.event_id,
    eventSeq:  Number(row.event_seq),
    licenseId: row.license_id,
    generation: row.license_generation,
    act:       row.act as LicenseEvent['act'],
    projectId: row.project_id,
    workflowInstanceId: row.workflow_instance_id,
    boundDefKey:  row.bound_def_key,
    boundDefHash: row.bound_def_hash,
    licensedLevel: row.licensed_level as AutonomyLicenseLevel,
    allowedActionKinds: row.allowed_action_kinds ?? [],
    actionScopeFingerprint: row.action_scope_fingerprint,
    decisionId: row.decision_id,
    decisionVersion: row.decision_version,
    decisionRecordId: row.decision_record_id,
    effectiveAt: row.effective_at,
    expiresAt:   row.expires_at,
    supersededByLicenseId: row.superseded_by_license_id,
    reason: row.reason,
    actor:  row.actor,
    occurredAt: row.occurred_at,
  }
}

export interface AutonomyLicenseStore {
  /** Append one immutable event. Never updates or deletes. */
  append(args: AppendLicenseEventArgs): Promise<LicenseEvent>
  /** Full lineage of one licence, canonical order. Empty when unknown. */
  lineage(licenseId: string): Promise<LicenseEvent[]>
  /**
   * Every licence ever issued for one workflow instance, most recently
   * appended last. Empty when the instance has never been licensed.
   */
  byInstance(workflowInstanceId: string): Promise<LicenseEvent[]>
}

class PostgresAutonomyLicenseStore implements AutonomyLicenseStore {
  private table(): AnyDb {
    return (createAdminClient() as AnyDb).from('atlas_autonomy_license_events')
  }

  async append(args: AppendLicenseEventArgs): Promise<LicenseEvent> {
    // The RPC derives the generation, re-checks the act against the current
    // chain, and refuses a narrowing act that would widen. It returns the row
    // it actually wrote, so the caller reports the PERSISTED event rather than
    // the one it asked for.
    const { data, error } = await (createAdminClient() as AnyDb).rpc('autonomy_license_append', {
      p_license_id: args.licenseId,
      p_expected_generation: args.expectedGeneration,
      p_act: args.act,
      p_project_id: args.projectId,
      p_workflow_instance_id: args.workflowInstanceId,
      p_bound_def_key: args.boundDefKey,
      p_bound_def_hash: args.boundDefHash,
      p_licensed_level: args.licensedLevel,
      p_allowed_action_kinds: args.allowedActionKinds,
      p_action_scope_fingerprint: args.actionScopeFingerprint,
      p_decision_id: args.decisionId,
      p_decision_version: args.decisionVersion,
      p_decision_record_id: args.decisionRecordId,
      p_effective_at: args.effectiveAt,
      p_expires_at: args.expiresAt,
      p_superseded_by_license_id: args.supersededByLicenseId,
      p_reason: args.reason,
      p_actor: args.actor,
    })
    // The SQLSTATE is carried out rather than flattened into prose: it is the
    // only thing the boundary may base a refusal on, and a stale generation
    // (40001) must arrive distinguishable from a malformed write.
    if (error) {
      throw new LicenseStoreError(
        `[autonomy-license] append failed: ${error.message}`,
        typeof error.code === 'string' && error.code ? error.code : null,
      )
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new LicenseStoreError('[autonomy-license] append returned no row')
    return rowToEvent(row as Row)
  }

  async lineage(licenseId: string): Promise<LicenseEvent[]> {
    const { data, error } = await this.table()
      .select(AUTONOMY_LICENSE_EVENT_COLS)
      .eq('license_id', licenseId)
      // CAUSAL order, not clock order: generation is the structural position of
      // each act and event_seq is the total cursor. `occurred_at` is audit
      // evidence and is never the authority on ordering — ordering by it would
      // let a clock skew reorder an act before the act it was derived from.
      // Mirrors `orderLicenseEvents`; the pure core re-sorts regardless, so this
      // is a convenience, never the authority.
      .order('license_generation', { ascending: true })
      .order('event_seq', { ascending: true })
    if (error) throw new Error(`[autonomy-license] lineage failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToEvent)
  }

  async byInstance(workflowInstanceId: string): Promise<LicenseEvent[]> {
    const { data, error } = await this.table()
      .select(AUTONOMY_LICENSE_EVENT_COLS)
      .eq('workflow_instance_id', workflowInstanceId)
      .order('license_generation', { ascending: true })
      .order('event_seq', { ascending: true })
    if (error) throw new Error(`[autonomy-license] byInstance failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToEvent)
  }
}

export function createAutonomyLicenseStore(): AutonomyLicenseStore {
  return new PostgresAutonomyLicenseStore()
}
