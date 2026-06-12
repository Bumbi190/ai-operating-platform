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

        // Kick off background execution (same as /api/runs POST)
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const db = createAdminClient()
        const { data: newRun } = await db
          .from('runs')
          .select('workflow_id, project_id, input, id')
          .eq('id', newRunId)
          .single()

        if (newRun?.workflow_id) {
          const { interpolate } = await import('@/lib/utils')
          const { runStep } = await import('@/lib/ai/runner')
          const { data: workflow } = await db
            .from('workflows')
            .select('steps')
            .eq('id', newRun.workflow_id)
            .single()

          if (workflow?.steps) {
            // Fire and forget — mirrors /api/runs logic
            void (async () => {
              const steps = (workflow.steps as any[]).sort((a, b) => a.order - b.order)
              const context: Record<string, string> = { ...(newRun.input ?? {}) }
              try {
                for (const step of steps) {
                  const { data: agent } = await db.from('agents').select('*').eq('id', step.agent_id).single()
                  if (!agent) continue
                  const userMessage = interpolate(step.input_template, context)
                  const result = await runStep({ systemPrompt: agent.system_prompt, userMessage, model: agent.model })
                  await db.from('run_logs').insert({ run_id: newRunId, step_order: step.order, step_name: step.name, role: 'assistant', content: result.content, tokens_in: result.tokensIn, tokens_out: result.tokensOut })
                  context[step.output_key] = result.content
                  await db.from('runs').update({ context }).eq('id', newRunId)
                }
                await db.from('runs').update({ status: 'done', finished_at: new Date().toISOString(), context }).eq('id', newRunId)
              } catch (err) {
                await db.from('runs').update({ status: 'failed', error: String(err), finished_at: new Date().toISOString() }).eq('id', newRunId)
              }
            })()
          }
        }

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
