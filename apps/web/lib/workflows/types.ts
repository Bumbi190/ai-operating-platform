/**
 * lib/workflows/types.ts — the generic workflow domain.
 *
 * Familje-Stundens monthly release is the FIRST definition this engine runs, not
 * the engine's subject. Nothing in this file names a month, a theme, a voice, a
 * bucket or an access rule. If a type here ever needs to know what
 * `can_access_month` is, the boundary has been crossed.
 *
 * ── WHY snake_case ───────────────────────────────────────────────────────────
 * The rest of the app is camelCase. This module is deliberately not, because a
 * definition exists in three places at once: the canonical YAML, the `spec`
 * jsonb column, and the SQL that reads `s ->> 'id'` / `s -> 'next_state'` inside
 * workflow_append_transition(). One vocabulary across all three means the stored
 * document diffs directly against its source and no mapping layer can drift.
 * A rename here is a schema change, not a style choice.
 */

/** Retry behaviour a state declares. The engine does not execute retries in PR1. */
export type RetryPolicyId = 'none' | 'transient' | 'network' | 'never_auto'

export const RETRY_POLICY_IDS: readonly RetryPolicyId[] =
  ['none', 'transient', 'network', 'never_auto'] as const

export type EscalationSeverity = 'critical' | 'high' | 'medium' | 'low'

export const ESCALATION_SEVERITIES: readonly EscalationSeverity[] =
  ['critical', 'high', 'medium', 'low'] as const

/**
 * A human gate on a state. `required: false` still carries an optional
 * `gate_ref` — some states are unattended but are still governed by a named
 * hard gate, and losing that link would lose why the state exists.
 */
export interface WorkflowHumanGate {
  required: boolean
  approver: string | null
  decision: string | null
  gate_ref: string | null
}

export interface WorkflowStateSpec {
  id: string
  description: string
  /** States that must be complete before this one may be entered. */
  prerequisites: string[]
  inputs: string[]
  outputs: string[]
  automated_actions: string[]
  human_gate: WorkflowHumanGate
  verification: string[]
  /** Where a failure sends the instance. `null` only on a terminal state. */
  failure_transition: string | null
  retry_policy: RetryPolicyId
  /** The single successor on success. `null` marks a terminal state. */
  next_state: string | null
  notes: string | null
}

export interface WorkflowRetryPolicySpec {
  max_attempts: number
  backoff: 'exponential' | null
  initial_delay_s: number | null
  note: string | null
}

/**
 * A rule the orchestrator may never route around. PR1 records them and exposes
 * them for display; enforcement attaches per state in later phases.
 */
export interface WorkflowHardGateSpec {
  id: string
  rule: string
  /** State ids, or the wildcard 'all'. */
  enforced_at: string[]
  consumers: string[]
}

export interface WorkflowEscalationSpec {
  condition: string
  detail: string
  severity: EscalationSeverity
  reason: string | null
}

/**
 * The normalized, hashable definition. This exact object shape is what gets
 * stored in `workflow_defs.spec` and what `def_hash` is computed over.
 *
 * `canonical` is carried VERBATIM as opaque JSON. It holds facts the engine must
 * never interpret and an adapter must never re-derive — for the monthly release
 * that is the year's theme order, the page counts and the voice identity. The
 * engine transports them; it does not read them.
 */
export interface WorkflowSpec {
  def_key: string
  version: number
  status: string
  purpose: string
  source_of_truth: string
  derived_from: string[]
  canonical: Record<string, unknown>
  hard_gates: WorkflowHardGateSpec[]
  retry_policies: Record<RetryPolicyId, WorkflowRetryPolicySpec>
  states: WorkflowStateSpec[]
  escalation: WorkflowEscalationSpec[]
  /** Derived at parse time and validated unique: the only state with no predecessor. */
  initial_state: string
  /** Derived at parse time: every state with `next_state: null`. */
  terminal_states: string[]
}

// ── Instance-side domain ─────────────────────────────────────────────────────

export type WorkflowInstanceStatus = 'active' | 'complete' | 'abandoned'

export interface WorkflowTransition {
  id: string
  seq: number
  instance_id: string
  from_state: string | null
  to_state: string
  reason: string
  actor: string
  evidence_ref: string | null
  authorization_id: string | null
  occurred_at: string
}

export interface WorkflowInstance {
  id: string
  def_id: string
  def_key: string
  def_version: number
  def_hash: string
  project_id: string
  instance_key: string
  /** Projection of the transition history. Never trusted as the source of truth. */
  current_state: string
  status: WorkflowInstanceStatus
  /** When this instance next becomes eligible for evaluation. See schedule.ts. */
  wake_at: string | null
  /** Observability only — the authoritative record is in workflow_evidence. */
  last_tick_at: string | null
  last_tick_outcome: string | null
  created_at: string
  closed_at: string | null
}

/**
 * `blocked` (could not be produced) and `error` (produced something unusable) are
 * distinct from `fail` (a real negative finding). Only `fail` is evidence about
 * the world. `skipped` is the pre-PR5 vocabulary, retained so old rows stay valid.
 */
export type EvidenceResult = 'pass' | 'fail' | 'blocked' | 'error' | 'skipped'
/**
 * 'automated' — Omnira ran the check and owns the result.
 * 'attested'  — a human ran it elsewhere and reported the outcome. Most of the
 *               monthly release's verification is local (ffprobe, tsc, a click
 *               test) and unreachable from a serverless runtime, so the record
 *               must keep the two apart rather than flatten them into "passed".
 */
export type EvidenceSource = 'automated' | 'attested'

export interface WorkflowEvidence {
  id: string
  instance_id: string
  state: string
  check_key: string
  result: EvidenceResult
  source: EvidenceSource
  detail: Record<string, unknown>
  recorded_at: string
  // ── Attestation envelope (PR5). Null on automated and pre-PR5 rows. ──
  /** Who stated it. A credential name — never a secret, never an end user. */
  producer: string | null
  producer_type: string | null
  /** When the PRODUCER observed it, which is not when Omnira recorded it. */
  observed_at: string | null
  payload_hash: string | null
  /** The target this evidence was produced against. Moves → evidence goes stale. */
  target_hash: string | null
  attestation: Record<string, unknown>
}

/** Registered definition row. */
export interface WorkflowDef {
  id: string
  def_key: string
  version: number
  def_hash: string
  spec: WorkflowSpec
  created_at: string
}
