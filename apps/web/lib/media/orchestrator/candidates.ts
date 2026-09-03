/**
 * lib/media/orchestrator/candidates.ts — what Omnira can actually reach today.
 *
 * ── THE PROBLEM THIS SOLVES, STATED PLAINLY ────────────────────────────────
 * Phase 0 recorded that Omnira has TWO media architectures. Phase 2 is where
 * that stops being a note and becomes a decision:
 *
 *   SHIPPED, GOVERNED, VENDOR-NAMED — `lib/media/image-client.ts` (Ideogram) and
 *     `lib/ai/openai-client.ts` (gpt-image-1). These generate in production
 *     right now, behind `withGovernedSpend`. They are NOT `MediaProvider`s.
 *
 *   VENDOR-NEUTRAL, UNUSED — `lib/media/providers/*` (MuAPI). A real
 *     `MediaProvider` behind `router.ts`, gated off by default, with no live
 *     call ever made.
 *
 * An orchestrator that selected ONLY through `resolveProviderFor()` would see
 * exactly one candidate, MuAPI, and it is disabled — so every request would fail
 * closed. Correct for an empty eligible set, and useless as a proof: it would
 * also break the live article-hero path, which generates through Ideogram today.
 *
 * ── WHY A BRIDGE AND NOT A REWRITE ─────────────────────────────────────────
 * The tempting fix is to wrap Ideogram and OpenAI as `MediaProvider`s. It was
 * considered and rejected for Phase 2, for a reason that survives inspection:
 * `governance-provider-boundary.test.ts` locks the set of files permitted to
 * name a provider hostname to EXACTLY four, and asserts that list is exactly
 * those four. A `MediaProvider` implementation for Ideogram would either need
 * that guard widened — weakening a deliberately locked G1 invariant — or would
 * delegate straight back to `image-client.ts` anyway. The delegation is the
 * honest minimum, so this file does it directly and says so.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * NOT a second router. It does not resolve `MediaProvider`s itself: for that
 * family it ASKS `describeMediaProviders()` and reports what the router and the
 * existing gate already decided. It adds no provider, no credential, no
 * endpoint, and no capability that the underlying adapters do not have.
 *
 * `family: 'bridge'` is expected to shrink to zero. Each adapter that moves
 * behind `MediaProvider` deletes one entry here, and the day it is empty this
 * file becomes a thin read of the router.
 */

import 'server-only'

import { describeMediaProviders } from '@/lib/media/providers/router'
import type { MediaProviderId } from '@/lib/media/providers/types'
import {
  DURABLE_MEDIA_JOB_STORE_AVAILABLE,
  DURABLE_MEDIA_JOB_STORE_BLOCKER,
} from '@/lib/media/job/store'
import type {
  MediaCandidateFamily,
  MediaCandidateId,
  MediaDispatchSupport,
  MediaModelDescriptor,
} from './types'

/**
 * One thing the orchestrator can choose between.
 *
 * Everything here is a FACT about the environment, not a preference: what the
 * adapter can do, whether it has a credential, and whether an authority above it
 * already refused. Eligibility reads these; it never writes them.
 */
export interface MediaCandidate {
  id: MediaCandidateId
  family: MediaCandidateFamily
  /** The concrete model this candidate would use. Provider ≠ model. */
  model: MediaModelDescriptor
  /** Media types the candidate can produce at all. */
  mediaTypes: readonly ('image')[]
  /** False when the credential this path needs is absent in this environment. */
  configured: boolean
  /**
   * Set only for the provider-layer family: what `gate.ts` decided, surfaced
   * verbatim. Null for bridge candidates, which have no separate gate — their
   * authority is the governed spend boundary they already call.
   */
  gateBlockedReason: string | null
  /** True when an authority above this file has already refused execution. */
  gateRefused: boolean
  /**
   * Whether THIS orchestrator can complete the candidate's contract end to end.
   *
   * A fact about what Phase 2 implements, not a permission. Eligibility rejects
   * `supported: false` before ranking, so a candidate can never be selected and
   * then discovered to be undispatchable at the moment of spending.
   */
  dispatch: MediaDispatchSupport
}

// ── The bridge: shipped adapters, described as candidates ────────────────────

/**
 * `IDEOGRAM_API_KEY` / `OPENAI_API_KEY` are read ONLY to answer "is this path
 * usable at all". The value is never returned, logged, or passed on — the
 * adapters read their own credential at the moment they build a request, and
 * that stays true. This is a boolean about the environment, nothing more.
 */
function hasEnv(name: string, env: NodeJS.ProcessEnv): boolean {
  return (env[name] ?? '').trim().length > 0
}

/**
 * Ideogram, as reached through `generateIdeogramV3`.
 *
 * `supportsReferenceImages: false` is a FACT about Omnira's integration, not a
 * claim about the vendor: `generateIdeogramV3` posts to
 * `/v1/ideogram-v3/generate`, the text-to-image endpoint, and nothing in the
 * request carries an image. If a reference-capable Ideogram path is ever added,
 * this flag flips here and eligibility follows automatically.
 */
function ideogramCandidate(env: NodeJS.ProcessEnv): MediaCandidate {
  return {
    id: 'ideogram',
    family: 'bridge',
    model: { name: 'ideogram-v3', supportsReferenceImages: false },
    mediaTypes: ['image'],
    configured: hasEnv('IDEOGRAM_API_KEY', env),
    gateBlockedReason: null,
    gateRefused: false,
    // generateIdeogramV3 resolves to a retrievable URL, which Phase 1 admission
    // fetches and validates. Complete, end to end.
    dispatch: { supported: true, representations: ['url'] },
  }
}

/**
 * OpenAI `gpt-image-1`, as reached through `openAIImageGenerate` /
 * `openAIImageEdit`.
 *
 * `supportsReferenceImages: true` because `openAIImageEdit` takes an `image`
 * parameter — the same call `lib/ai/runner.ts` already uses to condition
 * Familje-Stunden output on a character reference.
 */
function openaiCandidate(env: NodeJS.ProcessEnv): MediaCandidate {
  return {
    id: 'openai',
    family: 'bridge',
    model: { name: 'gpt-image-1', supportsReferenceImages: true },
    mediaTypes: ['image'],
    configured: hasEnv('OPENAI_API_KEY', env),
    gateBlockedReason: null,
    gateRefused: false,
    // gpt-image-1 normally returns `b64_json` and can return a URL. BOTH are
    // admissible: bytes decode straight into `admitAssetBytes`, URLs go through
    // `admitAssetFromUrl`. Neither is a special case at the asset layer.
    dispatch: { supported: true, representations: ['url', 'bytes'] },
  }
}

// ── The provider layer, read through the existing router ─────────────────────

/**
 * Candidates from the `MediaProvider` family.
 *
 * Delegates entirely: `describeMediaProviders()` already asks each registered
 * provider what it can do and whether `gate.ts` would permit a call. This
 * function only translates that answer into the candidate shape — it makes no
 * independent judgement, which is what keeps it from being a second router.
 *
 * `configured` and `executionAllowed` come from the provider; a provider that is
 * registered but disabled appears here and is filtered by eligibility, so an
 * operator can see it exists rather than wondering why it vanished.
 */
function providerLayerCandidates(): MediaCandidate[] {
  return describeMediaProviders()
    // Only providers that can generate an image are candidates for image work.
    .filter(s => s.capabilities.includes('generateImage'))
    .map(s => ({
      id: s.provider as MediaCandidateId,
      family: 'provider-layer' as const,
      // The provider layer takes an explicit `model` per request and publishes no
      // default — deliberately, since a default model is a spend decision. Until
      // the orchestrator carries a model choice for this family, its reference
      // capability is not something this layer may assert.
      model: { name: modelHintFor(s.provider), supportsReferenceImages: false },
      mediaTypes: ['image'] as const,
      configured: s.configured,
      gateBlockedReason: s.blockedReason,
      gateRefused: !s.executionAllowed,
      // NOT DISPATCHABLE, stated up front rather than discovered — and, since
      // Phase 3, for a DIFFERENT and much narrower reason.
      //
      // Phase 2 could not dispatch these because the async job lifecycle did not
      // exist. It exists now (`lib/media/job/*`): dispatch classification, the
      // state machine, bounded polling, the QC boundary and admission are built
      // and tested. What is missing is the DURABLE STORE those depend on.
      //
      // That distinction matters because the two have different fixes. "Build a
      // lifecycle" was engineering; "apply an approved migration" is a decision.
      // Declaring it here means such a candidate is still rejected BEFORE
      // ranking, so enabling MuAPI can never produce a selection that then fails
      // at dispatch — and an operator reading the refusal is told which of the
      // two is actually blocking.
      dispatch: DURABLE_MEDIA_JOB_STORE_AVAILABLE
        ? { supported: true, representations: ['url'] }
        : { supported: false, reason: DURABLE_MEDIA_JOB_STORE_BLOCKER },
    }))
}

/**
 * A provisional model label for a provider-layer candidate.
 *
 * NOT a Model Registry, and deliberately not a default that could be spent
 * against: it is only what provenance records if such a candidate ever wins.
 * Choosing real models per provider is Phase 3 work.
 */
function modelHintFor(provider: MediaProviderId): string {
  return `${provider}:unspecified`
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Every candidate Omnira could consider, before any policy is applied.
 *
 * Deliberately returns candidates that will be REJECTED. Eligibility needs to
 * report *why* each one lost, and a list that quietly omitted the unconfigured
 * ones would make "no eligible provider" indistinguishable from "no provider
 * exists" — two states that need different fixes.
 *
 * Order here is the stable tie-break for ranking; it is not a preference.
 */
export function describeMediaCandidates(env: NodeJS.ProcessEnv = process.env): MediaCandidate[] {
  return [
    ideogramCandidate(env),
    openaiCandidate(env),
    ...providerLayerCandidates(),
  ]
}
