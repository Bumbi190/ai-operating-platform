import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Run } from '@/lib/supabase/types'
import { runStep } from '@/lib/ai/runner'
import { isAnthropicModel, isImageModel, isOpenAIModel } from '@/lib/ai/models'
import { fencedError } from '@/lib/ai/fencing'
import { cancelledError } from '@/lib/ai/cancel'
import { checkpointClaimedRun, settleRefusal, RunCheckpointRefusedError, RunLifecycleWriteError } from '@/lib/governance/run-execution-checkpoint'
import { projectScope } from '@/lib/governance/execution-stop'
import { composeAgentDesignSkills } from '@/lib/skills/compose-agent-skills'
import { compileWebsiteArtifact, WebsiteArtifactError } from './artifact'
import { commitBuildRevision, loadBuildSnapshot, parkBuildSession, recordBuildInterpretation, saveBuildCandidate, setBuildStage, WebsiteBuildError } from './store'
import { interpretBuildFeedback, parseWebsiteModelJson, WebsiteBuildPermanentError } from './feedback-interpretation'
import { FEEDBACK_CONTRACT, WEBSITE_OUTPUT_CONTRACT, websiteUserMessage } from './prompt'
import type { WriterRef } from './types'
export { isWebsiteBuildPermanentError } from './feedback-interpretation'
export function isWebsiteBuildRun(kind: unknown): boolean { return kind === 'website.static.build.v1' }
export async function executeWebsiteBuildRun(db: ReturnType<typeof createAdminClient>, run: Run, claimId: string): Promise<void> {
  if (!isWebsiteBuildRun(run.kind)) throw new WebsiteBuildPermanentError('INVALID_BUILD_RUN')
  const input = run.input as Record<string, unknown> | null
  if (!input || input.projectId !== run.project_id || typeof input.sessionId !== 'string' || !Number.isSafeInteger(input.generation)) throw new WebsiteBuildPermanentError('INVALID_BUILD_BINDING')
  const writer: WriterRef = { projectId: run.project_id, sessionId: input.sessionId, runId: run.id, claimId, generation: Number(input.generation) }
  const gate = async (boundary: string) => {
    const check = await checkpointClaimedRun(db, { runId: run.id, projectId: run.project_id, claimId, boundary })
    if (check.allowed) return
    const settled = await settleRefusal(db, check.refusal, run.id, claimId)
    if (settled === 'ERROR') throw new RunLifecycleWriteError(run.id, boundary, check.detail)
    if (settled === 'CANCELLED') throw cancelledError(run.id)
    if (settled === 'FENCED') throw fencedError(run.id)
    throw new RunCheckpointRefusedError('STOPPED', check.detail, boundary)
  }
  try {
    await gate('website:entry')
    if ((run.context as Record<string, unknown> | null)?.websiteBuildCompleted === true) return
    let snapshot = await loadBuildSnapshot(db, writer)
    if (snapshot.controlRequested === 'pause') { await parkBuildSession(db, writer); return }
    const { data: agent, error } = await db.from('agents').select('id,name,system_prompt,model,config,skill_ids').eq('id', snapshot.agentId).eq('project_id', writer.projectId).single()
    if (error) throw new Error('Byggagenten kunde inte läsas säkert.')
    if (!agent || isImageModel(agent.model) || !(isAnthropicModel(agent.model) || isOpenAIModel(agent.model))) throw new WebsiteBuildPermanentError('INVALID_BUILD_AGENT')
    const config = agent.config as { max_tokens?: number; temperature?: number } | null
    let knowledge: ReturnType<typeof composeAgentDesignSkills>
    try { knowledge = composeAgentDesignSkills(agent.system_prompt, ['design-taste-frontend','impeccable',...(Array.isArray(agent.skill_ids) ? agent.skill_ids.filter((id): id is string => typeof id === 'string') : [])]) }
    catch { throw new WebsiteBuildPermanentError('DESIGN_CONTEXT_TOO_LARGE') }
    const paid = async (systemPrompt: string, userMessage: string, maxTokens: number, operation: string) => {
      await gate('website:before:' + operation)
      snapshot = await loadBuildSnapshot(db, writer)
      if (snapshot.controlRequested === 'pause') { await parkBuildSession(db, writer); return null }
      const result = await runStep({ execution: { context: 'AUTONOMOUS', scope: projectScope({ projectId: writer.projectId }) }, authority: { kind: 'RUN_BOUND', runId: run.id, claimId }, runId: run.id, cost: { projectId: writer.projectId, agent: agent.name, operation }, model: agent.model, systemPrompt, userMessage, maxTokens, temperature: config?.temperature ?? 0.7 })
      // Always re-establish; also satisfies a sticky authorityRefreshRequired latch.
      await gate('website:after:' + operation)
      if(['max_tokens','model_context_window_exceeded','length'].includes(result.stopReason??''))throw new WebsiteBuildPermanentError('MODEL_OUTPUT_TRUNCATED','Byggsvaret nådde sin längdgräns innan paketet var färdigt. Ingen automatisk betald omkörning görs.')
      return result
    }
    let interpretation = snapshot.interpretation
    if (snapshot.feedback.length && !interpretation) {
      await setBuildStage(db, writer, 'interpreting')
      const result = await paid(FEEDBACK_CONTRACT, websiteUserMessage(snapshot, null), 2000, 'website.feedback.interpret')
      if (!result) return
      interpretation = interpretBuildFeedback(parseWebsiteModelJson(result.content), snapshot.feedback)
      await recordBuildInterpretation(db, writer, interpretation)
      snapshot = await loadBuildSnapshot(db, writer)
    }
    if (snapshot.controlRequested === 'pause') { await parkBuildSession(db, writer); return }
    const superseded = new Set(interpretation?.items.flatMap(item => item.supersedesFeedbackIds) ?? [])
    const effectiveItems = interpretation?.items.filter(item => !superseded.has(item.feedbackId))
    if (effectiveItems?.some(i => i.disposition === 'decision') || snapshot.previousArtifact && effectiveItems && !effectiveItems.some(i => i.disposition === 'apply')) { await parkBuildSession(db, writer); return }
    let artifact = snapshot.candidate
    if (!artifact) {
      await setBuildStage(db, writer, 'building')
      const result = await paid(knowledge.systemPrompt + '\n\n' + WEBSITE_OUTPUT_CONTRACT, websiteUserMessage(snapshot, interpretation), config?.max_tokens ?? 12000, 'website.artifact.generate')
      if (!result) return
      artifact = compileWebsiteArtifact(parseWebsiteModelJson(result.content))
      await saveBuildCandidate(db, writer, artifact)
    }
    snapshot = await loadBuildSnapshot(db, writer)
    if (snapshot.controlRequested === 'pause') { await parkBuildSession(db, writer); return }
    await setBuildStage(db, writer, 'validating')
    await gate('website:commit')
    await commitBuildRevision(db, writer, artifact)
  } catch (error) {
    if (error instanceof WebsiteArtifactError) throw new WebsiteBuildPermanentError(error.code, error.message)
    if (error instanceof WebsiteBuildError && error.code === 'FENCED') throw fencedError(run.id)
    if (error instanceof WebsiteBuildError && error.code === 'CANCELLED') { await gate('website:cancel-race'); throw cancelledError(run.id) }
    if (error instanceof WebsiteBuildError && error.code === 'CONTROL_PENDING') { await gate('website:control-race'); const snapshot = await loadBuildSnapshot(db, writer); if (snapshot.controlRequested === 'pause') { await parkBuildSession(db, writer); return } }
    throw error
  }
}
