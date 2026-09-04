/**
 * lib/workflows/effect/effect-handler.ts — what an effectful handler is allowed
 * to be.
 *
 * Deliberately a DIFFERENT type from `ReadOnlyHandler`, not a widened one. A
 * read-only handler has no database handle, and the negative-architecture tests
 * enforce that; an effectful handler needs one. Widening the read-only contract
 * so both could share it would delete that guarantee for the observations too,
 * which is the opposite of what this phase is for.
 *
 * ── THE HANDLER PERFORMS THE EFFECT; THE EXECUTOR OWNS GOVERNANCE ───────────
 * Nothing here lets a handler decide whether it needs authorization, whether
 * spend applies, or whether it may retry. Those come from `ACTION_CLASS_POLICY`
 * via the executor, before the handler is ever reached. A handler that could
 * answer them could exempt itself.
 *
 * The one governance affordance a handler gets is `beforeDispatch`: the last
 * chance to refuse, awaited immediately before the irreversible act. It throws
 * rather than returning a boolean, because a boolean can be ignored.
 */

import type { DispatchObservation } from '../action-outcome'

// any: the Supabase client in this project has no generated DB types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EffectDb = any

export interface EffectHandlerInput {
  /** The claimed run performing this effect. */
  readonly runId: string
  readonly claimId: string | null
  readonly projectId: string
  /** The instance and its key. For Familje-Stunden the key IS the month. */
  readonly instanceId: string
  readonly instanceKey: string
  /** The state the run is immutably bound to. */
  readonly state: string
  readonly defKey: string
  readonly defVersion: number
  readonly defHash: string
  /** The pinned world this action was bound to. */
  readonly targetVersionHash: string
  /** Which attempt this is. A fresh intent takes a new group. */
  readonly attemptGroup: string
  /** Stable identity for ONE logical effect; also the spend reservation key. */
  readonly idempotencyKey: string
  readonly now: string
  /**
   * A database handle. Present because an effect must usually persist what it
   * produced, which a read-only observation never does.
   */
  readonly db: EffectDb
  /**
   * The last chance to refuse, awaited immediately before the irreversible act.
   * Throws on refusal — there is deliberately no boolean to ignore.
   */
  readonly beforeDispatch: () => Promise<void>
}

/**
 * What an effect reports back.
 *
 * `observation` is the existing generic vocabulary — this module adds no second
 * certainty model. `provablyNotApplied` is the ONLY thing that may release a
 * spend reservation, and it is a positive claim: a timeout is not one.
 */
export interface EffectHandlerOutput {
  readonly observation: DispatchObservation
  /**
   * True only when the effect provably did not happen and provably was not
   * billed. A lost response is NOT this.
   */
  readonly provablyNotApplied: boolean
  /** The authoritative system's identifier for the operation, when it named one. */
  readonly remoteOperationId: string | null
  /** Human-readable, safe. Never a raw response, never a credential. */
  readonly detail: string
  /** The check this effect answers, when it answers one. */
  readonly checkKey?: string
  /** Safe structured facts for evidence. Scalars only, as everywhere else. */
  readonly evidenceDetail?: Record<string, string | number | boolean | null>
  /** Conservative upper bound in SEK, for classes that require spend enforcement. */
  readonly estimatedSek?: number
}

export type EffectHandler = (input: EffectHandlerInput) => Promise<EffectHandlerOutput>
