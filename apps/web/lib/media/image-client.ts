/**
 * lib/media/image-client.ts — the sanctioned way to generate a billable image.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Ideogram is Omnira's largest single spend line — 157.92 SEK of 232.56 SEK in
 * the audited month — and it was reached by six `fetch('https://api.ideogram.ai/…')`
 * calls scattered across four modules, none of them reserving budget. The URL,
 * the header name and the error handling were copy-pasted at each one, so every
 * new image feature started by duplicating an ungoverned network call.
 *
 * This module owns the Ideogram network boundary. Callers pass a body and get a
 * URL; they never see the hostname or the credential.
 *
 * ── ESTIMATE ────────────────────────────────────────────────────────────────
 * Images are the easy case: cost is per image and known before the call, from
 * the same `cost_rates` row (`ideogram_v3_usd_per_image`) that `logImageCost`
 * uses to write the ledger. Estimate and ledger cannot drift because they read
 * one accessor.
 *
 * ── A REFUSED REQUEST IS NOT A CHARGE ───────────────────────────────────────
 * A transport failure means the request never landed, and a 4xx means Ideogram
 * rejected it before rendering. Both release the reservation. A 5xx or a timeout
 * does NOT: the render may have run, and handing that budget back would let the
 * next caller spend it twice.
 */

import 'server-only'

import { logImageCost } from '@/lib/cost/track'
import { estimateImageSek } from '@/lib/cost/budget-gate'
import {
  ProviderNotDispatchedError,
  withGovernedSpend,
  resolveGovernedProjectId,
  type ProjectRef,
} from '@/lib/cost/governed-spend'
import type { ExecutionContract } from '@/lib/governance/execution-stop'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  admitPhysicalRequest, watchExecutionAuthority, composeAbortSignals,
  authorityForRequest, GovernanceDispatchUnknownError,
  type RunBoundAuthority, type AbortReason,
} from '@/lib/governance/execution-signal'
import {
  ProviderDispatchUnknownError,
  classifyTransportFailure,
  statusProvesNotCreated,
} from '@/lib/media/job/dispatch'

const IDEOGRAM_V3_GENERATE = 'https://api.ideogram.ai/v1/ideogram-v3/generate'

export interface ImageGovernanceContext {
  /**
   * REQUIRED execution classification — why this work runs and which stop
   * authorities bind it. Propagated to the governed boundary, never defaulted
   * here: this module serves several upstream execution modes, so a default set
   * at this layer would be a guess made far from the only place that knows.
   */
  execution: ExecutionContract
  /** Required. Which budget this image is charged to. */
  project: ProjectRef
  /** Recorded on cost_events.operation, e.g. 'Scene Image'. */
  operation: string
  agent?: string
  /**
   * G3C-3C-A · E2. Present when a CLAIMED run owns this call. Absent means the
   * adapter derives CONTRACT_ONLY — never that the call is unwatched.
   */
  authority?: RunBoundAuthority
  /** Live in-flight state, for a step that aggregates every physical flight. */
  onFlight?: (f: { readonly authorityUnavailable: boolean; readonly abortReason: AbortReason | null }) => void
  runId?: string | null
  scriptId?: string | null
  /** Stable identity for THIS image. Omit unless the subject is truly unique. */
  idempotencyKey?: string
}

/**
 * Generate one Ideogram v3 image.
 *
 * `body` is passed through untouched, so prompt, aspect ratio, style, negative
 * prompt and rendering speed keep the exact semantics each call site had before.
 * Returns the hosted URL, and writes `cost_events` on success.
 */
export async function generateIdeogramV3(
  ctx: ImageGovernanceContext,
  body: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  // Refuse before reserving: a missing credential is not a spend decision.
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set')

  const estimatedSek = await estimateImageSek(1, 'ideogram')

  return withGovernedSpend(
    { project: ctx.project, execution: ctx.execution, provider: 'ideogram', operation: ctx.operation, estimatedSek,
      idempotencyKey: ctx.idempotencyKey },
    async () => {
      let res: Response
      try {
        res = await fetch(IDEOGRAM_V3_GENERATE, {
          method: 'POST',
          headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (e) {
        // ── THE AMBIGUITY BOUNDARY ──────────────────────────────────────────
        //
        // This used to claim `ProviderNotDispatchedError` for EVERY thrown
        // fetch, which is a positive claim ("nothing was billed") that a reset
        // or a fired deadline cannot support. It had two costs: the reservation
        // was RELEASED for a render that may have run, and the failure read as
        // retryable, so the caller rendered a second paid image.
        //
        // `classifyTransportFailure` answers only when it can prove the safe
        // case — the same rule `lib/ai/anthropic.ts` states as "a timeout, a 5xx
        // or an aborted socket is NOT here on purpose". There is deliberately no
        // branch that guesses toward the convenient answer.
        const verdict = classifyTransportFailure(e)
        if (verdict.sent === false) {
          throw new ProviderNotDispatchedError(
            `ideogram request never reached the provider (${verdict.code})`, e)
        }
        throw new ProviderDispatchUnknownError({
          provider: 'ideogram', observation: 'response_lost', detail: verdict.detail, cause: e,
        })
      }

      if (!res.ok) {
        const err = await res.text()
        const failure = new Error(`Ideogram API error ${res.status} (${ctx.operation}): ${err}`)
        // 4xx is the vendor ANSWERING: it parsed the request and declined to
        // render. 5xx is not an answer about the work — a gateway in front of
        // the renderer may have given up after it had already started.
        if (statusProvesNotCreated(res.status)) {
          throw new ProviderNotDispatchedError(`ideogram refused with ${res.status}`, failure)
        }
        // The vendor's own text is carried into the message, not just onto the
        // cause: every existing log line and assertion reads `err.message`, and
        // dropping the response body would make a 5xx harder to diagnose than
        // it was before this file learned to classify.
        throw new ProviderDispatchUnknownError({
          provider: 'ideogram', observation: 'response_lost',
          detail: `${failure.message} — a ${res.status} says nothing about whether it rendered`,
          cause: failure,
        })
      }

      const data = (await res.json()) as { data?: Array<{ url?: string }> }
      const url = data.data?.[0]?.url
      // The vendor answered 2xx, so the image was rendered and billed. What was
      // lost is our ability to NAME it. Typed rather than a plain Error, so the
      // caller can see it is an evidence failure and not a generation failure —
      // it already settled correctly, and now it also refuses a repeat.
      if (!url) {
        throw new ProviderDispatchUnknownError({
          provider: 'ideogram', observation: 'confirmed_evidence_failed',
          detail: `the provider returned 2xx with no image URL (${ctx.operation})`,
        })
      }

      await logImageCost(1, 'ideogram', {
        ...('projectId' in ctx.project
          ? { projectId: ctx.project.projectId }
          : { projectSlug: ctx.project.projectSlug }),
        agent: ctx.agent,
        operation: ctx.operation,
        runId: ctx.runId ?? null,
        scriptId: ctx.scriptId ?? null,
      })

      return url
    },
  )
}

// ── Ideogram legacy /generate ───────────────────────────────────────────────
// `lib/ai/runner.ts` talks to a DIFFERENT Ideogram endpoint from the media
// pipeline: the older `/generate` route, bearer-authenticated, with the request
// wrapped in `image_request`. It is kept as its own function rather than
// normalised into the v3 helper — silently switching an endpoint would change
// image output for the saga and activity books, which is a product change and
// not this refactor's business.

const IDEOGRAM_LEGACY_GENERATE = 'https://api.ideogram.ai/generate'

/** Carries the provider status so a caller can keep its own 429 backoff. */
export class IdeogramHttpError extends Error {
  readonly status: number
  constructor(status: number, body: string) {
    super(`Ideogram API ${status}: ${body.slice(0, 300)}`)
    this.name = 'IdeogramHttpError'
    this.status = status
  }
}

export interface IdeogramLegacyResult {
  url?: string
  is_image_safe?: boolean
  seed?: number
  resolution?: string
}

/**
 * One governed attempt against the legacy endpoint. Retry and backoff stay with
 * the caller, so each ATTEMPT reserves — which is correct: every attempt that
 * reaches Ideogram is a separate potential charge.
 */
export async function generateIdeogramLegacy(
  ctx: ImageGovernanceContext,
  imageRequest: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<IdeogramLegacyResult | null> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set')

  const estimatedSek = await estimateImageSek(1, 'ideogram')

  return withGovernedSpend(
    { project: ctx.project, execution: ctx.execution, provider: 'ideogram', operation: ctx.operation, estimatedSek },
    async () => {
      // ── G3C-3C-A · E2 · A CLAIMED RUN REACHES THIS PROVIDER TOO ──────────
      // This is the saga/activity image path of a RUN_BOUND workflow run, and
      // until now it had the contract stop gate above and nothing else: no
      // pre-dispatch re-check, no in-flight watcher. A cancellation committed
      // during a 90-second Ideogram call was invisible here, and the retry loop
      // above would happily start the next attempt.
      const authority = authorityForRequest(
        ctx.execution,
        async ref => { const r = await resolveGovernedProjectId(ref); return r.ok ? r.projectId : null },
        ctx.authority,
      )
      await admitPhysicalRequest(() => createAdminClient(), authority, 'ideogram')
      const watch = watchExecutionAuthority(() => createAdminClient(), authority)
      // The 90s timeout is KEPT and composed, not replaced: it bounds a hung
      // socket, which is a different failure from a governance stop.
      const composed = composeAbortSignals([watch.signal, init?.signal])
      const release = () => { composed.dispose(); watch.dispose() }
      ctx.onFlight?.({
        get authorityUnavailable() { return watch.authorityUnavailable },
        get abortReason() { return watch.abortReason },
      })

      let res: Response
      try {
        res = await fetch(IDEOGRAM_LEGACY_GENERATE, {
          method: 'POST',
          signal: composed.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_request: imageRequest }),
        })
      } catch (e) {
        release()
        // Governance first: the transport classifier below cannot tell a
        // governance abort from a network reset, and only one of them means
        // the request may already be running remotely.
        if (watch.abortReason) {
          throw new GovernanceDispatchUnknownError('ideogram', watch.abortReason, e)
        }
        // Same boundary as the v3 path above, and the same reason. This one
        // matters MORE, not less: `lib/ai/runner.ts` calls it under a 90-second
        // `AbortSignal.timeout`, so an abort AFTER the request was written is a
        // routine event here, and it is exactly the case a not-dispatched claim
        // cannot support.
        const verdict = classifyTransportFailure(e)
        if (verdict.sent === false) {
          throw new ProviderNotDispatchedError(
            `ideogram request never reached the provider (${verdict.code})`, e)
        }
        throw new ProviderDispatchUnknownError({
          provider: 'ideogram', observation: 'response_lost', detail: verdict.detail, cause: e,
        })
      }

      try {
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const failure = new IdeogramHttpError(res.status, body)
        // A 4xx — 429 included — is a refusal, not a render: nothing was billed,
        // so the headroom goes back immediately rather than ageing out and
        // starving a retry. `statusProvesNotCreated` is the same 400..499 rule,
        // named once and shared with the job lifecycle.
        if (statusProvesNotCreated(res.status)) {
          throw new ProviderNotDispatchedError(`ideogram refused with ${res.status}`, failure)
        }
        // 5xx: ambiguous. The `IdeogramHttpError` is kept as the CAUSE so a
        // caller inspecting `err.cause.status` — `lib/ai/runner.ts` does — still
        // sees the status it always saw.
        throw new ProviderDispatchUnknownError({
          provider: 'ideogram', observation: 'response_lost',
          detail: `${failure.message} — a ${res.status} says nothing about whether it rendered`,
          cause: failure,
        })
      }

      const json = (await res.json()) as { data?: IdeogramLegacyResult[] }
      const first = json.data?.[0] ?? null
      if (first) {
        await logImageCost(1, 'ideogram', {
          ...('projectId' in ctx.project
            ? { projectId: ctx.project.projectId }
            : { projectSlug: ctx.project.projectSlug }),
          agent: ctx.agent,
          operation: ctx.operation,
          runId: ctx.runId ?? null,
        })
      }
      return first
      } catch (e) {
        // ── F3 · A GOVERNANCE ABORT DURING THE BODY IS STILL GOVERNANCE ──────
        // Headers arriving does not end the physical request: `res.json()` and
        // `res.text()` above are still reading from a live socket, and the
        // watcher is still live with them. An abort here surfaces as an
        // ordinary body-read failure, and passing it through would lose the
        // provenance — the runner would see a provider defect and its retry
        // loop would re-dispatch work governance just stopped.
        //
        // Only governance-triggered failures are re-typed. Everything else
        // keeps today's transport/certainty semantics exactly.
        if (watch.abortReason) {
          throw new GovernanceDispatchUnknownError('ideogram', watch.abortReason, e)
        }
        throw e
      } finally {
        // The body is read above, so the physical request ends HERE — not at
        // headers. One `finally` covers every exit: ok, refusal, ambiguity.
        release()
      }
    },
  )
}
