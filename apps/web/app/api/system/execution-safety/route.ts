/**
 * GET /api/system/execution-safety — can execution actually be stopped right now?
 *
 * The Phase 8.5 review could not answer that question from outside the running
 * process: the safety flags are sensitive env vars, so `vercel env pull` returns
 * empty strings for all of them. H1_CANCEL turned out to be unset entirely, which
 * meant cancelling a running run wrote a flag nothing read — and the API said
 * "ok". An unverifiable safety feature is not a safety feature.
 *
 * This endpoint reports EFFECTIVE state: booleans derived through the same
 * predicates the runtime uses, plus the few live conditions that indicate the
 * stop path is not working. It never returns a raw env value — "cancellation is
 * on" is operational truth an operator needs; the contents of an encrypted
 * variable is a secret and stays one.
 *
 * Session-authenticated and project-scoped: the counts cover only projects the
 * caller owns, so a status surface can't become a cross-tenant window. Read-only —
 * it changes nothing, pauses nothing and cancels nothing.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { executionSafetyFlags, unsafeExecutionFlags } from '@/lib/ai/execution-flags'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const db = createAdminClient() as any
  const ids = access.allowedProjectIds
  const flags = executionSafetyFlags()
  const findings: string[] = [...unsafeExecutionFlags(flags)]

  if (ids.length === 0) {
    return NextResponse.json({ flags, findings, counts: null, healthy: findings.length === 0 })
  }

  const nowIso = new Date().toISOString()

  const [pausedRes, runningRes, overdueRes, cancelWantedRes] = await Promise.all([
    db.from('projects').select('id').in('id', ids).eq('execution_paused', true),
    db.from('runs').select('id').in('project_id', ids).eq('status', 'running'),
    // Past its lease and still marked running: the reaper should have reclaimed it.
    db.from('runs').select('id').in('project_id', ids).eq('status', 'running').lt('lease_until', nowIso),
    // Asked to stop and still running — expected while cancel is disabled, which
    // is exactly why it is reported next to the flag that explains it.
    db.from('runs').select('id, project_id').in('project_id', ids)
      .eq('status', 'running').eq('cancel_requested', true),
  ])

  const pausedIds: string[] = (pausedRes.data ?? []).map((r: { id: string }) => r.id)
  const counts = {
    paused_projects: pausedIds.length,
    running: (runningRes.data ?? []).length,
    running_past_lease: (overdueRes.data ?? []).length,
    cancel_requested_still_running: (cancelWantedRes.data ?? []).length,
  }

  // The kill switch's own failure mode: a paused project that still has work the
  // claim path would pick up. With the PR9a claim_runs this must always be 0 —
  // a non-zero value means the pause predicate is not in the deployed function.
  let claimableUnderPause = 0
  if (pausedIds.length > 0) {
    const { data } = await db.from('runs').select('id')
      .in('project_id', pausedIds).eq('status', 'pending')
    claimableUnderPause = (data ?? []).length
  }

  if (counts.running_past_lease > 0) findings.push('runs_running_past_lease')
  if (counts.cancel_requested_still_running > 0) findings.push('cancel_requested_not_honoured')
  if (claimableUnderPause > 0) findings.push('paused_project_has_claimable_runs')

  return NextResponse.json({
    flags,
    counts: { ...counts, claimable_under_pause: claimableUnderPause },
    findings,
    healthy: findings.length === 0,
    observed_at: nowIso,
  })
}
