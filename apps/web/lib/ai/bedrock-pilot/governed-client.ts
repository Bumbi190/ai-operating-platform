/**
 * Dormant, preview-only governed Amazon Nova Micro text review adapter.
 *
 * NO ROUTES IMPORT THIS MODULE. Explicit BEDROCK_GOVERNED_PILOT_ENABLED=true,
 * server-verified human consent, project scope and hard H1 spend gate are all
 * required. This is NOT an Atlas/News Hunter failover or publishing adapter.
 *
 * Every billable call is wrapped in Omnira's canonical withGovernedSpend and
 * physical STOP watcher; it never touches Remotion's AWS credentials.
 */
import 'server-only'

import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { getRates } from '@/lib/cost/rates'
import {
  withGovernedSpend, resolveGovernedProjectId,
} from '@/lib/cost/governed-spend'
import { tokenWindowCeiling } from '@/lib/cost/spend-ceiling'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'
import { logLlmCost } from '@/lib/cost/track'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  authorityForRequest, admitPhysicalRequest, watchExecutionAuthority,
  composeAbortSignals, GovernanceDispatchUnknownError,
} from '@/lib/governance/execution-signal'
import type { ExecutionContract } from '@/lib/governance/execution-stop'

import {
  BedrockPilotRefused, prepareManualEditorialReview,
  type ManualReviewRequest,
} from './manual-review-contract'
import { obtainPreviewCredentials } from './sts-credentials'

const MODEL_ID = 'amazon.nova-micro-v1:0'
const REGION = 'us-east-1'

export type GovernedBedrockReviewContext = Readonly<{
  /** Must come from an authenticated server-side human approval, never JSON. */
  operatorApprovalVerified: boolean
  projectId: string
  execution: ExecutionContract
  agent: 'Editorial QA'
  runId?: string | null
}>

export type GovernedBedrockReviewResult = Readonly<{
  text: string
  modelId: typeof MODEL_ID
  inputTokens: number
  outputTokens: number
  editorialOnly: true
  sourceReferencesFactChecked: false
}>

/**
 * Internal entry point; intentionally not wired to any API route or scheduler.
 * Callers must verify operator auth and source ownership on the server first.
 * Passing an untrusted client-controlled 'operatorApprovalVerified' is forbidden.
 */
export async function runGovernedBedrockManualReview(input: {
  ctx: GovernedBedrockReviewContext
  request: ManualReviewRequest
  /** Token from Vercel's trusted request context, not a client payload. */
  vercelOidcToken: string
}): Promise<GovernedBedrockReviewResult> {
  const { ctx, request } = input
  const scope = ctx.execution.scope
  const prepared = prepareManualEditorialReview({
    pilotEnabled: process.env.BEDROCK_GOVERNED_PILOT_ENABLED === 'true',
    environment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    hardSpendGate: isSpendGateEnforced(),
    operatorApproved: ctx.operatorApprovalVerified === true,
    operation: 'manual_editorial_quality_review',
    executionContext: ctx.execution.context,
    executionScopeKind: scope.kind,
    executionProjectId: scope.kind === 'PROJECT' && 'projectId' in scope.project
      ? scope.project.projectId : undefined,
  }, request)

  if (ctx.projectId !== request.projectId || process.env.AWS_BEDROCK_REGION !== REGION) {
    throw new BedrockPilotRefused('project_or_region_not_verified')
  }

  // AWS STS itself is non-billable here. It runs before reserving spend;
  // an AWS refusal must not create a phantom model reservation.
  const shortLivedCredentials = await obtainPreviewCredentials({
    oidcToken: input.vercelOidcToken,
    configuredRoleArn: process.env.AWS_BEDROCK_ROLE_ARN,
    configuredRegion: process.env.AWS_BEDROCK_REGION,
  })

  const rates = await getRates()
  const ceiling = tokenWindowCeiling(MODEL_ID, prepared.maxOutputTokens, rates)
  if (!ceiling.ok || ceiling.basis !== 'token_window' || ceiling.sek <= 0) {
    throw new BedrockPilotRefused('hard_ceiling_unavailable')
  }

  const execution = ctx.execution
  const authority = authorityForRequest(execution, async ref => {
    const r = await resolveGovernedProjectId(ref)
    return r.ok ? r.projectId : null
  })

  return withGovernedSpend({
    project: { projectId: prepared.projectId },
    execution,
    provider: 'aws-bedrock',
    operation: 'manual_editorial_quality_review',
    estimatedSek: ceiling.sek,
    ceilingBasis: 'token_window',
    rates,
  }, async () => {
    // No hidden retry, fallback, or default AWS credential chain.
    await admitPhysicalRequest(() => createAdminClient(), authority, 'aws-bedrock')
    const watch = watchExecutionAuthority(() => createAdminClient(), authority)
    const combined = composeAbortSignals([watch.signal, AbortSignal.timeout(7000)])
    const client = new BedrockRuntimeClient({
      region: REGION,
      credentials: shortLivedCredentials,
      maxAttempts: 1,
    })
    let result: ConverseCommandOutput
    try {
      result = await client.send(new ConverseCommand({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content: [{ text: prepared.prompt }] }],
        inferenceConfig: { maxTokens: prepared.maxOutputTokens, temperature: 0 },
      }), { abortSignal: combined.signal })
    } catch (error) {
      if (watch.abortReason) {
        throw new GovernanceDispatchUnknownError('aws-bedrock', watch.abortReason, error)
      }
      // Timeouts and unclassified service errors are MAY_HAVE_DISPATCHED.
      // withGovernedSpend settles the held hard ceiling; never auto-retry.
      throw error
    } finally {
      combined.dispose()
      watch.dispose()
      client.destroy()
    }

    const inTokens = result.usage?.inputTokens
    const outTokens = result.usage?.outputTokens
    if (!Number.isSafeInteger(inTokens) || !Number.isSafeInteger(outTokens)
        || typeof inTokens !== 'number' || typeof outTokens !== 'number'
        || inTokens < 0 || inTokens > 128000
        || outTokens < 0 || outTokens > prepared.maxOutputTokens) {
      throw new BedrockPilotRefused('provider_usage_not_verified')
    }

    // Meter inside withGovernedSpend (shared spend meter, cost_events and
    // settlement). No second standalone billing ledger and no net-credit guess.
    await logLlmCost(MODEL_ID, { tokensIn: inTokens, tokensOut: outTokens }, {
      projectId: prepared.projectId,
      operation: 'manual_editorial_quality_review',
      agent: ctx.agent,
      runId: ctx.runId ?? null,
    })

    if (watch.abortReason || watch.authorityUnavailable) {
      throw new BedrockPilotRefused('continuation_authority_unavailable')
    }
    const text = result.output?.message?.content
      ?.find(part => typeof part.text === 'string')?.text
    if (!text || !text.trim() || result.stopReason !== 'end_turn') {
      throw new BedrockPilotRefused('model_result_incomplete')
    }

    return {
      text: text.slice(0, 4000),
      modelId: MODEL_ID,
      inputTokens: inTokens,
      outputTokens: outTokens,
      editorialOnly: true,
      sourceReferencesFactChecked: false,
    }
  })
}
