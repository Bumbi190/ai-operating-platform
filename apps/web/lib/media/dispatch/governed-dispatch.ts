/**
 * lib/media/dispatch/governed-dispatch.ts — the seam Phase 4 named and did not
 * build.
 *
 * `store.ts` states the gap in one sentence: "nothing wires a `MediaProvider`
 * into `runMediaJob` behind `withGovernedSpend`". This file is that wiring, and
 * nothing else:
 *
 *     selected candidate + resolved model
 *          ↓
 *     ┌──────────────── withGovernedSpend ────────────────┐
 *     │  provider.generateImage()  →  MediaJobRef         │   ← the ONLY billable act
 *     └───────────────────────────────────────────────────┘
 *          ↓  classified into MediaDispatchResult
 *     runMediaJob   →  durable record  →  poll  →  QC  →  admit
 *
 * ── WHAT IT REFUSES TO BE ──────────────────────────────────────────────────
 * Not a router — it is HANDED a provider id and a model; it resolves neither.
 * Not a second job system — `runMediaJob` owns the lifecycle, unchanged.
 * Not a second spend system — `withGovernedSpend` owns money, unchanged.
 * Not a second provider abstraction — it calls `MediaProvider` as published.
 * Not a fallback — one candidate in, one dispatch, no second provider, ever.
 *
 * ── WHY IT LIVES HERE AND NOT IN `lib/media/job/` ──────────────────────────
 * `media-job-lifecycle.test.ts` guards that directory with an exact rule: NO
 * lifecycle module may name a spend boundary, a retry wrapper, or a provider
 * constructor. That rule is worth more than the convenience of filing this
 * beside the code it calls — the lifecycle's whole value is that it decides an
 * ORDER and cannot decide a payment, and a spend import sitting in that folder
 * would erode the guarantee whether or not a guard were adjusted to permit it.
 *
 * So this module is the lifecycle's CALLER, and it lives outside. The direction
 * of the dependency says the same thing: `job/` knows nothing about this file.
 *
 * ── THE BOUNDARY, STATED PRECISELY ─────────────────────────────────────────
 * `withGovernedSpend` encloses EXACTLY ONE `await`: the provider's create call.
 * Polling, reconciliation, QC and asset admission all happen after it has
 * returned, and they happen because `runMediaJob` — which this file hands
 * already-governed and deliberately ungoverned closures to — runs them.
 *
 * That is not a stylistic choice. MuAPI does not bill `GET /predictions/{id}/
 * result`, so a governed poll would take a fresh reservation for every status
 * check: dozens of reservations per image, each able to refuse and strand a
 * generation that has already been paid for. And an admission inside the
 * governed block would make a storage failure look like a spend event.
 *
 * ── NOTHING HERE THROWS A DISPATCH OUTCOME ─────────────────────────────────
 * `dispatch()` returns a classification for EVERY path, including a budget
 * refusal and a stop. A throw would escape `runMediaJob` between its
 * `DISPATCHING` transition and its outcome transition, stranding the row in the
 * one state that means "a request is outstanding" — for a call that provably
 * never left the machine. An inaccurate durable state is the failure this whole
 * track exists to prevent, so the refusals are classified as
 * `not_dispatched` (which is what they are) and the original error is re-thrown
 * to the caller afterwards, unwrapped, because a caller needs to tell a budget
 * refusal from a vendor fault.
 */

import 'server-only'

import {
  ProviderNotDispatchedError,
  SpendRefusedError,
  withGovernedSpend,
  type ProjectRef,
} from '@/lib/cost/governed-spend'
import { getRates } from '@/lib/cost/rates'
import { ExecutionStoppedError, type ExecutionContract } from '@/lib/governance/execution-stop'
import { MediaProviderError, toMediaProviderError } from '@/lib/media/providers/errors'
import {
  admitMuapiSpend,
  findMuapiImageResource,
  type MuapiResourceDescriptor,
} from '@/lib/media/providers/resources'
import type {
  MediaJobRef,
  MediaJobResult,
  MediaProvider,
  MediaProviderId,
} from '@/lib/media/providers/types'
import type { AssetId, AssetVisibility } from '@/lib/media/asset/types'
import type { AdmittedAsset } from '@/lib/media/asset/types'
import { acceptRemoteOperationId } from '@/lib/media/job/identity'
import type { MediaDispatchResult } from '@/lib/media/job/dispatch'
import { runMediaJob, type RunMediaJobResult } from '@/lib/media/job/run'
import type { MediaJobStore } from '@/lib/media/job/store'
import { createSupabaseMediaJobStore } from '@/lib/media/job/store-supabase'

// ── Estimate ─────────────────────────────────────────────────────────────────

/**
 * What this execution may cost, in SEK, as a conservative upper bound.
 *
 * ── WHY THIS IS NOT A BRANCH IN `estimateImageSek` ─────────────────────────
 * `lib/cost/budget-gate.ts` prices images as
 * `rate ?? <hardcoded fallback>` — correct for Ideogram and gpt-image, whose
 * fallbacks ARE the real prices. A `'muapi'` branch there would need a fallback
 * constant, and Omnira has no proven MuAPI price to put in one. A plausible
 * number in that position is exactly the "fake production price to satisfy the
 * gate" this phase was told not to write.
 *
 * So the media-specific rule lives here and reads the SAME accessor
 * (`getRates`, the one price accessor since G1). No second table, no second
 * currency, no second fallback — and a missing rate REFUSES instead of guessing.
 */
export type MuapiEstimate =
  | { readonly ok: true; readonly estimatedSek: number; readonly basis: string }
  | { readonly ok: false; readonly reason: string }

export async function estimateMuapiImageSek(
  resource: MuapiResourceDescriptor,
  billable: boolean,
): Promise<MuapiEstimate> {
  const admission = admitMuapiSpend(resource, {
    allowed: true, reason: null, code: null, billable,
  })

  if (!admission.admitted) return { ok: false, reason: admission.reason }

  if (admission.basis === 'non_billable_sandbox') {
    // ZERO IS THE TRUE FIGURE, not a convenience. A sandbox key returns mock
    // outputs and is never charged, and `config.ts` cannot hand a test-mode
    // caller the production key, so no amount of money can move on this path.
    //
    // The reservation is still taken. That is deliberate: it keeps the ONE
    // ordering that matters — project resolution, then the G3C-1 stop check,
    // then dispatch — binding on a sandbox run exactly as on a paid one. A
    // paused platform must stop a free generation too.
    return { ok: true, estimatedSek: 0, basis: 'non_billable_sandbox' }
  }

  const rates = await getRates()
  const usd = rates[admission.costRateKey]
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) {
    // The descriptor named a key and the table does not carry it. Refuse — a
    // configured key that resolves to nothing must never become a zero estimate.
    return {
      ok: false,
      reason: `cost_rates has no usable value for "${admission.costRateKey}", so a billable `
        + `MuAPI "${resource.name}" execution cannot be priced`,
    }
  }
  const usdSek = rates.usd_sek
  if (typeof usdSek !== 'number' || !Number.isFinite(usdSek) || usdSek <= 0) {
    return { ok: false, reason: 'cost_rates has no usable usd_sek conversion' }
  }
  return { ok: true, estimatedSek: usd * usdSek, basis: `cost_rate:${admission.costRateKey}` }
}

// ── Dispatch classification ──────────────────────────────────────────────────

/**
 * Turn a thrown provider failure into the four-way dispatch classification.
 *
 * THE ADAPTER ALREADY DID THE HARD PART. `muapi.ts` sets `dispatchObservation`
 * on every failure raised by a `creates: true` call, because it is the only
 * layer that knows whether the failure happened before or after its own
 * `fetch`. This function READS that judgement; it does not re-derive it, and it
 * deliberately has no heuristic of its own to fall back on.
 *
 * A failure carrying NO observation is one raised before the network — a gate
 * refusal, a missing credential, an unsupported capability. Those are
 * structurally pre-send (`dispatch.ts`: "the strongest signal comes from
 * POSITION"), so `not_dispatched` is proven rather than assumed.
 *
 * `partially_applied` cannot arise from a single image create and is mapped to
 * `unknown` alongside the others rather than being silently dropped.
 */
export function classifyProviderDispatchFailure(err: unknown): MediaDispatchResult {
  const e = toMediaProviderError(err, 'muapi')
  const observation = e.dispatchObservation

  if (observation === 'response_lost'
    || observation === 'confirmed_evidence_failed'
    || observation === 'partially_applied') {
    return {
      kind: 'unknown',
      observation,
      error: e.toShape(),
      detail: e.message,
    }
  }

  if (observation === 'remote_rejected') {
    return { kind: 'definitely_failed', observation: 'remote_rejected', error: e.toShape() }
  }

  // `not_dispatched`, `remote_confirmed` (impossible on a throw), and null all
  // land here. Null is the pre-network refusal described above; a thrown
  // `remote_confirmed` would be a contradiction and is treated as the safe,
  // non-billing case only because a THROW means no ref was ever produced.
  return { kind: 'definitely_failed', observation: 'not_dispatched', error: e.toShape() }
}

/** A refusal by an Omnira authority, expressed as what it provably is. */
function refusalAsDispatchResult(kind: 'spend' | 'stop', message: string): MediaDispatchResult {
  return {
    kind: 'definitely_failed',
    observation: 'not_dispatched',
    error: new MediaProviderError({
      // The gate vocabulary is the right one here and the message says which
      // gate: `withGovernedSpend` refuses BEFORE `run()` in both cases, so no
      // request was built, no credential was read, and nothing can be billing.
      code: 'MEDIA_EXECUTION_DISABLED',
      message: `[muapi] dispatch refused by the ${kind} authority before any request was `
        + `built: ${message}`,
      provider: 'muapi',
      retryable: false,
      dispatchObservation: 'not_dispatched',
    }).toShape(),
  }
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface GovernedProviderDispatchInput {
  /** The provider the orchestrator selected. Never resolved here. */
  provider: MediaProvider
  /** The concrete resource the orchestrator resolved. Never chosen here. */
  resource: MuapiResourceDescriptor

  /** BILLING attribution. Passed through to the one spend boundary. */
  project: ProjectRef
  /** EXECUTION classification. Which stop authorities bind this dispatch. */
  execution: ExecutionContract
  /** Ownership of the job row and the admitted asset. */
  projectId: string
  /** Recorded on `cost_events.operation` and on the job's provenance. */
  operation: string

  prompt: string
  negativePrompt?: string
  aspectRatio?: string
  /** Per-provider request extras. Reaches the request BODY and nothing else. */
  providerOptions?: Readonly<Record<string, unknown>>

  /** Hash of the canonical brief. The payload itself is never persisted. */
  briefHash: string
  storagePath: string
  visibility?: AssetVisibility
  referenceAssetIds?: readonly AssetId[]
  provenance?: {
    brief?: unknown
    request?: unknown
    providerMetadata?: Record<string, unknown>
  }

  /** Injection seams. Production uses the durable store and the real clock. */
  store?: MediaJobStore
  schedule?: Parameters<typeof runMediaJob>[0]['schedule']
  signal?: AbortSignal
  now?: () => string
}

export interface GovernedProviderDispatchResult extends RunMediaJobResult {
  admitted: AdmittedAsset
  /** Which model actually ran, echoed so a caller records the truth. */
  model: string
  /** Whether this ran on a sandbox credential. Carried, never inferred later. */
  simulated: boolean
  estimateBasis: string
}

// ── The adapter ──────────────────────────────────────────────────────────────

/**
 * Run one provider-layer generation, end to end, under governance.
 *
 * ONE DISPATCH. There is no loop, no retry and no second candidate in this
 * function — `runMediaJob` retries STATUS READS only, and this file gives it no
 * ability to create anything a second time.
 */
export async function runGovernedProviderJob(
  input: GovernedProviderDispatchInput,
): Promise<GovernedProviderDispatchResult> {
  const providerId: MediaProviderId = input.provider.id

  // ASK THE PROVIDER WHAT IT IS. `describe()` is the published, network-free
  // self-description, and it is the SAME evaluation that decided whether the
  // call may happen at all — so the estimate and the gate cannot disagree.
  //
  // Deliberately NOT a second `resolveMuapiConfig()` here. Two reads of one
  // environment are two answers, and the one feeding a spend estimate must not
  // be the copy. Nothing in this branch re-decides whether a call is ALLOWED —
  // the adapter refuses that on its own, so there is exactly one gate.
  const status = input.provider.describe()
  const simulated = !status.billable

  const estimate = await estimateMuapiImageSek(input.resource, status.billable)
  if (!estimate.ok) {
    // BEFORE the job row exists, because nothing has been attempted: an
    // unpriceable execution is not a dispatch that failed, it is a dispatch that
    // was never begun. Writing a DISPATCHING row for it would be a lie.
    throw new SpendRefusedError({
      reason: 'invalid_estimate',
      provider: providerId,
      operation: input.operation,
      detail: estimate.reason,
    })
  }

  /**
   * Captured so a refusal can be re-thrown to the caller AFTER the job row has
   * correctly recorded `not_dispatched`. `runMediaJob` reports a definite
   * failure as a `MediaJobError`, which is right for the lifecycle and wrong for
   * a caller that needs to distinguish "budget said no" from "the vendor said
   * no".
   */
  let authorityRefusal: SpendRefusedError | ExecutionStoppedError | null = null
  /** Set inside the governed block so the classification survives the throw. */
  let classified: MediaDispatchResult | null = null
  /** The vendor's own handle, kept for the ungoverned status reads. */
  let acceptedRef: MediaJobRef | null = null
  let dispatchCount = 0

  const dispatch = async (): Promise<MediaDispatchResult> => {
    try {
      await withGovernedSpend(
        {
          project: input.project,
          execution: input.execution,
          provider: providerId,
          operation: input.operation,
          estimatedSek: estimate.estimatedSek,
          // No idempotency key. `governed-spend.ts` records that every retry
          // wrapper in this codebase sits OUTSIDE the boundary, so a key would
          // turn a retryable failure into a spend refusal. This path retries
          // nothing, so a key would buy nothing and could only misfire.
        },
        async () => {
          try {
            // A capability refusal is raised INSIDE this try on purpose. It is
            // structurally pre-send — no request is built — so it must reach the
            // classifier and become `not_dispatched`, which releases the
            // reservation. Raised outside, it would escape as an unclassified
            // throw, settle the reservation for a call that never happened, and
            // strand the job row in DISPATCHING.
            if (!input.provider.generateImage) {
              throw new MediaProviderError({
                code: 'MEDIA_CAPABILITY_UNSUPPORTED',
                message: `[${providerId}] does not implement generateImage.`,
                provider: providerId,
                retryable: false,
              })
            }
            // ── THE ONLY BILLABLE ACT IN THIS FILE ────────────────────────
            dispatchCount += 1
            const ref = await input.provider.generateImage({
              model: input.resource.name,
              prompt: input.prompt,
              ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
              ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
            })
            acceptedRef = ref
            const accepted = acceptRemoteOperationId(ref.requestId)
            if (!accepted.ok) {
              // Unreachable while `muapi.ts` is correct — it already refuses an
              // unusable id as UNKNOWN. Kept because a DIFFERENT provider may
              // one day reach this code, and "the vendor accepted it and we
              // cannot name it" must never degrade into a definite failure.
              throw new MediaProviderError({
                code: 'MEDIA_DISPATCH_UNKNOWN',
                message: `[${providerId}] accepted the request but returned an operation id `
                  + `Omnira cannot use (${accepted.refusal}).`,
                provider: providerId,
                dispatchObservation: 'confirmed_evidence_failed',
              })
            }
            classified = {
              kind: 'accepted',
              remoteOperationId: accepted.id,
              acceptedAt: ref.submittedAt,
            }
            return
          } catch (err) {
            const result = classifyProviderDispatchFailure(err)
            classified = result
            if (result.kind === 'definitely_failed') {
              // The ONLY way headroom comes back. Both observations that reach
              // here are provable claims that nothing was billed:
              // `not_dispatched` (never left the machine) and `remote_rejected`
              // (a 4xx — the vendor answered and did no work).
              throw new ProviderNotDispatchedError(
                `${providerId} dispatch provably not billed (${result.observation})`,
                err,
              )
            }
            // AMBIGUOUS. Rethrown so `withGovernedSpend` SETTLES: a lost
            // response may already have been charged, and handing the headroom
            // back would let the next caller spend it a second time.
            throw err
          }
        },
      )
    } catch (err) {
      if (classified) return classified
      // Nothing was dispatched — `withGovernedSpend` refuses before `run()` in
      // both of these cases, so the claim is positional and provable.
      if (err instanceof SpendRefusedError) {
        authorityRefusal = err
        return refusalAsDispatchResult('spend', `${err.reason}`)
      }
      if (err instanceof ExecutionStoppedError) {
        authorityRefusal = err
        return refusalAsDispatchResult('stop', err.message)
      }
      throw err
    }
    // `withGovernedSpend` resolved, so the closure returned without throwing,
    // which it can only do after setting `classified`. Asserted rather than
    // cast: a future edit that adds an early return would otherwise hand
    // `runMediaJob` an undefined result and fail somewhere far from the cause.
    const settled: MediaDispatchResult | null = classified
    if (!settled) {
      throw new Error(
        '[governed-dispatch] INVARIANT VIOLATED: the governed block completed without '
        + 'classifying the dispatch',
      )
    }
    return settled
  }

  /**
   * ONE STATUS READ. Ungoverned, by contract: this is the closure `run.ts`
   * documents as "UNGOVERNED, and must stay that way". It creates nothing, and
   * structurally cannot — it calls `getStatus`, which is a GET.
   */
  const observe = async (remoteOperationId: string): Promise<MediaJobResult> => {
    const ref: MediaJobRef = acceptedRef ?? {
      provider: providerId,
      requestId: remoteOperationId,
      model: input.resource.name,
      submittedAt: new Date(0).toISOString(),
      mode: simulated ? 'test' : 'production',
    }
    return input.provider.getStatus({ ...ref, requestId: remoteOperationId })
  }

  try {
    const result = await runMediaJob({
      store: input.store ?? createSupabaseMediaJobStore(),
      projectId: input.projectId,
      provider: providerId,
      model: input.resource.name,
      kind: 'image',
      briefHash: input.briefHash,
      simulated,
      dispatch,
      observe,
      storagePath: input.storagePath,
      visibility: input.visibility,
      provenance: {
        brief: input.provenance?.brief,
        request: input.provenance?.request,
        referenceAssetIds: input.referenceAssetIds,
        providerMetadata: {
          ...input.provenance?.providerMetadata,
          // The facts a later reader needs and cannot re-derive: which resource
          // actually ran, and on what pricing basis it was admitted.
          providerResource: input.resource.name,
          providerResourceCategory: input.resource.vendorCategory,
          estimateBasis: estimate.basis,
          estimatedSek: estimate.estimatedSek,
        },
      },
      schedule: input.schedule,
      signal: input.signal,
      now: input.now,
    })

    return {
      ...result,
      model: input.resource.name,
      simulated,
      estimateBasis: estimate.basis,
    }
  } catch (err) {
    // The job row has already recorded the refusal accurately as
    // `not_dispatched` / FAILED. Now give the CALLER the error that carries the
    // reason, rather than a generic dispatch failure — the same policy
    // `orchestrate.ts` already applies to the two bridge adapters.
    if (authorityRefusal) throw authorityRefusal
    throw err
  } finally {
    // A structural assertion, not a log: this function must make at most one
    // create call. If a future edit introduces a loop, this fails loudly here
    // rather than quietly on a bill.
    if (dispatchCount > 1) {
      throw new Error(
        `[governed-dispatch] INVARIANT VIOLATED: ${dispatchCount} provider dispatches for one job`,
      )
    }
  }
}

/** Re-exported so a caller can price a candidate without importing the adapter. */
export { findMuapiImageResource }
