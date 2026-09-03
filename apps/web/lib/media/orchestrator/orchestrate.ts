/**
 * lib/media/orchestrator/orchestrate.ts — the sequence.
 *
 * The Media Orchestrator that `lib/atlas/capability/media-generation.ts` has
 * listed as an unmet prerequisite since it was written. It coordinates existing
 * authorities and owns none of them:
 *
 *   1. eligibility   deterministic filter over real candidates      (eligibility.ts)
 *   2. selection     rank the ELIGIBLE set only                     (eligibility.ts)
 *   3. execution     the existing governed adapter                  (image-client / openai-client)
 *   4. admission     canonical Asset + Provenance                   (Phase 1 admission.ts)
 *   5. result        canonical identity, never a URL
 *
 * ── SUCCESS IS ADMISSION, NOT GENERATION ───────────────────────────────────
 * A provider returning an image is not a success. The caller is told nothing
 * until Phase 1 admission has retrieved, validated, checksummed, stored and
 * recorded provenance for it (§21.5). If admission fails after a paid call, that
 * is reported as an admission failure — accurately, and NOT retried, because a
 * retry would be a second paid generation for an image Omnira already has.
 *
 * ── NO SPEND LIVES HERE ────────────────────────────────────────────────────
 * `withGovernedSpend` is not imported and is never called from this file. Every
 * dispatch goes through an adapter that already owns project resolution,
 * estimate, reservation, refusal and settlement. This layer chooses WHICH
 * adapter; it never decides whether money may move.
 *
 * That also means there is exactly ONE reservation per orchestrated request:
 * one selected candidate, one adapter call. There is no fallback loop, and that
 * is deliberate — a silent second attempt against a different provider is how a
 * request acquires a second charge, and how a required reference would quietly
 * be lost to a provider that does not support it.
 */

import 'server-only'

import { generateIdeogramV3 } from '@/lib/media/image-client'
import { openAIImageGenerate } from '@/lib/ai/openai-client'
import { admitAssetBytes, admitAssetFromUrl, canonicalHash } from '@/lib/media/asset/admission'
import { ADMITTED_MIME_TYPES, AssetRejectedError, bytesMatchMime } from '@/lib/media/asset/validate'
import { getAsset } from '@/lib/media/asset/store'
import type { AssetId } from '@/lib/media/asset/types'
import { getMediaProvider } from '@/lib/media/providers/router'
import { runGovernedProviderJob } from '@/lib/media/dispatch/governed-dispatch'
import type { MediaProviderId } from '@/lib/media/providers/types'
import { describeMediaCandidates, type MediaCandidate } from './candidates'
import { filterEligible, rankEligible } from './eligibility'
import type {
  MediaEligibilityRejection,
  MediaGenerationBrief,
  MediaGenerationResult,
  MediaSelection,
} from './types'

// ── Failures ─────────────────────────────────────────────────────────────────

/**
 * The closed set of orchestration failures.
 *
 * Deliberately small, and deliberately NOT a universal error framework. Failures
 * that already have an owner keep it: a spend refusal surfaces as the existing
 * `SpendRefusedError`, a stop as `ExecutionStoppedError`, an admission refusal as
 * `AssetRejectedError`. Only failures this layer is the first to know about get a
 * code here.
 */
export const MEDIA_ORCHESTRATION_FAILURES = [
  /** Every candidate was filtered out. Carries the per-candidate reasons. */
  'NO_ELIGIBLE_PROVIDER',
  /** A required reference asset is missing, or belongs to another project. */
  'REFERENCE_INVALID',
  /** The selected adapter failed. The underlying error is attached as `cause`. */
  'PROVIDER_EXECUTION_FAILED',
  /** The adapter returned something unusable — no URL, wrong shape. */
  'PROVIDER_RESULT_INVALID',
  /** Bytes were produced but could not become a canonical Asset. */
  'ASSET_ADMISSION_FAILED',
] as const

export type MediaOrchestrationFailure = (typeof MEDIA_ORCHESTRATION_FAILURES)[number]

export class MediaOrchestrationError extends Error {
  readonly code: MediaOrchestrationFailure
  /** Populated for NO_ELIGIBLE_PROVIDER so the refusal can be explained. */
  readonly rejections: readonly MediaEligibilityRejection[]
  /** True once a provider call was made — i.e. spend may already have occurred. */
  readonly providerDispatched: boolean

  constructor(opts: {
    code: MediaOrchestrationFailure
    message: string
    rejections?: readonly MediaEligibilityRejection[]
    providerDispatched?: boolean
    cause?: unknown
  }) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'MediaOrchestrationError'
    this.code = opts.code
    this.rejections = opts.rejections ?? []
    this.providerDispatched = opts.providerDispatched ?? false
  }
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface OrchestrateOptions {
  /**
   * Injection seam for tests. Production always reads the real environment.
   *
   * There is deliberately NO licence option here. Which authority binds a call is
   * stated by `brief.invocation`, which is required and is a classification, not
   * a waiver — see `capabilityLicencePermits`.
   */
  candidates?: readonly MediaCandidate[]
}

// ── The sequence ─────────────────────────────────────────────────────────────

export async function orchestrateImageGeneration(
  brief: MediaGenerationBrief,
  opts: OrchestrateOptions = {},
): Promise<MediaGenerationResult> {
  // ── 1. References, by identity, before anything is spent ──────────────────
  //
  // Checked FIRST and locally: a reference that does not exist, or belongs to
  // another project, must not cost money to discover. Phase 1 admission enforces
  // the same rule at write time; doing it here as well means the failure lands
  // before a provider call rather than after one.
  const referenceAssetIds = brief.referenceAssetIds ?? []
  if (referenceAssetIds.length > 0) {
    await assertReferencesUsableForBrief(brief.projectId, referenceAssetIds)
  }

  // ── 2. Eligibility ───────────────────────────────────────────────────────
  const all = opts.candidates ?? describeMediaCandidates()
  const { eligible, rejected } = filterEligible(all, brief)

  if (eligible.length === 0) {
    // FAIL CLOSED. No provider call, no spend, and the reason for every
    // candidate is carried so an operator can tell "nothing implements this"
    // from "everything is switched off" — different problems, different fixes.
    throw new MediaOrchestrationError({
      code: 'NO_ELIGIBLE_PROVIDER',
      message: `No eligible media provider for ${brief.mediaType}`
        + (brief.referenceRequirement === 'required' ? ' with required reference support' : '')
        + `: ${rejected.map(r => `${r.candidate} (${r.rule})`).join(', ') || 'no candidates'}`,
      rejections: rejected,
    })
  }

  // ── 3. Selection — over the eligible set ONLY ────────────────────────────
  const ranked = rankEligible(eligible, brief)
  const chosen = ranked[0]

  const selection: MediaSelection = {
    candidate: chosen.id,
    model: chosen.model.name,
    family: chosen.family,
    rankedEligible: ranked.map(c => c.id),
    rejected,
  }

  // ── 4. Execution — through the adapter that owns the spend ───────────────
  const outcome = await dispatch(chosen, brief)

  // A PROVIDER-LAYER candidate has already completed the full canonical path:
  // governed dispatch, durable job lifecycle, bounded polling, the QC boundary
  // and Phase 1 admission. Its asset EXISTS, so there is nothing left to admit
  // and re-admitting would create a second row for bytes Omnira already owns.
  //
  // The selection is still assembled here, by this layer, because it is this
  // layer's fact — the adapter is told which candidate won and never decides it.
  if (outcome.kind === 'admitted') {
    return { asset: outcome.admitted.asset, provenance: outcome.admitted.provenance, selection }
  }

  const output = outcome.output

  // ── 5. Admission — success is not declared before this succeeds ──────────
  //
  // The provider URL is used to RETRIEVE and is then discarded; what survives is
  // the asset identity, its checksum and its storage location (§21.7).
  try {
    // Both representations converge on Phase 1 admission. The provider supplies
    // BYTES or a URL and nothing else: not the bucket (derived from visibility),
    // not the path (built by the caller and re-validated), not the asset id
    // (minted by the database), not the project.
    const common = {
      projectId:  brief.projectId,
      kind:       'image' as const,
      visibility: brief.visibility ?? 'internal',
      storage:    { path: brief.storagePath },
      provenance: {
        source:   'generated' as const,
        provider: chosen.id,
        model:    chosen.model.name,
        brief:    brief.sourceBrief ?? brief.brief,
        request:  { instruction: brief.brief.instruction, aspectRatio: brief.aspectRatio ?? null },
        referenceAssetIds,
        providerMetadata: {
          operation:       brief.operation,
          candidateFamily: chosen.family,
          rankedEligible:  selection.rankedEligible,
          resultRepresentation: output.kind,
        },
      },
    }

    const { asset, provenance } = output.kind === 'url'
      ? await admitAssetFromUrl({ ...common, sourceUrl: output.url })
      : await admitAssetBytes({ ...common, bytes: output.bytes, mimeType: output.mimeType })

    return { asset, provenance, selection }
  } catch (err) {
    // A paid call HAS happened. Say so precisely rather than reporting a
    // generation failure — and do not regenerate: the bytes exist, the problem
    // is that Omnira could not take ownership of them.
    throw new MediaOrchestrationError({
      code: 'ASSET_ADMISSION_FAILED',
      message: err instanceof AssetRejectedError
        ? `Provider ${chosen.id} produced an image that could not be admitted (${err.code}): ${err.message}`
        : `Provider ${chosen.id} produced an image but admission failed: ${err instanceof Error ? err.message : String(err)}`,
      providerDispatched: true,
      cause: err,
    })
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Call the selected adapter and return the URL its bytes can be retrieved from.
 *
 * Every branch calls a function that already wraps `withGovernedSpend`. Nothing
 * here reserves, settles or releases; a spend refusal or a stop propagates as
 * its own error type, unwrapped, because those callers need to tell it apart
 * from a provider fault.
 */
/**
 * What a provider handed back, before admission.
 *
 * A URL is a place to fetch from; bytes are the image itself. Both end in Phase 1
 * admission, which is where every validation lives — this type only records which
 * door the result came through.
 */
type ProviderOutput =
  | { kind: 'url'; url: string }
  | { kind: 'bytes'; bytes: Uint8Array; mimeType: string }

/**
 * What `dispatch` hands back, now that two families end in different places.
 *
 * `output` — a BRIDGE adapter produced bytes or a URL and admission has not run
 *   yet. The orchestrator admits it, exactly as it always has.
 * `admitted` — a PROVIDER-LAYER candidate ran the full durable job lifecycle,
 *   which owns polling, the QC boundary AND admission. The asset already exists.
 *
 * A discriminated union rather than forcing the second case to hand back a URL:
 * `runMediaJob` has already retrieved, validated, checksummed and stored the
 * bytes, and re-admitting from a vendor URL afterwards would be a SECOND
 * admission of an asset Omnira already owns — a duplicate row, and a second
 * fetch of a URL that may have expired.
 */
type DispatchOutcome =
  | { kind: 'output'; output: ProviderOutput }
  | { kind: 'admitted'; admitted: { asset: MediaGenerationResult['asset']; provenance: MediaGenerationResult['provenance'] } }

async function dispatch(candidate: MediaCandidate, brief: MediaGenerationBrief): Promise<DispatchOutcome> {
  const negative = brief.brief.avoid?.length ? brief.brief.avoid.join(', ') : undefined
  // Extras for THIS candidate only. Nothing governance-relevant is built from
  // them: the ctx object below is assembled from the brief's own fields.
  const extras = brief.providerOptions?.[candidate.id] ?? {}

  if (candidate.id === 'ideogram') {
    try {
      const url = await generateIdeogramV3(
        {
          execution: brief.execution,
          project:   { projectId: brief.projectId },
          operation: brief.operation,
          agent:     brief.agent,
        },
        {
          ...extras,
          prompt: brief.brief.instruction,
          ...(negative ? { negative_prompt: negative } : {}),
          ...(brief.aspectRatio ? { aspect_ratio: brief.aspectRatio } : {}),
          rendering_speed: 'DEFAULT',
        },
      )
      return { kind: 'output', output: { kind: 'url', url } }
    } catch (err) {
      throw providerFailure(candidate.id, err)
    }
  }

  if (candidate.id === 'openai') {
    let res: { data?: Array<{ url?: string | null; b64_json?: string | null }> }
    try {
      res = await openAIImageGenerate(
        {
          execution: brief.execution,
          project:   { projectId: brief.projectId },
          operation: brief.operation,
          agent:     brief.agent,
        },
        { ...extras, model: candidate.model.name, prompt: brief.brief.instruction, n: 1, size: '1024x1024' } as any,
      )
    } catch (err) {
      throw providerFailure(candidate.id, err)
    }

    const first = res.data?.[0]

    // A URL, when one is offered.
    if (first?.url) return { kind: 'output', output: { kind: 'url', url: first.url } }

    // Otherwise the normal gpt-image-1 shape: inline base64. Decoded here and
    // handed to `admitAssetBytes`, which runs the SAME validation the URL path
    // gets — MIME allowlist, magic-number check, size bound, checksum, bucket
    // derived from visibility. Nothing about base64 is special once decoded, and
    // the raw string never becomes canonical state.
    if (first?.b64_json) {
      return { kind: 'output', output: decodeProviderImage(candidate.id, first.b64_json) }
    }

    throw new MediaOrchestrationError({
      code: 'PROVIDER_RESULT_INVALID',
      message: 'openai returned neither an image URL nor base64 image data',
      providerDispatched: true,
    })
  }

  // ── The provider-layer family (Phase 5) ──────────────────────────────────
  //
  // Phase 2 threw here, because `MediaProvider` is async-job-shaped and no job
  // lifecycle existed. Phase 3/4 built the lifecycle and Phase 5 built the seam
  // that connects it to a governed dispatch, so the branch now runs — through
  // ONE call, into a module that owns none of the authorities it invokes.
  //
  // Note what this branch does NOT do: it does not resolve a provider by
  // capability, does not choose a model, does not read a credential, does not
  // build a request URL, and does not reserve budget. Selection already happened
  // (`candidate`), the model came with it (`providerResource`), and everything
  // else belongs to the adapter and the layers beneath it.
  if (candidate.family === 'provider-layer') {
    // Structural, not defensive: eligibility rejects a provider-layer candidate
    // with no resource under `execution_not_supported`, so this cannot be
    // reached with one missing. It refuses rather than falling back, because a
    // fallback model here would be the default spend the whole design refuses.
    const resource = candidate.providerResource
    if (!resource) {
      throw new MediaOrchestrationError({
        code: 'PROVIDER_EXECUTION_FAILED',
        message: `Candidate "${candidate.id}" was selected without a concrete provider `
          + 'resource; eligibility should have rejected it before ranking.',
      })
    }

    try {
      const run = await runGovernedProviderJob({
        provider:  getMediaProvider(candidate.id as MediaProviderId),
        resource,
        project:   { projectId: brief.projectId },
        execution: brief.execution,
        projectId: brief.projectId,
        operation: brief.operation,
        prompt:    brief.brief.instruction,
        ...(negative ? { negativePrompt: negative } : {}),
        ...(brief.aspectRatio ? { aspectRatio: brief.aspectRatio } : {}),
        providerOptions: extras,
        // The BRIEF is hashed, never stored. Same rule the job store states:
        // a brief may carry third-party editorial text, so only a hash persists.
        briefHash:   canonicalHash(brief.sourceBrief ?? brief.brief),
        storagePath: brief.storagePath,
        visibility:  brief.visibility ?? 'internal',
        referenceAssetIds: brief.referenceAssetIds ?? [],
        provenance: {
          brief:   brief.sourceBrief ?? brief.brief,
          request: { instruction: brief.brief.instruction, aspectRatio: brief.aspectRatio ?? null },
          providerMetadata: {
            operation:       brief.operation,
            candidateFamily: candidate.family,
            resultRepresentation: 'url',
          },
        },
      })
      return { kind: 'admitted', admitted: run.admitted }
    } catch (err) {
      throw providerFailure(candidate.id, err)
    }
  }

  throw new MediaOrchestrationError({
    code: 'PROVIDER_EXECUTION_FAILED',
    message: `Candidate "${candidate.id}" has no dispatch path in this orchestrator.`,
  })
}

/**
 * Decode a provider's base64 image into validated bytes.
 *
 * Deliberately small: it decodes and identifies, and defers every judgement to
 * Phase 1. `admitAssetBytes` already enforces the MIME allowlist, the per-kind
 * size ceiling (`MAX_BYTES.image`), the magic-number match, the checksum and the
 * storage placement — re-implementing any of that here would be a second answer
 * to a question that already has one.
 *
 * What this DOES own, because nothing else can:
 *
 *   • STRICT decode — `Buffer.from(s, 'base64')` is famously lenient and will
 *     silently drop invalid characters, so the result is re-encoded and compared.
 *     A payload that does not round-trip is refused rather than stored as
 *     whatever survived.
 *   • EMPTY refused — zero bytes is not an image.
 *   • TYPE IDENTIFIED FROM THE BYTES, never from the provider's word. The
 *     candidate MIME list is tried against `bytesMatchMime`; if none matches, the
 *     payload is refused. So a provider cannot mislabel its output into the
 *     store, and admission's own magic-number check still runs afterwards.
 */
function decodeProviderImage(providerId: string, b64: string): ProviderOutput {
  const raw = b64.trim()
  if (raw.length === 0) {
    throw new MediaOrchestrationError({
      code: 'PROVIDER_RESULT_INVALID',
      message: `${providerId} returned an empty base64 payload`,
      providerDispatched: true,
    })
  }

  const bytes = new Uint8Array(Buffer.from(raw, 'base64'))

  // STRICT. `Buffer.from(s, 'base64')` silently drops anything it cannot parse,
  // so a corrupt payload would otherwise decode to whatever survived. Proving the
  // decode is lossless by re-encoding is the cheapest honest check; padding is
  // normalised on both sides so a legitimately unpadded input is not rejected.
  const stripPad = (v: string) => v.replace(/=+$/, '')
  if (stripPad(Buffer.from(bytes).toString('base64')) !== stripPad(raw)) {
    throw new MediaOrchestrationError({
      code: 'PROVIDER_RESULT_INVALID',
      message: `${providerId} returned malformed base64 image data`,
      providerDispatched: true,
    })
  }

  if (bytes.byteLength === 0) {
    throw new MediaOrchestrationError({
      code: 'PROVIDER_RESULT_INVALID',
      message: `${providerId} returned base64 that decoded to zero bytes`,
      providerDispatched: true,
    })
  }

  const mimeType = ADMITTED_MIME_TYPES.image.find(m => bytesMatchMime(bytes, m))
  if (!mimeType) {
    throw new MediaOrchestrationError({
      code: 'PROVIDER_RESULT_INVALID',
      message: `${providerId} returned bytes that are not a recognised image format`,
      providerDispatched: true,
    })
  }

  return { kind: 'bytes', bytes, mimeType }
}

function providerFailure(id: string, err: unknown): unknown {
  // Spend refusals, stop refusals and "never dispatched" all carry meaning the
  // caller needs. Only an unrecognised fault is wrapped.
  if (err instanceof MediaOrchestrationError) return err
  const name = err instanceof Error ? err.name : ''
  if (name === 'SpendRefusedError' || name === 'ExecutionStoppedError' || name === 'ProviderNotDispatchedError') {
    return err
  }
  // A `MediaJobError` (Phase 5, provider-layer family) is the most informative
  // failure on this path and must NOT be flattened into
  // `PROVIDER_EXECUTION_FAILED`. It carries the fields the whole durable design
  // exists to produce — `dispatched`, `reconciliationRequired`, `resumable` —
  // and a caller that cannot see them would have no way to tell an UNKNOWN that
  // needs a human from a vendor failure that needs nothing.
  if (name === 'MediaJobError') return err
  return new MediaOrchestrationError({
    code: 'PROVIDER_EXECUTION_FAILED',
    message: `Provider ${id} failed: ${err instanceof Error ? err.message : String(err)}`,
    providerDispatched: true,
    cause: err,
  })
}

// ── References ───────────────────────────────────────────────────────────────

/**
 * Every reference must exist and belong to the SAME project.
 *
 * Cross-project reuse is refused, not filtered — Project Isolation is an
 * official Omnira architecture principle, and silently dropping a reference
 * would produce an image whose provenance claims fewer inputs than were asked
 * for, which is the §6.254 hidden-feature-loss failure this whole track exists
 * to remove.
 */
async function assertReferencesUsableForBrief(
  projectId: string,
  ids: readonly AssetId[],
): Promise<void> {
  for (const id of ids) {
    const asset = await getAsset(id)
    if (!asset) {
      throw new MediaOrchestrationError({
        code: 'REFERENCE_INVALID',
        message: `Reference asset ${id} does not exist.`,
      })
    }
    if (asset.projectId !== projectId) {
      throw new MediaOrchestrationError({
        code: 'REFERENCE_INVALID',
        message: `Reference asset ${id} belongs to another project — cross-project references are refused.`,
      })
    }
  }
}

/** Re-exported so callers can hash a brief without importing the asset layer. */
export { canonicalHash }
