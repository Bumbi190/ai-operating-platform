/**
 * POST /api/runs/[id]/cancel — cancel a run (H1.P5 Commit 3).
 *
 * Ownership-gated (resolveProjectAccess / assertProjectAllowed — same posture as
 * /api/approvals/[id]). State machine:
 *   pending            → cancelled (direct, idempotent on status='pending')
 *   awaiting_approval  → cancelled (direct) + the still-pending approval → 'returned' (D1)
 *   running            → cancel_requested = true (cooperative; the executor stops at the
 *                        next step boundary when H1_CANCEL is on)
 *   terminal (done/failed/rejected/cancelled) → no-op
 *
 * The route itself is NOT behind H1_CANCEL: pending/awaiting cancel are always safe
 * immediate transitions; only the cooperative running-cancel reaction (drain/executor)
 * is flag-gated. All writes are status-guarded (the correct invariant for at-rest /
 * externally-initiated lifecycle changes — claim_id fencing is for executing runs).
 *
 * ── PR9a: HONEST REPORTING ──────────────────────────────────────────────────
 * Cancelling a RUNNING run used to answer `{ok:true, status:'cancel_requested'}`
 * whether or not anything would ever act on it. With H1_CANCEL unset — which is
 * how production actually stood — the flag was written and no code path read it,
 * so the API reported success for an operation that could not happen. An operator
 * cancelling a runaway action would have believed they had stopped it.
 *
 * The request is still persisted (durable intent survives until cancellation is
 * enabled), but the response now states whether it will be ENFORCED. A caller can
 * distinguish "it will stop" from "your intent is recorded and nothing is
 * listening", which is the difference between a working kill switch and a
 * comforting one.
 *
 * The running-case write goes through public.request_run_cancel so the tenancy
 * guard lives at the DB boundary, and so reason/actor are recorded for audit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  // Optional { reason } — recorded for audit. A malformed body is not an error;
  // a cancel must never be blocked by its own annotation.
  let body: { reason?: unknown } | null = null
  try { body = await req.json() } catch { body = null }

  // Supabase saknar genererade DB-typer för cancel_requested — castar till any (samma
  // mönster som övriga admin-rutter), undviker types-regen-koppling i denna commit.
  const db = createAdminClient() as any

  const { data: run } = await db
    .from('runs')
    .select('id, status, project_id')
    .eq('id', params.id)
    .single()

  if (!run) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })
  // Ownership gate BEFORE any mutation.
  if (!assertProjectAllowed(run.project_id, access.allowedProjectIds)) return projectForbidden()

  const now = new Date().toISOString()

  switch (run.status) {
    case 'pending': {
      // Direct cancel — the run never ran. Conditional on status='pending' → idempotent.
      await db.from('runs')
        .update({ status: 'cancelled', finished_at: now })
        .eq('id', run.id).eq('status', 'pending')
      return NextResponse.json({ ok: true, status: 'cancelled' })
    }
    case 'awaiting_approval': {
      await db.from('runs')
        .update({ status: 'cancelled', finished_at: now })
        .eq('id', run.id).eq('status', 'awaiting_approval')
      // D1: resolve the still-pending approval to 'returned' so it doesn't orphan in
      // the queue (CHECK already allows 'returned'). Conditional → idempotent.
      await db.from('approvals')
        .update({ status: 'returned', reviewed_at: now })
        .eq('run_id', run.id).eq('status', 'pending')
      return NextResponse.json({ ok: true, status: 'cancelled' })
    }
    case 'running': {
      // Can't cancel directly — an executor owns it, and only that executor may
      // write its terminal row (fenced on claim_id). Record durable intent; the
      // cooperative check in the drain/executor stops it at the next step boundary.
      // request_run_cancel is tenancy-guarded and status-guarded in SQL, so a run
      // that just left 'running' is untouched.
      const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null
      const { data: updated } = await db.rpc('request_run_cancel', {
        p_run_id: run.id,
        p_project_id: run.project_id,
        p_actor: access.userId,
        p_reason: reason,
      })
      const persisted = Number(updated) > 0
      // G3C-3A: enforcement no longer depends on H1_CANCEL. The canonical
      // post-claim checkpoint reads `cancel_requested` unconditionally — at the
      // drain entry, before every unified and legacy step, and before every
      // workflow action dispatch — so a persisted request WILL be acted on.
      //
      // `enforced` stays honest about what it means: the run stops at its next
      // canonical safe boundary. It does NOT mean an in-flight provider request
      // was remotely cancelled. Nothing here can promise that, and G3C-1's
      // in-flight contract is unchanged.
      return NextResponse.json({
        // `ok` reports whether the intent was recorded; `enforced` reports whether
        // anything will act on it. Never conflate the two.
        ok: persisted,
        status: 'cancel_requested',
        enforced: true,
        note: 'Stops at the next safe boundary — before its next step, before a '
          + 'workflow action dispatches, or at drain pick-up. A provider request '
          + 'already in flight is allowed to finish; it is not remotely cancelled.',
      })
    }
    default:
      // terminal — no-op.
      return NextResponse.json({ ok: true, status: run.status, noop: true })
  }
}
