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
 * SCOPE. Session-authenticated. Project rows and project stop events are
 * limited to projects the caller owns. Platform-scope events are returned to
 * any authenticated operator by design — the global switch is a shared control,
 * and "who stopped the platform I am standing on" is exactly what an operator
 * needs during an incident.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveExecutionStop } from '@/lib/governance/execution-stop'

export const dynamic = 'force-dynamic'

const EVENT_LIMIT = 50

export async function GET() {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const db = createAdminClient()
  const ids = access.allowedProjectIds

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
    // `stop_events` is not in database.types.ts yet: this migration is
    // deliberately NOT applied in this pass, and the generated types are
    // regenerated from the applied schema. The cast is scoped to this one query
    // so the rest of the route keeps its types; it goes away when the types are
    // regenerated after apply.
    const q = (db as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => {
              or: (f: string) => Promise<{ data: unknown[] | null }>
              eq: (c: string, v: string) => Promise<{ data: unknown[] | null }>
            }
          }
        }
      }
    })
      .from('stop_events')
      .select('id, scope_type, scope_id, event, previous_paused, new_paused, '
            + 'actor, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT)
    // A caller who owns no projects still sees the platform switch. Building the
    // `in.()` list unconditionally would emit `scope_id.in.()`, which PostgREST
    // rejects — and the catch below would swallow it into a silently empty
    // ledger, i.e. a governance surface that reports "no stop events" because
    // the query was malformed.
    const { data } = ids.length > 0
      ? await q.or(`scope_type.eq.PLATFORM_AUTOMATION,scope_id.in.(${ids.join(',')})`)
      : await q.eq('scope_type', 'PLATFORM_AUTOMATION')
    events = (data ?? []) as Record<string, unknown>[]
  } catch (e) {
    console.error('[stop-authority] event read failed:',
      e instanceof Error ? e.message : String(e))
    events = []
  }

  return NextResponse.json({
    platform: {
      paused: platform.globalPaused,
      resolution: platform.resolution,
      paused_at: platform.observed?.globalPausedAt ?? null,
      paused_reason: platform.observed?.globalPausedReason ?? null,
    },
    projects,
    events,
    observed_at: new Date().toISOString(),
  })
}
