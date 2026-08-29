/**
 * lib/workflows/spec.ts — parse, validate and normalize a workflow definition.
 *
 * A definition is DATA THAT GOVERNS PRODUCTION. It decides that the release gate
 * must be applied before anything is uploaded, and that no communication goes out
 * before two separate QA passes. A malformed definition is therefore not a
 * developer inconvenience — it is a governance failure — so this parser refuses
 * everything it cannot positively prove correct, and returns every problem it
 * found rather than the first.
 *
 * ── REJECT UNKNOWN KEYS ──────────────────────────────────────────────────────
 * `lib/atlas/executive/canonicalize.ts` reconstructs objects and silently DROPS
 * unknown keys, which is right for untrusted HTTP where extra input is noise.
 * It is wrong here. A definition is a vendored copy of an upstream file: an
 * unrecognised key means upstream added something this engine does not
 * understand, and dropping it would let the copy diverge silently while the hash
 * kept saying "unchanged". So this module uses the primitives from that file but
 * a STRICT object reader of its own.
 */

import { canonicalJson } from '@/lib/atlas/mission/binding'
import { createHash } from 'node:crypto'
import {
  ESCALATION_SEVERITIES,
  RETRY_POLICY_IDS,
  type EscalationSeverity,
  type RetryPolicyId,
  type WorkflowEscalationSpec,
  type WorkflowHardGateSpec,
  type WorkflowHumanGate,
  type WorkflowRetryPolicySpec,
  type WorkflowSpec,
  type WorkflowStateSpec,
} from './types'

export type SpecParseResult =
  | { ok: true; spec: WorkflowSpec; errors: [] }
  | { ok: false; spec: null; errors: string[] }

// ── Strict readers ───────────────────────────────────────────────────────────

type Bag = Record<string, unknown>

function isPlainObject(v: unknown): v is Bag {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Record every key the caller did not claim. Called after all reads for a level. */
function rejectUnknownKeys(obj: Bag, claimed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!claimed.includes(key)) {
      errors.push(`${path}: unknown key "${key}" — the definition declares something this engine does not model`)
    }
  }
}

function readString(obj: Bag, key: string, path: string, errors: string[]): string {
  const v = obj[key]
  if (typeof v !== 'string' || v.trim().length === 0) {
    errors.push(`${path}.${key}: required non-empty string`)
    return ''
  }
  return v
}

function readOptionalString(obj: Bag, key: string, path: string, errors: string[]): string | null {
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return null
  const v = obj[key]
  if (typeof v !== 'string') {
    errors.push(`${path}.${key}: must be a string or absent`)
    return null
  }
  return v
}

function readStringArray(obj: Bag, key: string, path: string, errors: string[]): string[] {
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return []
  const v = obj[key]
  if (!Array.isArray(v)) {
    errors.push(`${path}.${key}: must be an array of strings`)
    return []
  }
  const out: string[] = []
  v.forEach((entry, i) => {
    if (typeof entry !== 'string') errors.push(`${path}.${key}[${i}]: must be a string`)
    else out.push(entry)
  })
  return out
}

function readInteger(obj: Bag, key: string, path: string, errors: string[]): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    errors.push(`${path}.${key}: required integer`)
    return 0
  }
  return v
}

// ── Fragment parsers ─────────────────────────────────────────────────────────

const HUMAN_GATE_KEYS = ['required', 'approver', 'decision', 'gate_ref']

function parseHumanGate(raw: unknown, path: string, errors: string[]): WorkflowHumanGate {
  if (!isPlainObject(raw)) {
    errors.push(`${path}: required object`)
    return { required: false, approver: null, decision: null, gate_ref: null }
  }
  rejectUnknownKeys(raw, HUMAN_GATE_KEYS, path, errors)
  const required = raw.required
  if (typeof required !== 'boolean') errors.push(`${path}.required: required boolean`)
  return {
    required: typeof required === 'boolean' ? required : false,
    approver: readOptionalString(raw, 'approver', path, errors),
    decision: readOptionalString(raw, 'decision', path, errors),
    gate_ref: readOptionalString(raw, 'gate_ref', path, errors),
  }
}

const STATE_KEYS = [
  'id', 'description', 'prerequisites', 'inputs', 'outputs', 'automated_actions',
  'human_gate', 'verification', 'failure_transition', 'retry_policy', 'next_state', 'notes',
]

function parseState(raw: unknown, index: number, errors: string[]): WorkflowStateSpec {
  const path = `states[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(`${path}: required object`)
    return blankState()
  }
  rejectUnknownKeys(raw, STATE_KEYS, path, errors)

  const retryRaw = raw.retry_policy
  let retry_policy: RetryPolicyId = 'none'
  if (typeof retryRaw !== 'string' || !RETRY_POLICY_IDS.includes(retryRaw as RetryPolicyId)) {
    errors.push(`${path}.retry_policy: must be one of ${RETRY_POLICY_IDS.join(', ')}`)
  } else {
    retry_policy = retryRaw as RetryPolicyId
  }

  return {
    id: readString(raw, 'id', path, errors),
    description: readString(raw, 'description', path, errors),
    prerequisites: readStringArray(raw, 'prerequisites', path, errors),
    inputs: readStringArray(raw, 'inputs', path, errors),
    outputs: readStringArray(raw, 'outputs', path, errors),
    automated_actions: readStringArray(raw, 'automated_actions', path, errors),
    human_gate: parseHumanGate(raw.human_gate, `${path}.human_gate`, errors),
    verification: readStringArray(raw, 'verification', path, errors),
    failure_transition: readOptionalString(raw, 'failure_transition', path, errors),
    retry_policy,
    next_state: readOptionalString(raw, 'next_state', path, errors),
    notes: readOptionalString(raw, 'notes', path, errors),
  }
}

function blankState(): WorkflowStateSpec {
  return {
    id: '', description: '', prerequisites: [], inputs: [], outputs: [],
    automated_actions: [], human_gate: { required: false, approver: null, decision: null, gate_ref: null },
    verification: [], failure_transition: null, retry_policy: 'none', next_state: null, notes: null,
  }
}

const HARD_GATE_KEYS = ['id', 'rule', 'enforced_at', 'consumers']

function parseHardGate(raw: unknown, index: number, errors: string[]): WorkflowHardGateSpec {
  const path = `hard_gates[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(`${path}: required object`)
    return { id: '', rule: '', enforced_at: [], consumers: [] }
  }
  rejectUnknownKeys(raw, HARD_GATE_KEYS, path, errors)
  return {
    id: readString(raw, 'id', path, errors),
    rule: readString(raw, 'rule', path, errors),
    enforced_at: readStringArray(raw, 'enforced_at', path, errors),
    consumers: readStringArray(raw, 'consumers', path, errors),
  }
}

const ESCALATION_KEYS = ['condition', 'detail', 'severity', 'reason']

function parseEscalation(raw: unknown, index: number, errors: string[]): WorkflowEscalationSpec {
  const path = `escalation[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(`${path}: required object`)
    return { condition: '', detail: '', severity: 'high', reason: null }
  }
  rejectUnknownKeys(raw, ESCALATION_KEYS, path, errors)
  const sev = raw.severity
  if (typeof sev !== 'string' || !ESCALATION_SEVERITIES.includes(sev as EscalationSeverity)) {
    errors.push(`${path}.severity: must be one of ${ESCALATION_SEVERITIES.join(', ')}`)
  }
  return {
    condition: readString(raw, 'condition', path, errors),
    detail: readString(raw, 'detail', path, errors),
    severity: (typeof sev === 'string' && ESCALATION_SEVERITIES.includes(sev as EscalationSeverity)
      ? sev as EscalationSeverity
      : 'high'),
    reason: readOptionalString(raw, 'reason', path, errors),
  }
}

const RETRY_KEYS = ['max_attempts', 'backoff', 'initial_delay_s', 'note']

function parseRetryPolicy(raw: unknown, id: string, errors: string[]): WorkflowRetryPolicySpec {
  const path = `retry_policies.${id}`
  if (!isPlainObject(raw)) {
    errors.push(`${path}: required object`)
    return { max_attempts: 1, backoff: null, initial_delay_s: null, note: null }
  }
  rejectUnknownKeys(raw, RETRY_KEYS, path, errors)

  const max_attempts = readInteger(raw, 'max_attempts', path, errors)
  if (max_attempts < 1) errors.push(`${path}.max_attempts: must be >= 1`)

  let backoff: 'exponential' | null = null
  if ('backoff' in raw && raw.backoff !== null && raw.backoff !== undefined) {
    if (raw.backoff !== 'exponential') errors.push(`${path}.backoff: only "exponential" is modelled`)
    else backoff = 'exponential'
  }

  let initial_delay_s: number | null = null
  if ('initial_delay_s' in raw && raw.initial_delay_s !== null && raw.initial_delay_s !== undefined) {
    if (typeof raw.initial_delay_s !== 'number' || !Number.isInteger(raw.initial_delay_s) || raw.initial_delay_s < 0) {
      errors.push(`${path}.initial_delay_s: must be a non-negative integer`)
    } else {
      initial_delay_s = raw.initial_delay_s
    }
  }

  // A backoff curve with no starting delay is not a policy, it is half of one.
  if (backoff !== null && initial_delay_s === null) {
    errors.push(`${path}: backoff "${backoff}" declared without initial_delay_s`)
  }
  if (backoff === null && initial_delay_s !== null) {
    errors.push(`${path}: initial_delay_s declared without a backoff strategy`)
  }
  // Retrying once, with a delay, is a contradiction the caller should see.
  if (max_attempts === 1 && (backoff !== null || initial_delay_s !== null)) {
    errors.push(`${path}: max_attempts 1 leaves no retry for backoff/initial_delay_s to govern`)
  }

  return {
    max_attempts: max_attempts < 1 ? 1 : max_attempts,
    backoff,
    initial_delay_s,
    note: readOptionalString(raw, 'note', path, errors),
  }
}

// ── Graph validation ─────────────────────────────────────────────────────────

/**
 * Walk `next_state` from the single entry state. Returns the chain position of
 * each state, which every later rule is expressed against: "backward" and
 * "precedes" are meaningless without it.
 */
function buildChain(
  states: WorkflowStateSpec[],
  initial: string,
  errors: string[],
): Map<string, number> {
  const byId = new Map(states.map(s => [s.id, s]))
  const index = new Map<string, number>()
  let cursor: string | null = initial
  let position = 0

  while (cursor !== null) {
    if (index.has(cursor)) {
      errors.push(`states: next_state cycle detected at "${cursor}" — the success path must be acyclic`)
      break
    }
    index.set(cursor, position++)
    const state = byId.get(cursor)
    if (!state) break                       // unknown-reference rule already reported it
    cursor = state.next_state
  }
  return index
}

// ── Entry point ──────────────────────────────────────────────────────────────

const SPEC_KEYS = [
  'ID', 'version', 'status', 'purpose', 'source_of_truth', 'derived_from',
  'canonical', 'hard_gates', 'retry_policies', 'states', 'escalation',
]

/**
 * Parse a raw definition document (the JSON form of the canonical YAML).
 *
 * Total: never throws, never returns a partially-valid spec. `ok: false` means
 * the definition must not be registered.
 */
export function parseWorkflowSpec(raw: unknown): SpecParseResult {
  const errors: string[] = []

  if (!isPlainObject(raw)) {
    return { ok: false, spec: null, errors: ['definition: required object'] }
  }
  rejectUnknownKeys(raw, SPEC_KEYS, 'definition', errors)

  const def_key = readString(raw, 'ID', 'definition', errors)
  const version = readInteger(raw, 'version', 'definition', errors)
  if (version < 1) errors.push('definition.version: must be >= 1')

  // Read every top-level scalar HERE, not in the success return. Anything read
  // after the `errors.length > 0` gate below can push an error that is never
  // surfaced — the parser would report ok:true while having found a problem.
  const status          = readString(raw, 'status', 'definition', errors)
  const purpose         = readString(raw, 'purpose', 'definition', errors)
  const source_of_truth = readString(raw, 'source_of_truth', 'definition', errors)
  const derived_from    = readStringArray(raw, 'derived_from', 'definition', errors)

  const statesRaw = raw.states
  if (!Array.isArray(statesRaw) || statesRaw.length === 0) {
    errors.push('definition.states: required non-empty array')
    return { ok: false, spec: null, errors }
  }
  const states = statesRaw.map((s, i) => parseState(s, i, errors))

  // ── duplicate ids ──
  const seen = new Set<string>()
  for (const s of states) {
    if (s.id === '') continue
    if (seen.has(s.id)) errors.push(`states: duplicate state id "${s.id}"`)
    seen.add(s.id)
  }
  const known = seen

  // ── retry policies ──
  const retryRaw = raw.retry_policies
  const retry_policies = {} as Record<RetryPolicyId, WorkflowRetryPolicySpec>
  if (!isPlainObject(retryRaw)) {
    errors.push('definition.retry_policies: required object')
  } else {
    rejectUnknownKeys(retryRaw, [...RETRY_POLICY_IDS], 'retry_policies', errors)
    for (const id of RETRY_POLICY_IDS) {
      if (!(id in retryRaw)) {
        errors.push(`retry_policies.${id}: missing — every modelled policy must be declared`)
        continue
      }
      retry_policies[id] = parseRetryPolicy(retryRaw[id], id, errors)
    }
  }

  // ── unknown state references ──
  for (const s of states) {
    if (s.next_state !== null && !known.has(s.next_state)) {
      errors.push(`states."${s.id}".next_state: unknown state "${s.next_state}"`)
    }
    if (s.failure_transition !== null && !known.has(s.failure_transition)) {
      errors.push(`states."${s.id}".failure_transition: unknown state "${s.failure_transition}"`)
    }
    for (const p of s.prerequisites) {
      if (!known.has(p)) errors.push(`states."${s.id}".prerequisites: unknown state "${p}"`)
      if (p === s.id) errors.push(`states."${s.id}".prerequisites: a state cannot be its own prerequisite`)
    }
  }

  // ── entry and terminal states ──
  const successors = new Set(states.map(s => s.next_state).filter((v): v is string => v !== null))
  const entries = states.filter(s => s.id !== '' && !successors.has(s.id)).map(s => s.id)
  if (entries.length !== 1) {
    errors.push(
      `states: exactly one entry state is required (a state that is no other state's next_state); found ${entries.length}` +
      (entries.length > 0 ? ` — ${entries.join(', ')}` : ''),
    )
  }
  const terminal_states = states.filter(s => s.id !== '' && s.next_state === null).map(s => s.id)
  if (terminal_states.length === 0) {
    errors.push('states: at least one terminal state (next_state: null) is required')
  }

  const initial_state = entries[0] ?? ''
  const chain = initial_state ? buildChain(states, initial_state, errors) : new Map<string, number>()

  // Every state must sit on the success path. An unreachable state is either a
  // typo or dead governance — both must be fixed before the definition runs.
  if (initial_state) {
    for (const s of states) {
      if (s.id !== '' && !chain.has(s.id)) {
        errors.push(`states."${s.id}": unreachable — not on the next_state path from "${initial_state}"`)
      }
    }
  }

  // ── failure transitions and prerequisites, expressed against chain order ──
  for (const s of states) {
    if (s.id === '' || !chain.has(s.id)) continue
    const here = chain.get(s.id)!
    const isTerminal = s.next_state === null

    if (isTerminal) {
      if (s.failure_transition !== null) {
        errors.push(`states."${s.id}".failure_transition: a terminal state must not declare one`)
      }
    } else if (s.failure_transition === null) {
      errors.push(`states."${s.id}".failure_transition: required on a non-terminal state — a failure with nowhere to go strands the instance`)
    } else if (chain.has(s.failure_transition)) {
      const target = chain.get(s.failure_transition)!
      // Self and backward are the retry loops the model is built on. Forward is
      // allowed ONLY to the state's own successor (scheduled_release routes a
      // missed instant into post_release_qa, which detects and escalates it).
      // Anything further forward would let a failure SKIP work.
      if (target > here && s.failure_transition !== s.next_state) {
        errors.push(
          `states."${s.id}".failure_transition: "${s.failure_transition}" is further forward than next_state ` +
          `"${s.next_state}" — a failure may not skip states`,
        )
      }
    }

    for (const p of s.prerequisites) {
      if (!chain.has(p)) continue
      if (chain.get(p)! >= here) {
        errors.push(`states."${s.id}".prerequisites: "${p}" does not precede it on the success path and can never be satisfied`)
      }
    }
  }

  // ── hard gates ──
  const hardGatesRaw = raw.hard_gates
  let hard_gates: WorkflowHardGateSpec[] = []
  if (hardGatesRaw !== undefined && hardGatesRaw !== null) {
    if (!Array.isArray(hardGatesRaw)) errors.push('definition.hard_gates: must be an array')
    else hard_gates = hardGatesRaw.map((g, i) => parseHardGate(g, i, errors))
  }
  for (const g of hard_gates) {
    for (const at of g.enforced_at) {
      if (at !== 'all' && !known.has(at)) {
        errors.push(`hard_gates."${g.id}".enforced_at: unknown state "${at}"`)
      }
    }
  }
  const gateIds = new Set(hard_gates.map(g => g.id))
  for (const s of states) {
    if (s.human_gate.gate_ref !== null && !gateIds.has(s.human_gate.gate_ref)) {
      errors.push(`states."${s.id}".human_gate.gate_ref: unknown hard gate "${s.human_gate.gate_ref}"`)
    }
  }

  // ── escalation ──
  const escalationRaw = raw.escalation
  let escalation: WorkflowEscalationSpec[] = []
  if (escalationRaw !== undefined && escalationRaw !== null) {
    if (!Array.isArray(escalationRaw)) errors.push('definition.escalation: must be an array')
    else escalation = escalationRaw.map((e, i) => parseEscalation(e, i, errors))
  }

  // ── canonical block: carried verbatim, validated only as JSON-safe ──
  const canonicalRaw = raw.canonical
  let canonical: Record<string, unknown> = {}
  if (canonicalRaw !== undefined && canonicalRaw !== null) {
    if (!isPlainObject(canonicalRaw)) errors.push('definition.canonical: must be an object')
    else canonical = canonicalRaw
  }

  if (errors.length > 0) return { ok: false, spec: null, errors }

  return {
    ok: true,
    errors: [],
    spec: {
      def_key,
      version,
      status,
      purpose,
      source_of_truth,
      derived_from,
      canonical,
      hard_gates,
      retry_policies,
      states,
      escalation,
      initial_state,
      terminal_states,
    },
  }
}

/**
 * SHA-256 over the canonical serialization of the normalized spec.
 *
 * Uses `canonicalJson` from the Mission binding module rather than a second
 * implementation — that file's own warning applies here verbatim: two
 * canonicalizers over the same data are two answers waiting to disagree.
 *
 * Because normalization turns every absent optional into an explicit `null`,
 * reformatting the source YAML cannot move the hash while any change to a
 * modelled value must.
 */
export function computeDefHash(spec: WorkflowSpec): string {
  return createHash('sha256').update(canonicalJson(spec)).digest('hex')
}
