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
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

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
      // Can't cancel directly — an executor owns it. Set the durable flag; the
      // cooperative check (drain/executor, gated by H1_CANCEL) stops it at the next
      // step boundary. Conditional on status='running' → no effect on a run that just left.
      await db.from('runs')
        .update({ cancel_requested: true })
        .eq('id', run.id).eq('status', 'running')
      return NextResponse.json({ ok: true, status: 'cancel_requested' })
    }
    default:
      // terminal — no-op.
      return NextResponse.json({ ok: true, status: run.status, noop: true })
  }
}
