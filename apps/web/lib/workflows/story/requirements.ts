/**
 * lib/workflows/story/requirements.ts — the story rules, read from the pinned
 * canonical contract.
 *
 * `composeMonthlyBrief` already derives what a brief carries. It deliberately
 * does NOT carry the sentence bound, the story contract version or the character
 * contract references: MonthlyBriefV1 was frozen in Phase 2B-0.6, and adding
 * fields now would change every brief hash ever computed.
 *
 * So they are read here, from the same vendored contract the brief came from,
 * and they are read the same way `compose.ts` reads its own: every key is named
 * in one place, and a missing or malformed value is REFUSED rather than
 * defaulted. A default here would put an invented product requirement — a
 * sentence limit nobody agreed, a character contract version that does not
 * exist — behind an authoritative-looking prompt hash.
 */

import type { StoryCharacterRef } from './types'

/** Every canonical key this module reads. One place, so a rename is one edit. */
export const STORY_CANONICAL_KEYS = {
  storyContract: 'story_contract',
  characterContracts: 'character_contracts',
  contentPageText: 'content_page_text',
} as const

export class StoryRequirementsError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'StoryRequirementsError'
  }
}

export interface StoryRequirements {
  readonly storyContractVersion: string
  readonly storyContractPath: string
  readonly characterRefs: readonly StoryCharacterRef[]
  readonly targetSentencesMin: number
  readonly targetSentencesMax: number
  readonly maxContentSentences: number
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireText(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new StoryRequirementsError('not_a_string', `canonical.${where} must be a non-empty string`)
  }
  return v
}

function requireCount(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new StoryRequirementsError('not_a_count', `canonical.${where} must be a positive integer`)
  }
  return v
}

/**
 * Derive the story requirements from one canonical contract.
 *
 * Takes the same `canonical` object `composeMonthlyBrief` takes, so the brief and
 * the rules a story is generated under can only ever come from the same pinned
 * definition version.
 */
export function readStoryRequirements(canonical: Record<string, unknown>): StoryRequirements {
  const K = STORY_CANONICAL_KEYS

  const contract = canonical[K.storyContract]
  if (!isPlainObject(contract)) {
    throw new StoryRequirementsError('story_contract_missing',
      `canonical.${K.storyContract} must be an object`)
  }
  const storyContractVersion = requireText(contract.version, `${K.storyContract}.version`)
  const storyContractPath = requireText(contract.path, `${K.storyContract}.path`)

  // Character identity is contract-referenced, never described here. Phase 2B-0
  // decided Nova and Pling are defined by their own documents; restating them
  // would create a second authority that could silently disagree with the first.
  const refsRaw = canonical[K.characterContracts]
  if (!Array.isArray(refsRaw) || refsRaw.length === 0) {
    throw new StoryRequirementsError('character_contracts_missing',
      `canonical.${K.characterContracts} must be a non-empty array`)
  }
  const characterRefs: StoryCharacterRef[] = refsRaw.map((r, i) => {
    if (!isPlainObject(r)) {
      throw new StoryRequirementsError('character_contract_malformed',
        `canonical.${K.characterContracts}[${i}] is not an object`)
    }
    return {
      character: requireText(r.character, `${K.characterContracts}[${i}].character`),
      contract_path: requireText(r.path, `${K.characterContracts}[${i}].path`),
      contract_version: requireText(r.version, `${K.characterContracts}[${i}].version`),
    }
  })

  const text = canonical[K.contentPageText]
  if (!isPlainObject(text)) {
    throw new StoryRequirementsError('content_page_text_missing',
      `canonical.${K.contentPageText} must be an object`)
  }
  const targetSentencesMin = requireCount(text.target_sentences_min,
    `${K.contentPageText}.target_sentences_min`)
  const targetSentencesMax = requireCount(text.target_sentences_max,
    `${K.contentPageText}.target_sentences_max`)
  const maxContentSentences = requireCount(text.hard_max_sentences,
    `${K.contentPageText}.hard_max_sentences`)

  // A target range that exceeds its own hard maximum is a contract that cannot
  // be satisfied. Caught here rather than in the validator, where it would look
  // like the model failed to follow an instruction it was never given coherently.
  if (targetSentencesMin > targetSentencesMax) {
    throw new StoryRequirementsError('target_range_inverted',
      `${K.contentPageText}: target min ${targetSentencesMin} > max ${targetSentencesMax}`)
  }
  if (targetSentencesMax > maxContentSentences) {
    throw new StoryRequirementsError('target_exceeds_hard_max',
      `${K.contentPageText}: target max ${targetSentencesMax} > hard max ${maxContentSentences}`)
  }

  return {
    storyContractVersion, storyContractPath, characterRefs,
    targetSentencesMin, targetSentencesMax, maxContentSentences,
  }
}
