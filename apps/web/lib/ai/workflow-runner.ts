/**
 * lib/ai/workflow-runner.ts — kör ett workflows sekventiella agent-steg.
 *
 * `runSteps` kör stegen (run_logs + context + output) och KASTAR vid fel — men
 * sätter INTE run-status. Run-livscykeln (running → done/failed/retry) ägs av den
 * durable drainern (/api/runs/drain), så status alltid speglar verkligheten.
 *
 * Behålls som flag-off-fallback (H1_UNIFIED_EXECUTOR=0) för drainern.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { interpolate } from '@/lib/utils'
import { runStep } from '@/lib/ai/runner'
import {
  checkpointClaimedRun, settleRefusal, RunLifecycleWriteError,
  RunCheckpointRefusedError,
} from '@/lib/governance/run-execution-checkpoint'
import { isDuplicateOutputError } from '@/lib/ai/output-idempotency'
import type { WorkflowStep } from '@/lib/supabase/types'
import { projectScope } from '@/lib/governance/execution-stop'

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
  /**
   * G3C-3A: the token this invocation was handed by claim_runs.
   *
   * Previously absent entirely, which meant this path could not tell whether it
   * still owned the run it was writing to. Optional so the non-drain callers
   * that legitimately have no claim keep compiling — but the checkpoint refuses
   * when it is missing, so "no claim" never becomes "permission".
   */
  claimId?: string | null,
): Promise<void> {
  const context: Record<string, string> = { ...initialInput }
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  for (const step of sortedSteps) {
    // ── G3C-3A · CANONICAL POST-CLAIM CHECKPOINT ──────────────────────────────
    // The same checkpoint the unified executor uses. This path already carried
    // the G3C-1 provider contract below (AUTONOMOUS + the run's project), so
    // PAID calls were never ungoverned — what it lacked was ownership, explicit
    // cancellation, and a fresh governance decision covering the UNPAID work a
    // step also performs: agent loads, interpolation, log writes, context
    // persistence.
    const gate = await checkpointClaimedRun(db, {
      runId, projectId, claimId, boundary: `legacy:step:${step.order}`,
    })
    if (!gate.allowed) {
      // G3C-3B: this used to discard the lifecycle result and rethrow the
      // ORIGINAL refusal, so a fenced or failed cancellation write was reported
      // as successful cancellation control flow. Report what actually happened.
      const boundary = `legacy:step:${step.order}`
      const settled = await settleRefusal(db, gate.refusal, runId, claimId)
      if (settled === 'ERROR') throw new RunLifecycleWriteError(runId, boundary, gate.detail)
      throw new RunCheckpointRefusedError(settled, gate.detail, boundary)
    }

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
      // AUTONOMOUS: the legacy runner is reached from the drain, never a human.
      execution: { context: 'AUTONOMOUS', scope: projectScope({ projectId }) },
      systemPrompt: agent.system_prompt,
      userMessage,
      model: agent.model,
      // G3C-3C-A: in-flight authority when this invocation actually owns the run.
      ...(claimId ? { authority: { kind: 'RUN_BOUND' as const, runId, claimId } } : {}),
      maxTokens: (agent.config as { max_tokens?: number })?.max_tokens ?? 4000,
      temperature: (agent.config as { temperature?: number })?.temperature ?? 0.7,
    })

    await db.from('run_logs').insert({
      run_id: runId, step_order: step.order, step_name: step.name,
      role: 'assistant', content: result.content,
      tokens_in: result.tokensIn, tokens_out: result.tokensOut, duration_ms: result.durationMs,
    })

    // ── G3C-3C-A · D2 · LATCHED UNAVAILABLE ⇒ RE-ESTABLISH ──────────────────
    // Same rule as the unified executor. The rollback path must not be the
    // weaker one: if flag-off execution could persist context and start the
    // next step after an unobserved authority window, turning the flag off
    // would turn the guarantee off with it.
    //
    // The provider's answer is kept either way — `result.content` is already
    // written to run_logs above, and a successful response is never converted
    // into a failure. What waits is the AUTHORITATIVE write below.
    if (result.authorityRefreshRequired) {
      const boundary = `legacy:step:${step.order}:post-flight-reestablish`
      console.warn(`[run ${runId}] step "${step.name}": authority was unreadable in flight — re-establishing before continuation`)
      const fresh = await checkpointClaimedRun(db, { runId, projectId, claimId, boundary })
      if (!fresh.allowed) {
        const settled = await settleRefusal(db, fresh.refusal, runId, claimId)
        if (settled === 'ERROR') throw new RunLifecycleWriteError(runId, boundary, fresh.detail)
        throw new RunCheckpointRefusedError(settled, fresh.detail, boundary)
      }
    }

    context[step.output_key] = result.content
    // G3C-3A: ownership-conditioned. This was an unconditional authoritative
    // write — a worker that had already lost its claim would happily overwrite
    // the new owner's context. Narrow fix: the same predicate the other fenced
    // writes use, applied only when this invocation actually holds a claim, so
    // the legitimate no-claim callers keep their existing behaviour rather than
    // silently losing their context writes.
    if (claimId) {
      await db.from('runs').update({ context })
        .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    } else {
      await db.from('runs').update({ context }).eq('id', runId)
    }
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
