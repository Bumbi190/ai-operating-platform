/**
 * lib/workflows/authorization.ts — workflow gates on the existing authority ledger.
 *
 * There is no second authorization table and no second lifecycle. Every act
 * lands in `atlas_authorizations` through its own sanctioned boundaries, so
 * workflow gates inherit, unchanged: a human principal derived from the session
 * (never a parameter), project-scoped authority, append-only history, derived
 * status, mandatory bounded validity, and time-derived expiry.
 *
 * ── WHY REQUESTS ARE CREATED HERE AND NOT OVER FREE-FORM HTTP ────────────────
 * app/api/atlas/executive/authorization/route.ts explains the rule this module
 * follows: `requestAuthorization` takes a raw target and a raw action kind
 * validated against no registry, so exposing it directly would let an
 * authenticated human mint a grant naming any action at all — rows that are
 * append-only and would wait in the ledger until some future consumer honoured
 * them. Requests are therefore created only by purpose-scoped, server-atomic
 * actions that DERIVE the target from prepared state. This module is one such
 * action: the caller names an instance, never a target and never an action kind.
 *
 * ── WHAT THIS MODULE DOES NOT DO ─────────────────────────────────────────────
 * It grants nothing and executes nothing. Deciding (grant/deny/revoke) stays on
 * the existing executive authorization route — building a second decision
 * endpoint would be a second place for the authority rules to drift. And a valid
 * grant is permission to advance, never the advance itself (PR2 section G).
 */

import 'server-only'

import { findAdapter } from './adapters/registry'
import { requestAuthorization } from '@/lib/atlas/authorization/principal-write'
import {
  findEffectiveAuthorizationForTarget,
  isAuthorizationEffective,
  listProjectAuthorizations,
} from '@/lib/atlas/authorization/principal-read'
import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import {
  WORKFLOW_GATE_ACTION_KIND,
  WORKFLOW_GATE_TARGET_TYPE,
  computeWorkflowGateTarget,
  deriveWorkflowGate,
  gateStatusFromEffectiveness,
  workflowGateTargetPayload,
  type WorkflowGateState,
} from './gate'
import { getState } from './machine'
import {
  listEvidence,
  readDefinitionById,
  readInstance,
  type WorkflowDb,
} from './store'
import type { WorkflowInstance, WorkflowSpec } from './types'

/** Everything the gate functions need, resolved once. */
interface GateContext {
  instance: WorkflowInstance
  spec: WorkflowSpec
  evidence: Awaited<ReturnType<typeof listEvidence>>
  /** Declared checks for the instance's current state — see WorkflowGateInput. */
  declaredCheckKeys: string[]
}

async function loadGateContext(db: WorkflowDb, instanceId: string): Promise<GateContext> {
  const instance = await readInstance(db, instanceId)
  if (!instance) throw new Error(`workflow authorization: unknown instance ${instanceId}`)
  const def = await readDefinitionById(db, instance.def_id)
  const evidence = await listEvidence(db, instance.id)
  // Declared checks only — scheduler bookkeeping must not move the gate pin.
  const adapter = findAdapter(instance.def_key)
  const declaredCheckKeys = adapter
    ? adapter.attestableChecks()
        .filter(c => c.state === instance.current_state).map(c => c.check_key)
    : []
  return { instance, spec: def.spec, evidence, declaredCheckKeys }
}

// ── Request ──────────────────────────────────────────────────────────────────

export type WorkflowAuthorizationRequestStatus =
  | 'ok'
  | 'not_gated'
  | 'no_principal'
  | 'project_denied'
  | 'invalid_request'
  | 'conflict'
  | 'unavailable'

export interface WorkflowAuthorizationRequestResult {
  status: WorkflowAuthorizationRequestStatus
  authorizationId: string | null
  gate: WorkflowGateState | null
  detail?: string
}

/**
 * Open an authorization request for the gate on an instance's CURRENT state.
 *
 * The target and action kind are derived from the instance's own pinned
 * definition and recorded evidence — the caller supplies only an instance id, so
 * it cannot ask for authority over something other than what the workflow is
 * actually about to do.
 *
 * `targetPayload` is passed to the ledger, which recomputes the hash and refuses
 * the write if it disagrees with the pin. The hash is therefore verified on the
 * way in rather than merely asserted.
 */
export async function requestWorkflowAuthorization(
  db: WorkflowDb,
  instanceId: string,
): Promise<WorkflowAuthorizationRequestResult> {
  const ctx = await loadGateContext(db, instanceId)
  const state = getState(ctx.spec, ctx.instance.current_state)

  if (!state || state.human_gate.required !== true) {
    return { status: 'not_gated', authorizationId: null, gate: null }
  }

  const gateInput = {
    instance: ctx.instance,
    spec: ctx.spec,
    state: ctx.instance.current_state,
    evidence: ctx.evidence,
    declaredCheckKeys: ctx.declaredCheckKeys,
  }
  const target = computeWorkflowGateTarget(gateInput)

  const result = await requestAuthorization({
    projectId: ctx.instance.project_id,
    target,
    authority: {
      actionKind: WORKFLOW_GATE_ACTION_KIND,
      description:
        `Advance ${ctx.instance.def_key} ${ctx.instance.instance_key} ` +
        `from "${state.id}" to "${state.next_state}". ` +
        `${state.human_gate.approver ?? 'approver'}: ${state.human_gate.decision ?? 'decision unspecified'}`,
    },
    // The ledger recomputes the pin from this and refuses a mismatch.
    targetPayload: workflowGateTargetPayload(gateInput),
    evidence: ctx.evidence
      .filter(e => e.state === ctx.instance.current_state)
      .map(e => ({
        kind: 'workflow_evidence',
        ref: e.id,
        label: `${e.check_key}: ${e.result} (${e.source})`,
        capturedAt: e.recorded_at,
      })),
  })

  if (result.status !== 'ok' || !result.state) {
    return {
      status: result.status as WorkflowAuthorizationRequestStatus,
      authorizationId: null,
      gate: null,
      ...(result.detail ? { detail: result.detail } : {}),
    }
  }

  return {
    status: 'ok',
    authorizationId: result.state.authorizationId,
    gate: deriveWorkflowGate({
      ...gateInput,
      authorizationId: result.state.authorizationId,
      effectiveness: { effective: false, reason: 'not_yet_decided', state: result.state },
    }),
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * The gate state for an instance's current state, including any live authority.
 *
 * Looks the authorization up BY PINNED TARGET rather than by a stored id: that
 * is what makes a stale grant visible. If the evidence moved on, the old chain
 * no longer matches the computed target and the gate honestly reports that a new
 * request is needed.
 */
export async function deriveWorkflowGateStatus(
  db: WorkflowDb,
  instanceId: string,
): Promise<WorkflowGateState> {
  const ctx = await loadGateContext(db, instanceId)
  const gateInput = {
    instance: ctx.instance,
    spec: ctx.spec,
    state: ctx.instance.current_state,
    evidence: ctx.evidence,
    declaredCheckKeys: ctx.declaredCheckKeys,
  }

  const state = getState(ctx.spec, ctx.instance.current_state)
  if (!state || state.human_gate.required !== true) return deriveWorkflowGate(gateInput)

  const target = computeWorkflowGateTarget(gateInput)
  const effectiveness = await findEffectiveAuthorizationForTarget({
    projectId: ctx.instance.project_id,
    target,
    actionKind: WORKFLOW_GATE_ACTION_KIND,
  })

  return deriveWorkflowGate({ ...gateInput, effectiveness })
}

/** One authorization, resolved against this instance's current pinned target. */
export async function readWorkflowAuthorization(
  db: WorkflowDb,
  instanceId: string,
  authorizationId: string,
): Promise<{ gate: WorkflowGateState; effectiveness: Awaited<ReturnType<typeof isAuthorizationEffective>> }> {
  const ctx = await loadGateContext(db, instanceId)
  const gateInput = {
    instance: ctx.instance,
    spec: ctx.spec,
    state: ctx.instance.current_state,
    evidence: ctx.evidence,
    declaredCheckKeys: ctx.declaredCheckKeys,
  }
  const target = computeWorkflowGateTarget(gateInput)

  const effectiveness = await isAuthorizationEffective(authorizationId, {
    target,
    projectId: ctx.instance.project_id,
    actionKind: WORKFLOW_GATE_ACTION_KIND,
  })

  return {
    gate: deriveWorkflowGate({ ...gateInput, effectiveness, authorizationId }),
    effectiveness,
  }
}

// ── Assertion used by the transition path ────────────────────────────────────

export interface WorkflowAuthorizationAssertion {
  valid: boolean
  status: WorkflowGateState['status']
  /** Why it was refused, in the ledger's own vocabulary. */
  reason: string
  target: string | null
}

/**
 * May this authorization carry this instance across the gate on its current state?
 *
 * Every clause must hold, and all of them are checked against values DERIVED
 * from the instance — never against anything the caller passed alongside the id:
 *
 *   • the chain exists and is readable by this principal
 *   • it is scoped to the instance's project
 *   • it grants exactly `workflow.gate.advance`
 *   • it pins exactly the target computed from this instance, state, definition
 *     version and current evidence
 *   • it is granted, unconditional, unexpired, unrevoked, unsuperseded
 *
 * A caller supplying a random uuid fails the first clause; a caller supplying a
 * real authorization for a different instance, state, action or evidence set
 * fails the pin.
 */
export async function assertWorkflowAuthorizationValid(
  db: WorkflowDb,
  instanceId: string,
  authorizationId: string,
): Promise<WorkflowAuthorizationAssertion> {
  const { gate, effectiveness } = await readWorkflowAuthorization(db, instanceId, authorizationId)
  const status = effectiveness.status === 'ok'
    ? gateStatusFromEffectiveness(effectiveness)
    : 'malformed'

  return {
    valid: status === 'authorized',
    status,
    reason: effectiveness.status === 'ok' ? effectiveness.reason : effectiveness.status,
    target: gate.target?.versionHash ?? null,
  }
}

// ── Listing ──────────────────────────────────────────────────────────────────

export interface PendingWorkflowAuthorization {
  authorizationId: string
  targetId: string
  versionHash: string
  requestedAt: string
  requestedBy: string
  description: string
}

/**
 * Workflow gate requests in a project that are still awaiting a decision.
 *
 * Derived from the chain, not from a status column: an authorization counts as
 * pending only when its aggregate carries a `requested` act and no deciding act.
 */
export async function listPendingWorkflowAuthorizations(
  projectId: string,
  limit = 100,
): Promise<{ pending: PendingWorkflowAuthorization[]; status: string }> {
  const { events, status } = await listProjectAuthorizations(projectId, { limit })
  if (status !== 'ok') return { pending: [], status }

  const chains = new Map<string, AuthorizationEvent[]>()
  for (const event of events) {
    if (event.target.targetType !== WORKFLOW_GATE_TARGET_TYPE) continue
    chains.set(event.authorizationId, [...(chains.get(event.authorizationId) ?? []), event])
  }

  const pending: PendingWorkflowAuthorization[] = []
  for (const chain of chains.values()) {
    const request = chain.find(e => e.type === 'requested')
    if (!request) continue
    const decided = chain.some(e =>
      e.type === 'granted' || e.type === 'granted_with_conditions' || e.type === 'denied')
    if (decided) continue
    pending.push({
      authorizationId: request.authorizationId,
      targetId: request.target.targetId,
      versionHash: request.target.versionHash,
      requestedAt: request.occurredAt,
      requestedBy: request.principalId,
      description: request.authority.description,
    })
  }

  pending.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
  return { pending, status: 'ok' }
}
