'use server'

/**
 * Operator control over the stop authority (G3A).
 *
 * ── WHY THESE ARE SERVER ACTIONS AND NOT TOOLS ─────────────────────────────
 * Resume is the act of re-enabling unattended spend and external side effects.
 * It is therefore explicit operator authority, exercised by an authenticated
 * human through a control they chose to press. It is deliberately NOT exposed
 * as a generic callable tool: a model that can resume execution can resume the
 * execution that was stopped BECAUSE of the model, and the kill switch stops
 * being a kill switch.
 *
 * There is also no unauthenticated route here. A public pause endpoint is a
 * denial-of-service primitive, and a public resume endpoint is worse.
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
  error?: 'forbidden' | 'failed'
}

function ok(r: StopMutationResult): StopActionResult {
  return { ok: true, changed: r.changed, paused: r.newPaused }
}

/**
 * Pause or resume ALL unattended automation.
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

  try {
    const result = await setPlatformAutomationStop(createAdminClient(), {
      paused, actor: operatorActor(user.id), reason: reason ?? null,
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
 * Pause or resume unattended execution for ONE project.
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
