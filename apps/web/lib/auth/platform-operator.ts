/**
 * lib/auth/platform-operator.ts — platform-operator authority.
 *
 * ── WHY AUTHENTICATION WAS NOT ENOUGH ──────────────────────────────────────
 * `toggleAutomationPause` previously did: authenticated session → admin client →
 * global platform mutation. That proves IDENTITY and nothing else. Any user who
 * could sign up could stop the entire platform — and, far worse, could RESUME it
 * after an operator stopped it during an incident. Resume is the dangerous
 * direction: pause is recoverable, an unauthorised resume re-enables unattended
 * spend and external side effects while the reason for the pause is still live.
 *
 * Project ownership is not a substitute either. Owning a project proves
 * authority over THAT project; the global switch governs every tenant, so
 * ownership of one cannot confer authority over all. (The project-scope setter
 * is correctly gated on ownership and stays that way.)
 *
 * ── WHY THIS IS NOT A SECOND USER SYSTEM ───────────────────────────────────
 * The audit found the platform ALREADY has exactly one platform-level operator
 * identity, and it is environment-backed:
 *
 *   • `BREVO_ADMIN_EMAIL` — set in Production and Preview. Already used as a
 *     hard authorization gate, not merely as a notification address:
 *       app/api/bugscanner/run/route.ts       — `user.email !== adminEmail` → 401
 *       app/api/bugscanner/scan-all/route.ts  — same comparison
 *       lib/architecture-knowledge/policy.ts  — `isExplicitlyAuthorizedInternal-
 *         Principal()`, which gates platform-scope knowledge in the chat route.
 *
 * There is no `profiles` table, no `role` column, no membership table, and no
 * RBAC anywhere in the schema. So this module does NOT introduce a new identity
 * source — it gives the EXISTING one a name, one implementation, and a reusable
 * boundary that future G4 governance surfaces can call.
 *
 * `PLATFORM_OPERATOR_EMAILS` is the canonical configuration going forward;
 * `BREVO_ADMIN_EMAIL` is a compatibility fallback and NOT the long-term
 * governance authority. See `platformOperatorAllowlist` for the precedence.
 *
 * `ARCHITECTURE_KNOWLEDGE_INTERNAL_EMAILS` is deliberately NOT consulted here.
 * That list governs knowledge classification. Reusing it would mean adding
 * someone to a document allowlist silently hands them the platform kill switch —
 * two very different privileges sharing one control.
 *
 * ── PROPERTIES ─────────────────────────────────────────────────────────────
 * Server-side only (env is never shipped to the client), fail-closed (an empty
 * or unset allowlist authorises NOBODY), not client-spoofable (the email comes
 * from the verified Supabase session, never from a request body), and testable
 * (the predicate is pure and separately exported).
 */

import { createClient } from '@/lib/supabase/server'

/** Why a caller is not a platform operator. Stable codes; never raw detail. */
export type PlatformOperatorDenial =
  | 'unauthenticated'
  | 'no_operator_configured'
  | 'not_platform_operator'

export interface PlatformOperatorOk {
  ok: true
  userId: string
  email: string
  /** Server-derived; the ledger records who the server authenticated. */
  actor: string
}
export interface PlatformOperatorDenied {
  ok: false
  reason: PlatformOperatorDenial
}
export type PlatformOperatorResult = PlatformOperatorOk | PlatformOperatorDenied

/**
 * The configured operator allowlist, normalised.
 *
 * ── PRECEDENCE, NOT UNION ──────────────────────────────────────────────────
 *   PLATFORM_OPERATOR_EMAILS  — CANONICAL. The explicit governance authority.
 *   BREVO_ADMIN_EMAIL         — COMPATIBILITY FALLBACK ONLY, consulted solely
 *                               when the canonical variable is absent or blank.
 *
 * These are checked in order and never unioned. Unioning them permanently would
 * couple two unrelated privileges: `BREVO_ADMIN_EMAIL` is, by its name and its
 * other uses, a NOTIFICATION address. Once an explicit operator list exists,
 * changing where alert email is delivered must not silently hand the global kill
 * switch to the new address — and it would, if the two lists were merged
 * forever.
 *
 * The fallback is what keeps today working: `BREVO_ADMIN_EMAIL` is the identity
 * actually deployed (Production + Preview) and is already a hard authorization
 * gate elsewhere in this codebase, so without it this control would fail closed
 * against everyone on day one, including the platform's own operator. It is a
 * bootstrap, not the long-term authority: setting `PLATFORM_OPERATOR_EMAILS`
 * completes the cutover and retires it in one step, with no window in which two
 * privilege sources are both live.
 */
export function platformOperatorAllowlist(): string[] {
  const normalise = (values: (string | undefined)[]) => [...new Set(
    values.map(v => v?.trim().toLowerCase()).filter((v): v is string => !!v),
  )]

  // Blank, whitespace-only and ',  ,' all normalise to zero entries, so a
  // misconfigured canonical variable falls back rather than authorising nobody
  // by accident — and an empty string never becomes a wildcard entry.
  const canonical = normalise((process.env.PLATFORM_OPERATOR_EMAILS ?? '').split(','))
  if (canonical.length > 0) return canonical

  return normalise([process.env.BREVO_ADMIN_EMAIL])
}

/**
 * Pure predicate — the whole authority decision, with no I/O.
 *
 * Exported separately so the boundary can be tested exhaustively without a
 * session, and so callers cannot re-implement the comparison inline. An empty
 * allowlist returns false for everyone: absence of configuration is absence of
 * authority, never a default grant.
 */
export function isPlatformOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = platformOperatorAllowlist()
  if (allow.length === 0) return false
  return allow.includes(email.trim().toLowerCase())
}

/**
 * Resolve the caller's platform-operator authority from the verified session.
 *
 * The email is read from the Supabase session, which the server validates — it
 * is not taken from a header, a body, or a client-supplied argument, so there is
 * nothing here for a caller to spoof.
 */
export async function resolvePlatformOperator(): Promise<PlatformOperatorResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'unauthenticated' }

  // Distinguished from a plain denial so a misconfigured deployment is
  // diagnosable: "nobody is an operator" is an operations problem, while
  // "you are not the operator" is the expected answer for everyone else.
  if (platformOperatorAllowlist().length === 0) {
    console.error('[platform-operator] no operator configured — global stop authority ' +
                  'is fail-closed until PLATFORM_OPERATOR_EMAILS or BREVO_ADMIN_EMAIL is set')
    return { ok: false, reason: 'no_operator_configured' }
  }

  if (!isPlatformOperatorEmail(user.email)) {
    return { ok: false, reason: 'not_platform_operator' }
  }

  return { ok: true, userId: user.id, email: user.email!, actor: `user:${user.id}` }
}
