/**
 * lib/ai/resume.ts — durable resume (H1.P3).
 *
 * A resume no longer executes anything itself. It requeues the failed run to
 * `pending` and lets the pg_cron drain claim + run it under a lease, through the
 * exact same unified executor + checkpoint path as every other run. This inherits
 * lease ownership, checkpointed resume, idempotent finalization and reaper recovery
 * for free, and removes the old fire-and-forget `executeWorkflow` (which set
 * `running` with no lease → unrecoverable if the invocation died).
 *
 * Decisions (locked): resume grants a fresh budget (`attempts = 0`, `max_attempts`
 * unchanged); only `failed` runs are resumable (resuming a `done` run is rejected);
 * the requeue UPDATE is conditional on `status = 'failed'` so two concurrent resumes
 * can't both requeue (the second updates zero rows → no-op). Context and run_logs
 * are preserved untouched — they are exactly what computeCheckpoint reads to skip
 * completed steps. Approval-on-completion stays out of scope (owned by P4).
 *
 * Shared by /api/runs/[id]/resume and the agentic batch action (Action Center
 * "Fixa nu" / /api/actions/resume-failed).
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/supabase/database.types'

export interface ResumeResult {
  ok: boolean
  runId: string
  status?: 'queued'
  error?: string
}

export async function resumeRun(admin: SupabaseClient, runId: string): Promise<ResumeResult> {
  const db = admin as any

  const { data: run } = await db
    .from('runs')
    .select('id, status, steps_snapshot, policy_class, workflow_id, workflows(steps, side_effect_class)')
    .eq('id', runId)
    .single()

  if (!run) return { ok: false, runId, error: 'Körning hittades inte' }
  if (run.status !== 'failed') {
    return { ok: false, runId, error: `Kan bara återuppta misslyckade körningar (status: ${run.status})` }
  }

  // Pin the workflow snapshot at resume time for pre-P3 runs that have none, so the
  // resumed execution uses immutable steps (a mid-run workflow edit can't change it).
  const wf = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
  const snapshot: Json | null = (run.steps_snapshot ?? wf?.steps ?? null) as Json | null
  // H1.P4 (PR1): pin the policy class too, so a pre-PR1 run gets a class on resume and
  // the PR2 gate decides against an immutable per-run value. INERT until PR2.
  const policyClass: string | null = run.policy_class ?? wf?.side_effect_class ?? null

  // Conditional requeue: only flips failed → pending. A second concurrent resume sees
  // status already 'pending' and updates zero rows → no double execution.
  const { data: updated } = await db
    .from('runs')
    .update({
      status: 'pending',
      attempts: 0,            // resume = fresh retry budget (max_attempts unchanged)
      error: null,
      last_error: null,
      finished_at: null,
      claimed_at: null,
      lease_until: null,
      steps_snapshot: snapshot,
      policy_class: policyClass,
    })
    .eq('id', runId)
    .eq('status', 'failed')
    .select('id')

  if (!updated || updated.length === 0) {
    return { ok: false, runId, error: 'Körningen är inte längre i failed-läge (redan köad eller ändrad)' }
  }

  return { ok: true, runId, status: 'queued' }
}
