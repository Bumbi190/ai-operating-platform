/**
 * Governed The Prompt independent FactCheck adapter. NOT WIRED TO ANY ROUTE.
 *
 * Disabled unless THE_PROMPT_FACTCHECK_MODEL_ENABLED=true AND H1_SPEND_GATE=1.
 * Requires an owned RUN_BOUND claim, same authoritative The Prompt execution
 * scope and a DB-verified script/project identity. One OpenAI request only,
 * no ungoverned SDK, no automatic fallback and no success-to-publish transition.
 *
 * IMPORTANT: A future caller must resolve trustedProjectId and actual
 * writerModel from the database, under the run's project ownership. Neither
 * value may come from an article, client, model, nor request JSON.
 */
import 'server-only'
import {openAIChatCompletion} from '@/lib/ai/openai-client'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'
import {MEDIA_PIPELINE_PROJECT} from '@/lib/cost/governed-spend'
import type {ExecutionContract} from '@/lib/governance/execution-stop'
import type {RunBoundAuthority} from '@/lib/governance/execution-signal'
import {contentDigest, type ScriptMaterial, type SourceSnapshot} from './contract'
import {assessReviewerAdmission} from './reviewer-admission'
import {
  evaluateIndependentReview, FACTCHECK_REVIEW_MODEL,
  FACTCHECK_REVIEW_MAX_OUTPUT_TOKENS,
  type ReviewedFinding,
} from './independent-review'

export interface GovernedFactCheckInput {
  readonly material: ScriptMaterial
  readonly sources: readonly SourceSnapshot[]
  /** Verified from the DB for the actual claimed run; NEVER client-provided. */
  readonly trustedProjectId: string
  /** Actual generation provider/model recorded at the original script run. */
  readonly writerModel: string
  readonly execution: ExecutionContract
  readonly authority: RunBoundAuthority
  readonly nowMs: number
}

function holdForReview(input: GovernedFactCheckInput, reason: string): ReviewedFinding {
  let digest = ''
  try {digest = contentDigest(input.material)} catch {/* invalid input */}
  return {
    model: FACTCHECK_REVIEW_MODEL, sourceSetSha256: '',
    assessment: null,
    decision: {outcome:'requires_review',reasons:[reason],
      contentSha256:digest,unitCount:0,reviewedSourceCount:0},
  }
}

/**
 * A future properly authorized worker can opt into this adapter, but no
 * production API imports it today. No response is an editorial authorization.
 */
export async function governedFactCheckReview(
  input: GovernedFactCheckInput,
): Promise<ReviewedFinding> {
  const verdict = assessReviewerAdmission({
    flag: process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED,
    spendGateEnforced: isSpendGateEnforced(),
    execution: input.execution,
    authority: input.authority,
    trustedProjectId: input.trustedProjectId,
    material: input.material,
  })
  if (!verdict.allowed) return holdForReview(input,verdict.reason)

  return evaluateIndependentReview(
    input.material,input.sources,input.trustedProjectId,input.writerModel,
    input.nowMs,async prompt => {
      // Single governed provider dispatch. Its spend reservation is hard (not
      // advisory), run ownership is checked by the physical admission layer.
      // Worst-case full-context cost may exceed budget and refuse: acceptable.
      const response = await openAIChatCompletion({
        execution: input.execution,
        authority: input.authority,
        project: MEDIA_PIPELINE_PROJECT,
        runId: input.authority.runId,
        scriptId: input.material.scriptId,
        operation: 'FactCheck Source Review',
        agent: 'The Prompt FactCheck',
      }, {
        model: FACTCHECK_REVIEW_MODEL,
        reasoning_effort: 'none',
        max_completion_tokens: FACTCHECK_REVIEW_MAX_OUTPUT_TOKENS,
        messages: [
          {role:'system',content:prompt.system},
          {role:'user',content:prompt.user},
        ],
      })
      const choice = response?.choices?.[0]
      if (!choice || choice.finish_reason !== 'stop' ||
          choice.message?.refusal ||
          typeof choice.message?.content !== 'string' ||
          !choice.message.content.trim()) {
        throw new Error('FACTCHECK_INCOMPLETE_MODEL_REPLY')
      }
      return choice.message.content
    },
  )
}
