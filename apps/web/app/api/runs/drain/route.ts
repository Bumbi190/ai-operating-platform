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
import { isCancelEnabled, isCancelledError } from '@/lib/ai/cancel'
import { MARKETING_HANDLERS, isMarketingRun } from '@/lib/marketing/workflows'
import {
  checkpointClaimedRun, releaseStoppedRun, terminalizeCancelledRun,
  isRunCheckpointRefusal, checkOwnedFinalization, finalizeOwnedRunUnlessCancelled,
} from '@/lib/governance/run-execution-checkpoint'
import type { Run } from '@/lib/supabase/types'
import { parseWorkflowSteps } from '@/lib/supabase/json'
import { sendAdminNotification } from '@/lib/email/brevo'
import { getApprovalPendingEmail } from '@/lib/email/templates'
import { recordMemoryEvent } from '@/lib/atlas/memory/record-event'
import { executeWorkflowAction, isWorkflowActionRun } from '@/lib/workflows/action-executor'

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
      // H1.P5 Commit 3: if cancel was requested before/at claim, cancel directly and run
      // no steps. Gated by H1_CANCEL; fenced on claim_id like every terminal write.
      if (isCancelEnabled() && run.cancel_requested) {
        const { fenced } = await fencedRunUpdate(db, run.id, run.claim_id, {
          status: 'cancelled', finished_at: new Date().toISOString(), claimed_at: null, lease_until: null,
        })
        // Atlas Memory M4 Commit 4 — episodic outcome: cancelled before steps ran.
        // Emit only after fenced=false confirms this executor owns the terminal write.
        // run.kind used directly — `kind` const is declared after this block.
        if (!fenced) {
          void recordMemoryEvent({
            scope: 'project', eventType: 'outcome', projectId: run.project_id,
            entityKind: 'run', entityId: run.id, source: 'drain', sourceId: run.id,
            subject: 'Run outcome: cancelled',
            content: `Run ${run.id.slice(0, 8)} cancelled (kind: ${run.kind ?? 'unknown'})`,
            confidence: 0.40,
            structured: { runId: run.id, kind: run.kind ?? null, status: 'cancelled', attempts: run.attempts ?? 1, error: null },
          }, db)
        }
        results.push({ run_id: run.id, status: fenced ? 'fenced' : 'cancelled' })
        continue
      }

      // ── G3C-3A · CANONICAL POST-CLAIM CHECKPOINT ───────────────────────────
      // G3C-2A guarantees nothing NEW is claimed after a pause commits. This run
      // was claimed BEFORE it, possibly seconds before. Deliberately placed here:
      // after the claim, before ANY family dispatches, so one boundary covers
      // workflow actions, marketing and agent steps rather than three separate
      // ones drifting apart.
      const entry = await checkpointClaimedRun(db, {
        runId: run.id, projectId: run.project_id, claimId: run.claim_id,
        boundary: 'drain:entry',
      })
      if (!entry.allowed) {
        if (entry.refusal === 'FENCED') {
          // Another owner holds this run. Touch nothing — not even to record a
          // failure against it.
          results.push({ run_id: run.id, status: 'fenced', detail: entry.detail })
          continue
        }
        if (entry.refusal === 'CANCELLED') {
          const { fenced } = await terminalizeCancelledRun(db, run.id, run.claim_id)
          results.push({
            run_id: run.id, status: fenced ? 'fenced' : 'cancelled', detail: entry.detail,
          })
          continue
        }
        // STOPPED — not a failure. Back to the queue with no error, no alert and
        // no backoff. claim_runs refuses to re-claim it while the stop stands,
        // which is exactly what bounds this to one cycle per stop event.
        const { fenced } = await releaseStoppedRun(db, run.id, run.claim_id)
        results.push({
          run_id: run.id, status: fenced ? 'fenced' : 'deferred_by_stop',
          reason: entry.reason, detail: entry.detail,
        })
        continue
      }

      // ── PR9e: bound workflow actions take a separate, closed path ─────────
      // Deliberately BEFORE any agent-step or marketing handling: a workflow
      // action must never reach an LLM step, and legacy runs must never reach
      // the action executor. `workflow_instance_id` is the discriminator, and
      // it is null on all 1251 legacy runs, so their path is untouched.
      if (isWorkflowActionRun(run)) {
        const result = await executeWorkflowAction(db, run, run.claim_id, new Date().toISOString())
        // The executor owns this run's terminal write (fenced on claim_id), so
        // the drain records the outcome and moves on — it must not also flip
        // status, which would overwrite what the executor just decided.
        results.push({
          run_id: run.id, status: result.executed ? 'action_executed' : 'action_refused',
          action: result.detail,
        })
        continue
      }

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
          await runSteps(db, run.id, run.project_id, steps, (run.input ?? {}) as Record<string, string>, run.claim_id)
        }
      }

      // ── G3C-3A · FINAL OWNED CANCELLATION BOUNDARY ─────────────────────────
      // The per-step checkpoint cannot see a cancellation that commits WHILE the
      // last unit is in flight: the last check already said yes, the unit
      // returned, and there is no next step. Without this the worker writes
      // `done` over a cancellation that landed seconds ago, and the cancel
      // route's `enforced: true` would be false advertising.
      //
      // Ownership and cancellation ONLY — deliberately not governance stop. The
      // work is already finished; refusing to record it would not undo the
      // effect. It would discard honest bookkeeping and push the run back to
      // `pending`, where a later resume could execute it a SECOND time.
      const fin = await checkOwnedFinalization(db, run.id, run.claim_id)
      if (fin === 'FENCED') {
        console.warn(`[run ${run.id}] fenced at finalization — another owner holds it`)
        results.push({ run_id: run.id, status: 'fenced' })
        continue
      }
      if (fin === 'CANCELLED') {
        // Cancel wins: terminalize as cancelled, never as done. The execution
        // result is not erased — it simply is not reported as success.
        const { fenced } = await terminalizeCancelledRun(db, run.id, run.claim_id)
        console.warn(`[run ${run.id}] cancelled at finalization — not marked done`)
        results.push({ run_id: run.id, status: fenced ? 'fenced' : 'cancelled' })
        continue
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
        // G3C-3A: the SAME atomic CAS as `done`. awaiting_approval is a
        // success-like transition out of `running`, so leaving it on the old
        // read-then-write shape would keep the TOCTOU alive on this branch only.
        const appr = await finalizeOwnedRunUnlessCancelled(db, run.id, run.claim_id, {
          status: 'awaiting_approval', finished_at: new Date().toISOString(), claimed_at: null, lease_until: null,
        })
        if (appr.outcome === 'CANCELLED') {
          // The approval row was inserted BEFORE this transition, so a
          // cancellation winning here would strand a `pending` approval on a
          // `cancelled` run — contradicting /api/runs/[id]/cancel, which returns
          // a pending approval when it cancels an awaiting_approval run. Mirror
          // that contract rather than leaving the inconsistency.
          await db.from('approvals')
            .update({ status: 'returned', reviewed_at: new Date().toISOString() })
            .eq('run_id', run.id).eq('status', 'pending')
          console.warn(`[run ${run.id}] cancelled at finalization — approval returned`)
          results.push({ run_id: run.id, status: 'cancelled', detail: appr.detail })
          continue
        }
        if (appr.outcome !== 'SUCCEEDED') {
          console.warn(`[run ${run.id}] ${appr.outcome} before awaiting_approval flip: ${appr.detail}`)
          results.push({ run_id: run.id, status: appr.outcome.toLowerCase(), detail: appr.detail })
          continue
        }
        results.push({ run_id: run.id, status: 'awaiting_approval' })
      } else {
        // ── G3C-3A · ATOMIC TERMINAL CAS ────────────────────────────────────
        // The cancellation condition is part of the SAME conditional write that
        // commits success. A pre-read cannot close this: a cancellation landing
        // between the read and the write would still lose, because the old
        // predicates (id, status, claim_id) all still matched. Postgres decides
        // the order at the row.
        const done = await finalizeOwnedRunUnlessCancelled(db, run.id, run.claim_id, {
          status: 'done', finished_at: new Date().toISOString(), claimed_at: null, lease_until: null,
        })
        if (done.outcome === 'CANCELLED') {
          console.warn(`[run ${run.id}] cancelled inside the finalization window — not marked done`)
          results.push({ run_id: run.id, status: 'cancelled', detail: done.detail })
          continue
        }
        if (done.outcome !== 'SUCCEEDED') {
          // FENCED or ERROR — lifecycle contention, never a provider failure:
          // no failure counter, no alert, no retry backoff.
          console.warn(`[run ${run.id}] ${done.outcome} before done flip: ${done.detail}`)
          results.push({ run_id: run.id, status: done.outcome.toLowerCase(), detail: done.detail })
          continue
        }
        // Atlas Memory M4 Commit 4 — episodic outcome: run completed successfully.
        // Emitted after fenced=false confirms ownership. Non-blocking void side-channel.
        void recordMemoryEvent({
          scope: 'project', eventType: 'outcome', projectId: run.project_id,
          entityKind: 'run', entityId: run.id, source: 'drain', sourceId: run.id,
          subject: 'Run outcome: done',
          content: `Run ${run.id.slice(0, 8)} completed (kind: ${kind ?? 'unknown'})`,
          confidence: 0.65,
          structured: { runId: run.id, kind: kind ?? null, status: 'done', attempts: run.attempts ?? 1, error: null },
        }, db)
        results.push({ run_id: run.id, status: 'done' })
      }
    } catch (e) {
      // ── G3C-3A · control flow, NOT failure ──────────────────────────────────
      // Placed FIRST, ahead of every failure path below. A governance stop, a
      // cancellation and a lost claim are three different non-failures, and none
      // may increment a failure counter, write an error, schedule a retry backoff
      // or raise a provider alert. The executors already performed the owned
      // lifecycle write (release / terminalize / nothing at all) before throwing,
      // so there is deliberately nothing to write here.
      if (isRunCheckpointRefusal(e)) {
        const status = e.refusal === 'STOPPED' ? 'deferred_by_stop'
          : e.refusal === 'CANCELLED' ? 'cancelled' : 'fenced'
        console.warn(`[run ${run.id}] ${e.boundary}: ${e.refusal} — not a failure`)
        results.push({ run_id: run.id, status, detail: e.message })
        continue
      }

      // H1.P5 Commit 3: a cooperative cancel is NOT a failure. The executor already wrote
      // status='cancelled' (fenced) before throwing — do not touch the run or mark failed;
      // just skip its terminal write (which would otherwise overwrite 'cancelled').
      if (isCancelledError(e)) {
        console.warn(`[run ${run.id}] cooperative cancel at step boundary — run cancelled`)
        // Atlas Memory M4 Commit 4 — episodic outcome: cancelled at step boundary.
        // The executor already wrote status='cancelled' (fenced) before throwing CancelledError,
        // so this executor owns the terminal write. No fenced check needed here.
        void recordMemoryEvent({
          scope: 'project', eventType: 'outcome', projectId: run.project_id,
          entityKind: 'run', entityId: run.id, source: 'drain', sourceId: run.id,
          subject: 'Run outcome: cancelled',
          content: `Run ${run.id.slice(0, 8)} cancelled at step boundary (kind: ${run.kind ?? 'unknown'})`,
          confidence: 0.40,
          structured: { runId: run.id, kind: run.kind ?? null, status: 'cancelled', attempts: run.attempts ?? 1, error: null },
        }, db)
        results.push({ run_id: run.id, status: 'cancelled' })
        continue
      }
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
      // Atlas Memory M4 Commit 4 — episodic outcome: terminal failure only (not retries).
      // willRetry runs are non-terminal — the run continues; emit would be premature.
      // Emitted after fenced=false confirms this executor owns the failure write.
      if (!willRetry) {
        void recordMemoryEvent({
          scope: 'project', eventType: 'outcome', projectId: run.project_id,
          entityKind: 'run', entityId: run.id, source: 'drain', sourceId: run.id,
          subject: 'Run outcome: failed',
          content: `Run ${run.id.slice(0, 8)} failed: ${msg.slice(0, 200)} (kind: ${run.kind ?? 'unknown'})`,
          confidence: 0.35,
          structured: { runId: run.id, kind: run.kind ?? null, status: 'failed', attempts: run.attempts ?? 1, error: msg.slice(0, 300) },
        }, db)
      }
      results.push({ run_id: run.id, status: willRetry ? 'requeued' : 'failed', error: msg })
    }
  }

  return NextResponse.json({ ok: true, claimed: runs.length, results })
}
