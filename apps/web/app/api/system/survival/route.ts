/**
 * GET /api/system/survival — Atlas's economic condition, and the autonomy
 * ceiling it implies. Phase 1: this endpoint OBSERVES and reports. It grants
 * nothing, spends nothing, refuses nothing and pauses nothing.
 *
 * ── WHY AN ENDPOINT AND NOT A STATE MACHINE THAT ACTS ───────────────────────
 * The discovery that produced this slice found that with the data that exists
 * today — 198 SEK spent of a 1500 SEK monthly pool, no cash figure anywhere, MRR
 * approximately equal to burn — a survival state machine wired into execution
 * would sit in NORMAL indefinitely while adding a new authority to the platform.
 * So Phase 1 reports the observation and its ceiling and applies neither. The
 * value here is a measurement surface that names its own unknowns, which is a
 * precondition for any later phase being worth building.
 *
 * ── READ-ONLY BY CONSTRUCTION ───────────────────────────────────────────────
 * Every source it reads already exists and is only ever SELECTed:
 *
 *   budget_headroom()     what the spend gate WOULD say — never `budget_reserve`,
 *                         which would consume headroom and let a status check
 *                         refuse real work as a side effect of being looked at
 *   cost_events           trailing burn, a measured actual
 *   revenue_snapshots     a PERFORMANCE SIGNAL — never cash, never a runway
 *   platform_config       the owner's automation pause, reported for context only
 *
 * Session-authenticated and project-scoped: the reads cover only projects the
 * caller owns, so a status surface cannot become a cross-tenant window. No raw
 * environment value is ever returned — the same rule `execution-safety` states
 * for the flags.
 *
 * ── WHAT IT MUST NEVER GAIN ─────────────────────────────────────────────────
 * A parameter that sets funding, a lever that pauses, or a mutation of any kind.
 * `declaredFundingSek` is deliberately NOT accepted from the request: a caller
 * who could supply the funding figure could choose the input that governs
 * expansion, and `lib/atlas/executive/http.ts` already establishes that
 * authority-adjacent inputs are refused from bodies rather than picked from them.
 */

import { NextResponse } from 'next/server'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import {
  allCeilings,
  describeCeiling,
  readSurvivalSnapshot,
  PROVISIONAL_POLICY_NOTICE,
  SURVIVAL_CEILING_EFFECT,
  SURVIVAL_THRESHOLD_STATUS,
} from '@/lib/atlas/survival'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  // The ceilings are a static property of the five states, not tenant data, so
  // they are returned in every branch. The snapshot is not.
  const ceilings = allCeilings()

  // An operator reading this surface never sees the source, so the provisional
  // status of the thresholds travels WITH the numbers. Without this, a
  // plotted CONSERVE boundary would look like settled policy to the only person
  // who could approve it.
  const policy = {
    policyStatus: SURVIVAL_THRESHOLD_STATUS,
    policyNotice: PROVISIONAL_POLICY_NOTICE,
  }

  if (access.allowedProjectIds.length === 0) {
    return NextResponse.json({
      ...policy,
      snapshot: null,
      ceiling: null,
      ceilingDescription: null,
      ceilingEffect: null,
      ceilings,
      note: 'no projects in scope',
    })
  }

  // ── PHASE 2B: FUNDING AND COVERAGE ARE SERVER-DERIVED ────────────────────
  // The route passes neither. The funding reading comes from the canonical
  // persisted source (`platform_config`), and runway coverage is derived from
  // this caller's actual project set — so a request can choose neither the
  // figure that governs expansion nor the claim that its scope is complete.
  //
  // UNDECLARED, UNAVAILABLE and KNOWN are now all reachable, and they floor
  // differently on purpose: a failed reading must never buy freedom. Nothing
  // here can name one of those states by hand.
  const { snapshot, ceiling } = await readSurvivalSnapshot(access.allowedProjectIds)

  return NextResponse.json({
    ...policy,
    snapshot,
    ceiling,
    ceilingDescription: describeCeiling(snapshot.state),
    ceilingEffect: SURVIVAL_CEILING_EFFECT[snapshot.state],
    ceilings,
    note:
      'A ceiling, not a grant. Survival pressure may only lower autonomy; nothing '
      + 'here authorizes, spends, refuses or pauses anything.',
  })
}
