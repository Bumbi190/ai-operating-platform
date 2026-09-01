'use server'

/**
 * Operator control over the stop authority (G3A).
 *
 * ── WHY THESE ARE SERVER ACTIONS AND NOT TOOLS ─────────────────────────────
 * Resume is the act of re-enabling spend and external side effects — both
 * unattended and operator-requested.
 * It is therefore explicit operator authority, exercised by an authenticated
 * human through a control they chose to press. It is deliberately NOT exposed
 * as a generic callable tool: a model that can resume execution can resume the
 * execution that was stopped BECAUSE of the model, and the kill switch stops
 * being a kill switch.
 *
 * There is also no unauthenticated route here. A public pause endpoint is a
 * denial-of-service primitive, and a public resume endpoint is worse.
 *
 * ── AUTHORITY, NOT JUST IDENTITY ───────────────────────────────────────────
 * The global switch requires PLATFORM-OPERATOR authority, not merely a session.
 * An authenticated user is somebody; a platform operator is somebody entitled to
 * stop — and, more dangerously, to RESUME — every tenant at once. Pause is
 * recoverable; an unauthorised resume re-enables spend and external side
 * effects — unattended AND operator-requested — while the reason for the pause
 * is still live.
 *
 * The project switch stays gated on project OWNERSHIP, which is the correct
 * authority for a single-project control and is not a substitute for the global
 * one: owning one project cannot confer authority over all of them.
 *
 * ── ACTOR PROVENANCE ───────────────────────────────────────────────────────
 * The actor is derived from the server-side session, never accepted as an
 * argument. These actions take no actor parameter at all, so there is nothing
 * for a caller to spoof — the ledger records who the server authenticated, not
 * who the request claimed to be.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import {
  operatorActor, setPlatformAutomationStop, setProjectExecutionStop,
  type StopMutationResult,
} from '@/lib/governance/execution-stop'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export interface StopActionResult {
  ok: boolean
  /** false = the state already matched; nothing was written. */
  changed: boolean
  paused: boolean
  /** Stable code, never a raw database message. */
  error?: 'forbidden' | 'not_operator' | 'failed'
}

function ok(r: StopMutationResult): StopActionResult {
  return { ok: true, changed: r.changed, paused: r.newPaused }
}

/**
 * GLOBAL EXECUTION STOP — pause or resume.
 *
 * SCOPE, stated precisely because the flag's name understates it. This stops
 * BOTH unattended automation (AUTONOMOUS) AND operator-requested execution
 * (OPERATOR_EXECUTION): generation, publishing, sending, workflow runs, any
 * provider-backed or externally-visible work, however it was triggered.
 *
 * It does NOT stop operator assistance. Atlas chat, status views, governance
 * inspection, planning and these controls themselves stay available — that is
 * what makes this a stop rather than a lockout, and it is why the operator can
 * still reach the console that lifts it.
 *
 * The underlying column is still called `automation_paused`: applied migration
 * history and every existing reader keep that name. The NAME is legacy; the
 * SEMANTICS are the ones above. See GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION in
 * lib/governance/execution-stop.ts for the derivation.
 *
 * This moves one boolean and records that it moved. It grants nothing: no
 * authorization is created, renewed, extended, or revived, no expired or
 * revoked grant comes back, no evidence requirement is bypassed, no workflow
 * state advances, and no run is created. Work that resumes still faces every
 * gate it faced before the pause.
 */
export async function toggleAutomationPause(
  paused: boolean, reason?: string,
): Promise<StopActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // AUTHORITY CHECK. Not "is there a session" — "is this the platform operator".
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    // One answer for "you are not an operator" and "no operator is configured":
    // a non-operator must not learn the platform's authorization posture from a
    // denial. The distinction is logged server-side, where it is diagnostic
    // rather than informative to an unauthorised caller.
    console.error(`[stop-authority] global mutation denied: ${operator.reason}`)
    return { ok: false, changed: false, paused, error: 'not_operator' }
  }

  try {
    const result = await setPlatformAutomationStop(createAdminClient(), {
      paused, actor: operator.actor, reason: reason ?? null,
    })
    revalidatePath('/atlas')
    revalidatePath('/system')
    return ok(result)
  } catch (e) {
    console.error('[stop-authority] platform toggle failed:',
      e instanceof Error ? e.message : String(e))
    return { ok: false, changed: false, paused, error: 'failed' }
  }
}

/**
 * PROJECT EXECUTION STOP — pause or resume, for ONE project.
 *
 * SCOPE, stated precisely. This stops BOTH unattended automation (AUTONOMOUS)
 * AND operator-requested execution (OPERATOR_EXECUTION) for that project —
 * generation, publishing, sending, workflow runs, any provider-backed or
 * externally-visible work, however it was triggered. Unlike the global switch,
 * the project scope is NEVER optional for execution: no policy constant relaxes
 * it, in either enforcing context.
 *
 * It does NOT stop operator assistance. Reading the project, inspecting its
 * governance, planning and these controls stay available.
 *
 * Ownership-gated on the same boundary the rest of the platform uses: a user
 * may only stop projects they own. Note that this is a per-scope control, not a
 * copy of the global switch — resuming a project does NOT resume the platform,
 * and lifting the global pause does NOT resume a project that was paused for
 * its own reasons. Two different people stopped those for two different
 * reasons, and neither decision may silently undo the other.
 */
export async function toggleProjectExecutionPause(
  projectId: string, paused: boolean, reason?: string,
): Promise<StopActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const allowed = await getAllowedProjectIds(db, user.id)
  if (!assertProjectAllowed(projectId, allowed)) {
    // Same answer for "not yours" and "does not exist" — distinguishing them
    // would make this an existence oracle for other tenants' project ids.
    return { ok: false, changed: false, paused, error: 'forbidden' }
  }

  try {
    const result = await setProjectExecutionStop(db, {
      projectId, paused, actor: operatorActor(user.id), reason: reason ?? null,
    })
    revalidatePath('/atlas')
    revalidatePath('/system')
    return ok(result)
  } catch (e) {
    console.error('[stop-authority] project toggle failed:',
      e instanceof Error ? e.message : String(e))
    return { ok: false, changed: false, paused, error: 'failed' }
  }
}
