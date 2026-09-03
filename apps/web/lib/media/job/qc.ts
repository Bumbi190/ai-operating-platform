/**
 * lib/media/job/qc.ts — the quality-control BOUNDARY, and nothing behind it.
 *
 * ── WHAT PHASE 3 DECIDES, AND WHAT IT REFUSES TO DECIDE ────────────────────
 * There are two entirely different questions hiding under the word "quality":
 *
 *   TECHNICAL VALIDATION — is this a usable file of the type we asked for?
 *     Objective, cheap, deterministic, and answerable without an opinion. This
 *     module owns the part of it that must happen BEFORE admission, and Phase 1
 *     (`lib/media/asset/validate.ts`) owns the rest — MIME allowlist, magic
 *     numbers, size ceiling, checksum. Nothing here re-implements those; a
 *     second answer to a question that already has one is how the two drift.
 *
 *   SEMANTIC / CREATIVE QC — is this image any GOOD? Does it match the brief?
 *     Subjective, expensive, and the one that must never be allowed to trigger a
 *     regeneration on its own. `docs/architecture/muapi-media-provider.md`
 *     already records the prohibition: a generator must never also be the judge
 *     of whether its own output is publishable.
 *
 * Phase 3 builds the first and only NAMES the second. There is deliberately no
 * scoring function, no model call and no threshold in this file, because a
 * semantic critic that can fail a job is one refactor away from a semantic
 * critic that can re-run it — and a re-run is a second charge.
 *
 * PURE: no I/O, no provider, no network.
 */

import type { MediaAsset, MediaAssetKind, MediaJobResult } from '@/lib/media/providers/types'

/** Why a terminally-successful vendor answer is nonetheless unusable. */
export type MediaResultRejection =
  /** The vendor said "completed" and returned nothing. */
  | 'no_output'
  /** The output is not the media kind that was requested. */
  | 'wrong_kind'
  /** The only URL offered is not a retrievable https URL. */
  | 'unretrievable_url'
  /** More than one output for a request that asked for one. */
  | 'unexpected_output_count'

export type MediaResultCheck =
  | { ok: true; asset: MediaAsset }
  | { ok: false; rejection: MediaResultRejection; detail: string }

/**
 * The technical gate between "the vendor says it finished" and "Omnira will try
 * to own this".
 *
 * ── "COMPLETED" IS NOT SUCCESS ─────────────────────────────────────────────
 * A provider status of `completed` is the vendor's claim about its own work. It
 * is not evidence that anything usable came back, and Phase 2 already
 * established the standard this continues: success is ADMISSION, not generation.
 * So a completed job with an empty output array fails here, loudly, rather than
 * reaching admission as a puzzling retrieval error.
 *
 * ── WHY THE URL IS ONLY SHAPE-CHECKED HERE ─────────────────────────────────
 * The real SSRF control is `assertSourceUrlTrusted`, which admission runs
 * BEFORE it fetches — that ordering is what makes it a control rather than a
 * log. This check exists so that an obviously unusable value (a relative path, a
 * `data:` URI, an empty string) is refused as a provider-result fault with a
 * clear reason, instead of surfacing as an asset-layer rejection that reads like
 * a storage problem.
 */
export function checkTerminalResult(
  result: MediaJobResult,
  expected: { kind: MediaAssetKind; expectedCount?: number },
): MediaResultCheck {
  if (result.assets.length === 0) {
    return {
      ok: false, rejection: 'no_output',
      detail: `provider reported "${result.status}" with no output assets`,
    }
  }

  const expectedCount = expected.expectedCount ?? 1
  if (result.assets.length !== expectedCount) {
    // Refused rather than trimmed. Silently taking the first of three would mean
    // Omnira paid for three generations and recorded one, and the other two
    // would exist remotely with nothing pointing at them.
    return {
      ok: false, rejection: 'unexpected_output_count',
      detail: `expected ${expectedCount} output(s), provider returned ${result.assets.length}`,
    }
  }

  const asset = result.assets[0]

  if (asset.kind !== expected.kind) {
    // The kind is inferred from the bytes/URL by the adapter, never taken from a
    // caller. A mismatch means the vendor produced something other than what was
    // asked for, which no downstream validation would catch: a valid MP4 is a
    // valid file, and admitting it as the article hero would simply be wrong.
    return {
      ok: false, rejection: 'wrong_kind',
      detail: `expected ${expected.kind}, provider returned ${asset.kind}`,
    }
  }

  if (!/^https:\/\/[^\s]+$/i.test(asset.url)) {
    return {
      ok: false, rejection: 'unretrievable_url',
      detail: 'provider output is not an https URL that admission could retrieve',
    }
  }

  return { ok: true, asset }
}

/**
 * The semantic gate — declared, unimplemented, and unable to act.
 *
 * Present so that the boundary has a NAME and a stated contract before anything
 * is built behind it. The contract, fixed now while it is cheap to fix:
 *
 *   1. A semantic verdict is ADVISORY in this phase. It may annotate an asset;
 *      it may not fail a job and it may not cause a dispatch.
 *   2. Whatever implements it must not be the model that produced the output.
 *   3. It runs AFTER admission, never before — Omnira must own the bytes before
 *      it forms an opinion about them, or a rejected opinion means a paid
 *      generation nobody kept.
 */
export type SemanticQcVerdict = { assessed: false; reason: 'not_implemented_in_phase_3' }

export function assessSemanticQuality(): SemanticQcVerdict {
  return { assessed: false, reason: 'not_implemented_in_phase_3' }
}
