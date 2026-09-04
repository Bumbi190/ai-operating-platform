/**
 * lib/workflows/effect/execution-authorization.ts — permission to ACT.
 *
 * ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
 * `assertWorkflowActionReady` validates a run's `authorization_id` as a
 * `workflow_gate` grant — the thing a human approves to move a workflow from one
 * state to the next. For a READ_ONLY action that is harmless, because the class
 * requires no authorization at all. For an effectful one it would be a category
 * error: permission to LEAVE `audio_generation` would imply permission to spend
 * money inside it.
 *
 * Entering or leaving a state and performing an irreversible act inside it are
 * different decisions, made on different evidence, and they must not share a
 * grant.
 *
 * ── FORWARD-ONLY, FOR THE SAME REASON AS 2B-0.6 ─────────────────────────────
 * Four `workflow.gate.advance` authorizations already exist and one has been
 * consumed. Nothing here changes how they are computed or read. This is a new
 * `targetType`, and `sameTarget` compares targetType, targetId AND versionHash,
 * so an advance grant can never satisfy an execution check and vice versa.
 *
 * ── ONE AUTHORIZATION CANNOT FUND TWO DISPATCHES ────────────────────────────
 * Achieved by construction rather than by a `consumed` flag, which the ledger has
 * no vocabulary for. The target binds the action's INPUT IDENTITY and its
 * `attempt_group`, so:
 *
 *   • a retry of the same intent recomputes the SAME target — correct, because it
 *     is the same dispatch, and the spend reservation keyed on that identity
 *     refuses a second one anyway;
 *   • an intentional fresh attempt takes a new `attempt_group`, which produces a
 *     DIFFERENT target and therefore requires its own grant.
 *
 * The old identity is never recycled, which is exactly what
 * `reconciliation.ts` says must hold for a retry not to become a second act on
 * one approval.
 */

import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'
import type { ActionClass } from '../action-target'

/** Distinct from `workflow_gate` (advance) and `workflow_action` (drift pin). */
export const WORKFLOW_EXECUTION_TARGET_TYPE = 'workflow_execution'

/** The purpose recorded on the authorization event. */
export const WORKFLOW_EXECUTION_ACTION_KIND = 'workflow.action.execute'

/** Bump only if the payload's MEANING changes. */
export const EXECUTION_TARGET_SCHEMA = 1 as const

export interface ExecutionAuthorizationInput {
  readonly instanceId: string
  readonly defKey: string
  readonly defVersion: number
  readonly defHash: string
  readonly state: string
  readonly actionKind: string
  readonly actionClass: ActionClass
  /**
   * The pinned action target hash — the world the action was bound to. Already
   * computed by `computeWorkflowActionTarget` and stored on the run, so this
   * carries the state's evidence and inputs without restating them.
   */
  readonly targetVersionHash: string
  /**
   * Which attempt this is. A fresh, deliberate attempt takes a new group; a retry
   * of the same intent keeps it. This is what separates "try again" from "do it
   * again", and it is why one grant cannot fund two distinct dispatches.
   */
  readonly attemptGroup: string
}

const SHA256_HEX = /^[a-f0-9]{64}$/

function requireText(v: string, field: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`executionAuthorizationTarget: ${field} must be a non-empty string`)
  }
  return v
}

function requireHash(v: string, field: string): string {
  if (!SHA256_HEX.test(v)) {
    throw new Error(`executionAuthorizationTarget: ${field} must be a sha256 hex digest`)
  }
  return v
}

/**
 * Readable, and checkable without recomputing a hash — the property
 * `workflowGateTargetId` was built for.
 */
export function executionAuthorizationTargetId(
  instanceId: string, state: string, actionKind: string, attemptGroup: string,
): string {
  return `${instanceId}:${state}:${actionKind}:${attemptGroup}`
}

/**
 * What an approver is actually permitting.
 *
 * No timestamp: 2B-0.6 established that time is not identity. No free text, no
 * caller-supplied field — every value is derived from the run's immutable
 * binding and the pinned definition.
 */
export function executionAuthorizationTargetPayload(
  input: ExecutionAuthorizationInput,
): Record<string, unknown> {
  return {
    kind: 'workflow.action.execute',
    schema: EXECUTION_TARGET_SCHEMA,
    instance_id: requireText(input.instanceId, 'instanceId'),
    def_key: requireText(input.defKey, 'defKey'),
    def_version: input.defVersion,
    def_hash: requireHash(input.defHash, 'defHash'),
    state: requireText(input.state, 'state'),
    action_kind: requireText(input.actionKind, 'actionKind'),
    action_class: requireText(input.actionClass, 'actionClass'),
    target_version_hash: requireHash(input.targetVersionHash, 'targetVersionHash'),
    attempt_group: requireText(input.attemptGroup, 'attemptGroup'),
  }
}

/** The target an execution authorization pins. */
export function computeExecutionAuthorizationTarget(
  input: ExecutionAuthorizationInput,
): AuthorizationTarget {
  return {
    targetType: WORKFLOW_EXECUTION_TARGET_TYPE,
    targetId: executionAuthorizationTargetId(
      input.instanceId, input.state, input.actionKind, input.attemptGroup),
    versionHash: canonicalTargetVersionHash(executionAuthorizationTargetPayload(input)),
  }
}
