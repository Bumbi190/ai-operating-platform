/**
 * GET /api/system/stop-authority — what is stopped, and who stopped it (G3A).
 *
 * Before G3A this question was unanswerable. The two booleans told you the
 * CURRENT state and nothing else: no actor, no reason, no previous value, no
 * time. "Automation was paused at some point last night and is running now" was
 * a thing the database physically could not tell you.
 *
 * This surface reports both scopes AND the transition ledger behind them.
 *
 * READ-ONLY. It resolves, it does not mutate: it pauses nothing, resumes
 * nothing, cancels nothing, and calls no setter. Pause and resume are operator
 * authority exercised through an authenticated server action, never through a
 * GET.
 *
 * SCOPE — LEAST PRIVILEGE, TWO TIERS.
 *
 * The first version of this surface returned the platform's stop HISTORY to any
 * authenticated caller. That leaks cross-tenant governance: operator user ids
 * and free-text incident reasons ("paused: vendor breach", "runaway spend on
 * <customer>") are not things a tenant learns merely by holding a session.
 *
 *   PLATFORM OPERATOR — everything: global state, when, why, and the full
 *     transition ledger with actors.
 *   ANY OTHER AUTHENTICATED USER — the global paused BOOLEAN only. They are
 *     entitled to know the platform is stopped, because it explains why their
 *     own work is refused. They are not entitled to who stopped it or why.
 *     Their own projects' state and events are returned, with the actor redacted
 *     unless it is themselves — an operator who pauses a tenant's project must
 *     not become identifiable to that tenant through this surface.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveExecutionStop } from '@/lib/governance/execution-stop'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'

export const dynamic = 'force-dynamic'

const EVENT_LIMIT = 50

export async function GET() {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const db = createAdminClient()
  const ids = access.allowedProjectIds
  const operator = await resolvePlatformOperator()
  const isOperator = operator.ok
  const selfActor = `user:${access.userId}`

  // The platform scope, resolved through the SAME resolver the runtime uses —
  // so this surface cannot report a state the enforcement path would disagree
  // with. Reported in the interactive context because that is what this is: a
  // human reading a console.
  const platform = await resolveExecutionStop(db, { context: 'OPERATOR_INTERACTIVE' })

  // What an AUTONOMOUS caller would be told right now, per owned project. This
  // is the operationally useful line: `allowed:false` here means unattended work
  // for that project is currently refused, and `reason` says by which authority.
  const projects = await Promise.all(ids.map(async id => {
    const decision = await resolveExecutionStop(db, {
      context: 'AUTONOMOUS', projectId: id,
    })
    return {
      project_id: id,
      autonomous_allowed: decision.allowed,
      reason: decision.reason,
      resolution: decision.resolution,
      project_paused: decision.projectPaused,
      paused_at: decision.observed?.projectPausedAt ?? null,
      paused_reason: decision.observed?.projectPausedReason ?? null,
    }
  }))

  // The ledger. Platform events plus this caller's project events, newest first.
  let events: Record<string, unknown>[] = []
  try {
    const q = db
      .from('stop_events')
      .select('id, scope_type, scope_id, event, previous_paused, new_paused, '
            + 'actor, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT)
    // A caller who owns no projects still sees the platform switch (if they are
    // an operator). Building the `in.()` list unconditionally would emit
    // `scope_id.in.()`, which PostgREST rejects — and the catch below would
    // swallow it into a silently empty ledger, i.e. a governance surface that
    // reports "no stop events" because the query was malformed.
    const projectFilter = ids.length > 0 ? `scope_id.in.(${ids.join(',')})` : null
    const { data } =
      isOperator && projectFilter
        ? await q.or(`scope_type.eq.PLATFORM_AUTOMATION,${projectFilter}`)
        : isOperator
          ? await q.eq('scope_type', 'PLATFORM_AUTOMATION')
          : projectFilter
            // Non-operators are filtered to their OWN projects in the query, not
            // after the fact: a redaction applied in application code after a
            // broad read is one refactor away from being dropped.
            ? await q.or(projectFilter)
            : { data: [] }
    // PostgREST types this result as a union that includes an error shape, so it
    // is narrowed through `unknown`. The row shape is fixed by the explicit
    // column list above.
    events = (((data ?? []) as unknown) as Record<string, unknown>[]).map(e =>
      isOperator || e.actor === selfActor ? e : { ...e, actor: null })
  } catch (e) {
    console.error('[stop-authority] event read failed:',
      e instanceof Error ? e.message : String(e))
    events = []
  }

  return NextResponse.json({
    // `paused` is deliberately visible to everyone: a tenant whose work is being
    // refused is entitled to know the platform is stopped. When, why and by whom
    // are operator-only.
    platform: {
      paused: platform.globalPaused,
      resolution: platform.resolution,
      paused_at:     isOperator ? platform.observed?.globalPausedAt ?? null : null,
      paused_reason: isOperator ? platform.observed?.globalPausedReason ?? null : null,
    },
    viewer: { platform_operator: isOperator },
    projects,
    events,
    observed_at: new Date().toISOString(),
  })
}
