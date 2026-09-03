/**
 * lib/media/orchestrator/types.ts — the Media Orchestrator contract.
 *
 * THE LAYER PHASE 0 NAMED AND PHASE 1 UNBLOCKED. `lib/atlas/capability/media-
 * generation.ts` has listed `media_orchestrator` in
 * `MEDIA_GENERATION_UNMET_PREREQUISITES` since it was written; this is that
 * entry.
 *
 * ── WHAT IT OWNS ───────────────────────────────────────────────────────────
 * Exactly one thing: the ORDER in which existing authorities are consulted, and
 * the guarantee that ranking never widens what they allowed.
 *
 *     brief → eligibility → selection → governed execution → admission → result
 *
 * ── WHAT IT DOES NOT OWN ───────────────────────────────────────────────────
 * Every authority it consults already exists and stays where it is:
 *
 *   spend            `withGovernedSpend` inside the existing adapters
 *   stop authority   `ExecutionContract`, resolved by those same adapters
 *   provider gate    `lib/media/providers/gate.ts`, via the router
 *   capability licence `lib/atlas/capability/media-generation.ts`
 *   asset admission  `lib/media/asset/admission.ts` (Phase 1)
 *   storage placement `BUCKET_FOR_VISIBILITY` (Phase 1)
 *
 * It is not a second router, a second spend system, a second policy engine, a
 * second approval system, or a storage abstraction. It calls all of those.
 *
 * ── THE AUTHORITY SPLIT, EXPRESSED IN THE TYPE ─────────────────────────────
 * `MediaGenerationBrief` is what a caller may say. Note what it CANNOT say:
 * no endpoint, no credential, no bucket, no asset id, no budget override, no
 * "skip approval". `providerPreference` exists and is explicitly a preference —
 * it may reorder the eligible set and can never extend it. That is enforced by
 * construction (selection only ever sees an already-filtered array), not by a
 * check someone could remove.
 */

import type { ExecutionContract } from '@/lib/governance/execution-stop'
import type { AssetId, AssetVisibility, AdmittedAsset } from '@/lib/media/asset/types'

// ── Candidate identity ───────────────────────────────────────────────────────

/**
 * The execution paths Omnira can actually reach for media today.
 *
 * Two families, deliberately visible as one union because the orchestrator must
 * rank across both:
 *
 *   `ideogram` / `openai`  — SHIPPED governed adapters. They generate in
 *                            production right now, behind `withGovernedSpend`,
 *                            and predate the `MediaProvider` interface.
 *   `muapi`                — the `MediaProvider` family, reached through the
 *                            existing router. Built, gated off, no live call yet.
 *
 * Ids match `cost_events.provider` for the two shipped adapters, and
 * `MediaProviderId` for the third, so nothing has to translate between them.
 */
export const MEDIA_CANDIDATE_IDS = ['ideogram', 'openai', 'muapi'] as const
export type MediaCandidateId = (typeof MEDIA_CANDIDATE_IDS)[number]

/**
 * Which family a candidate belongs to — and therefore how it is dispatched.
 *
 * This distinction is temporary by design. `bridge` shrinks to zero as adapters
 * move behind `MediaProvider`; it is not a permanent second architecture, and
 * naming it here keeps that visible rather than letting it quietly settle.
 */
export type MediaCandidateFamily = 'bridge' | 'provider-layer'

// ── Provider vs model, kept separate ─────────────────────────────────────────

/**
 * The concrete model a candidate would use.
 *
 * Provider and model stay separate concepts, as Phase 0 required — `openai` is
 * not `gpt-image-1`, and swapping the model must not look like swapping the
 * provider. This is deliberately a plain descriptor and NOT a Model Registry:
 * a registry is Phase 3, and building one for three fixed strings would be
 * inventing structure ahead of the decision it exists to serve.
 */
export interface MediaModelDescriptor {
  /** Provider-specific model identifier, recorded on provenance verbatim. */
  readonly name: string
  /** Whether this model can be conditioned on reference images. */
  readonly supportsReferenceImages: boolean
}

/**
 * How a provider hands back what it made.
 *
 * `url`   — a retrievable link; admission fetches and validates it.
 * `bytes` — the image inline; admission validates the decoded buffer directly.
 *
 * Both end in Phase 1 admission. The distinction exists because a candidate that
 * only returns a representation this phase cannot admit is not a usable
 * candidate, and that must be knowable BEFORE ranking rather than discovered at
 * dispatch.
 */
export type MediaResultRepresentation = 'url' | 'bytes'

/**
 * Whether the CURRENT orchestrator can complete this candidate's full contract.
 *
 * THE PHASE 2 ELIGIBILITY PRINCIPLE, expressed as data: eligible must mean
 * "allowed AND completable". A candidate that is permitted but has no dispatch
 * path, or returns a representation admission cannot take, is excluded before
 * ranking — it is not a worse option, it is not an option.
 *
 * Deliberately NOT a general capability framework: one discriminated union with
 * a reason string, read by exactly one rule.
 */
export type MediaDispatchSupport =
  | { readonly supported: true; readonly representations: readonly MediaResultRepresentation[] }
  | { readonly supported: false; readonly reason: string }

// ── Who is asking ────────────────────────────────────────────────────────────

/**
 * The internal application paths permitted to orchestrate media.
 *
 * A CLOSED union, not a free string: adding a caller is a deliberate, greppable
 * type change that a reviewer sees, rather than a value someone passes. Nothing
 * reaching this from a request body, an LLM, or user input can widen it.
 */
export const INTERNAL_MEDIA_CALLERS = ['article-hero'] as const
export type InternalMediaCaller = (typeof INTERNAL_MEDIA_CALLERS)[number]

/**
 * WHY this generation is running — and therefore which authority binds it.
 *
 * This replaces an earlier `allowUnlicensed` option, which was a waiver: it said
 * "ignore the licence". That was the wrong shape, because it framed a
 * classification error as a permission. The Atlas media capability licence
 * governs whether a MISSION may declare `media.generate` among its tools
 * (`mediaGenerationAvailability` is a `MissionCapabilityAvailability`); an
 * operator-triggered application route is not a mission and was never the thing
 * that licence gates.
 *
 * So the question is not "may this bypass the licence" but "is this a mission at
 * all", and that is what the caller now states:
 *
 *   `mission`               → the licence applies, in full. No way to opt out:
 *                             there is no flag on this branch.
 *   `internal-application`  → not a mission, so the mission licence is not the
 *                             governing authority. EVERY other rule still
 *                             applies — spend, stop, provider gate, credentials,
 *                             reference support, dispatchability.
 *
 * REQUIRED, with no default, so no future caller silently inherits either
 * treatment.
 */
export type MediaInvocation =
  | { readonly kind: 'mission'; readonly missionId: string }
  | { readonly kind: 'internal-application'; readonly caller: InternalMediaCaller }

// ── The request ──────────────────────────────────────────────────────────────

/**
 * Canonical creative intent (§20.28 — a Brief is not a prompt).
 *
 * Kept to the two fields every current caller already produces. The full
 * upstream brief (e.g. `EditorBrief`) is hashed into provenance; only the
 * derived instruction crosses this boundary, so the orchestrator never becomes
 * a place where editorial payloads accumulate.
 */
export interface MediaCreativeBrief {
  instruction: string
  avoid?: readonly string[]
}

export interface MediaGenerationBrief {
  projectId: string
  /** REQUIRED. Which authority binds this call — see `MediaInvocation`. */
  invocation: MediaInvocation
  /** REQUIRED. Which stop authorities bind this work. Never defaulted here. */
  execution: ExecutionContract
  /** Only images today. Present so the field exists before video/audio need it. */
  mediaType: 'image'
  /** Recorded on `cost_events.operation`. The shipped adapters already require it. */
  operation: string
  agent?: string

  brief: MediaCreativeBrief
  aspectRatio?: string
  /** Defaults to `internal` — the same fail-closed default Phase 1 admission uses. */
  visibility?: AssetVisibility

  /**
   * References BY CANONICAL IDENTITY. Never a URL, never a bucket/path — Phase 1
   * §21.7 holds here too, and an external URL must not be usable as a reference.
   */
  referenceAssetIds?: readonly AssetId[]
  /**
   * `required` makes reference support an ELIGIBILITY constraint, not a hope.
   * A candidate whose model cannot honour references is filtered out before
   * ranking, and an empty eligible set fails closed — the PR #164 contract,
   * enforced one layer higher.
   */
  referenceRequirement?: 'none' | 'required'

  /** Ranking hint only. Never widens eligibility. */
  quality?: 'standard' | 'premium'
  /**
   * A PREFERENCE, never authority. It may reorder candidates that already
   * passed eligibility; it cannot admit one that did not. Structurally true:
   * selection is only ever handed the filtered array.
   */
  providerPreference?: MediaCandidateId

  /**
   * Storage path stem — no bucket, no extension.
   *
   * The BUCKET is derived from `visibility` by Phase 1 admission and is not
   * expressible here. The extension is derived from the validated bytes.
   */
  storagePath: string

  /**
   * Per-candidate provider extras — styling and rendering parameters that no
   * neutral contract can enumerate. Same escape hatch, and same name, as
   * `MediaRequestBase.providerOptions` in `lib/media/providers/types.ts`.
   *
   * KEYED BY CANDIDATE on purpose: options meant for Ideogram must never ride
   * along on an OpenAI request, which is what a flat record would do the moment
   * ranking picked a different winner.
   *
   * These reach the provider REQUEST BODY only. They cannot change the endpoint
   * (hardcoded in the adapter), the credential (read by the adapter itself), the
   * project, the execution contract, the bucket, the storage path, or anything
   * spend touches — none of those are assembled from this field.
   */
  providerOptions?: Readonly<Partial<Record<MediaCandidateId, Readonly<Record<string, unknown>>>>>

  /** Hashed into provenance so "was this the same request?" stays answerable. */
  sourceBrief?: unknown
}

// ── The result ───────────────────────────────────────────────────────────────

/** Why one candidate was chosen, so a selection can be explained after the fact. */
export interface MediaSelection {
  candidate: MediaCandidateId
  model: string
  family: MediaCandidateFamily
  /** Everything that passed eligibility, in ranked order. The chosen one is [0]. */
  rankedEligible: readonly MediaCandidateId[]
  /** Candidates rejected before ranking, with the rule that rejected each. */
  rejected: readonly MediaEligibilityRejection[]
}

export interface MediaEligibilityRejection {
  candidate: MediaCandidateId
  rule: MediaEligibilityRule
  detail: string
}

/**
 * The deterministic rules. A closed list so a reader can see the whole policy,
 * and so a rejection can be asserted by identity rather than by message text.
 */
export const MEDIA_ELIGIBILITY_RULES = [
  /** The mission-level capability licence forbids autonomous media generation. */
  'capability_licence',
  /** The candidate cannot produce the requested media type at all. */
  'media_type_unsupported',
  /** The candidate's model cannot be conditioned on references, and one is required. */
  'reference_unsupported',
  /** The candidate has no usable credential in this environment. */
  'not_configured',
  /** The provider-layer gate refuses execution (disabled / unconfigured mode). */
  'provider_gate_refused',
  /**
   * The candidate is ALLOWED but this orchestrator cannot complete its contract
   * — no dispatch path, no concrete model to submit to, or a result
   * representation admission cannot take.
   *
   * Distinct from every rule above: those are refusals by an authority, this is
   * an honest statement about what the orchestrator implements. Keeping it
   * separate means "we are not allowed to" never gets confused with "we cannot
   * yet".
   */
  'execution_not_supported',
  /**
   * SPEND GOVERNANCE CANNOT PRICE THIS EXECUTION — added in Phase 5.
   *
   * Deliberately its own rule rather than folded into `execution_not_supported`,
   * because the two send an operator to opposite places. `execution_not_supported`
   * says Omnira has not built something. This says Omnira has built everything
   * and does not know what the call COSTS — the vendor prices the model
   * dynamically and no `cost_rates` entry carries an authoritative figure.
   *
   * It is a hard filter and not a warning. `withGovernedSpend` needs a
   * conservative upper bound before it may reserve, and the only way to give it
   * one without a proven price is to invent a number — which would make the
   * budget ceiling enforce a fiction. Refusing before ranking means a candidate
   * is never selected and only then found unpriceable at the moment of spending.
   */
  'cost_governance_unavailable',
] as const
export type MediaEligibilityRule = (typeof MEDIA_ELIGIBILITY_RULES)[number]

/**
 * What a caller gets back.
 *
 * The IDENTITY is `asset.id`. A URL appears nowhere in this type — deriving one
 * is a separate, deliberate call (`publicDeliveryUrl` / `signedAssetUrl`), which
 * is the §21.7 direction: identity produces a URL, never the reverse.
 */
export interface MediaGenerationResult {
  asset: AdmittedAsset['asset']
  provenance: AdmittedAsset['provenance']
  selection: MediaSelection
}
