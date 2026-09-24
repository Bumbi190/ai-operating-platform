/**
 * lib/governance/funding-declaration.ts — the owner mutation seam for
 * declared operating capital.
 *
 * Mirrors `lib/governance/execution-stop.ts`: a thin typed wrapper over one
 * SECURITY DEFINER RPC, so there is exactly one server-side boundary through
 * which the declaration can change.
 *
 * ── SET AND CLEAR ARE ONE OPERATION ────────────────────────────────────────
 * `declaredSek: number | null`. Null CLEARS. There is deliberately no
 * `clearDeclaredOperatingCapital()` beside a `setDeclaredOperatingCapital()`,
 * because two entry points can drift apart in locking, auditing or validation,
 * and the difference between "no declaration" and "a declaration of zero" is
 * exactly what a second path would eventually lose.
 *
 * ── THE CALLER ESTABLISHES AUTHORITY; THIS MODULE DOES NOT ─────────────────
 * This function performs no authorization. It is reachable only from a server
 * action that has already resolved platform-operator authority from the
 * authenticated session, and the RPC it calls is executable by `service_role`
 * alone. The `actor` is derived from that session by the caller — never read
 * from a request — which is the same contract `setPlatformAutomationStop` has.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface FundingDeclarationResult {
  /** `unchanged` means the declaration already held this value; nothing was written. */
  result: 'recorded' | 'unchanged'
  previousDeclaredSek: number | null
  declaredSek: number | null
}

/**
 * Set or clear the owner-declared operating capital.
 *
 * `declaredSek` may be zero or negative: both are real declarations, and the
 * canonical `FundingReading` treats them as KNOWN. Only `null` means undeclared.
 */
export async function setDeclaredOperatingCapital(
  db: SupabaseClient,
  args: { declaredSek: number | null; actor: string },
): Promise<FundingDeclarationResult> {
  const { data, error } = await db.rpc('survival_set_declared_operating_capital', {
    p_declared_sek: args.declaredSek,
    p_actor: args.actor,
  })
  if (error) throw new Error(`funding declaration mutation failed: ${error.message}`)

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('funding declaration mutation returned no row')

  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

  // An outcome this build does not know is NOT "something was written". Mapping
  // it to `recorded` would assert a change that may not have happened, and the
  // one thing worse than a refused mutation is a caller told a fabricated one
  // succeeded — the same rule `store.ts` applies to an unknown record result.
  if (row.result !== 'recorded' && row.result !== 'unchanged') {
    throw new Error(`funding declaration mutation returned unknown result: ${String(row.result)}`)
  }

  return {
    result: row.result,
    previousDeclaredSek: num(row.previous_sek),
    declaredSek: num(row.declared_sek),
  }
}
