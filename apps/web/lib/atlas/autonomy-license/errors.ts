/**
 * lib/atlas/autonomy-license/errors.ts — the store's error contract.
 *
 * ── WHY THIS IS NOT IN store.ts ────────────────────────────────────────────
 * Two callers need it and one of them must not import the store to get it.
 * `store.ts` raises these; `issue.ts` classifies them. Tests mock the whole
 * store module, so a class defined inside it would arrive in `issue.ts` as
 * `undefined` — and `error instanceof undefined` throws. The classification
 * therefore lives in a module neither side mocks.
 *
 * ── WHY THE SQLSTATE IS THE DISCRIMINATOR ──────────────────────────────────
 * A refusal the DATABASE made must be told apart from a failure this process
 * invented. The SQLSTATE is the only fact that survives the trip: it is the
 * database's own word for what happened. Reading it structurally (rather than
 * requiring a particular class) also means a test double that speaks the same
 * code is classified identically, so the proof exercises the same branch
 * production does.
 *
 * Following the repository convention (`lib/media/job/store-supabase.ts`,
 * `lib/workflows/store.ts`): each store owns the small SQLSTATE map it
 * interprets, and everything unrecognised stays a generic failure.
 */

/** Postgres SQLSTATEs this boundary interprets. Everything else is a failure. */
export const LICENSE_SQLSTATE = {
  /**
   * The caller's observed lineage generation is no longer the committed one.
   *
   * PostgreSQL's canonical concurrency-conflict code. A stale human decision is
   * a CONFLICT — a second human acted first — never malformed data, so it must
   * not be reported through the same channel as a malformed request.
   */
  SERIALIZATION_FAILURE: '40001',
} as const

/**
 * A store failure that carries the database's own diagnosis.
 *
 * The message is preserved because it is the operator's only clue; the code is
 * preserved because it is the only thing authority decisions may be made on.
 */
export class LicenseStoreError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'LicenseStoreError'
    this.code = code
  }
}

/**
 * Did the database refuse this write because the caller's view was stale?
 *
 * Structural on purpose: the SQLSTATE is the contract, so anything carrying it
 * — the real error, or a double standing in for it — classifies the same way.
 */
export function isStaleGenerationConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { code?: unknown }).code === LICENSE_SQLSTATE.SERIALIZATION_FAILURE
}
