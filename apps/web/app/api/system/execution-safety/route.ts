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
import { listOpenIncidents } from '@/lib/workflows/reconciliation'
import { severityForActionOutcome } from '@/lib/workflows/escalation'

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

  // G2: headroom per SCOPE for the caller's own projects. Read-only — it asks
  // what the gate WOULD say and never reserves.
  //
  // This reads `budget_scope_state` through `budget_headroom`, the same function
  // `budget_reserve` decides on. Before G2 the two computed headroom separately
  // and could disagree for the same project at the same instant (audit F-204);
  // now neither contains the arithmetic, so they cannot drift.
  let budgets: { slug: string; scope: string; limit_sek: number; spent_sek: number;
                 held_sek: number; remaining_sek: number }[] = []
  let budgetedIds = new Set<string>()
  try {
    const { data } = await db.rpc('budget_headroom', { p_stale_minutes: 30 })
    const rows = (data ?? []) as any[]
    // A project appears here once per CONFIGURED scope; one row is enough to
    // prove it has a budget at all.
    budgetedIds = new Set(rows.map(b => b.project_id as string))
    budgets = rows.filter(b => ids.includes(b.project_id)).map(b => ({
      slug: b.slug,
      scope: String(b.scope),
      limit_sek: Number(b.limit_sek), spent_sek: Number(b.spent_sek),
      held_sek: Number(b.held_sek), remaining_sek: Number(b.remaining_sek),
    }))
  } catch { budgets = [] }

  // A project spending with no budget row would be refused the moment the gate is
  // enforced, so it must surface BEFORE that flip, not during it.
  const unbudgeted = ids.filter(id => !budgetedIds.has(id))
  if (unbudgeted.length > 0) findings.push('projects_without_budget')
  // ANY exhausted scope exhausts the project — the tightest one decides.
  if (budgets.some(b => b.remaining_sek <= 0)) findings.push('budget_exhausted')

  // PR9d — actions frozen awaiting a human. An ambiguous outcome means the side
  // effect MAY have happened, so the only safe next step is to ask the
  // authoritative system, never to try again.
  const raw = await listOpenIncidents(db, ids)
  const incidents = raw.map(i => ({
    run_id: i.runId,
    action_kind: i.actionKind,
    action_class: i.actionClass,
    outcome: i.outcome,
    severity: severityForActionOutcome(i.actionClass, i.outcome),
    reason: i.reason,
    idempotency_key_prefix: i.idempotencyKeyPrefix,
    remote_operation_id: i.remoteOperationId,
    reconciliations_recorded: i.reconciliationCount,
    guidance: (i.outcome === 'UNKNOWN' || i.outcome === 'PARTIAL')
      ? 'DO NOT RETRY — reconcile first'
      : 'record the outstanding evidence; do not repeat the side effect',
  }))
  if (incidents.some(i => i.severity === 'critical')) findings.push('ambiguous_action_incident')
  else if (incidents.length > 0) findings.push('action_incident_open')

  if (counts.running_past_lease > 0) findings.push('runs_running_past_lease')
  if (counts.cancel_requested_still_running > 0) findings.push('cancel_requested_not_honoured')
  if (claimableUnderPause > 0) findings.push('paused_project_has_claimable_runs')

  // PR9e — bound workflow action runs, read-only. Shows what the executor did
  // without offering any way to make it do it again.
  let actions: Record<string, unknown>[] = []
  try {
    const { data } = await db.from('runs')
      .select('id, workflow_instance_id, action_kind, action_class, action_phase, '
            + 'action_outcome, attempts, max_attempts, status, claim_id, target_version_hash')
      .in('project_id', ids)
      .not('workflow_instance_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)
    actions = ((data ?? []) as Record<string, string | number | null>[]).map(r => ({
      run_id: r.id,
      instance_id: r.workflow_instance_id,
      action_kind: r.action_kind,
      action_class: r.action_class,
      phase: r.action_phase,
      outcome: r.action_outcome,
      attempts: `${r.attempts}/${r.max_attempts}`,
      status: r.status,
      claimed: r.claim_id !== null,
      // Prefix only: the full hash is an identity, not a display value.
      target_hash: typeof r.target_version_hash === 'string'
        ? `${r.target_version_hash.slice(0, 12)}…` : null,
    }))
  } catch { actions = [] }

  return NextResponse.json({
    flags,
    actions,
    counts: { ...counts, claimable_under_pause: claimableUnderPause,
              projects_without_budget: unbudgeted.length,
              open_action_incidents: incidents.length },
    budgets,
    incidents,
    findings,
    healthy: findings.length === 0,
    observed_at: nowIso,
  })
}
