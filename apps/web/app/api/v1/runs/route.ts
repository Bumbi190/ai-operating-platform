/**
 * POST /api/v1/runs — Trigger a workflow run
 * GET  /api/v1/runs — List recent runs
 *
 * Auth: Authorization: Bearer <AIOPS_API_KEY>
 *
 * POST body:
 * {
 *   "workflow_id": "uuid",
 *   "input": { "tema": "havet", "ålder": "6–9 år" }
 * }
 *
 * POST response (202):
 * { "run_id": "uuid", "status": "running" }
 */

import { NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { interpolate } from '@/lib/utils'
import { runStep } from '@/lib/ai/runner'
import type { WorkflowStep } from '@/lib/supabase/types'

export async function GET(request: Request) {
  const auth = requireApiKey(request)
  if (!auth.ok) return auth.response

  const db = createAdminClient()
  const url = new URL(request.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '10')

  const { data: runs, error } = await db
    .from('runs')
    .select('id, status, created_at, started_at, finished_at, input, context, error, workflows(name), projects(name, slug)')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (runs ?? []).map((r) => {
      const workflow = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects
      const duration =
        r.started_at && r.finished_at
          ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
          : null
      return {
        id: r.id,
        status: r.status,
        workflow_name: workflow?.name ?? null,
        project_slug: project?.slug ?? null,
        input: r.input,
        duration_seconds: duration,
        created_at: r.created_at,
      }
    }),
  )
}

export async function POST(request: Request) {
  const auth = requireApiKey(request)
  if (!auth.ok) return auth.response

  const db = createAdminClient()
  const body = await request.json()
  const { workflow_id, input = {} } = body as {
    workflow_id: string
    input: Record<string, string>
  }

  if (!workflow_id) {
    return NextResponse.json({ error: 'workflow_id krävs' }, { status: 400 })
  }

  const { data: workflow } = await db
    .from('workflows')
    .select('id, project_id, name, steps')
    .eq('id', workflow_id)
    .single()

  if (!workflow) {
    return NextResponse.json({ error: 'Workflow hittades inte' }, { status: 404 })
  }

  const { data: run, error: runErr } = await db
    .from('runs')
    .insert({
      workflow_id: workflow.id,
      project_id: workflow.project_id,
      status: 'running',
      input,
      context: {},
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: 'Kunde inte skapa körning' }, { status: 500 })
  }

  // Kick off async execution
  void executeWorkflow(db, run.id, workflow.project_id, (workflow.steps as WorkflowStep[]) ?? [], input)

  return NextResponse.json({ run_id: run.id, status: 'running' }, { status: 202 })
}

// ─────────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Bygger memory-kontext som injiceras i agentens system_prompt.
 * Dream-insikter (key: dream_*) separeras från vanliga projektminnen
 * för tydlighet och prioritering.
 */
async function buildMemoryContext(db: AdminClient, projectId: string): Promise<string> {
  const { data: memories } = await db
    .from('memories')
    .select('key, value')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(30)

  if (!memories || memories.length === 0) return ''

  const dreamInsights = memories.filter(m => m.key.startsWith('dream_'))
  const regularMemories = memories.filter(m => !m.key.startsWith('dream_'))

  const parts: string[] = []

  if (regularMemories.length > 0) {
    parts.push(`\nProjektminne:\n${regularMemories.map(m => `${m.key}: ${m.value}`).join('\n')}`)
  }

  if (dreamInsights.length > 0) {
    parts.push(`\nInsikter från tidigare körningar:\n${dreamInsights.map(m => `• ${m.value}`).join('\n')}`)
  }

  return parts.join('')
}

async function executeWorkflow(
  db: AdminClient,
  runId: string,
  projectId: string,
  steps: WorkflowStep[],
  initialInput: Record<string, string>,
) {
  const context: Record<string, string> = { ...initialInput }
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  // Hämta projektminnen en gång per körning — delas av alla steg
  const memoryContext = await buildMemoryContext(db, projectId)

  try {
    for (const step of sortedSteps) {
      const { data: agent } = await db
        .from('agents')
        .select('id, name, system_prompt, model, config')
        .eq('id', step.agent_id)
        .single()

      if (!agent) throw new Error(`Agent hittades inte (steg "${step.name}")`)

      const userMessage = interpolate(step.input_template, context)

      // Injicera projektminnen och dream-insikter i system_prompt
      const enrichedSystemPrompt = memoryContext
        ? `${agent.system_prompt}${memoryContext}`
        : agent.system_prompt

      await db.from('run_logs').insert({
        run_id: runId,
        step_order: step.order,
        step_name: step.name,
        role: 'user',
        content: userMessage,
      })

      const result = await runStep({
        systemPrompt: enrichedSystemPrompt,
        userMessage,
        model: agent.model,
        maxTokens: (agent.config as { max_tokens?: number })?.max_tokens ?? 4000,
        temperature: (agent.config as { temperature?: number })?.temperature ?? 0.7,
        runId,
      })

      await db.from('run_logs').insert({
        run_id: runId,
        step_order: step.order,
        step_name: step.name,
        role: 'assistant',
        content: result.content,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        duration_ms: result.durationMs,
      })

      context[step.output_key] = result.content
      await db.from('runs').update({ context }).eq('id', runId)
    }

    const lastKey = sortedSteps[sortedSteps.length - 1]?.output_key
    const outputContent = lastKey ? context[lastKey] : JSON.stringify(context)

    await db.from('outputs').insert({
      run_id: runId,
      project_id: projectId,
      name: `Körning — ${new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      type: 'text',
      content: outputContent ?? '',
    })

    await db.from('runs').update({
      status: 'done',
      finished_at: new Date().toISOString(),
      context,
    }).eq('id', runId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    await db.from('run_logs').insert({ run_id: runId, role: 'system', content: `❌ ${message}` })
    await db.from('runs').update({
      status: 'failed',
      error: message,
      finished_at: new Date().toISOString(),
    }).eq('id', runId)
  }
}
