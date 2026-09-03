/**
 * lib/ai/cancel.ts — H1.P5 Commit 3: cooperative run cancellation.
 *
 * A cancel request is a durable flag on the run (runs.cancel_requested), set by
 * POST /api/runs/[id]/cancel. The 'running' case can't be cancelled directly (an
 * executor owns it), so the flag is read COOPERATIVELY at safe boundaries:
 *   • the drain at claim time (run no steps if already cancelled), and
 *   • the executor before each step,
 * then the run is transitioned to 'cancelled' via a claim_id-fenced write (Commit 2)
 * so a reclaimed zombie can't cancel a run the new owner is running.
 *
 * pending / awaiting_approval are terminalized by public.request_run_cancel under
 * the run row lock, not through this cooperative path — no executor owns them.
 *
 * ── H1_CANCEL NO LONGER GATES ENFORCEMENT ──────────────────────────────────
 * This block used to say that with the flag off "the drain/executor ignore it, so
 * a running run completes normally". That stopped being true in G3C-3A, which
 * made the canonical post-claim checkpoint read `cancel_requested`
 * UNCONDITIONALLY — at drain entry, before every unified and legacy step, and
 * before every workflow action dispatch. G3C-3B then removed the last
 * flag-gated duplicate of that decision from the drain.
 *
 * `isCancelEnabled` survives for the remaining H1.P5 surfaces below; it is NOT a
 * kill switch for cancellation enforcement, and nothing should reintroduce one.
 */

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

const CANCELLED_PREFIX = 'cancelled:'

/** Read at call time so a flag flip takes effect without a restart (and tests can toggle). */
export function isCancelEnabled(): boolean {
  return process.env.H1_CANCEL === '1'
}

/** Sentinel thrown by the executor when it stops at a step boundary due to a cancel request. */
export function cancelledError(runId: string): Error {
  return new Error(`${CANCELLED_PREFIX} run ${runId} cancelled (cooperative)`)
}

/** True for the cancel sentinel — lets the drain skip terminal writes without marking failed. */
export function isCancelledError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith(CANCELLED_PREFIX)
}

/**
 * Read the durable cancel flag for a run. Best-effort: a read error returns false
 * (treat as "not cancelled") so a transient read never aborts a legitimate run.
 */
export async function isCancelRequested(db: AnyDb, runId: string): Promise<boolean> {
  try {
    const { data } = await db.from('runs').select('cancel_requested').eq('id', runId).maybeSingle()
    return data?.cancel_requested === true
  } catch {
    return false
  }
}
