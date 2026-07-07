/**
 * lib/ai/fencing.ts — H1.P5 Commit 2: claim_id fencing.
 *
 * A run is claimed atomically by public.claim_runs(), which stamps a fresh
 * claim_id (gen_random_uuid()) per claim. The reaper (omnira_cron.reap_stuck_runs)
 * CLEARS claim_id when it reclaims a stuck run. Any write performed by an
 * EXECUTING run is therefore conditioned on the claim_id it was handed: if the run
 * was reclaimed (token rotated/cleared), the conditioned UPDATE matches ZERO rows —
 * the write is "fenced" and the now-zombie invocation must abort rather than clobber
 * the new owner's run or spend more LLM budget. This is the HARD guarantee that
 * backstops the lease(320s) > maxDuration(300s) time heuristic (Codex review #2).
 *
 * ── LOCKED RULE (H1.P5 Commit 2) ────────────────────────────────────────────
 *  • claim_id fencing applies to writes from an EXECUTING run ONLY:
 *      - the drain's terminal flips  (done / awaiting_approval / retry|failed)
 *      - the executor's per-step context write (workflow-executor.ts)
 *  • The approval-lifecycle PATCH (awaiting_approval → done/rejected) is EXEMPT.
 *    That run has already LEFT running-state, no executor owns it, and the reaper
 *    only touches status='running' — so no zombie executor can still write to it.
 *    The correct invariant there is the STATUS transition itself
 *    (.eq('status','awaiting_approval')), NOT claim ownership. See
 *    app/api/approvals/[id]/route.ts.
 *  • Zombie/legacy execution paths (manager retry_run inline loop) are removed in
 *    Commit 2 so that EVERY execution path runs behind this one claim/fencing model
 *    before H1_FENCING is enabled.
 *
 * Flag-gated: H1_FENCING (default OFF). When off, run-writes are UNCONDITIONAL —
 * byte-for-byte the pre-Commit-2 behavior — so rollback is a single env flip with no
 * code or schema change. The additive claim_id column + RPC token stay in place,
 * inert (stamped/cleared but unread).
 */

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

const FENCED_PREFIX = 'fenced:'

/** Read at call time so a flag flip takes effect without a process restart (and so tests can toggle). */
export function isFencingEnabled(): boolean {
  return process.env.H1_FENCING === '1'
}

/** Sentinel thrown by an executing run when its fenced write hit zero rows (reclaimed). */
export function fencedError(runId: string): Error {
  return new Error(`${FENCED_PREFIX} run ${runId} reclaimed (claim rotated)`)
}

/** True for the abort sentinel above — lets the drain distinguish a fence from a real failure. */
export function isFencedError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith(FENCED_PREFIX)
}

/**
 * Apply a runs UPDATE, fenced on claim_id when H1_FENCING is on and a token is present.
 *
 * Returns { fenced: true } when the conditioned update matched ZERO rows (the run was
 * reclaimed). Does NOT throw on the fenced case — the caller decides what a zero-row
 * result means: a terminal flip SKIPS (the new owner handles the run); a mid-execution
 * write ABORTS (throw fencedError) to stop the zombie. A real DB error still throws.
 *
 * Flag off, or no claim_id (e.g. the legacy manual /api/runs/execute path that runs
 * without a claim): the update is UNCONDITIONAL and { fenced: false } — pre-Commit-2
 * behavior, unchanged.
 */
export async function fencedRunUpdate(
  db: AnyDb,
  runId: string,
  claimId: string | null | undefined,
  payload: Record<string, unknown>,
): Promise<{ fenced: boolean }> {
  if (isFencingEnabled() && claimId) {
    const { data, error } = await db
      .from('runs')
      .update(payload)
      .eq('id', runId)
      .eq('claim_id', claimId)
      .select('id')
    if (error) {
      throw new Error(`fencedRunUpdate: update failed for run ${runId}: ${error.message}`)
    }
    return { fenced: !data || data.length === 0 }
  }
  await db.from('runs').update(payload).eq('id', runId)
  return { fenced: false }
}
