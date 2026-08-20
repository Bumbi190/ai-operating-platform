/**
 * lib/atlas/delegation/binding.ts — what an envelope was cut from.
 *
 * §21.15 — an envelope pinned to Mission version N must stay pinned to version
 * N. The version number alone is a weak pin: it says WHICH version, not WHAT
 * that version said. `missionBoundHash` records the second, so a stored
 * envelope can be checked against the Mission it claims and any drift is
 * visible rather than assumed away.
 *
 * The projection covers exactly the fields an envelope can be attenuated FROM.
 * A Mission's title, risks, assumptions and reporting prose can change without
 * changing what may be delegated; its authority, tools, data, budget, deadline,
 * scope and gates cannot. Binding only the second set means an unrelated
 * editorial amendment does not spuriously invalidate live delegations, while
 * every change that moves a bound does.
 *
 * Uses the Mission module's own `canonicalJson` deliberately. Zero I/O.
 */

import { createHash } from 'node:crypto'
import { canonicalJson } from '../mission/binding'
import type { AttenuationParent } from './attenuate'

/** Stable ordering, so member order cannot change a hash. */
function sorted<T>(items: T[]): T[] {
  return [...items].sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1))
}

/** The Mission facts that bound a delegation, in canonical form. */
export function missionBoundProjectionForDelegation(
  parent: AttenuationParent,
): Record<string, unknown> {
  return {
    missionId: parent.missionId,
    projectId: parent.projectId,
    version:   parent.version,

    // The ask. Narrowable, so a change to any of them changes what a live
    // envelope was permitted to promise.
    objective:       parent.objective,
    expectedOutcome: parent.expectedOutcome ?? null,
    deliverables:    [...parent.deliverables].sort(),
    successCriteria: sorted(parent.successCriteria),

    // The bounds. Every one of these is authority in practice.
    inScope:          [...parent.inScope].sort(),
    outOfScope:       [...parent.outOfScope].sort(),
    constraints:      sorted(parent.constraints),
    authority:        sorted(parent.authority),
    allowedActions:   sorted(parent.allowedActions),
    forbiddenActions: sorted(parent.forbiddenActions),
    tools:            sorted(parent.tools),
    dataScope:        sorted(parent.dataScope),
    budget:           parent.budget ?? null,
    deadline:         parent.deadline ?? null,

    // The control points a Manager inherits and may only add to.
    approvalGates:      sorted(parent.approvalGates),
    escalationTriggers: sorted(parent.escalationTriggers),
    stopConditions:     sorted(parent.stopConditions),
    reporting:          sorted(parent.reporting),
    dependencies:       sorted(parent.dependencies),
  }
}

/** sha256 over the canonical serialization of the delegable Mission bounds. */
export function missionBoundHash(parent: AttenuationParent): string {
  return createHash('sha256')
    .update(canonicalJson(missionBoundProjectionForDelegation(parent)))
    .digest('hex')
}
