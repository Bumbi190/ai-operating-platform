/**
 * lib/cost/budget-gate.ts — PR9b: refuse spend BEFORE it happens.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * Omnira spends real money — $22.14 in the last 30 days — and `project_budgets`
 * has held per-project monthly limits since June with exactly one reader: a
 * progress bar. `cost_events` records spend afterwards, and `track.ts` states
 * outright that it "NEVER throws and NEVER blocks". A runaway loop would bill
 * until a human happened to look at a chart.
 *
 * Familje-Stunden's canonical runbook makes this a hard gate —
 * `no_spend_without_approval`. That has two halves: a reported cost estimate
 * before the call, and human approval. This module is the ESTIMATE half. The
 * approval half is the authorization layer applied to FINANCIAL actions and is
 * deliberately not implemented here — a passing budget check is not consent.
 *
 * ── RESERVE → CALL → SETTLE ────────────────────────────────────────────────
 * Checking `sum(cost_events)` before a call cannot work: a call's cost is only
 * known once it returns, so N concurrent callers would each see the same low
 * total and all proceed. The reservation is taken first and counts as spent, so
 * concurrent callers see each other. It is released if the call never happened
 * and settled once the real cost lands.
 *
 * ── G2: SIX SCOPES, ONE VERDICT ────────────────────────────────────────────
 * The SQL now evaluates project daily/weekly/monthly and platform
 * daily/weekly/monthly under one lock pair, and returns the TIGHTEST. Nothing
 * in this file computes a limit — it forwards a verdict, which is what keeps
 * exactly one budget authority.
 *
 * ── ADVISORY BY DEFAULT ────────────────────────────────────────────────────
 * `H1_SPEND_GATE` (default OFF) decides whether a refusal is HONOURED. SQL always
 * returns the honest verdict and always records the reservation, so advisory mode
 * produces real accounting instead of a guess about what would have happened, and
 * enforcement is later a flag flip with no schema or code change. This matters
 * because the gate wraps a live pipeline: `ai-media-automation` runs daily and is
 * already at ~33% of its budget, so switching straight to hard refusal would risk
 * breaking working automation on a number nobody has validated yet.
 *
 * ── NEVER THROWS ───────────────────────────────────────────────────────────
 * Same contract as the rest of lib/cost. A gate that crashes the pipeline it
 * guards is worse than the problem. A DB failure is reported as `unavailable`;
 * whether that blocks is the caller's decision, and in advisory mode it never does.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRates } from './rates'
import { isSpendGateEnforced } from './spend-gate-flag'

export { isSpendGateEnforced }

export type SpendRefusal =
  /** No budget row. Fail closed: unconfigured is NOT unlimited. */
  | 'no_budget_configured'
  /** G2: no platform ceiling. An absent global limit is never "no limit". */
  | 'no_global_budget_configured'
  | 'budget_exceeded'
  | 'invalid_estimate'
  /** G2 replay: another dispatch may be live on this reservation. */
  | 'replay_in_flight'
  /** G2 replay: the reservation aged out; a dispatch may still be running. */
  | 'replay_stale'
  /** G2 replay: the key names a different project/provider/operation/estimate. */
  | 'replay_identity_mismatch'
  /** G2 replay: the spend already completed. A repeat is a NEW spend. */
  | 'replay_settled'
  /** G2 replay: previously refused or never dispatched. The key is spent. */
  | 'replay_released'
  /** The gate itself could not be consulted — never confused with "allowed". */
  | 'unavailable'

/**
 * Which ceiling decided. G2 evaluates six scopes and reports the tightest, so a
 * refusal says WHICH limit refused rather than only that one did.
 */
export type BudgetScope =
  | 'project_daily' | 'project_weekly' | 'project_monthly'
  | 'global_daily'  | 'global_weekly'  | 'global_monthly'

export interface SpendVerdict {
  /** Whether the caller may proceed, AFTER applying the enforcement flag. */
  allowed: boolean
  /** What the budget actually said, regardless of enforcement. */
  wouldAllow: boolean
  /** True when a refusal was overridden because enforcement is off. */
  advisoryOverride: boolean
  /**
   * `ok` is the ONLY allowed verdict. Every replay state refuses: an existing key
   * can never authorise a second provider dispatch, because no state of a
   * reservation can be shown free for one — fresh means a call may be live,
   * stale means only that none was OBSERVED finishing.
   */
  reason: 'ok' | SpendRefusal
  reservationId: string | null
  budgetSek: number | null
  committedSek: number | null
  reservedSek: number | null
  headroomSek: number | null
  /** The tightest configured scope — the one the verdict was decided on. */
  bindingScope: BudgetScope | null
}

function verdict(p: Partial<SpendVerdict> & { wouldAllow: boolean; reason: SpendVerdict['reason'] }): SpendVerdict {
  const enforced = isSpendGateEnforced()
  return {
    allowed: p.wouldAllow || !enforced,
    wouldAllow: p.wouldAllow,
    advisoryOverride: !p.wouldAllow && !enforced,
    reason: p.reason,
    reservationId: p.reservationId ?? null,
    budgetSek: p.budgetSek ?? null,
    committedSek: p.committedSek ?? null,
    reservedSek: p.reservedSek ?? null,
    headroomSek: p.headroomSek ?? null,
    bindingScope: p.bindingScope ?? null,
  }
}

export interface ReserveInput {
  projectId: string
  estimatedSek: number
  /** Two retries of the same logical spend must reserve once, not twice. */
  idempotencyKey?: string
  provider?: string
  operation?: string
}

/** Take a reservation. Never throws. */
export async function reserveSpend(input: ReserveInput): Promise<SpendVerdict> {
  try {
    const db = createAdminClient() as any
    const { data, error } = await db.rpc('budget_reserve', {
      p_project_id: input.projectId,
      p_estimated_sek: input.estimatedSek,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_provider: input.provider ?? null,
      p_operation: input.operation ?? null,
    })
    if (error) return verdict({ wouldAllow: false, reason: 'unavailable' })
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return verdict({ wouldAllow: false, reason: 'unavailable' })
    return verdict({
      wouldAllow: row.allowed === true,
      reason: row.reason,
      reservationId: row.reservation_id ?? null,
      budgetSek: row.budget_sek === null ? null : Number(row.budget_sek),
      committedSek: row.committed_sek === null ? null : Number(row.committed_sek),
      reservedSek: row.reserved_sek === null ? null : Number(row.reserved_sek),
      headroomSek: row.headroom_sek === null ? null : Number(row.headroom_sek),
      bindingScope: (row.binding_scope ?? null) as BudgetScope | null,
    })
  } catch {
    return verdict({ wouldAllow: false, reason: 'unavailable' })
  }
}

/** The call happened; its real cost is in cost_events. Never throws. */
export async function settleSpend(reservationId: string | null, actualSek?: number): Promise<void> {
  if (!reservationId) return
  try {
    const db = createAdminClient() as any
    await db.rpc('budget_settle', { p_reservation_id: reservationId, p_actual_sek: actualSek ?? null })
  } catch { /* best effort: a stale reservation ages out of the headroom sum */ }
}

/** The call never happened. Frees headroom immediately. Never throws. */
export async function releaseSpend(reservationId: string | null): Promise<void> {
  if (!reservationId) return
  try {
    const db = createAdminClient() as any
    await db.rpc('budget_release', { p_reservation_id: reservationId })
  } catch { /* best effort: same staleness fallback */ }
}

// ── Estimators ───────────────────────────────────────────────────────────────
// All prices come from getRates() — the SAME accessor lib/cost/track.ts uses to
// write cost_events. A second price table here would drift, and the estimate
// would stop matching the figure later recorded.

export async function estimateVoiceSek(charCount: number): Promise<number> {
  const r = await getRates()
  return (charCount / 1000) * (r.elevenlabs_usd_per_1k_chars ?? 0.24) * (r.usd_sek ?? 10.5)
}

export async function estimateImageSek(images: number, provider: 'ideogram' | 'gpt_image' = 'ideogram'): Promise<number> {
  const r = await getRates()
  const unit = provider === 'ideogram'
    ? (r.ideogram_v3_usd_per_image ?? 0.08)
    : (r.gpt_image_usd_per_image ?? 0.042)
  return images * unit * (r.usd_sek ?? 10.5)
}

/**
 * Wrap a billable call: reserve, run, then settle or release.
 *
 * `onRefused` decides what a refusal means for this caller — there is no sensible
 * generic answer, since refusing a newsletter send and refusing a retry-able
 * image generation are different outcomes. When enforcement is off the verdict
 * still reports `advisoryOverride`, so callers can log what would have happened.
 */
export async function withSpendGate<T>(
  input: ReserveInput,
  run: () => Promise<T>,
  onRefused: (v: SpendVerdict) => Promise<T> | T,
): Promise<T> {
  const v = await reserveSpend(input)
  if (!v.allowed) {
    await releaseSpend(v.reservationId)
    return onRefused(v)
  }
  try {
    const result = await run()
    await settleSpend(v.reservationId, input.estimatedSek)
    return result
  } catch (e) {
    // The call failed, so the money was probably not spent. Releasing is the
    // safe direction: worst case we under-count for one call, versus permanently
    // consuming headroom for a call that never landed.
    await releaseSpend(v.reservationId)
    throw e
  }
}
