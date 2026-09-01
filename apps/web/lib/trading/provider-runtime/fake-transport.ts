/**
 * Omnira Trading — the in-memory transport, and the only one R1A ships.
 *
 * Every scenario the runtime must survive is producible here by calling a
 * method: open, fail, drop, reject, and so on. No socket, no port, no timing
 * dependency — so the race tests describe orderings rather than hope for them.
 *
 * It also records what happened (`opens`, `sent`, `closes`), which is what lets
 * a reconnect test assert an exact number of transport opens instead of
 * inferring it from state.
 */

import type {
  ProviderTransport,
  TransportEndpoint,
  TransportEvent,
  TransportFrame,
  TransportListener,
} from './transport'

export interface FakeTransport extends ProviderTransport {
  /** How many times `open` was called. The reconnect-budget assertion. */
  readonly opens: number
  readonly closes: number
  readonly sent: readonly TransportFrame[]
  /** Endpoints passed to `open`, in order. */
  readonly targets: readonly string[]

  /** Report the transport as open. */
  emitOpen(): void
  /** Deliver an inbound frame. */
  emitFrame(frame?: TransportFrame): void
  /**
   * Report a close.
   *
   * Takes no intent argument, deliberately. The fake cannot say whether a close
   * was wanted, because a real transport cannot either — the runtime decides
   * that from its own state. Optional `code`/`detail` are observations.
   */
  emitClosed(observation?: { code?: number; detail?: string }): void
  /** Report a transport-level error. */
  emitError(detail: string): void

  /** Make the next `open` reject. Simulates a connect failure. */
  failNextOpen(detail: string): void
  /** Make `open` never settle, so a connect can be aborted mid-flight. */
  hangNextOpen(): void
  /** Whether the last open's signal was aborted. */
  readonly lastOpenAborted: boolean
  /** Listeners currently attached — a leak check. */
  readonly listenerCount: number
}

export function createFakeTransport(): FakeTransport {
  const listeners = new Set<TransportListener>()
  const sent: TransportFrame[] = []
  const targets: string[] = []
  let opens = 0
  let closes = 0
  let failDetail: string | null = null
  let hang = false
  let lastAborted = false

  const emit = (event: TransportEvent): void => {
    // Copied first: a listener that unsubscribes during dispatch must not
    // mutate the set being iterated.
    for (const listener of [...listeners]) listener(event)
  }

  return {
    get opens() { return opens },
    get closes() { return closes },
    get sent() { return sent },
    get targets() { return targets },
    get lastOpenAborted() { return lastAborted },
    get listenerCount() { return listeners.size },

    async open(target: TransportEndpoint, signal: AbortSignal) {
      opens += 1
      targets.push(target.endpoint)
      lastAborted = false
      signal.addEventListener('abort', () => { lastAborted = true }, { once: true })

      if (failDetail !== null) {
        const detail = failDetail
        failDetail = null
        throw new Error(detail)
      }
      if (hang) {
        hang = false
        // Never settles. The runtime must rely on the abort signal, not on this.
        await new Promise<void>(() => {})
      }
    },

    send(frame: TransportFrame) { sent.push(frame) },

    close() {
      closes += 1
      // Indistinguishable from a remote close, on purpose.
      emit({ type: 'CLOSED' })
    },

    listen(listener: TransportListener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    emitOpen() { emit({ type: 'OPEN' }) },
    emitFrame(frame = new Uint8Array([1])) { emit({ type: 'FRAME', frame }) },
    emitClosed(observation = {}) { emit({ type: 'CLOSED', ...observation }) },
    emitError(detail: string) { emit({ type: 'ERROR', detail }) },

    failNextOpen(detail: string) { failDetail = detail },
    hangNextOpen() { hang = true },
  }
}

/**
 * A credential provider for tests.
 *
 * The value is a placeholder, and `borrows` records that borrowing happened
 * without recording what was borrowed — which is the same discipline the
 * production path follows.
 */
export function createFakeCredentials(secret = 'placeholder-not-a-real-secret'): {
  readonly borrow: <T>(ref: string, use: (secret: string) => T | Promise<T>) => Promise<T>
  readonly borrows: readonly string[]
} {
  const borrows: string[] = []
  return {
    borrows,
    async borrow(ref, use) {
      borrows.push(ref)
      return await use(secret)
    },
  }
}
