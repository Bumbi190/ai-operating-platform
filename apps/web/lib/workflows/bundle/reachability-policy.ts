/**
 * lib/workflows/bundle/reachability-policy.ts — where automation is DELIBERATELY
 * blocked, stated explicitly.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY ─────────────────────────────────────────
 * Without it, two very different situations look identical in the bundle:
 *
 *   a check nobody has wired yet          -> a genuine engineering gap
 *   a check we decided NOT to automate    -> a standing security decision
 *
 * Both currently render as NOT_EXERCISED. A permanent blocker that looks like an
 * oversight eventually gets "fixed" by weakening it, which is precisely the
 * outcome the decision was meant to prevent. So the decision is written down
 * here, in one reviewable list, rather than inferred.
 *
 * ── THE CLASSIFICATION IS NEVER GUESSED ─────────────────────────────────────
 * Membership is by explicit `check_key` only. It is never derived from a check's
 * name, its severity, the absence of an action, a `credential_missing` string or
 * a comment. Adding an entry is a deliberate act with a recorded reason.
 *
 * ── AND IT CHANGES NOTHING ABOUT SATISFACTION ───────────────────────────────
 * An entry here is descriptive. It does not create evidence, does not satisfy a
 * hard gate, does not alter `allowed_provenance`, and does not make an
 * unanswered check pass. It says only: "the automated route is closed on
 * purpose, and here is who closed it and why."
 */

export interface ManualPrivilegedVerification {
  check_key: string
  /** The out-of-band procedure that actually performs this verification. */
  procedure: string
  /** Why the automated route is closed. Non-secret, one line. */
  reason: string
  /** What would reopen it. */
  unblocked_by: string
}

/**
 * Checks whose automation is intentionally blocked by a security decision.
 *
 * ONE entry today. Resist the temptation to pre-populate: an unlisted check is
 * correctly reported as UNREACHABLE, and a genuine gap showing up as a gap is
 * the behaviour this file exists to protect.
 */
export const MANUAL_PRIVILEGED_CHECKS: readonly ManualPrivilegedVerification[] = [
  {
    check_key: 'shared_manifest_consumers_in_sync',
    procedure: 'familje-stunden: scripts/verify-deployed-protected-manifest.mjs, run by the Editor',
    // Reading a DEPLOYED Edge Function's bundled files needs the Supabase
    // Management API, and this account can only issue account-wide personal
    // access tokens — no project scope, no edge_functions_read permission.
    // Such a token can create and delete projects and read secrets across the
    // whole account, so it may not live in any deployed runtime.
    reason: 'BROAD_CREDENTIAL_PROHIBITED',
    unblocked_by: 'a Supabase scoped PAT limited to this project with edge_functions_read',
  },
]

const BY_KEY = new Map(MANUAL_PRIVILEGED_CHECKS.map(p => [p.check_key, p]))

/** The recorded policy for a check, or null when none exists. */
export function manualPrivilegedPolicy(checkKey: string): ManualPrivilegedVerification | null {
  return BY_KEY.get(checkKey) ?? null
}
