/**
 * lib/workflows/action-registry.ts — the ONE authoritative source of an action's
 * class.
 *
 * ── THE HOLE THIS CLOSES ────────────────────────────────────────────────────
 * PR9c took `actionClass` as an INPUT to createWorkflowActionRun. Because
 * authorization requirements are derived from the class, a caller could write
 *
 *     { actionKind: 'upload_protected_artifacts', actionClass: 'READ_ONLY' }
 *
 * and skip the human gate entirely: `ACTION_CLASS_POLICY.READ_ONLY
 * .requiresAuthorization` is false. The run would then be refused at execution
 * by the closed registry, but it would already exist — unauthorized, bound, and
 * indistinguishable in the ledger from a legitimate read. A class that a caller
 * can assert is not a policy input; it is a suggestion.
 *
 * The class now comes from here and nowhere else.
 *
 * ── WHY THE DEFINITION CANNOT SUPPLY IT ────────────────────────────────────
 * The canonical Familje-Stunden definition declares `automated_actions` as
 * `string[]` of Swedish PROSE — "Beräkna release_at_utc ur
 * canonical.release_instant_rule." There is no machine-readable action kind
 * anywhere in it. Inferring a class from that prose is exactly the mistake to
 * avoid: one mistranslated sentence would silently classify an upload as a read.
 *
 * So this registry is an explicit, hand-authored translation layer. Each entry
 * names the definition and state it belongs to, and `assertRegistryMatchesDefinition`
 * proves those states really exist and really declare automated work — a
 * consistency check, never an inference.
 *
 * ── ONE POLICY SYSTEM ──────────────────────────────────────────────────────
 * Retry budget, authorization requirement, pre-commit revalidation and
 * cancellation semantics are NOT stored here. They come from ACTION_CLASS_POLICY,
 * so there is exactly one place where "what does FINANCIAL require" is answered.
 */

import { ACTION_CLASS_POLICY, type ActionClass } from './action-target'
import { loadVendoredDefinitions } from './definitions'

/**
 * Which executor may ever run a kind.
 *
 * `not_executable` is not a to-do: it is a declaration that no executor exists
 * for this kind yet, and the PR9e read-only executor cannot accept it — enforced
 * at compile time by `ExecutableReadOnlyActionKind` below.
 */
export type ExecutorFamily = 'read_only_observation' | 'not_executable'

export interface CanonicalAction {
  readonly action_class: ActionClass
  readonly executor_family: ExecutorFamily
  /** The definition this action belongs to. */
  readonly def_key: string
  /** The state whose `automated_actions` this implements. */
  readonly state: string
  readonly description: string
}

/**
 * The closed registry. `as const` so the literal classes and families survive
 * into the type system — that is what makes the compile-time guard possible.
 */
export const ACTION_REGISTRY = {
  /**
   * Pure computation: derives the release instant from the month key using
   * `Intl` for DST. Consults no external system, needs no credential, and
   * reports `authoritative_system: null`. The first — and for now only —
   * executable action.
   */
  compute_release_instant: {
    action_class: 'READ_ONLY',
    executor_family: 'read_only_observation',
    def_key: 'familje-stunden.monthly-release',
    state: 'planning',
    description: 'Compute release_at_utc from the month key (DST-correct, no I/O).',
  },

  // ── Declared for future use. Metadata only: NOT executable. ───────────────
  // Present so the class of a known-dangerous kind is already pinned here
  // rather than being invented later by whoever first needs it, and so the
  // compile-time guard has something real to exclude.
  probe_anonymous_protected_access: {
    action_class: 'READ_ONLY',
    executor_family: 'not_executable',   // needs FAMILJE_STUNDEN_SUPABASE_URL first
    def_key: 'familje-stunden.monthly-release',
    state: 'approval_release',
    description: 'Probe both protected Edge Functions unauthenticated; expect 401.',
  },
  upload_protected_artifacts: {
    action_class: 'MATERIAL_WRITE',
    executor_family: 'not_executable',
    def_key: 'familje-stunden.monthly-release',
    state: 'protected_upload',
    description: 'Upload release artefacts to the private bucket with upsert=false.',
  },
  apply_release_gate_migration: {
    action_class: 'MATERIAL_WRITE',
    executor_family: 'not_executable',
    def_key: 'familje-stunden.monthly-release',
    state: 'backend_release_gate',
    description: 'Apply the idempotent month_releases migration.',
  },
  send_release_newsletter: {
    action_class: 'EXTERNAL_COMMUNICATION',
    executor_family: 'not_executable',
    def_key: 'familje-stunden.monthly-release',
    state: 'newsletter',
    description: 'Send the monthly newsletter. Unrecallable once sent.',
  },
  generate_page_audio: {
    action_class: 'FINANCIAL',
    executor_family: 'not_executable',
    def_key: 'familje-stunden.monthly-release',
    state: 'audio_generation',
    description: 'Generate page audio via TTS. Spends provider credits.',
  },
} as const satisfies Record<string, CanonicalAction>

export type ActionKind = keyof typeof ACTION_REGISTRY

/**
 * The kinds the PR9e read-only executor may accept.
 *
 * Derived from the registry literal, so adding a MATERIAL_WRITE handler to that
 * executor is a TYPE ERROR rather than a review catch. Today this resolves to
 * exactly `'compute_release_instant'`.
 */
export type ExecutableReadOnlyActionKind = {
  [K in ActionKind]: (typeof ACTION_REGISTRY)[K]['executor_family'] extends 'read_only_observation'
    ? (typeof ACTION_REGISTRY)[K]['action_class'] extends 'READ_ONLY' ? K : never
    : never
}[ActionKind]

export function isKnownActionKind(kind: string): kind is ActionKind {
  return Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, kind)
}

/**
 * The canonical metadata for a kind, or null when unknown.
 *
 * Deliberately returns null rather than a default: an unknown action has no
 * class, and inventing one — READ_ONLY least of all — is how a write gets
 * classified as a read.
 */
export function lookupAction(kind: string): CanonicalAction | null {
  return isKnownActionKind(kind) ? ACTION_REGISTRY[kind] : null
}

/** Runtime counterpart to the compile-time type. */
export function isExecutableReadOnly(kind: string): kind is ExecutableReadOnlyActionKind {
  const meta = lookupAction(kind)
  return meta?.executor_family === 'read_only_observation' && meta.action_class === 'READ_ONLY'
}

/** Everything derived from the class. One policy system, not two. */
export function derivedPolicyFor(kind: ActionKind) {
  const meta = ACTION_REGISTRY[kind]
  const policy = ACTION_CLASS_POLICY[meta.action_class]
  return {
    actionClass: meta.action_class,
    maxAttempts: policy.maxAttempts,
    requiresAuthorization: policy.requiresAuthorization,
    requiresSpendEnforcement: policy.requiresSpendEnforcement,
  }
}

export interface RegistryDefinitionMismatch {
  action_kind: string
  reason: 'definition_not_vendored' | 'state_not_in_definition' | 'state_declares_no_automated_action'
  detail: string
}

/**
 * Prove the registry and the canonical definitions agree.
 *
 * This is a CONSISTENCY check, never an inference: it verifies that each
 * registered action names a state that exists and that the definition agrees
 * some automated work happens there. It does not read the prose, and it never
 * derives a class from it.
 */
export function assertRegistryMatchesDefinition(): RegistryDefinitionMismatch[] {
  const defs = loadVendoredDefinitions()
  const mismatches: RegistryDefinitionMismatch[] = []

  for (const [kind, meta] of Object.entries(ACTION_REGISTRY) as [ActionKind, CanonicalAction][]) {
    const def = defs.find(d => d.def_key === meta.def_key)
    if (!def) {
      mismatches.push({ action_kind: kind, reason: 'definition_not_vendored',
        detail: `${meta.def_key} is not vendored in this build` })
      continue
    }
    const state = def.spec.states.find(s => s.id === meta.state)
    if (!state) {
      mismatches.push({ action_kind: kind, reason: 'state_not_in_definition',
        detail: `state "${meta.state}" does not exist in ${meta.def_key}` })
      continue
    }
    if (state.automated_actions.length === 0) {
      mismatches.push({ action_kind: kind, reason: 'state_declares_no_automated_action',
        detail: `state "${meta.state}" declares no automated_actions, so no action belongs to it` })
    }
  }
  return mismatches
}
