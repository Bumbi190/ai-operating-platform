/**
 * lib/workflows/action-run.ts — binding a run to an authorized workflow action.
 *
 * ── THE CALLER REQUESTS; THE SERVER DERIVES ────────────────────────────────
 * A caller may say "perform action X on instance Y". It may NOT supply the
 * project, the workflow state, the definition hash, the target hash or anything
 * about the authorization's meaning. Every one of those is re-derived here from
 * the instance and the pinned definition, and the run is refused if the derived
 * target does not equal the hash the human actually approved. That is what makes
 * the binding a pin rather than a label.
 *
 * ── NOTHING HERE EXECUTES ──────────────────────────────────────────────────
 * This module creates a row and answers questions about it. It has no provider
 * client, no dispatcher and no transition write. PR9c deliberately stops at
 * "an action can be bound and its readiness assessed"; performing one is later
 * work behind its own gates.
 *
 * ── THREE CHECKPOINTS, NOT ONE ─────────────────────────────────────────────
 *   creation    — the approval matches the world right now
 *   claim time  — it still does, before any work begins
 *   pre-commit  — it still does, immediately before the irreversible step
 * The window between claim and side effect is exactly where a revocation must
 * still bite, which is why the third exists at all.
 */

import 'server-only'
import { checkpointClaimedRun } from '@/lib/governance/run-execution-checkpoint'
import type { StopRefusalReason } from '@/lib/governance/execution-stop'

import { readInstance, listEvidence, readDefinitionById } from './store'
import { assertWorkflowAuthorizationValid } from './authorization'
import { assertExecutionAuthorized } from './effect/execution-authorization-runtime'
import { summarizeStateEvidence } from './evidence-consumption'
import { findAdapter } from './adapters/registry'
import { checkAnsweredBy } from './action-discovery'
import { evidenceTargetHashFor } from './evidence-binding'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'
import {
  ACTION_CLASS_POLICY, computeActionIdempotencyKey, computeWorkflowActionTarget,
  policyClassForActionClass, WORKFLOW_ACTION_TARGET_TYPE, type ActionClass,
} from './action-target'
import { lookupAction } from './action-registry'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type ActionBindingRefusal =
  | 'instance_not_found'
  | 'instance_not_active'
  | 'project_paused'
  | 'state_not_in_definition'
  | 'authorization_not_effective'
  | 'target_hash_mismatch'
  | 'evidence_not_satisfied'
  | 'spend_enforcement_required'
  | 'duplicate_action_identity'
  | 'insert_rejected'
  /** The kind is not in the canonical registry, so it has no class. */
  | 'unknown_action_kind'

export interface CreateWorkflowActionRunInput {
  instanceId: string
  /**
   * The ONLY thing the caller names about the action. Its class, retry budget
   * and authorization requirement are all DERIVED from the canonical registry —
   * a caller that could assert the class could assert away the human gate.
   */
  actionKind: string
  /**
   * Required for every class whose policy says so — which is every class except
   * READ_ONLY. Omitting it for a write is refused below AND by the database, so
   * the scheduler cannot create one by leaving this out. Making it optional is
   * what stops an observation from having to FABRICATE an authorization, which
   * would be indistinguishable in the ledger from a human decision.
   */
  authorizationId?: string | null
  sideEffectTarget?: Record<string, string> | null
  /** Omitted for a fresh deliberate action; supplied only to rejoin a retry. */
  attemptGroup?: string
}

export type CreateWorkflowActionRunResult =
  | { ok: true; runId: string; idempotencyKey: string; targetVersionHash: string; attemptGroup: string }
  | {
      ok: false
      refusal: ActionBindingRefusal
      detail: string
      /**
       * DECLARED check keys that blocked binding, for the scheduler's audit row.
       * Populated only by the evidence gate, and drawn only from the adapter's
       * own catalogue — never from a caller and never from an exception.
       */
      blockingCheckKeys?: readonly string[]
    }

function uuid(): string {
  return crypto.randomUUID()
}

/**
 * Create a run bound to an authorized action. Ten checks, in this order, because
 * each depends on the one before it.
 */
export async function createWorkflowActionRun(
  db: AnyDb, input: CreateWorkflowActionRunInput,
): Promise<CreateWorkflowActionRunResult> {
  // 0) Canonical class FIRST, before any read or write. An unknown kind has no
  //    class, and defaulting one — READ_ONLY least of all — is precisely how a
  //    write gets treated as a read.
  const canonical = lookupAction(input.actionKind)
  if (!canonical) {
    return {
      ok: false, refusal: 'unknown_action_kind',
      detail: `"${input.actionKind}" is not in the canonical action registry; it has no class and cannot be bound`,
    }
  }
  const actionClass: ActionClass = canonical.action_class

  // 1) the instance
  const instance = await readInstance(db, input.instanceId)
  if (!instance) return { ok: false, refusal: 'instance_not_found', detail: 'no such workflow instance' }
  if (instance.status !== 'active') {
    return { ok: false, refusal: 'instance_not_active', detail: `instance is ${instance.status}` }
  }

  // 2) a paused project may not accumulate new work, not even unclaimed
  const { data: project } = await db.from('projects')
    .select('execution_paused').eq('id', instance.project_id).maybeSingle()
  if (project?.execution_paused === true) {
    return { ok: false, refusal: 'project_paused', detail: 'project execution is paused' }
  }

  // 3) authoritative current state + pinned definition
  const def = await readDefinitionById(db, instance.def_id)
  const evidence = await listEvidence(db, instance.id)

  // 4) the target, derived — never accepted from the caller.
  //    The declared-check catalogue is resolved FIRST, because only declared
  //    checks may influence the pin: workflow_evidence also carries scheduler
  //    bookkeeping, and letting that in made the scheduler drift the target of
  //    the run it had just created.
  const adapter = findAdapter(instance.def_key)
  const declaredCheckKeys = adapter
    ? adapter.attestableChecks()
        .filter(c => c.state === instance.current_state).map(c => c.check_key)
    : []
  let target
  try {
    target = computeWorkflowActionTarget({
      instance, spec: def.spec, state: instance.current_state,
      actionKind: input.actionKind, actionClass,
      sideEffectTarget: input.sideEffectTarget ?? null, evidence, declaredCheckKeys,
    })
  } catch (e) {
    return { ok: false, refusal: 'state_not_in_definition', detail: (e as Error).message }
  }

  // 5) the authorization must be currently effective for THIS instance
  const policy = ACTION_CLASS_POLICY[actionClass]
  if (policy.requiresAuthorization) {
    if (!input.authorizationId) {
      return {
        ok: false, refusal: 'authorization_not_effective',
        detail: `${actionClass} requires an authorization; none was supplied`,
      }
    }
    const assertion = await assertWorkflowAuthorizationValid(db, instance.id, input.authorizationId)
    if (!assertion.valid) {
      return { ok: false, refusal: 'authorization_not_effective', detail: assertion.reason }
    }
    // 6) …and pin exactly what we just derived. A real approval for a different
    //    artefact, state or evidence set fails here, not silently succeeds.
    const pinned = await readAuthorizationTarget(db, input.authorizationId)
    if (!pinned || pinned.targetType !== WORKFLOW_ACTION_TARGET_TYPE
        || pinned.versionHash !== target.versionHash
        || pinned.targetId !== target.targetId) {
      return {
        ok: false, refusal: 'target_hash_mismatch',
        detail: `authorization pins ${pinned?.versionHash?.slice(0, 12) ?? 'nothing'}…, this action derives ${target.versionHash.slice(0, 12)}…`,
      }
    }
  }

  // 7) required evidence for the state must actually be satisfied — EXCEPT the
  //    one observation this action exists to make.
  //
  //    An action may not be gated on its own output. Requiring
  //    `anonymous_protected_access_denied` before creating the run that PRODUCES
  //    it is a deadlock with no exit: no evidence ⇒ no run ⇒ no evidence. PR9h
  //    hit exactly that in production.
  //
  //    The exemption is deliberately narrow, and narrow in a way a reader can
  //    verify at a glance:
  //      • it comes from `checkAnsweredBy`, the single canonical action→check
  //        mapping, and from no string comparison invented here;
  //      • it is keyed by action kind, so an action can only ever exempt ITS OWN
  //        check — never another action's;
  //      • an unmapped or unknown kind yields null, and null is not a check_key,
  //        so it exempts nothing;
  //      • it filters the BLOCKING list only. The verdict is untouched: the
  //        check stays unsatisfied, no PASS is synthesized, and every gate that
  //        reads evidence later — the tick, the transition, the release —
  //        still sees it as missing until real evidence is recorded.
  //    It buys permission to OBSERVE, and nothing else.
  if (adapter) {
    const declared = adapter.attestableChecks()
    // `required` is a property of the DECLARATION (PR6), not of the verdict —
    // the verdict only reports what the evidence says. Only checks the
    // definition marks required may block an action.
    const requiredKeys = new Set(
      declared.filter(c => c.state === instance.current_state && c.required).map(c => c.check_key))
    // The EVIDENCE pin, not the action pin. `target.versionHash` is a
    // `workflow.action` hash and it includes the evidence rows themselves, so
    // judging evidence against it was wrong twice: a different kind of pin, and
    // one that moves whenever a row is appended. Before PR9h-3 that made every
    // row read as unbound or stale, so no required check could ever be
    // satisfied here — invisible only because nothing had produced bound
    // evidence yet.
    const summary = summarizeStateEvidence(
      declared, instance.current_state, evidence,
      evidenceTargetHashFor(instance, def.spec, instance.current_state, evidence))
    const selfAnswered = checkAnsweredBy(input.actionKind)
    const unmet = summary.verdicts.filter(v => requiredKeys.has(v.check_key) && !v.satisfies)
    const blocking = unmet.filter(v => v.check_key !== selfAnswered)
    if (blocking.length > 0) {
      const blockingCheckKeys = blocking.map(v => v.check_key).sort()
      return {
        ok: false, refusal: 'evidence_not_satisfied', blockingCheckKeys,
        detail: `${blockingCheckKeys.length} required check(s) not satisfied: ${blockingCheckKeys.join(', ')}`,
      }
    }
  }

  // 8) a FINANCIAL action must not become executable while spend is advisory.
  //    PR9b records refusals but does not honour them, so "budget checked" would
  //    be a claim we cannot back.
  if (policy.requiresSpendEnforcement && !isSpendGateEnforced()) {
    return {
      ok: false, refusal: 'spend_enforcement_required',
      detail: 'H1_SPEND_GATE is advisory; a FINANCIAL action may not be bound as executable',
    }
  }

  // 9) identity. attemptGroup is stamped once so retries hash identically.
  const attemptGroup = input.attemptGroup ?? uuid()
  const idempotencyKey = computeActionIdempotencyKey({
    workflowInstanceId: instance.id, defHash: instance.def_hash,
    fromState: instance.current_state, actionKind: input.actionKind,
    targetVersionHash: target.versionHash, attemptGroup,
  })

  // 10) the immutable snapshot. Every binding column is derived above; the DB
  //     trigger re-checks project/def_hash/state independently.
  const { data, error } = await db.from('runs').insert({
    project_id: instance.project_id,
    status: 'pending',
    kind: `workflow.action:${input.actionKind}`,
    input: {}, context: {},
    max_attempts: policy.maxAttempts,
    policy_class: policyClassForActionClass(actionClass),
    workflow_instance_id: instance.id,
    workflow_def_hash: instance.def_hash,
    workflow_from_state: instance.current_state,
    action_kind: input.actionKind,
    action_class: actionClass,
    target_version_hash: target.versionHash,
    // Null only for a class that needs none. The DB refuses a null here for
    // every other class (runs_unauthorized_action_is_read_only).
    authorization_id: policy.requiresAuthorization ? input.authorizationId : null,
    idempotency_key: idempotencyKey,
    attempt_group: attemptGroup,
    authorized_at: new Date().toISOString(),
  }).select('id').maybeSingle()

  if (error) {
    // 23505 is the action-identity index: this exact act already has a live run.
    const duplicate = (error as { code?: string }).code === '23505'
    return {
      ok: false,
      refusal: duplicate ? 'duplicate_action_identity' : 'insert_rejected',
      detail: duplicate
        ? 'an active run already exists for this action identity — retry it, do not create a second'
        : error.message,
    }
  }
  return {
    ok: true, runId: data.id, idempotencyKey,
    targetVersionHash: target.versionHash, attemptGroup,
  }
}

/** The newest target an authorization chain pins. */
async function readAuthorizationTarget(
  db: AnyDb, authorizationId: string,
): Promise<{ targetType: string; targetId: string; versionHash: string } | null> {
  const { data } = await db.from('atlas_authorizations')
    .select('target_type, target_id, target_version_hash')
    .eq('authorization_id', authorizationId)
    .order('occurred_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  return {
    targetType: data.target_type, targetId: data.target_id,
    versionHash: data.target_version_hash,
  }
}

// ── Claim-time revalidation ─────────────────────────────────────────────────

export type ActionReadinessBlocker =
  | 'not_an_action_run'
  | 'instance_missing'
  | 'instance_not_active'
  | 'project_mismatch'
  | 'project_paused'
  | 'state_drifted'
  | 'authorization_not_effective'
  | 'target_drifted'
  | 'evidence_drifted'
  | 'spend_enforcement_required'
  | 'cancel_requested'

export interface ActionReadiness {
  ready: boolean
  blockers: ActionReadinessBlocker[]
  /**
   * Drift means the approved act no longer exists — the run must be terminalized
   * as cancelled, NOT retried as a transient failure. Retrying drift would mean
   * repeatedly attempting something nobody approved.
   */
  terminal: boolean
  detail: string
}

const DRIFT: ActionReadinessBlocker[] = [
  'instance_missing', 'instance_not_active', 'project_mismatch', 'state_drifted',
  'authorization_not_effective', 'target_drifted', 'evidence_drifted',
]

/**
 * May this bound action begin work?
 *
 * Called before an executor does anything. Everything is re-derived; nothing is
 * trusted from the run row except the binding it is being judged against.
 */
export async function assertWorkflowActionReady(db: AnyDb, runId: string): Promise<ActionReadiness> {
  const blockers: ActionReadinessBlocker[] = []
  const { data: run } = await db.from('runs')
    .select('id, project_id, status, cancel_requested, workflow_instance_id, workflow_def_hash, '
          + 'workflow_from_state, action_kind, action_class, target_version_hash, authorization_id')
    .eq('id', runId).maybeSingle()

  if (!run || !run.workflow_instance_id) {
    return { ready: false, blockers: ['not_an_action_run'], terminal: false, detail: 'run carries no action binding' }
  }
  if (run.cancel_requested === true) blockers.push('cancel_requested')

  const instance = await readInstance(db, run.workflow_instance_id)
  if (!instance) {
    return { ready: false, blockers: ['instance_missing'], terminal: true, detail: 'workflow instance is gone' }
  }
  if (instance.status !== 'active') blockers.push('instance_not_active')
  if (instance.project_id !== run.project_id) blockers.push('project_mismatch')
  // The state the approval was for must still be where the instance stands.
  if (instance.current_state !== run.workflow_from_state) blockers.push('state_drifted')

  const { data: project } = await db.from('projects')
    .select('execution_paused').eq('id', instance.project_id).maybeSingle()
  if (project?.execution_paused === true) blockers.push('project_paused')

  const policy = ACTION_CLASS_POLICY[run.action_class as ActionClass]
  if (policy?.requiresSpendEnforcement && !isSpendGateEnforced()) {
    blockers.push('spend_enforcement_required')
  }

  if (policy?.requiresAuthorization) {
    // A write-capable action with no authorization id is not merely unverified;
    // it should not exist, and the DB refuses it. Treat it as ineffective.
    if (!run.authorization_id) blockers.push('authorization_not_effective')
    else if (lookupAction(run.action_kind)?.executor_family === 'governed_effect') {
      // ── The split (Phase 2B-2.5) ───────────────────────────────────────────
      // An EFFECT needs permission to ACT, which is a different decision from
      // permission to ADVANCE. Validating an effect against the gate resolver
      // below would mean an approval to leave `audio_generation` also permitted
      // spending money inside it.
      //
      // READ_ONLY never reaches this block at all — its policy sets
      // requiresAuthorization false — so every action that had a gate check
      // before this branch existed still gets exactly that check.
      const verdict = await assertExecutionAuthorized({
        authorizationId: run.authorization_id,
        projectId: instance.project_id,
        instanceId: instance.id,
        defKey: instance.def_key,
        defVersion: instance.def_version,
        defHash: instance.def_hash,
        state: run.workflow_from_state,
        actionKind: run.action_kind,
        actionClass: run.action_class as ActionClass,
        targetVersionHash: run.target_version_hash,
        attemptGroup: run.attempt_group ?? '',
      })
      if (!verdict.valid) blockers.push('authorization_not_effective')
    }
    else {
      const assertion = await assertWorkflowAuthorizationValid(db, instance.id, run.authorization_id)
      if (!assertion.valid) blockers.push('authorization_not_effective')
    }
  }

  // Re-derive the target from today's world and compare to the pinned one.
  if (!blockers.includes('state_drifted')) {
    try {
      const def = await readDefinitionById(db, instance.def_id)
      const evidence = await listEvidence(db, instance.id)
      const adapter = findAdapter(instance.def_key)
      const declaredCheckKeys = adapter
        ? adapter.attestableChecks()
            .filter(c => c.state === instance.current_state).map(c => c.check_key)
        : []
      const target = computeWorkflowActionTarget({
        instance, spec: def.spec, state: instance.current_state,
        actionKind: run.action_kind, actionClass: run.action_class as ActionClass,
        sideEffectTarget: null, evidence, declaredCheckKeys,
      })
      // Evidence is part of the payload, so new or changed evidence moves the
      // hash — reported as target drift, which is what it is.
      if (target.versionHash !== run.target_version_hash) blockers.push('target_drifted')
    } catch {
      blockers.push('target_drifted')
    }
  }

  const terminal = blockers.some(b => DRIFT.includes(b))
  return {
    ready: blockers.length === 0,
    blockers, terminal,
    detail: blockers.length === 0 ? 'bound action is ready' : `blocked: ${blockers.join(', ')}`,
  }
}

// ── Pre-commit contract ─────────────────────────────────────────────────────

/**
 * Why a dispatch was refused. Kept distinct because the caller must act
 * differently on each: a STOPPED action is TEMPORARY control flow and the run
 * goes back to the queue; a NOT_READY action is a genuine refusal the failure
 * model owns; FENCED means another owner and we touch nothing.
 */
export type PreCommitRefusal = 'FENCED' | 'CANCELLED' | 'STOPPED' | 'NOT_READY'

export interface PreCommitVerdict {
  allowed: boolean
  reason: string
  /** Set exactly when `allowed` is false. */
  refusal?: PreCommitRefusal
  /** Set only for STOPPED, so the caller can report a stable governance code. */
  stopReason?: StopRefusalReason
}

/**
 * THE CONTRACT every future executor MUST call immediately before an
 * irreversible side effect, for MATERIAL_WRITE, FINANCIAL,
 * EXTERNAL_COMMUNICATION and DESTRUCTIVE.
 *
 * Claim-time validation is not enough on its own: the window between claiming a
 * run and actually sending the newsletter is exactly where a revocation, a pause
 * or a cancel has to still take effect. This re-checks all of it AND the fencing
 * token, so a zombie executor whose claim was rotated cannot perform the act.
 *
 * PR9c returns a verdict and performs NO side effect of its own. It does not
 * mark the run, does not transition anything and does not spend.
 */
export async function assertWorkflowActionStillAuthorized(
  db: AnyDb, runId: string, claimId: string | null | undefined,
  projectId?: string | null,
): Promise<PreCommitVerdict> {
  // ── G3C-3A ────────────────────────────────────────────────────────────────
  // This function existed with ZERO runtime callers: the executor called
  // readiness only, so the documented "third checkpoint" was a comment rather
  // than a behaviour. It is now genuinely called immediately before
  // DISPATCH_STARTED, and it composes the canonical post-claim checkpoint
  // rather than re-deriving ownership and pause itself.
  //
  // That composition is the point. Readiness reads `projects.execution_paused`
  // directly and has never consulted the GLOBAL authority at all, so an action
  // claimed before a platform-wide stop would sail straight through it. The
  // canonical resolver supplies global + project together, fails closed when
  // the authority is unreadable, and keeps one truth table for the whole system.
  const gate = await checkpointClaimedRun(db, {
    runId, claimId, projectId, boundary: 'action:pre-dispatch',
  })
  if (!gate.allowed) {
    return {
      allowed: false,
      refusal: gate.refusal,
      reason: gate.detail,
      ...(gate.refusal === 'STOPPED' ? { stopReason: gate.reason } : {}),
    }
  }

  // Readiness second: authorization, target hash, evidence and state drift.
  // Deliberately after ownership — nothing readiness computes is trustworthy if
  // another worker owns this run.
  const readiness = await assertWorkflowActionReady(db, runId)
  if (!readiness.ready) {
    return { allowed: false, refusal: 'NOT_READY', reason: readiness.detail }
  }

  // ── FINAL checkpoint — the load-bearing one ───────────────────────────────
  // Readiness above performs its own DB reads, and the world can change during
  // them. With only the first checkpoint this function returned a decision that
  // was already stale by the time it returned:
  //
  //   T1  checkpoint #1 says clear
  //   T2  readiness begins its reads
  //   T3  a global stop / project stop / cancellation / claim rotation commits
  //   T4  readiness returns ready
  //   T5  this function returns allowed  ← stale
  //
  // The first checkpoint still earns its place: it stops a zombie worker doing
  // readiness work as though it owned the run. But THIS one is the pre-dispatch
  // decision, and nothing that reads the world may follow it before
  // DISPATCH_STARTED.
  const final = await checkpointClaimedRun(db, {
    runId, claimId, projectId, boundary: 'action:pre-dispatch:final',
  })
  if (!final.allowed) {
    return {
      allowed: false,
      refusal: final.refusal,
      reason: final.detail,
      ...(final.refusal === 'STOPPED' ? { stopReason: final.reason } : {}),
    }
  }

  return { allowed: true, reason: 'authorization, target, evidence, stop authority and claim all still current' }
}

/** Short, safe display form of an identity hash. Never the whole value. */
export function idempotencyPrefix(key: string | null): string | null {
  return key ? `${key.slice(0, 12)}…` : null
}
