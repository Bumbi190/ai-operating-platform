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
 * `messages.stream` are governed: a HARD ceiling is reserved BEFORE the
 * request is dispatched, the real cost is written to `cost_events` afterwards,
 * and the reservation is settled. Migrating a call site is a one-line change,
 * so the request shape, model, tools, temperature and error handling at each
 * site stay exactly as they were. This is a governance refactor, not a rewrite.
 *
 * ── ESTIMATING BEFORE THE ANSWER EXISTS ─────────────────────────────────────
 * A completion's cost is only known once it returns, which is precisely why a
 * post-hoc ledger cannot bound spend. The reservation is therefore a HARD
 * ceiling (M0, see `estimateAnthropicSek`): the model's context window — the
 * provider-enforced maximum input — plus the FULL `max_tokens`, priced through
 * the shared `MODEL_PRICING` at the rate snapshot the metering also uses. An
 * earlier revision approximated input from a character count; that was a guess
 * that a multi-byte or document-heavy prompt could exceed, and a guess is not
 * an authority bound. Requests this cannot bound are refused.
 *
 * ── THE LEDGER STILL RECORDS REALITY ────────────────────────────────────────
 * `cost_events` is written from `response.usage` — the actual tokens — through
 * the same `logLlmCost` every call site used before. The estimate bounds the
 * spend; the ledger records it. Reconciling the two is deferred to G2.
 */

import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { logLlmCost, type CostContext } from '@/lib/cost/track'
import { currentSpendMeter } from '@/lib/cost/spend-meter'
import { getRates } from '@/lib/cost/rates'
import { containsKey, tokenWindowCeiling, type RateSnapshot } from '@/lib/cost/spend-ceiling'
import {
  watchExecutionAuthority, composeAbortSignals, authorityForRequest, followAsyncIterable,
  admitPhysicalRequest, isPhysicalAdmissionRefusal,
  GovernanceDispatchUnknownError, isGovernanceDispatchUnknown,
  type RunBoundAuthority, type AbortReason,
} from '@/lib/governance/execution-signal'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveGovernedProjectId } from '@/lib/cost/governed-spend'
import {
  ProviderNotDispatchedError,
  SpendRefusedError,
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
 * The HARD ceiling in SEK for one messages request (M0). Throws
 * `SpendRefusedError('unbounded_spend')` for a request whose billable outcome
 * cannot be bounded — it is then never dispatched.
 *
 * ── WHY NOT A CHARACTER ESTIMATE ─────────────────────────────────────────────
 * This used to count prompt characters at 3 chars/token and charge a flat 4,000
 * tokens per image or document block. Both are guesses: a character can be
 * several tokens, and a PDF block can be far more than 4,000. A guess is not an
 * authority bound — the crash reconciler settles exactly this figure — so the
 * bound now comes from the provider's own contract instead:
 *
 *   billed input  ≤ the model's context window (a longer prompt is rejected
 *                   before inference, unbilled)
 *   billed output ≤ `max_tokens` (extended thinking counts inside it)
 *
 * priced by the same `MODEL_PRICING` entry the metering uses.
 *
 * ── REFUSED, because they bill outside input × price + output × price ───────
 *   • a model with no price-book entry or documented window;
 *   • `cache_control` anywhere (cache writes bill at 1.25×/2× input);
 *   • server tools (any tool with a `type` other than `custom`: web search,
 *     web fetch, code execution bill per use);
 *   • an `anthropic-beta` header (it can enable the 1M window or other billing);
 *   • `container` / `mcp_servers`.
 */
export async function estimateAnthropicSek(
  params: { model: string; max_tokens: number; system?: unknown; messages?: unknown[]; tools?: unknown },
  rates?: RateSnapshot,
  options?: { headers?: unknown },
): Promise<number> {
  const unbounded = (reason: string) => new SpendRefusedError({
    reason: 'unbounded_spend', provider: 'anthropic', operation: 'messages', detail: reason,
  })
  if (containsKey(params, 'cache_control')) throw unbounded('cache_control bills cache writes above the input price')
  const tools = Array.isArray(params.tools) ? params.tools : []
  if (tools.some(t => t && typeof t === 'object' && 'type' in t && (t as { type?: unknown }).type !== 'custom')) {
    throw unbounded('server tools bill per use')
  }
  if ('container' in params || 'mcp_servers' in params) throw unbounded('container / MCP servers bill outside tokens')
  if (options?.headers && JSON.stringify(options.headers).toLowerCase().includes('anthropic-beta')) {
    throw unbounded('a beta header can change the context window or billing')
  }
  const ceiling = tokenWindowCeiling(params.model, params.max_tokens, rates ?? await getRates())
  if (!ceiling.ok) throw unbounded(ceiling.reason)
  return ceiling.sek
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
/** The descriptor both physical paths gate and watch on. */
function physicalAuthority(ctx: AnthropicGovernanceContext) {
  return authorityForRequest(
    ctx.execution,
    async ref => { const r = await resolveGovernedProjectId(ref); return r.ok ? r.projectId : null },
    ctx.authority,
  )
}

/**
 * Gates ONE physical attempt, then opens the watch that covers it.
 *
 * Admission and watching are the same seam here on purpose: separating them
 * would let a caller take one without the other, and the whole point is that a
 * cancellation which became durable between the boundary check and this attempt
 * stops the attempt rather than being noticed once it is already in flight.
 */
async function beginPhysicalFlight(ctx: AnthropicGovernanceContext): Promise<PhysicalFlight> {
  const authority = physicalAuthority(ctx)
  await admitPhysicalRequest(() => createAdminClient(), authority, 'anthropic')
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

/**
 * E1. Classifies a physical failure that happened while a watcher was live.
 *
 * The watcher's `abortReason` is the authoritative evidence that governance
 * fired: the Anthropic client wraps an aborted signal as `APIUserAbortError`
 * or `APIConnectionError`, so the original `GovernanceAbortError` class does
 * not reliably survive to the caller. What survives is our own record of why
 * we aborted.
 *
 * The result is MAY_HAVE_DISPATCHED, never an admission refusal: the request
 * was already on the wire.
 */
function governanceInFlight(flight: PhysicalFlight | undefined, e: unknown): unknown {
  const reason = flight?.abortReason
  if (!reason) return e
  if (isGovernanceDispatchUnknown(e)) return e
  return new GovernanceDispatchUnknownError('anthropic', reason, e)
}

/** Runs ONE raw non-streaming request under in-flight authority. */
async function governedPhysical<T>(
  ctx: AnthropicGovernanceContext,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const flight = await beginPhysicalFlight(ctx)
  try {
    const value = await run(flight.signal)
    ctx.onFlight?.(flight)
    return value
  } catch (e) {
    throw governanceInFlight(flight, e)
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
        // M0: ONE rate snapshot prices both the hard ceiling and the metering.
        const rates = await getRates()
        const estimatedSek = await estimateAnthropicSek(params, rates, options)
        return withGovernedSpend(
          {
            project: ctx.project, execution: ctx.execution,
            provider: 'anthropic',
            operation: ctx.operation ?? 'messages.create',
            estimatedSek,
            ceilingBasis: 'token_window',
            rates,
            // Run-bound when the caller has a canonical execution identity;
            // undefined otherwise, which keeps every existing call site taking
            // its own per-call reservation exactly as before.
            idempotencyKey: ctx.idempotencyKey,
          },
          async () => {
            let message: Anthropic.Message
            try {
              // ── G3C-3C-A · ONE PHYSICAL REQUEST ─────────────────────────
              // `signal` LAST would discard a caller's own `options.signal`.
              // Compose the two so both remain able to abort the request.
              message = await governedPhysical(ctx, signal => {
                const merged = composeAbortSignals([signal, options?.signal ?? undefined])
                return raw().messages.create(params, { ...options, signal: merged.signal })
                  .finally(() => merged.dispose())
              })
            } catch (e) {
              // A governance refusal is not a provider verdict. It must keep its
              // identity all the way out, or the spend boundary will settle a
              // reservation for a call that was never made.
              if (isPhysicalAdmissionRefusal(e)) throw e
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
       * M0: settlement happens when the stream ENDS, not at handle return. The
       * reservation stays counted at its hard ceiling for the whole generation —
       * a concurrent caller sees that headroom as taken, which is the
       * conservative direction — and then settles durably with the real usage.
       * A stream that dies mid-flight settles at the reserved hard ceiling.
       */
      async stream(
        params: Anthropic.MessageStreamParams,
        options?: Anthropic.RequestOptions,
      ) {
        // M0: ONE rate snapshot prices both the hard ceiling and the metering.
        const rates = await getRates()
        const estimatedSek = await estimateAnthropicSek(params, rates, options)
        return withGovernedSpend(
          {
            project: ctx.project, execution: ctx.execution,
            provider: 'anthropic',
            operation: ctx.operation ?? 'messages.stream',
            estimatedSek,
            ceilingBasis: 'token_window',
            rates,
            // Run-bound when the caller has a canonical execution identity;
            // undefined otherwise, which keeps every existing call site taking
            // its own per-call reservation exactly as before.
            idempotencyKey: ctx.idempotencyKey,
          },
          async () => {
            let flight: PhysicalFlight | undefined
            let optionSignal: { signal: AbortSignal; dispose: () => void } | undefined
            let stream: ReturnType<Anthropic['messages']['stream']>
            try {
              // The watcher is created HERE and released by `done()` below —
              // the handle returning is not the end of the physical request.
              flight = await beginPhysicalFlight(ctx)
              // Same composition rule as the non-streaming path: a caller's
              // `options.signal` must survive alongside governance authority.
              optionSignal = composeAbortSignals([flight.signal, options?.signal ?? undefined])
              stream = raw().messages.stream(params, { ...options, signal: optionSignal.signal })
            } catch (e) {
              optionSignal?.dispose()
              flight?.dispose()
              if (isPhysicalAdmissionRefusal(e)) throw e
              if (provablyNotBilled(e)) {
                throw new ProviderNotDispatchedError('anthropic rejected the stream before inference', e)
              }
              throw e
            }
            // ── M0 · THE STREAM'S COST SETTLES THE RESERVATION ───────────────
            // The real usage exists only once the stream ends. It is metered
            // into this governed call's spend meter, and the meter is told to
            // wait for it: the reservation stays counted at its hard ceiling
            // until then, and settles DURABLY with the real usage — or, if the
            // stream ends without usage, at the reserved hard ceiling. Before M0
            // this was a detached best-effort insert while the reservation had
            // already been settled at handle return, so a failed insert made the
            // stream's spend vanish.
            //
            // Still detached from the CALLER: the caller owns the stream, and a
            // metering failure must never surface as a broken response.
            //
            // Guarded because the request has ALREADY been dispatched by this
            // point: a stream object without `finalMessage` would otherwise
            // throw out of a governed call that really did reach the provider,
            // reporting "never happened" about billable work — and stranding
            // the watcher created above.
            const metered = Promise.resolve()
              .then(() => typeof (stream as { finalMessage?: unknown }).finalMessage === 'function'
                ? stream.finalMessage()
                : Promise.reject(new Error('no finalMessage')))
              .then(msg => logLlmCost(params.model, (msg as { usage: never }).usage, costContext(ctx)))
            currentSpendMeter()?.settleAfter(metered)
            // `.catch` is mandatory — an unhandled rejection would take the
            // process down. The settlement observes the rejection separately.
            void metered.catch(() => { /* stream aborted: settled at the reserved hard ceiling */ })

            // ── G3C-3C-A · STREAM TERMINATION, NOT HANDLE RETURN ──────────────
            // Returning the handle is NOT the end of the physical request: the
            // socket stays open for the whole generation. `ctx.onStreamSettled`
            // lets the caller keep an in-flight authority watcher alive for that
            // real lifetime and dispose it exactly once, however the stream ends.
            //
            // `done()` is the installed SDK's completion primitive and the one to
            // prefer; `finalMessage()` also settles at termination and covers the
            // event-driven consumers that never iterate. Both are reached
            // defensively: a stream object lacking them (an older client, or a
            // test double standing in for one) must not make the governed call
            // throw. Failure to OBSERVE termination must never become failure to
            // MAKE the request.
            //
            // ── C18 · WHY THE LAST TIER NEVER SETTLES ────────────────────────
            // An immediate `Promise.resolve()` here would tear down the watcher
            // at handle return for exactly the streams whose end we cannot see —
            // reporting "finished" about something still on the wire, which is
            // the one answer we know to be wrong. The honest fallbacks are
            // iteration (real streams are async-iterable) and, failing even
            // that, never: keeping a watcher alive costs an unref'd timer, while
            // releasing early costs the abort authority this phase exists for.
            const mapError = (e: unknown) => governanceInFlight(flight, e)

            // ── F2 · THE DIRECT CONSUMER GETS THE CLASSIFIED OUTCOME ─────────
            // `runAnthropicStep` and the routes iterate this handle. Wrapping
            // the iterator is what puts the governance outcome in front of the
            // code that actually decides what happened; a classified side
            // promise only informs whoever thought to await it.
            const iterated = followAsyncIterable(stream, mapError)
            // Its rejection is delivered to the consumer by the iterator. This
            // keeps the promise itself from surfacing as an unhandled one when
            // termination is anchored to `done()` instead.
            void iterated?.catch(() => {})

            // `done()` is the installed SDK's completion primitive and the one
            // to prefer; `finalMessage()` also settles at termination and covers
            // event-driven consumers that never iterate. Both are reached
            // defensively: a stream object lacking them must not make the
            // governed call throw. Failure to OBSERVE termination must never
            // become failure to MAKE the request.
            //
            // ── C18 · WHY THE LAST TIER NEVER SETTLES ────────────────────────
            // An immediate `Promise.resolve()` would tear down the watcher at
            // handle return for exactly the streams whose end we cannot see —
            // reporting "finished" about something still on the wire.
            //
            // ── F2 · UNCAUGHT FIRST, CLASSIFIED SECOND ───────────────────────
            // These are NOT pre-caught. An earlier revision did
            // `done().catch(() => {})` here, which swallowed the rejection
            // before anything could classify it and left `classified` unable to
            // ever see a governance abort.
            const rawTermination: Promise<unknown> =
              typeof (stream as { done?: unknown }).done === 'function'
                ? (stream as { done: () => Promise<unknown> }).done()
                : typeof (stream as { finalMessage?: unknown }).finalMessage === 'function'
                  ? (stream as { finalMessage: () => Promise<unknown> }).finalMessage()
                  : iterated ?? new Promise<void>(() => {})
            const classified = rawTermination.catch(e => { throw mapError(e) })
            // Detached, for unhandled-rejection hygiene only — after
            // classification, never instead of it.
            void classified.catch(() => {}).finally(() => {
              optionSignal?.dispose(); flight?.dispose()
            })
            ctx.onStreamSettled?.(classified)
            ctx.onFlight?.(flight)
            return stream
          },
        )
      },
    },
  }
}

export type GovernedAnthropic = ReturnType<typeof getAnthropic>
