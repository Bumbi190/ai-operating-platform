/**
 * Omnira Trading — the protocol session.
 *
 * WHAT IT IS
 * ──────────
 * The thing that turns a stream of opaque frames into typed messages, settles
 * whatever the protocol correlates, and reports what it saw. It sits BESIDE the
 * R1A runtime, not inside it: both subscribe to the same transport, and neither
 * knows the other exists.
 *
 * WHAT IT REFUSES TO OWN
 * ──────────────────────
 * Reconnection, backoff, retry budgets, close intent, heartbeat timing, capability
 * decisions, canonical reason codes, authority. Every one of those is R1A's or a
 * layer above's. This session reports FACTS — "a message arrived", "bytes could
 * not be decoded" — and lets the layer that owns policy decide what they mean.
 *
 * WHY SUBSCRIBING EARLY MATTERS
 * ─────────────────────────────
 * A session subscribes at construction, before the runtime is ever told to
 * connect. A protocol that answers inside the same tick as the request — which a
 * fake, a loopback, or a fast local peer all can — would otherwise deliver its
 * response before a late subscriber existed, and the awaiting caller would hang
 * forever waiting for something that already happened.
 *
 * THIS MODULE IS PACKAGE-INTERNAL
 * ───────────────────────────────
 * `createProtocolSession` is NOT exported from the package root, and a guard
 * fails the build if anything outside this directory imports this file. The
 * reason is the whole point of the module below: a session is only safe while
 * something is ending its lifetime when the link stops being usable, and a
 * constructor that hands out an unbound session is a constructor someone will
 * eventually use without the binding. `createProtocolIntegration` in
 * `integration.ts` is the only public way to build one, and it cannot produce an
 * unbound session because it creates the runtime and the binding together.
 *
 * THREE ISOLATION MECHANISMS, ONE AUTHORITY
 * ─────────────────────────────────────────
 * DISPOSAL ends a session for good: it stops listening, refuses every pending
 * operation, and can never settle anything again.
 *
 * TERMINATION ends the current lifetime without ending the object. R1A can stop
 * being usable WITHOUT advancing its generation at all — it can sit in FAILED
 * with no retry budget, wait out a backoff in RECONNECTING, or be stopped by an
 * operator (whose `DISCONNECT_REQUESTED` deliberately does not advance the
 * generation, so the runtime can still classify the close it is about to cause).
 * Waiting for the next generation in any of those cases means waiting forever.
 * `endLifetime()` cancels pending work as `LINK_ENDED` and marks the session
 * inactive; while inactive it treats no inbound frame as current traffic.
 *
 * ROTATION handles the case disposal cannot. R1A may reconnect INSIDE the same
 * runtime instance — same options object, same `AuthenticationStep`, called
 * again after a later OPEN — advancing its own generation as it goes. Nothing
 * disposes this session across that, so without rotation a request left pending
 * under generation 1 would still be sitting in the registry when generation 2
 * authenticates, and a later response could satisfy work that belongs to a
 * connection that no longer exists.
 *
 * `beginLifetime(generation)` is the answer, and the argument is the whole point.
 * THIS PACKAGE NEVER ADVANCES A GENERATION. R1A is the sole authority for
 * transport-attempt identity; the number is READ from `runtime.model.generation`
 * and handed in. A counter of our own would be a second opinion about which era
 * we are in, which is the failure mode the design forbids — so the guard suite
 * bans arithmetic on a generation while explicitly permitting the observation.
 *
 * The supervisor is what connects the two: it observes the runtime and rotates
 * on change. See `supervisor.ts` for the ordering proof.
 */

import type { TransportFrame } from '../provider-runtime'
import type { CodecRefusal, ProtocolCodec } from './codec'
import {
  createCorrelationRegistry,
  type CorrelationRegistry,
  type OpenRefusal,
  type PendingResult,
} from './correlation'

/**
 * What the session observed, in terms the runtime already understands.
 *
 * Deliberately tiny. `ACTIVITY` mirrors R1A's own liveness vocabulary rather than
 * inventing a parallel one, and `DECODE_REFUSED` is an observation about bytes —
 * neither says whether anything should be retried.
 */
export const PROTOCOL_FACTS = ['ACTIVITY', 'DECODE_REFUSED', 'CODEC_EXCEPTION'] as const
export type ProtocolFactKind = (typeof PROTOCOL_FACTS)[number]

export type ProtocolFact =
  | { readonly kind: 'ACTIVITY' }
  /** The codec examined the bytes and refused them. A normal protocol outcome. */
  | { readonly kind: 'DECODE_REFUSED'; readonly refusal: CodecRefusal }
  /**
   * The codec threw.
   *
   * A CONTRACT VIOLATION, NOT A VERDICT ABOUT THE BYTES. An exception proves the
   * codec failed; it does not prove the input was malformed, and reporting it as
   * MALFORMED would put a fabricated classification into the record — the codec
   * never reached one.
   *
   * Deliberately payload-free. A thrown value can carry anything the codec was
   * holding, including a frame under construction; forwarding it would make this
   * fact a leak, and turning it into a message would put prose where every other
   * signal in this tree is machine-readable.
   */
  | { readonly kind: 'CODEC_EXCEPTION' }

export type ProtocolFactListener = (fact: ProtocolFact) => void

/**
 * The narrow door frames come through.
 *
 * FRAMES ONLY, AND STRUCTURALLY SO. A session cannot see OPEN, CLOSED or ERROR
 * because this type does not carry them — interpreting those is R1A's, and a
 * session that could read them is a session that can grow an opinion about them.
 * The fan-out's `listenFrames` satisfies this, and also fences delivery to the
 * window between OPEN and CLOSED/ERROR; see `fan-out.ts` for the race that
 * makes the fence necessary in addition to the lifetime binding.
 */
export interface ProtocolFrameSource {
  send(frame: TransportFrame): void
  listenFrames(listener: (frame: TransportFrame) => void): () => void
}

export interface ProtocolSessionOptions<Outbound, Inbound, Key> {
  readonly transport: ProtocolFrameSource
  readonly codec: ProtocolCodec<Outbound, Inbound>
  /**
   * How to find the correlation key on an inbound message, if this protocol
   * correlates at all. Return `null` for an unsolicited message.
   *
   * Omitted entirely for a streaming protocol — then nothing correlates and no
   * registry exists.
   */
  readonly correlationKeyOf?: (message: Inbound) => Key | null
  /** Maximum simultaneously pending operations. Required when correlating. */
  readonly capacity?: number
  readonly onFact?: ProtocolFactListener
}

/**
 * Why a send did not happen.
 *
 * A codec refusal, or the lifetime condition. Kept as its own union rather than
 * reusing `CodecRefusal`: a disposed session is not a malformed message, and
 * flattening the two would tell a caller the wrong thing about its own bug.
 */
export type SendRefusal = CodecRefusal | 'DISPOSED' | 'INACTIVE'

/** Why a correlated wait could not be opened. */
export type AwaitRefusal = OpenRefusal | 'NOT_CORRELATED' | 'INACTIVE'

export type SendOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: SendRefusal }

export type AwaitOutcome<Inbound> =
  | { readonly ok: true; readonly settled: Promise<PendingResult<Inbound>> }
  | { readonly ok: false; readonly refusal: AwaitRefusal }

/**
 * The part of a session a supervisor drives.
 *
 * Non-generic on purpose: a supervisor holds roles whose message types differ,
 * and it has no business knowing any of them.
 */
export interface ProtocolLifetime {
  /** Whether a lifetime is in force. While false, no frame is current traffic. */
  readonly active: boolean
  /**
   * The R1A generation this session's state currently belongs to.
   *
   * OBSERVED, NEVER INVENTED. It only ever changes because `beginLifetime` was
   * handed a number that came from `runtime.model.generation`.
   */
  readonly generation: number
  /**
   * Begin a lifetime under `generation`.
   *
   * Idempotent while already active under the same generation, which is what
   * makes it safe to call from an observer that fires on every state change.
   * Beginning under a NEWER generation while still active cancels whatever the
   * previous one owned as `ROTATED`.
   */
  beginLifetime(generation: number): void
  /**
   * End the current lifetime. The object survives; the lifetime does not.
   *
   * Pending work is cancelled as `LINK_ENDED`, and until a new lifetime begins
   * the session treats nothing arriving on the transport as current traffic.
   * Idempotent, and never triggers anything — reconnection is R1A's alone.
   */
  endLifetime(): void
}

/**
 * What a provider integration is given.
 *
 * Read, send, await, observe. NO lifetime control: `beginLifetime`/`endLifetime`
 * belong to the binding, and a consumer that could call them could desynchronise
 * protocol state from the runtime that actually owns the connection.
 */
export interface BoundProtocolSession<Outbound, Inbound, Key> {
  readonly active: boolean
  readonly generation: number
  readonly disposed: boolean
  readonly pending: number
  /** Every decoded inbound message of the ACTIVE lifetime. Returns unsubscribe. */
  observe(listener: (message: Inbound) => void): () => void
  /**
   * Encode and send.
   *
   * ENCODING refusals come back as values. A transport that throws on `send` is
   * deliberately NOT caught: the only refusal this layer could offer would be a
   * transport classification, and classifying transport conditions is R1A's job.
   * R1A learns the link is gone from its own ERROR/CLOSED events.
   */
  send(message: Outbound): SendOutcome
  /** Wait for the message whose key is `key`. Requires `correlationKeyOf`. */
  awaitCorrelated(key: Key, signal?: AbortSignal): AwaitOutcome<Inbound>
}

export interface ProtocolSession<Outbound, Inbound, Key>
  extends BoundProtocolSession<Outbound, Inbound, Key>, ProtocolLifetime {
  dispose(): void
}

export function createProtocolSession<Outbound, Inbound, Key>(
  options: ProtocolSessionOptions<Outbound, Inbound, Key>,
): ProtocolSession<Outbound, Inbound, Key> {
  const observers = new Set<(message: Inbound) => void>()
  const correlating = options.correlationKeyOf !== undefined
  const capacity = options.capacity ?? 64
  const newRegistry = (): CorrelationRegistry<Key, Inbound> | null =>
    correlating ? createCorrelationRegistry<Key, Inbound>({ capacity }) : null

  let registry = newRegistry()
  let disposed = false
  let active = false
  /*
   * R1A's number, held so rotation can be idempotent. Never incremented here —
   * the only write is the assignment from the argument below.
   */
  let observedGeneration = 0

  const report = (fact: ProtocolFact): void => { options.onFact?.(fact) }

  const onFrame = (frame: TransportFrame): void => {
    if (disposed) return
    /*
     * THE ACTIVE-LIFETIME GATE, and the second of two independent defences.
     *
     * The fan-out's ingress fence already refuses frames outside the OPEN..CLOSED
     * window, which is what closes the synchronous abort-reentrancy race. This
     * gate answers a different question: whether R1A still considers the ATTEMPT
     * usable. A link can be open while the runtime has moved on — and bytes can
     * arrive before any connect, during a backoff, after a stop. None of those
     * are this session's traffic, so they settle nothing, reach no observer, and
     * produce no fact: reporting ACTIVITY for an attempt R1A considers finished
     * would be this layer asserting something it cannot know.
     *
     * The subscription itself stays attached. Detaching and reattaching would
     * reintroduce the subscribe-late race the fan-out exists to remove.
     */
    if (!active) return

    let outcome
    try {
      outcome = options.codec.decode(frame)
    } catch {
      /*
       * The contract says a codec returns refusals rather than throwing, so a
       * throw is a defect in the codec — NOT evidence about the bytes. Calling
       * it MALFORMED would invent a classification the codec never reached, and
       * would be indistinguishable afterwards from a codec that really did
       * inspect the frame and reject it. The thrown value is not touched.
       */
      report({ kind: 'CODEC_EXCEPTION' })
      return
    }

    if (!outcome.ok) {
      report({ kind: 'DECODE_REFUSED', refusal: outcome.refusal })
      return
    }

    /*
     * A frame that decoded is evidence the link is alive. Reported as a fact;
     * whether it resets any liveness window is R1A's decision, not this one's.
     */
    report({ kind: 'ACTIVITY' })

    if (registry !== null && options.correlationKeyOf !== undefined) {
      const key = options.correlationKeyOf(outcome.message)
      // An unsolicited message is normal — settle what matches, deliver the rest.
      if (key !== null) registry.settle(key, outcome.message)
    }
    for (const observer of [...observers]) observer(outcome.message)
  }

  // Subscribed at construction, before any connect. See the header.
  const unlisten = options.transport.listenFrames(onFrame)

  return {
    get disposed() { return disposed },
    get pending() { return registry?.pending ?? 0 },
    get generation() { return observedGeneration },
    get active() { return active },

    beginLifetime(generation) {
      if (disposed) return
      // Idempotent: the observer that drives this fires on every state change.
      if (active && generation === observedGeneration) return
      observedGeneration = generation
      /*
       * The previous registry is cancelled and DROPPED, not emptied. Its pending
       * promises are already settled, so a late response cannot satisfy them;
       * and the new registry starts empty, so the same correlation key is free
       * for the new lifetime to use.
       *
       * ROTATED, because reaching here while still active means a newer
       * generation replaced this one. A lifetime that ENDED first was already
       * cancelled as LINK_ENDED and has nothing left to cancel.
       */
      if (active) registry?.dispose('ROTATED')
      registry = newRegistry()
      active = true
    },

    endLifetime() {
      if (disposed || !active) return
      active = false
      /*
       * LINK_ENDED, and nothing else happens. No retry is scheduled, no failure
       * is classified, no reason code is issued — this layer reports that the
       * lifetime stopped and leaves every judgement about it to R1A.
       */
      registry?.dispose('LINK_ENDED')
      registry = newRegistry()
    },

    observe(listener) {
      if (disposed) return () => {}
      observers.add(listener)
      return () => { observers.delete(listener) }
    },

    send(message) {
      if (disposed) return { ok: false, refusal: 'DISPOSED' }
      // Nothing to send into: there is no attempt this message would belong to.
      if (!active) return { ok: false, refusal: 'INACTIVE' }
      const outcome = options.codec.encode(message)
      if (!outcome.ok) return { ok: false, refusal: outcome.refusal }
      options.transport.send(outcome.frame)
      return { ok: true }
    },

    awaitCorrelated(key, signal) {
      if (!active) return { ok: false, refusal: 'INACTIVE' }
      /*
       * NOT_CORRELATED, not DISPOSED. A streaming session that never correlates
       * is perfectly healthy; reporting it as disposed would send the caller
       * looking for a lifetime bug that does not exist.
       */
      if (registry === null) return { ok: false, refusal: 'NOT_CORRELATED' }
      return registry.open(key, signal)
    },

    dispose() {
      if (disposed) return
      disposed = true
      active = false
      unlisten()
      observers.clear()
      registry?.dispose()
    },
  }
}

/** A frame, unchanged. Re-exported so callers need not reach into R1A for it. */
export type { TransportFrame }
