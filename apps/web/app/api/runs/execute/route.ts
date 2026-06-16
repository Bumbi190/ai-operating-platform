/**
 * POST /api/runs/execute  { run_id }
 *
 * Re-ENQUEUES an existing run for durable execution by the pg_cron drain
 * (/api/runs/drain): pins the workflow steps snapshot + policy class and sets the
 * run back to 'pending', returning 202. The drain claims and runs it under a lease —
 * there is NO inline/synchronous execution anymore (H1.P5 Commit 4 removed the legacy
 * executeWorkflow path). For manual re-run / debugging of a specific run.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { run_id } = await request.json() as { run_id?: string }
  if (!run_id) return NextResponse.json({ error: 'run_id krävs' }, { status: 400 })

  // Supabase saknar genererade DB-typer i detta projekt — castar till any (resume.ts-mönster).
  const db = createAdminClient() as any
  const { data: run } = await db
    .from('runs')
    .select('id, steps_snapshot, policy_class, workflow_id, workflows(steps, side_effect_class)')
    .eq('id', run_id)
    .single()

  if (!run) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })

  // Pin the workflow snapshot + policy class at enqueue time (mirrors resume.ts /
  // buildAgentRunInsert) so the drain executes immutable steps and never re-reads
  // live workflows.steps mid-run.
  const wf = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
  const snapshot: Json | null = (run.steps_snapshot ?? wf?.steps ?? null) as Json | null
  const policyClass: string | null = run.policy_class ?? wf?.side_effect_class ?? null

  const { error: updErr } = await db
    .from('runs')
    .update({
      status: 'pending',
      attempts: 0,            // fresh budget for a manual re-run (max_attempts unchanged)
      error: null,
      last_error: null,
      finished_at: null,
      claimed_at: null,
      lease_until: null,
      steps_snapshot: snapshot,
      policy_class: policyClass,
    })
    .eq('id', run.id)

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  return NextResponse.json({ run_id: run.id, status: 'pending' }, { status: 202 })
}
