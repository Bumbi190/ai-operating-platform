/**
 * lib/ai/anthropic.ts — the sanctioned way to reach Anthropic.
 *
 * ── WHY A FACTORY AND NOT 20 CALL SITES ─────────────────────────────────────
 * The Governance Hard Gate audit found `new Anthropic()` constructed inline in
 * 20 runtime modules — API routes, cron handlers, library helpers — none of them
 * reserving budget. There was no chokepoint to attach a gate to, so the gate
 * that existed guarded one ElevenLabs function and nothing else.
 *
 * `getAnthropic(ctx)` returns a client whose `messages.create` and
 * `messages.stream` are governed: an upper-bound estimate is reserved BEFORE the
 * request is dispatched, the real cost is written to `cost_events` afterwards,
 * and the reservation is settled. Migrating a call site is a one-line change,
 * so the request shape, model, tools, temperature and error handling at each
 * site stay exactly as they were. This is a governance refactor, not a rewrite.
 *
 * ── ESTIMATING BEFORE THE ANSWER EXISTS ─────────────────────────────────────
 * A completion's cost is only known once it returns, which is precisely why a
 * post-hoc ledger cannot bound spend. The reservation therefore uses a
 * conservative UPPER BOUND: measured input tokens plus the FULL `max_tokens` the
 * caller asked for, priced through the shared `MODEL_PRICING`. A request can
 * never cost more than that, so the reservation can never under-reserve — which
 * matters because the reservation is what a concurrent caller sees.
 *
 * Input tokens are approximated from character count rather than tokenised: a
 * real tokeniser would mean a second dependency and a second source of truth for
 * a number that only feeds an upper bound. The ratio is deliberately pessimistic.
 *
 * ── THE LEDGER STILL RECORDS REALITY ────────────────────────────────────────
 * `cost_events` is written from `response.usage` — the actual tokens — through
 * the same `logLlmCost` every call site used before. The estimate bounds the
 * spend; the ledger records it. Reconciling the two is deferred to G2.
 */

import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { getModelPricing } from './pricing'
import { logLlmCost, type CostContext } from '@/lib/cost/track'
import { getRates } from '@/lib/cost/rates'
import {
  watchExecutionAuthority, composeAbortSignals, authorityForRequest,
  type RunBoundAuthority, type AbortReason,
} from '@/lib/governance/execution-signal'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveGovernedProjectId } from '@/lib/cost/governed-spend'
import {
  ProviderNotDispatchedError,
  withGovernedSpend,
  type ProjectRef,
} from '@/lib/cost/governed-spend'
import type { ExecutionContract } from '@/lib/governance/execution-stop'

/** Everything the boundary needs that the SDK does not carry. */
export interface AnthropicGovernanceContext {
  /**
   * REQUIRED execution classification — why this work runs and which stop
   * authorities bind it. Propagated to the governed boundary, never defaulted
   * here: this module serves several upstream execution modes, so a default set
   * at this layer would be a guess made far from the only place that knows.
   */
  execution: ExecutionContract
  /**
   * G3C-3C-A. Present only when a CLAIMED RUN owns this call. Absence means
   * CONTRACT_ONLY derived from `execution` — watched for stops, never for
   * cancellation or fencing, because it owns no run.
   */
  authority?: RunBoundAuthority
  /** Caller/request-disconnect signal, composed with governance — not replaced. */
  signal?: AbortSignal
  /** Required. Which budget this call is charged to. */
  project: ProjectRef
  /** Recorded on cost_events.agent, e.g. 'Script Writer'. */
  agent?: string
  /**
   * Called with a promise that settles when a STREAM actually terminates —
   * completion, error or abort. Non-streaming calls never invoke it.
   *
   * It exists so the caller can hold an in-flight authority watcher for the
   * stream's true lifetime instead of the handle's. Optional: callers that do
   * not watch authority simply omit it.
   */
  onStreamSettled?: (settled: Promise<unknown>) => void
  /**
   * Hands back LIVE flight state for a stream. Read it AFTER settlement: a
   * boolean copied when the handle returned would answer for a flight that had
   * barely begun, and authority can become unavailable long afterwards.
   */
  onFlight?: (flight: PhysicalFlight | undefined) => void
  /** Recorded on cost_events.operation, e.g. 'Generate Script'. */
  operation?: string
  runId?: string | null
  scriptId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Characters per token, deliberately LOW so the token count comes out high.
 * English averages ~4 and Swedish rather less; 3 keeps the estimate on the
 * pessimistic side of both, which is the only safe direction for a ceiling.
 */
const CHARS_PER_TOKEN = 3

function textLength(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) {
    return content.reduce<number>((sum, block) => {
      if (typeof block === 'string') return sum + block.length
      if (block && typeof block === 'object') {
        const b = block as { text?: unknown; content?: unknown }
        if (typeof b.text === 'string') return sum + b.text.length
        if (b.content !== undefined) return sum + textLength(b.content)
      }
      // An image or document block has real token cost we cannot measure here.
      // Charge a flat allowance rather than zero: unmeasured must never mean free.
      return sum + 4_000
    }, 0)
  }
  return 0
}

/** Upper bound in SEK for one messages request. Never optimistic. */
export async function estimateAnthropicSek(
  params: { model: string; max_tokens: number; system?: unknown; messages?: unknown[]; tools?: unknown },
): Promise<number> {
  const rates = await getRates()
  const pricing = getModelPricing(params.model)

  const promptChars =
    textLength(params.system)
    + (params.messages ?? []).reduce<number>(
      (sum, m) => sum + textLength((m as { content?: unknown })?.content), 0)
    + textLength(params.tools)

  const tokensIn = Math.ceil(promptChars / CHARS_PER_TOKEN)
  // The whole output allowance, not an expected value: the caller may use all of it.
  const tokensOut = Math.max(0, params.max_tokens || 0)

  const usd =
    (tokensIn / 1_000_000) * pricing.inputPer1M
    + (tokensOut / 1_000_000) * pricing.outputPer1M

  return usd * (rates.usd_sek ?? 10.5)
}

/**
 * An SDK error that proves no billable work happened.
 *
 * Authentication, malformed-request and not-found failures are rejected by
 * Anthropic before any inference runs, so releasing the reservation is a claim
 * we can defend. A timeout, a 5xx or an aborted socket is NOT here on purpose —
 * those may have been billed, and `withGovernedSpend` settles them.
 */
function provablyNotBilled(e: unknown): boolean {
  const status = (e as { status?: unknown })?.status
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 422
}

/** Live view of one in-flight physical request, plus its disposer. */
export interface PhysicalFlight {
  readonly signal: AbortSignal
  readonly authorityUnavailable: boolean
  readonly abortReason: AbortReason | null
  dispose(): void
}

/**
 * Opens an in-flight authority watch for ONE physical request.
 *
 * RUN_BOUND when a claimed run owns the call; CONTRACT_ONLY otherwise — never
 * unwatched. The resolver is injected here because this module already imports
 * the spend layer and the governance module deliberately does not.
 */
function beginPhysicalFlight(ctx: AnthropicGovernanceContext): PhysicalFlight {
  const authority = authorityForRequest(
    ctx.execution,
    async ref => { const r = await resolveGovernedProjectId(ref); return r.ok ? r.projectId : null },
    ctx.authority,
  )
  // Thunk, not an instance: a call that finishes inside one poll interval
  // never builds a client, and a context without credentials latches
  // AUTHORITY_UNAVAILABLE instead of throwing.
  const watch = watchExecutionAuthority(() => createAdminClient(), authority)
  const composed = composeAbortSignals([watch.signal, ctx.signal])
  return {
    signal: composed.signal,
    get authorityUnavailable() { return watch.authorityUnavailable },
    get abortReason() { return watch.abortReason },
    dispose() { composed.dispose(); watch.dispose() },
  }
}

/** Runs ONE raw non-streaming request under in-flight authority. */
async function governedPhysical<T>(
  ctx: AnthropicGovernanceContext,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const flight = beginPhysicalFlight(ctx)
  try {
    const value = await run(flight.signal)
    ctx.onFlight?.(flight)
    return value
  } finally {
    flight.dispose()
  }
}

/** One place the credential is read. Callers never pass a key. */
function raw(): Anthropic {
  // ── G3C-3C-A · maxRetries: 0 ────────────────────────────────────────────
  // Same reasoning as the OpenAI client: the SDK default is 2 and its retry is
  // internal recursion, so attempts 2 and 3 were invisible to every governance
  // boundary and to any in-flight watcher. One invocation, one physical attempt.
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
}

function costContext(ctx: AnthropicGovernanceContext): CostContext {
  return {
    ...('projectId' in ctx.project
      ? { projectId: ctx.project.projectId }
      : { projectSlug: ctx.project.projectSlug }),
    agent: ctx.agent,
    operation: ctx.operation,
    runId: ctx.runId ?? null,
    scriptId: ctx.scriptId ?? null,
    metadata: ctx.metadata,
  }
}

/**
 * A governed, drop-in replacement for `new Anthropic()`.
 *
 * Exposes only `messages.create` and `messages.stream` — the two methods the
 * codebase actually uses. Anything else is deliberately absent: a passthrough
 * `any` client would be a hole straight back to an ungoverned SDK.
 */
export function getAnthropic(ctx: AnthropicGovernanceContext) {
  return {
    messages: {
      async create(
        params: Anthropic.MessageCreateParamsNonStreaming,
        options?: Anthropic.RequestOptions,
      ): Promise<Anthropic.Message> {
        const estimatedSek = await estimateAnthropicSek(params)
        return withGovernedSpend(
          {
            project: ctx.project, execution: ctx.execution,
            provider: 'anthropic',
            operation: ctx.operation ?? 'messages.create',
            estimatedSek,
          },
          async () => {
            let message: Anthropic.Message
            try {
              // ── G3C-3C-A · ONE PHYSICAL REQUEST ─────────────────────────
              message = await governedPhysical(ctx, signal =>
                raw().messages.create(params, { ...options, signal }))
            } catch (e) {
              if (provablyNotBilled(e)) {
                throw new ProviderNotDispatchedError('anthropic rejected the request before inference', e)
              }
              throw e
            }
            // Ledger records what actually happened, from real usage.
            await logLlmCost(params.model, message.usage, costContext(ctx))
            return message
          },
        )
      },

      /**
       * Streaming. The reservation is taken before the request, exactly as for a
       * non-streaming call; the ledger write is attached to the stream's own
       * completion so the caller's consumption pattern is unchanged.
       *
       * Settlement happens when `withGovernedSpend` returns the stream handle,
       * not when the stream finishes — the money is committed the moment the
       * request is accepted, and holding the reservation open until the last
       * token would let a slow consumer block a concurrent caller for the whole
       * generation. A stream that dies mid-flight was still billed for what it
       * produced, so settling the upper bound is the conservative direction.
       */
      async stream(
        params: Anthropic.MessageStreamParams,
        options?: Anthropic.RequestOptions,
      ) {
        const estimatedSek = await estimateAnthropicSek(params)
        return withGovernedSpend(
          {
            project: ctx.project, execution: ctx.execution,
            provider: 'anthropic',
            operation: ctx.operation ?? 'messages.stream',
            estimatedSek,
          },
          async () => {
            let flight: PhysicalFlight | undefined
            let stream: ReturnType<Anthropic['messages']['stream']>
            try {
              // The watcher is created HERE and released by `done()` below —
              // the handle returning is not the end of the physical request.
              flight = beginPhysicalFlight(ctx)
              stream = raw().messages.stream(params, { ...options, signal: flight.signal })
            } catch (e) {
              if (provablyNotBilled(e)) {
                throw new ProviderNotDispatchedError('anthropic rejected the stream before inference', e)
              }
              throw e
            }
            // Fire-and-forget ledger write once the real usage exists. Detached
            // on purpose: the caller owns the stream, and a logging failure must
            // never surface as a broken response. `.catch` is mandatory — an
            // unhandled rejection here would take the process down.
            void stream.finalMessage()
              .then(msg => logLlmCost(params.model, msg.usage, costContext(ctx)))
              .catch(() => { /* stream aborted or logging failed; estimate stands */ })

            // ── G3C-3C-A · STREAM TERMINATION, NOT HANDLE RETURN ──────────────
            // Returning the handle is NOT the end of the physical request: the
            // socket stays open for the whole generation. `ctx.onStreamSettled`
            // lets the caller keep an in-flight authority watcher alive for that
            // real lifetime and dispose it exactly once, however the stream ends.
            //
            // `done()` is the installed SDK's completion primitive and — unlike
            // `finalMessage()` — it is the one to anchor to, with `.finally` so
            // an ERRORED or ABORTED stream releases the watcher just as a
            // completed one does. `.then` here would leak on every failure.
            // `done()` is the installed SDK's completion primitive and the one to
            // prefer. Reached defensively: a stream object without it (an older
            // client, or a test double standing in for one) must not make the
            // whole governed call throw — fall back to `finalMessage()`, which
            // also settles at termination, and to immediate release if neither
            // exists. Failure to observe termination must never become failure
            // to make the request.
            const settled: Promise<unknown> =
              typeof (stream as { done?: unknown }).done === 'function'
                ? (stream as { done: () => Promise<unknown> }).done().catch(() => {})
                : typeof (stream as { finalMessage?: unknown }).finalMessage === 'function'
                  ? (stream as { finalMessage: () => Promise<unknown> }).finalMessage().catch(() => {})
                  : Promise.resolve()
            // `.finally` — an errored or aborted stream releases the watcher
            // exactly as a completed one does. `.then` would leak on failure.
            void settled.finally(() => flight?.dispose())
            ctx.onStreamSettled?.(settled)
            ctx.onFlight?.(flight)
            return stream
          },
        )
      },
    },
  }
}

export type GovernedAnthropic = ReturnType<typeof getAnthropic>
