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
export type ExecutorFamily =
  | 'read_only_observation'
  /**
   * May change the world, under governance. Phase 2B-1.
   *
   * Naming a family is NOT permission to act: a kind reaches the governed path
   * only by ALSO appearing in `GOVERNED_EFFECT_ENABLED_KINDS` below. The two are
   * separate on purpose — the four Familje-Stunden write actions already carry
   * effectful CLASSES, so a family gate that keyed on class would have made an
   * upload and a newsletter live the moment this type gained a value.
   */
  | 'governed_effect'
  | 'not_executable'

/**
 * The kinds the governed-effect executor may actually run.
 *
 * A closed allowlist, deliberately separate from `executor_family`. Adding a kind
 * here is the decision that makes an irreversible act possible, and it should be
 * reviewed as such rather than inherited from a type widening.
 *
 * Today it holds exactly one entry, and that entry touches nothing: it is a
 * deterministic test action used to prove the governance path without a provider,
 * a credential or a product side effect.
 */
export const GOVERNED_EFFECT_ENABLED_KINDS = [
  'proof_governed_effect',
] as const

export type GovernedEffectEnabledKind = (typeof GOVERNED_EFFECT_ENABLED_KINDS)[number]

export function isGovernedEffectEnabled(kind: string): kind is GovernedEffectEnabledKind {
  return (GOVERNED_EFFECT_ENABLED_KINDS as readonly string[]).includes(kind)
}

/** One place a kind is declared: a definition and the state within it. */
export interface ActionPlacement {
  readonly def_key: string
  /** The state whose `automated_actions` this implements. */
  readonly state: string
}

export interface CanonicalAction {
  /**
   * The classification. SINGLE and canonical — it does NOT vary by placement.
   * An action that is READ_ONLY in one workflow and a write in another would
   * mean the class is a property of context rather than of the act, and every
   * guard downstream reads the class.
   */
  readonly action_class: ActionClass
  readonly executor_family: ExecutorFamily
  /**
   * Every definition+state this kind is declared in. A kind may legitimately
   * appear in more than one workflow — the same observation is the same act
   * wherever it is asked for — but its class travels with the kind, not the
   * placement.
   */
  readonly placements: readonly ActionPlacement[]
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
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'planning' }],
    description: 'Compute release_at_utc from the month key (DST-correct, no I/O).',
  },

  /**
   * Ask Familje-Stunden whether the authoritative release-gate row exists.
   *
   * READ_ONLY despite presenting a credential: it sends one POST whose only
   * effect is to read one row, it writes nothing anywhere, and repeating it
   * changes nothing. The credential is a scoped verification key that cannot
   * write in Familje-Stunden either — the privileged service_role stays inside
   * that system's own Edge Function.
   *
   * This is the only reachable answer to a FAIL-OPEN invariant: a month with no
   * `month_releases` row counts as released, and no other granted path
   * distinguishes "no row" from "row, already passed".
   */
  /**
   * Declared in TWO definitions, with ONE classification — the shape
   * `probe_anonymous_protected_access` already has.
   *
   * Familje-Stunden asks for it at `backend_release_gate`, where it is the
   * release safety check. `omnira.release-gate-proof` asks for the same
   * observation at `proof`, where it exists to establish one thing nothing else
   * can: that the deployed runtime holds a `FAMILJE_STUNDEN_VERIFY_KEY` the
   * remote actually accepts. A local check proves only that a string is set, and
   * the release placement is nine human gates away.
   *
   * The proof definition is an EXECUTOR HOST and nothing more: `authored_here`,
   * owning no product process, and unable to advance any Familje-Stunden state.
   * Its instance key IS the month — which is precisely why it is its own
   * definition rather than a second placement on `omnira.probe-validation`,
   * whose adapter states that its key is not a month.
   */
  observe_release_gate: {
    action_class: 'READ_ONLY',
    executor_family: 'read_only_observation',
    placements: [
      { def_key: 'familje-stunden.monthly-release', state: 'backend_release_gate' },
      { def_key: 'omnira.release-gate-proof',       state: 'proof' },
    ],
    description: 'Read the authoritative month_releases row presence and release_at.',
  },

  /**
   * Compose the canonical Monthly Brief for the instance's month.
   *
   * READ_ONLY on the repository's own terms rather than by analogy: it consults
   * no external system, holds no credential, spends nothing, writes nothing but
   * the evidence every observation writes, and running it twice produces the
   * same bytes. That is `compute_release_instant`'s profile exactly, and the
   * class table — not this comment — decides what it may do.
   *
   * It shares the `planning` state with `compute_release_instant` and does NOT
   * compete with it: both derive the release instant from the one
   * `computeReleaseInstant` function, so the two observations cannot disagree.
   * The brief answers a different question — what the month REQUIRES — and is
   * the input contract later production states will be measured against.
   */
  compose_monthly_brief: {
    action_class: 'READ_ONLY',
    executor_family: 'read_only_observation',
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'planning' }],
    description: 'Derive the canonical Monthly Brief v1 from the pinned contract (no I/O).',
  },

  /**
   * The governed-effect proof action. Phase 2B-1.
   *
   * FINANCIAL so that it exercises the strictest policy the class table has —
   * authorization, spend enforcement, pre-commit revalidation, idempotency and a
   * single attempt. Its handler spends nothing and calls nothing: the cost is a
   * deterministic constant and the "remote" is a switch over an instruction
   * carried by the proof instance's own key.
   *
   * It is placed on `omnira.execution-proof` and nowhere else. Omnira proving its
   * own governance must not require a Familje-Stunden state to become live, for
   * the same reason `omnira.release-gate-proof` exists as its own definition.
   */
  proof_governed_effect: {
    action_class: 'FINANCIAL',
    executor_family: 'governed_effect',
    placements: [{ def_key: 'omnira.execution-proof', state: 'effect' }],
    description: 'Deterministic governed-effect proof. No provider, no network, no real spend.',
  },

  /**
   * Generate the month's saga. Phase 2B-2.
   *
   * FINANCIAL, and the class table is the reason rather than the label: it calls
   * a paid model, so `ACTION_CLASS_POLICY.FINANCIAL` gives it authorization,
   * spend enforcement, pre-commit revalidation, idempotency and a single
   * attempt. A second attempt is a new intent, never a retry.
   *
   * It is deliberately ABSENT from `GOVERNED_EFFECT_ENABLED_KINDS`. The
   * machinery is complete and proven against a deterministic provider, but no
   * real model is wired and no first paid dispatch has been authorised. Adding
   * the kind to that list is the decision that makes real generation possible,
   * and it belongs to the phase that performs the first controlled run — not to
   * the one that builds the capability.
   */
  generate_monthly_story: {
    action_class: 'FINANCIAL',
    executor_family: 'governed_effect',
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'content_generation' }],
    description: "Generate the month's saga from the canonical brief and story contract.",
  },

  // ── Declared for future use. Metadata only: NOT executable. ───────────────
  // Present so the class of a known-dangerous kind is already pinned here
  // rather than being invented later by whoever first needs it, and so the
  // compile-time guard has something real to exclude.
  /**
   * Declared in TWO workflows, with ONE classification.
   *
   * Familje-Stunden asks for it at `approval_release`, where it is a release
   * safety check. Omnira's validation workflow asks for the same observation at
   * `probe`, where it is the capability test. Same act, same class, same
   * handler — reached in the canonical release only when that release genuinely
   * gets there, which is thirteen gates away and not something a test may fake.
   */
  probe_anonymous_protected_access: {
    action_class: 'READ_ONLY',
    executor_family: 'read_only_observation',
    placements: [
      { def_key: 'familje-stunden.monthly-release', state: 'approval_release' },
      { def_key: 'omnira.probe-validation',         state: 'probe' },
    ],
    description: 'Probe both protected Edge Functions unauthenticated; expect 401.',
  },
  upload_protected_artifacts: {
    action_class: 'MATERIAL_WRITE',
    executor_family: 'not_executable',
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'protected_upload' }],
    description: 'Upload release artefacts to the private bucket with upsert=false.',
  },
  apply_release_gate_migration: {
    action_class: 'MATERIAL_WRITE',
    executor_family: 'not_executable',
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'backend_release_gate' }],
    description: 'Apply the idempotent month_releases migration.',
  },
  send_release_newsletter: {
    action_class: 'EXTERNAL_COMMUNICATION',
    executor_family: 'not_executable',
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'newsletter' }],
    description: 'Send the monthly newsletter. Unrecallable once sent.',
  },
  generate_page_audio: {
    action_class: 'FINANCIAL',
    executor_family: 'not_executable',
    placements: [{ def_key: 'familje-stunden.monthly-release', state: 'audio_generation' }],
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
    for (const placement of meta.placements) {
      const def = defs.find(d => d.def_key === placement.def_key)
      if (!def) {
        mismatches.push({ action_kind: kind, reason: 'definition_not_vendored',
          detail: `${placement.def_key} is not vendored in this build` })
        continue
      }
      const state = def.spec.states.find(s => s.id === placement.state)
      if (!state) {
        mismatches.push({ action_kind: kind, reason: 'state_not_in_definition',
          detail: `state "${placement.state}" does not exist in ${placement.def_key}` })
        continue
      }
      if (state.automated_actions.length === 0) {
        mismatches.push({ action_kind: kind, reason: 'state_declares_no_automated_action',
          detail: `state "${placement.state}" declares no automated_actions, so no action belongs to it` })
      }
    }
  }
  return mismatches
}
