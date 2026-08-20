/**
 * lib/atlas/workpackage/store.ts — Work Package persistence on `manager_tasks`.
 *
 * EI-S1.4A found `manager_tasks` is the existing operational coordination store
 * and the natural home for Work Packages, and a fresh audit for EI-S1.4D agreed:
 * 8 legacy rows, 14 columns, no triggers, RLS on, project nullable. So this is
 * an ADDITIVE integration, not a parallel task system.
 *
 * THE SHAPE OF THE COMPROMISE. `manager_tasks` is deliberately mutable — legacy
 * callers move `status`, write `result`, attach `run_id`. A Work Package's
 * authority terms must be exactly the opposite. Rather than force one rule on
 * the whole table, the row is split in two:
 *
 *   the OPERATIONAL SHELL   title, description, status, priority, result,
 *                           run_id, workflow_id — unchanged, still mutable,
 *                           legacy flows untouched
 *   the CANONICAL CONTRACT  work_package, work_package_hash, the Mission and
 *                           Delegation pins, workforce_role_id — immutable once
 *                           written, enforced by a database trigger
 *
 * A legacy row simply has no contract: every canonical column is NULL, the
 * conditional CHECK does not apply, and nothing about it changes. That is why
 * the migration can be additive and why `project_id` stays globally nullable —
 * making it NOT NULL would rewrite the meaning of rows nobody reviewed.
 *
 * WHAT IS NOT HERE. No status transition, no dispatch, no queue, no run
 * creation. Writing the row IS the assignment (§21.42); starting the work is a
 * later increment and has no code path in this module.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkPackage } from './types'

type AnyDb = any

/** One persisted canonical assignment, plus the row identity carrying it. */
export interface StoredWorkPackage {
  taskId: string
  workPackage: WorkPackage
  assignedAt: string
  /** The operational shell's status. Legacy meaning; NOT canonical state. */
  legacyStatus: string
}

export interface WorkPackageStore {
  /** Persist one assignment. Never updates an existing contract. */
  assign(input: {
    workPackage: WorkPackage
    title: string
    description: string | null
    at: string
  }): Promise<StoredWorkPackage>
  /** One package by its canonical id. Null when unknown. */
  byPackageId(workPackageId: string): Promise<StoredWorkPackage | null>
  /** Every canonical package cut from one Delegation envelope. Bounded. */
  byEnvelope(envelopeId: string, limit?: number): Promise<StoredWorkPackage[]>
  /** Every canonical package in one project. Bounded. */
  byProject(projectId: string, limit?: number): Promise<StoredWorkPackage[]>
}

interface Row {
  id: string
  project_id: string | null
  title: string
  description: string | null
  status: string
  created_at: string | null
  work_package_id: string | null
  work_package: unknown
  work_package_hash: string | null
  delegation_envelope_id: string | null
  delegation_bound_hash: string | null
  mission_id: string | null
  mission_version: number | null
  mission_bound_hash: string | null
  workforce_role_id: string | null
  assigned_at: string | null
}

const COLS = [
  'id', 'project_id', 'title', 'description', 'status', 'created_at',
  'work_package_id', 'work_package', 'work_package_hash',
  'delegation_envelope_id', 'delegation_bound_hash',
  'mission_id', 'mission_version', 'mission_bound_hash',
  'workforce_role_id', 'assigned_at',
].join(', ')

function rowToStored(row: Row): StoredWorkPackage | null {
  if (!row.work_package || !row.work_package_id) return null
  return {
    taskId: row.id,
    workPackage: row.work_package as WorkPackage,
    assignedAt: row.assigned_at ?? row.created_at ?? '',
    legacyStatus: row.status,
  }
}

class PostgresWorkPackageStore implements WorkPackageStore {
  private table(): AnyDb {
    return (createAdminClient() as AnyDb).from('manager_tasks')
  }

  async assign(input: {
    workPackage: WorkPackage
    title: string
    description: string | null
    at: string
  }): Promise<StoredWorkPackage> {
    const p = input.workPackage
    const { data, error } = await this.table().insert({
      // Operational shell — ordinary legacy fields, ordinary legacy meaning.
      project_id: p.projectId,
      title: input.title,
      description: input.description,
      // Left at the column default deliberately. §21.42 canonical `assigned` is
      // derived from the contract's existence, NOT from this column: two
      // mutable status sources competing over one row is how a ledger starts
      // disagreeing with itself.
      source: 'work_package',
      source_key: p.workPackageId,

      // Canonical contract — immutable once written (DB trigger).
      work_package_id: p.workPackageId,
      work_package: p,
      work_package_hash: p.packageHash,
      delegation_envelope_id: p.envelopeId,
      delegation_bound_hash: p.delegationBoundHash,
      mission_id: p.missionId,
      mission_version: p.missionVersion,
      mission_bound_hash: p.missionBoundHash,
      workforce_role_id: p.assignedRole.roleId,
      assigned_at: input.at,
    }).select(COLS).single()

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') throw new WorkPackageConflictError(error.message)
      throw new Error(`[manager-tasks-work-package] assign failed: ${error.message}`)
    }
    const stored = rowToStored(data as Row)
    if (!stored) throw new Error('[manager-tasks-work-package] assign returned no contract')
    return stored
  }

  async byPackageId(workPackageId: string): Promise<StoredWorkPackage | null> {
    const { data, error } = await this.table()
      .select(COLS).eq('work_package_id', workPackageId).maybeSingle()
    if (error) throw new Error(`[manager-tasks-work-package] read failed: ${error.message}`)
    return data ? rowToStored(data as Row) : null
  }

  async byEnvelope(envelopeId: string, limit = 200): Promise<StoredWorkPackage[]> {
    const { data, error } = await this.table()
      .select(COLS).eq('delegation_envelope_id', envelopeId)
      .order('assigned_at', { ascending: false }).limit(limit)
    if (error) throw new Error(`[manager-tasks-work-package] byEnvelope failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToStored).filter((s): s is StoredWorkPackage => s !== null)
  }

  async byProject(projectId: string, limit = 200): Promise<StoredWorkPackage[]> {
    const { data, error } = await this.table()
      .select(COLS).eq('project_id', projectId)
      .not('work_package_id', 'is', null)
      .order('assigned_at', { ascending: false }).limit(limit)
    if (error) throw new Error(`[manager-tasks-work-package] byProject failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToStored).filter((s): s is StoredWorkPackage => s !== null)
  }
}

/** Raised when the database refuses a duplicate canonical package. */
export class WorkPackageConflictError extends Error {}

export function createWorkPackageStore(): WorkPackageStore {
  return new PostgresWorkPackageStore()
}
