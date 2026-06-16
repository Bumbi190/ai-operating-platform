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
import { decideGate, type GateOutcome } from '@/lib/ai/policy-gate'
import { fencedRunUpdate, isFencedError } from '@/lib/ai/fencing'
import { MARKETING_HANDLERS, isMarketingRun } from '@/lib/marketing/workflows'
import type { Run } from '@/lib/supabase/types'
import { parseWorkflowSteps } from '@/lib/supabase/json'
import { sendAdminNotification } from '@/lib/email/brevo'
import { getApprovalPendingEmail } from '@/lib/email/templates'

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

// H1.P4 PR2: policy gate. Reads the per-run policy_class snapshot at drain completion
// and routes the run to 'done' vs 'awaiting_approval'. Flag-gated (default OFF) for
// instant rollback. Per PR2 scope: only the unified-executor agent-step path is gated
// (decision B — no legacy fallback); marketing runs stay ungated (decision A).
const POLICY_GATE = process.env.H1_POLICY_GATE === '1'

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
      // PR2 gate state for this run. Defaults to today's behavior ('done'); only an
      // agent-step run executed by the unified executor can flip to awaiting_approval.
      let outcome: GateOutcome = 'done'
      let outputContent: string | undefined
      let lastOutputKey: string | undefined

      if (isMarketingRun(kind)) {
        // Kod-driven marketing-workflow: dispatch på `kind` till rätt handler.
        // (Fas 1: no-op-handlers.) Drainern äger fortfarande run-statuslogiken.
        // PR2 (decision A): marketing-runs gate:as INTE — outcome förblir 'done'.
        await MARKETING_HANDLERS[kind](db, run as Run)
      } else {
        // Agent-step-workflow: kör stegen från den immutabla snapshotten (H1.P3) om
        // den finns; annars fall tillbaka på live workflows.steps (pre-P3-körningar).
        // Snapshotten gör att en workflow-edit mitt under en körning inte kan byta ut
        // ett steg och återanvända fel agents output.
        let steps = parseWorkflowSteps(run.steps_snapshot)
        if (steps.length === 0) {
          const { data: wf } = await db.from('workflows').select('steps').eq('id', run.workflow_id).single()
          steps = parseWorkflowSteps(wf?.steps)
        }
        if (UNIFIED_EXECUTOR) {
          // H1.P2: rich engine + checkpointed resume. Drain still owns status below.
          const { startFromOrder, existingContext } = await computeCheckpoint(db, run, steps)
          const execResult = await executeRunSteps(db, run.id, run.project_id, steps, {
            initialInput: (run.input ?? {}) as Record<string, string>,
            existingContext,
            startFromOrder,
            claimId: run.claim_id,   // H1.P5 Commit 2: fence per-step writes on this claim
          })
          outputContent = execResult.outputContent
          lastOutputKey = execResult.lastOutputKey
          // PR2 (decision B): the gate runs ONLY with the unified executor — no legacy
          // fallback. decideGate reads PR1's immutable per-run snapshot (runs.policy_class):
          // non_destructive → done; approval_required / NULL / unknown → awaiting_approval.
          if (POLICY_GATE) outcome = decideGate(run.policy_class)
        } else {
          // Legacy lightweight path (flag off) — unchanged behavior for rollback. Ungated.
          await runSteps(db, run.id, run.project_id, steps, (run.input ?? {}) as Record<string, string>)
        }
      }

      if (outcome === 'awaiting_approval') {
        // Idempotent approval (mirrors executeWorkflow's pattern): create only if none
        // exists for this run. `content`/`output_key` are NOT NULL in the schema → coerce.
        const { data: existingApproval } = await db
          .from('approvals').select('id').eq('run_id', run.id).limit(1).maybeSingle()
        if (!existingApproval) {
          const { error: approvalErr } = await db.from('approvals').insert({
            run_id:     run.id,
            project_id: run.project_id,
            output_key: lastOutputKey ?? 'output',
            content:    outputContent ?? '',
            status:     'pending',
            kind:       'workflow_output',
          })
          // A swallowed insert error would strand the run in awaiting_approval with NO
          // approval row — claim_runs only re-picks 'pending', so it would be unrecoverable.
          // Throw so the run requeues/fails instead (mirrors executeRunSteps' outputs insert).
          if (approvalErr) {
            throw new Error(`policy-gate: approval insert failed for run ${run.id}: ${approvalErr.message}`)
          }
          // Per-run notification (decision C: no batching/throttling in PR2). Best-effort —
          // never fails the drain. Uses run.workflow_id for a correct workflow name in the
          // email, avoiding executeWorkflow's known .eq('id', runId) lookup bug.
          try {
            const { data: wf } = await db
              .from('workflows').select('name, projects(name)').eq('id', run.workflow_id).maybeSingle()
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
            const { subject, html } = getApprovalPendingEmail({
              workflowName:  wf?.name ?? 'Okänt workflow',
              projectName:   (wf?.projects as { name?: string } | null)?.name ?? 'Okänt projekt',
              runId:         run.id,
              outputPreview: outputContent ?? '',
              platformUrl:   appUrl,
            })
            void sendAdminNotification(subject, html)
          } catch (notifyErr) {
            console.error(`[run ${run.id}] approval-pending notis misslyckades:`, notifyErr)
          }
        }
        // Flippa run SIST — approval finns alltid före markeringen. Nollar lease så reapern
        // (rör endast 'running' med utgången lease) aldrig tar i den vilande runen.
        // H1.P5 Commit 2: fenced on claim_id. If reclaimed since we claimed it, this matches
        // 0 rows → skip (the new owner re-runs and finalizes); we never double-flip.
        const { fenced } = await fencedRunUpdate(db, run.id, run.claim_id, {
          status: 'awaiting_approval', finished_at: new Date().toISOString(), claimed_at: null, lease_until: null,
        })
        if (fenced) {
          console.warn(`[run ${run.id}] fenced: reclaimed before awaiting_approval flip — skipping`)
          results.push({ run_id: run.id, status: 'fenced' })
          continue
        }
        results.push({ run_id: run.id, status: 'awaiting_approval' })
      } else {
        const { fenced } = await fencedRunUpdate(db, run.id, run.claim_id, {
          status: 'done', finished_at: new Date().toISOString(), claimed_at: null, lease_until: null,
        })
        if (fenced) {
          console.warn(`[run ${run.id}] fenced: reclaimed before done flip — skipping`)
          results.push({ run_id: run.id, status: 'fenced' })
          continue
        }
        results.push({ run_id: run.id, status: 'done' })
      }
    } catch (e) {
      // H1.P5 Commit 2: a fenced abort is NOT a failure. The executor threw because its
      // per-step write hit 0 rows (the run was reclaimed) — the new owner now owns the run.
      // Do not log an error or touch the run; just skip this zombie invocation.
      if (isFencedError(e)) {
        console.warn(`[run ${run.id}] ${(e as Error).message} — aborting zombie invocation; new owner will finalize`)
        results.push({ run_id: run.id, status: 'fenced' })
        continue
      }
      const msg = e instanceof Error ? e.message : 'Okänt fel'
      // attempts är redan inkrementerad av claim_runs → willRetry om vi inte nått taket.
      const willRetry = (run.attempts ?? 0) < (run.max_attempts ?? 3)
      const history = [
        ...(Array.isArray(run.error_history) ? run.error_history : []),
        { at: new Date().toISOString(), attempt: run.attempts, error: msg },
      ].slice(-10)
      await db.from('run_logs').insert({ run_id: run.id, role: 'system', content: `❌ ${msg}` })
      // Fence the failure flip too: if the run was reclaimed during error handling, the
      // stale failure write matches 0 rows → skip (the new owner decides the outcome).
      const { fenced } = await fencedRunUpdate(db, run.id, run.claim_id, {
        status:        willRetry ? 'pending' : 'failed',
        last_error:    msg,
        error:         willRetry ? null : msg,
        error_history: history,
        finished_at:   willRetry ? null : new Date().toISOString(),
        claimed_at:    null,
        lease_until:   null,
      })
      if (fenced) {
        console.warn(`[run ${run.id}] fenced: reclaimed before failure flip — skipping`)
        results.push({ run_id: run.id, status: 'fenced' })
        continue
      }
      results.push({ run_id: run.id, status: willRetry ? 'requeued' : 'failed', error: msg })
    }
  }

  return NextResponse.json({ ok: true, claimed: runs.length, results })
}
