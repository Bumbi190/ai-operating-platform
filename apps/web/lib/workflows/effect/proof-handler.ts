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
 */

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

  const result = await proofDispatch(scenario, input.beforeDispatch)

  return {
    observation: result.observation,
    provablyNotApplied: result.provablyNotApplied,
    remoteOperationId: result.remoteOperationId,
    detail: result.detail,
    checkKey: PROOF_EFFECT_CHECK,
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
