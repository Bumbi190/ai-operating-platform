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
// TYPE-ONLY, and deliberately so: `governed-spend` imports this module for the
// dispatch check, so a value import here would be a cycle. `import type` is
// erased at compile time, leaving no runtime edge.
import type { ProjectRef } from '@/lib/cost/governed-spend'

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * AUTONOMOUS           — unattended execution: schedulers, drains, workflow
 *                        ticks, cron-driven pipelines. A pause MUST stop these.
 *
 * OPERATOR_INTERACTIVE — ordinary operator ASSISTANCE, and nothing more: Atlas
 *                        chat, reading state, inspecting governance, planning,
 *                        asking questions. Never refused, because the console
 *                        that lifts a pause is served by the paused platform.
 *
 *                        THIS IS NOT AN EXECUTION CONTEXT. It must never become
 *                        the escape hatch for media generation, external
 *                        communication, material writes, financial execution or
 *                        workflow execution. Anything with a side effect is
 *                        OPERATOR_EXECUTION, however it was triggered.
 *
 * OPERATOR_EXECUTION   — execution-bearing work a HUMAN asked for: generate an
 *                        image, publish, send, run a workflow, or any other
 *                        provider-backed or externally-visible action. A click
 *                        is not an authorisation: the work still spends money
 *                        and still touches the outside world, so it does not
 *                        inherit the interactive bypass merely because a session
 *                        exists.
 *
 * The split between the two operator contexts is the point of this vocabulary.
 * Collapsing them would mean a stop authority that any human can walk around by
 * pressing a button, which is the failure mode the third context exists to
 * prevent.
 */
export type ExecutionContext =
  | 'AUTONOMOUS'
  | 'OPERATOR_INTERACTIVE'
  | 'OPERATOR_EXECUTION'

/**
 * Does the GLOBAL automation pause stop human-requested execution?
 *
 * LOCKED: yes. Derived from the product's own behaviour, not from the flag's
 * name. The audit of every current reader found:
 *
 *   • 4 unattended cron paths enforce it — consistent with either reading.
 *   • 12 operator-triggered, provider-backed routes exist. Exactly ONE consults
 *     the flag: `lib/article/hero-image.ts`, reached from the route documented
 *     as "operator-triggered … Not a cron endpoint", which refuses with
 *     `reason: 'automation_paused'` under the comment "respect the operator's
 *     global automation pause".
 *   • The operator-facing control promises "Pausa ALL automation", and the
 *     banner reads "ALL automation är manuellt pausad".
 *
 * The other 11 routes ignore the flag, but that is the known ungated-path gap
 * this governance programme exists to close — an audit finding, not a statement
 * of intent. Reading "11 paths forgot to check" as "operator execution is
 * deliberately exempt" would convert a defect into a policy.
 *
 * So the only DELIBERATE decision in the codebase enforces, and the only
 * operator-facing promise says "all". The permissive reading additionally
 * recreates the bypass this vocabulary was introduced to prevent: if a human
 * click lifts the global stop, the global stop is advisory.
 *
 * This is a POLICY constant, not an implementation detail. Flipping it to false
 * makes `automation_paused` an automation-only pause under which operator-
 * requested spend continues; that is a product decision, and the truth table and
 * its tests move with it.
 */
export const GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION = true

/**
 * Existing operator-triggered paths that bear EXECUTION, and therefore must be
 * classified `OPERATOR_EXECUTION` — never `OPERATOR_INTERACTIVE` — when
 * enforcement is wired in G3C.
 *
 * This list is the audit result, not a guess: every entry is a route that
 * authenticates a human session AND reaches a provider or an external surface.
 * Together they are the proof that the third context is not theoretical — today
 * exactly ONE of them (`hero-image`, via lib/article/hero-image.ts) consults any
 * stop authority at all, so eleven human-triggered spend paths currently run
 * regardless of a global pause.
 *
 * G3A does NOT wire these. Classifying and enforcing them is G3C. The list is
 * here so that work starts from evidence rather than from a fresh grep, and so a
 * route that disappears or is renamed is caught by the test that walks it.
 */
export const OPERATOR_EXECUTION_PATHS_FOR_G3C = [
  // Provider-backed generation, human-initiated
  'app/api/content/articles/[id]/hero-image/route.ts',   // image gen — the ONE that checks today
  'app/api/media/scripts/[id]/regenerate/route.ts',      // script regeneration
  'app/api/media/news/hunt/route.ts',                    // news hunt
  'app/api/media/pipeline/full/route.ts',                // full media pipeline
  'app/api/media/pipeline/daily/route.ts',               // daily media pipeline
  // External communication / publication — side effects that leave the platform
  'app/api/media/publish/instagram/route.ts',            // EXTERNAL_COMMUNICATION
  // Reads that still spend on providers
  'app/api/media/insights/check/route.ts',
  'app/api/content/articles/[id]/sync/route.ts',
  'app/api/content/articles/[id]/review/route.ts',
] as const

/**
 * DUAL-MODE paths — the sharpest lesson for G3C.
 *
 * These accept EITHER a `Bearer ${CRON_SECRET}` (unattended) OR an authenticated
 * operator session, on the same endpoint, and then run the same pipeline:
 *
 *     let authed = !!cronSecret && authHeader === `Bearer ${cronSecret}`
 *     if (!authed) { ...getUser(); authed = !!user }
 *
 * So the execution context here is NOT a property of the route. The same URL is
 * AUTONOMOUS on one request and OPERATOR_EXECUTION on the next, and only the
 * branch that actually authenticated knows which. This is precisely why context
 * is an explicit parameter at the call boundary rather than something inferred
 * from a route name or a path prefix: any route-level mapping would classify
 * these two wrongly half the time, and the half it got wrong would be the
 * unattended half that a pause is supposed to stop.
 */
export const DUAL_MODE_EXECUTION_PATHS_FOR_G3C = [
  'app/api/media/breaking/route.ts',                     // cron OR operator
  'app/api/content/articles/operator-generate/route.ts', // cron OR operator
] as const

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


// ─── The execution contract ─────────────────────────────────────────────────

/**
 * WHICH STOP AUTHORITIES BIND THIS WORK.
 *
 * This is NOT the billing project, and the distinction is load-bearing rather
 * than pedantic: `PLATFORM_COMPAT_PROJECT_SLUG` and `MEDIA_PIPELINE_PROJECT_SLUG`
 * are the SAME slug (`ai-media-automation`). Atlas chat and Atlas TTS are billed
 * to it for historical attribution reasons while belonging to no project at all.
 *
 * If stop scope were derived from billing attribution, pausing the media project
 * would silently take Atlas offline — an operator lockout produced by an
 * accounting decision. So scope is declared, never inferred.
 *
 *   GLOBAL_ONLY  platform-level work that belongs to no project. Only the global
 *                authority binds it.
 *   PROJECT      work that genuinely belongs to one project. BOTH authorities
 *                bind it, and the project named here is the EXECUTION project,
 *                which may differ from the billing project.
 */
export type ExecutionScope =
  | { kind: 'GLOBAL_ONLY' }
  | { kind: 'PROJECT'; project: ProjectRef }

/**
 * What every billable dispatch must declare about itself.
 *
 * Both fields are REQUIRED and neither has a default. That is the whole point:
 * an optional context would be filled in by whichever value made the code
 * compile, and the value that makes code compile is the permissive one. A caller
 * that cannot say why it is executing has not established that it may.
 */
export interface ExecutionContract {
  context: ExecutionContext
  scope: ExecutionScope
}

/** Platform-level work: only the global authority binds it. */
export const GLOBAL_ONLY: ExecutionScope = { kind: 'GLOBAL_ONLY' }
/** Work belonging to one project. Names the EXECUTION project, not the billed one. */
export const projectScope = (project: ProjectRef): ExecutionScope =>
  ({ kind: 'PROJECT', project })

/**
 * A stop refused this execution.
 *
 * Deliberately NOT a `SpendRefusedError`. Budget and stop are different
 * authorities answering different questions — "can we afford it" versus "may
 * anything run at all" — and a caller that cannot tell them apart cannot report
 * honestly, retry correctly, or explain itself to an operator. Collapsing them
 * would also let a stop look like a transient budget condition worth retrying.
 */
export class ExecutionStoppedError extends Error {
  readonly reason: StopRefusalReason
  readonly context: ExecutionContext
  readonly scopeKind: ExecutionScope['kind']
  readonly decision: StopDecision

  constructor(args: {
    reason: StopRefusalReason
    context: ExecutionContext
    scopeKind: ExecutionScope['kind']
    decision: StopDecision
    provider?: string
    operation?: string
  }) {
    const where = args.provider && args.operation
      ? ` (${args.provider}/${args.operation})` : ''
    super(`execution stopped: ${args.reason} [${args.context}/${args.scopeKind}]${where}`)
    this.name = 'ExecutionStoppedError'
    this.reason = args.reason
    this.context = args.context
    this.scopeKind = args.scopeKind
    // The structured decision, which carries only stable codes and observed
    // booleans — never a raw database message, SQL, or credential.
    this.decision = args.decision
  }
}

/**
 * Resolve a contract against the canonical authority.
 *
 * The EXECUTION project is resolved here, independently of any billing lookup.
 * Nothing in this function can see `resolveGovernedProjectId`'s result, which is
 * what makes "billing is not authority" structural rather than a convention.
 *
 * A PROJECT scope whose project cannot be resolved is `stop_state_unavailable`
 * for the enforcing contexts — an unresolvable scope is not an absent one.
 */
export async function resolveExecutionStopForContract(
  db: SupabaseClient,
  contract: ExecutionContract,
  resolveProjectId: (ref: ProjectRef) => Promise<string | null>,
): Promise<StopDecision> {
  if (contract.scope.kind === 'GLOBAL_ONLY') {
    return resolveExecutionStop(db, { context: contract.context })
  }

  let projectId: string | null = null
  try {
    projectId = await resolveProjectId(contract.scope.project)
  } catch {
    projectId = null
  }

  if (projectId === null) {
    // Interactive assistance keeps G3A's semantics: it is reported to, never
    // enforced against, even when a scope cannot be established.
    const assistanceOnly = contract.context === 'OPERATOR_INTERACTIVE'
    return {
      allowed: assistanceOnly,
      context: contract.context,
      scopesEvaluated: ['PLATFORM_AUTOMATION', 'PROJECT_EXECUTION'],
      resolution: 'UNRESOLVED',
      globalPaused: null,
      projectPaused: null,
      reason: assistanceOnly ? null : 'stop_state_unavailable',
      observed: null,
    }
  }

  return resolveExecutionStop(db, { context: contract.context, projectId })
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
 * ── THE TRUTH TABLE, ALL THREE CONTEXTS ────────────────────────────────────
 *
 *  global   project   AUTONOMOUS            OPERATOR_EXECUTION    OPERATOR_INTERACTIVE
 *  ──────────────────────────────────────────────────────────────────────────────────
 *  clear    clear     ✅                    ✅                    ✅
 *  clear    paused    ❌ project_execution_paused                 ✅
 *                                           ❌ project_execution_paused
 *  paused   clear     ❌ global_automation_paused                 ✅
 *                                           ❌ global_automation_paused †
 *  paused   paused    ❌ global_automation_paused                 ✅
 *                                           ❌ global_automation_paused †
 *  unknown  *         ❌ stop_state_unavailable                   ✅
 *                                           ❌ stop_state_unavailable
 *  clear    unknown   ❌ stop_state_unavailable                   ✅
 *                                           ❌ stop_state_unavailable
 *
 *  † governed by GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION (locked true — see its
 *    derivation above). With it false, OPERATOR_EXECUTION would be allowed in
 *    these two rows and refused only by the PROJECT scope, which is never
 *    optional.
 *
 * OPERATOR_INTERACTIVE is allowed in EVERY row. That is deliberate and is the
 * whole reason the third context exists: assistance stays available so the
 * operator can diagnose and lift the pause, while execution does not ride along
 * on that exemption.
 *
 * The two scopes are independent and compose by AND. Neither overrides the
 * other, and resuming one never resumes the other — a project paused for its own
 * reasons stays paused when the global switch is lifted, because the two pauses
 * were decided by different people for different reasons.
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
    const assistanceOnly = input.context === 'OPERATOR_INTERACTIVE'
    return {
      allowed: assistanceOnly,
      context: input.context,
      scopesEvaluated,
      resolution: 'UNRESOLVED',
      globalPaused: null,
      projectPaused: null,
      // Execution-bearing work refuses whoever asked for it: an unreadable stop
      // state is not permission, and a human clicking does not make it one.
      reason: assistanceOnly ? null : 'stop_state_unavailable',
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

  // Ordinary assistance is never refused — see the truth table above.
  if (input.context === 'OPERATOR_INTERACTIVE') {
    return {
      allowed: true, context: input.context, scopesEvaluated, resolution,
      globalPaused, projectPaused, reason: null, observed,
    }
  }

  // Both enforcing contexts refuse on the project scope and on an unresolved
  // scope. They differ only in whether the GLOBAL flag binds them.
  const globalBinds = input.context === 'AUTONOMOUS'
    || GLOBAL_PAUSE_STOPS_OPERATOR_EXECUTION

  let reason: StopRefusalReason | null = null
  if (globalPaused && globalBinds) reason = 'global_automation_paused'
  else if (projectUnknown)         reason = 'stop_state_unavailable'
  else if (projectPaused)          reason = 'project_execution_paused'

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
 * GLOBAL EXECUTION STOP — pause or resume.
 *
 * Stops unattended automation AND operator-requested execution; never operator
 * assistance. The column is still named `automation_paused` for applied-history
 * reasons — the name is legacy, the semantics are these.
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

/**
 * PROJECT EXECUTION STOP for ONE project. Same guarantees as the global setter.
 *
 * Stops AUTONOMOUS and OPERATOR_EXECUTION alike for that project, and unlike the
 * global scope this is never relaxed by policy — see the truth table.
 */
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
