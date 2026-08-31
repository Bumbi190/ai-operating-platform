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
  type ProjectRef,
} from '@/lib/cost/governed-spend'

const IDEOGRAM_V3_GENERATE = 'https://api.ideogram.ai/v1/ideogram-v3/generate'

export interface ImageGovernanceContext {
  /** Required. Which budget this image is charged to. */
  project: ProjectRef
  /** Recorded on cost_events.operation, e.g. 'Scene Image'. */
  operation: string
  agent?: string
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
    { project: ctx.project, provider: 'ideogram', operation: ctx.operation, estimatedSek,
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
        throw new ProviderNotDispatchedError('ideogram request never reached the provider', e)
      }

      if (!res.ok) {
        const err = await res.text()
        const failure = new Error(`Ideogram API error ${res.status} (${ctx.operation}): ${err}`)
        // 4xx: rejected before rendering, so nothing was billed. 5xx: it may
        // have rendered and failed to return — that is ambiguous, and settles.
        if (res.status < 500) {
          throw new ProviderNotDispatchedError(`ideogram refused with ${res.status}`, failure)
        }
        throw failure
      }

      const data = (await res.json()) as { data?: Array<{ url?: string }> }
      const url = data.data?.[0]?.url
      // The image was rendered and billed even if the payload surprised us, so
      // this throw is ambiguous by design and must NOT release the reservation.
      if (!url) throw new Error(`Ideogram returned no image URL (${ctx.operation})`)

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
    { project: ctx.project, provider: 'ideogram', operation: ctx.operation, estimatedSek },
    async () => {
      let res: Response
      try {
        res = await fetch(IDEOGRAM_LEGACY_GENERATE, {
          method: 'POST',
          signal: init?.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_request: imageRequest }),
        })
      } catch (e) {
        throw new ProviderNotDispatchedError('ideogram request never reached the provider', e)
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const failure = new IdeogramHttpError(res.status, body)
        // A 429 is a refusal, not a render: nothing was billed, so the headroom
        // goes back immediately rather than ageing out and starving a retry.
        if (res.status < 500) {
          throw new ProviderNotDispatchedError(`ideogram refused with ${res.status}`, failure)
        }
        throw failure
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
    },
  )
}
