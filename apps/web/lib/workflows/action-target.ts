/**
 * lib/workflows/action-target.ts — what a workflow ACTION is, and what a human
 * approves when they authorize one.
 *
 * ── WHY A SECOND TARGET TYPE ────────────────────────────────────────────────
 * PR2 introduced `workflow_gate`: permission for an instance to LEAVE a state
 * along its declared success path. An action is a different thing. A single
 * state can host several actions ("upload the artefacts", "apply the release
 * migration"), each with its own blast radius, and the risk classes below
 * describe actions rather than advances. Reusing the gate target would mean one
 * approval silently covering every action in a state.
 *
 * So `workflow_action` is its own target type, built by ONE builder that reuses
 * `canonicalTargetVersionHash` — the same primitive the ledger validates with.
 * The repo still has exactly three canonicalJson implementations; this adds none.
 *
 * ── THE CLASSES ARE ABOUT RECOVERY, NOT EFFORT ─────────────────────────────
 * What separates them is what happens when one goes wrong: a READ_ONLY probe can
 * simply be repeated, a REVERSIBLE_WRITE can be undone, a MATERIAL_WRITE leaves
 * something real behind, and an EXTERNAL_COMMUNICATION cannot be recalled at all.
 * That is why retry policy is derived from the class rather than configured.
 */

import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'
import type { WorkflowEvidence, WorkflowInstance, WorkflowSpec } from './types'
import { getState } from './machine'

/** Target type recorded in atlas_authorizations for every workflow action. */
export const WORKFLOW_ACTION_TARGET_TYPE = 'workflow_action'

export const ACTION_CLASSES = [
  'READ_ONLY',
  'REVERSIBLE_WRITE',
  'MATERIAL_WRITE',
  'FINANCIAL',
  'EXTERNAL_COMMUNICATION',
  'DESTRUCTIVE',
] as const
export type ActionClass = (typeof ACTION_CLASSES)[number]

export interface ActionClassPolicy {
  /** A human authorization is required before the run may be created. */
  requiresAuthorization: boolean
  /**
   * Attempts allowed. One means a failure is a decision, not a retry: a repeated
   * material write is a duplicated side effect. Enforced by DB CHECK too.
   */
  maxAttempts: number
  /** Revalidate the pin again immediately before the irreversible step. */
  requiresPreCommitRevalidation: boolean
  /** An idempotency identity must exist before the call is made. */
  requiresIdempotency: boolean
  /** Cancellation is honoured up to this point, and no later. */
  cancellation: 'any_time' | 'step_boundary' | 'before_commit_only'
  /** Spend enforcement must be ACTIVE, not advisory, for this class to execute. */
  requiresSpendEnforcement: boolean
}

/**
 * The policy table. Deliberately data, not scattered conditionals — the whole
 * point is that "what does a FINANCIAL action require" has one answer that a
 * reader can check at a glance.
 */
export const ACTION_CLASS_POLICY: Record<ActionClass, ActionClassPolicy> = {
  READ_ONLY: {
    requiresAuthorization: false, maxAttempts: 5,
    requiresPreCommitRevalidation: false, requiresIdempotency: false,
    cancellation: 'any_time', requiresSpendEnforcement: false,
  },
  REVERSIBLE_WRITE: {
    requiresAuthorization: true, maxAttempts: 3,
    requiresPreCommitRevalidation: false, requiresIdempotency: true,
    cancellation: 'step_boundary', requiresSpendEnforcement: false,
  },
  MATERIAL_WRITE: {
    requiresAuthorization: true, maxAttempts: 1,
    requiresPreCommitRevalidation: true, requiresIdempotency: true,
    cancellation: 'before_commit_only', requiresSpendEnforcement: false,
  },
  FINANCIAL: {
    requiresAuthorization: true, maxAttempts: 1,
    requiresPreCommitRevalidation: true, requiresIdempotency: true,
    cancellation: 'before_commit_only', requiresSpendEnforcement: true,
  },
  EXTERNAL_COMMUNICATION: {
    requiresAuthorization: true, maxAttempts: 1,
    requiresPreCommitRevalidation: true, requiresIdempotency: true,
    cancellation: 'before_commit_only', requiresSpendEnforcement: false,
  },
  DESTRUCTIVE: {
    requiresAuthorization: true, maxAttempts: 1,
    requiresPreCommitRevalidation: true, requiresIdempotency: true,
    cancellation: 'before_commit_only', requiresSpendEnforcement: false,
  },
}

export function isActionClass(value: unknown): value is ActionClass {
  return typeof value === 'string' && (ACTION_CLASSES as readonly string[]).includes(value)
}

/**
 * `policy_class` (H1.P4) and `action_class` are NOT parallel vocabularies.
 * policy_class answers "may this run finish without approval"; action_class
 * answers "what does this action cost if it goes wrong". This mapping keeps the
 * older gate's default-deny behaviour correct for bound actions rather than
 * introducing a second, conflicting decision.
 */
export function policyClassForActionClass(cls: ActionClass): 'non_destructive' | 'approval_required' {
  return cls === 'READ_ONLY' ? 'non_destructive' : 'approval_required'
}

/** `${instanceId}:${state}:${actionKind}` — checkable in SQL without a hash. */
export function workflowActionTargetId(instanceId: string, state: string, actionKind: string): string {
  return `${instanceId}:${state}:${actionKind}`
}

export interface WorkflowActionTargetInput {
  instance: WorkflowInstance
  spec: WorkflowSpec
  state: string
  actionKind: string
  actionClass: ActionClass
  /**
   * What the action will actually touch — a bucket path, a table, a PR number.
   * Part of the pin so an approval for one artefact cannot be spent on another.
   */
  sideEffectTarget: Record<string, string> | null
  evidence: WorkflowEvidence[]
  /**
   * The check keys the canonical contract DECLARES for this state.
   *
   * Only declared checks may influence the target. `workflow_evidence` is also
   * where the scheduler keeps its own bookkeeping — `workflow_schedule_wake`
   * writes `scheduler.wake_scheduled` and `workflow_record_tick` writes
   * `scheduler.evaluation` — and including those made the scheduler move the
   * target of the very run it had just created, 333 ms earlier, in the same
   * tick. Readiness then correctly reported `target_drifted` forever.
   *
   * Passed in rather than looked up so this module stays pure and the caller
   * must state which catalogue it means. There is no second catalogue: callers
   * derive this from `adapter.attestableChecks()`.
   */
  declaredCheckKeys: readonly string[]
}

/**
 * The payload a human's approval is pinned to.
 *
 * Every field is derived from the instance, the pinned definition and recorded
 * evidence. Nothing here comes from a caller's request body, which is what makes
 * the hash a pin rather than a label: change the definition, the state, the
 * declared inputs, the evidence or the side-effect target, and the approval for
 * the old shape stops matching.
 */
export function workflowActionTargetPayload(input: WorkflowActionTargetInput): unknown {
  const state = getState(input.spec, input.state)
  // An action in a state the pinned definition does not declare cannot be
  // approved, because there is nothing to approve it against.
  if (!state) {
    throw new Error(`workflowActionTargetPayload: state "${input.state}" is not in the pinned definition`)
  }
  // Declared checks only. An undeclared/audit row can never move the pin —
  // which is what stops scheduler bookkeeping from invalidating an action, while
  // a genuine declared observation still does exactly that.
  const declared = new Set(input.declaredCheckKeys)
  const evidence = input.evidence
    .filter(e => e.state === input.state && declared.has(e.check_key))
    .map(e => ({
      check_key: e.check_key, result: e.result,
      source: e.source, recorded_at: e.recorded_at,
    }))
    .sort((a, b) =>
      a.check_key.localeCompare(b.check_key) ||
      a.recorded_at.localeCompare(b.recorded_at) ||
      a.result.localeCompare(b.result))

  return {
    kind: 'workflow.action',
    instance_id: input.instance.id,
    project_id: input.instance.project_id,
    instance_key: input.instance.instance_key,
    def_key: input.instance.def_key,
    def_version: input.instance.def_version,
    def_hash: input.instance.def_hash,
    current_state: state.id,
    action: {
      kind: input.actionKind,
      class: input.actionClass,
      max_attempts: ACTION_CLASS_POLICY[input.actionClass].maxAttempts,
    },
    state_inputs: [...state.inputs].sort(),
    side_effect_target: input.sideEffectTarget
      ? Object.fromEntries(Object.entries(input.sideEffectTarget).sort(([a], [b]) => a.localeCompare(b)))
      : null,
    evidence,
  }
}

/** The pinned target an authorization must name to be effective for this action. */
export function computeWorkflowActionTarget(input: WorkflowActionTargetInput): AuthorizationTarget {
  return {
    targetType: WORKFLOW_ACTION_TARGET_TYPE,
    targetId: workflowActionTargetId(input.instance.id, input.state, input.actionKind),
    versionHash: canonicalTargetVersionHash(workflowActionTargetPayload(input)),
  }
}

export interface ActionIdentityInput {
  workflowInstanceId: string
  defHash: string
  fromState: string
  actionKind: string
  targetVersionHash: string
  /** One deliberate action creation. Retries reuse it; a re-run gets a new one. */
  attemptGroup: string
}

/**
 * The idempotency identity of an action.
 *
 * `attemptGroup` is what makes a retry the SAME action rather than a new one: it
 * is stamped once at creation and never incremented, so every retry of that run
 * hashes identically and the unique index refuses a second row. A deliberate
 * re-run after a human decision gets a fresh group and is therefore, correctly,
 * a different act.
 *
 * Uses `canonicalTargetVersionHash` — sha256 over the same canonical JSON the
 * ledger uses. No fourth canonicalizer.
 */
export function computeActionIdempotencyKey(input: ActionIdentityInput): string {
  return canonicalTargetVersionHash({
    workflow_instance_id: input.workflowInstanceId,
    def_hash: input.defHash,
    workflow_from_state: input.fromState,
    action_kind: input.actionKind,
    target_version_hash: input.targetVersionHash,
    attempt_group: input.attemptGroup,
  })
}
