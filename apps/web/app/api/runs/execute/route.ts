/**
 * POST /api/runs/execute  { run_id }
 *
 * A thin wrapper around the canonical `resumeRun`. Protected with
 * Authorization: Bearer {CRON_SECRET}.
 *
 * ── G3C-3B: ONE MANUAL-REQUEUE TRUTH TABLE ──────────────────────────────────
 * This route used to requeue ANY run to `pending` with `.eq('id', run_id)` and no
 * status predicate at all. That could rewrite durable history: a `done` run
 * re-executed and duplicated its deliverable; a `cancelled` or `rejected` run had
 * its terminal meaning erased; an `unknown`/`partial` run — one whose remote
 * effect is by definition unresolved — was restarted on top of that ambiguity;
 * and a `running` run was torn out from under its owner.
 *
 * The unique-index collision (a cancelled run re-entering
 * `runs_action_identity_uniq` beside its own replacement, raising 23505) was only
 * the most visible symptom. Catching that error would have left every other
 * failure mode in place, so the contract is narrowed instead:
 *
 *   failed → pending   ONLY. Same rule, same UPDATE, same fresh budget as
 *                      /api/runs/[id]/resume and the Action Center batch.
 *
 * Re-running equivalent work after done/cancelled/rejected/unknown/partial is a
 * NEW RUN with its own lifecycle identity and provenance — deliberately not
 * offered here, and out of scope for this slice.
 *
 * Verified before narrowing: this endpoint has no runtime caller in the
 * repository. It is referenced only by the route manifest, a governance
 * entrypoint listing and historical design notes.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resumeRun } from '@/lib/ai/resume'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { run_id } = await request.json() as { run_id?: string }
  if (!run_id) return NextResponse.json({ error: 'run_id krävs' }, { status: 400 })

  const result = await resumeRun(createAdminClient(), run_id)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 })
  }
  // 202: the drain claims and runs it under a lease. Nothing executes inline.
  return NextResponse.json({ ok: true, run_id, status: 'queued' }, { status: 202 })
}
