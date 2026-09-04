/**
 * lib/governance/run-authority.ts — the ONE ownership/cancellation truth table.
 *
 * G3C-3A established the order: ownership → cancellation → stop authority, and
 * a rotated claim invalidates everything else a worker believes. G3C-3C-A needs
 * that same table from a second place — the in-flight authority watcher — and
 * this programme has already paid twice for what happens when a second copy
 * appears (the drain and the unified executor each grew a rival cancel branch,
 * and G3C-3B deleted both).
 *
 * So the table lives here once, as a PURE function, and both callers use it.
 *
 * ── WHY THIS IS PURE ───────────────────────────────────────────────────────
 * It performs no I/O. It classifies a read that has ALREADY happened. Stop
 * authority is deliberately NOT evaluated here: that is `resolveExecutionStop`'s
 * job, it needs the database, and a "pure" classifier that secretly reads would
 * be a second stop truth table wearing a disguise. This function's last word is
 * `CONTINUE_TO_STOP_CHECK` — an instruction to the caller, not a verdict.
 *
 * ── READ FAILURE IS NOT MISSING ROW ────────────────────────────────────────
 * This is the load-bearing distinction, and the reason the extraction exists.
 *
 *   READ_ERROR   the truth could not be established. Nothing is proven — not
 *                ownership, not its loss. → AUTHORITY_UNAVAILABLE
 *   MISSING_ROW  the read SUCCEEDED and returned nothing. That is positive
 *                proof the run is gone. → FENCED
 *
 * `checkpointClaimedRun` has always collapsed both into FENCED, and it still
 * does — see the mapping at its call site, which is pinned by a compatibility
 * test. The watcher must not, because "I could not read the database" is not a
 * reason to tear down an in-flight provider request that a successful boundary
 * check already permitted.
 */

/** What the caller observed when it read the run row. */
export type RunRowRead =
  | { kind: 'READ_ERROR' }
  | { kind: 'MISSING_ROW' }
  | { kind: 'ROW'; row: RunAuthorityRow }

export interface RunAuthorityRow {
  id?: string | null
  status: string | null
  claim_id: string | null
  cancel_requested: boolean | null
  project_id?: string | null
}

/**
 * The ownership/cancellation verdict, before stop authority.
 *
 * `CONTINUE_TO_STOP_CHECK` is not "allowed" — it means this layer found no
 * reason to refuse and the caller must now consult canonical stop authority.
 */
export type RunAuthorityClass =
  | 'AUTHORITY_UNAVAILABLE'
  | 'FENCED'
  | 'CANCELLED'
  | 'CONTINUE_TO_STOP_CHECK'

export interface RunAuthorityVerdict {
  readonly klass: RunAuthorityClass
  /** Stable, human-readable cause. Callers prefix it with their boundary. */
  readonly detail: string
}

/**
 * Classifies ownership and cancellation for one claimed run.
 *
 * Order is G3C-3A's, unchanged and deliberately so: a rotated claim invalidates
 * everything downstream, so ownership is settled before cancellation is even
 * looked at. `status !== 'running'` is FENCED even when the claim still matches
 * — the run left the state this worker owns, and continuing would be acting on
 * a lifecycle that someone else already concluded.
 */
export function classifyRunAuthority(
  read: RunRowRead,
  expectedClaimId: string | null | undefined,
): RunAuthorityVerdict {
  if (read.kind === 'READ_ERROR') {
    // NOT fencing. Nothing was proven; the caller decides how much that costs.
    return { klass: 'AUTHORITY_UNAVAILABLE', detail: 'ownership unreadable — refusing to execute' }
  }
  if (read.kind === 'MISSING_ROW') {
    // A successful read that returned nothing IS proof.
    return { klass: 'FENCED', detail: 'run no longer exists' }
  }

  const { row } = read
  if (!expectedClaimId) {
    // No claim means no ownership. The legacy no-claim caller is a real path;
    // it must not gain permission by virtue of never having had any.
    return { klass: 'FENCED', detail: 'invocation holds no claim' }
  }
  if (row.claim_id !== expectedClaimId) {
    return { klass: 'FENCED', detail: 'claim rotated — another owner holds this run' }
  }
  if (row.status !== 'running') {
    return { klass: 'FENCED', detail: `run is ${row.status ?? 'gone'}, not running` }
  }
  if (row.cancel_requested === true) {
    return { klass: 'CANCELLED', detail: 'cancellation requested' }
  }
  return { klass: 'CONTINUE_TO_STOP_CHECK', detail: 'owned and uncancelled' }
}

/**
 * Performs the canonical ownership read and classifies it.
 *
 * The read shape is exactly the one G3C-3A has always used. Both the checkpoint
 * and the watcher call this, so a column added to one is added to both.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function readRunAuthority(db: any, runId: string): Promise<RunRowRead> {
  try {
    const { data, error } = await db.from('runs')
      .select('id, status, claim_id, cancel_requested, project_id')
      .eq('id', runId).maybeSingle()
    if (error) return { kind: 'READ_ERROR' }
    if (!data) return { kind: 'MISSING_ROW' }
    return { kind: 'ROW', row: data as RunAuthorityRow }
  } catch {
    return { kind: 'READ_ERROR' }
  }
}
