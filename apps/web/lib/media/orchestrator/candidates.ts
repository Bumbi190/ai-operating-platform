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
import {
  admitMuapiSpend,
  resolveMuapiImageResource,
  type MuapiResourceDescriptor,
} from '@/lib/media/providers/resources'
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
   * A fact about what the orchestrator implements, not a permission. Eligibility
   * rejects `supported: false` before ranking, so a candidate can never be
   * selected and then discovered to be undispatchable at the moment of spending.
   */
  dispatch: MediaDispatchSupport
  /**
   * Whether spend governance could price this execution — added in Phase 5.
   *
   * Null for bridge candidates, whose prices are proven and already wired into
   * `estimateImageSek`. Non-null for the provider-layer family, where the
   * question is live: the vendor prices its models dynamically and Omnira holds
   * no authoritative figure, so a billable provider-layer execution has no
   * conservative upper bound to reserve against.
   *
   * A FACT read by eligibility, exactly like `gateRefused`. Nothing here decides
   * whether money may move; `withGovernedSpend` does that, later and for real.
   */
  costGovernance: { admissible: true } | { admissible: false; reason: string } | null
  /**
   * The provider resource actually selected, for the provider-layer family.
   *
   * Carried so the governed dispatch adapter is HANDED the model rather than
   * re-resolving it — a second resolution is a second chance to disagree with
   * the one eligibility filtered on.
   */
  providerResource?: MuapiResourceDescriptor
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
    // Priced by `estimateImageSek` from a proven `cost_rates` figure.
    costGovernance: null,
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
    // Priced by `estimateImageSek` from a proven `cost_rates` figure.
    costGovernance: null,
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
function providerLayerCandidates(env: NodeJS.ProcessEnv): MediaCandidate[] {
  // Resolved ONCE, outside the map: a pure read of the environment.
  const resolution = resolveMuapiImageResource(env)

  return describeMediaProviders()
    // Only providers that can generate an image are candidates for image work.
    .filter(s => s.capabilities.includes('generateImage'))
    .map(s => {
      // ── THE MODEL, CONCRETE OR NOT AT ALL ─────────────────────────────────
      //
      // Phase 2 put `muapi:unspecified` here and could afford to, because such a
      // candidate was undispatchable by construction. Phase 5 builds the
      // dispatch path, so that label would become a billable execution identity
      // and `/api/v1/muapi:unspecified` is not an endpoint.
      //
      // The name below is therefore either a real vendor model an operator
      // selected, or the candidate is not dispatchable. There is no third state
      // and, in particular, no default — a default model is a default spend.
      const resource = resolution.ok ? resolution.resource : null

      // BILLABILITY COMES FROM THE PROVIDER, not from a second config read.
      // `describe()` already applied `decideMediaExecution` to the same
      // environment that produced `configured` and `executionAllowed`, so every
      // fact on this candidate comes from one evaluation and they cannot
      // disagree with each other.
      const cost = resource
        ? admitMuapiSpend(resource, { allowed: s.executionAllowed, reason: s.blockedReason, code: null, billable: s.billable })
        : null
      const costGovernance = cost === null
        // No resource, so there is nothing to price yet. The dispatch rule below
        // rejects this candidate first, and reporting a cost problem for a
        // candidate that has no model would send an operator to the wrong fix.
        ? null
        : cost.admitted
          ? { admissible: true as const }
          : { admissible: false as const, reason: cost.reason }

      // ── DISPATCHABILITY, IN THE ORDER AN OPERATOR SHOULD READ IT ──────────
      //
      // Two independent facts, and the nearer problem is reported first.
      const dispatch: MediaDispatchSupport =
        !DURABLE_MEDIA_JOB_STORE_AVAILABLE
          ? { supported: false, reason: DURABLE_MEDIA_JOB_STORE_BLOCKER }
          : resource === null
            ? { supported: false, reason: resolution.ok ? 'no resource' : resolution.detail }
            : { supported: true, representations: ['url'] }

      return {
        id: s.provider as MediaCandidateId,
        family: 'provider-layer' as const,
        model: {
          name: resource?.name ?? modelHintFor(s.provider),
          // Sourced from the descriptor, never asserted by this file. Every
          // descriptor says `false` and says why — PR #164 makes an unsourced
          // `true` the one error that silently drops a required reference.
          supportsReferenceImages: resource?.supportsReferenceImages ?? false,
        },
        mediaTypes: ['image'] as const,
        configured: s.configured,
        gateBlockedReason: s.blockedReason,
        gateRefused: !s.executionAllowed,
        dispatch,
        costGovernance,
        ...(resource ? { providerResource: resource } : {}),
      }
    })
}

/**
 * The label a provider-layer candidate carries when NO concrete resource is
 * selected.
 *
 * Retained from Phase 2 and now unreachable by any dispatchable candidate: it
 * appears only on a candidate the `dispatch` rule above has already marked
 * unsupported, so it can never become a value posted to a vendor. It survives
 * because an operator reading a rejection needs to see WHICH provider was
 * rejected, and a blank model name would read as a bug.
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
    ...providerLayerCandidates(env),
  ]
}
