/**
 * lib/workflows/system-authorization.ts — how an unattended tick may check a
 * gate without ever becoming an authority.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * PR2's verifier goes through `principal-read`, which calls
 * `resolveProjectAccess()` and fails closed without a session. That is correct
 * and must not be weakened: it is what stops a service role — capability without
 * authority (§10.4) — from exercising a founder's judgement.
 *
 * But a scheduler has no session, and it needs to answer a genuinely different
 * question. Those two questions are not the same act:
 *
 *   "May I approve this?"          → an AUTHORITY act. Requires a human
 *                                    principal. The scheduler must never do it.
 *   "Did a human already approve   → an OBSERVATION of append-only history.
 *    exactly this, and is it        Reading a record a founder authored is not
 *    still valid?"                  impersonating them.
 *
 * This module answers only the second. It is the system READ path, and it is
 * built so the first is not reachable from here.
 *
 * ── HOW THAT IS ENFORCED, NOT JUST INTENDED ─────────────────────────────────
 *   • The ledger is accepted as `LedgerReader` — a Pick of exactly `history`
 *     and `byTarget`. `append` is not part of the type, so no amount of later
 *     editing inside this file can write an authority act without first
 *     widening a type that a guard test pins.
 *   • Nothing here imports `principal-write`, and a test asserts it.
 *   • The verdict comes from the SHIPPED pure derivation (`isEffectiveNow`), so
 *     the scheduler cannot reach a more permissive answer than a human reader
 *     would get for the same chain. It is the same function, same rules,
 *     same fail-closed handling of malformed chains.
 *   • The target is recomputed from the instance, never accepted from a caller,
 *     so a stale pin cannot be smuggled past the check.
 *
 * There is no project-ownership check here, and there should not be: this path
 * never returns ledger CONTENT to a user, only a verdict used to decide whether
 * the engine may proceed. Scope is still enforced — `isEffectiveNow` is given
 * the instance's own project and refuses a chain from anywhere else.
 */

import 'server-only'

import { createAuthorizationEventStore, type AuthorizationEventStore } from '@/lib/atlas/authorization/store'
import { isEffectiveNow } from '@/lib/atlas/authorization/derive'
import type { AuthorizationEvent } from '@/lib/atlas/authorization/types'
import {
  WORKFLOW_GATE_ACTION_KIND,
  WORKFLOW_GATE_TARGET_TYPE,
  computeWorkflowGateTarget,
  deriveWorkflowGate,
  gateStatusFromEffectiveness,
  type WorkflowGateState,
} from './gate'
import { getState } from './machine'
import { listEvidence, readDefinitionById, readInstance, type WorkflowDb } from './store'

/**
 * The only ledger capability this module may hold. Deliberately NOT the full
 * store: `append` is absent from the type.
 */
export type LedgerReader = Pick<AuthorizationEventStore, 'history' | 'byTarget'>

/** Narrow the service-role store down to its read half. */
export function systemLedgerReader(): LedgerReader {
  const store = createAuthorizationEventStore()
  return { history: store.history.bind(store), byTarget: store.byTarget.bind(store) }
}

/**
 * Resolve the gate for an instance's current state, as the scheduler sees it.
 *
 * Returns `not_required` for an ungated state and, for a gated one, the verdict
 * the shipped derivation gives for the pin computed right now. A gate that
 * cannot be resolved reports `malformed`, which never advances.
 */
export async function systemDeriveWorkflowGate(
  db: WorkflowDb,
  instanceId: string,
  options: { now?: string; ledger?: LedgerReader } = {},
): Promise<WorkflowGateState> {
  const instance = await readInstance(db, instanceId)
  if (!instance) throw new Error(`system gate: unknown instance ${instanceId}`)

  const def = await readDefinitionById(db, instance.def_id)
  const evidence = await listEvidence(db, instance.id)
  const gateInput = { instance, spec: def.spec, state: instance.current_state, evidence }

  const state = getState(def.spec, instance.current_state)
  if (!state || state.human_gate.required !== true) return deriveWorkflowGate(gateInput)

  const at = options.now ?? new Date().toISOString()
  const ledger = options.ledger ?? systemLedgerReader()
  const target = computeWorkflowGateTarget(gateInput)

  let events: AuthorizationEvent[]
  try {
    events = await ledger.byTarget(instance.project_id, WORKFLOW_GATE_TARGET_TYPE, target.targetId)
  } catch {
    // Unreadable ledger is never "no gate". Fail closed.
    return deriveWorkflowGate({
      ...gateInput,
      effectiveness: { effective: false, reason: 'malformed_chain', state: null },
    })
  }
  if (events.length === 0) {
    return deriveWorkflowGate({
      ...gateInput,
      effectiveness: { effective: false, reason: 'not_yet_decided', state: null },
    })
  }

  // One aggregate per authorization id; the first chain that is effective for
  // THIS pin wins, otherwise the last denial is reported so the reason survives.
  const chains = new Map<string, AuthorizationEvent[]>()
  for (const event of events) {
    chains.set(event.authorizationId, [...(chains.get(event.authorizationId) ?? []), event])
  }

  let last: ReturnType<typeof isEffectiveNow> | null = null
  for (const chain of [...chains.values()].sort((a, b) =>
    a[0].authorizationId < b[0].authorizationId ? -1 : 1)) {
    const result = isEffectiveNow(chain, {
      at,
      target,
      projectId: instance.project_id,
      actionKind: WORKFLOW_GATE_ACTION_KIND,
    })
    if (result.effective) {
      return deriveWorkflowGate({
        ...gateInput,
        effectiveness: result,
        authorizationId: result.state?.authorizationId ?? null,
      })
    }
    last = result
  }

  return deriveWorkflowGate({
    ...gateInput,
    effectiveness: last ?? { effective: false, reason: 'not_yet_decided', state: null },
    authorizationId: last?.state?.authorizationId ?? null,
  })
}

/**
 * The scheduler's yes/no, with the ledger's own vocabulary for the reason.
 * `authorized` is the only verdict that permits continuation.
 */
export async function systemAssertGateOpen(
  db: WorkflowDb,
  instanceId: string,
  options: { now?: string; ledger?: LedgerReader } = {},
): Promise<{ open: boolean; status: WorkflowGateState['status']; gate: WorkflowGateState }> {
  const gate = await systemDeriveWorkflowGate(db, instanceId, options)
  return { open: gate.status === 'authorized' || gate.status === 'not_required', status: gate.status, gate }
}

/** Re-exported so callers use the shipped mapping rather than inventing one. */
export { gateStatusFromEffectiveness }
