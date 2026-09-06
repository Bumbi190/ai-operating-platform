/**
 * lib/workflows/handlers/validate-monthly-story.ts — the producer for
 * `story_structurally_valid`.
 *
 * ── WHY THIS IS A SEPARATE ACTION ───────────────────────────────────────────
 * `generate_monthly_story` cannot also answer this check. `recordEvidence`
 * binds an automated row to the ONE check `checkAnsweredBy` maps its action kind
 * to, and `action-executor.ts` is the only permitted writer. That 1:1 rule is
 * what stops an action from vouching for a fact it did not establish, so the
 * answer is a second action rather than a weakened rule.
 *
 * It also happens to be the honest split. Generation is an irreversible,
 * billable act; validation is a pure re-reading of what that act produced.
 * Nothing here calls a provider, spends, mutates, approves or repairs — it
 * fetches one exact story and reports whether it satisfies rules that were
 * already written down.
 *
 * ── WHAT IT MAY CLAIM ───────────────────────────────────────────────────────
 * Only what the canonical validator computes: structure, counts, roles,
 * numbering, the sentence bound, and the brief/contract binding. It says
 * nothing about whether the Swedish is good, whether a three-year-old would
 * enjoy it, or whether Nova sounds like Nova. Those are an Editor's to judge,
 * and `story_content_approved` is attested-only precisely so automation cannot
 * drift into answering them.
 */

import { findVendoredDefinition } from '../definitions'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '../brief/compose'
import { readStoryRequirements } from '../story/requirements'
import { storyMatchesTarget } from '../story/generated-target'
import { validateStory } from '../story/validate'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput } from './types'

/** The declared check this action answers. Exactly one. */
export const VALIDATE_MONTHLY_STORY_CHECK = 'story_structurally_valid'

const EXPECTED =
  'the exact generated story satisfies the canonical structural rules of its own brief'

/** Every refusal reports `blocked` or `error`, never `pass`. */
function cannot(
  result: 'blocked' | 'error', observed: string, detail: Record<string, string | number | boolean | null>,
): ReadOnlyHandlerOutput {
  return {
    result,
    checkKey: VALIDATE_MONTHLY_STORY_CHECK,
    expected: EXPECTED,
    observed,
    authoritativeSystem: null,   // nothing external is consulted, ever
    detail,
  }
}

export const validateMonthlyStoryHandler: ReadOnlyHandler = async (
  input,
): Promise<ReadOnlyHandlerOutput> => {
  // ── 1. The capability must have been supplied ────────────────────────────
  // Absent means the executor did not wire it. Refused rather than worked
  // around: a handler that reached for a database itself is the failure this
  // whole design exists to prevent.
  if (!input.readGeneratedStory) {
    return cannot('error', 'no story read capability was supplied to this handler',
      { error_kind: 'read_capability_missing', validated_at: input.now })
  }

  // ── 2. The exact story, named by this instance's own evidence ────────────
  const read = await input.readGeneratedStory()
  if (!read.ok) {
    // No story, or a pointer that cannot be trusted. `blocked` — the check is
    // unanswered, which is not the same as answered "no".
    return cannot('blocked', read.detail,
      { error_kind: read.refusal, validated_at: input.now })
  }
  const { story, target, storedHash } = read

  // ── 3. The pinned contract, derived exactly as generation derived it ─────
  const vendored = findVendoredDefinition(input.defKey, input.defVersion)
  if (vendored === null) {
    return cannot('error', `no vendored definition for ${input.defKey} v${input.defVersion}`,
      { error_kind: 'definition_not_vendored', story_content_hash: storedHash,
        validated_at: input.now })
  }

  let brief: ReturnType<typeof composeMonthlyBrief>
  let briefHash: string
  let maxContentSentences: number
  try {
    brief = composeMonthlyBrief(vendored.spec.canonical, input.instanceKey, {
      defKey: input.defKey, defVersion: input.defVersion,
    })
    briefHash = computeMonthlyBriefHash(brief)
    maxContentSentences = readStoryRequirements(vendored.spec.canonical).maxContentSentences
  } catch (e) {
    return cannot('error',
      `the pinned contract does not yield the rules to validate against: ${(e as Error).message}`,
      { error_kind: 'requirements_unavailable', story_content_hash: storedHash,
        validated_at: input.now })
  }

  // ── 4. Is this story the one the evidence named ─────────────────────────
  const mismatch = storyMatchesTarget(story, storedHash, target, story.workflow_instance_id)
  if (mismatch !== null) {
    return cannot('error', `the stored story does not answer to the generated identity (${mismatch})`,
      { error_kind: mismatch, story_content_hash: storedHash,
        target_content_hash: target.storyContentHash, validated_at: input.now })
  }
  // The brief this validator recomputed must be the brief the story was
  // generated for. If the contract moved underneath a stored story, the honest
  // answer is that this validator cannot judge it — not that it fails.
  if (briefHash !== target.briefHash) {
    return cannot('blocked',
      'the story was generated against a different brief than this definition now yields',
      { error_kind: 'brief_drifted', story_content_hash: storedHash,
        story_brief_hash: target.briefHash, current_brief_hash: briefHash,
        validated_at: input.now })
  }

  // ── 5. The canonical validator. Not a second opinion, the same one ──────
  const verdict = validateStory(story, { brief, briefHash, maxContentSentences }, storedHash)

  const detail = {
    story_content_hash: storedHash,
    brief_hash: briefHash,
    story_contract_version: story.story_contract_version,
    month_key: story.month_key,
    validator_version: verdict.validatorVersion,
    page_count: story.pages.length,
    failure_count: verdict.failures.length,
    // Codes only. The validator's own messages quote story text, and evidence
    // detail is a place for facts a person may read aloud, not for content.
    failures: verdict.failures.map(f => f.code).join(',') || 'none',
    validated_at: input.now,
  }

  return {
    result: verdict.valid ? 'pass' : 'fail',
    checkKey: VALIDATE_MONTHLY_STORY_CHECK,
    expected: EXPECTED,
    observed: verdict.valid
      ? `story ${storedHash} satisfies all ${verdict.validatorVersion} structural rules `
        + `(${story.pages.length} pages)`
      : `story ${storedHash} fails ${verdict.failures.length} structural rule(s): `
        + verdict.failures.map(f => f.code).join(', '),
    authoritativeSystem: null,
    detail,
  }
}
