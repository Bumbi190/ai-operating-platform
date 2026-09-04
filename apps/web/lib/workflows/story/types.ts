/**
 * lib/workflows/story/types.ts — StoryV1, the first creative artefact Omnira owns.
 *
 * ── WHAT A STORY IS, AND WHAT IT IS NOT ─────────────────────────────────────
 * A Story is generated CREATIVE CONTENT. It is deliberately none of the things
 * it could have been folded into:
 *
 *   not a MonthlyBrief   — a brief is a deterministic REQUIREMENT; a story is a
 *                          non-deterministic OUTPUT. One hash may never mean both.
 *   not an Asset         — an Asset is bytes in storage with a mime type and a
 *                          checksum of those bytes. A story is structured text.
 *   not evidence detail  — automated evidence detail is scalars only, and a story
 *                          has ordered pages.
 *   not runs.context     — that column is mutable, untyped and belongs to the
 *                          legacy pipeline. Approval must bind something that
 *                          cannot be edited after the fact.
 *
 * ── SEMANTIC CONTENT VS PROVENANCE ──────────────────────────────────────────
 * The split below is the load-bearing design decision. `StoryV1` is what an
 * Editor approves; `StoryProvenance` is how it came to exist. Only the former is
 * hashed. Regenerating identical text with a different model must NOT invalidate
 * an approval — the Editor approved the words, not the machine that typed them —
 * and equally, a story whose words differ must never share an identity with one
 * whose words do not.
 */

export const STORY_SCHEMA = 'omnira.familje-stunden.story' as const
export const STORY_VERSION = 1 as const

/**
 * Page roles, from the canonical page structure: 18 total = cover + 16 content +
 * closing. The role is part of the semantic payload because moving a page
 * between roles changes the product even if the words do not.
 */
export const STORY_PAGE_ROLES = ['cover', 'content', 'closing'] as const
export type StoryPageRole = (typeof STORY_PAGE_ROLES)[number]

export interface StoryPage {
  /** 1-based, contiguous, unique across the story. */
  readonly page_number: number
  readonly role: StoryPageRole
  /**
   * The text on the page.
   *
   * Canonical for content pages: the runbook states the storyboard text is the
   * single source for the ebook, the burned-in page text and the narration.
   *
   * Cover and closing pages carry text too — `ebook_pages` and
   * `page_audio_clips` are both the TOTAL — but the upstream contract states no
   * prose requirement for them beyond that. So the role is modelled and the
   * text is carried; no cover/closing prose rule is invented here.
   */
  readonly text: string
}

/**
 * The semantic story. Everything here is hashed; nothing here is operational.
 */
export interface StoryV1 {
  readonly schema: typeof STORY_SCHEMA
  readonly version: typeof STORY_VERSION
  readonly workflow_instance_id: string
  readonly month_key: string
  /** The exact MonthlyBriefV1 this was written against. */
  readonly generated_from_brief_hash: string
  /** The exact story contract it was judged by. */
  readonly story_contract_version: string
  /** Pinned identity authorities. Never the identities themselves. */
  readonly character_contract_refs: readonly StoryCharacterRef[]
  readonly title: string
  readonly pages: readonly StoryPage[]
}

export interface StoryCharacterRef {
  readonly character: string
  readonly contract_path: string
  readonly contract_version: string
}

/**
 * How the story came to exist. NOT part of its identity.
 *
 * Kept beside the story rather than inside it so that a provider change, a model
 * upgrade or a prompt revision is fully auditable without silently invalidating
 * an Editor's approval of unchanged words.
 */
export interface StoryProvenance {
  readonly provider: string
  readonly model: string
  readonly prompt_contract_version: string
  /** The governed run that produced it. */
  readonly run_id: string | null
  readonly created_at: string
  /** Audit convenience for humans. NEVER identity — the content hash is. */
  readonly revision_number: number
}

/** A story as stored: content, its identity, and how it was made. */
export interface StoredStory {
  readonly id: string
  readonly story: StoryV1
  readonly story_content_hash: string
  readonly provenance: StoryProvenance
  readonly status: StoryStatus
}

/**
 * Lifecycle. `superseded` is not deletion: a rejected story stays readable, and
 * an approval that named it stays auditable, which is the whole point of an
 * append-only store.
 */
export const STORY_STATUSES = ['candidate', 'superseded'] as const
export type StoryStatus = (typeof STORY_STATUSES)[number]

/** A provider returned something that is not a story. */
export class StoryShapeError extends Error {
  readonly reason: string
  constructor(reason: string, detail: string) {
    super(`story rejected: ${detail}`)
    this.name = 'StoryShapeError'
    this.reason = reason
  }
}
