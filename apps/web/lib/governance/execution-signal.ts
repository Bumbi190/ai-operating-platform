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
import { resolveExecutionStop, resolveExecutionStopForContract } from './execution-stop'
import type { ExecutionContract, ExecutionContext } from './execution-stop'
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
): Promise<{ tick: AuthorityTick; detail: string; abortReason?: AbortReason }> {
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
}): { tick: AuthorityTick; detail: string; abortReason?: AbortReason } {
  if (decision.allowed) return { tick: 'ALLOWED', detail: 'authority clear' }
  const reason = decision.reason ?? 'stop_state_unavailable'
  if (reason === 'stop_state_unavailable') {
    return { tick: 'AUTHORITY_UNAVAILABLE', detail: reason }
  }
  return {
    tick: 'STOPPED',
    detail: reason,
    abortReason: reason === 'global_automation_paused' ? 'GLOBAL_STOPPED' : 'PROJECT_STOPPED',
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
