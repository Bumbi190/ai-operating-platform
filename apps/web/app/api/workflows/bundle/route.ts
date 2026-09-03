/**
 * GET /api/workflows/bundle?month=YYYY-MM — the Month Release Bundle, v0.
 *
 * A READ MODEL and nothing else. It answers "where is this month, and what is
 * holding it up?" for one month, from data Omnira already holds.
 *
 * WHAT THIS ROUTE CANNOT DO, structurally:
 *   • execute any action — it never imports the executor or the action registry's
 *     run path; the only registry lookup is `checkAnsweredBy`, a pure map read
 *   • transition a workflow — it never calls appendTransition
 *   • write evidence — it never calls recordEvidence
 *   • schedule anything — it never calls scheduleWorkflowWake
 *   • reach Familje-Stunden — it makes no outbound request at all
 *   • spend — no provider, no cost path
 *
 * Every store function it uses is a reader: readDefinition, readInstanceByKey,
 * listTransitions, listEvidence. The projection itself is pure.
 *
 * ── Why the two executable READ_ONLY actions are NOT invoked here ────────────
 * `probe-anonymous-protected-access` performs a real HTTP request against
 * Familje-Stundens production endpoints. That is read-only in intent but it is
 * still an outbound side effect, and a status endpoint may be polled. Firing a
 * production probe on every page refresh would turn a dashboard into a load
 * generator, and would also make the bundle non-deterministic.
 *
 * So this route projects the evidence those actions have ALREADY recorded and
 * invokes neither. Running them stays a deliberate act through the scheduler and
 * the read-only executor, which is where the class policy and the stop authority
 * apply. The bundle reports what is known, not what it could go and find out.
 */

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import {
  readDefinition, readInstanceByKey, listTransitions, listEvidence,
} from '@/lib/workflows/store'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE } from '@/lib/workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '@/lib/workflows/adapters/familje-stunden/checks'
import { ACTION_REGISTRY } from '@/lib/workflows/action-registry'
import { checkAnsweredBy } from '@/lib/workflows/action-discovery'
import { projectMonthReleaseBundle, isCanonicalMonthKey } from '@/lib/workflows/bundle/project'

export const dynamic = 'force-dynamic'

const DEF_VERSION = 1

/**
 * Check keys answered by an action that is BOTH read-only and actually
 * executable. Derived from the canonical registry rather than listed here, so a
 * kind that later stops being executable cannot leave a stale claim behind.
 */
function readOnlyAnsweredCheckKeys(): string[] {
  const keys: string[] = []
  for (const [kind, meta] of Object.entries(ACTION_REGISTRY)) {
    if (meta.action_class !== 'READ_ONLY') continue
    if (meta.executor_family !== 'read_only_observation') continue
    const answered = checkAnsweredBy(kind)
    if (answered) keys.push(answered)
  }
  return keys
}

export async function GET(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = new URL(request.url).searchParams.get('month')?.trim() ?? ''
  if (!isCanonicalMonthKey(month)) {
    return NextResponse.json(
      { error: 'invalid_request', detail: 'month must be YYYY-MM' }, { status: 400 })
  }

  const db = createAdminClient()

  // A definition may legitimately not be registered yet — workflow_defs = 0 has
  // been a deliberate safety barrier. That is NOT_STARTED, not an error.
  const def = await readDefinition(db, FAMILJE_STUNDEN_MONTHLY_RELEASE, DEF_VERSION)
    .catch(() => null)

  const instance = def
    ? await readInstanceByKey(db, def.id, month).catch(() => null)
    : null

  // Project isolation applies to the instance exactly as it does elsewhere: an
  // instance outside the caller's projects is reported as absent, not as denied.
  const visible = instance && assertProjectAllowed(instance.project_id, access.allowedProjectIds)
    ? instance
    : null

  const [transitions, evidence] = visible
    ? await Promise.all([listTransitions(db, visible.id), listEvidence(db, visible.id)])
    : [[], []]

  const bundle = projectMonthReleaseBundle({
    month_key: month,
    def,
    instance: visible,
    transitions,
    evidence,
    declaredChecks: FAMILJE_STUNDEN_CHECKS,
    readOnlyAnsweredCheckKeys: readOnlyAnsweredCheckKeys(),
  })

  return NextResponse.json(bundle, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  })
}
