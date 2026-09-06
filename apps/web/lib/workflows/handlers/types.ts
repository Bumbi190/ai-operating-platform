/**
 * lib/workflows/handlers/types.ts — what a READ_ONLY action handler is allowed
 * to be.
 *
 * The shape is deliberately narrow. A handler receives facts already derived
 * from the instance and the pinned definition — it cannot ask for a different
 * month, a different timezone or a different target — and it returns one
 * observation. It has no database handle, no credential and no way to reach the
 * network unless it imports one itself, which the negative-architecture tests
 * forbid for this family.
 *
 * Where a handler genuinely needs stored state, it is handed the ANSWER through
 * a narrow closure the executor owns — `readReleaseBinding`, `readGeneratedStory`
 * — never a client it could point somewhere else. That is what keeps "read-only"
 * a property of the capability rather than a promise about the code.
 */

import type { GithubBinding } from '../bundle/github-binding'
import type { GeneratedStoryTarget } from '../story/generated-target'
import type { StoryV1 } from '../story/types'

/**
 * The outcome of looking up the story a validation is about.
 *
 * A discriminated union rather than `StoryV1 | null`, because "there is no story
 * to validate" and "the evidence naming it is malformed" are different facts and
 * a validator must report which one it met. Collapsing them to null is how a
 * missing story and a broken pointer both become the same silent non-answer.
 */
export type GeneratedStoryRead =
  | { ok: true; target: GeneratedStoryTarget; story: StoryV1; storedHash: string }
  | { ok: false; refusal: string; detail: string }

/** The PR4 vocabulary, unchanged: "could not verify" never becomes PASS. */
export type ReadOnlyResult = 'pass' | 'fail' | 'blocked' | 'error'

export interface ReadOnlyHandlerInput {
  /** The instance's key. For Familje-Stunden this IS the month key. */
  instanceKey: string
  /** The state the action belongs to, from the run's immutable binding. */
  state: string
  /** Derived, never supplied by a caller. */
  defKey: string
  defVersion: number
  now: string
  /**
   * G3C-3A: re-authorise before each discrete outbound request.
   *
   * A handler that emits more than one packet must call this between them, so a
   * stop committing mid-handler prevents the next request rather than only the
   * next action. Throwing is the refusal; there is deliberately no boolean a
   * handler could ignore. Optional because a handler with a single outbound
   * request is already covered by the pre-dispatch checkpoint.
   */
  beforeAttempt?: () => Promise<void> | void
  /**
   * The instance's GitHub release identity, read on demand.
   *
   * A closure rather than a value, for the same reason `beforeAttempt` is one:
   * the handler still holds no database handle, and an action that does not
   * need the binding never pays for the query. The executor owns the read, so
   * the identity always comes from THIS instance's own evidence — never from a
   * deployment-global environment variable, and never from a caller.
   */
  readReleaseBinding?: () => Promise<GithubBinding>
  /**
   * The exact persisted story this state's evidence says was generated.
   *
   * The same shape as `readReleaseBinding` and for the same reasons: a closure,
   * so a handler that does not need a story never pays for the query, and the
   * executor owns the read so the handler still holds no database handle.
   *
   * It is deliberately NOT a table capability. What comes back is one story,
   * chosen by the identity in this instance's own `story_generated` evidence —
   * never by recency, never by revision number, and never by anything a caller
   * or a handler could name. There is no path from here to a second table, to a
   * different instance, or to a write.
   */
  readGeneratedStory?: () => Promise<GeneratedStoryRead>
}

export interface ReadOnlyHandlerOutput {
  result: ReadOnlyResult
  /** The declared check this observation answers. */
  checkKey: string
  expected: string
  observed: string
  /**
   * Safe structured facts only — values a person could read aloud. Never a raw
   * response, never a credential, never customer data.
   */
  detail: Record<string, string | number | boolean | null>
  /** Null when nothing external was consulted, which is the point for pure computation. */
  authoritativeSystem: string | null
}

export type ReadOnlyHandler = (input: ReadOnlyHandlerInput) => Promise<ReadOnlyHandlerOutput>
