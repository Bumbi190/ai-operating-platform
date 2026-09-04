/**
 * lib/workflows/story/validate.ts — what a machine can honestly check.
 *
 * ── THE LINE THIS FILE DOES NOT CROSS ───────────────────────────────────────
 * Everything below is deterministic and re-runnable: counts, roles, ordering,
 * emptiness, sentence bounds, and whether the declared bindings actually hold.
 *
 * It does NOT judge whether the story is charming, age-appropriate, well told,
 * in character, educationally sound, or written in good Swedish. Those are the
 * Editor's, and a validator that claimed them would convert a human judgement
 * into a green check — which is exactly how an approval stops meaning anything.
 *
 * PROVIDER SUCCESS IS NOT VALIDATION SUCCESS. A provider returning 200 with
 * well-formed JSON has told us it answered, not that it answered correctly.
 */

import type { MonthlyBriefV1 } from '../brief/types'
import { computeStoryContentHash } from './hash'
import type { StoryV1 } from './types'

/** Bump when a RULE changes, so old evidence goes stale rather than silently re-meaning. */
export const STORY_VALIDATOR_VERSION = '1.0' as const

export const STORY_VALIDATION_FAILURES = [
  'title_missing',
  'page_count_wrong',
  'role_count_wrong',
  'role_position_wrong',
  'page_numbers_not_contiguous',
  'page_text_empty',
  'sentences_over_maximum',
  'brief_hash_mismatch',
  'contract_version_missing',
  'character_refs_missing',
  'content_hash_mismatch',
] as const

export type StoryValidationFailure = (typeof STORY_VALIDATION_FAILURES)[number]

export interface StoryValidationResult {
  readonly valid: boolean
  readonly validatorVersion: string
  readonly failures: readonly { code: StoryValidationFailure; detail: string }[]
}

/**
 * Sentence count, deliberately crude and deliberately documented as such.
 *
 * Terminators are `.`, `!`, `?` and `…`. It is a BOUND check, not a grammar
 * check: the canonical rule is "at most three sentences", and a count that errs
 * slightly high on ellipses is the safe direction for a maximum.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/[.!?…]+(?:\s|$)/).filter(s => s.trim().length > 0).length
}

/**
 * Everything the validator needs, passed explicitly.
 *
 * `maxContentSentences` and `briefHash` are NOT fields on MonthlyBriefV1: that
 * payload was frozen in Phase 2B-0.6 carrying language, audience and page
 * structure, and adding to it now would change every brief identity. The
 * sentence bound lives in `canonical.content_page_text` and the hash is computed
 * from the brief, so both are supplied by the caller from those authorities
 * rather than smuggled into a frozen contract.
 */
export interface StoryValidationContext {
  /** The exact brief the story was generated for. */
  readonly brief: MonthlyBriefV1
  /** Its identity, from `computeMonthlyBriefHash`. */
  readonly briefHash: string
  /** From `canonical.content_page_text.hard_max_sentences`. */
  readonly maxContentSentences: number
}

/**
 * Validate a candidate story against the requirements it claims to come from.
 *
 * The brief is passed rather than re-derived: the story must be checked against
 * the EXACT requirements it was generated for, not against whatever the contract
 * says today.
 */
export function validateStory(
  story: StoryV1, ctx: StoryValidationContext, declaredContentHash: string,
): StoryValidationResult {
  const brief = ctx.brief
  const failures: { code: StoryValidationFailure; detail: string }[] = []
  const fail = (code: StoryValidationFailure, detail: string) => failures.push({ code, detail })

  if (typeof story.title !== 'string' || story.title.trim().length === 0) {
    fail('title_missing', 'the canonical contract requires every saga to have a title')
  }

  const ps = brief.page_structure
  if (story.pages.length !== ps.total_pages) {
    fail('page_count_wrong', `expected ${ps.total_pages} pages, found ${story.pages.length}`)
  }

  const byRole = (role: string) => story.pages.filter(p => p.role === role)
  const expected: [string, number][] = [
    ['cover', ps.cover_pages], ['content', ps.content_pages], ['closing', ps.closing_pages],
  ]
  for (const [role, n] of expected) {
    if (byRole(role).length !== n) {
      fail('role_count_wrong', `expected ${n} ${role} page(s), found ${byRole(role).length}`)
    }
  }

  const sorted = [...story.pages].sort((a, b) => a.page_number - b.page_number)
  const numbers = sorted.map(p => p.page_number)
  const contiguous = numbers.every((n, i) => n === i + 1)
  if (!contiguous || new Set(numbers).size !== numbers.length) {
    fail('page_numbers_not_contiguous', `page numbers must be 1..${story.pages.length} exactly once`)
  }

  // Roles must sit where the structure says: cover first, closing last.
  if (contiguous && sorted.length === ps.total_pages) {
    if (sorted[0]?.role !== 'cover') {
      fail('role_position_wrong', 'page 1 must be the cover')
    }
    if (sorted[sorted.length - 1]?.role !== 'closing') {
      fail('role_position_wrong', `page ${ps.total_pages} must be the closing page`)
    }
    for (const p of sorted.slice(1, -1)) {
      if (p.role !== 'content') {
        fail('role_position_wrong', `page ${p.page_number} must be a content page`)
      }
    }
  }

  for (const p of story.pages) {
    if (p.text.trim().length === 0) {
      fail('page_text_empty', `page ${p.page_number} has no text`)
    }
    // The sentence bound applies to CONTENT pages. Cover and closing carry text
    // but the contract states no prose rule for them, and inventing one here
    // would be this file asserting product authority it does not have.
    if (p.role === 'content') {
      const n = countSentences(p.text)
      if (n > ctx.maxContentSentences) {
        fail('sentences_over_maximum',
          `page ${p.page_number} has ${n} sentences; the canonical maximum is ` +
          `${ctx.maxContentSentences}`)
      }
    }
  }

  if (story.generated_from_brief_hash !== ctx.briefHash) {
    fail('brief_hash_mismatch', 'the story does not name the brief it was validated against')
  }
  if (!story.story_contract_version || story.story_contract_version.trim().length === 0) {
    fail('contract_version_missing', 'the story names no story-contract version')
  }
  if (story.character_contract_refs.length === 0) {
    fail('character_refs_missing', 'the story pins no character contract')
  }

  // The declared identity must be the identity of these bytes. A story whose
  // hash does not recompute is not a story we can bind an approval to.
  if (computeStoryContentHash(story) !== declaredContentHash) {
    fail('content_hash_mismatch', 'the declared content hash does not match the content')
  }

  return { valid: failures.length === 0, validatorVersion: STORY_VALIDATOR_VERSION, failures }
}
