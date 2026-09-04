/**
 * POST /api/runs/[id]/cancel — cancel a run.
 *
 * Ownership-gated (resolveProjectAccess / assertProjectAllowed — same posture as
 * /api/approvals/[id]).
 *
 * ── G3C-3B: ONE CANONICAL WRITER ────────────────────────────────────────────
 * Every cancellable state now goes through public.request_run_cancel, which locks
 * the RUN ROW and branches on the state that exists AT THE WRITE:
 *
 *   pending            → cancelled (releases the action identity)
 *   awaiting_approval  → cancelled + any unresolved approval → 'returned',
 *                        in the SAME transaction
 *   running            → cancel_requested = true; the owning executor, the
 *                        canonical checkpoint or the reaper resolves it
 *   anything else      → 0 rows
 *
 * This route previously branched on a status it had READ, then issued a
 * conditional UPDATE whose row count it never checked. `claim_runs` landing in
 * between made that UPDATE match zero rows while the operator was told the run
 * was cancelled — the cancellation was lost and the run ran to completion. The
 * pre-read is now used ONLY for existence and tenancy; it is never the lifecycle
 * decision.
 *
 * ── HONEST REPORTING ────────────────────────────────────────────────────────
 * The RPC's row count is the mutation truth. A read-only status fetch afterwards
 * shapes the RESPONSE, never the verdict:
 *
 *   n > 0, now cancelled   → 200 ok, status 'cancelled'
 *   n > 0, still running   → 200 ok, status 'cancel_requested'
 *   n = 0, already cancelled → 200 ok, noop: true, mutated: false
 *   n = 0, otherwise         → 409, ok: false, status 'already_terminal'
 *
 * `enforced` stays honest about what it means: the run stops at its next
 * canonical safe boundary. It does NOT mean an in-flight provider request was
 * remotely cancelled. Nothing here can promise that.
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

  // Pre-read for EXISTENCE and TENANCY only. Its `status` is deliberately not
  // read: by the time we write, it may be a different state, and acting on it
  // is exactly the defect this route used to have.
  const { data: run } = await db
    .from('runs')
    .select('id, project_id')
    .eq('id', params.id)
    .single()

  if (!run) return NextResponse.json({ error: 'Körningen hittades inte' }, { status: 404 })
  if (!assertProjectAllowed(run.project_id, access.allowedProjectIds)) return projectForbidden()

  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null

  // The one canonical writer. The RUN row lock inside decides which state
  // actually exists; the row count is the only evidence of a mutation.
  const { data: affected, error } = await db.rpc('request_run_cancel', {
    p_run_id: run.id,
    p_project_id: run.project_id,
    p_actor: access.userId,
    p_reason: reason,
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const mutated = Number(affected) > 0

  // Presentation only — this read cannot change the verdict above.
  const { data: after } = await db
    .from('runs').select('status, cancel_requested').eq('id', run.id).single()
  const status = after?.status as string | undefined

  const STOP_NOTE =
    'Stops at the next safe boundary — before its next step, before a workflow '
    + 'action dispatches, or at drain pick-up. A provider request already in '
    + 'flight is allowed to finish; it is not remotely cancelled.'

  if (mutated) {
    // Terminalized outright (was pending or awaiting_approval).
    if (status === 'cancelled') {
      return NextResponse.json({ ok: true, status: 'cancelled', enforced: true, mutated: true })
    }
    // Durable intent recorded against a running run. G3C-3A's checkpoint reads
    // `cancel_requested` unconditionally — at drain entry, before every unified
    // and legacy step, and before every workflow action dispatch — so a
    // persisted request WILL be acted on.
    return NextResponse.json({
      ok: true, status: 'cancel_requested', enforced: true, mutated: true, note: STOP_NOTE,
    })
  }

  // Zero rows. Nothing was mutated, and this route no longer pretends otherwise.
  if (status === 'cancelled') {
    // Idempotent re-cancel: the caller's desired end state already holds. Report
    // success, but never claim a mutation that did not happen.
    return NextResponse.json({
      ok: true, status: 'cancelled', noop: true, mutated: false, enforced: true,
    })
  }
  // Terminal in some OTHER way — done, failed, rejected, unknown, partial. The
  // requested cancellation did not win, and that is materially different from
  // "already cancelled".
  return NextResponse.json({
    ok: false, status: 'already_terminal', mutated: false, enforced: false,
    current_status: status ?? null,
    error: 'Körningen är inte längre möjlig att avbryta',
  }, { status: 409 })
}
