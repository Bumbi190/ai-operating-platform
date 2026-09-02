/**
 * Omnira Trading — pending protocol operations, when a protocol has any.
 *
 * OPTIONAL BY CONSTRUCTION
 * ────────────────────────
 * Correlation is a property of request/response protocols. A pure stream has no
 * requests to correlate, and must be usable without ever touching this file. So
 * a session takes a key extractor or it does not; nothing here is mandatory, and
 * no message type is required to carry an id.
 *
 * DETERMINISTIC, BOUNDED, AND EXPLICITLY SETTLED
 * ──────────────────────────────────────────────
 * Keys come from a monotonic counter or from the protocol's own field — never
 * from a clock and never from randomness. A registry has a capacity, because an
 * unbounded map of pending operations is a leak that only shows up under load.
 * Settlement is explicit: nothing resolves because time passed.
 *
 * DISPOSAL IS THE ISOLATION MECHANISM
 * ───────────────────────────────────
 * There is no generation counter here, deliberately. R1A already owns generations
 * for transport attempts, and a second counter beside it would be two sources of
 * truth about which era we are in. Instead a registry belongs to one session
 * lifetime: dispose it and every pending operation is refused, and every late
 * settlement lands on a registry that no longer accepts anything. A stale
 * response cannot satisfy a new request because the object that knew the key is
 * gone.
 */

/** Why an operation could not be opened. */
export const OPEN_REFUSALS = ['DUPLICATE_KEY', 'CAPACITY_EXCEEDED', 'DISPOSED'] as const
export type OpenRefusal = (typeof OPEN_REFUSALS)[number]

/** What happened when a settlement arrived. */
export const SETTLE_OUTCOMES = ['SETTLED', 'UNKNOWN_KEY', 'DISPOSED'] as const
export type SettleOutcome = (typeof SETTLE_OUTCOMES)[number]

/**
 * Why a pending operation ended without a value.
 *
 * Four different facts, kept apart because the layer above answers them
 * differently — and because collapsing them would report one situation as
 * another in exactly the cases that are hardest to debug:
 *
 *   DISPOSED    the object was torn down
 *   ABORTED     the caller's own signal fired
 *   ROTATED     a newer authoritative generation replaced this lifetime
 *   LINK_ENDED  the link stopped being usable — no generation advanced
 *
 * All four are OBSERVATIONS. None says whether anything should be retried; that
 * judgement belongs to R1A, which is the only layer holding a retry budget.
 */
export const PENDING_CANCELLATIONS = ['DISPOSED', 'ABORTED', 'ROTATED', 'LINK_ENDED'] as const
export type PendingCancellation = (typeof PENDING_CANCELLATIONS)[number]

export type PendingResult<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly cancelled: PendingCancellation }

export type OpenOutcome<V> =
  | { readonly ok: true; readonly settled: Promise<PendingResult<V>> }
  | { readonly ok: false; readonly refusal: OpenRefusal }

export interface CorrelationOptions {
  /**
   * Maximum simultaneously pending operations.
   *
   * Required, not defaulted to infinity: a registry you cannot construct without
   * stating a bound cannot silently become one.
   */
  readonly capacity: number
}

export interface CorrelationRegistry<K, V> {
  readonly pending: number
  readonly disposed: boolean
  /** Begin waiting for `key`. The signal aborts this wait only. */
  open(key: K, signal?: AbortSignal): OpenOutcome<V>
  /** Deliver a value for `key`. Reports what happened rather than throwing. */
  settle(key: K, value: V): SettleOutcome
  /**
   * End the registry. Every pending operation is cancelled.
   *
   * `as` names why, so a lifetime rotation is not reported as a teardown.
   */
  dispose(as?: PendingCancellation): void
}

export function createCorrelationRegistry<K, V>(
  options: CorrelationOptions,
): CorrelationRegistry<K, V> {
  const waiting = new Map<K, (result: PendingResult<V>) => void>()
  let disposed = false

  return {
    get pending() { return waiting.size },
    get disposed() { return disposed },

    open(key, signal) {
      if (disposed) return { ok: false, refusal: 'DISPOSED' }
      /*
       * A duplicate key is refused rather than overwritten. Overwriting would
       * strand the first caller on a promise nothing can ever settle, and it
       * would do so silently.
       */
      if (waiting.has(key)) return { ok: false, refusal: 'DUPLICATE_KEY' }
      if (waiting.size >= options.capacity) return { ok: false, refusal: 'CAPACITY_EXCEEDED' }

      let resolve: (result: PendingResult<V>) => void = () => {}
      const settled = new Promise<PendingResult<V>>((r) => { resolve = r })

      const finish = (result: PendingResult<V>): void => {
        if (!waiting.has(key)) return
        waiting.delete(key)
        resolve(result)
      }
      waiting.set(key, finish)

      if (signal !== undefined) {
        if (signal.aborted) {
          finish({ ok: false, cancelled: 'ABORTED' })
        } else {
          signal.addEventListener(
            'abort',
            () => { finish({ ok: false, cancelled: 'ABORTED' }) },
            { once: true },
          )
        }
      }
      return { ok: true, settled }
    },

    settle(key, value) {
      if (disposed) return 'DISPOSED'
      const finish = waiting.get(key)
      // An unknown key is a FACT, not an error: unsolicited messages are normal.
      if (finish === undefined) return 'UNKNOWN_KEY'
      finish({ ok: true, value })
      return 'SETTLED'
    },

    dispose(as = 'DISPOSED') {
      if (disposed) return
      disposed = true
      for (const finish of [...waiting.values()]) finish({ ok: false, cancelled: as })
      waiting.clear()
    },
  }
}

/**
 * A monotonic key source.
 *
 * Deterministic on purpose: the same sequence of calls yields the same keys on
 * every machine and every run. No clock, no randomness — the rule the whole
 * Trading tree follows, and the reason a correlation test can assert exact keys.
 */
export function createCounterKeys(start = 1): { next(): number } {
  let n = start - 1
  return { next: () => { n += 1; return n } }
}
