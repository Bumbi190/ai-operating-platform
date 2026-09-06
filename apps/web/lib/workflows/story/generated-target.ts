/**
 * lib/workflows/story/generated-target.ts — which story a validation is about.
 *
 * ── WHY THIS IS NOT "THE LATEST STORY" ──────────────────────────────────────
 * `store.ts` deliberately has no `readLatestStory`, for the reason written
 * there: the newest row and the story the workflow actually generated are
 * different questions, and a function that answers both lets a regeneration
 * silently inherit a judgement made about different bytes.
 *
 * So the target is projected from the instance's own EVIDENCE — the
 * `story_generated` fact that the generation action recorded — exactly the way
 * `projectGithubBinding` derives the release identity from evidence rather than
 * from a table scan or an environment variable. The story is then fetched by
 * that exact hash. A regeneration writes a new `story_generated` row naming
 * different bytes, so the target moves on its own and the previous validation
 * stops being about the current story without anyone having to remember to
 * invalidate it.
 *
 * Everything here is pure. The database read lives in the executor; what a
 * handler receives is the answer, never a handle.
 */

import type { WorkflowEvidence } from '../types'
import type { StoryV1 } from './types'

/** The check whose evidence names the story. */
export const GENERATED_STORY_CHECK = 'story_generated'

/** The identity a validation binds to. Every field is compared, none is decorative. */
export interface GeneratedStoryTarget {
  readonly storyContentHash: string
  readonly briefHash: string
  readonly storyContractVersion: string
  readonly monthKey: string
}

export const GENERATED_TARGET_REFUSALS = [
  /** No `story_generated` fact this validation could be about. */
  'no_generated_story_evidence',
  /** A row exists but does not carry a usable identity. Never guessed at. */
  'generated_evidence_detail_malformed',
] as const
export type GeneratedTargetRefusal = (typeof GENERATED_TARGET_REFUSALS)[number]

export type GeneratedTargetProjection =
  | { ok: true; target: GeneratedStoryTarget }
  | { ok: false; refusal: GeneratedTargetRefusal; detail: string }

const HASH = /^[0-9a-f]{64}$/

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}
function hash(v: unknown): string | null {
  return typeof v === 'string' && HASH.test(v) ? v : null
}

/**
 * The story this state's validation is about, from the state's own evidence.
 *
 * Only an AUTOMATED PASS may name it. A failed generation did not produce a
 * story the workflow considers generated, and an attested row must never be
 * able to point the validator at bytes of someone's choosing — `story_generated`
 * is declared automated-only, and this refuses to depend on that being enforced
 * somewhere else.
 */
export function projectGeneratedStoryTarget(
  evidence: readonly WorkflowEvidence[],
  state: string,
): GeneratedTargetProjection {
  const rows = evidence
    .filter(e => e.state === state
      && e.check_key === GENERATED_STORY_CHECK
      && e.result === 'pass'
      && e.source === 'automated')
    // Newest last, then taken from the end: the same "newest recorded value"
    // rule `projectGithubBinding` uses for a rebound identity.
    .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0))

  const newest = rows[rows.length - 1]
  if (!newest) {
    return { ok: false, refusal: 'no_generated_story_evidence',
      detail: `no automated passing ${GENERATED_STORY_CHECK} evidence at "${state}"` }
  }

  const d = newest.detail ?? {}
  const storyContentHash = hash(d.story_content_hash)
  const briefHash = hash(d.brief_hash)
  const storyContractVersion = text(d.story_contract_version)
  const monthKey = text(d.month_key)
  if (!storyContentHash || !briefHash || !storyContractVersion || !monthKey) {
    // Named individually so a malformed row is diagnosable without reading it.
    const missing = [
      !storyContentHash && 'story_content_hash',
      !briefHash && 'brief_hash',
      !storyContractVersion && 'story_contract_version',
      !monthKey && 'month_key',
    ].filter(Boolean).join(', ')
    return { ok: false, refusal: 'generated_evidence_detail_malformed',
      detail: `${GENERATED_STORY_CHECK} evidence carries no usable ${missing}` }
  }

  return { ok: true, target: { storyContentHash, briefHash, storyContractVersion, monthKey } }
}

export const TARGET_MISMATCHES = [
  'instance_mismatch',
  'content_hash_mismatch',
  'brief_hash_mismatch',
  'contract_version_mismatch',
  'month_mismatch',
] as const
export type TargetMismatch = (typeof TARGET_MISMATCHES)[number]

/**
 * Does this stored story really answer to this identity?
 *
 * The store already looks a story up BY hash and instance, so most of this can
 * only fail if something is deeply wrong. It is checked anyway, because the
 * cost is a few comparisons and the failure it guards against — validating
 * story A and filing the result against story B's identity — produces a PASS
 * that a later approval would bind to.
 *
 * Returns the first mismatch, or null when the story is the one named.
 */
export function storyMatchesTarget(
  story: StoryV1,
  storedHash: string,
  target: GeneratedStoryTarget,
  instanceId: string,
): TargetMismatch | null {
  if (story.workflow_instance_id !== instanceId) return 'instance_mismatch'
  if (storedHash !== target.storyContentHash) return 'content_hash_mismatch'
  if (story.generated_from_brief_hash !== target.briefHash) return 'brief_hash_mismatch'
  if (story.story_contract_version !== target.storyContractVersion) {
    return 'contract_version_mismatch'
  }
  if (story.month_key !== target.monthKey) return 'month_mismatch'
  return null
}
