/**
 * lib/workflows/story/progression.ts — may the workflow leave approval_content?
 *
 * Three facts exist by now, established by three different parties: generation
 * says a story exists, the validator says it is well formed, and an Editor says
 * it is good. Each names a story by content hash.
 *
 * The only question this module answers is whether they name the SAME one.
 *
 * ── WHY THERE IS NO "LATEST STORY" PATH ─────────────────────────────────────
 * The tempting shortcut is to look up the newest story and check that it was
 * approved. It fails in exactly the case that matters: Story A is generated,
 * validated and approved; Story B is then generated; "latest" now returns B, and
 * A's approval silently authorises it. Comparing hashes has no such failure mode,
 * so the comparison is the only thing here.
 */

import { storyFactsAgree } from '../approval/story-approval-target'

export const STORY_PROGRESSION_BLOCKERS = [
  'story_not_generated',
  'story_not_validated',
  'story_not_approved',
  'story_hash_disagreement',
] as const

export type StoryProgressionBlocker = (typeof STORY_PROGRESSION_BLOCKERS)[number]

export interface StoryProgressionFacts {
  /** Hash named by `story_generated` evidence, or null when absent. */
  readonly generatedHash: string | null
  /** Hash named by `story_structurally_valid` evidence. */
  readonly structurallyValidatedHash: string | null
  /** Hash named by the Editor's `story_content_approved` attestation. */
  readonly approvedHash: string | null
}

export interface StoryProgressionVerdict {
  readonly mayProgress: boolean
  readonly blockers: readonly StoryProgressionBlocker[]
  /** The one story every fact agrees on, when they do. */
  readonly agreedHash: string | null
}

/**
 * Decide whether the three facts describe one story.
 *
 * Absence is a blocker, never an assumption: a missing fact means nobody has
 * established it, which is not the same as it being satisfied.
 */
export function assessStoryProgression(
  facts: StoryProgressionFacts,
): StoryProgressionVerdict {
  const blockers: StoryProgressionBlocker[] = []
  if (!facts.generatedHash) blockers.push('story_not_generated')
  if (!facts.structurallyValidatedHash) blockers.push('story_not_validated')
  if (!facts.approvedHash) blockers.push('story_not_approved')
  if (blockers.length > 0) return { mayProgress: false, blockers, agreedHash: null }

  const agree = storyFactsAgree({
    generatedHash: facts.generatedHash!,
    structurallyValidatedHash: facts.structurallyValidatedHash!,
    approvedHash: facts.approvedHash!,
  })
  if (!agree) {
    return { mayProgress: false, blockers: ['story_hash_disagreement'], agreedHash: null }
  }
  return { mayProgress: true, blockers: [], agreedHash: facts.generatedHash }
}
