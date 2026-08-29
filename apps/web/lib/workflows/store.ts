/**
 * lib/workflows/store.ts — the ONLY persistence boundary for workflow state.
 *
 * It exposes registration, instantiation, appends and reads. There is
 * deliberately no update and no delete for history, mirroring
 * lib/atlas/authorization/store.ts: the immutable record cannot be violated
 * through this interface, and the database enforces the same rule independently
 * through reject triggers. TypeScript convention alone is not the guard.
 *
 * TWO INDEPENDENT GUARANTEES, neither sufficient alone:
 *   • This module refuses any move the pure machine rejects (graph legality,
 *     prerequisites, gate crossing).
 *   • workflow_append_transition() refuses any move whose `from_state` is not
 *     the live state, under a row lock. That is what stops two callers who each
 *     validated against the same stale read from both advancing.
 *
 * PR1 executes nothing. Nothing here calls a provider, reaches another Supabase
 * project, or touches the approval layer.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeDefHash } from './spec'
import { findVendoredDefinition } from './definitions'
import { deriveCurrentState, getState, validateTransition } from './machine'
import type {
  EvidenceResult,
  EvidenceSource,
  WorkflowDef,
  WorkflowEvidence,
  WorkflowInstance,
  WorkflowSpec,
  WorkflowTransition,
} from './types'

// The Supabase client in this project has no generated types for these tables.
type AnyDb = any
export type WorkflowDb = ReturnType<typeof createAdminClient> | AnyDb

const DEF_COLS      = 'id, def_key, version, def_hash, spec, created_at'
const INSTANCE_COLS =
  'id, def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status, wake_at, last_tick_at, last_tick_outcome, created_at, closed_at'
const TRANSITION_COLS =
  'id, seq, instance_id, from_state, to_state, reason, actor, evidence_ref, authorization_id, occurred_at'
const EVIDENCE_COLS =
  'id, instance_id, state, check_key, result, source, detail, recorded_at, ' +
  'producer, producer_type, observed_at, payload_hash, target_hash, attestation'

const UNIQUE_VIOLATION = '23505'

// ── Definitions ──────────────────────────────────────────────────────────────

/**
 * Register a vendored definition version, or return the one already stored.
 *
 * Idempotent by (def_key, version). If a row exists whose `def_hash` differs
 * from the vendored content, this THROWS rather than updating: principle 3 says
 * a definition change is a new version, and quietly rewriting v1 would move the
 * ground under every instance pinned to it. The database backs this up — the
 * workflow_defs UPDATE trigger makes the rewrite impossible even by hand.
 */
export async function registerVendoredDefinition(
  db: WorkflowDb,
  defKey: string,
  version: number,
): Promise<{ def: WorkflowDef; created: boolean }> {
  const vendored = findVendoredDefinition(defKey, version)
  if (!vendored) {
    throw new Error(`registerVendoredDefinition: ${defKey} v${version} is not vendored in this build`)
  }

  const existing = await readDefinition(db, defKey, version)
  if (existing) {
    if (existing.def_hash !== vendored.def_hash) {
      throw new Error(
        `registerVendoredDefinition: ${defKey} v${version} is already registered with a different def_hash ` +
        `(stored ${existing.def_hash.slice(0, 12)}…, vendored ${vendored.def_hash.slice(0, 12)}…). ` +
        `A definition change must be registered as a NEW VERSION, never as an edit.`,
      )
    }
    return { def: existing, created: false }
  }

  const { data, error } = await (db as AnyDb)
    .from('workflow_defs')
    .insert({
      def_key: vendored.def_key,
      version: vendored.version,
      def_hash: vendored.def_hash,
      spec: vendored.spec,
    })
    .select(DEF_COLS)
    .single()

  if (error) {
    // Lost a race with a concurrent registration — the other writer's row is
    // authoritative, so re-read and re-run the hash check against it.
    if (error.code === UNIQUE_VIOLATION) {
      const raced = await readDefinition(db, defKey, version)
      if (raced) {
        if (raced.def_hash !== vendored.def_hash) {
          throw new Error(
            `registerVendoredDefinition: ${defKey} v${version} was concurrently registered with a different def_hash`,
          )
        }
        return { def: raced, created: false }
      }
    }
    throw new Error(`registerVendoredDefinition: insert failed for ${defKey} v${version}: ${error.message}`)
  }

  return { def: rowToDef(data), created: true }
}

/** One registered definition version. Null when not registered. */
export async function readDefinition(
  db: WorkflowDb,
  defKey: string,
  version: number,
): Promise<WorkflowDef | null> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_defs')
    .select(DEF_COLS)
    .eq('def_key', defKey)
    .eq('version', version)
    .maybeSingle()
  if (error) throw new Error(`readDefinition failed for ${defKey} v${version}: ${error.message}`)
  return data ? rowToDef(data) : null
}

/** The definition a given instance is pinned to. */
export async function readDefinitionById(db: WorkflowDb, defId: string): Promise<WorkflowDef> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_defs').select(DEF_COLS).eq('id', defId).single()
  if (error) throw new Error(`readDefinitionById failed for ${defId}: ${error.message}`)
  return rowToDef(data)
}

// ── Instances ────────────────────────────────────────────────────────────────

export interface InstantiateInput {
  defKey: string
  version: number
  projectId: string
  /** The natural key for this run of the workflow — '2026-11' for a month. */
  instanceKey: string
  actor: string
  reason: string
}

/**
 * Create an instance and its opening transition in one atomic call.
 *
 * The initial state comes from the pinned spec, not from the caller: letting a
 * caller name the starting state would let it skip the front of the workflow.
 */
export async function instantiate(
  db: WorkflowDb,
  input: InstantiateInput,
): Promise<WorkflowInstance> {
  const { def } = await registerVendoredDefinition(db, input.defKey, input.version)

  const { data, error } = await (db as AnyDb).rpc('workflow_instantiate', {
    p_def_id: def.id,
    p_project_id: input.projectId,
    p_instance_key: input.instanceKey,
    p_initial_state: def.spec.initial_state,
    p_actor: input.actor,
    p_reason: input.reason,
  })

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(
        `instantiate: ${input.defKey} already has an instance for "${input.instanceKey}"`,
      )
    }
    throw new Error(`instantiate failed for ${input.defKey}/${input.instanceKey}: ${error.message}`)
  }
  return rowToInstance(Array.isArray(data) ? data[0] : data)
}

export async function readInstance(db: WorkflowDb, id: string): Promise<WorkflowInstance | null> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_instances').select(INSTANCE_COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(`readInstance failed for ${id}: ${error.message}`)
  return data ? rowToInstance(data) : null
}

export async function readInstanceByKey(
  db: WorkflowDb,
  defKey: string,
  instanceKey: string,
): Promise<WorkflowInstance | null> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_instances').select(INSTANCE_COLS)
    .eq('def_key', defKey).eq('instance_key', instanceKey).maybeSingle()
  if (error) throw new Error(`readInstanceByKey failed for ${defKey}/${instanceKey}: ${error.message}`)
  return data ? rowToInstance(data) : null
}

/** Instances for a definition, newest first. Bounded. */
export async function listInstances(
  db: WorkflowDb,
  defKey: string,
  limit = 24,
): Promise<WorkflowInstance[]> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_instances').select(INSTANCE_COLS)
    .eq('def_key', defKey)
    .order('instance_key', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listInstances failed for ${defKey}: ${error.message}`)
  return ((data ?? []) as unknown[]).map(rowToInstance)
}

// ── Transitions ──────────────────────────────────────────────────────────────

/** Ordered history of one instance. `seq` is the authoritative order. */
export async function listTransitions(
  db: WorkflowDb,
  instanceId: string,
): Promise<WorkflowTransition[]> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_transitions').select(TRANSITION_COLS)
    .eq('instance_id', instanceId)
    .order('seq', { ascending: true })
  if (error) throw new Error(`listTransitions failed for ${instanceId}: ${error.message}`)
  return ((data ?? []) as unknown[]).map(rowToTransition)
}

export interface AppendTransitionInput {
  instanceId: string
  to: string
  reason: string
  actor: string
  evidenceRef?: string | null
  /** Required when the move crosses a state's declared human gate. */
  authorizationId?: string | null
  /**
   * Seam for the gate check. Production callers omit it and get the real
   * ledger-backed verifier; tests inject a stub so the machine's rules can be
   * exercised without a session or a database.
   *
   * There is no way to switch it OFF — an absent verifier means the DEFAULT one,
   * never "skip the check".
   */
  verifyAuthorization?: WorkflowAuthorizationVerifier
}

/**
 * Answers one question: may this authorization carry this instance across the
 * gate on its current state? Returns a reason, never a bare boolean, so a
 * refusal can say whether the grant was denied, expired or merely stale.
 */
export type WorkflowAuthorizationVerifier = (
  db: WorkflowDb,
  instanceId: string,
  authorizationId: string,
) => Promise<{ valid: boolean; status: string; reason: string }>

/**
 * Lazily imported to break a genuine cycle: lib/workflows/authorization.ts needs
 * this module's readers (instance, definition, evidence) to derive the pinned
 * target. Importing it at module scope here would make the two files
 * co-dependent at init time. The import is inside the call, so the cycle is
 * resolved by the time it runs and neither module needs restructuring.
 */
const defaultVerifier: WorkflowAuthorizationVerifier = async (db, instanceId, authorizationId) => {
  const { assertWorkflowAuthorizationValid } = await import('./authorization')
  return assertWorkflowAuthorizationValid(db, instanceId, authorizationId)
}

export class InvalidTransitionError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`invalid workflow transition: ${issues.join('; ')}`)
    this.name = 'InvalidTransitionError'
    this.issues = issues
  }
}

/**
 * Validate and append one transition.
 *
 * `from` is never taken from the caller — it is derived from the instance's own
 * history, so a caller cannot assert a state it is not in. The derived value is
 * then passed to the RPC, which re-checks it against the live row under a lock;
 * a move validated against a stale read fails there with a serialization error
 * instead of double-advancing the instance.
 */
export async function appendTransition(
  db: WorkflowDb,
  input: AppendTransitionInput,
): Promise<WorkflowTransition> {
  const instance = await readInstance(db, input.instanceId)
  if (!instance) throw new Error(`appendTransition: unknown instance ${input.instanceId}`)

  const def = await readDefinitionById(db, instance.def_id)
  const transitions = await listTransitions(db, instance.id)
  const derived = deriveCurrentState(def.spec, transitions)

  if (derived.current_state === null) {
    throw new InvalidTransitionError([`instance ${instance.id} has no transition history`])
  }

  const decision = validateTransition(
    def.spec,
    transitions,
    {
      from: derived.current_state,
      to: input.to,
      authorization_id: input.authorizationId ?? null,
    },
    instance.status,
  )
  if (!decision.ok) throw new InvalidTransitionError(decision.errors)

  // The machine has confirmed the move is graph-legal and, if gated, that an
  // authorization id was supplied. It cannot confirm the id MEANS anything —
  // that requires the ledger. Do it here, before any write.
  //
  // Failing closed is the point: an unreadable or unresolvable authorization is
  // refused, never assumed valid.
  if (decision.requires_authorization) {
    const authorizationId = input.authorizationId
    if (!authorizationId) {
      throw new InvalidTransitionError([`leaving "${derived.current_state}" requires an authorization`])
    }
    const verify = input.verifyAuthorization ?? defaultVerifier
    let assertion: Awaited<ReturnType<WorkflowAuthorizationVerifier>>
    try {
      assertion = await verify(db, instance.id, authorizationId)
    } catch (e) {
      throw new InvalidTransitionError([
        `authorization ${authorizationId} could not be verified: ${e instanceof Error ? e.message : 'unknown error'}`,
      ])
    }
    if (!assertion.valid) {
      throw new InvalidTransitionError([
        `authorization ${authorizationId} is not valid for this gate ` +
        `(${assertion.status}: ${assertion.reason})`,
      ])
    }
  }

  const { data, error } = await (db as AnyDb).rpc('workflow_append_transition', {
    p_instance_id: instance.id,
    p_from_state: derived.current_state,
    p_to_state: input.to,
    p_reason: input.reason,
    p_actor: input.actor,
    p_evidence_ref: input.evidenceRef ?? null,
    p_authorization_id: input.authorizationId ?? null,
  })
  if (error) {
    throw new Error(
      `appendTransition failed for ${instance.id} (${derived.current_state} → ${input.to}): ${error.message}`,
    )
  }
  return rowToTransition(Array.isArray(data) ? data[0] : data)
}

// ── Evidence ─────────────────────────────────────────────────────────────────

export interface RecordEvidenceInput {
  instanceId: string
  state: string
  checkKey: string
  result: EvidenceResult
  source: EvidenceSource
  detail?: Record<string, unknown>
  /** Attestation envelope. Required for `attested`, refused for `automated`. */
  attestation?: {
    producer: string
    producerType: string
    observedAt: string
    payloadHash: string
    targetHash: string
    metadata?: Record<string, unknown>
  }
}

/**
 * Append one verification record.
 *
 * `state` must be declared by the instance's pinned definition — evidence filed
 * against a state that does not exist is evidence nothing will ever read.
 */
export async function recordEvidence(
  db: WorkflowDb,
  input: RecordEvidenceInput,
): Promise<WorkflowEvidence> {
  const instance = await readInstance(db, input.instanceId)
  if (!instance) throw new Error(`recordEvidence: unknown instance ${input.instanceId}`)

  const def = await readDefinitionById(db, instance.def_id)
  if (getState(def.spec, input.state) === null) {
    throw new Error(
      `recordEvidence: state "${input.state}" is not declared by ${def.def_key} v${def.version}`,
    )
  }

  // An attested row without a producer is an assertion wearing evidence's
  // clothes; the database refuses it too, but failing here says why.
  if (input.source === 'attested' && !input.attestation) {
    throw new Error('recordEvidence: attested evidence requires an attestation envelope')
  }
  if (input.source === 'automated' && input.attestation) {
    throw new Error('recordEvidence: automated evidence must not carry an attestation envelope')
  }

  const { data, error } = await (db as AnyDb)
    .from('workflow_evidence')
    .insert({
      instance_id: input.instanceId,
      state: input.state,
      check_key: input.checkKey,
      result: input.result,
      source: input.source,
      detail: input.detail ?? {},
      producer: input.attestation?.producer ?? null,
      producer_type: input.attestation?.producerType ?? null,
      observed_at: input.attestation?.observedAt ?? null,
      payload_hash: input.attestation?.payloadHash ?? null,
      target_hash: input.attestation?.targetHash ?? null,
      attestation: input.attestation?.metadata ?? {},
    })
    .select(EVIDENCE_COLS)
    .single()
  if (error) throw new Error(`recordEvidence failed for ${input.instanceId}: ${error.message}`)
  return rowToEvidence(data)
}

/** Evidence for one instance, newest first. Bounded. */
export async function listEvidence(
  db: WorkflowDb,
  instanceId: string,
  limit = 200,
): Promise<WorkflowEvidence[]> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_evidence').select(EVIDENCE_COLS)
    .eq('instance_id', instanceId)
    .order('recorded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listEvidence failed for ${instanceId}: ${error.message}`)
  return ((data ?? []) as unknown[]).map(rowToEvidence)
}

// ── Scheduling (PR3) ─────────────────────────────────────────────────────────
//
// Every write here goes through an RPC that appends its own audit row, so a
// wake can be armed, replaced or cleared without any of it being silent.

/**
 * Arm (or replace) the instance's wake.
 *
 * A wake in the past is accepted and becomes immediately due — clock skew, a
 * paused project and a missed tick all produce one, and rejecting it would
 * strand the instance exactly when it needs attention. Terminal instances are
 * refused by the RPC.
 */
export async function scheduleWorkflowWake(
  db: WorkflowDb,
  instanceId: string,
  wakeAt: string,
  actor: string,
  reason: string,
): Promise<WorkflowInstance> {
  const { data, error } = await (db as AnyDb).rpc('workflow_schedule_wake', {
    p_instance_id: instanceId, p_wake_at: wakeAt, p_actor: actor, p_reason: reason,
  })
  if (error) throw new Error(`scheduleWorkflowWake failed for ${instanceId}: ${error.message}`)
  return rowToInstance(Array.isArray(data) ? data[0] : data)
}

/** Unschedule. Idempotent; only a real change is audited. */
export async function clearWorkflowWake(
  db: WorkflowDb, instanceId: string, actor: string, reason: string,
): Promise<WorkflowInstance> {
  const { data, error } = await (db as AnyDb).rpc('workflow_clear_wake', {
    p_instance_id: instanceId, p_actor: actor, p_reason: reason,
  })
  if (error) throw new Error(`clearWorkflowWake failed for ${instanceId}: ${error.message}`)
  return rowToInstance(Array.isArray(data) ? data[0] : data)
}

/**
 * Instances that are due, WITHOUT claiming them. Read-only: for the status
 * surface and for tests. The tick uses `claimDueWorkflowInstances`.
 */
export async function listDueWorkflowInstances(
  db: WorkflowDb, now: string, limit = 50,
): Promise<WorkflowInstance[]> {
  const { data, error } = await (db as AnyDb)
    .from('workflow_instances').select(INSTANCE_COLS)
    .eq('status', 'active')
    .not('wake_at', 'is', null)
    .lte('wake_at', now)
    .order('wake_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`listDueWorkflowInstances failed: ${error.message}`)
  return ((data ?? []) as unknown[]).map(rowToInstance)
}

/**
 * Claim due instances for evaluation.
 *
 * The claim PUSHES wake_at forward by the visibility window rather than clearing
 * it, so a crashed tick retries instead of losing the wake, and two concurrent
 * ticks partition the work through SKIP LOCKED instead of both taking the same
 * instance. Paused projects are filtered inside the RPC, at the lowest level.
 */
export async function claimDueWorkflowInstances(
  db: WorkflowDb, limit = 20, visibilitySeconds = 300,
): Promise<WorkflowInstance[]> {
  const { data, error } = await (db as AnyDb).rpc('workflow_claim_due', {
    p_limit: limit, p_visibility_seconds: visibilitySeconds,
  })
  if (error) throw new Error(`claimDueWorkflowInstances failed: ${error.message}`)
  return ((data ?? []) as unknown[]).map(rowToInstance)
}

/**
 * Record the result of one evaluation and set the next wake.
 * `nextWakeAt` of null leaves the instance unscheduled — the situation needs a
 * human, and re-checking every minute would change nothing.
 */
export async function recordWorkflowTick(
  db: WorkflowDb,
  instanceId: string,
  outcome: string,
  detail: Record<string, unknown>,
  nextWakeAt: string | null,
): Promise<void> {
  const { error } = await (db as AnyDb).rpc('workflow_record_tick', {
    p_instance_id: instanceId, p_outcome: outcome,
    p_detail: detail, p_next_wake_at: nextWakeAt,
  })
  if (error) throw new Error(`recordWorkflowTick failed for ${instanceId}: ${error.message}`)
}

// ── Row mapping ──────────────────────────────────────────────────────────────

function rowToDef(row: AnyDb): WorkflowDef {
  return {
    id: row.id,
    def_key: row.def_key,
    version: row.version,
    def_hash: row.def_hash,
    spec: row.spec as WorkflowSpec,
    created_at: row.created_at,
  }
}

function rowToInstance(row: AnyDb): WorkflowInstance {
  return {
    id: row.id,
    def_id: row.def_id,
    def_key: row.def_key,
    def_version: row.def_version,
    def_hash: row.def_hash,
    project_id: row.project_id,
    instance_key: row.instance_key,
    current_state: row.current_state,
    status: row.status,
    wake_at: row.wake_at ?? null,
    last_tick_at: row.last_tick_at ?? null,
    last_tick_outcome: row.last_tick_outcome ?? null,
    created_at: row.created_at,
    closed_at: row.closed_at ?? null,
  }
}

function rowToTransition(row: AnyDb): WorkflowTransition {
  return {
    id: row.id,
    seq: Number(row.seq),
    instance_id: row.instance_id,
    from_state: row.from_state ?? null,
    to_state: row.to_state,
    reason: row.reason,
    actor: row.actor,
    evidence_ref: row.evidence_ref ?? null,
    authorization_id: row.authorization_id ?? null,
    occurred_at: row.occurred_at,
  }
}

function rowToEvidence(row: AnyDb): WorkflowEvidence {
  return {
    id: row.id,
    instance_id: row.instance_id,
    state: row.state,
    check_key: row.check_key,
    result: row.result,
    source: row.source,
    detail: (row.detail ?? {}) as Record<string, unknown>,
    recorded_at: row.recorded_at,
    producer: row.producer ?? null,
    producer_type: row.producer_type ?? null,
    observed_at: row.observed_at ?? null,
    payload_hash: row.payload_hash ?? null,
    target_hash: row.target_hash ?? null,
    attestation: (row.attestation ?? {}) as Record<string, unknown>,
  }
}

/** Re-exported so callers never reach for a second copy of the hash function. */
export { computeDefHash }
