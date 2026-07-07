/**
 * lib/atlas/context/deadline.ts — Per-source deadline wrapper (CL Commit 3, canonical §7)
 *
 * "Each Retrieval read (④, ⑤) has a hard deadline. On miss, the block is
 * omitted and recorded in `blocksDropped`; the turn degrades to today's
 * content — never worse." (§7)
 *
 * `withDeadline` is that contract as a function: it races a read against a
 * timer and NEVER throws (mapping §1.1 "May NOT throw on miss") — a slow
 * read yields `{ status: 'dropped', reason: 'deadline' }`, a failing read
 * yields `{ status: 'dropped', reason: 'error' }`, and only a read that
 * completes in time yields `{ status: 'ok', value }`. The assembler
 * (Commit 4) composes `dropped` as an absent block and records the drop in
 * `provenance.blocksDropped` — this is the sanctioned source of context
 * non-determinism under load (§7: evals must not assume bit-reproducibility).
 *
 * The wrapper does not cancel the underlying read (no AbortController
 * plumbing in v1 — the readers' own reads are bounded, Invariant F); it
 * only stops WAITING for it. A late result is discarded, never composed.
 */

export type DeadlineResult<T> =
  | { status: 'ok'; value: T; elapsedMs: number }
  | { status: 'dropped'; reason: 'deadline' | 'error'; elapsedMs: number }

/**
 * Race `read` against `ms`. Resolves always — never rejects, never throws.
 * `ms <= 0` is treated as "no time at all": the read still starts (readers
 * are non-throwing and bounded) but only an already-settled promise wins.
 */
export async function withDeadline<T>(
  read: () => Promise<T>,
  ms: number,
): Promise<DeadlineResult<T>> {
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<DeadlineResult<T>>(resolve => {
    timer = setTimeout(
      () => resolve({ status: 'dropped', reason: 'deadline', elapsedMs: Date.now() - started }),
      Math.max(0, ms),
    )
  })

  const attempt: Promise<DeadlineResult<T>> = (async () => {
    try {
      const value = await read()
      return { status: 'ok', value, elapsedMs: Date.now() - started }
    } catch {
      return { status: 'dropped', reason: 'error', elapsedMs: Date.now() - started }
    }
  })()

  try {
    return await Promise.race([attempt, deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
