/**
 * Omnira Trading — the runtime scheduling clock.
 *
 * THIS CLOCK IS NOT PROVIDER TIME, AND MAY NEVER BECOME IT
 * ───────────────────────────────────────────────────────
 * Two different concepts share the word "time" here, and conflating them would
 * be a correctness failure, not a naming one:
 *
 *   RUNTIME time  — how long until the next reconnect, has the heartbeat window
 *                   elapsed. Local, monotonic, arbitrary origin. That is this
 *                   file.
 *
 *   PROVIDER time — what the provider says the instant is. Authoritative,
 *                   remote, and the only thing `getProviderTime()` may report.
 *                   That is NOT this file, and nothing here may be substituted
 *                   for it.
 *
 * `monotonicMs()` returns an arbitrary origin precisely so it cannot be mistaken
 * for a wall-clock instant: it is not convertible to a date, so it cannot leak
 * into a timestamp field. Trading already has `MarketClock` for market time
 * (`REPLAY | PROVIDER | WALL`); this is a third thing and is deliberately not
 * expressed in those terms.
 *
 * INJECTED SO TESTS DO NOT SLEEP. Every timer goes through this interface, so a
 * test advances time by calling a function instead of waiting for it. A suite
 * that waits for real seconds is a suite that gets shortened later.
 */

export interface RuntimeScheduler {
  /**
   * Elapsed milliseconds from an arbitrary origin.
   *
   * Monotonic: never goes backwards, never adjusted by clock sync. Only
   * differences between two readings mean anything.
   */
  monotonicMs(): number

  /**
   * Run `fn` after `delayMs`. Returns a cancel function.
   *
   * Cancelling must be safe to call more than once and after the timer has
   * already fired — a cancel path that throws on a second call becomes a
   * teardown that half-completes.
   */
  after(delayMs: number, fn: () => void): () => void
}

/**
 * A scheduler driven entirely by hand.
 *
 * The only scheduler R1A ships. Real timers arrive with the real transport,
 * because nothing in this phase should be able to make a suite slow or flaky.
 */
export interface ManualScheduler extends RuntimeScheduler {
  /** Advance time and run everything now due, in due order. */
  advance(ms: number): void
  /** Timers still outstanding — a leak check for teardown tests. */
  pending(): number
}

interface Timer {
  readonly id: number
  readonly dueAt: number
  readonly fn: () => void
  cancelled: boolean
}

export function createManualScheduler(startMs = 0): ManualScheduler {
  let now = startMs
  let nextId = 0
  let timers: Timer[] = []

  return {
    monotonicMs: () => now,

    after(delayMs, fn) {
      nextId += 1
      const timer: Timer = { id: nextId, dueAt: now + delayMs, fn, cancelled: false }
      timers.push(timer)
      return () => {
        // Idempotent: cancelling twice, or after firing, is a no-op.
        timer.cancelled = true
        timers = timers.filter((t) => t.id !== timer.id)
      }
    },

    advance(ms) {
      const target = now + ms
      /*
       * Fired one at a time, in due order, with `now` set to each timer's OWN
       * due time before it runs. A callback that schedules another timer
       * therefore measures its delay from when it actually ran, not from the
       * end of the whole advance — which is what a real timer does, and the
       * difference shows up immediately in backoff sequences.
       */
      for (;;) {
        const due = timers
          .filter((t) => !t.cancelled && t.dueAt <= target)
          .sort((a, b) => (a.dueAt - b.dueAt) || (a.id - b.id))[0]
        if (due === undefined) break
        timers = timers.filter((t) => t.id !== due.id)
        now = due.dueAt
        due.fn()
      }
      now = target
    },

    pending: () => timers.filter((t) => !t.cancelled).length,
  }
}
