/**
 * workflow-executor.ts
 *
 * Delad körningsmotor för workflows — används av både:
 *   POST /api/runs         (ny körning från steg 1)
 *   POST /api/runs/[id]/resume  (fortsätt från krashat steg)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { interpolate } from '@/lib/utils'
import { runStep } from '@/lib/ai/runner'
import { validateStepOutput } from '@/lib/ai/validators/output-validator'
import { mergeRunContext } from '@/lib/ai/checkpoint'
import { isDuplicateOutputError } from '@/lib/ai/output-idempotency'
import { fencedRunUpdate, fencedError } from '@/lib/ai/fencing'
import { cancelledError } from '@/lib/ai/cancel'
import {
  checkpointClaimedRun, settleRefusal, RunLifecycleWriteError,
  RunCheckpointRefusedError,
} from '@/lib/governance/run-execution-checkpoint'
import type { WorkflowStep } from '@/lib/supabase/types'
import { projectScope } from '@/lib/governance/execution-stop'

export type AdminClient = ReturnType<typeof createAdminClient>
// Supabase-klienten saknar genererade DB-typer — vi castar internt till any
type AnyDb = any

export interface ExecuteWorkflowOptions {
  /** Startvärden i context (användarinput). Slås ihop med existingContext. */
  initialInput?: Record<string, string>
  /**
   * Befintlig context från en tidigare körning (används vid resume).
   * Alla keys här behandlas som redan klara — steget körs inte om.
   */
  existingContext?: Record<string, string>
  /**
   * Stega med order >= startFromOrder körs (0 = kör alla).
   * Sätt till den misslyckade stepens order vid resume.
   */
  startFromOrder?: number
  /**
   * H1.P5 Commit 2: the claim_id this invocation was handed by claim_runs. When set
   * (drain path) and H1_FENCING is on, the per-step context write is fenced on it —
   * a reclaimed (zombie) invocation's write hits 0 rows and the run ABORTS. Absent
   * (legacy manual path that runs without a claim) → writes are unconditional.
   */
  claimId?: string
}

/**
 * executeRunSteps — THE single step-running core (H1.P2).
 *
 * Runs the workflow's steps with validation (+1 retry), image quality gate,
 * run_logs, per-step context persistence, cost logging, and the final output row.
 * Skips already-completed steps via `startFromOrder`/`existingContext`.
 *
 * Contract: THROWS on failure. Does NOT set runs.status and does NOT create
 * approvals — the caller owns lifecycle. The durable drainer (/api/runs/drain) owns
 * status; it is the sole caller (H1.P5 Commit 4 removed the legacy executeWorkflow wrapper).
 */
export async function executeRunSteps(
  db: AdminClient | AnyDb,
  runId: string,
  projectId: string,
  steps: WorkflowStep[],
  options: ExecuteWorkflowOptions = {},
): Promise<{ outputContent: string; lastOutputKey: string | undefined; context: Record<string, string> }> {
  const { initialInput = {}, existingContext = {}, startFromOrder = 0, claimId } = options

  // Initial input is the base; completed step outputs win on collision so a resume
  // never lets the original input clobber a persisted step output (Codex review #8).
  const context: Record<string, string> = mergeRunContext(initialInput, existingContext)

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
  // Alias med any-typ — Supabase-klienten saknar genererade DB-typer i detta projekt
  const anyDb: AnyDb = db
  // Hoppa över steg som redan körts
  const pendingSteps = sortedSteps.filter(s => s.order >= startFromOrder)

  if (pendingSteps.length < sortedSteps.length) {
    const skipped = sortedSteps.length - pendingSteps.length
    console.log(`[run ${runId}] Resume: hoppar över ${skipped} redan klara steg, kör ${pendingSteps.length} kvarvarande`)
    await anyDb.from('run_logs').insert({
      run_id: runId,
      role: 'system',
      content: `▶️ Återupptar körning från steg ${startFromOrder} — ${skipped} steg återanvänds från föregående körning.`,
    })
  }

  // Spara förväntade bildantal per output_key — används i kvalitetskontrollen nedan.
  // #5 (H1.P2): seeda förväntade bildantal för ALLA steg i förväg (inte bara de som
  // körs denna tick). Vid resume hoppas redan klara bildsteg över; utan detta skulle
  // kvalitetsgrinden döma ett skippat max_images=1-steg mot FALLBACK_MAX (t.ex. 16)
  // och underkänna en redan giltig körning. Read-only; förstakörningens värden är
  // identiska med de loop:en nedan annars sätter.
  const trackedMaxImages: Record<string, number> = {}
  {
    const agentIds = [...new Set(sortedSteps.map(s => s.agent_id))]
    if (agentIds.length > 0) {
      const { data: agentCfgs, error: agentCfgErr } = await db.from('agents').select('id, config').in('id', agentIds)
      // #5 (H1.P2): mirror computeCheckpoint — a transient read failure must NOT be
      // swallowed. Empty trackedMaxImages would falsely fail a resumed max_images=1
      // image step against FALLBACK_MAX. Throw so the drain marks the run pending and
      // retries the tick instead of judging against the wrong limits.
      if (agentCfgErr) {
        throw new Error(`executeRunSteps: agent config hydration failed for run ${runId}: ${agentCfgErr.message}`)
      }
      const cfgById = new Map(((agentCfgs ?? []) as { id: string; config: unknown }[]).map(a => [a.id, a.config]))
      for (const s of sortedSteps) {
        const mi = (cfgById.get(s.agent_id) as { max_images?: number } | null)?.max_images
        if (mi != null) trackedMaxImages[s.output_key] = mi
      }
    }
  }

  // NOTE: no try/catch here — failures propagate to the caller, which owns status.
  {
    for (const step of pendingSteps) {
      // ── G3C-3A · CANONICAL POST-CLAIM CHECKPOINT ───────────────────────────
      // Fresh truth before EVERY step, not once at claim.
      //
      // G3C-3B removed the H1.P5 cooperative branch that used to sit here. It
      // was inert only because H1_CANCEL is unset: enabling that flag would have
      // let it PREEMPT this checkpoint and, through fencedRunUpdate, collapse a
      // failed lifecycle write back into FENCED — reviving exactly the taxonomy
      // this slice replaced. Its behaviour is wholly subsumed below, which reads
      // ownership, cancellation AND stop authority and settles through
      // settleRefusal.
      //
      // Complementary to G3C-1, never a replacement. That boundary answers "may
      // this exact paid packet leave now?"; this one answers "may this owned run
      // begin another step at all?". A step also does unpaid work — agent loads,
      // interpolation, log writes, storage — and none of it should start after a
      // stop has committed.
      const gate = await checkpointClaimedRun(anyDb, {
        runId, projectId, claimId, boundary: `unified:step:${step.order}`,
      })
      if (!gate.allowed) {
        // G3C-3B: the checkpoint's verdict is a DECISION; what the lifecycle
        // write actually achieved may differ. A cancel committing between the
        // two turns a STOPPED refusal into a real cancellation (R9), and a
        // database fault is neither. Settle first, then report the truth.
        const boundary = `unified:step:${step.order}`
        const settled = await settleRefusal(anyDb, gate.refusal, runId, claimId)
        if (settled === 'ERROR') throw new RunLifecycleWriteError(runId, boundary, gate.detail)
        if (settled === 'CANCELLED') throw cancelledError(runId)
        if (settled === 'FENCED') throw fencedError(runId)
        // STOPPED — back to the queue, owned. NOT failed: a stop is not a defect
        // and the caller must not record one.
        throw new RunCheckpointRefusedError('STOPPED', gate.detail, boundary)
      }

      // Ladda agenten
      const { data: agent, error: agentErr } = await db
        .from('agents')
        .select('id, name, system_prompt, model, config')
        .eq('id', step.agent_id)
        .single()

      if (agentErr || !agent) {
        throw new Error(`Agent "${step.agent_id}" hittades inte (steg "${step.name}")`)
      }

      // Interpolera {{variabler}} med nuvarande context
      const userMessage = interpolate(step.input_template, context)

      // ── Logga: user message ──────────────────────────────────────────────
      await anyDb.from('run_logs').insert({
        run_id: runId,
        step_order: step.order,
        step_name: step.name,
        role: 'user',
        content: userMessage,
      })

      // ── Anropa LLM (med validering + en retry) ───────────────────────────
      const stepConfig = agent.config as { max_tokens?: number; temperature?: number; max_images?: number } | null

      // Spåra max_images för detta steg (används i kvalitetskontrollen)
      if (stepConfig?.max_images != null) {
        trackedMaxImages[step.output_key] = stepConfig.max_images
      }

      /**
       * Re-establishes canonical authority before an execution-bearing
       * continuation, and settles through the one canonical mapping if refused.
       *
       * G3C-3C-A · D2. Two continuation points need this — the validation retry
       * and the authoritative context write — and a second copy of the refusal
       * mapping is how the drain and this executor once grew rival cancel
       * branches. One routine, one mapping.
       */
      const reestablishAuthority = async (boundary: string): Promise<void> => {
        const gate = await checkpointClaimedRun(anyDb, { runId, projectId, claimId, boundary })
        if (gate.allowed) return
        const settled = await settleRefusal(anyDb, gate.refusal, runId, claimId)
        if (settled === 'ERROR') throw new RunLifecycleWriteError(runId, boundary, gate.detail)
        if (settled === 'CANCELLED') throw cancelledError(runId)
        if (settled === 'FENCED') throw fencedError(runId)
        throw new RunCheckpointRefusedError('STOPPED', gate.detail, boundary)
      }

      let result = await runStep({
        // AUTONOMOUS: the executor runs under the drain/scheduler, never a
        // human, and its scope is the instance's own project.
        execution: { context: 'AUTONOMOUS', scope: projectScope({ projectId }) },
        systemPrompt: agent.system_prompt,
        userMessage,
        model: agent.model,
        maxTokens: stepConfig?.max_tokens ?? 4000,
        temperature: stepConfig?.temperature ?? 0.7,
        maxImages: stepConfig?.max_images,
        runId,
        // G3C-3C-A: the executor is one of the few places that holds BOTH the
        // run and its claim, so it can hand the provider boundary real
        // ownership. Without a claimId this stays absent and the call runs
        // exactly as before — a runId alone is cost attribution, not authority.
        ...(claimId ? { authority: { kind: 'RUN_BOUND' as const, runId, claimId } } : {}),
        cost: { projectId, agent: agent.name, operation: step.name },
      })

      // ── Validera output ──────────────────────────────────────────────────
      const validation = validateStepOutput(step.output_key, result.content)

      if (!validation.valid) {
        await anyDb.from('run_logs').insert({
          run_id: runId,
          step_order: step.order,
          step_name: step.name,
          role: 'system',
          content: `⚠️ Valideringsfel (${step.output_key}): ${validation.issues.join('; ')} — försöker igen...`,
        })

        console.warn(`[run ${runId}] ⚠️ Step "${step.name}" validation failed — retrying`)

        const correctedMessage = validation.correctionHint
          ? `${userMessage}\n\n---\n${validation.correctionHint}`
          : userMessage

        // ── G3C-3C-A · CONTINUATION REQUIRES FRESH AUTHORITY ────────────────
        // The first attempt may have flown while authority became unreadable.
        // Its result is kept — but a SECOND physical request is a new
        // execution-bearing unit, so canonical authority must be re-established
        // first. The checkpoint refuses if it still cannot read, and that
        // refusal settles through the one canonical mapping.
        await reestablishAuthority(`unified:step:${step.order}:validation-retry`)

        result = await runStep({
          execution: {
            context: 'AUTONOMOUS',
            scope: projectScope({ projectId }),
          },
          systemPrompt: agent.system_prompt,
          userMessage: correctedMessage,
          model: agent.model,
          maxTokens: stepConfig?.max_tokens ?? 4000,
          temperature: Math.max(0.3, (stepConfig?.temperature ?? 0.7) - 0.2),
          // #4 (H1.P2): the retry MUST carry the same image cap as the first attempt.
          // Without this, runner.ts falls back to 16 (saga) / 5 (default) and a
          // max_images=1 preview run can silently explode cost/runtime on a retry.
          maxImages: stepConfig?.max_images,
          runId,
          // ── G3C-3C-A · THE RETRY IS ALSO EXECUTION-BEARING ──────────────────
          // It was dropping the authority descriptor, so the second physical
          // request ran with no in-flight watcher at all — a cancel landing
          // between the two attempts could not stop the one that mattered.
          ...(claimId ? { authority: { kind: 'RUN_BOUND' as const, runId, claimId } } : {}),
          cost: { projectId, agent: agent.name, operation: step.name },
        })

        const retryValidation = validateStepOutput(step.output_key, result.content)
        if (!retryValidation.valid) {
          await anyDb.from('run_logs').insert({
            run_id: runId,
            step_order: step.order,
            step_name: step.name,
            role: 'system',
            content: `❌ Valideringsfel kvarstår efter retry (${step.output_key}): ${retryValidation.issues.join('; ')} — fortsätter ändå`,
          })
        } else {
          await anyDb.from('run_logs').insert({
            run_id: runId,
            step_order: step.order,
            step_name: step.name,
            role: 'system',
            content: `✅ Retry lyckades — output godkänd`,
          })
        }
      }

      // ── Logga: assistant-svar ────────────────────────────────────────────
      await anyDb.from('run_logs').insert({
        run_id: runId,
        step_order: step.order,
        step_name: step.name,
        role: 'assistant',
        content: result.content,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        duration_ms: result.durationMs,
      })

      // ── G3C-3C-A · D2 · LATCHED UNAVAILABLE ⇒ RE-ESTABLISH BEFORE WRITING ──
      // The provider answered and `result.content` is kept — a successful
      // response is never turned into a failure. But authority went unreadable
      // while that request was in flight, so there is a window nobody observed,
      // and a cancellation could have become durable inside it. Persisting
      // context and moving to the next step are execution-bearing acts; both
      // wait until canonical authority says this worker still owns the run.
      //
      // Conditional on the latch, deliberately: an unconditional re-check would
      // add a round trip to every step to answer a question nothing raised.
      if (result.authorityRefreshRequired) {
        console.warn(`[run ${runId}] step "${step.name}": authority was unreadable in flight — re-establishing before continuation`)
        await reestablishAuthority(`unified:step:${step.order}:post-flight-reestablish`)
      }

      // Ackumulera output i context
      context[step.output_key] = result.content

      // Spara context till DB direkt — SSE-streamen och resume använder detta.
      // H1.P5 Commit 2: fenced on claim_id (when H1_FENCING on + claimId present). If the
      // run was reclaimed mid-execution (token rotated by the reaper), this write matches
      // 0 rows → ABORT the zombie invocation before any further LLM cost/writes.
      const { fenced } = await fencedRunUpdate(anyDb, runId, claimId, { context })
      if (fenced) throw fencedError(runId)
    }

    // ── Alla steg klara — kvalitetskontroll ──────────────────────────────
    // Krav: nästan alla förväntade bilder måste ha genererats.
    // En körning som inte uppfyller kraven markeras som MISSLYCKAD direkt —
    // ingen "Fortsätt körning" erbjuds, för att undvika onödiga API-kostnader.
    const qualityErrors: string[] = []

    // Beräkna minsta godkänd bildmängd per output_key.
    // Om agent.config.max_images sattes (t.ex. 1 i preview-körningar) används det.
    // Annars faller vi tillbaka på hårdkodade standardvärden för fullständiga körningar.
    // Formel: ceil(max * 0.875) — ger 14/16, 5/5 och 1/1 för preview.
    const FALLBACK_MAX: Record<string, number> = {
      sagabilder:       16,
      bilder:            5,
      aktivitetsbilder:  5,
      pysselbilder:      1,
      omslagsbilder:     2,
    }

    function requiredFor(outputKey: string): number | undefined {
      const max = trackedMaxImages[outputKey] ?? FALLBACK_MAX[outputKey]
      if (max == null) return undefined
      return Math.max(1, Math.ceil(max * 0.875))
    }

    for (const step of sortedSteps) {
      const value = context[step.output_key]
      if (!value || value.length === 0) continue

      try {
        const parsed = JSON.parse(value)
        if (!parsed || typeof parsed !== 'object') continue
        if (!('urls' in parsed) && !('errors' in parsed)) continue

        const urlCount   = (parsed.urls   as string[] | undefined)?.length ?? 0
        const errorCount = (parsed.errors as string[] | undefined)?.length ?? 0

        if (urlCount === 0) {
          qualityErrors.push(`❌ "${step.name}": 0 bilder genererades — steget misslyckades helt.`)
          continue
        }

        const required = requiredFor(step.output_key)
        if (required && urlCount < required) {
          qualityErrors.push(
            `❌ "${step.name}": ${urlCount} bilder genererades, kräver minst ${required}. (${errorCount} misslyckades)`
          )
        }
      } catch { /* textbaserat steg — hoppa */ }
    }

    if (qualityErrors.length > 0) {
      const errorSummary = [
        `🚫 KÖRNING UNDERKÄND — bildkvalitetskraven uppfylldes inte.\n`,
        ...qualityErrors,
        `\nFör att spara kostnader: rätta till orsaken och starta en NY körning istället för att återuppta.`,
      ].join('\n')

      await anyDb.from('run_logs').insert({ run_id: runId, role: 'system', content: errorSummary })
      throw new Error(`Bildkvalitetskrav ej uppfyllda: ${qualityErrors.join(' | ')}`)
    }

    console.log(`[run ${runId}] ✅ Kvalitetskontroll godkänd`)

    // ── Spara output-post ────────────────────────────────────────────────
    const lastOutputKey = sortedSteps[sortedSteps.length - 1]?.output_key
    const outputContent = lastOutputKey ? context[lastOutputKey] : JSON.stringify(context)
    let outputType: 'text' | 'json' = 'text'
    if (outputContent) {
      try { JSON.parse(outputContent); outputType = 'json' } catch { /* text */ }
    }

    // #1 (H1.P2 → H1.P5 Commit 1): idempotent finalization, now DB-ENFORCED via the partial
    // unique index on outputs(run_id). A re-entered run (reaper re-claim AFTER the deliverable
    // was already written) cannot create a duplicate: we insert and treat a unique violation
    // (SQLSTATE 23505) as the idempotent no-op — no read-then-write race window remains.
    const { error: outputInsertErr } = await anyDb.from('outputs').insert({
      run_id: runId,
      project_id: projectId,
      name: `Körning — ${new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      type: outputType,
      content: outputContent ?? '',
    })
    // 23505 → output already exists for this run (idempotent re-entry), fine. Any OTHER
    // error must NOT be swallowed: throw so the run retries instead of finalizing empty.
    if (outputInsertErr && !isDuplicateOutputError(outputInsertErr)) {
      throw new Error(`finalization: outputs insert failed for run ${runId}: ${outputInsertErr.message}`)
    }

    return { outputContent: outputContent ?? '', lastOutputKey, context }
  }
}
