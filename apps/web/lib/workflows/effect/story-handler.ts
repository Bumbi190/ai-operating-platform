/**
 * lib/workflows/effect/story-handler.ts — the governed effect that writes one
 * month's saga.
 *
 * ── EVERYTHING IT NEEDS, IT DERIVES ─────────────────────────────────────────
 * The month comes from the instance key, the requirements from the definition
 * pinned to the instance, and the brief from `composeMonthlyBrief` over that
 * same canonical contract. Nothing is read from a payload, so there is no input
 * through which a caller could steer which month is written, which rules apply,
 * or which brief the result claims to satisfy.
 *
 * ── IT DOES NOT OWN A SPEND WRAPPER ─────────────────────────────────────────
 * `getAnthropic` already reserves and settles through `withGovernedSpend`,
 * pricing the call from the exact params it is about to send. Wrapping it again
 * here would take a SECOND reservation for one intent — the defect Phase 2B-2.6
 * closed. What makes that inner reservation belong to this run is the
 * `idempotencyKey` travelling into the governance context; the adapter is
 * therefore the `trusted_adapter` boundary the registry declares, and this
 * handler's job is to hand it the right identity and then prove it did.
 *
 * Likewise absent: any judgement about whether a failure was billed. The client
 * raises `ProviderNotDispatchedError` from its own classifier and the boundary
 * releases on it. A second opinion here could contradict the one that already
 * moved the money.
 */

import { ProviderNotDispatchedError } from '@/lib/cost/governed-spend'
import { findVendoredDefinition } from '../definitions'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '../brief/compose'
import { anthropicStoryProvider, STORY_MODEL } from '../story/anthropic-provider'
import { buildStoryPromptContract, computeStoryPromptHash, STORY_PROMPT_CONTRACT_VERSION }
  from '../story/prompt'
import { normalizeStoryResponse } from '../story/provider'
import { readStoryRequirements } from '../story/requirements'
import { persistStory } from '../story/store'
import { computeStoryContentHash } from '../story/hash'
import { validateStory } from '../story/validate'
import { StoryShapeError } from '../story/types'
import type { EffectHandler, EffectHandlerOutput } from './effect-handler'

/**
 * The one check this action answers.
 *
 * `story_structurally_valid` is a SEPARATE declared check and is deliberately
 * not claimed here: `recordEvidence` binds an automated row to the single check
 * its run's action kind answers, so one run can only ever speak to one fact.
 * The validator still runs below and its verdict is recorded in this row's
 * detail — but as evidence ABOUT the generation, never as the other check.
 */
export const GENERATE_MONTHLY_STORY_CHECK = 'story_generated'

/** Nothing was sent. Shared by every refusal that precedes the provider call. */
function refused(detail: string, errorKind: string): EffectHandlerOutput {
  return {
    observation: 'not_dispatched',
    provablyNotApplied: true,
    remoteOperationId: null,
    detail,
    checkKey: GENERATE_MONTHLY_STORY_CHECK,
    evidenceDetail: { error_kind: errorKind },
  }
}

export const generateMonthlyStoryHandler: EffectHandler = async input => {
  // ── 1. The pinned contract ────────────────────────────────────────────────
  const vendored = findVendoredDefinition(input.defKey, input.defVersion)
  if (vendored === null) {
    return refused(
      `no vendored definition for ${input.defKey} v${input.defVersion}`,
      'definition_not_vendored')
  }
  const canonical = vendored.spec.canonical

  // ── 2. The brief, and the identity the story binds to ────────────────────
  // Derived, not stored. A story that claims a brief hash nobody can recompute
  // is a story bound to nothing.
  let briefHash: string
  let brief: ReturnType<typeof composeMonthlyBrief>
  let requirements: ReturnType<typeof readStoryRequirements>
  try {
    brief = composeMonthlyBrief(canonical, input.instanceKey, {
      defKey: input.defKey, defVersion: input.defVersion,
    })
    briefHash = computeMonthlyBriefHash(brief)
    requirements = readStoryRequirements(canonical)
  } catch (e) {
    // A contract that cannot produce coherent requirements must not reach a
    // paid provider. Refused before dispatch, so nothing is owed.
    return refused(
      `the pinned contract does not yield story requirements: ${(e as Error).message}`,
      'requirements_unavailable')
  }

  // ── 3. What is asked, from the frozen contracts only ─────────────────────
  const promptContract = buildStoryPromptContract({
    brief,
    storyContractVersion: requirements.storyContractVersion,
    characterRefs: requirements.characterRefs,
    maxContentSentences: requirements.maxContentSentences,
    targetSentencesMin: requirements.targetSentencesMin,
    targetSentencesMax: requirements.targetSentencesMax,
  })
  const promptHash = computeStoryPromptHash(promptContract)

  // Common to every row this handler writes, so a reader can always tell which
  // month, which brief and which question produced the outcome.
  const base = {
    month_key: input.instanceKey,
    brief_hash: briefHash,
    prompt_hash: promptHash,
    prompt_contract_version: STORY_PROMPT_CONTRACT_VERSION,
    story_contract_version: requirements.storyContractVersion,
    provider: 'anthropic',
    model: STORY_MODEL,
  }

  // ── 4. One dispatch ──────────────────────────────────────────────────────
  // The reservation happens inside this call, under `input.idempotencyKey`.
  // Set at the instant a request may leave the machine. Without it, a refusing
  // G3C-3A checkpoint — or a missing credential — would be caught below and
  // reported as a lost response: an AMBIGUITY requiring human reconciliation,
  // and a claimed reservation, for a call that provably never happened.
  let mayHaveDispatched = false
  const provider = anthropicStoryProvider({
    projectId: input.projectId,
    execution: input.execution,
    idempotencyKey: input.idempotencyKey,
    runId: input.runId,
    onDispatch: () => { mayHaveDispatched = true },
  })

  let raw: unknown
  try {
    raw = await provider.generate(promptContract, input.beforeDispatch)
  } catch (e) {
    if (!mayHaveDispatched) {
      // Nothing was sent: a stop committed, or the client refused to build.
      // Reported positively so the boundary releases and no reconciliation is
      // opened for an act that did not occur.
      return {
        observation: 'not_dispatched',
        provablyNotApplied: true,
        remoteOperationId: null,
        detail: `nothing was dispatched: ${(e as Error).message}`,
        checkKey: GENERATE_MONTHLY_STORY_CHECK,
        evidenceDetail: { ...base, error_kind: 'halted_before_dispatch' },
      }
    }
    if (e instanceof ProviderNotDispatchedError) {
      // The client proved this never reached inference and released its own
      // reservation. Nothing happened and nothing is owed.
      return {
        observation: 'not_dispatched',
        provablyNotApplied: true,
        remoteOperationId: null,
        detail: `anthropic did not dispatch: ${e.message}`,
        checkKey: GENERATE_MONTHLY_STORY_CHECK,
        evidenceDetail: { ...base, error_kind: 'provider_not_dispatched', released: true },
      }
    }
    // Anything else may have been billed and may have produced text we never
    // saw. That is ambiguity, and PR9d forbids resolving it by guessing.
    return {
      observation: 'response_lost',
      provablyNotApplied: false,
      remoteOperationId: null,
      detail: `the story dispatch did not return an answer: ${(e as Error).message}`,
      checkKey: GENERATE_MONTHLY_STORY_CHECK,
      spendReservedUnderKey: input.idempotencyKey,
      evidenceDetail: { ...base, error_kind: 'response_lost' },
    }
  }

  // ── 5. Is it a story ─────────────────────────────────────────────────────
  // Bound locally: the instance, the month, the brief hash, the contract version
  // and the character refs are re-imposed, never taken from the response.
  let story: ReturnType<typeof normalizeStoryResponse>
  try {
    story = normalizeStoryResponse(raw, {
      workflowInstanceId: input.instanceId,
      monthKey: input.instanceKey,
      briefHash,
      storyContractVersion: requirements.storyContractVersion,
      characterRefs: requirements.characterRefs,
    })
  } catch (e) {
    // The call completed and was billed, and no story exists. Reported as an
    // answered failure rather than an ambiguity, because we know exactly what
    // happened: the provider replied, and its reply was not a saga. FINANCIAL
    // policy allows one attempt, so this does not retry itself.
    const kind = e instanceof StoryShapeError ? e.reason : 'unreadable_response'
    return {
      observation: 'remote_rejected',
      provablyNotApplied: false,
      remoteOperationId: null,
      detail: `the provider answered, but the answer was not a story (${kind})`,
      checkKey: GENERATE_MONTHLY_STORY_CHECK,
      spendReservedUnderKey: input.idempotencyKey,
      evidenceDetail: { ...base, error_kind: kind, story_persisted: false },
    }
  }

  const contentHash = computeStoryContentHash(story)

  // ── 6. The immutable revision ────────────────────────────────────────────
  // Persisted before it is judged. What we paid for is recorded whether or not
  // it turns out to satisfy the rules; discarding a bad revision would erase the
  // only evidence of what the money bought.
  let created: boolean
  try {
    const stored = await persistStory(input.db, {
      story,
      provider: provider.provider,
      model: provider.model,
      promptContractVersion: STORY_PROMPT_CONTRACT_VERSION,
      runId: input.runId,
    })
    created = stored.created
  } catch (e) {
    // Generated, billed, and our own record failed. Distinct from every other
    // outcome: the world moved and the audit did not.
    return {
      observation: 'confirmed_evidence_failed',
      provablyNotApplied: false,
      remoteOperationId: contentHash,
      detail: `a story was generated but could not be stored: ${(e as Error).message}`,
      checkKey: GENERATE_MONTHLY_STORY_CHECK,
      spendReservedUnderKey: input.idempotencyKey,
      evidenceDetail: { ...base, story_content_hash: contentHash, error_kind: 'persist_failed' },
    }
  }

  // ── 7. The verdict, recorded but not claimed ─────────────────────────────
  // Checked against the EXACT brief this story was generated for, never against
  // whatever the contract says by the time someone reads the row.
  const verdict = validateStory(story, {
    brief, briefHash, maxContentSentences: requirements.maxContentSentences,
  }, contentHash)

  return {
    observation: 'remote_confirmed',
    provablyNotApplied: false,
    // The content hash IS the remote operation's identity here: it names exactly
    // what came back, and a reconciler can find the row by it.
    remoteOperationId: contentHash,
    detail:
      `story "${story.title}" for ${input.instanceKey} — ${story.pages.length} pages, `
      + `${contentHash} (${created ? 'new revision' : 'identical revision already stored'}; `
      + `structurally ${verdict.valid ? 'valid' : 'INVALID'})`,
    checkKey: GENERATE_MONTHLY_STORY_CHECK,
    // The ownership claim the executor verifies against this run's identity.
    spendReservedUnderKey: input.idempotencyKey,
    evidenceDetail: {
      ...base,
      story_content_hash: contentHash,
      story_page_count: story.pages.length,
      story_revision_created: created,
      // The validator's verdict, as detail. `story_structurally_valid` is a
      // different check and is NOT satisfied by this row.
      validator_version: verdict.validatorVersion,
      structurally_valid: verdict.valid,
      validation_failures: verdict.failures.map(f => f.code).join(',') || 'none',
      attempt_group: input.attemptGroup,
      idempotency_key: input.idempotencyKey,
    },
  }
}
