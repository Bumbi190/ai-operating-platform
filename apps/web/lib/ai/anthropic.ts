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
  /** Required. Which budget this call is charged to. */
  project: ProjectRef
  /** Recorded on cost_events.agent, e.g. 'Script Writer'. */
  agent?: string
  /** Recorded on cost_events.operation, e.g. 'Generate Script'. */
  operation?: string
  runId?: string | null
  scriptId?: string | null
  metadata?: Record<string, unknown>
  /**
   * The caller's SPEND IDENTITY, forwarded to the governed boundary.
   *
   * Distinct from `runId`, which is ledger attribution and reaches only
   * `cost_events`. This is what `budget_reserve` keys on, so supplying it makes
   * the reservation belong to one execution intent rather than to one call.
   *
   * ── WHO MAY SET IT ────────────────────────────────────────────────────────
   * Only a caller that already has a canonical execution identity — today that
   * is the workflow engine's governed-effect path, which derives the key from
   * the run's immutable binding via `computeActionIdempotencyKey`. It is
   * OPTIONAL because every existing call site has no such identity and must keep
   * taking a per-call reservation; an invented string here would be worse than
   * none, since it would make two unrelated calls look like one intent.
   */
  idempotencyKey?: string
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

/** One place the credential is read. Callers never pass a key. */
function raw(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
            // Run-bound when the caller has a canonical execution identity;
            // undefined otherwise, which keeps every existing call site taking
            // its own per-call reservation exactly as before.
            idempotencyKey: ctx.idempotencyKey,
          },
          async () => {
            let message: Anthropic.Message
            try {
              message = await raw().messages.create(params, options)
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
            // Run-bound when the caller has a canonical execution identity;
            // undefined otherwise, which keeps every existing call site taking
            // its own per-call reservation exactly as before.
            idempotencyKey: ctx.idempotencyKey,
          },
          async () => {
            let stream: ReturnType<Anthropic['messages']['stream']>
            try {
              stream = raw().messages.stream(params, options)
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
            return stream
          },
        )
      },
    },
  }
}

export type GovernedAnthropic = ReturnType<typeof getAnthropic>
