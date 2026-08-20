/**
 * lib/atlas/workpackage/principal-read.ts — the public Work Package read surface.
 *
 * Two layers, kept apart for the same reason every boundary above keeps them
 * apart:
 *
 *   lifecycleState   what durably happened. A persisted package was assigned,
 *                    and that stays true forever (§21.42).
 *   effectiveState   what is true right now, once the authority chain above it
 *                    is re-asked.
 *
 * `invalidated` exists only in the second, and is never stored. A package can
 * be permanently, truthfully assigned and completely unusable this second
 * because the Delegation behind it was revoked, or the Mission behind that
 * ended. Writing that into the row would mean mutating the contract every time
 * the world changed — which is exactly what the immutability trigger forbids,
 * and would also rewrite history to pretend the assignment never happened.
 *
 * §21.42 IS THE CEILING. `assigned` and `invalidated` are the only states here.
 * Executing, Waiting, Blocked, Escalated, Paused, Completed, Failed and
 * Quarantined all require real execution and monitoring semantics that this
 * increment does not build, so none of them is representable.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import {
  resolveDelegationEvaluation,
  type DelegationReadArgs,
} from '@/lib/atlas/delegation/principal-read'
import { workPackageIsContained } from './attenuate'
import { delegationBoundHash } from './binding'
import { readWorkforceRole, type WorkforceRoleReader } from './roles'
import { createWorkPackageStore, type StoredWorkPackage, type WorkPackageStore } from './store'
import type { WorkPackageEvaluation, WorkPackageUnusableReason } from './types'

export type WorkPackageReadStatus =
  | 'ok'
  | 'no_principal'
  | 'project_denied'
  /** Unknown OR foreign — deliberately indistinguishable. */
  | 'not_permitted'
  | 'unavailable'

export interface WorkPackageReadArgs {
  store?: WorkPackageStore
  now?: string
  roleReader?: WorkforceRoleReader
  delegation?: DelegationReadArgs
}

/**
 * Resolve one package and its live effective state.
 *
 * Scope comes from the package's own recorded project, never from a caller
 * parameter, so a caller cannot widen what they may see by asking differently.
 */
export async function resolveWorkPackage(
  workPackageId: string,
  args: WorkPackageReadArgs = {},
): Promise<{ evaluation: WorkPackageEvaluation | null; status: WorkPackageReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { evaluation: null, status: 'no_principal' }

  const store = args.store ?? createWorkPackageStore()
  let stored: StoredWorkPackage | null
  try {
    stored = await store.byPackageId(workPackageId)
  } catch {
    return { evaluation: null, status: 'unavailable' }
  }
  // Unknown and foreign collapse to one class — no existence oracle.
  if (!stored) return { evaluation: null, status: 'not_permitted' }
  if (!assertProjectAllowed(stored.workPackage.projectId, access.allowedProjectIds)) {
    return { evaluation: null, status: 'not_permitted' }
  }

  const pkg = stored.workPackage
  const settle = (reason: WorkPackageUnusableReason) => ({
    evaluation: {
      lifecycleState: 'assigned' as const,
      effectiveState: reason === 'usable' ? ('assigned' as const) : ('invalidated' as const),
      usable: reason === 'usable',
      reason,
      workPackage: pkg,
      assignedAt: stored!.assignedAt,
    },
    status: 'ok' as const,
  })

  // §21.14 — the parent Delegation, live. One call carries every EI-S1.4C
  // invariant: rejected, revoked, invalidated, mission ended, mission version
  // stale, mission bound hash stale, project mode, governing Decision, lost
  // containment. None of it is re-implemented here.
  const { evaluation: delegation, status } = await resolveDelegationEvaluation(pkg.envelopeId, {
    ...args.delegation, now: args.now,
  })
  if (status !== 'ok' || !delegation) return settle('delegation_unreadable')
  if (delegation.lifecycleStatus !== 'accepted' || !delegation.usable) {
    return settle('delegation_unusable')
  }

  const envelope = delegation.state.envelope

  // The stored pin must still describe the Delegation being evaluated. The
  // version numbers can agree while the terms have moved, so the hash is the
  // check that actually catches drift.
  if (pkg.delegationBoundHash !== delegationBoundHash(envelope)) {
    return settle('delegation_pin_changed')
  }
  if (
    pkg.missionId !== envelope.missionId
    || pkg.missionVersion !== envelope.missionVersion
    || pkg.missionBoundHash !== envelope.missionBoundHash
  ) {
    return settle('mission_pin_changed')
  }

  // §6.39 — re-prove containment. A stored row is never authority on its own.
  if (workPackageIsContained(envelope, pkg).length > 0) return settle('exceeds_delegation')

  // §21.158 — the role must still resolve, in this project.
  const role = await (args.roleReader ?? readWorkforceRole)(pkg.assignedRole.roleId)
  if (!role || role.projectId !== pkg.projectId) return settle('role_unavailable')

  return settle('usable')
}

/** The one question a caller relying on a package actually has. */
export async function isWorkPackageUsable(
  workPackageId: string,
  args: WorkPackageReadArgs = {},
): Promise<{ usable: boolean; reason: WorkPackageUnusableReason; status: WorkPackageReadStatus }> {
  const { evaluation, status } = await resolveWorkPackage(workPackageId, args)
  if (!evaluation) return { usable: false, reason: 'delegation_unreadable', status }
  return { usable: evaluation.usable, reason: evaluation.reason, status: 'ok' }
}

/**
 * Every canonical package cut from one Delegation.
 *
 * Filtered against the caller's projects rather than answered from the
 * envelope id alone, so an unknown envelope and a foreign one both return an
 * empty list rather than different answers.
 */
export async function listEnvelopeWorkPackages(
  envelopeId: string,
  args: WorkPackageReadArgs & { limit?: number } = {},
): Promise<{ packages: StoredWorkPackage[]; status: WorkPackageReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { packages: [], status: 'no_principal' }
  const store = args.store ?? createWorkPackageStore()
  try {
    const rows = await store.byEnvelope(envelopeId, args.limit)
    return {
      packages: rows.filter(r => assertProjectAllowed(r.workPackage.projectId, access.allowedProjectIds)),
      status: 'ok',
    }
  } catch {
    return { packages: [], status: 'unavailable' }
  }
}

/** Bounded project listing. The caller names the scope they already assert. */
export async function listProjectWorkPackages(
  projectId: string,
  args: WorkPackageReadArgs & { limit?: number } = {},
): Promise<{ packages: StoredWorkPackage[]; status: WorkPackageReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { packages: [], status: 'no_principal' }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return { packages: [], status: 'project_denied' }
  }
  const store = args.store ?? createWorkPackageStore()
  try {
    return { packages: await store.byProject(projectId, args.limit), status: 'ok' }
  } catch {
    return { packages: [], status: 'unavailable' }
  }
}
