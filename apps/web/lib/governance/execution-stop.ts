/**
 * lib/governance/execution-stop.ts — the canonical stop authority (G3A).
 *
 * ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
 * Before G3A the platform had two stop switches and no single place that knew
 * about both. `automation_paused` was consulted by five runtime readers in the
 * media pipeline; `execution_paused` was enforced in SQL by the workflow claim
 * path. Nothing composed them, so "is this allowed to run right now?" had two
 * different answers depending on which code path asked, and neither answer
 * distinguished "not paused" from "I could not find out".
 *
 * `resolveExecutionStop` is the one place that answers it.
 *
 * ── WHY EXECUTION CONTEXT IS A PARAMETER AND NOT AN INFERENCE ──────────────
 * A global pause must stop unattended work. It must NOT stop the operator, and
 * this is not a nicety: the console an operator uses to UNPAUSE is itself served
 * by the platform. A stop authority that refuses interactive calls while paused
 * locks the operator out of the only control that can lift the pause, which
 * turns an automation kill switch into a platform outage with no recovery path
 * short of direct database access.
 *
 * So the caller declares its context explicitly at the boundary. It is never
 * inferred from route names, prompt text, or the presence of a session — all of
 * which are attacker- or refactor-controlled, and all of which would let an
 * autonomous path acquire operator privileges by renaming a file.
 *
 * ── FAIL-CLOSED, SCOPED ────────────────────────────────────────────────────
 * AUTONOMOUS work that cannot establish the stop state refuses. That refusal is
 * scoped to the decision being made: failing to read project X's flag refuses
 * project X's autonomous work and says nothing about project Y or about
 * interactive use. A lookup failure must never escalate into "Atlas is offline".
 *
 * ── WHAT THIS MODULE DOES NOT DO ───────────────────────────────────────────
 * It decides; it does not enforce. No runtime path is rewired in G3A, and this
 * module deliberately contains no provider, spend, or execution logic — wiring
 * enforcement into the executors is a later slice, and doing both at once would
 * mean shipping a new authority and a new set of refusals in one unreviewable
 * change.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * AUTONOMOUS            — unattended execution: schedulers, drains, workflow
 *                         ticks, cron-driven pipelines. A pause MUST stop these.
 * OPERATOR_INTERACTIVE  — a human at the keyboard, in-session. A pause must NOT
 *                         stop these; it is reported to them, not enforced
 *                         against them.
 */
export type ExecutionContext = 'AUTONOMOUS' | 'OPERATOR_INTERACTIVE'

export type StopScope = 'PLATFORM_AUTOMATION' | 'PROJECT_EXECUTION'

/**
 * Stable, closed set. These strings are policy identifiers: they are compared,
 * logged, and surfaced. A raw database error message must never appear here —
 * it is unstable, it leaks schema, and it makes "why was this refused?"
 * unanswerable by anything except a human reading prose.
 */
export type StopRefusalReason =
  | 'global_automation_paused'
  | 'project_execution_paused'
  | 'stop_state_unavailable'

/** Did we actually establish the truth, or are we guessing? */
export type StopResolution = 'RESOLVED' | 'UNRESOLVED'

export interface StopDecision {
  /** The answer. For OPERATOR_INTERACTIVE this is always true by design. */
  allowed: boolean
  context: ExecutionContext
  /** Which authorities this decision consulted. */
  scopesEvaluated: StopScope[]
  resolution: StopResolution
  /** null means "not established" — never conflate with false. */
  globalPaused: boolean | null
  projectPaused: boolean | null
  /** Non-null exactly when `allowed` is false. */
  reason: StopRefusalReason | null
  /** Operator-facing context. Display only; never an input to the decision. */
  observed: StopObservation | null
}

export interface StopObservation {
  globalPausedAt: string | null
  globalPausedReason: string | null
  projectFound: boolean
  projectPausedAt: string | null
  projectPausedReason: string | null
}

export interface ResolveExecutionStopInput {
  context: ExecutionContext
  /** Omit for platform-level work that belongs to no single project. */
  projectId?: string | null
}

// ─── Reading the state ───────────────────────────────────────────────────────

interface StopStateRow {
  global_paused: boolean
  global_paused_at: string | null
  global_paused_reason: string | null
  project_requested: boolean
  project_found: boolean
  project_paused: boolean | null
  project_paused_at: string | null
  project_paused_reason: string | null
}

/**
 * One round trip for both scopes. Reading them separately would allow a decision
 * built from a fresh global flag and a stale project flag — a window in which
 * the composition is true of no instant that ever existed.
 */
async function readStopState(
  db: SupabaseClient, projectId: string | null,
): Promise<StopStateRow | null> {
  try {
    const { data, error } = await db.rpc('stop_state', { p_project_id: projectId })
    if (error) {
      // Logged, never returned: the caller gets a stable reason code, and the
      // detail stays server-side where it is useful and harmless.
      console.error('[execution-stop] stop_state failed:', error.message)
      return null
    }
    const row = Array.isArray(data) ? data[0] : data
    return (row as StopStateRow | undefined) ?? null
  } catch (e) {
    console.error('[execution-stop] stop_state threw:',
      e instanceof Error ? e.message : String(e))
    return null
  }
}

// ─── The resolver ────────────────────────────────────────────────────────────

/**
 * The single definition of "may this execute right now".
 *
 * Truth table for AUTONOMOUS (the enforcing context):
 *
 *   global   project   →  allowed   reason
 *   ───────────────────────────────────────────────────────────
 *   clear    clear     →  true      —
 *   clear    paused    →  false     project_execution_paused
 *   paused   clear     →  false     global_automation_paused
 *   paused   paused    →  false     global_automation_paused
 *   unknown  *         →  false     stop_state_unavailable
 *   clear    unknown   →  false     stop_state_unavailable
 *
 * The scopes are independent and compose by AND. Neither overrides the other,
 * and resuming one never resumes the other — a project paused for its own
 * reasons stays paused when the global switch is lifted, because the two
 * pauses were decided by different people for different reasons.
 *
 * Global is reported before project when both are paused: it is the broader
 * authority, and telling an operator "project X is paused" while the entire
 * platform is stopped sends them to fix the wrong thing.
 */
export async function resolveExecutionStop(
  db: SupabaseClient, input: ResolveExecutionStopInput,
): Promise<StopDecision> {
  const projectId = input.projectId ?? null
  const scopesEvaluated: StopScope[] = projectId
    ? ['PLATFORM_AUTOMATION', 'PROJECT_EXECUTION']
    : ['PLATFORM_AUTOMATION']

  const row = await readStopState(db, projectId)

  if (row === null) {
    // Unresolved. Interactive callers still proceed — an operator must be able
    // to reach the console during a database incident, and a pause we cannot
    // read is not a pause we may enforce against a human.
    return {
      allowed: input.context === 'OPERATOR_INTERACTIVE',
      context: input.context,
      scopesEvaluated,
      resolution: 'UNRESOLVED',
      globalPaused: null,
      projectPaused: null,
      reason: input.context === 'AUTONOMOUS' ? 'stop_state_unavailable' : null,
      observed: null,
    }
  }

  const globalPaused = row.global_paused === true
  // A requested-but-missing project is "unknown", not "clear". Coalescing it to
  // false would hand autonomous work a green light derived from a failed lookup.
  const projectPaused: boolean | null =
    projectId === null ? null
      : row.project_found ? row.project_paused === true
        : null

  const observed: StopObservation = {
    globalPausedAt:      row.global_paused_at,
    globalPausedReason:  row.global_paused_reason,
    projectFound:        row.project_found === true,
    projectPausedAt:     row.project_paused_at,
    projectPausedReason: row.project_paused_reason,
  }

  // Whether the project scope is KNOWN is a property of the read, not of the
  // context — an interactive caller sees the same UNRESOLVED, it just is not
  // refused for it.
  const projectUnknown = projectId !== null && projectPaused === null
  const resolution: StopResolution = projectUnknown ? 'UNRESOLVED' : 'RESOLVED'

  if (input.context === 'OPERATOR_INTERACTIVE') {
    return {
      allowed: true, context: input.context, scopesEvaluated, resolution,
      globalPaused, projectPaused, reason: null, observed,
    }
  }

  let reason: StopRefusalReason | null = null
  if (globalPaused)            reason = 'global_automation_paused'
  else if (projectUnknown)     reason = 'stop_state_unavailable'
  else if (projectPaused)      reason = 'project_execution_paused'

  return {
    allowed: reason === null, context: input.context, scopesEvaluated,
    resolution, globalPaused, projectPaused, reason, observed,
  }
}

// ─── Mutation ────────────────────────────────────────────────────────────────

export interface StopMutationResult {
  /** false = the state already matched; no ledger row was written. */
  changed: boolean
  previousPaused: boolean
  newPaused: boolean
  /** null exactly when `changed` is false. */
  eventId: string | null
}

interface StopMutationRow {
  changed: boolean
  previous_paused: boolean
  new_paused: boolean
  event_id: string | null
}

function toMutationResult(data: unknown): StopMutationResult {
  const row = (Array.isArray(data) ? data[0] : data) as StopMutationRow | undefined
  if (!row) throw new Error('stop mutation returned no row')
  return {
    changed: row.changed === true,
    previousPaused: row.previous_paused === true,
    newPaused: row.new_paused === true,
    eventId: row.event_id ?? null,
  }
}

/**
 * The actor string, derived on the server from the authenticated session.
 *
 * It is never accepted from the client. A caller who can name themselves can
 * name someone else, and an audit ledger whose actor column is client-supplied
 * records a claim rather than a fact.
 */
export function operatorActor(userId: string): string {
  const id = userId.trim()
  if (!id) throw new Error('operatorActor requires an authenticated user id')
  return `user:${id}`
}

/**
 * Pause or resume ALL unattended automation.
 *
 * PAUSE/RESUME move exactly one boolean and record that it moved. They create
 * no authorization, renew none, extend none, revive nothing expired or revoked,
 * bypass no evidence requirement, advance no workflow state, and create no run
 * or action run. Resume is the removal of a block, never the granting of one —
 * everything a resumed system does next still has to pass every gate it faced
 * before the pause.
 */
export async function setPlatformAutomationStop(
  db: SupabaseClient,
  args: { paused: boolean; actor: string; reason?: string | null },
): Promise<StopMutationResult> {
  const { data, error } = await db.rpc('stop_set_platform_automation', {
    p_paused: args.paused, p_actor: args.actor, p_reason: args.reason ?? null,
  })
  if (error) throw new Error(`platform stop mutation failed: ${error.message}`)
  return toMutationResult(data)
}

/** Pause or resume unattended execution for ONE project. Same guarantees. */
export async function setProjectExecutionStop(
  db: SupabaseClient,
  args: { projectId: string; paused: boolean; actor: string; reason?: string | null },
): Promise<StopMutationResult> {
  const { data, error } = await db.rpc('stop_set_project_execution', {
    p_project_id: args.projectId, p_paused: args.paused,
    p_actor: args.actor, p_reason: args.reason ?? null,
  })
  if (error) throw new Error(`project stop mutation failed: ${error.message}`)
  return toMutationResult(data)
}
