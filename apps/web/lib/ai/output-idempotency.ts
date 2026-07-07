/**
 * H1.P5 — output idempotency helper.
 *
 * outputs(run_id) has a partial unique index (migration h1p5_outputs_run_id_unique).
 * A re-entered run — e.g. a reaper re-claim AFTER the deliverable was already written —
 * that inserts its output again hits a unique violation. That is the EXPECTED, idempotent
 * outcome, not a failure: SQLSTATE 23505 = unique_violation. Every other error must still
 * surface so the run retries rather than finalizing with no deliverable.
 */
export function isDuplicateOutputError(error: { code?: string } | null | undefined): boolean {
  return !!error && error.code === '23505'
}
