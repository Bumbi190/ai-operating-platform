/**
 * Compose the canonical Monthly Brief for this instance's month.
 *
 * The second pure action, and the sibling of `compute-release-instant`: no
 * network, no credential, no database handle, no environment. It reads the
 * canonical block of its own pinned definition and the month from the run's
 * immutable binding, and returns one observation. `authoritativeSystem` is null
 * because nothing external was consulted — the honest answer for a derivation.
 *
 * ── THE BRIEF IS DERIVED, NOT STORED ────────────────────────────────────────
 * This handler writes nothing, which is not a limitation but the design. A brief
 * is a pure function of (canonical contract, month key), so its durable record
 * is the automated evidence row: `brief_hash` is the identity, and any consumer
 * holding the same pinned definition can recompute the payload byte-for-byte and
 * verify it. A separate table would be a second copy of a derivation, free to
 * drift from the definition that produced it.
 *
 * The evidence `detail` is scalars only — the handler contract requires it — so
 * it carries the hash and the queryable summary rather than the nested payload.
 * That is enough: the hash names exactly one payload, and the payload is
 * reproducible.
 *
 * ── WHY THE VENDORED DEFINITION IS THE RIGHT SOURCE ─────────────────────────
 * `loadVendoredDefinitions` is a static JSON import — no filesystem, no network,
 * nothing that could differ between two runs in the same deployment. Drift
 * between the vendored file and the row an instance is pinned to is already
 * covered by the existing mechanism and is not re-implemented here: the evidence
 * target hash binds `def_hash`, so a changed contract makes prior evidence STALE
 * rather than silently reinterpreting it. Registration refuses to rewrite a
 * version, so a live instance cannot have v1 edited out from under it.
 */

import { findVendoredDefinition } from '../definitions'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '../brief/compose'
import { MonthlyBriefContractError } from '../brief/types'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput } from './types'

/** The declared check this action answers. Must exist in the adapter catalogue. */
export const COMPOSE_MONTHLY_BRIEF_CHECK = 'monthly_brief_composed'

const EXPECTED =
  'a deterministic Monthly Brief v1 derived from the pinned canonical contract'

export const composeMonthlyBriefHandler: ReadOnlyHandler = async (
  input,
): Promise<ReadOnlyHandlerOutput> => {
  const vendored = findVendoredDefinition(input.defKey, input.defVersion)
  if (vendored === null) {
    // Not reachable through the executor, which only runs kinds whose placement
    // names a vendored definition. Refused rather than assumed all the same.
    return {
      result: 'error',
      checkKey: COMPOSE_MONTHLY_BRIEF_CHECK,
      expected: EXPECTED,
      observed: `no vendored definition for ${input.defKey} v${input.defVersion}`,
      authoritativeSystem: null,
      detail: {
        month_key: input.instanceKey,
        error_kind: 'definition_not_vendored',
        composed_at: input.now,
      },
    }
  }

  try {
    const brief = composeMonthlyBrief(vendored.spec.canonical, input.instanceKey, {
      defKey: input.defKey,
      defVersion: input.defVersion,
    })
    const briefHash = computeMonthlyBriefHash(brief)

    return {
      result: 'pass',
      checkKey: COMPOSE_MONTHLY_BRIEF_CHECK,
      expected: EXPECTED,
      observed:
        `Monthly Brief v${brief.version} for ${brief.month_key} ` +
        `("${brief.theme}", ${brief.page_count} pages) — ${briefHash}`,
      authoritativeSystem: null,          // nothing external was consulted
      detail: {
        // The identity a later generation action binds to.
        brief_hash: briefHash,
        brief_schema: brief.schema,
        brief_version: brief.version,
        // The queryable summary. Scalars only, per the handler contract.
        month_key: brief.month_key,
        theme: brief.theme,
        release_at_utc: brief.release_at_utc,
        page_count: brief.page_count,
        ebook_pages: brief.ebook_pages,
        page_audio_clips: brief.page_audio_clips,
        voice_id: brief.voice.id,
        voice_model: brief.voice.model,
        def_hash: vendored.def_hash,
        composed_at: input.now,
      },
    }
  } catch (e) {
    // A contract that cannot answer is a real finding about the definition, not
    // an inability to look — but it is never laundered into a pass.
    const contractRefusal = e instanceof MonthlyBriefContractError
    return {
      result: contractRefusal ? 'fail' : 'error',
      checkKey: COMPOSE_MONTHLY_BRIEF_CHECK,
      expected: EXPECTED,
      observed: contractRefusal
        ? e.message
        : `the brief could not be composed: ${e instanceof Error ? e.message : 'unknown error'}`,
      authoritativeSystem: null,
      detail: {
        month_key: input.instanceKey,
        error_kind: contractRefusal ? e.reason : 'composition_failed',
        composed_at: input.now,
      },
    }
  }
}
