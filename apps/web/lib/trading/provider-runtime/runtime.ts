/**
 * Omnira Trading — the provider session runtime.
 *
 * WHAT THIS OWNS
 * ──────────────
 * Connection lifecycle, session identity, heartbeat scheduling, reconnect
 * budget, cancellation, and liveness. It is the thing a future
 * `ExecutionProviderAdapter` sits on top of:
 *
 *     ExecutionProviderAdapter        (provider semantics: accounts, contracts)
 *         ↓
 *     ProviderSessionRuntime          (this file: is there a live session?)
 *         ↓
 *     ProviderTransport + codec       (provider bytes — R1B)
 *
 * WHAT IT DOES NOT OWN
 * ────────────────────
 * Any provider's protocol, message templates, symbols, accounts, orders or
 * capabilities. It cannot name a provider and cannot form a request. A session
 * being READY says a link exists and was authenticated — it says nothing about
 * what the provider supports, and nothing whatsoever about permission to trade.
 * Authority is issued upstream and is never derived from connectivity.
 *
 * THE SECRET IS NEVER HELD HERE
 * ─────────────────────────────
 * The runtime knows a `secretRef` — a name. To authenticate it calls
 * `credentials.borrow`, which hands the secret to the injected auth step for
 * the duration of one call. No field on this object, on the state model, or on
 * any log or error can hold a credential, because none of them ever receives
 * one.
 */

import type { ProviderError } from '../provider'
import {
  isRetriable,
  sessionError,
  type AuthenticationResult,
  type SessionFailure,
} from './failure'
import type { HeartbeatPolicy } from './heartbeat'
import { missesExhausted, shouldSendOutbound } from './heartbeat'
import { delayForAttempt, hasAttemptsLeft, type ReconnectPolicy } from './reconnect'
import { describeThrown, silentLogger, type SessionLogger } from './redaction'
import type { RuntimeScheduler } from './scheduler'
import {
  classifyClose,
  heartbeatShouldRun,
  initialSessionModel,
  mayReconnect,
  sessionReducer,
  type SessionAction,
  type SessionModel,
} from './session-state'
import type { ProviderTransport, TransportEndpoint, TransportEvent, TransportFrame } from './transport'

/**
 * Access to a secret, by borrowing rather than by holding.
 *
 * `borrow` scopes the secret to one call. The runtime never receives the value,
 * so there is no object in this package from which a credential could be
 * serialised, logged, or attached to an error.
 */
export interface CredentialProvider {
  borrow<T>(secretRef: string, use: (secret: string) => T | Promise<T>): Promise<T>
}

/** What the injected authentication step is given. */
export interface AuthenticationContext {
  readonly send: (frame: TransportFrame) => void
  readonly signal: AbortSignal
  /** Borrow the configured credential for the duration of `use`. */
  readonly withCredential: <T>(use: (secret: string) => T | Promise<T>) => Promise<T>
}

/**
 * Present credentials and report, in machine-readable terms, what happened.
 *
 * Injected because deciding this requires the provider's protocol, which lives
 * a layer up. The result is a typed union rather than a boolean so a codec can
 * distinguish a refused credential from a remote rejection, a decode failure,
 * and a cancellation — WITHOUT the runtime parsing prose to tell them apart.
 *
 * A step that throws is reported as `AUTH_FAILED`, because a thrown value is by
 * definition unclassified: the runtime will not infer a more specific failure
 * from an exception it cannot read.
 */
export type AuthenticationStep = (context: AuthenticationContext) => Promise<AuthenticationResult>

export interface ProviderSessionRuntimeOptions {
  readonly transport: ProviderTransport
  readonly endpoint: TransportEndpoint
  readonly scheduler: RuntimeScheduler
  readonly reconnect: ReconnectPolicy
  readonly heartbeat: HeartbeatPolicy
  readonly credentials: CredentialProvider
  /** The NAME of the credential. Never the credential. */
  readonly credentialSecretRef: string
  readonly authenticate: AuthenticationStep
  /** Emit one outbound heartbeat. Provider-shaped, so injected. */
  readonly sendHeartbeat?: (send: (frame: TransportFrame) => void) => void
  readonly logger?: SessionLogger
}

export interface ProviderSessionRuntime {
  /**
   * Open a session.
   *
   * COALESCING IS THE DOCUMENTED BEHAVIOUR (§19 G): a second `connect()` while
   * one is already connecting or established does not open a second transport
   * and does not fail. It returns the same outcome as the attempt already
   * running. Refusing instead would make the caller responsible for knowing
   * whether it was first, which is a race it cannot win.
   */
  connect(): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: ProviderError }>
  /** Stop. Idempotent, and never followed by a reconnect. */
  disconnect(): Promise<void>
  readonly model: SessionModel
  /** Subscribe to state changes. Returns an unsubscribe function. */
  observe(listener: (model: SessionModel) => void): () => void
}

export function createProviderSessionRuntime(
  options: ProviderSessionRuntimeOptions,
): ProviderSessionRuntime {
  const log = options.logger ?? silentLogger
  let model = initialSessionModel()
  const listeners = new Set<(model: SessionModel) => void>()

  /** Cleanup for the CURRENT generation only. Replaced on every new attempt. */
  let cancelHeartbeat: (() => void) | null = null
  let cancelReconnect: (() => void) | null = null
  let abort: AbortController | null = null
  let unlisten: (() => void) | null = null
  let misses = 0
  let pendingConnect: {
    readonly generation: number
    readonly settle: (r: { ok: true } | { ok: false; error: ProviderError }) => void
  } | null = null

  function dispatch(action: SessionAction): void {
    const next = sessionReducer(model, action)
    if (next === model) return
    model = next
    log({
      event: action.type,
      state: model.state,
      generation: model.generation,
      attempt: model.attempt,
      liveness: model.liveness,
      ...(model.lastFailure === null ? {} : { failure: model.lastFailure }),
    })
    for (const listener of listeners) listener(model)
  }

  /*
   * Drop everything belonging to the generation that is ending.
   *
   * Called before a new attempt and on teardown. It cancels rather than relying
   * on the generation guard alone: the guard makes a stale callback harmless,
   * but a timer that still exists is still a leak, and a suite that asserts
   * `pending() === 0` is how leaks get noticed at all.
   */
  function tearDownGeneration(): void {
    cancelHeartbeat?.()
    cancelHeartbeat = null
    cancelReconnect?.()
    cancelReconnect = null
    unlisten?.()
    unlisten = null
    abort?.abort()
    abort = null
    misses = 0
  }

  function settleConnect(result: { ok: true } | { ok: false; error: ProviderError }): void {
    const waiting = pendingConnect
    if (waiting === null) return
    pendingConnect = null
    waiting.settle(result)
  }

  function fail(generation: number, failure: SessionFailure, detail: string): void {
    if (generation !== model.generation) return
    tearDownGeneration()

    const budget = hasAttemptsLeft(options.reconnect, model.attempt)
    /*
     * "Exhausted" and "never configured to retry" are different facts, and
     * only one of them should replace the cause. A policy with maxAttempts 0
     * never intended to reconnect, so the session reports what actually went
     * wrong; a policy that tried and ran out reports that it ran out.
     */
    const exhausted = options.reconnect.maxAttempts > 0 && !budget && isRetriable(failure)
    const reported: SessionFailure = exhausted ? 'RECONNECT_EXHAUSTED' : failure

    dispatch({
      type: 'SESSION_FAILED',
      generation,
      failure: reported,
      retryBudgetAvailable: budget,
    })
    if (mayReconnect(model)) {
      scheduleReconnect()
      return
    }
    settleConnect({ ok: false, error: sessionError(reported, detail) })
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────────

  function startHeartbeat(generation: number): void {
    // Exactly one loop per generation: the previous one is cancelled first.
    cancelHeartbeat?.()
    misses = 0

    const tick = (): void => {
      // The guard that makes an old loop inert even if it somehow survives.
      if (generation !== model.generation) return
      if (!heartbeatShouldRun(model)) return

      if (shouldSendOutbound(options.heartbeat) && options.sendHeartbeat !== undefined) {
        options.sendHeartbeat((frame) => options.transport.send(frame))
      }
      dispatch({ type: 'HEARTBEAT_PENDING', generation })

      const cancelTimeout = options.scheduler.after(options.heartbeat.timeoutMs, () => {
        if (generation !== model.generation) return
        if (!heartbeatShouldRun(model)) return
        if (model.liveness !== 'HEARTBEAT_PENDING') {
          // Something answered while we waited. Not a miss.
          misses = 0
          schedule()
          return
        }
        misses += 1
        dispatch({ type: 'HEARTBEAT_MISSED', generation })
        if (missesExhausted(options.heartbeat, misses)) {
          fail(generation, 'HEARTBEAT_TIMEOUT', 'Inget livstecken inom heartbeat-fönstret.')
          return
        }
        schedule()
      })
      cancelHeartbeat = () => { cancelTimeout() }
    }

    const schedule = (): void => {
      const cancel = options.scheduler.after(options.heartbeat.intervalMs, tick)
      cancelHeartbeat = () => { cancel() }
    }

    schedule()
  }

  // ─── Reconnect ──────────────────────────────────────────────────────────────

  function scheduleReconnect(): void {
    cancelReconnect?.()
    const delay = delayForAttempt(options.reconnect, model.attempt)
    // Captured now: a timer that fires after the session moved on is inert.
    const scheduledUnder = model.generation
    log({
      event: 'RECONNECT_SCHEDULED',
      state: model.state,
      generation: scheduledUnder,
      attempt: model.attempt,
      liveness: model.liveness,
      delayMs: delay,
    })
    const cancel = options.scheduler.after(delay, () => {
      if (scheduledUnder !== model.generation) return
      if (!mayReconnect(model)) return
      dispatch({ type: 'RECONNECT_ATTEMPT_STARTED' })
      void openTransport()
    })
    cancelReconnect = () => { cancel() }
  }

  // ─── Attempt ────────────────────────────────────────────────────────────────

  async function openTransport(): Promise<void> {
    const generation = model.generation
    const controller = new AbortController()
    abort = controller

    unlisten = options.transport.listen((event) => { onTransportEvent(generation, event) })

    try {
      await options.transport.open(options.endpoint, controller.signal)
    } catch (thrown) {
      if (controller.signal.aborted) return
      fail(generation, 'CONNECT_FAILED', describeThrown(thrown))
    }
  }

  function onTransportEvent(generation: number, event: TransportEvent): void {
    /*
     * THE STALE-EVENT GUARD. A close from a socket two generations old, a frame
     * from a transport already replaced — all arrive here, and all stop here.
     */
    if (generation !== model.generation) return

    switch (event.type) {
      case 'OPEN':
        dispatch({ type: 'TRANSPORT_OPENED', generation })
        void runAuthentication(generation)
        return

      case 'FRAME':
        if (options.heartbeat.inboundCountsAsActivity) {
          dispatch({ type: 'ACTIVITY_OBSERVED', generation })
          misses = 0
        }
        return

      case 'CLOSED':
        /*
         * THE RUNTIME CLASSIFIES, THE TRANSPORT ONLY REPORTED. The event says
         * nothing about whether this was wanted; `classifyClose` decides that
         * from the session's own recorded intent. Two byte-identical closes
         * therefore produce different outcomes depending on whether an operator
         * asked to stop — which is the correct direction for that authority.
         */
        if (classifyClose(model) === 'EXPECTED') {
          tearDownGeneration()
          dispatch({ type: 'DISCONNECTED' })
          settleConnect({ ok: false, error: sessionError('CANCELLED', 'Anslutningen stoppades.') })
          return
        }
        fail(generation, 'CONNECTION_LOST', 'Transporten stängdes oväntat.')
        return

      case 'ERROR':
        fail(generation, 'PROTOCOL_ERROR', event.detail)
        return

      default: {
        const exhaustive: never = event
        return exhaustive
      }
    }
  }

  async function runAuthentication(generation: number): Promise<void> {
    const controller = abort
    if (controller === null) return
    try {
      const outcome = await options.authenticate({
        send: (frame) => options.transport.send(frame),
        signal: controller.signal,
        withCredential: (use) => options.credentials.borrow(options.credentialSecretRef, use),
      })
      if (generation !== model.generation) return
      if (controller.signal.aborted) return
      if (!outcome.ok) {
        /*
         * The step's own classification is preserved verbatim. Flattening it to
         * AUTH_FAILED here would throw away exactly the distinction the typed
         * result exists to carry.
         */
        fail(generation, outcome.failure, 'Inloggningen slutfördes inte.')
        return
      }
      dispatch({ type: 'AUTHENTICATED', generation })
      startHeartbeat(generation)
      settleConnect({ ok: true })
    } catch (thrown) {
      if (generation !== model.generation) return
      if (controller.signal.aborted) return
      fail(generation, 'AUTH_FAILED', describeThrown(thrown))
    }
  }

  // ─── Public surface ─────────────────────────────────────────────────────────

  return {
    get model() { return model },

    observe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    connect() {
      // Coalesce: an attempt already in flight or established is the answer.
      if (model.state !== 'DISCONNECTED' && model.state !== 'FAILED') {
        if (pendingConnect !== null) {
          return new Promise((resolve) => {
            const previous = pendingConnect
            pendingConnect = {
              generation: model.generation,
              settle: (r) => { previous?.settle(r); resolve(r) },
            }
          })
        }
        return Promise.resolve({ ok: true as const })
      }

      tearDownGeneration()
      dispatch({ type: 'CONNECT_REQUESTED' })
      const promise = new Promise<{ ok: true } | { ok: false; error: ProviderError }>((resolve) => {
        pendingConnect = { generation: model.generation, settle: resolve }
      })
      void openTransport()
      return promise
    },

    async disconnect() {
      // Idempotent (§19 H): nothing to stop is a successful stop.
      if (model.state === 'DISCONNECTED') return
      /*
       * Intent is recorded BEFORE the close is requested, and the listener stays
       * attached across it. That ordering is what lets the CLOSED this triggers
       * be classified as expected — record after, or unsubscribe first, and the
       * runtime would have to take the transport's word for it again.
       */
      dispatch({ type: 'DISCONNECT_REQUESTED' })
      cancelHeartbeat?.()
      cancelHeartbeat = null
      cancelReconnect?.()
      cancelReconnect = null
      abort?.abort()
      abort = null
      try {
        options.transport.close()
      } catch {
        // A transport that throws on close is already gone. Teardown continues.
      }
      tearDownGeneration()
      dispatch({ type: 'DISCONNECTED' })
      settleConnect({
        ok: false,
        error: sessionError('CANCELLED', 'Anslutningen stoppades av operatören.'),
      })
    },
  }
}
