/**
 * lib/media/job/poll.ts — bounded observation of a remote operation.
 *
 * ── POLLING IS READING, AND READING IS NOT DISPATCHING ─────────────────────
 * Everything in this file observes. There is no branch that creates a remote
 * operation, and the module deliberately imports nothing that could: no provider
 * factory, no `withGovernedSpend`, no `lib/media/retry.ts`. A status read that
 * fails is retried; a GENERATION is never retried from here, and the structural
 * way to guarantee that is to give this module no ability to start one.
 *
 * ── THE FOUR WAYS OBSERVATION ENDS, AND WHY NONE OF THEM IS "FAILED" ───────
 * `terminal`            the vendor gave a terminal answer. The only outcome that
 *                       decides anything about the job.
 * `deadline_exceeded`   we stopped waiting. The job is still QUEUED or RUNNING
 *                       remotely, is still paid for, and will still finish. This
 *                       is a fact about Omnira's patience, not about the job.
 * `aborted`             a caller cancelled the WAIT. Same as above: cancelling a
 *                       poll cannot un-submit anything.
 * `unobservable`        too many consecutive reads failed. We cannot see the job;
 *                       it is almost certainly fine.
 *
 * Reporting any of the last three as a failed generation is the error this
 * separation exists to make impossible — it would invite exactly the "so retry
 * it" reflex that produces a duplicate charge.
 *
 * ── DETERMINISTIC BY INJECTION ─────────────────────────────────────────────
 * `now` and `sleep` are parameters. Tests drive the whole schedule — backoff
 * growth, deadline arithmetic, read-failure budget — with a fake clock and no
 * real waiting, so the timing rules are asserted rather than hoped for.
 */

import type { MediaJobResult } from '@/lib/media/providers/types'
import { mediaStateForRemoteStatus, isTerminalMediaJobState, type MediaJobState } from './lifecycle'

// ── Schedule ─────────────────────────────────────────────────────────────────

export interface MediaPollSchedule {
  /** Total time to wait for a terminal answer, from the first read. */
  deadlineMs: number
  /** Wait before the FIRST read. A job accepted milliseconds ago is not done. */
  initialDelayMs: number
  /** The first inter-read interval, grown by `backoffFactor` up to the max. */
  intervalMs: number
  maxIntervalMs: number
  backoffFactor: number
  /**
   * How many reads may fail IN A ROW before observation gives up.
   *
   * Consecutive, not cumulative: a vendor that is flaky for a minute and then
   * healthy should not exhaust a budget it spent an hour ago. Reset on every
   * successful read.
   */
  maxConsecutiveReadFailures: number
}

/**
 * The default schedule. Conservative, and deliberately not tuned to a vendor.
 *
 * `initialDelayMs` is not zero: an image accepted 5 ms ago is never finished,
 * and an immediate first read is a request that can only ever return `queued`.
 * Backoff is gentle (1.5×) rather than exponential because these jobs finish in
 * tens of seconds, and an aggressive doubling would spend most of a 90-second
 * budget asleep after the job was already done.
 */
export const DEFAULT_MEDIA_POLL_SCHEDULE: MediaPollSchedule = {
  deadlineMs: 90_000,
  initialDelayMs: 1_500,
  intervalMs: 2_000,
  maxIntervalMs: 10_000,
  backoffFactor: 1.5,
  maxConsecutiveReadFailures: 4,
}

// ── Result ───────────────────────────────────────────────────────────────────

export type MediaPollOutcome =
  | { outcome: 'terminal'; state: Extract<MediaJobState, 'SUCCEEDED' | 'FAILED'>; result: MediaJobResult; reads: number }
  | { outcome: 'deadline_exceeded'; lastState: MediaJobState; elapsedMs: number; reads: number }
  | { outcome: 'aborted'; lastState: MediaJobState; reads: number }
  | { outcome: 'unobservable'; lastState: MediaJobState; consecutiveFailures: number; lastError: string; reads: number }

export interface MediaPollInput {
  /**
   * One status read. Throwing means the READ failed — never that the job did.
   *
   * The adapter behind this already maps vendor statuses onto Omnira's four
   * (`mapMuapiStatus`), and already maps an unrecognised vendor status onto
   * `running` rather than guessing terminal. That mapping stays there; this
   * module never sees a vendor string.
   */
  observe: () => Promise<MediaJobResult>
  /** The state the job was in when observation began. */
  initialState: MediaJobState
  schedule?: Partial<MediaPollSchedule>
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Cancels the WAIT. It does not and cannot cancel the remote operation. */
  signal?: AbortSignal
  /** Called on every state change, for durable persistence and audit. */
  onState?: (state: MediaJobState, result: MediaJobResult) => void | Promise<void>
}

const realSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/**
 * Observe until the vendor gives a terminal answer, or until one of the three
 * bounds is reached.
 *
 * The loop is bounded three ways at once and there is no path that is bounded by
 * none of them: a wall-clock deadline, a consecutive-read-failure budget, and an
 * abort signal. A poll loop with only a deadline spins uselessly against a dead
 * endpoint; one with only a failure budget waits forever against a stuck job.
 */
export async function pollMediaJob(input: MediaPollInput): Promise<MediaPollOutcome> {
  const schedule: MediaPollSchedule = { ...DEFAULT_MEDIA_POLL_SCHEDULE, ...input.schedule }
  const now = input.now ?? (() => Date.now())
  const sleep = input.sleep ?? realSleep

  const startedAt = now()
  let state = input.initialState
  let interval = schedule.intervalMs
  let consecutiveFailures = 0
  let lastError = ''
  let reads = 0

  const remaining = () => schedule.deadlineMs - (now() - startedAt)

  const aborted = (): MediaPollOutcome => ({ outcome: 'aborted', lastState: state, reads })

  if (input.signal?.aborted) return aborted()

  try {
    await sleep(Math.min(schedule.initialDelayMs, Math.max(remaining(), 0)), input.signal)
  } catch {
    return aborted()
  }

  for (;;) {
    if (input.signal?.aborted) return aborted()
    if (remaining() <= 0) {
      return { outcome: 'deadline_exceeded', lastState: state, elapsedMs: now() - startedAt, reads }
    }

    let result: MediaJobResult
    try {
      result = await input.observe()
      reads += 1
      consecutiveFailures = 0
    } catch (err) {
      reads += 1
      consecutiveFailures += 1
      lastError = err instanceof Error ? err.message : String(err)
      // A READ failed. The job is untouched — it is still whatever it was, and
      // the budget that runs out here is the observation budget, never the
      // generation's.
      if (consecutiveFailures >= schedule.maxConsecutiveReadFailures) {
        return { outcome: 'unobservable', lastState: state, consecutiveFailures, lastError, reads }
      }
      try {
        await sleep(Math.min(interval, Math.max(remaining(), 0)), input.signal)
      } catch {
        return aborted()
      }
      interval = Math.min(Math.round(interval * schedule.backoffFactor), schedule.maxIntervalMs)
      continue
    }

    const observed = mediaStateForRemoteStatus(result.status)
    if (observed !== state) {
      state = observed
      await input.onState?.(state, result)
    }

    if (isTerminalMediaJobState(state)) {
      // `UNKNOWN` is unreachable here by construction: `mediaStateForRemoteStatus`
      // is total over the four provider statuses and produces none. The narrowing
      // is asserted rather than assumed so that widening `MediaJobStatus` later
      // fails to compile instead of silently reporting UNKNOWN as terminal-success.
      const terminal = state as Extract<MediaJobState, 'SUCCEEDED' | 'FAILED'>
      return { outcome: 'terminal', state: terminal, result, reads }
    }

    if (remaining() <= 0) {
      return { outcome: 'deadline_exceeded', lastState: state, elapsedMs: now() - startedAt, reads }
    }

    try {
      await sleep(Math.min(interval, Math.max(remaining(), 0)), input.signal)
    } catch {
      return aborted()
    }
    interval = Math.min(Math.round(interval * schedule.backoffFactor), schedule.maxIntervalMs)
  }
}
