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
 *
 * Chapter 21 bounded handoff (EI-S1.4C) — none of these execute anything:
 *   prepare_delegation — cut a bounded envelope from an exact Mission version
 *   decide_delegation  — the Manager runs the §21.16 checks and records the
 *                        outcome. There is NO `accepted` parameter: a caller
 *                        asks for a decision, it never supplies one.
 *   read_delegation    — is this envelope usable right now (live Mission)
 *   revoke_delegation  — Executive withdraws an envelope
 *   replan_delegation  — classify a Manager-side change (§21.20–§21.26)
 *
 * Chapter 21 §21.9 Work Packages (EI-S1.4D) — none of these execute anything:
 *   prepare_work_package — validate a bounded decomposition, persist nothing
 *   assign_work_package  — assign to a Workforce role. §21.42 "assigned" means
 *                          RECEIVED; no run, no queue, no tool call. There is NO
 *                          `assigned`/`authority` parameter: the accepted parent
 *                          Delegation decides what may be persisted.
 *   read_work_package    — is this package usable right now
 *
 * `project_id` is never accepted for these: the project comes from the Mission
 * → Delegation authority chain, so a caller cannot widen scope by asking.
 *
 * Every delegation action authenticates as a human through the same session
 * gate as the rest of this route. CRON_SECRET is not accepted anywhere here and
 * is not user authorization: a shared machine secret cannot stand in for a
 * principal whose project ownership bounds the act.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getManager } from '@/lib/ai/manager'
import { toCanonicalManagerEvaluationRecord } from '@/lib/ai/memory/stage1-foundation'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'
import { createAdminClient } from '@/lib/supabase/admin'
import { prepareDelegation, revokeDelegation, type DelegationWriteResult } from '@/lib/atlas/delegation/principal-write'
import type { DelegationNarrowing } from '@/lib/atlas/delegation/attenuate'
import type { DelegationRevocationReason } from '@/lib/atlas/delegation/types'
import type { ProposedChange } from '@/lib/atlas/delegation/classify'
import type { WorkPackageRequest } from '@/lib/atlas/workpackage/attenuate'
import type { WorkPackageWriteResult } from '@/lib/atlas/workpackage/principal-write'
import { GLOBAL_ONLY, projectScope } from '@/lib/governance/execution-stop'

/**
 * Map a Work Package boundary status to HTTP without inventing detail.
 *
 * `not_permitted` covers both "no such package" and "one you may not see", and
 * both must render as the SAME 404.
 */
function workPackageResponse(result: WorkPackageWriteResult): NextResponse {
  const body = {
    status: result.status,
    work_package: result.workPackage,
    ...(result.taskId ? { task_id: result.taskId } : {}),
    ...(result.detail ? { detail: result.detail } : {}),
    ...(result.violations ? { violations: result.violations } : {}),
    ...(result.rejections ? { rejections: result.rejections } : {}),
  }
  const code =
    result.status === 'ok' ? 200 :
    result.status === 'no_principal' ? 401 :
    result.status === 'not_permitted' ? 404 :
    result.status === 'project_denied' ? 403 :
    result.status === 'invalid_request' ? 400 :
    result.status === 'conflict' ? 409 :
    result.status === 'unavailable' ? 503 :
    422
  return NextResponse.json(body, { status: code })
}

/**
 * Map a delegation boundary status to HTTP without inventing detail.
 *
 * `not_permitted` covers both "no such envelope" and "an envelope you may not
 * see", and both must render as the SAME 404 — splitting them would turn this
 * route into an existence oracle for other tenants' identifiers.
 */
function delegationResponse(result: DelegationWriteResult): NextResponse {
  const body = {
    status: result.status,
    state: result.state,
    ...(result.detail ? { detail: result.detail } : {}),
    ...(result.violations ? { violations: result.violations } : {}),
    ...(result.rejections ? { rejections: result.rejections } : {}),
    ...(result.replan ? { replan: result.replan } : {}),
  }
  const code =
    result.status === 'ok' ? 200 :
    result.status === 'no_principal' ? 401 :
    result.status === 'not_permitted' ? 404 :
    result.status === 'project_denied' ? 403 :
    result.status === 'invalid_request' ? 400 :
    result.status === 'conflict' ? 409 :
    result.status === 'unavailable' ? 503 :
    // Every remaining status is a refusal the caller could in principle fix by
    // changing the Mission or the envelope, not a server fault.
    422
  return NextResponse.json(body, { status: code })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action } = body as { action: string }

  const manager = getManager()

  // ISOLATION (C-1): the Manager runs on the service-role client (RLS-bypassing),
  // so each action must enforce the same project boundary RLS gives the UI. The
  // allow-list mirrors `projects.owner_id = auth.uid()`; an empty list denies all.
  const adminDb = createAdminClient()
  const allowedProjectIds = await getAllowedProjectIds(adminDb, user.id)

  try {
    switch (action) {
      // ── Generate / refresh daily plan ──────────────────────────────────────
      case 'daily_plan': {
        const { project_id, force } = body as { project_id?: string; force?: boolean }
        // A specified project must be owned; unspecified stays global (cron/owner use).
        if (project_id && !assertProjectAllowed(project_id, allowedProjectIds)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        const plan = await manager.generateDailyPlan({ context: 'OPERATOR_EXECUTION' as const, scope: GLOBAL_ONLY }, project_id, force ?? false)
        return NextResponse.json({ plan })
      }

      // ── Conversational chat with manager ───────────────────────────────────
      case 'chat': {
        const { message, project_id } = body as { message: string; project_id?: string }
        if (!message?.trim()) {
          return NextResponse.json({ error: 'message krävs' }, { status: 400 })
        }
        // Scope exactly like /api/chat: a raw project_id is only honored if owned,
        // and the manager's context reads are bounded by allowedProjectIds.
        const scopedProjectId = assertProjectAllowed(project_id, allowedProjectIds) ? project_id : undefined
        const response = await manager.chat(message, { context: 'OPERATOR_EXECUTION' as const, scope: GLOBAL_ONLY }, scopedProjectId, allowedProjectIds)
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

        const evaluation = await manager.evaluateOutput(approval_id, { context: 'OPERATOR_EXECUTION' as const, scope: GLOBAL_ONLY })

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
        // ISOLATION (C-1): only plan tasks into a project the caller owns.
        if (!assertProjectAllowed(project_id, allowedProjectIds)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        const tasks = await manager.planTasks(goal, project_id, { context: 'OPERATOR_EXECUTION' as const, scope: GLOBAL_ONLY })
        return NextResponse.json({ tasks })
      }

      // ── Retry a failed run ────────────────────────────────────────────────
      case 'retry_run': {
        const { run_id } = body as { run_id: string }
        if (!run_id) {
          return NextResponse.json({ error: 'run_id krävs' }, { status: 400 })
        }
        // ISOLATION (C-1): retryFailedRun enforces no ownership internally — the run
        // must belong to one of the caller's projects. Missing/foreign both 404.
        const { data: runRow } = await adminDb.from('runs').select('project_id').eq('id', run_id).single()
        if (!runRow || !assertProjectAllowed(runRow.project_id, allowedProjectIds)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
        // ISOLATION (C-1): updateTask enforces no ownership internally — the task
        // must belong to one of the caller's projects. Missing/foreign both 404.
        const { data: taskRow } = await adminDb.from('manager_tasks').select('project_id').eq('id', task_id).single()
        if (!taskRow || !assertProjectAllowed(taskRow.project_id, allowedProjectIds)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        await manager.updateTask(task_id, { status: status as any, result })
        return NextResponse.json({ ok: true })
      }

      // ── Chapter 21 bounded handoff ────────────────────────────────────────
      //
      // Project isolation for these is enforced inside the delegation boundary
      // itself, from the MISSION's and the ENVELOPE's own recorded project —
      // never from a caller-supplied project_id, which is why none of them
      // accepts one.

      case 'prepare_delegation': {
        const { mission_id, narrowing, note } = body as {
          mission_id?: string; narrowing?: DelegationNarrowing; note?: string
        }
        if (!mission_id) {
          return NextResponse.json({ error: 'mission_id krävs' }, { status: 400 })
        }
        return delegationResponse(await prepareDelegation({ missionId: mission_id, narrowing, note }))
      }

      case 'decide_delegation': {
        const { envelope_id, note } = body as { envelope_id?: string; note?: string }
        if (!envelope_id) {
          return NextResponse.json({ error: 'envelope_id krävs' }, { status: 400 })
        }
        // Note what is NOT read from the body: any acceptance flag. The Manager
        // decides from the §21.16 checks (§21.16 — acceptance is earned, not
        // asserted), so a hostile caller has nothing here to lie with.
        return delegationResponse(await manager.decideDelegation(envelope_id, note))
      }

      case 'read_delegation': {
        const { envelope_id } = body as { envelope_id?: string }
        if (!envelope_id) {
          return NextResponse.json({ error: 'envelope_id krävs' }, { status: 400 })
        }
        const { evaluation, status } = await manager.readDelegation(envelope_id)
        if (status === 'no_principal') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (status !== 'ok' || !evaluation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        return NextResponse.json({ evaluation })
      }

      case 'revoke_delegation': {
        const { envelope_id, reason, note } = body as {
          envelope_id?: string; reason?: DelegationRevocationReason; note?: string
        }
        if (!envelope_id || !reason) {
          return NextResponse.json({ error: 'envelope_id och reason krävs' }, { status: 400 })
        }
        return delegationResponse(await revokeDelegation({ envelopeId: envelope_id, reason, note }))
      }

      case 'replan_delegation': {
        const { envelope_id, change } = body as { envelope_id?: string; change?: ProposedChange }
        if (!envelope_id || !change?.summary) {
          return NextResponse.json({ error: 'envelope_id och change.summary krävs' }, { status: 400 })
        }
        return delegationResponse(await manager.replanDelegation(envelope_id, change))
      }

      // ── Chapter 21 §21.9 Work Packages ───────────────────────────────────
      //
      // Project isolation is enforced inside the boundary from the DELEGATION's
      // own recorded project — never from a caller-supplied project_id, which
      // is why none of these accepts one.

      case 'prepare_work_package': {
        const { envelope_id, request } = body as { envelope_id?: string; request?: WorkPackageRequest }
        if (!envelope_id || !request?.taskObjective || !request?.role?.roleId) {
          return NextResponse.json(
            { error: 'envelope_id, request.taskObjective och request.role.roleId krävs' }, { status: 400 })
        }
        return workPackageResponse(await manager.prepareWorkPackage(envelope_id, request))
      }

      case 'assign_work_package': {
        const { envelope_id, request, title } = body as {
          envelope_id?: string; request?: WorkPackageRequest; title?: string
        }
        if (!envelope_id || !request?.taskObjective || !request?.role?.roleId) {
          return NextResponse.json(
            { error: 'envelope_id, request.taskObjective och request.role.roleId krävs' }, { status: 400 })
        }
        // Note what is NOT read from the body: any assigned/authority flag.
        // §21.42 — assignment is earned from the parent Delegation, not asserted.
        return workPackageResponse(await manager.assignWorkPackage(envelope_id, request, title))
      }

      case 'read_work_package': {
        const { work_package_id } = body as { work_package_id?: string }
        if (!work_package_id) {
          return NextResponse.json({ error: 'work_package_id krävs' }, { status: 400 })
        }
        const { evaluation, status } = await manager.readWorkPackage(work_package_id)
        if (status === 'no_principal') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (status !== 'ok' || !evaluation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        return NextResponse.json({ evaluation })
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
