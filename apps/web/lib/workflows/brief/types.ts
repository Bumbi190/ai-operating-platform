/**
 * lib/workflows/brief/types.ts — the Monthly Brief, v1.
 *
 * WHAT THIS IS. The machine-readable PRODUCT REQUIREMENT for one Familje-Stunden
 * month: how many pages, which theme, which voice, which release instant. It is
 * the input contract every later production step will be measured against.
 *
 * WHAT THIS IS NOT. It carries no creative content — no story, no prompts, no
 * image descriptions, no marketing copy. That distinction is the whole point of
 * the type: a requirement is derived from the canonical contract and is the same
 * for everyone who reads it, while generated content is an output that differs
 * every time. Putting a prompt in here would make the brief non-deterministic
 * and destroy the only property that makes it useful as a binding target.
 *
 * ── EVERY FIELD HAS EXACTLY ONE CANONICAL SOURCE ────────────────────────────
 * Nothing here is retyped. `18` does not appear in this codebase as a monthly
 * page count; it is read from `canonical.ebook_pages`. The theme is read from
 * `canonical.year_order_2026`. The release instant comes from the same
 * `computeReleaseInstant` the `compute_release_instant` action uses, so the two
 * cannot disagree. A field with no canonical authority is ABSENT from v1 rather
 * than invented — see MONTHLY_BRIEF_V1_OMISSIONS below.
 *
 * ── THE BRIEF IS DERIVED, NOT STORED ────────────────────────────────────────
 * A brief is a pure function of (canonical contract, month key). Storing it in
 * its own table would denormalize a derivation and create a second thing that
 * could disagree with the definition. Its durable identity is the sha256 in the
 * automated evidence row; the payload is recomputable byte-for-byte by anyone
 * holding the same pinned definition.
 */

/** Discriminator carried inside the hashed payload, so a v2 cannot collide with a v1. */
export const MONTHLY_BRIEF_SCHEMA = 'omnira.familje-stunden.monthly-brief' as const
export const MONTHLY_BRIEF_VERSION = 1 as const

/**
 * Who the month is for.
 *
 * A product audience, not a per-sentence optimisation target — the canonical
 * story contract is explicit that it does not require every sentence to work
 * equally for a three-year-old and an eight-year-old.
 */
export interface MonthlyBriefAudience {
  readonly min_age: number
  readonly max_age: number
}

/**
 * How a month's 18 pages are actually composed.
 *
 * THE FIELD THIS REPLACED WAS A DEFECT. v1 of this type carried a single
 * `page_count: 18`, which is the TOTAL — cover + 16 content pages + closing. A
 * generator handed that number reads it as "write 18 pages" and produces 18
 * content pages, which breaks `storyLabels(16)` and returns 500 from
 * `get-protected-ebook` (runbook §2 FAILURE MODE). The name did not say which
 * number it was, so there was no safe way to consume it.
 *
 * All four numbers are stated, and the composer refuses a contract whose parts
 * do not sum to the total. A consumer never has to infer which one it holds.
 */
export interface MonthlyBriefPageStructure {
  readonly total_pages: number
  readonly cover_pages: number
  /** What a story generator writes. NOT `total_pages`. */
  readonly content_pages: number
  readonly closing_pages: number
}

/**
 * The voice contract, carried verbatim from `canonical.voice`.
 *
 * `settings` is an opaque record on purpose: those values belong to the TTS
 * vendor's model, and re-typing them here would create a second definition of
 * what the vendor accepts. It is validated as JSON-safe and hashed as-is.
 */
export interface MonthlyBriefVoice {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly format: string
  readonly settings: Readonly<Record<string, unknown>>
}

export interface MonthlyBriefV1 {
  readonly schema: typeof MONTHLY_BRIEF_SCHEMA
  readonly version: typeof MONTHLY_BRIEF_VERSION
  /** Which governance document produced this brief. */
  readonly def_key: string
  readonly def_version: number
  /** The month. Always the workflow instance key — never a caller's choice. */
  readonly month_key: string
  /** From `canonical.year_order_2026`. A month absent from it has no theme and is refused. */
  readonly theme: string
  /**
   * From `canonical.language`. Stated rather than implied: the surrounding
   * material is Swedish throughout, but a generator must be told, not left to
   * infer it from the theme string it was handed.
   */
  readonly language: string
  /** From `canonical.audience`. */
  readonly audience: MonthlyBriefAudience
  /** From `computeReleaseInstant` — the same function `compute_release_instant` runs. */
  readonly release_at_utc: string
  /**
   * From `canonical.page_structure`. A contract that does not declare it cannot
   * brief a generator, and composition is refused rather than guessed — v1 of the
   * workflow definition has no story authority at all, which is precisely why v2
   * exists.
   */
  readonly page_structure: MonthlyBriefPageStructure
  /** Artefact counts. Both equal `page_structure.total_pages`, and asserted so. */
  readonly ebook_pages: number
  readonly page_audio_clips: number
  readonly voice: MonthlyBriefVoice
}

/**
 * Deliberately ABSENT from v1, with the reason. Task 3 of the phase brief is
 * explicit: a field with no canonical authority is omitted, never invented.
 *
 *   activity_count      — "5 Aktivitetssidor" appears only in the LEGACY
 *                         `lib/ebook/monthlyPdfTemplate.ts` comment. Legacy
 *                         tooling is reference material, not canon.
 *   coloring_page_count — same origin, same reason.
 *   checklist / diploma — named in the `pdf_build` state's Swedish prose, which
 *                         `action-registry.ts` already refuses to treat as a
 *                         machine-readable source.
 *   theme_slug          — the `planning` state outputs a `slug`, but no canonical
 *                         rule says how it is derived from the theme.
 *   locale              — the document is Swedish throughout and the voice is a
 *                         Swedish voice, but no canonical field states it.
 *   theme_slug          — the `planning` state outputs a `slug`, but no canonical
 *                         rule says how it is derived from the theme.
 *
 * Adding any of these to v2 means adding the authority to the canonical
 * contract FIRST, which changes `def_hash` and correctly invalidates every
 * brief composed under v1.
 */
export const MONTHLY_BRIEF_V1_OMISSIONS = [
  'activity_count', 'coloring_page_count', 'checklist', 'diploma', 'theme_slug',
] as const

/**
 * ── THE GENERATOR-FACING PAYLOAD IS NOW COMPLETE AND FROZEN ─────────────────
 *
 * With `language`, `audience` and `page_structure` in place, every product
 * requirement a story generator needs is carried and hashed. Treat this payload
 * as FROZEN for StoryV1 work.
 *
 * Changing it changes `brief_hash`, and once a story has been generated against
 * a brief that hash is what binds the two together. Correcting it in place was
 * defensible only while production held zero brief identities — a fact that was
 * PROVEN, not assumed, and which stops being true the moment the first brief is
 * composed. After that, a change here is a schema-version change, not an edit.
 */
export const MONTHLY_BRIEF_V1_FROZEN_AFTER = 'Phase 2B-0.6' as const

/** A canonical contract that cannot answer the question asked of it. */
export class MonthlyBriefContractError extends Error {
  readonly reason: string
  readonly monthKey: string
  constructor(reason: string, monthKey: string, detail: string) {
    super(`monthly brief refused for "${monthKey}": ${detail}`)
    this.name = 'MonthlyBriefContractError'
    this.reason = reason
    this.monthKey = monthKey
  }
}
