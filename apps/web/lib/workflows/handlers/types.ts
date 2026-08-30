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
 */

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
