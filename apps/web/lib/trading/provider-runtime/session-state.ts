/**
 * Omnira Trading — the provider session state machine.
 *
 * WHY A PURE REDUCER, AGAIN
 * ─────────────────────────
 * Connectivity bugs are ordering bugs. A connect result arriving after the
 * operator disconnected. A heartbeat timing out for a session that was replaced
 * two reconnects ago. A close event from a socket nobody is listening to any
 * more. None of those need a socket to reproduce, and every one of them is
 * invisible in a design built from independent booleans.
 *
 * NO BOOLEAN SOUP. There is no `isConnected`, `isConnecting`, `hasError` or
 * `isRetrying` here. Those four flags describe sixteen combinations of which
 * roughly five are legal, and nothing in the type system says which. One `state`
 * field with eight named values makes the illegal combinations unrepresentable
 * instead of merely undesirable.
 *
 * GENERATIONS
 * ───────────
 * Every connection attempt gets a generation. Every event that could have been
 * scheduled by an earlier attempt carries the generation it was born under, and
 * the reducer drops it if it no longer matches. That single comparison is the
 * whole defence against stale sockets, stale timers and stale heartbeats — the
 * same mechanism Stage 1.9B uses for stale history pages, for the same reason.
 */

import { isRetriable, type SessionFailure } from './failure'

export const SESSION_STATES = [
  /** No transport, and none wanted. The resting state. */
  'DISCONNECTED',
  /** A transport is being opened. */
  'CONNECTING',
  /** Transport is up; credentials are being presented. */
  'AUTHENTICATING',
  /** Authenticated and live. */
  'READY',
  /** Authenticated, but liveness evidence is missing. Still connected. */
  'DEGRADED',
  /** Waiting out a backoff delay before the next attempt. */
  'RECONNECTING',
  /** An operator-requested stop is in progress. */
  'DISCONNECTING',
  /** Terminal. Nothing will be retried without a new explicit connect. */
  'FAILED',
] as const
export type SessionState = (typeof SESSION_STATES)[number]

/**
 * What the runtime can observe about the link — and nothing more.
 *
 * DELIBERATELY NOT PROVIDER HEALTH. An open socket is evidence that a socket is
 * open. It is not evidence that the provider is answering correctly, that its
 * data is current, or that trading may proceed. `ProviderHealth` is a verdict
 * someone else issues, on more evidence than this file has.
 */
export const LIVENESS_STATES = [
  'TRANSPORT_DOWN',
  'TRANSPORT_UP',
  'ACTIVITY_RECENT',
  'HEARTBEAT_PENDING',
  'HEARTBEAT_MISSED',
] as const
export type Liveness = (typeof LIVENESS_STATES)[number]

export interface SessionModel {
  readonly state: SessionState
  /** Increments on every attempt. Events from older generations are dropped. */
  readonly generation: number
  /** Attempts made since the last successful READY. 0 before the first. */
  readonly attempt: number
  readonly lastFailure: SessionFailure | null
  readonly liveness: Liveness
  /**
   * Whether an operator asked to stop.
   *
   * The distinction that decides everything afterwards: an operator-requested
   * disconnect must never be followed by a reconnect, however retriable the
   * transport failure that accompanies it looks. Losing this bit is how a
   * "disconnect" button becomes a reconnect loop.
   */
  readonly disconnectRequested: boolean
  /** Whether the runtime may schedule another attempt. */
  readonly reconnectEligible: boolean
}

export function initialSessionModel(): SessionModel {
  return {
    state: 'DISCONNECTED',
    generation: 0,
    attempt: 0,
    lastFailure: null,
    liveness: 'TRANSPORT_DOWN',
    disconnectRequested: false,
    reconnectEligible: false,
  }
}

/**
 * Events carrying a generation are only honoured for the current one.
 *
 * The runtime supplies the generation it captured when it started the work; if
 * the session has moved on, the event describes a world that no longer exists.
 */
export type SessionAction =
  | { readonly type: 'CONNECT_REQUESTED' }
  | { readonly type: 'TRANSPORT_OPENED'; readonly generation: number }
  | { readonly type: 'AUTHENTICATED'; readonly generation: number }
  | { readonly type: 'ACTIVITY_OBSERVED'; readonly generation: number }
  | { readonly type: 'HEARTBEAT_PENDING'; readonly generation: number }
  | { readonly type: 'HEARTBEAT_ACKED'; readonly generation: number }
  | { readonly type: 'HEARTBEAT_MISSED'; readonly generation: number }
  | {
      readonly type: 'SESSION_FAILED'
      readonly generation: number
      readonly failure: SessionFailure
      /**
       * Whether the reconnect budget still has an attempt in it.
       *
       * Supplied by the runtime because the policy lives there. Without it the
       * machine would have to assume a budget exists and enter RECONNECTING
       * even when none was configured — which reports "we gave up retrying" for
       * a session that was never going to retry, and buries the real cause.
       */
      readonly retryBudgetAvailable: boolean
    }
  | { readonly type: 'DISCONNECT_REQUESTED' }
  | { readonly type: 'DISCONNECTED' }
  | { readonly type: 'RECONNECT_ATTEMPT_STARTED' }

/** Whether an event born under `generation` still speaks for this session. */
export function isCurrent(model: SessionModel, generation: number): boolean {
  return generation === model.generation
}

/** States in which a transport exists and is usable. */
export function isEstablished(state: SessionState): boolean {
  return state === 'READY' || state === 'DEGRADED'
}

export function sessionReducer(model: SessionModel, action: SessionAction): SessionModel {
  switch (action.type) {
    /*
     * A connect request always advances the generation, even from
     * DISCONNECTED. Anything still in flight from a previous attempt is
     * invalidated by the same action that starts the new one, so the two can
     * never be confused for each other.
     */
    case 'CONNECT_REQUESTED':
      // Already established or on the way: coalesce rather than open a second
      // transport. Documented in `runtime.ts`; the machine simply refuses.
      if (model.state !== 'DISCONNECTED' && model.state !== 'FAILED') return model
      return {
        ...model,
        state: 'CONNECTING',
        generation: model.generation + 1,
        attempt: 1,
        lastFailure: null,
        liveness: 'TRANSPORT_DOWN',
        disconnectRequested: false,
        reconnectEligible: false,
      }

    case 'RECONNECT_ATTEMPT_STARTED':
      if (model.state !== 'RECONNECTING') return model
      return {
        ...model,
        state: 'CONNECTING',
        generation: model.generation + 1,
        attempt: model.attempt + 1,
        liveness: 'TRANSPORT_DOWN',
      }

    case 'TRANSPORT_OPENED':
      if (!isCurrent(model, action.generation)) return model
      if (model.state !== 'CONNECTING') return model
      return { ...model, state: 'AUTHENTICATING', liveness: 'TRANSPORT_UP' }

    case 'AUTHENTICATED':
      if (!isCurrent(model, action.generation)) return model
      if (model.state !== 'AUTHENTICATING') return model
      return {
        ...model,
        state: 'READY',
        // A successful session resets the budget for the next failure.
        attempt: 0,
        lastFailure: null,
        liveness: 'ACTIVITY_RECENT',
        reconnectEligible: true,
      }

    case 'ACTIVITY_OBSERVED':
      if (!isCurrent(model, action.generation)) return model
      if (!isEstablished(model.state)) return model
      // Inbound traffic is liveness evidence, so a DEGRADED link recovers.
      return { ...model, state: 'READY', liveness: 'ACTIVITY_RECENT' }

    case 'HEARTBEAT_PENDING':
      if (!isCurrent(model, action.generation)) return model
      if (!isEstablished(model.state)) return model
      return { ...model, liveness: 'HEARTBEAT_PENDING' }

    case 'HEARTBEAT_ACKED':
      if (!isCurrent(model, action.generation)) return model
      if (!isEstablished(model.state)) return model
      return { ...model, state: 'READY', liveness: 'ACTIVITY_RECENT' }

    /*
     * A missed heartbeat DEGRADES; it does not disconnect. The link may still
     * be carrying data, and tearing down a working session on one missed beat
     * is worse than reporting reduced confidence. Escalation to a failure is
     * the heartbeat policy's decision, not this transition's.
     */
    case 'HEARTBEAT_MISSED':
      if (!isCurrent(model, action.generation)) return model
      if (!isEstablished(model.state)) return model
      return { ...model, state: 'DEGRADED', liveness: 'HEARTBEAT_MISSED' }

    case 'SESSION_FAILED': {
      if (!isCurrent(model, action.generation)) return model
      if (model.state === 'DISCONNECTED' || model.state === 'FAILED') return model

      /*
       * THE RULE THAT MATTERS MOST HERE. An operator who asked to stop gets to
       * stop. A transport failure arriving during the teardown is the expected
       * consequence of that request, not a reason to start reconnecting.
       */
      const eligible = !model.disconnectRequested
        && isRetriable(action.failure)
        && action.retryBudgetAvailable
      return {
        ...model,
        state: eligible ? 'RECONNECTING' : 'FAILED',
        lastFailure: action.failure,
        liveness: 'TRANSPORT_DOWN',
        reconnectEligible: eligible,
      }
    }

    case 'DISCONNECT_REQUESTED':
      if (model.state === 'DISCONNECTED') return model
      /*
       * THE GENERATION DELIBERATELY DOES NOT ADVANCE HERE.
       *
       * It used to, on the theory that invalidating everything at once was
       * safest. But the runtime has to still RECEIVE the close its own
       * `transport.close()` causes, in order to classify it as expected — and
       * an advanced generation would drop that event as stale, leaving the
       * classification with nothing to classify.
       *
       * Nothing is lost. Pending work is stopped by the abort signal and the
       * timer cancels; the state guards on TRANSPORT_OPENED and AUTHENTICATED
       * refuse anything that arrives during DISCONNECTING; and the NEXT
       * connect advances the generation, which is what actually protects a new
       * session from an old one's late events.
       */
      return {
        ...model,
        state: 'DISCONNECTING',
        disconnectRequested: true,
        reconnectEligible: false,
        liveness: 'TRANSPORT_DOWN',
      }

    case 'DISCONNECTED':
      return {
        ...initialSessionModel(),
        // Generation is never rewound: a rewind would let an old event match again.
        generation: model.generation,
        lastFailure: model.lastFailure,
      }

    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

/**
 * How a close should be read, decided from the runtime's own recorded intent.
 *
 * THIS IS THE AUTHORITY THAT USED TO SIT IN THE TRANSPORT, AND IT BELONGS HERE.
 * A close event is identical on the wire whether we asked for it or the network
 * vanished; only the session knows which. Deriving it from `disconnectRequested`
 * means a remote peer cannot dress an unexpected loss up as a clean shutdown and
 * suppress the reconnect that should follow.
 *
 * Pure, so the two readings of one identical observation can be asserted side by
 * side without a transport in the picture at all.
 */
export function classifyClose(model: SessionModel): 'EXPECTED' | 'UNEXPECTED' {
  if (model.disconnectRequested) return 'EXPECTED'
  if (model.state === 'DISCONNECTING' || model.state === 'DISCONNECTED') return 'EXPECTED'
  return 'UNEXPECTED'
}

/** Whether the runtime should schedule another attempt right now. */
export function mayReconnect(model: SessionModel): boolean {
  return model.state === 'RECONNECTING'
    && model.reconnectEligible
    && !model.disconnectRequested
}

/** Whether a heartbeat loop should be running for this model. */
export function heartbeatShouldRun(model: SessionModel): boolean {
  return isEstablished(model.state)
}
