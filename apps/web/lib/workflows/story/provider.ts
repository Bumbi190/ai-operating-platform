/**
 * lib/workflows/story/provider.ts — the provider-neutral text seam, and the
 * boundary where provider output stops being trusted.
 *
 * ── MEDIA RUNTIME IS NOT THE TEXT PATH ──────────────────────────────────────
 * Media Runtime governs generated media ASSETS — bytes with a mime type, a
 * checksum and a storage location. A story is structured text. The canonical
 * governed text client already exists as `lib/ai/anthropic.ts`, which wraps
 * `withGovernedSpend` and classifies with `provablyNotBilled`. This seam is
 * provider-neutral so that client is one implementation, not the definition.
 *
 * ── PROVIDER OUTPUT IS UNTRUSTED INPUT ──────────────────────────────────────
 * A 200 with well-formed JSON means the provider answered, not that it answered
 * correctly. `normalizeStoryResponse` rejects anything that is not shaped like a
 * story; `validateStory` then decides whether the story is one we asked for. The
 * two are separate on purpose — shape and correctness fail for different reasons
 * and a caller must be able to tell them apart.
 *
 * Nothing here persists, spends, or decides. It turns an answer into a candidate.
 */

import type { StoryPromptContract } from './prompt'
import {
  STORY_PAGE_ROLES, STORY_SCHEMA, STORY_VERSION, StoryShapeError,
  type StoryCharacterRef, type StoryPage, type StoryPageRole, type StoryV1,
} from './types'

/** What a text provider must supply. Deliberately tiny. */
export interface StoryTextProvider {
  /** Stable identity recorded as provenance, e.g. 'anthropic'. */
  readonly provider: string
  /** The model actually used. Chosen by policy, never by a caller. */
  readonly model: string
  /**
   * Produce one story document.
   *
   * `beforeDispatch` is awaited immediately before the irreversible call, so a
   * stop committing mid-handler prevents the request rather than only the next.
   */
  generate(
    contract: StoryPromptContract,
    beforeDispatch?: () => Promise<void> | void,
  ): Promise<unknown>
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string') {
    throw new StoryShapeError('field_not_a_string', `${field} must be a string`)
  }
  return v
}

function isRole(v: unknown): v is StoryPageRole {
  return typeof v === 'string' && (STORY_PAGE_ROLES as readonly string[]).includes(v)
}

/**
 * Turn an untrusted provider answer into a candidate StoryV1.
 *
 * The bindings — instance, month, brief hash, contract version, character refs —
 * are supplied by US, never read from the response. A provider that could name
 * its own brief hash could claim to have satisfied requirements it never saw.
 */
export function normalizeStoryResponse(
  raw: unknown,
  binding: {
    workflowInstanceId: string
    monthKey: string
    briefHash: string
    storyContractVersion: string
    characterRefs: readonly StoryCharacterRef[]
  },
): StoryV1 {
  if (!isObject(raw)) {
    throw new StoryShapeError('not_an_object', 'the provider returned no story object')
  }
  const title = requireString(raw.title, 'title')

  if (!Array.isArray(raw.pages)) {
    throw new StoryShapeError('pages_not_an_array', 'pages must be an array')
  }
  const pages: StoryPage[] = raw.pages.map((p, i) => {
    if (!isObject(p)) {
      throw new StoryShapeError('page_not_an_object', `page at index ${i} is not an object`)
    }
    if (typeof p.page_number !== 'number' || !Number.isInteger(p.page_number)) {
      throw new StoryShapeError('page_number_invalid',
        `page at index ${i} has no integer page_number`)
    }
    if (!isRole(p.role)) {
      throw new StoryShapeError('page_role_invalid',
        `page ${p.page_number} has an unknown role`)
    }
    return { page_number: p.page_number, role: p.role, text: requireString(p.text, 'text') }
  })

  return {
    schema: STORY_SCHEMA,
    version: STORY_VERSION,
    workflow_instance_id: binding.workflowInstanceId,
    month_key: binding.monthKey,
    generated_from_brief_hash: binding.briefHash,
    story_contract_version: binding.storyContractVersion,
    character_contract_refs: binding.characterRefs,
    title,
    pages,
  }
}
