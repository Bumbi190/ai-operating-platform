/**
 * lib/atlas/workpackage/binding.ts — what a Work Package was cut from.
 *
 * EI-S1.4C gave the Delegation a `missionBoundHash` so an envelope could prove
 * the Mission version behind it had not drifted. A Work Package needs the same
 * proof one hop down, and there was no `delegationBoundHash` to inherit — so
 * this file creates it.
 *
 * TWO HASHES, TWO QUESTIONS. `delegationBoundHash` answers "does the accepted
 * Delegation still say what this package was cut from?". `packageHash` answers
 * "have this package's own authority terms been altered since assignment?".
 * The first guards the chain above; the second guards the contract itself, and
 * is what the database trigger compares an UPDATE against.
 *
 * The projections cover only DELEGABLE terms. A Delegation's `objective` prose
 * or a package's `taskObjective` wording can change nothing about what may be
 * done, so binding them would make an editorial edit look like an authority
 * change — and then the invalidation signal would stop meaning anything.
 */

import { createHash } from 'node:crypto'
import { canonicalJson } from '../mission/binding'
import type { DelegationEnvelope } from '../delegation/types'
import type { WorkPackage } from './types'

const sorted = <T>(items: T[]): T[] =>
  [...items].sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1))

/** The Delegation terms a Work Package may be attenuated FROM. */
export function delegationBoundProjection(envelope: DelegationEnvelope): Record<string, unknown> {
  return {
    envelopeId:       envelope.envelopeId,
    projectId:        envelope.projectId,
    missionId:        envelope.missionId,
    missionVersion:   envelope.missionVersion,
    missionBoundHash: envelope.missionBoundHash,

    authority:        sorted(envelope.authority),
    allowedActions:   sorted(envelope.allowedActions),
    forbiddenActions: sorted(envelope.forbiddenActions),
    tools:            sorted(envelope.tools),
    dataScope:        sorted(envelope.dataScope),
    inScope:          [...envelope.inScope].sort(),
    outOfScope:       [...envelope.outOfScope].sort(),
    budget:           envelope.budget ?? null,
    deadline:         envelope.deadline ?? null,
    constraints:      sorted(envelope.constraints),
    approvalGates:    sorted(envelope.approvalGates),
    escalationTriggers: sorted(envelope.escalationTriggers),
    stopConditions:   sorted(envelope.stopConditions),
    reporting:        sorted(envelope.reporting),
  }
}

/** sha256 over the canonical serialization of the delegable Delegation terms. */
export function delegationBoundHash(envelope: DelegationEnvelope): string {
  return createHash('sha256').update(canonicalJson(delegationBoundProjection(envelope))).digest('hex')
}

/** The Work Package's own authority-bearing terms. */
export function workPackageBoundProjection(pkg: Omit<WorkPackage, 'packageHash'>): Record<string, unknown> {
  return {
    workPackageId:       pkg.workPackageId,
    envelopeId:          pkg.envelopeId,
    delegationBoundHash: pkg.delegationBoundHash,
    missionId:           pkg.missionId,
    missionVersion:      pkg.missionVersion,
    missionBoundHash:    pkg.missionBoundHash,
    projectId:           pkg.projectId,
    // §21.34 — WHO it was assigned to is part of the contract. Reassigning is a
    // different package, not an edit to this one.
    //
    // The NAME is covered too (EI-S1.4D-R1). It authorizes nothing — `roleId` is
    // what the registry resolves — but it is the label an auditor reads off the
    // stored record, and hashing only the id left it silently editable by any
    // writer that bypassed the database trigger. A contract whose audit label
    // can drift from its authority is not fully sealed.
    assignedRole:        { roleId: pkg.assignedRole.roleId, roleName: pkg.assignedRole.roleName },

    taskObjective:       pkg.taskObjective,
    inputs:              sorted(pkg.inputs),
    expectedOutput:      sorted(pkg.expectedOutput),

    authority:           sorted(pkg.authority),
    allowedActions:      sorted(pkg.allowedActions),
    forbiddenActions:    sorted(pkg.forbiddenActions),
    tools:               sorted(pkg.tools),
    dataScope:           sorted(pkg.dataScope),
    inScope:             [...pkg.inScope].sort(),
    outOfScope:          [...pkg.outOfScope].sort(),
    budget:              pkg.budget ?? null,
    deadline:            pkg.deadline ?? null,
    constraints:         sorted(pkg.constraints),
    approvalGates:       sorted(pkg.approvalGates),
    escalationTriggers:  sorted(pkg.escalationTriggers),
    stopConditions:      sorted(pkg.stopConditions),
    reporting:           sorted(pkg.reporting),
    dependencies:        sorted(pkg.dependencies),
    fallback:            pkg.fallback ?? null,
    packageVersion:      pkg.packageVersion,
  }
}

/** sha256 over the canonical serialization of the package's authority terms. */
export function workPackageHash(pkg: Omit<WorkPackage, 'packageHash'>): string {
  return createHash('sha256').update(canonicalJson(workPackageBoundProjection(pkg))).digest('hex')
}
