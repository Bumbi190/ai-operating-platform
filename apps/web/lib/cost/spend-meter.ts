/**
 * lib/cost/spend-meter.ts — the metered cost of ONE governed provider call.
 *
 * ── WHY THIS EXISTS (M0) ────────────────────────────────────────────────────
 * Before M0 a governed call wrote its cost through `lib/cost/track.ts` — a
 * separate, best-effort insert whose error was ignored — and then
 * `withGovernedSpend` settled the reservation with no cost of its own. A failed
 * insert therefore made real spend vanish from budget and Survival authority.
 *
 * Now the cost a governed call meters is COLLECTED here instead of inserted, and
 * `withGovernedSpend` hands it to `budget_settle_recorded`, which writes the
 * rows and settles the reservation in one transaction. If that fails, the
 * reservation stays open with dispatch intent — still counted.
 *
 * ── WHY ASYNC CONTEXT, NOT A PARAMETER ──────────────────────────────────────
 * Every governed adapter already calls `logLlmCost` / `logImageCost` /
 * `logVoiceCost` from INSIDE its `run()`. Carrying the meter in async context
 * means each of those calls becomes part of the settlement with no per-adapter
 * plumbing, and no adapter can forget to pass it. A call made OUTSIDE any
 * governed scope is ungoverned and stays a best-effort row.
 *
 * ── LATE COST ───────────────────────────────────────────────────────────────
 * Once a meter is closed its reservation has been (or is being) settled. A cost
 * that arrives afterwards is refused here and NOT inserted — inserting it would
 * count the same call twice next to the settlement row. The settlement already
 * holds at least the reserved upper bound.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/** One cost row, shaped exactly as `budget_settle_recorded` reads it. */
export interface MeteredCostRow {
  readonly provider: string
  readonly model: string | null
  readonly agent: string | null
  readonly operation: string | null
  readonly unit_type: 'tokens' | 'characters' | 'images' | 'seconds' | 'requests'
  readonly units: number
  readonly tokens_in: number
  readonly tokens_out: number
  readonly cost_usd: number
  readonly cost_sek: number
  readonly run_id: string | null
  readonly script_id: string | null
  readonly metadata: unknown
  /** The project the logger attributed; settlement charges the RESERVATION's project. */
  readonly project_id: string | null
}

export class SpendMeter {
  private readonly collected: MeteredCostRow[] = []
  private closed = false
  private deferred: Promise<unknown> | null = null

  /** Adds a metered row. False when the meter is closed: the caller must NOT insert it elsewhere. */
  record(row: MeteredCostRow): boolean {
    if (this.closed) return false
    this.collected.push(row)
    return true
  }

  /**
   * A streaming adapter's cost arrives after `run()` returns. It registers the
   * promise that settles once that cost is metered (or the stream ends without
   * it), and settlement waits for it instead of happening at handle return.
   */
  settleAfter(lifetime: Promise<unknown>): void {
    this.deferred = lifetime
  }

  get pendingSettlement(): Promise<unknown> | null { return this.deferred }

  get rows(): readonly MeteredCostRow[] { return this.collected }

  close(): void { this.closed = true }

  get isClosed(): boolean { return this.closed }
}

const scope = new AsyncLocalStorage<SpendMeter>()

/** The meter of the governed call this code is running inside, if any. */
export function currentSpendMeter(): SpendMeter | undefined {
  return scope.getStore()
}

/** Run `fn` as the body of one governed call. Nested governed calls get their own meter. */
export function runWithSpendMeter<T>(meter: SpendMeter, fn: () => Promise<T>): Promise<T> {
  return scope.run(meter, fn)
}
