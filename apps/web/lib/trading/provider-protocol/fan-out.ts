/**
 * Omnira Trading — guaranteed multi-listener delivery over any transport.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT AN R1A CHANGE
 * ───────────────────────────────────────────────
 * A protocol session must see inbound frames. So must the runtime, which counts
 * them as liveness. Both therefore need to be listening to the same transport at
 * the same time.
 *
 * `ProviderTransport.listen` documents itself as "Subscribe to transport events.
 * Returns an unsubscribe function." That PERMITS calling it twice — nothing
 * forbids it, and each call hands back its own unsubscribe — but it never
 * PROMISES that a second listener also receives events. A transport that
 * implemented `listen` as "replace the listener" would satisfy every word of the
 * contract and silently starve whichever subscriber registered first.
 *
 * The in-memory fake happens to use a Set, so it fans out. That is one
 * implementation's behaviour, not a guarantee, and building the protocol layer
 * on it would make correctness depend on a detail no contract states.
 *
 * So the guarantee is manufactured HERE, above the contract, rather than added
 * to it. This wrapper is itself a `ProviderTransport`: it subscribes to the
 * inner transport EXACTLY ONCE and re-broadcasts to any number of subscribers.
 * R1A is untouched, sees a perfectly ordinary transport, and keeps every one of
 * its locked decisions.
 *
 * NO ORDERING GUARANTEE IS OFFERED, ON PURPOSE. Every subscriber receives every
 * event; none may depend on another having run first. Anything that needed a
 * particular order would be coupling two subscribers that are supposed to be
 * independent.
 *
 * THE INGRESS FENCE, AND THE RACE IT CLOSES
 * ─────────────────────────────────────────
 * `listen` gives R1A the full event stream, unchanged. `listenFrames` is a
 * SECOND, narrower subscription that delivers frames only while the wire is
 * between OPEN and CLOSED/ERROR — and it exists because a model observer is one
 * step too late to be the only defence.
 *
 * R1A's `fail()` does its teardown BEFORE it dispatches the terminal state:
 *
 *     tearDownGeneration()      // unsubscribes R1A, then abort()
 *     ...
 *     dispatch({ type: 'SESSION_FAILED', ... })   // observers run only here
 *
 * A transport whose abort handler synchronously emits one last frame therefore
 * lands in the gap: R1A has already unsubscribed, the lifetime binding has not
 * been told anything yet, and a session gated only on the model would still be
 * active. That frame could settle a correlated operation belonging to a
 * connection that is already gone.
 *
 * The fence closes it by moving the decision earlier than any subscriber. The
 * ingress flag is written from the OPEN/CLOSED/ERROR event ITSELF, before a
 * single subscriber is called, so by the time R1A's handler starts running —
 * let alone reaches abort — ingress is already shut.
 *
 * IT IS A FENCE, NOT A JUDGEMENT. It records whether the wire is currently
 * carrying, and nothing else. It does not decide whether a close was expected,
 * whether anything is retryable, whether a failure is fatal, or whether to
 * reconnect. Every one of those remains R1A's, on evidence this file never sees.
 */

import type {
  ProviderTransport,
  TransportEndpoint,
  TransportEvent,
  TransportFrame,
  TransportListener,
} from '../provider-runtime'

export interface FanOutTransport extends ProviderTransport {
  /** How many subscribers are currently attached. A leak check for teardown. */
  readonly subscriberCount: number
  /** Whether the wire is currently between OPEN and CLOSED/ERROR. */
  readonly ingressOpen: boolean
  /**
   * Subscribe to FRAMES ONLY, and only while ingress is open.
   *
   * Separate from `listen` on purpose. A protocol session has no business
   * seeing OPEN/CLOSED/ERROR — interpreting those is R1A's — and taking frames
   * through a narrower door means the session cannot accidentally grow an
   * opinion about them.
   */
  listenFrames(listener: (frame: TransportFrame) => void): () => void
  /** Stop re-broadcasting and release the single inner subscription. */
  dispose(): void
}

export function createFanOutTransport(inner: ProviderTransport): FanOutTransport {
  const subscribers = new Set<TransportListener>()
  const frameSubscribers = new Set<(frame: TransportFrame) => void>()
  let disposed = false
  // Closed until the wire says otherwise. A frame before OPEN belongs to nothing.
  let ingressOpen = false

  /*
   * ONE subscription to the inner transport, taken at construction rather than
   * lazily on the first subscriber. Lazy attachment would mean events arriving
   * before anyone subscribed are dropped, and "the session missed the frame
   * because it subscribed a tick late" is exactly the class of bug this layer
   * exists to remove.
   */
  const releaseInner = inner.listen((event: TransportEvent) => {
    if (disposed) return

    /*
     * THE FENCE, AND IT MOVES FIRST.
     *
     * Before any subscriber runs — before R1A's handler, before its teardown,
     * before the abort that a hostile transport can answer with one more frame.
     * Doing this after the broadcast would leave exactly the window the fence
     * exists to remove.
     */
    if (event.type === 'OPEN') ingressOpen = true
    else if (event.type === 'CLOSED' || event.type === 'ERROR') ingressOpen = false

    if (event.type === 'FRAME') {
      // Copied first: a subscriber may unsubscribe while being dispatched.
      if (ingressOpen) for (const subscriber of [...frameSubscribers]) subscriber(event.frame)
    }

    for (const subscriber of [...subscribers]) subscriber(event)
  })

  return {
    get subscriberCount() { return subscribers.size + frameSubscribers.size },
    get ingressOpen() { return ingressOpen },

    open(target: TransportEndpoint, signal: AbortSignal) { return inner.open(target, signal) },
    send(frame: TransportFrame) { inner.send(frame) },
    close() { inner.close() },

    listen(listener: TransportListener) {
      if (disposed) return () => {}
      subscribers.add(listener)
      return () => { subscribers.delete(listener) }
    },

    listenFrames(listener: (frame: TransportFrame) => void) {
      if (disposed) return () => {}
      frameSubscribers.add(listener)
      return () => { frameSubscribers.delete(listener) }
    },

    dispose() {
      if (disposed) return
      disposed = true
      ingressOpen = false
      subscribers.clear()
      frameSubscribers.clear()
      releaseInner()
    },
  }
}
