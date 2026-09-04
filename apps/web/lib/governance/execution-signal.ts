/**
 * lib/governance/execution-signal.ts — in-flight governance authority.
 *
 * G3C-3A checks authority BEFORE a unit of work. G3C-3B makes cancellation
 * survive worker death. Neither can touch a provider request that is already in
 * flight: an OpenAI or Anthropic call may hold a socket open for up to ten
 * minutes, and for that whole window an operator cancel, a global stop and a
 * rotated claim are all invisible to it.
 *
 * This module is the missing observer. It watches authority WHILE one physical
 * request is pending and aborts the socket when authority is genuinely lost.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * It never writes. Not `cancelled`, not `pending`, not `failed`, not `unknown`.
 * Lifecycle settlement belongs to the owning boundary (G3C-3B's `settleRefusal`)
 * and putting it here would be a second lifecycle writer racing the first.
 *
 * It is also NOT remote cancellation. Aborting a socket proves nothing about
 * what the provider did with the bytes it already received. A governance abort
 * after dispatch may leave the outcome UNKNOWN, and `classifyTransportFailure`
 * already answers `sent: 'unknown'` for AbortError — that stays true.
 *
 * ── WHY THE WATCHER IS PHYSICAL-REQUEST-SCOPED ─────────────────────────────
 * An owner-scoped watcher would span non-network work and several requests, and
 * the eleven route/cron call sites have no owner to hang it on. One watcher per
 * adapter would mean five polling loops. So: one canonical helper, created and
 * disposed around exactly one physical request, taking a typed authority
 * descriptor from whoever knows it.
 *
 * It is deliberately NOT inside `withGovernedSpend`. That boundary settles a
 * stream's reservation when the HANDLE is returned — its own comment explains
 * why — so the spend lifetime ENDS while the physical request is still live.
 * Two authorities, two lifetimes.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyRunAuthority, readRunAuthority } from './run-authority'
import { resolveExecutionStop, resolveExecutionStopForContract, ExecutionStoppedError } from './execution-stop'
import type { ExecutionContract, ExecutionContext, StopRefusalReason } from './execution-stop'
// TYPE-ONLY, and deliberately so: `import type` is erased at compile time, so
// this adds no runtime edge from governance to the spend layer. `execution-stop.ts`
// — the neighbouring governance module — already imports ProjectRef exactly this
// way. The RESOLVER, which would be a real runtime dependency, is injected instead.
import type { ProjectRef } from '@/lib/cost/governed-spend'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any

// ───────────────────────────────────────────────────────────────────────────
//  Authority descriptor
// ───────────────────────────────────────────────────────────────────────────

/**
 * Who this physical request belongs to.
 *
 * A DISCRIMINATED UNION, never a nullable claim. `claimId?: string | null` as a
 * mode switch is how one field comes to mean two different things, and a
 * `runId` carried for cost attribution is NOT ownership — `runner.ts` has
 * carried one for years while holding no claim at all.
 */
export type ExecutionAuthority =
  /** A claimed run owns this request: full ownership, cancellation and stop. */
  | { kind: 'RUN_BOUND'; runId: string; claimId: string; context?: ExecutionContext }
  /**
   * No claimed run. Stop authority only — it has nothing to be fenced from.
   *
   * `resolveProjectId` is INJECTED rather than imported. The canonical resolver
   * (`resolveGovernedProjectId`) lives in the spend layer, and importing it here
   * would make the governance module depend on billing to answer an execution
   * question — the exact coupling `projectScope`'s own comment warns about when
   * it distinguishes the EXECUTION project from the billed one. The adapter
   * boundary already imports the spend layer; it passes the resolver down.
   */
  | {
      kind: 'CONTRACT_ONLY'
      contract: ExecutionContract
      resolveProjectId: (ref: ProjectRef) => Promise<string | null>
    }

/** What a single authority tick concluded. */
export type AuthorityTick =
  | 'ALLOWED'
  | 'CANCELLED'
  | 'STOPPED'
  | 'FENCED'
  | 'AUTHORITY_UNAVAILABLE'

/** Stable internal reasons. Diagnostic and control-flow — not client-facing. */
export type AbortReason =
  | 'RUN_CANCELLED'
  | 'RUN_FENCED'
  | 'GLOBAL_STOPPED'
  | 'PROJECT_STOPPED'
  | 'AUTHORITY_UNAVAILABLE'
  | 'CALLER_ABORTED'
  | 'TIMEOUT'

export class GovernanceAbortError extends Error {
  readonly reason: AbortReason
  constructor(reason: AbortReason, detail: string) {
    super(`governance aborted the in-flight request (${reason}): ${detail}`)
    this.name = 'GovernanceAbortError'
    this.reason = reason
  }
}

export function isGovernanceAbort(e: unknown): e is GovernanceAbortError {
  return e instanceof GovernanceAbortError
}

/**
 * Authority refused BEFORE the raw request left the machine.
 *
 * Distinct from every other failure, and deliberately so: nothing was
 * dispatched, so this is neither a provider rejection nor an ambiguous outcome.
 * The spend boundary releases the reservation on it (see `withGovernedSpend`),
 * and the transport layer never sees it, so it can never be mistaken for
 * `response_lost`.
 *
 * Adapters THROW this. They never write run lifecycle state — the owning
 * boundary classifies and settles, exactly as G3C-3B established.
 */
export class PhysicalAdmissionRefusedError extends Error {
  readonly refusal: Exclude<AuthorityTick, 'ALLOWED'>
  readonly provider: string
  /**
   * E4. The CANONICAL stop reason, present exactly when `refusal === 'STOPPED'`.
   *
   * It comes from the StopDecision, not from parsing `detail`: an operator
   * looking at a deferred run needs to know whether the whole platform is
   * paused or only their project, and a synthetic label like
   * `physical_admission_stop` answers neither question. Prose is for humans;
   * this is the stable value the drain reports.
   */
  readonly stopReason?: StopRefusalReason
  constructor(
    refusal: Exclude<AuthorityTick, 'ALLOWED'>,
    provider: string,
    detail: string,
    stopReason?: StopRefusalReason,
  ) {
    super(`physical admission refused (${refusal}) for ${provider}: ${detail}`)
    this.name = 'PhysicalAdmissionRefusedError'
    this.refusal = refusal
    this.provider = provider
    if (refusal === 'STOPPED' && stopReason) this.stopReason = stopReason
  }
}

/**
 * Governance aborted a request that was ALREADY IN FLIGHT.
 *
 * ── WHY THIS IS NOT AN ADMISSION REFUSAL ───────────────────────────────────
 * `PhysicalAdmissionRefusedError` means one thing: nothing was dispatched. This
 * means the opposite is possible. The request was written to a socket, the
 * provider may have accepted it, work may be running and billable right now —
 * and all we did was hang up locally. A local abort is not a remote
 * cancellation, and no amount of certainty about OUR intent creates certainty
 * about THEIR state.
 *
 * So it is deliberately not called cancelled, not_dispatched, or a provider
 * failure. It is MAY_HAVE_DISPATCHED, and the only honest lifecycle for it is
 * the durable ambiguity vocabulary the G3C-3B reaper already uses.
 */
export class GovernanceDispatchUnknownError extends Error {
  /** Always true. Named so a reader at a call site cannot mistake the class. */
  readonly mayHaveDispatched = true as const
  readonly provider: string
  /** Which governance switch fired, from the watcher — the authoritative source. */
  readonly abortReason: AbortReason
  /** The transport/SDK rejection that surfaced the abort, kept for provenance. */
  readonly cause?: unknown
  constructor(provider: string, abortReason: AbortReason, cause?: unknown) {
    super(`governance aborted an IN-FLIGHT ${provider} request (${abortReason}); `
      + 'the request may already have been dispatched and cannot be assumed cancelled')
    this.name = 'GovernanceDispatchUnknownError'
    this.provider = provider
    this.abortReason = abortReason
    this.cause = cause
  }
}

export function isGovernanceDispatchUnknown(e: unknown): e is GovernanceDispatchUnknownError {
  return e instanceof GovernanceDispatchUnknownError
}

/**
 * E3. The ONE predicate for "this is governance control flow, not a provider
 * failure" — the question every retry loop, error aggregator and fallback in
 * the image pipeline needs to ask before it does anything clever.
 *
 * It recognises, and does not re-decide: the pre-dispatch refusal, the canonical
 * pre-spend stop refusal (`ExecutionStoppedError`, thrown by `withGovernedSpend`
 * before admission ever runs), the in-flight dispatch-unknown outcome, and a
 * raw `GovernanceAbortError` where one can still surface unwrapped.
 *
 * `ExecutionStoppedError` is matched by TYPE. An earlier revision matched it by
 * `error.name`, on the belief that importing the class would close a cycle —
 * it would not: this module already imports `resolveExecutionStop` from
 * `execution-stop` at runtime, so the dependency direction is unchanged.
 *
 * The name check was not merely redundant, it was wrong in a way that matters:
 * any error whose `name` happens to be that string — a provider error carrying
 * a server-supplied name, a deserialized error, a caller's own object — would
 * have been granted governance control-flow status, and a retry loop would have
 * stopped retrying something it should have retried.
 */
export function isExecutionGovernanceControlFlow(e: unknown): boolean {
  return isPhysicalAdmissionRefusal(e)
    || isGovernanceDispatchUnknown(e)
    || isGovernanceAbort(e)
    || e instanceof ExecutionStoppedError
}

export function isPhysicalAdmissionRefusal(e: unknown): e is PhysicalAdmissionRefusedError {
  return e instanceof PhysicalAdmissionRefusedError
}

/**
 * Re-establishes authority IMMEDIATELY BEFORE one raw request.
 *
 * The watcher's first tick is a poll interval away, and the comment that used to
 * justify that delay — "a canonical boundary check ran just before this" — is
 * false for any attempt after the first. An image retry waits fifteen seconds
 * for a 429 backoff; a cancellation landing in that gap must stop attempt two
 * before it leaves, not two seconds after it has.
 *
 * PRE-DISPATCH and IN-FLIGHT read failures are deliberately opposite:
 *   • here, unreadable authority REFUSES — nothing has been sent, so failing
 *     closed costs nothing;
 *   • in flight, unreadable authority only LATCHES — the request was already
 *     permitted, and tearing it down would manufacture remote ambiguity.
 */
export async function admitPhysicalRequest(
  db: AnyDb | (() => AnyDb),
  authority: ExecutionAuthority,
  provider: string,
): Promise<void> {
  // ── WHY CONTRACT_ONLY IS NOT RE-GATED HERE ─────────────────────────────────
  // Because it is already gated, by canonical authority, before this point.
  // `withGovernedSpend` calls `resolveExecutionStopForContract` pre-dispatch,
  // fails closed on an unreadable stop state, and releases the reservation on
  // refusal. A second contract gate here would decide the SAME question from a
  // SECOND place — the exact shape this programme has already deleted twice
  // (the drain and the unified executor each grew a rival cancel branch), and
  // it would silently own availability policy for every interactive feature.
  //
  // Admission exists to add what the contract gate CANNOT see: whether this
  // worker still owns the run, and whether a cancellation became durable after
  // the boundary check. That is a RUN_BOUND question, so this is a RUN_BOUND
  // gate. In-flight watching still covers CONTRACT_ONLY — see the watcher.
  if (authority.kind !== 'RUN_BOUND') return

  let outcome: AuthorityTick
  let detail: string
  let stopReason: StopRefusalReason | undefined
  try {
    const client = typeof db === 'function' ? (db as () => AnyDb)() : db
    const r = await evaluateAuthority(client, authority)
    outcome = r.tick
    detail = r.detail
    stopReason = r.stopReason
  } catch {
    outcome = 'AUTHORITY_UNAVAILABLE'
    detail = 'authority evaluation threw before dispatch'
  }
  if (outcome === 'ALLOWED') return
  throw new PhysicalAdmissionRefusedError(outcome, provider, detail, stopReason)
}

// ───────────────────────────────────────────────────────────────────────────
//  Signal composition
// ───────────────────────────────────────────────────────────────────────────

/**
 * Composes several abort sources into one. First abort wins; its reason is kept.
 *
 * `AbortSignal.any` would do this, but `engines.node` is `>=20.0.0` and that API
 * needs 20.3+ — so relying on it would make the floor a lie rather than a
 * guarantee. Fifteen lines and no runtime assumption is the better trade.
 *
 * Governance NEVER replaces the caller's or the provider's timeout signal. All
 * three compose, because a request can legitimately end for any of the three
 * reasons and collapsing them loses which one happened.
 */
export interface ComposedSignal {
  readonly signal: AbortSignal
  /** Removes every listener. Idempotent; safe from any exit path. */
  dispose(): void
  /** Listener count — exposed so a test can prove cleanup, not for callers. */
  readonly listenerCount: number
}

/**
 * Follows an async-iterable to termination, returning a promise that settles
 * when ITERATION ends — exhaustion, error, `throw`, or a consumer `break`.
 *
 * Installed by shadowing `[Symbol.asyncIterator]` on the instance rather than
 * by a Proxy: a Proxy would intercept the provider object's entire surface for
 * one behaviour, and every property a caller touches becomes ours to get right.
 *
 * Returns `undefined` when the value is not async-iterable — the CALLER decides
 * what an unobservable stream means, because "I cannot see the end" is not the
 * same as "it ended".
 */
export function followAsyncIterable(
  value: unknown,
  /**
   * F2. Classifies the failure ONCE, for BOTH surfaces.
   *
   * Without it, the two disagreed: the lifecycle promise was classified and the
   * `for await` consumer — the code that actually has to decide what happened —
   * received the raw SDK wrapper. Worse, the previous version RESOLVED the
   * lifecycle promise on an iterator error and then threw, so nothing could
   * classify it at all.
   */
  mapError?: (error: unknown) => unknown,
): Promise<void> | undefined {
  const target = value as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> }
  if (typeof target?.[Symbol.asyncIterator] !== 'function') return undefined
  const original = target[Symbol.asyncIterator]!.bind(target)

  let resolveSettled!: () => void
  let rejectSettled!: (e: unknown) => void
  const settled = new Promise<void>((res, rej) => { resolveSettled = res; rejectSettled = rej })
  let finished = false

  // Mapped exactly once: the consumer and the lifecycle promise must receive
  // the SAME object, or a caller comparing them would see two different truths
  // about one failure.
  let mapped: { value: unknown } | null = null
  const classify = (e: unknown): unknown => {
    if (!mapped) mapped = { value: mapError ? mapError(e) : e }
    return mapped.value
  }
  const failWith = (e: unknown): unknown => {
    const m = classify(e)
    if (!finished) { finished = true; rejectSettled(m) }
    return m
  }
  const finishOk = () => { if (!finished) { finished = true; resolveSettled() } }

  target[Symbol.asyncIterator] = function (): AsyncIterator<unknown> {
    const it = original()
    return {
      async next(...args: [] | [undefined]) {
        try {
          const r = await it.next(...args)
          if (r.done) finishOk()
          return r
        } catch (e) {
          // Classified BEFORE it leaves: this is the error the `for await`
          // consumer sees, and it is the same object the lifecycle promise
          // rejects with.
          throw failWith(e)
        }
      },
      // `return` is what a consumer `break` invokes. Without it an early exit
      // would hold the watcher for the life of the process.
      //
      // ── D3 · TERMINATION MEANS THE UNDERLYING STREAM TERMINATED ────────────
      // Termination is concluded AFTER the SDK's own return/throw settles.
      // Concluding first would release the watcher while the client is still
      // asynchronously aborting the socket — the exact window a break is meant
      // to cover, reported as already closed. When the underlying iterator has
      // no return/throw there is nothing to await, and the wrapper can honestly
      // conclude termination itself.
      async return(v?: unknown) {
        try {
          return it.return ? await it.return(v) : { done: true, value: v }
        } catch (e) {
          throw failWith(e)
        } finally { finishOk() }
      },
      async throw(e?: unknown) {
        try {
          if (it.throw) return await it.throw(e)
          throw e
        } catch (inner) {
          throw failWith(inner)
        } finally { finishOk() }
      },
      [Symbol.asyncIterator]() { return this },
    } as AsyncIterator<unknown>
  }
  return settled
}

export function composeAbortSignals(
  sources: readonly (AbortSignal | undefined | null)[],
): ComposedSignal {
  const controller = new AbortController()
  const live = sources.filter((s): s is AbortSignal => !!s)
  const detach: (() => void)[] = []

  const abortWith = (s: AbortSignal) => {
    if (controller.signal.aborted) return
    controller.abort(s.reason)
  }

  // An already-aborted input must be reflected IMMEDIATELY — a composed signal
  // that starts clean because it only listens for future events would hand the
  // caller a request that should never have been made.
  const already = live.find(s => s.aborted)
  if (already) {
    abortWith(already)
  } else {
    for (const s of live) {
      const onAbort = () => abortWith(s)
      s.addEventListener('abort', onAbort, { once: true })
      detach.push(() => s.removeEventListener('abort', onAbort))
    }
  }

  let disposed = false
  return {
    signal: controller.signal,
    get listenerCount() { return disposed ? 0 : detach.length },
    dispose() {
      if (disposed) return
      disposed = true
      for (const off of detach) off()
      detach.length = 0
    },
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  The watcher
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_POLL_MS = 2_000

export interface AuthorityWatch {
  /** Compose this into the request's signal. */
  readonly signal: AbortSignal
  /** Why governance aborted, if it did. */
  readonly abortReason: AbortReason | null
  /**
   * TRUE once a tick could not read authority.
   *
   * LATCHED — it never clears, even if a later tick succeeds and even if the
   * provider returns 200. The request that was already in flight is allowed to
   * finish and its evidence is preserved; what this forbids is CONTINUATION.
   * A caller that sees this must not begin another physical attempt or another
   * execution-bearing unit until a canonical checkpoint successfully
   * re-establishes authority.
   */
  readonly authorityUnavailable: boolean
  /** Stops polling and releases every listener. Idempotent. */
  dispose(): void
}

export interface WatchOptions {
  readonly pollMs?: number
  /** Test seam. Never supplied in production. */
  readonly now?: () => number
}

/**
 * Watches authority for the lifetime of ONE physical provider request.
 *
 * The caller MUST dispose it from a `finally`, on every exit path: success,
 * throw, timeout, abort, and — for streams — actual stream termination, which
 * is not the same moment the handle is returned.
 */
export function watchExecutionAuthority(
  /**
   * The client, or a THUNK that makes one.
   *
   * A thunk is resolved lazily inside the first tick, so a request that finishes
   * before the poll interval never constructs a client at all — and, more
   * importantly, a context that cannot build one (missing credentials) does not
   * throw at the call site. That failure is exactly "authority cannot be read":
   * it latches AUTHORITY_UNAVAILABLE and leaves the request alone, rather than
   * turning a configuration gap into a torn-down provider call.
   */
  db: AnyDb | (() => AnyDb),
  authority: ExecutionAuthority,
  options: WatchOptions = {},
): AuthorityWatch {
  const controller = new AbortController()
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  let abortReason: AbortReason | null = null
  let unavailable = false
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null

  const abort = (reason: AbortReason, detail: string) => {
    if (controller.signal.aborted) return
    abortReason = reason
    controller.abort(new GovernanceAbortError(reason, detail))
  }

  const tick = async () => {
    if (stopped || controller.signal.aborted) return
    let outcome: AuthorityTick
    let detail = ''
    let stopReason: AbortReason | undefined
    try {
      const client = typeof db === 'function' ? (db as () => AnyDb)() : db
      const r = await evaluateAuthority(client, authority)
      outcome = r.tick
      detail = r.detail
      stopReason = r.abortReason
    } catch {
      outcome = 'AUTHORITY_UNAVAILABLE'
      detail = 'authority evaluation threw'
    }
    if (stopped || controller.signal.aborted) return

    switch (outcome) {
      case 'ALLOWED':
        return
      case 'AUTHORITY_UNAVAILABLE':
        // LATCH ONLY. A transient read failure is not proof that anything
        // changed, and tearing down a request that a successful boundary check
        // already permitted would manufacture exactly the `response_lost`
        // ambiguity this programme spends its effort bounding.
        unavailable = true
        return
      case 'CANCELLED': return abort('RUN_CANCELLED', detail)
      case 'FENCED':    return abort('RUN_FENCED', detail)
      case 'STOPPED':
        // The reason is the DECISION's, never the authority's shape.
        return abort(stopReason ?? 'PROJECT_STOPPED', detail)
    }
  }

  // First tick after one interval, not at t=0: the canonical boundary check ran
  // immediately before this request and re-reading it now would only duplicate it.
  timer = setInterval(() => { void tick() }, pollMs)
  // Never keep the process alive for a watcher.
  ;(timer as unknown as { unref?: () => void }).unref?.()

  return {
    signal: controller.signal,
    get abortReason() { return abortReason },
    get authorityUnavailable() { return unavailable },
    dispose() {
      if (stopped) return
      stopped = true
      if (timer) { clearInterval(timer); timer = null }
    },
  }
}

/**
 * One authority evaluation. Read-only by construction: it calls the shared
 * classifier and the canonical stop resolvers, and writes nothing.
 */
export async function evaluateAuthority(
  db: AnyDb, authority: ExecutionAuthority,
): Promise<{
  tick: AuthorityTick; detail: string
  abortReason?: AbortReason
  /** Present exactly when tick === 'STOPPED'. Canonical, never derived from prose. */
  stopReason?: StopRefusalReason
}> {
  if (authority.kind === 'CONTRACT_ONLY') {
    // No claimed run: stop authority is the ONLY thing it can observe. It
    // cannot produce RUN_CANCELLED or RUN_FENCED, because it owns no run to be
    // cancelled or fenced from — and inventing either would be a fabricated
    // lifecycle claim.
    const decision = await resolveExecutionStopForContract(
      db as SupabaseClient, authority.contract, authority.resolveProjectId)
    return fromStopDecision(decision)
  }

  const read = await readRunAuthority(db, authority.runId)
  const verdict = classifyRunAuthority(read, authority.claimId)
  if (verdict.klass === 'AUTHORITY_UNAVAILABLE') {
    return { tick: 'AUTHORITY_UNAVAILABLE', detail: verdict.detail }
  }
  if (verdict.klass === 'FENCED')    return { tick: 'FENCED', detail: verdict.detail }
  if (verdict.klass === 'CANCELLED') return { tick: 'CANCELLED', detail: verdict.detail }

  const projectId = read.kind === 'ROW' ? (read.row.project_id ?? null) : null
  const decision = await resolveExecutionStop(db as SupabaseClient, {
    context: authority.context ?? 'AUTONOMOUS', projectId,
  })
  return fromStopDecision(decision)
}

/**
 * Turns a canonical stop decision into an authority tick.
 *
 * TWO things this gets right that a naive `!allowed → STOPPED` does not:
 *
 *   `stop_state_unavailable` is NOT a stop. It means the authority could not be
 *   READ, and G3C-3A already treats those as different refusals. Calling it a
 *   stop would abort an in-flight request on a transient database blip and
 *   manufacture exactly the remote ambiguity this slice exists to bound.
 *
 *   The abort reason comes from the DECISION, not from the authority's shape. A
 *   RUN_BOUND run paused by the GLOBAL switch is globally stopped; inferring
 *   `PROJECT_STOPPED` from "this authority has a project" would misreport which
 *   switch fired, and the operator reading it would go looking in the wrong place.
 */
function fromStopDecision(decision: {
  allowed: boolean; reason?: string | null
}): {
  tick: AuthorityTick; detail: string
  abortReason?: AbortReason; stopReason?: StopRefusalReason
} {
  if (decision.allowed) return { tick: 'ALLOWED', detail: 'authority clear' }
  const reason = (decision.reason ?? 'stop_state_unavailable') as StopRefusalReason
  if (reason === 'stop_state_unavailable') {
    // Locked: unreadable authority is NOT a stop. It carries no stopReason
    // because no stop was decided — there is nothing canonical to report.
    return { tick: 'AUTHORITY_UNAVAILABLE', detail: reason }
  }
  return {
    tick: 'STOPPED',
    detail: reason,
    abortReason: reason === 'global_automation_paused' ? 'GLOBAL_STOPPED' : 'PROJECT_STOPPED',
    stopReason: reason,
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  The adapter-facing helper
// ───────────────────────────────────────────────────────────────────────────

export interface GovernedRequestInput<T> {
  readonly db: AnyDb
  readonly authority: ExecutionAuthority
  /** Caller/request-disconnect and provider-timeout signals, composed not replaced. */
  readonly extraSignals?: readonly (AbortSignal | undefined | null)[]
  readonly pollMs?: number
  /**
   * Runs the ONE physical request. Receives the composed signal.
   *
   * For a STREAM, resolve with `settled` — a promise that completes when the
   * stream actually terminates. Returning the handle is not completion, and the
   * watcher must outlive the handle or it will be disposed while the socket is
   * still open.
   */
  run(signal: AbortSignal): Promise<{ value: T; settled?: Promise<unknown> }>
}

/**
 * LIVE flight state — deliberately not a snapshot.
 *
 * For a stream, the handle comes back long before the request ends, so a boolean
 * copied at that moment would answer for a flight that had barely started.
 * Authority can become unavailable AFTER the handle returns, and the owner needs
 * to see that once the stream settles. Getters read the watcher itself.
 */
export interface FlightState {
  readonly authorityUnavailable: boolean
  readonly abortReason: AbortReason | null
}

export interface GovernedRequestResult<T> {
  readonly value: T
  /** Live view. Read it AFTER the work is finished, not when it was handed over. */
  readonly flight: FlightState
  /** Convenience snapshot for non-stream callers; identical to `flight` there. */
  readonly authorityUnavailable: boolean
  readonly abortReason: AbortReason | null
}

/**
 * Runs one physical provider request under in-flight authority.
 *
 * Disposal is in `finally` — never `.then` — so a stream that errors releases
 * the watcher exactly as one that completes. For a non-stream call `settled` is
 * absent and disposal happens as soon as the promise resolves.
 */
export async function withExecutionAuthority<T>(
  input: GovernedRequestInput<T>,
): Promise<GovernedRequestResult<T>> {
  const watch = watchExecutionAuthority(input.db, input.authority, { pollMs: input.pollMs })
  const composed = composeAbortSignals([watch.signal, ...(input.extraSignals ?? [])])

  const release = () => { composed.dispose(); watch.dispose() }

  try {
    const { value, settled } = await input.run(composed.signal)
    if (settled) {
      // Streaming: the handle is back but the socket is not. Keep the watcher
      // alive until the stream itself terminates, however it terminates.
      void settled.catch(() => {}).finally(release)
    } else {
      release()
    }
    // `flight` reads the watcher LIVE, so a stream caller that consults it after
    // settlement sees what actually happened during the whole flight.
    const flight: FlightState = {
      get authorityUnavailable() { return watch.authorityUnavailable },
      get abortReason() { return watch.abortReason },
    }
    return {
      value, flight,
      get authorityUnavailable() { return watch.authorityUnavailable },
      get abortReason() { return watch.abortReason },
    } as GovernedRequestResult<T>
  } catch (e) {
    release()
    throw e
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  Adapter entry point
// ───────────────────────────────────────────────────────────────────────────

/** The narrow authority a governed provider context may carry. */
export type RunBoundAuthority = Extract<ExecutionAuthority, { kind: 'RUN_BOUND' }>

/**
 * Builds the authority for ONE physical provider request.
 *
 * Absence of a RUN_BOUND descriptor does NOT mean "unwatched" — it means
 * CONTRACT_ONLY, derived from the execution contract the adapter already holds.
 * That is what gives the eleven route/cron call sites in-flight stop observation
 * without inventing a run or a claim for them.
 *
 * `resolveProjectId` is injected by the adapter (which already imports the spend
 * layer) so this module keeps no runtime dependency on billing.
 */
export function authorityForRequest(
  contract: ExecutionContract,
  resolveProjectId: (ref: ProjectRef) => Promise<string | null>,
  runBound?: RunBoundAuthority,
): ExecutionAuthority {
  return runBound ?? { kind: 'CONTRACT_ONLY', contract, resolveProjectId }
}
