/**
 * lib/workflows/effect/proof-handler.ts — the effect handler that proves the
 * runtime without touching anything.
 *
 * It is a real governed-effect handler travelling the real path: the executor
 * checks its authorization, reserves against its class policy, revalidates at
 * G3C-3A and classifies its outcome exactly as it will for story generation. The
 * only thing that is not real is the world it acts on.
 *
 * The scenario comes from the instance KEY, not from a payload — the same rule
 * every other handler follows. A caller cannot choose what happens, which
 * matters because a proof whose behaviour a caller could steer would prove
 * nothing about a path where the caller must not steer anything.
 *
 * ── IT OWNS ITS SPEND BOUNDARY, ON PURPOSE ──────────────────────────────────
 * `proof_governed_effect` declares `trusted_adapter` ownership and reserves here,
 * at the moment of dispatch, under the run's own idempotency key and for a
 * NON-ZERO amount. That is deliberately the shape a priced provider call takes:
 * the Anthropic adapter reserves at dispatch because only it can price the
 * request, and the identity now travels to it.
 *
 * Proving the runtime against a zero-cost effect is what let a vacuous
 * reservation look like governance in the first place. This costs a fake krona
 * so that it cannot.
 */

import { withGovernedSpend, ProviderNotDispatchedError } from '@/lib/cost/governed-spend'
import { isProofScenario, proofDispatch, PROOF_EFFECT_ESTIMATED_SEK }
  from './proof-adapter'
import type { EffectHandler, EffectHandlerOutput } from './effect-handler'

export const PROOF_EFFECT_CHECK = 'governed_effect_proved'

export const proofGovernedEffectHandler: EffectHandler = async input => {
  // The instance key names the scenario. An unknown key is refused rather than
  // defaulted: defaulting to `success` would make a typo look like a proof.
  const scenario = input.instanceKey
  if (!isProofScenario(scenario)) {
    const refused: EffectHandlerOutput = {
      observation: 'not_dispatched',
      provablyNotApplied: true,
      remoteOperationId: null,
      detail: `"${scenario}" is not a proof scenario; nothing was attempted`,
      checkKey: PROOF_EFFECT_CHECK,
      evidenceDetail: { scenario, error_kind: 'unknown_scenario' },
      estimatedSek: PROOF_EFFECT_ESTIMATED_SEK,
    }
    return refused
  }

  // ── The reservation, at the dispatch boundary, bound to THIS run ─────────
  // Exactly one, keyed by the execution identity the executor derived. A retry
  // of the same intent replays that key rather than taking a second, and a fresh
  // attempt_group produces a different key and therefore its own reservation.
  let result: Awaited<ReturnType<typeof proofDispatch>>
  // Captured before the release throw so the observation survives it. A remote
  // rejection and a local refusal are BOTH provably unapplied and both release —
  // but one is a confirmed answer and the other never left, and flattening them
  // would turn every rejection into an ambiguity needing reconciliation.
  type ProofResult = Awaited<ReturnType<typeof proofDispatch>>
  let released: ProofResult | null = null
  try {
    // Hoisted: the propagation guard scans the boundary's first object literal
    // for `execution`, and a nested `project: { … }` ends its scan early.
    const project = { projectId: input.projectId }
    result = await withGovernedSpend(
      {
        project,
        execution: input.execution,
        provider: 'proof',
        operation: 'governed_effect.proof',
        estimatedSek: PROOF_EFFECT_ESTIMATED_SEK,
        idempotencyKey: input.idempotencyKey,
      },
      async () => {
        const r = await proofDispatch(scenario, input.beforeDispatch)
        // A positive non-application claim is the only thing that may RELEASE.
        if (r.provablyNotApplied) {
          released = r
          throw new ProviderNotDispatchedError(r.detail, 'proof')
        }
        return r
      },
    )
  } catch (e) {
    // Read through a widened local: the assignment happens inside the boundary's
    // callback, which TypeScript's linear flow analysis cannot see.
    const rel = released as ProofResult | null
    if (e instanceof ProviderNotDispatchedError && rel !== null) {
      // Released, and the reservation is closed. The executor is told positively
      // what happened, with the observation the adapter actually made.
      return {
        observation: rel.observation,
        provablyNotApplied: true,
        remoteOperationId: rel.remoteOperationId,
        detail: rel.detail,
        checkKey: PROOF_EFFECT_CHECK,
        evidenceDetail: { scenario, observation: rel.observation, released: true },
        estimatedSek: PROOF_EFFECT_ESTIMATED_SEK,
      }
    }
    throw e
  }

  return {
    observation: result.observation,
    provablyNotApplied: result.provablyNotApplied,
    remoteOperationId: result.remoteOperationId,
    detail: result.detail,
    checkKey: PROOF_EFFECT_CHECK,
    // Proof that this boundary reserved, and under which identity. The executor
    // refuses the result if it is absent or names a different intent.
    spendReservedUnderKey: input.idempotencyKey,
    evidenceDetail: {
      scenario,
      observation: result.observation,
      provably_not_applied: result.provablyNotApplied,
      remote_operation_id: result.remoteOperationId,
      attempt_group: input.attemptGroup,
      idempotency_key: input.idempotencyKey,
    },
    estimatedSek: PROOF_EFFECT_ESTIMATED_SEK,
  }
}
