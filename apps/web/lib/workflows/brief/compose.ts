/**
 * lib/workflows/brief/compose.ts — the pure Monthly Brief composer.
 *
 * PURITY IS THE CONTRACT. No network, no environment, no database, no clock, no
 * randomness, no provider, no caller override. The only inputs are the canonical
 * block of a pinned workflow definition and a month key, and for a given pair
 * the output bytes are always identical. That is what lets a later generation
 * action say `generated_from_brief_hash = X` and have it mean something.
 *
 * The composer READS the contract; it never completes it. Where the canonical
 * document cannot answer — an unknown month, a missing page count, two page
 * counts that disagree — it throws `MonthlyBriefContractError` rather than
 * choosing a value. A brief that guessed would be worse than no brief, because
 * every downstream artefact would inherit the guess and the hash would make it
 * look authoritative.
 */

import { createHash } from 'crypto'
import { canonicalJson } from '@/lib/atlas/mission/binding'
import { computeReleaseInstant, isCanonicalMonthKey } from '../adapters/familje-stunden/instant'
import {
  MONTHLY_BRIEF_SCHEMA, MONTHLY_BRIEF_VERSION, MonthlyBriefContractError,
  type MonthlyBriefV1, type MonthlyBriefPageStructure, type MonthlyBriefVoice,
} from './types'

/** The canonical keys this composer reads. Named once so a typo is not a silent omission. */
const CANONICAL_KEYS = {
  themes: 'year_order_2026',
  ebookPages: 'ebook_pages',
  audioClips: 'page_audio_clips',
  pageStructure: 'page_structure',
  voice: 'voice',
} as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A positive integer, or a refusal. `18.0` passes; `18.5`, `0`, `-1` and `"18"` do not. */
function requirePositiveInt(
  value: unknown, monthKey: string, field: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new MonthlyBriefContractError(
      'canonical_field_invalid', monthKey,
      `canonical.${field} must be a positive integer`,
    )
  }
  return value
}

function requireText(value: unknown, monthKey: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MonthlyBriefContractError(
      'canonical_field_invalid', monthKey, `canonical.${field} must be a non-empty string`,
    )
  }
  return value
}

/**
 * How the month's pages are composed.
 *
 * A contract that does not declare `page_structure` cannot answer how many pages
 * a generator should write, and this refuses rather than deriving it. Deriving it
 * is exactly the mistake: `ebook_pages` is the TOTAL, and treating it as the
 * content-page count produces 18 story pages where 16 belong.
 */
function readPageStructure(
  canonical: Record<string, unknown>, monthKey: string,
): MonthlyBriefPageStructure {
  const raw = canonical[CANONICAL_KEYS.pageStructure]
  if (!isPlainObject(raw)) {
    throw new MonthlyBriefContractError(
      'canonical_page_structure_missing', monthKey,
      `canonical.${CANONICAL_KEYS.pageStructure} must be an object — this contract ` +
      'declares no page structure and cannot brief a generator',
    )
  }
  const f = (k: keyof MonthlyBriefPageStructure) =>
    requirePositiveInt(raw[k], monthKey, `${CANONICAL_KEYS.pageStructure}.${k}`)

  const structure: MonthlyBriefPageStructure = {
    total_pages: f('total_pages'),
    cover_pages: f('cover_pages'),
    content_pages: f('content_pages'),
    closing_pages: f('closing_pages'),
  }
  // The arithmetic is the invariant. A contract whose parts do not sum to its
  // total is broken in a way that would silently mis-size every downstream
  // artefact, so it is refused rather than reconciled.
  const parts = structure.cover_pages + structure.content_pages + structure.closing_pages
  if (parts !== structure.total_pages) {
    throw new MonthlyBriefContractError(
      'canonical_page_structure_inconsistent', monthKey,
      `canonical.${CANONICAL_KEYS.pageStructure}: ` +
      `${structure.cover_pages}+${structure.content_pages}+${structure.closing_pages} ` +
      `!= ${structure.total_pages}`,
    )
  }
  return structure
}

/**
 * The voice contract, validated then carried verbatim.
 *
 * `settings` is passed through untouched: those keys belong to the TTS vendor,
 * and a whitelist here would silently drop a setting the runbook relies on.
 */
function readVoice(canonical: Record<string, unknown>, monthKey: string): MonthlyBriefVoice {
  const raw = canonical[CANONICAL_KEYS.voice]
  if (!isPlainObject(raw)) {
    throw new MonthlyBriefContractError(
      'canonical_voice_missing', monthKey, `canonical.${CANONICAL_KEYS.voice} must be an object`,
    )
  }
  const settings = raw.settings
  if (!isPlainObject(settings)) {
    throw new MonthlyBriefContractError(
      'canonical_voice_missing', monthKey, `canonical.${CANONICAL_KEYS.voice}.settings must be an object`,
    )
  }
  return {
    id: requireText(raw.id, monthKey, 'voice.id'),
    name: requireText(raw.name, monthKey, 'voice.name'),
    model: requireText(raw.model, monthKey, 'voice.model'),
    format: requireText(raw.format, monthKey, 'voice.format'),
    settings,
  }
}

/**
 * Compose the brief for one month from one canonical contract.
 *
 * `monthKey` is the workflow instance key and the SOLE month selector. There is
 * deliberately no second parameter through which a caller, an action payload or
 * Atlas could steer the result.
 */
export function composeMonthlyBrief(
  canonical: Record<string, unknown>,
  monthKey: string,
  identity: { defKey: string; defVersion: number },
): MonthlyBriefV1 {
  // Reuse the adapter's regex rather than a second copy: a key one layer accepts
  // and another refuses is how a malformed month reaches production.
  if (!isCanonicalMonthKey(monthKey)) {
    throw new MonthlyBriefContractError(
      'invalid_month_key', monthKey, 'not a canonical YYYY-MM month key',
    )
  }

  // The theme table is year-scoped by name. A month it does not list has no
  // canonical theme, and inventing one would put a fabricated product
  // requirement behind an authoritative-looking hash.
  const themes = canonical[CANONICAL_KEYS.themes]
  if (!isPlainObject(themes)) {
    throw new MonthlyBriefContractError(
      'canonical_themes_missing', monthKey,
      `canonical.${CANONICAL_KEYS.themes} must be an object`,
    )
  }
  if (!Object.prototype.hasOwnProperty.call(themes, monthKey)) {
    throw new MonthlyBriefContractError(
      'month_not_in_contract', monthKey,
      `canonical.${CANONICAL_KEYS.themes} declares no theme for this month`,
    )
  }
  const theme = requireText(themes[monthKey], monthKey, `${CANONICAL_KEYS.themes}.${monthKey}`)

  const ebookPages = requirePositiveInt(
    canonical[CANONICAL_KEYS.ebookPages], monthKey, CANONICAL_KEYS.ebookPages)
  const audioClips = requirePositiveInt(
    canonical[CANONICAL_KEYS.audioClips], monthKey, CANONICAL_KEYS.audioClips)

  // The product invariant: one page, one ebook page, one audio clip. Two
  // canonical numbers that disagree is a defect in the contract — refuse rather
  // than pick a winner, because either choice would be a guess.
  if (ebookPages !== audioClips) {
    throw new MonthlyBriefContractError(
      'canonical_page_counts_disagree', monthKey,
      `canonical.${CANONICAL_KEYS.ebookPages} (${ebookPages}) and ` +
      `canonical.${CANONICAL_KEYS.audioClips} (${audioClips}) must agree`,
    )
  }

  const pageStructure = readPageStructure(canonical, monthKey)

  // The artefact counts describe per-PAGE artefacts, so they count every page —
  // cover and closing included. If they ever disagreed with the total, one of the
  // two would be sizing a different thing than the other.
  if (ebookPages !== pageStructure.total_pages) {
    throw new MonthlyBriefContractError(
      'canonical_page_counts_disagree', monthKey,
      `canonical.${CANONICAL_KEYS.ebookPages} (${ebookPages}) must equal ` +
      `${CANONICAL_KEYS.pageStructure}.total_pages (${pageStructure.total_pages})`,
    )
  }

  // ONE release-time rule. Not a second implementation, not a copy of the
  // reasoning — the same function `compute_release_instant` executes, so the two
  // actions in `planning` cannot produce different instants.
  const releaseAtUtc = computeReleaseInstant(monthKey).utc

  return {
    schema: MONTHLY_BRIEF_SCHEMA,
    version: MONTHLY_BRIEF_VERSION,
    def_key: identity.defKey,
    def_version: identity.defVersion,
    month_key: monthKey,
    theme,
    release_at_utc: releaseAtUtc,
    page_structure: pageStructure,
    ebook_pages: ebookPages,
    page_audio_clips: audioClips,
    voice: readVoice(canonical, monthKey),
  }
}

/**
 * The brief's content identity.
 *
 * sha256 over `canonicalJson` — the repository's single canonicalizer, the same
 * one `computeDefHash` uses. That file's warning applies verbatim: two
 * canonicalizers over the same data are two answers waiting to disagree.
 *
 * The hash covers the COMPLETE semantic payload including `schema` and
 * `version`, so a future v2 with the same field values cannot collide with a v1.
 */
export function computeMonthlyBriefHash(brief: MonthlyBriefV1): string {
  return createHash('sha256').update(canonicalJson(brief)).digest('hex')
}
