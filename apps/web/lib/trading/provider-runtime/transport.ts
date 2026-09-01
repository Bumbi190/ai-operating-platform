/**
 * Omnira Trading — the transport boundary.
 *
 * WHAT A TRANSPORT IS ALLOWED TO KNOW
 * ───────────────────────────────────
 * That it can be opened, that opaque frames go in and out, and that it can be
 * closed. Nothing else. There is no symbol, no account, no order, no template
 * id and no protocol name anywhere in this file, and an implementation that
 * needed one would be putting provider semantics below the seam that exists to
 * keep them out.
 *
 * Frames are `Uint8Array` because that is what a byte transport carries. Turning
 * bytes into meaning is a codec's job, and the codec belongs to the provider
 * adapter above this layer — R1B's problem, deliberately not R1A's.
 *
 * NO NETWORK LIVES HERE. This module declares a shape; it opens nothing. The
 * only implementation shipped in R1A is the in-memory fake, and an import guard
 * asserts that no production module in this package references WebSocket, fetch,
 * net or tls.
 */

/** An opaque frame. The runtime never inspects one. */
export type TransportFrame = Uint8Array

/**
 * What a transport can tell the runtime, and the vocabulary is small on purpose.
 *
 * A TRANSPORT REPORTS OBSERVATIONS. IT DOES NOT CLASSIFY THEM.
 * ───────────────────────────────────────────────────────────
 * `CLOSED` deliberately carries no `expected` flag, and no `fatal`, `retryable`
 * or `shouldReconnect` either. Those are conclusions, and the authority to draw
 * them belongs to the runtime, which is the only party that knows whether an
 * operator asked to stop, which generation is current, and whether this session
 * has already been superseded.
 *
 * The direction matters more than it looks. If the transport could set
 * `expected: true`, then a remote peer hanging up — or a buggy adapter — could
 * turn an unexpected loss into a clean shutdown and silently suppress the
 * reconnect that should have followed. The transport would be deciding
 * availability policy, from the layer with the least context to decide it.
 *
 * `code` and `detail` are permitted because they are observations: a numeric
 * close code and operator text. Neither implies what to do next.
 */
export type TransportEvent =
  | { readonly type: 'OPEN' }
  | { readonly type: 'FRAME'; readonly frame: TransportFrame }
  | {
      readonly type: 'CLOSED'
      /** Neutral observation, e.g. a protocol close code. Never an instruction. */
      readonly code?: number
      /** Operator text. Diagnostic only, never a decision input. */
      readonly detail?: string
    }
  | { readonly type: 'ERROR'; readonly detail: string }

export type TransportListener = (event: TransportEvent) => void

/**
 * Where a transport should connect.
 *
 * An opaque endpoint string and nothing else. Credentials are absent BY TYPE:
 * there is no field here that could hold one, so no configuration object headed
 * for a log can carry a secret by accident. Authentication happens above this
 * layer, against a credential fetched at the moment of use.
 */
export interface TransportEndpoint {
  readonly endpoint: string
}

export interface ProviderTransport {
  /**
   * Open the transport.
   *
   * Resolves when the attempt has been made; the outcome arrives as an `OPEN`,
   * `CLOSED` or `ERROR` event, not as a return value. One path for outcomes
   * means the runtime cannot learn the same fact two different ways and have
   * them disagree.
   *
   * `signal` must abort a connect in progress. An aborted connect is not a
   * failure to be retried — it is a stop the operator asked for.
   */
  open(target: TransportEndpoint, signal: AbortSignal): Promise<void>

  /** Send one opaque frame. */
  send(frame: TransportFrame): void

  /**
   * Close, deliberately.
   *
   * The resulting `CLOSED` event is indistinguishable from a remote close, and
   * that is the point: the runtime classifies it from its own recorded intent,
   * not from anything the transport says about it.
   */
  close(): void

  /** Subscribe to transport events. Returns an unsubscribe function. */
  listen(listener: TransportListener): () => void
}
