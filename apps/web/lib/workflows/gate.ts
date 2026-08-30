/**
 * lib/workflows/gate.ts — the workflow gate: what a human is asked to authorize.
 *
 * PR1 made the machine refuse a gated advance without an `authorization_id`.
 * That was a placeholder: any uuid satisfied it. This module supplies the thing
 * the uuid must actually point at — a pinned description of the exact material
 * action, hashed, so that a grant stops being effective the moment anything
 * material about that action changes.
 *
 * ── PURE ─────────────────────────────────────────────────────────────────────
 * Zero I/O, like machine.ts and policy-gate.ts. The caller supplies the instance,
 * the spec state and the evidence; this module decides what is bound and what a
 * given authorization chain means for it. No clock read either — evaluation time
 * is injected, so identical inputs always produce identical output.
 *
 * ── ONE HASH FUNCTION, NOT A NEW ONE ─────────────────────────────────────────
 * The pin is computed with `canonicalTargetVersionHash` from
 * lib/atlas/authorization/build.ts — the SAME function the ledger uses to
 * validate `targetPayload` when the request is written. Using any other
 * canonicalizer (there are, unfortunately, three in this repository) would mean
 * the hash we compute and the hash the ledger verifies could disagree, and a
 * disagreement here reads as "this authorization is stale" forever.
 */

import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type {
  AuthorizationEffectivenessResult,
  AuthorizationTarget,
} from '@/lib/atlas/authorization/types'
import { getState } from './machine'
import type { WorkflowEvidence, WorkflowInstance, WorkflowSpec } from './types'

/** Target type recorded in atlas_authorizations for every workflow gate. */
export const WORKFLOW_GATE_TARGET_TYPE = 'workflow_gate'

/**
 * The single action kind a workflow gate ever grants: permission to leave the
 * current state along its declared success path. It is deliberately narrow —
 * §27.313 minimum authority. Which state, and which destination, live in the
 * pinned payload, so a grant cannot be reused for a different move.
 */
export const WORKFLOW_GATE_ACTION_KIND = 'workflow.gate.advance'

/**
 * `target_id` is readable and, crucially, checkable in SQL: the database-side
 * guard in workflow_append_transition compares it against the instance and
 * state it is being asked to move, without needing to recompute any hash.
 */
export function workflowGateTargetId(instanceId: string, state: string): string {
  return `${instanceId}:${state}`
}

/** Evidence reduced to the facts that are material to an authorization. */
export interface GateEvidenceFact {
  check_key: string
  result: string
  source: string
  recorded_at: string
}

export interface WorkflowGateInput {
  instance: Pick<
    WorkflowInstance,
    'id' | 'project_id' | 'def_key' | 'def_version' | 'def_hash' | 'instance_key'
  >
  spec: WorkflowSpec
  /** The state being left. */
  state: string
  /** Evidence recorded against that state. Order-insensitive. */
  evidence: readonly WorkflowEvidence[]
  /**
   * The check keys the canonical contract DECLARES for this state.
   *
   * Only declared checks may influence the gate target. `workflow_evidence` also
   * carries scheduler bookkeeping — `workflow_schedule_wake` writes
   * `scheduler.wake_scheduled` and `workflow_record_tick` writes
   * `scheduler.evaluation` — and including those made a granted authorization go
   * `stale` the moment the scheduler touched the instance. The re-arm step
   * writes one itself, so a grant would have been invalidated by the very act of
   * making it usable.
   *
   * Same defect PR9f-1 fixed for ACTION targets, in the gate layer. Passed in so
   * this module stays pure; callers derive it from `adapter.attestableChecks()`.
   */
  declaredCheckKeys: readonly string[]
}

/**
 * Everything material about the action being authorized.
 *
 * Every field here is load-bearing — changing any of them must invalidate a
 * prior grant, which is exactly what including it in the hash achieves:
 *
 *   instance/def pins   a grant cannot migrate to another month, or survive a
 *                       definition version bump (def_hash covers every state,
 *                       gate and canonical value)
 *   from/to             a grant to leave `local_qa` cannot authorize leaving
 *                       `protected_upload`
 *   declared inputs     the state's declared inputs are part of what the editor
 *                       was shown; a spec change that alters them is material
 *   evidence            the load-bearing one. A grant given after "19/19 audio
 *                       files PASS" must not survive that evidence being
 *                       superseded — re-recording the check produces a new
 *                       fact, a new hash, and a stale grant.
 */
export function workflowGateTargetPayload(input: WorkflowGateInput): Record<string, unknown> {
  const state = getState(input.spec, input.state)
  if (state === null) {
    throw new Error(`workflowGateTargetPayload: "${input.state}" is not declared by ${input.spec.def_key}`)
  }

  // Sorted so the caller's read order can never move the hash.
  const declared = new Set(input.declaredCheckKeys)
  const evidence: GateEvidenceFact[] = input.evidence
    .filter(e => e.state === input.state && declared.has(e.check_key))
    .map(e => ({
      check_key: e.check_key,
      result: e.result,
      source: e.source,
      recorded_at: e.recorded_at,
    }))
    .sort((a, b) =>
      a.check_key.localeCompare(b.check_key) ||
      a.recorded_at.localeCompare(b.recorded_at) ||
      a.result.localeCompare(b.result))

  return {
    kind: 'workflow.gate',
    instance_id: input.instance.id,
    project_id: input.instance.project_id,
    instance_key: input.instance.instance_key,
    def_key: input.instance.def_key,
    def_version: input.instance.def_version,
    def_hash: input.instance.def_hash,
    requested_action: {
      kind: WORKFLOW_GATE_ACTION_KIND,
      from_state: state.id,
      to_state: state.next_state,
    },
    gate: {
      approver: state.human_gate.approver,
      decision: state.human_gate.decision,
      gate_ref: state.human_gate.gate_ref,
    },
    state_inputs: [...state.inputs].sort(),
    evidence,
  }
}

/** The pinned target an authorization must name to be effective for this gate. */
export function computeWorkflowGateTarget(input: WorkflowGateInput): AuthorizationTarget {
  return {
    targetType: WORKFLOW_GATE_TARGET_TYPE,
    targetId: workflowGateTargetId(input.instance.id, input.state),
    versionHash: canonicalTargetVersionHash(workflowGateTargetPayload(input)),
  }
}

// ── Gate status ──────────────────────────────────────────────────────────────

/**
 * What the gate is doing right now.
 *
 * `stale` is the one worth naming: an authorization exists and was genuinely
 * granted, but it pins a different version of this action. It is not expired and
 * not revoked — the human really did approve something — but not THIS. Reporting
 * it as merely "not authorized" would hide that a re-approval is needed and why.
 */
export type WorkflowGateStatus =
  | 'not_required'
  | 'waiting_for_authorization'
  | 'authorized'
  | 'denied'
  | 'expired'
  | 'revoked'
  | 'superseded'
  | 'stale'
  | 'conditions_unverified'
  | 'malformed'

export interface WorkflowGateState {
  required: boolean
  status: WorkflowGateStatus
  /** True only for `authorized` — the single state that may cross the gate. */
  canAdvance: boolean
  target: AuthorizationTarget | null
  authorizationId: string | null
  expiresAt: string | null
  approver: string | null
  decision: string | null
  gateRef: string | null
}

/**
 * Translate an effectiveness answer into gate status.
 *
 * Exhaustive over `AuthorizationEffectivenessResult['reason']`: a new reason
 * fails to compile rather than falling into a permissive default.
 */
export function gateStatusFromEffectiveness(
  result: AuthorizationEffectivenessResult,
): WorkflowGateStatus {
  if (result.effective) return 'authorized'
  switch (result.reason) {
    case 'not_yet_decided':        return 'waiting_for_authorization'
    case 'denied':                 return 'denied'
    case 'expired':                return 'expired'
    case 'revoked':                return 'revoked'
    case 'superseded':             return 'superseded'
    case 'conditions_unverified':  return 'conditions_unverified'
    // All three mean the same operationally: a grant exists but does not
    // describe the action being attempted now.
    case 'version_mismatch':
    case 'action_mismatch':
    case 'project_mismatch':       return 'stale'
    case 'malformed_chain':        return 'malformed'
    case 'effective':              return 'authorized'
  }
}

/** Only an unconditional, unexpired, unrevoked grant for THIS pin may advance. */
export function canAdvanceThroughGate(status: WorkflowGateStatus): boolean {
  return status === 'authorized' || status === 'not_required'
}

/**
 * The gate for the state an instance is currently in.
 *
 * `effectiveness` is supplied by the caller (it needs I/O); this function stays
 * pure so every mapping rule is testable without a database.
 */
export function deriveWorkflowGate(
  input: WorkflowGateInput & {
    effectiveness?: AuthorizationEffectivenessResult | null
    authorizationId?: string | null
  },
): WorkflowGateState {
  const state = getState(input.spec, input.state)
  const gate = state?.human_gate

  if (!state || gate?.required !== true) {
    return {
      required: false, status: 'not_required', canAdvance: true, target: null,
      authorizationId: null, expiresAt: null,
      approver: gate?.approver ?? null, decision: gate?.decision ?? null,
      gateRef: gate?.gate_ref ?? null,
    }
  }

  const target = computeWorkflowGateTarget(input)
  const status = input.effectiveness
    ? gateStatusFromEffectiveness(input.effectiveness)
    : 'waiting_for_authorization'

  return {
    required: true,
    status,
    canAdvance: canAdvanceThroughGate(status),
    target,
    authorizationId: input.authorizationId ?? input.effectiveness?.state?.authorizationId ?? null,
    expiresAt: input.effectiveness?.state?.expiresAt ?? null,
    approver: gate.approver,
    decision: gate.decision,
    gateRef: gate.gate_ref,
  }
}
