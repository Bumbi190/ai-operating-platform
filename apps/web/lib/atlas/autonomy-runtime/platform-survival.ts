/**
 * lib/atlas/autonomy-runtime/platform-survival.ts — the PLATFORM-runtime
 * Survival ceiling.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * A runtime autonomy gate needs the Survival ceiling, and the obvious call —
 * `readSurvivalSnapshot([currentProjectId])` — is the WRONG one.
 *
 * Operating capital is a PLATFORM fact. A project-scoped observation therefore
 * cannot produce a runway figure at all: platform-wide capital divided by one
 * project's burn overstates the truth, so `derive.ts` refuses to produce the
 * number and caps the state at CRITICAL rather than letting a partial
 * observation look healthier than the platform is. That cap is the RIGHT answer
 * for a project-scoped question and the WRONG answer for this one.
 *
 * Today funding is UNDECLARED, so both scopes happen to floor at CONSERVE and
 * the difference is invisible. That is an accident of the current input, not
 * the contract. Once funding becomes KNOWN-positive, PARTIAL_SCOPE becomes
 * materially stricter — so this adapter is platform-correct NOW rather than
 * relying on a NULL declaration to hide the difference.
 *
 * ── NO CALLER INPUT AT ALL ──────────────────────────────────────────────────
 * There is deliberately nothing to pass in:
 *
 *   • NO project ids — the caller's scope must not decide the platform ceiling.
 *     Coverage is an ownership fact today (`getAllowedProjectIds` is
 *     `projects.owner_id = auth.uid`), and platform authority must not be a
 *     side effect of who happens to own rows.
 *   • NO funding override and NO coverage override — `readSurvivalSnapshot`
 *     accepts both as controlled test seams explicitly marked "PRODUCTION
 *     CALLERS MUST NOT PASS THIS". This adapter is a production caller, so it
 *     passes neither; the parameterless signature is what makes that structural
 *     rather than a convention.
 *   • NO clock override — a request must not be able to pick the instant its
 *     own authority is measured at (§18.133 revalidation means "now").
 *
 * ── FAILURE IS L0, NEVER A THROW AND NEVER A SHRUG ──────────────────────────
 * If the project population cannot be established, or the snapshot cannot be
 * read, this returns a CLOSED failure carrying ceiling L0. It does not throw
 * upward into whatever the caller's error handling happens to do, and it does
 * not return null — a null ceiling at the composition layer is the fail-open
 * this phase exists to close.
 */

import 'server-only'

import { serviceRolePortfolioReader } from '@/lib/auth/portfolio-authority'
import { readSurvivalSnapshot } from '@/lib/atlas/survival'
// The level vocabulary arrives through Survival, which re-exports it. This file
// therefore imports ZERO autonomy-license modules: it must not consume licence
// machinery at all, and a guard asserts that rather than trusting this comment.
import type { SurvivalState, AutonomyLicenseLevel } from '@/lib/atlas/survival'

/** Why the platform ceiling could not be established. Closed. */
export type PlatformSurvivalFailure =
  /** The platform project population could not be read. */
  | 'population_unavailable'
  /** The population was readable but the snapshot could not be produced. */
  | 'snapshot_unavailable'

/**
 * The platform Survival ceiling.
 *
 * On success, `ceiling` is what Survival permits platform-wide. On failure,
 * `ceiling` is L0 and `ok` is false — the caller must treat both the same way
 * (refuse), but the reason is preserved for the audit trail.
 *
 * The project population is deliberately NOT part of this object: a caller has
 * no reason to know it, and returning it would leak the platform's project set
 * into every consumer.
 */
export type PlatformSurvivalResult =
  | { readonly ok: true; readonly ceiling: AutonomyLicenseLevel; readonly state: SurvivalState }
  | { readonly ok: false; readonly ceiling: typeof L0; readonly reason: PlatformSurvivalFailure }

/** L0 by name, so the failure branch's ceiling is a constant and not a lookup. */
const L0 = 'L0' as const

/**
 * Read the platform Survival ceiling.
 *
 * Takes no arguments — see the header. Every input is derived server-side.
 */
export async function readPlatformSurvivalCeiling(): Promise<PlatformSurvivalResult> {
  let projectIds: string[]
  try {
    // The canonical whole-platform enumeration seam. Reused rather than
    // re-implemented: a second `createAdminClient().from('projects')` here would
    // be a second global project reader, and two readers means two answers to
    // "what is the platform" that can drift apart.
    //
    // It is the LEAST-PRIVILEGE READER, not the authority check. The operator
    // requirement lives in `resolvePlatformPortfolioAuthority`, which this
    // adapter deliberately does NOT call: the future execution path is
    // cron/background and has no user session, so requiring an operator session
    // for runtime would invent a human in a place that has none. Reusing the
    // population reader is a data question; it is not an authority grant.
    const rows = await serviceRolePortfolioReader()
    projectIds = rows.map(r => r.id)
  } catch {
    // The reader throws on a read error. An unreadable platform is L0 — never a
    // permissive fallback, and never an exception escaping into the caller.
    return { ok: false, ceiling: L0, reason: 'population_unavailable' }
  }

  // An empty population is not a complete one, and must not be handed on as if
  // it were. `readRunwayCoverage` already treats `[]` as PARTIAL_SCOPE, so this
  // is belt-and-braces against a future change to that rule.
  if (projectIds.length === 0) {
    return { ok: false, ceiling: L0, reason: 'population_unavailable' }
  }

  try {
    const observation = await readSurvivalSnapshot(projectIds)
    return { ok: true, ceiling: observation.ceiling, state: observation.snapshot.state }
  } catch {
    // `readSurvivalSnapshot` is written to degrade rather than throw, so this
    // is defence in depth. It must still be L0: an unexpected throw is an
    // unreadable platform condition.
    return { ok: false, ceiling: L0, reason: 'snapshot_unavailable' }
  }
}
