/**
 * Opt-in, task-scoped model routing. This module makes NO paid calls.
 *
 * Only deterministic Anthropic pre-generation rejection/missing configuration
 * can select the governed OpenAI reserve. Unknown transport, 429/5xx, timeouts,
 * budget/stop refusals and ambiguous dispatch can never trigger a second model.
 */
import type { OpenAIGovernanceContext } from '@/lib/ai/openai-client'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'

type TextContext = Omit<OpenAIGovernanceContext, 'onFlight'> & {
  /** Actual DB-confirmed slug for a project-ID-scoped News Hunter run. */
  verifiedProjectSlug?: string
}
export type FailoverReason = 'missing_anthropic_key' | 'invalid_anthropic_key' | 'anthropic_credits_unavailable'

const isMediaProject = (ctx: TextContext) =>
  'projectSlug' in ctx.project && ctx.project.projectSlug === 'ai-media-automation'

function matchesAllowedTask(ctx: TextContext): boolean {
  if (ctx.execution.context !== 'AUTONOMOUS') return false
  if (ctx.agent === 'News Hunter' && ctx.operation === 'Analyze News') {
    if (ctx.execution.scope.kind !== 'PROJECT') return false
    const executionProject = ctx.execution.scope.project
    // Do not let another project's stop authority pay for this project's job.
    if ('projectId' in ctx.project) {
      return ctx.verifiedProjectSlug === 'ai-media-automation'
        && 'projectId' in executionProject
        && ctx.project.projectId === executionProject.projectId
    }
    return isMediaProject(ctx)
      && 'projectSlug' in executionProject
      && executionProject.projectSlug === ctx.project.projectSlug
  }
  if (ctx.agent === 'CFO Briefing' && ctx.operation === 'Morning Briefing') {
    return isMediaProject(ctx) && ctx.execution.scope.kind === 'GLOBAL_ONLY'
  }
  if (ctx.agent === 'Dream' && ctx.operation === 'Dream Analysis') {
    return 'projectId' in ctx.project
      && ctx.execution.scope.kind === 'PROJECT'
      && 'projectId' in ctx.execution.scope.project
      && ctx.project.projectId === ctx.execution.scope.project.projectId
  }
  return false
}

/** Safe decision at runtime: the feature and actual HARD spend gate must both be on. */
export function isAutomaticTextFailoverAllowed(ctx: TextContext): boolean {
  return process.env.ATLAS_TEXT_FAILOVER_ENABLED === 'true'
    && isSpendGateEnforced()
    && !!process.env.OPENAI_API_KEY?.trim()
    && matchesAllowedTask(ctx)
}

/** Only deterministic, well-formed Anthropic rejection envelopes prove no text generation. */
export function classifyAnthropicNoGeneration(error: unknown): Exclude<FailoverReason, 'missing_anthropic_key'> | null {
  const e = error as { status?: unknown; error?: { type?: unknown; error?: { type?: unknown; message?: unknown } } } | null
  if (e?.error?.type !== 'error') return null
  const provider = e.error.error
  if (e.status === 401 && provider?.type === 'authentication_error' && provider.message === 'invalid x-api-key') {
    return 'invalid_anthropic_key'
  }
  if (e.status === 400 && provider?.type === 'invalid_request_error'
    && typeof provider.message === 'string'
    && provider.message.startsWith('Your credit balance is too low to access the Anthropic API.')) {
    return 'anthropic_credits_unavailable'
  }
  return null
}

export function canRouteTextFailure(ctx: TextContext, error: unknown): FailoverReason | null {
  if (!isAutomaticTextFailoverAllowed(ctx)) return null
  return classifyAnthropicNoGeneration(error)
}
