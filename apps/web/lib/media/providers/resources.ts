/**
 * lib/media/providers/resources.ts — WHICH MuAPI model, and may it be paid for.
 *
 * ── THE STRING THIS FILE EXISTS TO DELETE ──────────────────────────────────
 * Phase 2 gave provider-layer candidates the model name `muapi:unspecified`,
 * with an explicit note that choosing real models was later work. That label was
 * safe only because such a candidate could never be dispatched. The moment a
 * governed dispatch adapter exists it becomes a billable execution identity, and
 * `POST /api/v1/muapi:unspecified` is not an endpoint — it is a 404 that would
 * arrive AFTER a budget reservation and a stop check.
 *
 * ── WHAT THIS IS, AND EMPHATICALLY IS NOT ──────────────────────────────────
 * It is a CLOSED LIST OF ONE PROVIDER'S RESOURCES, holding only facts this
 * repository can defend, plus the one operator switch that selects among them.
 *
 * It is NOT the global Model Registry. That registry would span providers, carry
 * capability matrices, quality scores and routing weights, and would be built to
 * serve decisions Omnira has not yet had to make. Nothing here crosses a
 * provider boundary: `MediaCandidateId` still names the provider, this names the
 * resource behind one of them, and the two stay separate exactly as Phase 2
 * required.
 *
 * ── WHY A CLOSED LIST AND NOT A FREE STRING FROM THE ENVIRONMENT ───────────
 * A raw `MUAPI_IMAGE_MODEL=<anything>` would be a value that reaches
 * `POST /api/v1/{model}` — an operator typo becomes a request, and worse, a
 * string alone cannot answer the two questions eligibility must ask before
 * ranking: can this model be conditioned on references, and can spend
 * governance price it. Neither is derivable from a name. So the env var SELECTS
 * from a list; it never DEFINES an entry.
 *
 * ── PROVENANCE OF EVERY FACT BELOW ─────────────────────────────────────────
 * `GET https://api.muapi.ai/api/v1/models` is public, unauthenticated, and
 * returns 655 entries of the form
 *
 *   { name, description, category, family, group_of, cost, cost_currency,
 *     cost_strategy, dynamic_pricing, endpoint, estimate_endpoint }
 *
 * Read 2026-09-03. Two facts were verified across ALL 655 entries and are what
 * make the adapter's path construction correct rather than assumed:
 *
 *   • `endpoint === "/api/v1/" + name` holds for every entry, with zero
 *     exceptions — so `muapi.ts` submitting to `/api/v1/${model}` is right, and
 *     `name` is the value `model` must carry.
 *   • `cost_currency` is USD for every entry, and the catalogue's top-level
 *     `currency` is USD.
 *
 * `listedUsdPerImage` below is copied from that catalogue. It is recorded as
 * EVIDENCE and is deliberately not usable as a price — see `costRateKey`.
 */

import type { MediaExecutionDecision } from './gate'

// ── The descriptor ───────────────────────────────────────────────────────────

/**
 * One MuAPI resource Omnira is prepared to submit to.
 *
 * Every field is a fact with a source. There is no field here that expresses a
 * preference, a ranking weight, or a quality opinion — those would be the
 * beginnings of the registry this file refuses to become.
 */
export interface MuapiResourceDescriptor {
  /** The vendor's model `name`, verbatim. Also the `/api/v1/{name}` path segment. */
  readonly name: string
  /** The vendor's own `category` string, recorded so the claim below is checkable. */
  readonly vendorCategory: string
  /** The media kind this resource produces. */
  readonly mediaType: 'image'
  /**
   * Whether this resource can be conditioned on reference images.
   *
   * FALSE for every entry, and that is a positive finding rather than a default:
   * the vendor catalogue puts reference-conditioned work in its own `Image to
   * Image` category, and both entries below are `Text to Image`. The catalogue
   * exposes no per-model reference flag at all, so a `true` here could not be
   * sourced from anything — and PR #164 makes an unsourced `true` the one error
   * that silently drops a required reference.
   */
  readonly supportsReferenceImages: boolean
  /**
   * The `cost_rates` key that must exist before this resource may be paid for.
   *
   * NULL for every entry today, and that null is the whole Phase 5 cost
   * decision. The catalogue lists a figure for both models, and both carry
   * `dynamic_pricing: true` — the vendor stating that the listed number is not
   * the charge, and that the authoritative figure comes from
   * `/api/v1/models/{name}/estimate-cost`, which needs a credential Omnira does
   * not hold.
   *
   * So the price is UNPROVEN, and an unproven price must not become a
   * reservation. A null here makes billable execution INELIGIBLE — before
   * ranking, before spending, with a reason an operator can read — rather than
   * letting a plausible-looking constant satisfy the gate.
   *
   * Filling one in is a deliberate act that requires two things together: an
   * authoritative price, and a `cost_rates` row carrying it.
   */
  readonly costRateKey: string | null
  /**
   * The catalogue's listed figure, in USD, at the read date. EVIDENCE ONLY.
   *
   * Never read by any estimate. It is here so a later operator filling in
   * `costRateKey` can see what the vendor advertised and what it did not
   * promise — `dynamicPricing: true` means this number is a starting point.
   */
  readonly listedUsdPerImage: number
  readonly dynamicPricing: boolean
}

/**
 * Every MuAPI resource Omnira may submit to. Two entries, both `Text to Image`,
 * both read from the public catalogue on 2026-09-03.
 *
 * Kept to two on purpose. One would make "select among resources" untestable as
 * a behaviour; seventy would be the registry. These two differ in exactly the
 * dimension that matters for a first sandbox proof — speed and listed cost — and
 * nothing else about them is modelled.
 */
export const MUAPI_IMAGE_RESOURCES: readonly MuapiResourceDescriptor[] = [
  {
    name: 'flux-schnell',
    vendorCategory: 'Text to Image',
    mediaType: 'image',
    supportsReferenceImages: false,
    costRateKey: null,
    listedUsdPerImage: 0.003,
    dynamicPricing: true,
  },
  {
    name: 'flux-dev',
    vendorCategory: 'Text to Image',
    mediaType: 'image',
    supportsReferenceImages: false,
    costRateKey: null,
    listedUsdPerImage: 0.015,
    dynamicPricing: true,
  },
] as const

/** The env var that SELECTS one of the above. It cannot define a new one. */
export const MUAPI_IMAGE_MODEL_ENV = 'MUAPI_IMAGE_MODEL'

export type MuapiResourceRefusal =
  /** Nothing was selected. There is deliberately no default — see below. */
  | 'no_model_selected'
  /** A value was selected that is not in the closed list. */
  | 'unknown_model'

export type MuapiResourceResolution =
  | { readonly ok: true; readonly resource: MuapiResourceDescriptor }
  | { readonly ok: false; readonly refusal: MuapiResourceRefusal; readonly detail: string }

/**
 * Which resource this environment has selected, if any.
 *
 * THERE IS NO DEFAULT, and the absence is the point. A default model is a
 * default spend — `lib/media/providers/types.ts` already refuses to publish one
 * for exactly that reason — so an unset variable resolves to a refusal that
 * eligibility reports, never to "probably the cheap one".
 *
 * PURE: reads one string, matches it against a frozen list. No I/O, so the
 * answer cannot change between the eligibility check and the dispatch.
 */
export function resolveMuapiImageResource(
  env: Record<string, string | undefined> = process.env,
): MuapiResourceResolution {
  const raw = (env[MUAPI_IMAGE_MODEL_ENV] ?? '').trim()
  if (raw.length === 0) {
    return {
      ok: false,
      refusal: 'no_model_selected',
      detail: `no concrete MuAPI model is selected (${MUAPI_IMAGE_MODEL_ENV} is unset); `
        + 'a default model would be a default spend decision, so there is none',
    }
  }
  const resource = MUAPI_IMAGE_RESOURCES.find(r => r.name === raw)
  if (!resource) {
    return {
      ok: false,
      refusal: 'unknown_model',
      detail: `${MUAPI_IMAGE_MODEL_ENV}="${raw}" is not one of the MuAPI resources Omnira `
        + `has established facts for (${MUAPI_IMAGE_RESOURCES.map(r => r.name).join(', ')})`,
    }
  }
  return { ok: true, resource }
}

/** Look one up by the name recorded on a candidate or a job. Pure. */
export function findMuapiImageResource(name: string): MuapiResourceDescriptor | null {
  return MUAPI_IMAGE_RESOURCES.find(r => r.name === name) ?? null
}

// ── Cost admissibility ───────────────────────────────────────────────────────

/**
 * Whether SPEND GOVERNANCE could price this execution — decided from facts that
 * need no I/O, so eligibility can ask it before ranking.
 *
 * Two branches, and the split is the honest one:
 *
 *   NON-BILLABLE — `decideMediaExecution` already answers this. Test mode is
 *     `billable: false` because a sandbox key returns mock outputs and is never
 *     charged, and `config.ts` structurally cannot hand a test-mode caller the
 *     production key. The estimate for such a call is ZERO, and zero is the true
 *     figure rather than a convenient one.
 *
 *   BILLABLE — needs a real price, which needs a `cost_rates` key. Every
 *     descriptor's `costRateKey` is null today, so this branch refuses. That
 *     refusal is the Phase 5 cost decision, enforced rather than documented.
 *
 * WHY THIS IS NOT A SECOND COST SYSTEM: it introduces no price, no table and no
 * currency. It answers "is there a proven price for this", and the price itself
 * is read later, once, through `lib/cost/rates.ts` — the one accessor.
 */
export type MuapiSpendAdmission =
  | {
      readonly admitted: true
      /** No money can move: sandbox mode. The estimate is genuinely zero. */
      readonly basis: 'non_billable_sandbox'
      readonly costRateKey: null
    }
  | {
      readonly admitted: true
      /** A proven price exists under this `cost_rates` key. */
      readonly basis: 'cost_rate'
      readonly costRateKey: string
    }
  | { readonly admitted: false; readonly reason: string }

export function admitMuapiSpend(
  resource: MuapiResourceDescriptor,
  decision: MediaExecutionDecision,
): MuapiSpendAdmission {
  if (!decision.billable) {
    return { admitted: true, basis: 'non_billable_sandbox', costRateKey: null }
  }
  if (!resource.costRateKey) {
    return {
      admitted: false,
      reason: `MuAPI model "${resource.name}" would be billable, and no authoritative price `
        + `exists for it: the vendor lists ${resource.listedUsdPerImage} USD with `
        + 'dynamic_pricing=true, which is not a promise, and no cost_rates key is configured. '
        + 'Paid dispatch stays refused rather than reserving against an invented figure.',
    }
  }
  return { admitted: true, basis: 'cost_rate', costRateKey: resource.costRateKey }
}
