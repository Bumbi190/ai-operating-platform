/**
 * lib/ai/workflow-runner.ts — kör ett workflows sekventiella agent-steg.
 *
 * `runSteps` kör stegen (run_logs + context + output) och KASTAR vid fel — men
 * sätter INTE run-status. Run-livscykeln (running → done/failed/retry) ägs av den
 * durable drainern (/api/runs/drain), så status alltid speglar verkligheten.
 *
 * `executeWorkflow` är en tunn wrapper som sätter done/failed — kvar för
 * bakåtkompatibilitet (t.ex. manuell /api/runs/execute).
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { interpolate } from '@/lib/utils'
import { runStep } from '@/lib/ai/runner'
import { isDuplicateOutputError } from '@/lib/ai/output-idempotency'
import type { WorkflowStep } from '@/lib/supabase/types'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Kör alla steg. Skriver run_logs, context (per steg) och slutlig output.
 * KASTAR vid fel. Sätter INTE runs.status (det gör anroparen).
 */
export async function runSteps(
  db: AdminClient,
  runId: string,
  projectId: string,
  steps: WorkflowStep[],
  initialInput: Record<string, string>,
): Promise<void> {
  const context: Record<string, string> = { ...initialInput }
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

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
  const { error: outputInsertErr } = await db.from('outputs').insert({
    run_id: runId, project_id: projectId,
    name: `Körning — ${new Date().toLocaleDateString('sv-SE')}`,
    type: 'text',
    content: lastKey ? context[lastKey] : '',
  })
  // H1.P5: 23505 = output already exists for this run (idempotent re-entry). Any other
  // error must surface so the run retries rather than finalizing with no deliverable.
  if (outputInsertErr && !isDuplicateOutputError(outputInsertErr)) {
    throw new Error(`outputs insert failed for run ${runId}: ${outputInsertErr.message}`)
  }
}

/**
 * Bakåtkompatibel wrapper: kör steg + sätt done/failed. Används av manuell körning.
 * Den durable drainern använder `runSteps` direkt och äger statuslogiken.
 */
export async function executeWorkflow(
  db: AdminClient,
  runId: string,
  projectId: string,
  steps: WorkflowStep[],
  initialInput: Record<string, string>,
): Promise<void> {
  try {
    await runSteps(db, runId, projectId, steps, initialInput)
    await db.from('runs').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', runId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    await db.from('run_logs').insert({ run_id: runId, role: 'system', content: `❌ ${message}` })
    await db.from('runs').update({ status: 'failed', error: message, finished_at: new Date().toISOString() }).eq('id', runId)
    throw err
  }
}
