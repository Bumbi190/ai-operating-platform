/**
 * lib/ai/workflow-runner.ts — kör ett workflow (sekventiella agent-steg).
 *
 * Extraherad ur /api/chat så att den kan köras ASYNKRONT i en egen invocation
 * (/api/runs/execute) — chatten ska aldrig blockeras av en workflow-körning.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { interpolate } from '@/lib/utils'
import { runStep } from '@/lib/ai/runner'
import type { WorkflowStep } from '@/lib/supabase/types'

type AdminClient = ReturnType<typeof createAdminClient>

export async function executeWorkflow(
  db: AdminClient,
  runId: string,
  projectId: string,
  steps: WorkflowStep[],
  initialInput: Record<string, string>,
) {
  const context: Record<string, string> = { ...initialInput }
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  try {
    for (const step of sortedSteps) {
      const { data: agent } = await db
        .from('agents')
        .select('id, name, system_prompt, model, config')
        .eq('id', step.agent_id)
        .single()

      if (!agent) throw new Error(`Agent hittades inte (steg "${step.name}")`)

      const userMessage = interpolate(step.input_template, context)

      await db.from('run_logs').insert({
        run_id: runId, step_order: step.order, step_name: step.name,
        role: 'user', content: userMessage,
      })

      const result = await runStep({
        systemPrompt: agent.system_prompt,
        userMessage,
        model: agent.model,
        maxTokens: (agent.config as { max_tokens?: number })?.max_tokens ?? 4000,
        temperature: (agent.config as { temperature?: number })?.temperature ?? 0.7,
      })

      await db.from('run_logs').insert({
        run_id: runId, step_order: step.order, step_name: step.name,
        role: 'assistant', content: result.content,
        tokens_in: result.tokensIn, tokens_out: result.tokensOut, duration_ms: result.durationMs,
      })

      context[step.output_key] = result.content
      await db.from('runs').update({ context }).eq('id', runId)
    }

    const lastKey = sortedSteps[sortedSteps.length - 1]?.output_key
    await db.from('outputs').insert({
      run_id: runId, project_id: projectId,
      name: `Chatt-körning — ${new Date().toLocaleDateString('sv-SE')}`,
      type: 'text',
      content: lastKey ? context[lastKey] : '',
    })

    await db.from('runs').update({
      status: 'done', finished_at: new Date().toISOString(), context,
    }).eq('id', runId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    await db.from('run_logs').insert({ run_id: runId, role: 'system', content: `❌ ${message}` })
    await db.from('runs').update({
      status: 'failed', error: message, finished_at: new Date().toISOString(),
    }).eq('id', runId)
    throw err
  }
}
