/**
 * lib/atlas/workpackage/principal-write.ts — the sanctioned Manager → Workforce
 * write boundary.
 *
 * ORDERING RULE, unchanged from every boundary above it: authenticate →
 * establish project authority → resolve the parent Delegation → resolve the
 * Mission THROUGH that Delegation → validate → write. An unknown package and a
 * foreign package return one indistinguishable `not_permitted`.
 *
 * THE PARENT IS RE-ASKED EVERY TIME (§21.14). A Work Package is a claim about
 * an accepted Delegation, and the Delegation is the authority — so prepare and
 * assign both resolve it live through `resolveDelegationEvaluation`, the
 * EI-S1.4C evaluation seam. That single call already fails closed on a rejected,
 * revoked or invalidated envelope, a terminal Mission, a stale Mission version,
 * a drifted mission bound hash, a non-operational project mode, an invalid
 * governing Decision, and lost containment. Nothing here re-implements any of
 * that; re-implementing it is how two answers to one question appear.
 *
 * ASSIGNMENT IS NOT EXECUTION (§21.42). Writing the row IS the assignment: the
 * role has RECEIVED the package and nothing has started. This module imports no
 * runner, executor, dispatcher, publisher or model, creates no run, and moves
 * no status.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import {
  resolveDelegationEvaluation,
  type DelegationReadArgs,
} from '@/lib/atlas/delegation/principal-read'
import type { DelegationEnvelope } from '@/lib/atlas/delegation/types'
import {
  attenuateWorkPackage,
  workPackageIsContained,
  type WorkPackageRequest,
  type WorkPackageViolation,
} from './attenuate'
import { delegationBoundHash, workPackageHash } from './binding'
import { evaluateRoleEligibility, readWorkforceRole, type WorkforceRoleReader } from './roles'
import { validateStoredWorkPackage } from './validate'
import { createWorkPackageStore, WorkPackageConflictError, type WorkPackageStore } from './store'
import type { WorkPackage, WorkPackageRejection } from './types'

export type WorkPackageWriteStatus =
  | 'ok'
  | 'no_principal'
  | 'project_denied'
  /** Unknown OR foreign, deliberately indistinguishable. */
  | 'not_permitted'
  | 'invalid_request'
  /** §21.14 — the parent Delegation is not accepted-and-usable right now. */
  | 'delegation_not_usable'
  /** §6.39 — the requested package is not contained by its Delegation. */
  | 'exceeds_delegation'
  /** §21.34/§21.35 — the role cannot receive this package. */
  | 'role_not_eligible'
  | 'conflict'
  | 'unavailable'

export interface WorkPackageWriteResult {
  workPackage: WorkPackage | null
  status: WorkPackageWriteStatus
  detail?: string
  /** §6.39 — every containment failure, when that is why. */
  violations?: WorkPackageViolation[]
  /** §21.28 — typed grounds, when the package was refused. */
  rejections?: WorkPackageRejection[]
  /** Set only once the package is durably assigned. */
  taskId?: string
}

interface CommonArgs {
  store?: WorkPackageStore
  now?: string
  /** Injected role registry reader; production callers omit it. */
  roleReader?: WorkforceRoleReader
  /** Forwarded to the EI-S1.4C delegation evaluation seam. */
  delegation?: DelegationReadArgs
}

const DENY = (
  status: WorkPackageWriteStatus,
  detail?: string,
  extra?: Partial<WorkPackageWriteResult>,
): WorkPackageWriteResult => ({
  workPackage: null, status, ...(detail ? { detail } : {}), ...(extra ?? {}),
})

interface Principal { userId: string; allowedProjectIds: string[] }

async function authenticate(): Promise<Principal | WorkPackageWriteResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { workPackage: null, status: 'no_principal' }
  return { userId: access.userId, allowedProjectIds: access.allowedProjectIds }
}

/**
 * Resolve the parent Delegation and fail closed unless it is usable NOW.
 *
 * One call carries every EI-S1.4C invariant. The only thing added here is the
 * delegation boundary's own isolation assertion — stated rather than inherited
 * as an assumption from a module this one does not control.
 */
async function usableDelegation(
  principal: Principal,
  envelopeId: string,
  args: CommonArgs,
): Promise<{ envelope: DelegationEnvelope; boundHash: string } | WorkPackageWriteResult> {
  const { evaluation, status } = await resolveDelegationEvaluation(envelopeId, {
    ...args.delegation, now: args.now,
  })
  if (status === 'no_principal') return DENY('no_principal')
  if (status === 'unavailable') return DENY('unavailable')
  if (status !== 'ok' || !evaluation) return DENY('not_permitted')

  const envelope = evaluation.state.envelope
  if (!assertProjectAllowed(envelope.projectId, principal.allowedProjectIds)) {
    return DENY('not_permitted')
  }
  // §21.14 — lifecycle AND effective. `usable` already implies accepted, but
  // both are asserted so the intent survives a change to either.
  if (evaluation.lifecycleStatus !== 'accepted') {
    return DENY('delegation_not_usable', `delegation_${evaluation.lifecycleStatus}`)
  }
  if (!evaluation.usable) {
    return DENY('delegation_not_usable', `delegation_${evaluation.reason}`)
  }
  return { envelope, boundHash: delegationBoundHash(envelope) }
}

const newId = () => crypto.randomUUID()

export interface PrepareWorkPackageArgs extends CommonArgs {
  envelopeId: string
  request: WorkPackageRequest
}

/**
 * §21.28 — build a bounded Work Package from an accepted Delegation.
 *
 * Pure with respect to persistence: it validates and returns, and writes
 * nothing. A Manager can preview a decomposition without committing to it, and
 * a caller that only wants to know "would this be allowed?" never creates a row.
 */
export async function prepareWorkPackage(
  args: PrepareWorkPackageArgs,
): Promise<WorkPackageWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal
  return prepareWithPrincipal(principal, args)
}

/**
 * The preparation work, given an ALREADY-AUTHENTICATED principal.
 *
 * §21.19 — one institutional act resolves the acting identity once.
 * `assignWorkPackage` used to authenticate, then call `prepareWorkPackage`
 * which authenticated again, so a session changing mid-act could have one
 * principal establish scope and another complete the assignment. Splitting the
 * seam keeps `prepareWorkPackage` a normal authenticated public boundary when
 * called on its own, without weakening it.
 */
async function prepareWithPrincipal(
  principal: Principal,
  args: PrepareWorkPackageArgs,
): Promise<WorkPackageWriteResult> {
  const parent = await usableDelegation(principal, args.envelopeId, args)
  if ('status' in parent) return parent

  const attenuated = attenuateWorkPackage(parent.envelope, args.request, parent.boundHash)
  if (!attenuated.ok) {
    return DENY('exceeds_delegation', 'containment', { violations: attenuated.violations })
  }

  // §21.34/§21.35 — the role must be real, in this project, and able to reach
  // what the package needs on the evidence Stage 1 actually has.
  const role = await (args.roleReader ?? readWorkforceRole)(args.request.role.roleId)
  const eligibility = evaluateRoleEligibility({
    role,
    projectId: parent.envelope.projectId,
    tools: attenuated.package.tools,
    dataScope: attenuated.package.dataScope,
    // The parent Delegation was ACCEPTED, which under §21.16 required its tools
    // to be proven available. A package narrowing within that set inherits the
    // proof; it never manufactures one.
    provenTools: new Set(parent.envelope.tools.map(t => `${t.tool} ${t.restriction ?? ''}`)),
  })
  if (!eligibility.eligible) {
    const rejection: WorkPackageRejection = {
      reason:
        eligibility.reason === 'role_not_found' ? 'role_not_found' :
        eligibility.reason === 'role_project_mismatch' ? 'role_project_mismatch' :
        eligibility.reason === 'data_domain_unsanctioned' ? 'input_unavailable' :
        'role_capability_unproven',
      subject: eligibility.unprovable[0] ?? args.request.role.roleId,
      detail: eligibility.reason,
    }
    return DENY('role_not_eligible', eligibility.reason, { rejections: [rejection] })
  }

  // §21.158 — every dependency must stay inside this project. A predecessor in
  // another project would carry work across an isolation boundary.
  for (const dep of attenuated.package.dependencies) {
    if (dep.predecessorPackageId) {
      const store = args.store ?? createWorkPackageStore()
      let predecessor
      try {
        predecessor = await store.byPackageId(dep.predecessorPackageId)
      } catch {
        return DENY('unavailable')
      }
      const mismatch = () => DENY('invalid_request', 'dependency_project_mismatch', {
        rejections: [{ reason: 'dependency_project_mismatch', subject: dep.predecessorPackageId }],
      })
      if (!predecessor) return mismatch()

      // EI-S1.4D-R2 — a stored package is not trustworthy until validated, and
      // its RELATIONAL project is the scope. Reading `workPackage.projectId`
      // here trusted the payload of a row nobody had checked: a predecessor
      // physically in another project could claim this one and be accepted,
      // carrying a dependency across an isolation boundary (§21.158).
      if (!validateStoredWorkPackage(predecessor).coherent) return mismatch()
      if (predecessor.columns.projectId !== parent.envelope.projectId) return mismatch()
    }
  }

  const workPackageId = newId()
  const withId = {
    ...attenuated.package,
    workPackageId,
    assignedRole: { roleId: role!.roleId, roleName: role!.roleName },
  }
  return {
    workPackage: { ...withId, packageHash: workPackageHash(withId) },
    status: 'ok',
  }
}

export interface AssignWorkPackageArgs extends PrepareWorkPackageArgs {
  /** Operational shell title. Never authority; purely for the task list. */
  title?: string
}

/**
 * §21.42 — assign the package to its Workforce role.
 *
 * "Assigned" means RECEIVED. This function's entire effect is one durable row
 * carrying an immutable contract. It starts nothing, queues nothing, and
 * touches no status: canonical `assigned` is derived from the contract's
 * existence, so there is no second mutable state to move.
 *
 * There is deliberately no `assigned: true` or `authority: true` parameter. The
 * parent Delegation and the validation above decide what may be persisted.
 */
export async function assignWorkPackage(
  args: AssignWorkPackageArgs,
): Promise<WorkPackageWriteResult> {
  // §21.19 — ONE authenticated principal for the whole assignment act: initial
  // parent scope, preparation, and the final pre-insert re-check all use it.
  const principal = await authenticate()
  if ('status' in principal) return principal

  const prepared = await prepareWithPrincipal(principal, args)
  if (prepared.status !== 'ok' || !prepared.workPackage) return prepared

  const pkg = prepared.workPackage
  const store = args.store ?? createWorkPackageStore()
  const at = args.now ?? new Date().toISOString()

  // RE-CHECK IMMEDIATELY BEFORE THE INSERT (EI-S1.4D-R1).
  //
  // `prepareWorkPackage` resolved the parent Delegation, then attenuation, role
  // lookup and dependency checks all ran before the write — a window in which a
  // revocation could land. This second resolve costs one read and narrows that
  // window to a single read-then-insert, comparing the pin the package was
  // actually cut from rather than merely re-asking whether the envelope is
  // usable.
  //
  // IT DOES NOT CLOSE THE RACE, and is not presented as if it does. Closing it
  // would need a transaction spanning the delegation ledger and manager_tasks,
  // which is a cross-ledger architecture Stage 1 deliberately does not build.
  // What makes the residual window safe is that assignment grants nothing:
  // §21.42 `assigned` means RECEIVED, nothing executes from these rows, and
  // `resolveWorkPackage` re-asks the live chain on every read — so a package
  // written microseconds before a revocation reads back `invalidated` at once.
  const recheck = await usableDelegation(principal, args.envelopeId, args)
  if ('status' in recheck) return recheck
  if (recheck.boundHash !== pkg.delegationBoundHash) {
    return DENY('delegation_not_usable', 'delegation_changed_during_assignment')
  }

  try {
    const stored = await store.assign({
      workPackage: pkg,
      title: args.title?.trim() || pkg.taskObjective.slice(0, 120),
      description: pkg.taskObjective,
      at,
    })
    return { workPackage: stored.workPackage, status: 'ok', taskId: stored.taskId }
  } catch (error) {
    if (error instanceof WorkPackageConflictError) return DENY('conflict')
    return DENY('unavailable')
  }
}

/** Re-export so the read boundary proves containment with the same function. */
export { workPackageIsContained }
