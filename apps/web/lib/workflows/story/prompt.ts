/**
 * lib/workflows/story/prompt.ts — the versioned Story Generation Prompt Contract.
 *
 * Assembled deterministically from three authorities and nothing else: the
 * MonthlyBrief (requirements), the story contract version and rules it was
 * judged by, and the pinned character contracts.
 *
 * ── WHY THE PROMPT IS NOT PRODUCT AUTHORITY ─────────────────────────────────
 * The legacy pipeline put the product rules IN the prompts, and 33 agent
 * definitions then disagreed with each other about how many pages a saga has and
 * what Pling looks like. A prompt is an instruction to one provider at one
 * moment; canon is what every provider must satisfy. This module reads canon and
 * renders it — it never states it.
 *
 * That is why no rule text is typed here. The page counts come from the brief's
 * `page_structure`, the language and audience from the brief, and the character
 * identity is REFERENCED rather than described: a prompt that spelled out Nova's
 * hair would become a second Nova the moment the contract moved.
 *
 * The version is recorded as provenance so a story can be traced to the exact
 * instruction that produced it — and, because provenance is outside the content
 * hash, revising the prompt never invalidates an approval of unchanged words.
 */

import { createHash } from 'crypto'
import { canonicalJson } from '@/lib/atlas/mission/binding'
import type { MonthlyBriefV1 } from '../brief/types'
import type { StoryCharacterRef } from './types'

export const STORY_PROMPT_CONTRACT_VERSION = '1.0' as const

export interface StoryPromptInput {
  readonly brief: MonthlyBriefV1
  readonly storyContractVersion: string
  readonly characterRefs: readonly StoryCharacterRef[]
  readonly maxContentSentences: number
  readonly targetSentencesMin: number
  readonly targetSentencesMax: number
}

/**
 * The machine-readable instruction.
 *
 * An object rather than prose: a provider adapter renders it, and a test can
 * assert what was asked without parsing English. Every value is derived; there
 * is no field a caller could use to inject an instruction of their own.
 */
export interface StoryPromptContract {
  readonly prompt_contract_version: string
  readonly language: string
  readonly audience: { readonly min_age: number; readonly max_age: number }
  readonly month_key: string
  readonly theme: string
  readonly structure: {
    readonly total_pages: number
    readonly cover_pages: number
    readonly content_pages: number
    readonly closing_pages: number
  }
  readonly content_page_sentences: {
    readonly target_min: number
    readonly target_max: number
    readonly hard_max: number
  }
  readonly story_contract_version: string
  readonly character_contract_refs: readonly StoryCharacterRef[]
  /** Rules the generator must satisfy, named by their canonical identifiers. */
  readonly required_rules: readonly string[]
}

/**
 * Rules the prompt asserts, named rather than restated.
 *
 * Each is a pointer into `STORY_CONTRACT.md` v1.0. Naming them keeps the prompt
 * honest: if the contract changes, the names stay valid and the rendering
 * changes, instead of a stale paraphrase surviving in a prompt string.
 */
export const STORY_REQUIRED_RULES = [
  'title_required',
  'narrative_arc_lightweight',
  'no_forced_moral',
  'theme_integrated_not_mentioned',
  'safety_contract',
  'text_is_downstream_authority',
  'character_identity_from_contracts_only',
] as const

export function buildStoryPromptContract(input: StoryPromptInput): StoryPromptContract {
  const b = input.brief
  return {
    prompt_contract_version: STORY_PROMPT_CONTRACT_VERSION,
    language: b.language,
    audience: { min_age: b.audience.min_age, max_age: b.audience.max_age },
    month_key: b.month_key,
    theme: b.theme,
    structure: {
      total_pages: b.page_structure.total_pages,
      cover_pages: b.page_structure.cover_pages,
      content_pages: b.page_structure.content_pages,
      closing_pages: b.page_structure.closing_pages,
    },
    content_page_sentences: {
      target_min: input.targetSentencesMin,
      target_max: input.targetSentencesMax,
      hard_max: input.maxContentSentences,
    },
    story_contract_version: input.storyContractVersion,
    character_contract_refs: input.characterRefs,
    required_rules: [...STORY_REQUIRED_RULES],
  }
}

/**
 * The prompt's identity, for provenance and for proving determinism.
 *
 * Never hashed into the story: what was asked is not what was approved.
 */
export function computeStoryPromptHash(contract: StoryPromptContract): string {
  return createHash('sha256').update(canonicalJson(contract)).digest('hex')
}
