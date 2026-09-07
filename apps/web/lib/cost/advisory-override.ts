/**
 * lib/cost/advisory-override.ts — recording the calls that only proceeded
 * because enforcement is off.
 *
 * ── WHAT A ROW MEANS, EXACTLY ───────────────────────────────────────────────
 * `verdict()` in budget-gate.ts computes:
 *
 *     allowed          = wouldAllow || !enforced
 *     advisoryOverride = !wouldAllow && !enforced
 *
 * so `advisoryOverride === true` already means all three things at once: the
 * budget said no, enforcement is off, and the call is therefore permitted. This
 * module writes a row when and only when the runtime verdict carries that flag.
 *
 * It does NOT re-derive the condition from `reason`, `allowed` or anything else.
 * A second expression of the same rule is a second rule, and the two would
 * eventually disagree — which is precisely how a measurement stops measuring
 * what it claims to.
 *
 * It is also NOT inferable after the fact. A cost event proves a call happened,
 * not why it was permitted; and the overrides that matter most — the ones where
 * the gate could not be consulted — leave no reservation row at all.
 *
 * ── IT CANNOT BLOCK ANYTHING ────────────────────────────────────────────────
 * Observability that can refuse a dispatch is a gate wearing a different name.
 * Every failure here is swallowed and logged, which is the same contract the
 * rest of lib/cost keeps ("a gate that crashes the pipeline it guards is worse
 * than the problem") and the same shape as the release-failure handling in
 * `withGovernedSpend`. A missing row means we lost a measurement; a thrown error
 * would mean we changed behaviour while trying to observe it.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { SpendVerdict } from './budget-gate'

export interface AdvisoryOverrideRecord {
  readonly projectId: string
  readonly provider: string
  readonly operation: string
  readonly estimatedSek: number
  readonly idempotencyKey?: string
  readonly verdict: SpendVerdict
}

/**
 * Record one advisory override. Never throws, never blocks, returns nothing.
 *
 * Deliberately returns `void` rather than a success boolean: a caller that could
 * read the outcome could branch on it, and the one thing this must never do is
 * influence whether the provider is called.
 */
export async function recordAdvisoryOverride(input: AdvisoryOverrideRecord): Promise<void> {
  // The single source of the condition. Not re-derived, not second-guessed.
  if (!input.verdict.advisoryOverride) return

  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> }
    }
    const { error } = await db.from('spend_advisory_overrides').insert({
      project_id: input.projectId,
      // Verbatim. The re-audit groups by this, so a normalised or prettified
      // value here would quietly merge distinct failure modes.
      reason: input.verdict.reason,
      provider: input.provider,
      operation: input.operation,
      estimated_sek: input.estimatedSek,
      reservation_id: input.verdict.reservationId,
      idempotency_key: input.idempotencyKey ?? null,
      binding_scope: input.verdict.bindingScope,
      budget_sek: input.verdict.budgetSek,
      headroom_sek: input.verdict.headroomSek,
    })
    if (error) {
      console.error('[advisory-override] not recorded; the dispatch is unaffected:',
        (error as { message?: string }).message ?? String(error))
    }
  } catch (e) {
    console.error('[advisory-override] not recorded; the dispatch is unaffected:',
      e instanceof Error ? e.message : String(e))
  }
}
