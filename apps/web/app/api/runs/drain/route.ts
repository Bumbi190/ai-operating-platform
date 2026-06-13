/**
 * GET /api/runs/drain — durable workflow-körare (Alternativ A).
 *
 * Anropas av pg_cron (omnira_runs_drain) varje minut. Claimar pending runs
 * atomiskt (public.claim_runs → SKIP LOCKED), kör varje run, och sätter
 * done / pending(retry) / failed. Inget fire-and-forget; status = verkligheten.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSteps } from '@/lib/ai/workflow-runner'
import { executeRunSteps } from '@/lib/ai/workflow-executor'
import { computeCheckpoint } from '@/lib/ai/checkpoint'
import { MARKETING_HANDLERS, isMarketingRun } from '@/lib/marketing/workflows'
import type { Run } from '@/lib/supabase/types'
import { parseWorkflowSteps } from '@/lib/supabase/json'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

const CLAIM_LIMIT   = 3     // håller invocationen inom maxDuration; fler ticks ger throughput
// Codex review #2 (lease/reaper race): the lease must OUTLIVE the invocation.
// Vercel hard-kills the function at maxDuration (300s), so a lease >= maxDuration
// means lease_until only expires AFTER the function is already dead. The reaper
// therefore only ever requeues genuinely-dead runs (which checkpointing resumes
// safely) — never a still-running invocation. Was 280 (< maxDuration), which left
// a ~20s window where a live run could be requeued and double-executed.
const LEASE_SECONDS = 320   // > maxDuration (300) + margin

// H1.P2: unified executor (validation + quality gate + checkpointed resume) on the
// drain path. Flag-gated for instant rollback — unset H1_UNIFIED_EXECUTOR to fall
// back to the legacy lightweight runSteps path within one deploy, no code change.
const UNIFIED_EXECUTOR = process.env.H1_UNIFIED_EXECUTOR === '1'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: claimed, error } = await db.rpc('claim_runs', { p_limit: CLAIM_LIMIT, p_lease_seconds: LEASE_SECONDS })
  if (error) return NextResponse.json({ status: 'claim_error', error: error.message }, { status: 500 })

  const runs = (claimed ?? []) as any[]
  const results: Record<string, unknown>[] = []

  for (const run of runs) {
    try {
      const kind = run.kind
      if (isMarketingRun(kind)) {
        // Kod-driven marketing-workflow: dispatch på `kind` till rätt handler.
        // (Fas 1: no-op-handlers.) Drainern äger fortfarande run-statuslogiken.
        await MARKETING_HANDLERS[kind](db, run as Run)
      } else {
        // Agent-step-workflow: kör stegen från workflows.steps.
        const { data: wf } = await db.from('workflows').select('steps').eq('id', run.workflow_id).single()
        const steps = parseWorkflowSteps(wf?.steps)
        if (UNIFIED_EXECUTOR) {
          // H1.P2: rich engine + checkpointed resume. Drain still owns status below.
          const { startFromOrder, existingContext } = await computeCheckpoint(db, run, steps)
          await executeRunSteps(db, run.id, run.project_id, steps, {
            initialInput: (run.input ?? {}) as Record<string, string>,
            existingContext,
            startFromOrder,
          })
        } else {
          // Legacy lightweight path (flag off) — unchanged behavior for rollback.
          await runSteps(db, run.id, run.project_id, steps, (run.input ?? {}) as Record<string, string>)
        }
      }
      await db.from('runs').update({
        status: 'done', finished_at: new Date().toISOString(), claimed_at: null, lease_until: null,
      }).eq('id', run.id)
      results.push({ run_id: run.id, status: 'done' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Okänt fel'
      // attempts är redan inkrementerad av claim_runs → willRetry om vi inte nått taket.
      const willRetry = (run.attempts ?? 0) < (run.max_attempts ?? 3)
      const history = [
        ...(Array.isArray(run.error_history) ? run.error_history : []),
        { at: new Date().toISOString(), attempt: run.attempts, error: msg },
      ].slice(-10)
      await db.from('run_logs').insert({ run_id: run.id, role: 'system', content: `❌ ${msg}` })
      await db.from('runs').update({
        status:        willRetry ? 'pending' : 'failed',
        last_error:    msg,
        error:         willRetry ? null : msg,
        error_history: history,
        finished_at:   willRetry ? null : new Date().toISOString(),
        claimed_at:    null,
        lease_until:   null,
      }).eq('id', run.id)
      results.push({ run_id: run.id, status: willRetry ? 'requeued' : 'failed', error: msg })
    }
  }

  return NextResponse.json({ ok: true, claimed: runs.length, results })
}
