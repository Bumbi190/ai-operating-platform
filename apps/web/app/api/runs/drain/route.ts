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
import type { WorkflowStep } from '@/lib/supabase/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

const CLAIM_LIMIT   = 3     // håller invocationen inom maxDuration; fler ticks ger throughput
const LEASE_SECONDS = 280   // < maxDuration → reaper tar över om vi spräcker

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: claimed, error } = await db.rpc('claim_runs', { p_limit: CLAIM_LIMIT, p_lease_seconds: LEASE_SECONDS })
  if (error) return NextResponse.json({ status: 'claim_error', error: error.message }, { status: 500 })

  const runs = (claimed ?? []) as any[]
  const results: Record<string, unknown>[] = []

  for (const run of runs) {
    try {
      const { data: wf } = await db.from('workflows').select('steps').eq('id', run.workflow_id).single()
      const steps = (wf?.steps as WorkflowStep[]) ?? []
      await runSteps(db, run.id, run.project_id, steps, (run.input ?? {}) as Record<string, string>)
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
