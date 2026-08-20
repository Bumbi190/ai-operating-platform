/**
 * lib/atlas/workpackage/validate.ts — is this persisted contract coherent?
 *
 * ONE SEAM, ASKED BEFORE ANY AUTHORITY USE.
 *
 * A canonical Work Package row stores its contract TWICE: once as JSON, and
 * once as relational columns whose entire purpose is to pin it. EI-S1.4D read
 * back only the JSON, so the two halves could disagree and nothing would
 * notice — a row could claim one project in its columns and another in its
 * payload, and the payload would win the access decision.
 *
 * Worse, the package's own `packageHash` was written and never verified. Every
 * decomposition field — task objective, inputs, expected output, dependencies,
 * fallback, assigned role — sits inside the JSON and is NOT constrained by
 * containment against the parent Delegation, because a decomposition is
 * allowed to differ from its parent. So containment could not catch a rewritten
 * objective. The hash is the only thing that can, and it has to actually be
 * recomputed.
 *
 * THREE THINGS MUST AGREE:
 *
 *     recomputed hash  ==  JSON packageHash  ==  relational work_package_hash
 *
 * plus every pin column matching its JSON counterpart. Anything else is a
 * corrupt institutional record, and a corrupt record must stop the caller
 * rather than be normalized into a plausible-looking object.
 *
 * Pure: no network, no model, no clock.
 */

import { workPackageHash } from './binding'
import type { StoredWorkPackage } from './store'

/** Why a persisted contract is not institutionally coherent. */
export type StoredContractFault =
  | 'package_id_mismatch'
  | 'project_mismatch'
  | 'envelope_mismatch'
  | 'delegation_pin_mismatch'
  | 'mission_id_mismatch'
  | 'mission_version_mismatch'
  | 'mission_pin_mismatch'
  | 'role_mismatch'
  | 'hash_column_mismatch'
  | 'hash_recompute_mismatch'
  | 'project_missing'

export interface StoredContractValidation {
  coherent: boolean
  faults: StoredContractFault[]
}

/**
 * Validate one persisted canonical Work Package.
 *
 * Returns EVERY fault rather than the first, so a corrupt row can be diagnosed
 * in one look instead of one repair at a time.
 */
export function validateStoredWorkPackage(stored: StoredWorkPackage): StoredContractValidation {
  const faults: StoredContractFault[] = []
  const { workPackage: json, columns } = stored

  if (json.workPackageId !== columns.workPackageId) faults.push('package_id_mismatch')

  // §6.117 — a canonical package always names its project. The migration's
  // conditional CHECK enforces it; a null here means the row came from
  // somewhere else entirely.
  if (columns.projectId === null) faults.push('project_missing')
  else if (json.projectId !== columns.projectId) faults.push('project_mismatch')

  if (json.envelopeId !== columns.delegationEnvelopeId) faults.push('envelope_mismatch')
  if (json.delegationBoundHash !== columns.delegationBoundHash) faults.push('delegation_pin_mismatch')
  if (json.missionId !== columns.missionId) faults.push('mission_id_mismatch')
  if (json.missionVersion !== columns.missionVersion) faults.push('mission_version_mismatch')
  if (json.missionBoundHash !== columns.missionBoundHash) faults.push('mission_pin_mismatch')
  // §21.34 — WHO received it is part of the contract, so the column and the
  // payload must name the same role.
  if (json.assignedRole.roleId !== columns.workforceRoleId) faults.push('role_mismatch')

  if (json.packageHash !== columns.workPackageHash) faults.push('hash_column_mismatch')

  // The decisive check. `workPackageHash` hashes the contract WITHOUT its own
  // hash field, so recomputing and comparing detects any edit to the stored
  // terms — including the decomposition fields that containment deliberately
  // does not constrain.
  const { packageHash: _stored, ...terms } = json
  if (workPackageHash(terms) !== json.packageHash) faults.push('hash_recompute_mismatch')

  return { coherent: faults.length === 0, faults }
}
