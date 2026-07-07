/**
 * POST /api/manager
 * Central dispatcher for all Manager Agent actions.
 *
 * Actions:
 *   daily_plan   — generate (or refresh) today's operational plan
 *   chat         — ask the manager a question
 *   evaluate     — evaluate a pending approval
 *   plan_tasks   — break a goal into manager_tasks
 *   retry_run    — retry a failed workflow run
 *   update_task  — update a manager_task's status/result
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getManager } from '@/lib/ai/manager'
import { toCanonicalManagerEvaluationRecord } from '@/lib/ai/memory/stage1-foundation'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action } = body as { action: string }

  const manager = getManager()

  try {
    switch (action) {
      // ── Generate / refresh daily plan ──────────────────────────────────────
      case 'daily_plan': {
        const { project_id, force } = body as { project_id?: string; force?: boolean }
        const plan = await manager.generateDailyPlan(project_id, force ?? false)
        return NextResponse.json({ plan })
      }

      // ── Conversational chat with manager ───────────────────────────────────
      case 'chat': {
        const { message, project_id } = body as { message: string; project_id?: string }
        if (!message?.trim()) {
          return NextResponse.json({ error: 'message krävs' }, { status: 400 })
        }
        const response = await manager.chat(message, project_id)
        return NextResponse.json({ response })
      }

      // ── Evaluate a pending approval ────────────────────────────────────────
      case 'evaluate': {
        const { approval_id } = body as { approval_id: string }
        if (!approval_id) {
          return NextResponse.json({ error: 'approval_id krävs' }, { status: 400 })
        }
        // Ownership gate BEFORE the LLM call and any admin-side effect
        // (mirrors the PATCH /api/approvals/[id] gate). The Manager and this
        // route use the service-role client, which bypasses RLS, so the route
        // must enforce the same project boundary RLS gives the UI. Missing,
        // lineage-less, and foreign approvals all return the SAME 404 so an
        // authenticated caller cannot probe whether another user's approval
        // UUID exists (fail closed).
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const db = createAdminClient()
        const { data: approval } = await db
          .from('approvals')
          .select('id, project_id, content, runs(project_id)')
          .eq('id', approval_id)
          .single()

        const approvalRun = (approval as any)?.runs
        const projectId = approval?.project_id ?? (Array.isArray(approvalRun)
          ? approvalRun[0]?.project_id
          : approvalRun?.project_id)

        const allowedProjectIds = await getAllowedProjectIds(db, user.id)
        if (!approval || !projectId || !assertProjectAllowed(projectId, allowedProjectIds)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        const evaluation = await manager.evaluateOutput(approval_id)

        // Persist evaluation to the canonical Stage 1 evaluations schema.
        // projectId is guaranteed by the ownership gate above.
        await db.from('evaluations').insert(
          toCanonicalManagerEvaluationRecord(evaluation, {
            projectId,
            contentType: 'text',
            contentPreview: approval.content,
          })
        )

        return NextResponse.json({ evaluation })
      }

      // ── Plan tasks from a high-level goal ──────────────────────────────────
      case 'plan_tasks': {
        const { goal, project_id } = body as { goal: string; project_id: string }
        if (!goal?.trim() || !project_id) {
          return NextResponse.json({ error: 'goal och project_id krävs' }, { status: 400 })
        }
        const tasks = await manager.planTasks(goal, project_id)
        return NextResponse.json({ tasks })
      }

      // ── Retry a failed run ────────────────────────────────────────────────
      case 'retry_run': {
        const { run_id } = body as { run_id: string }
        if (!run_id) {
          return NextResponse.json({ error: 'run_id krävs' }, { status: 400 })
        }
        const newRunId = await manager.retryFailedRun(run_id)
        if (!newRunId) {
          return NextResponse.json({ error: 'Kunde inte starta om körningen' }, { status: 500 })
        }

        // H1.P5 Commit 2 (Z1): retryFailedRun already creates a DURABLE 'pending' run that
        // the pg_cron drain claims + executes under a lease — the same claim/fencing model
        // as every other run. The previous inline fire-and-forget loop here ran the SAME
        // run a second time WITHOUT a claim, lease, or claim_id: a live double-execution
        // and an unfenceable write-path. It was removed so ALL execution paths sit behind
        // one claim/fencing model before H1_FENCING is enabled. (Mirrors /api/runs POST,
        // which is likewise durable-only — its "same as /api/runs" comment was stale.)
        return NextResponse.json({ new_run_id: newRunId }, { status: 202 })
      }

      // ── Update a manager task ──────────────────────────────────────────────
      case 'update_task': {
        const { task_id, status, result } = body as { task_id: string; status?: string; result?: string }
        if (!task_id) {
          return NextResponse.json({ error: 'task_id krävs' }, { status: 400 })
        }
        await manager.updateTask(task_id, { status: status as any, result })
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: `Okänd action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    console.error('[/api/manager]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/manager — operational snapshot (no LLM)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const manager = getManager()
  const [tasks, messages, todaysPlan] = await Promise.allSettled([
    manager.getActiveTasks(),
    manager.getRecentMessages(20),
    manager.getTodaysPlan(),
  ])

  return NextResponse.json({
    tasks:      tasks.status      === 'fulfilled' ? tasks.value      : [],
    messages:   messages.status   === 'fulfilled' ? messages.value   : [],
    daily_plan: todaysPlan.status === 'fulfilled' ? todaysPlan.value : null,
  })
}
