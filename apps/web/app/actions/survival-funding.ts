'use server'

/**
 * Owner control over the declared operating capital (Phase 2B).
 *
 * ── WHAT THIS VALUE IS ─────────────────────────────────────────────────────
 * The owner's declared available operating capital, used ONLY as a survival and
 * runway input. It is not a budget, not spend authorization, not cash, and it
 * cannot widen an autonomy licence:
 * `effectiveAutonomy = min(licensedAutonomy, survivalCeiling)` is unchanged.
 *
 * It is governance-sensitive anyway, which is why it is operator-gated: the
 * figure feeds the survival ceiling, so an inflated declaration would relax
 * Atlas's autonomy as surely as a real one — and, unlike a real one, would be
 * fiction.
 *
 * ── AUTHORITY, NOT JUST IDENTITY ───────────────────────────────────────────
 * Same contract as the stop authority. These are server actions, not tools: a
 * model that could set its own operating capital could raise its own ceiling.
 * The check is PLATFORM OPERATOR, not "has a session" and not "owns a project" —
 * owning one project proves authority over that project, and this is one
 * platform-wide figure.
 *
 * ── ACTOR PROVENANCE ───────────────────────────────────────────────────────
 * The actor comes from `resolvePlatformOperator()`, which reads the
 * server-validated session. None of these actions takes an actor argument, so
 * there is nothing for a caller to spoof.
 *
 * ── SET AND CLEAR ARE DIFFERENT FACTS ──────────────────────────────────────
 * CLEAR persists NULL, which means UNDECLARED. Zero is a KNOWN declaration and
 * is deliberately NOT how clearing is expressed: an owner who clears wants to
 * stop making a claim, while an owner who declares zero is making one.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { setDeclaredOperatingCapital } from '@/lib/governance/funding-declaration'
import { revalidatePath } from 'next/cache'

export interface FundingActionResult {
  ok: boolean
  /** false = the declaration already held this value; nothing was written. */
  changed: boolean
  /** The declaration as it stands after the call, or null for UNDECLARED. */
  declaredSek: number | null
  /** Stable code, never a raw database message. */
  error?: 'not_operator' | 'invalid_amount' | 'failed'
}

/**
 * Parse an operator-supplied amount.
 *
 * Returns `undefined` for input that is NOT a finite number, which the caller
 * turns into a refusal. `Number('')` is 0 and `Number(' ')` is 0, so blank input
 * is rejected explicitly rather than silently becoming a declaration of zero —
 * the one coercion that would turn "the form was empty" into "the owner
 * declared nothing left".
 *
 * Zero and negatives are ACCEPTED. They are real declarations, and the
 * derivation already decides their effect (<= 0 floors at HIBERNATE).
 */
function parseAmount(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  // Number() accepts 'Infinity', '-Infinity', '0x10' and exponents; the finite
  // check removes the first two, and a plain decimal parse removes the rest.
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** The one mutation path. Both actions below go through it, and nothing else does. */
async function mutate(declaredSek: number | null): Promise<FundingActionResult> {
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    // One answer for "not an operator" and "no operator configured": a
    // non-operator must not learn the platform's authorization posture from a
    // denial. The distinction is logged server-side.
    console.error(`[survival-funding] declaration denied: ${operator.reason}`)
    return { ok: false, changed: false, declaredSek: null, error: 'not_operator' }
  }

  try {
    const result = await setDeclaredOperatingCapital(createAdminClient(), {
      declaredSek,
      // Server-derived. Never a parameter, never a form field.
      actor: operator.actor,
    })
    revalidatePath('/system')
    return {
      ok: true,
      changed: result.result === 'recorded',
      declaredSek: result.declaredSek,
    }
  } catch (e) {
    console.error('[survival-funding] declaration failed:',
      e instanceof Error ? e.message : String(e))
    return { ok: false, changed: false, declaredSek: null, error: 'failed' }
  }
}

/**
 * Declare the owner's available operating capital, in SEK.
 *
 * Rejects NaN, ±Infinity, blank and malformed input. Does not restrict the sign:
 * zero and negative are valid declarations.
 */
export async function declareOperatingCapital(formData: FormData): Promise<FundingActionResult> {
  const amount = parseAmount(formData.get('declared_sek'))
  if (amount === undefined) {
    return { ok: false, changed: false, declaredSek: null, error: 'invalid_amount' }
  }
  return mutate(amount)
}

/**
 * Clear the declaration, returning it to UNDECLARED.
 *
 * Takes no amount at all, so there is no path by which "clear" could be
 * expressed as a zero declaration.
 */
export async function clearOperatingCapital(): Promise<FundingActionResult> {
  return mutate(null)
}
