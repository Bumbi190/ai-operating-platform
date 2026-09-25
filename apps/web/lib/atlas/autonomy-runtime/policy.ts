/**
 * lib/atlas/autonomy-runtime/policy.ts — the ONE explicit per-ActionKind
 * autonomy policy.
 *
 * ── WHY THIS TABLE EXISTS ───────────────────────────────────────────────────
 * Chapter 18's autonomy levels and the workflow runtime's ActionClass are TWO
 * DIFFERENT VOCABULARIES (§18.18 "level is not scope"), and nothing may derive
 * one from the other. A rule shaped like
 *
 *     READ_ONLY => L0   FINANCIAL => L5   MATERIAL_WRITE => L3
 *
 * would be exactly that error. It would also be silently wrong in both
 * directions: `proof_governed_effect` is FINANCIAL yet touches no provider and
 * spends nothing, while `generate_monthly_story` is FINANCIAL and does both.
 * Class is a recovery property, not an autonomy requirement.
 *
 * So autonomy policy is stated PER ACTION KIND, explicitly, here.
 *
 * ── CLOSED BY CONSTRUCTION ──────────────────────────────────────────────────
 * `Record<ActionKind, AutonomyRuntimePolicy>` is exhaustive over the canonical
 * registry. Adding an ActionKind to `ACTION_REGISTRY` therefore FAILS
 * type-checking until this table gains a reviewed entry for it — the review is
 * the mechanism, not a hope. There is deliberately NO default branch and no
 * `Partial<Record<...>>`: a missing entry must be a compile error, never a
 * runtime fallback to something permissive.
 *
 * ── WHAT `license_exempt_observation` DOES AND DOES NOT MEAN ────────────────
 * Owner ruling (Phase 3B0): a canonical READ_ONLY observation does NOT require
 * an active Autonomy License. That is NOT because L0 grants execution. It means
 * the Autonomy License is not the authority governing these low-impact
 * observations at all — consistent with §18.187 ("avoid unnecessary licenses for
 * actions that are Read-only. Internal. Reversible. Low risk.") and §18.161,
 * where even a QUARANTINED licence permits read-only operation.
 *
 * An exempt entry therefore means "the autonomy layer adds NO licence refusal".
 * It does NOT authorize the action. Every existing control still applies:
 * canonical ActionKind, ActionClass, executor-family allowlist, workflow
 * placement, project state, stop authority, evidence and target rules, and the
 * capability boundaries.
 *
 * ── THE EXEMPTION IS EXPLICIT, NEVER DYNAMIC ────────────────────────────────
 * This is deliberately NOT a predicate like `action_class === 'READ_ONLY'`.
 * Such a rule would silently exempt every future READ_ONLY kind — including one
 * whose effect nobody reviewed. Each exempt kind is named, so a new observation
 * requires an explicit edit here. A guard test asserts that the exempt set is
 * exactly the reviewed list and that each entry's registry metadata still agrees.
 */

import { ACTION_REGISTRY, type ActionKind } from '@/lib/workflows/action-registry'
import type { AutonomyLicenseLevel } from '@/lib/atlas/autonomy-license/levels'

/**
 * The three policy modes. Closed, and exhaustive by construction.
 */
export type AutonomyPolicyMode =
  | 'license_exempt_observation'
  | 'licensed'
  | 'unsupported'

/** Why an action is `unsupported`. Closed, so a refusal is always explainable. */
export type UnsupportedReason =
  /** V1 licence scope cannot represent what this effect needs. */
  | 'v1_scope_incomplete'
  /** No executor exists for this kind. Enablement is not authority. */
  | 'not_executable'

/** Why an observation is licence-exempt, for the audit trail. */
export type ExemptionReason =
  /** Canonical READ_ONLY observation; §18.187 keeps licences off these. */
  | 'canonical_read_only_observation'

interface ExemptPolicy {
  readonly mode: 'license_exempt_observation'
  readonly exemptionReason: ExemptionReason
  /** Always L0: the semantic floor of "observe". */
  readonly minimumLevel: 'L0'
  /** Always false — no licence is consulted, so none is required. */
  readonly requiresLicence: false
}

interface LicensedPolicy {
  readonly mode: 'licensed'
  /** The lowest effective autonomy at which this kind may be admitted. */
  readonly minimumLevel: AutonomyLicenseLevel
  readonly requiresLicence: true
  /** The review that set this level. Canon does not supply it; a human did. */
  readonly levelBasis: string
}

interface UnsupportedPolicy {
  readonly mode: 'unsupported'
  readonly unsupportedReason: UnsupportedReason
  /** Why it is unsupported, in full. Never a bare code in the audit trail. */
  readonly detail: string
}

export type AutonomyRuntimePolicy = ExemptPolicy | LicensedPolicy | UnsupportedPolicy

/**
 * The currently reviewed canonical READ_ONLY observation kinds.
 *
 * Kept as a literal tuple so the guard tests can assert the exempt set is
 * exactly this, rather than inferring it from the table.
 */
export const LICENCE_EXEMPT_OBSERVATION_KINDS = [
  'compose_monthly_brief',
  'compute_release_instant',
  'observe_github_merge_sha_match',
  'observe_github_pr_checks_green',
  'observe_github_pr_merged',
  'observe_release_gate',
  'observe_vercel_deploy_sha_match',
  'observe_vercel_production_alias',
  'observe_vercel_production_ready',
  'probe_anonymous_protected_access',
  'validate_monthly_story',
] as const satisfies readonly ActionKind[]

/** The kinds with no executor. Listed so the table's `unsupported` set is pinned. */
export const NOT_EXECUTABLE_KINDS = [
  'apply_release_gate_migration',
  'generate_page_audio',
  'send_release_newsletter',
  'upload_protected_artifacts',
] as const satisfies readonly ActionKind[]

const exempt = (): ExemptPolicy => ({
  mode: 'license_exempt_observation',
  exemptionReason: 'canonical_read_only_observation',
  minimumLevel: 'L0',
  requiresLicence: false,
})

/**
 * The table. Every canonical ActionKind, exactly once, with no default branch.
 *
 * If TypeScript reports a missing property here, that is the review gate
 * working: a new action kind has appeared and its autonomy policy must be
 * decided deliberately before it can be admitted by anything.
 */
export const AUTONOMY_RUNTIME_POLICY: Record<ActionKind, AutonomyRuntimePolicy> = {
  // ── Licence-exempt canonical observations ────────────────────────────────
  compose_monthly_brief: exempt(),
  compute_release_instant: exempt(),
  observe_github_merge_sha_match: exempt(),
  observe_github_pr_checks_green: exempt(),
  observe_github_pr_merged: exempt(),
  observe_release_gate: exempt(),
  observe_vercel_deploy_sha_match: exempt(),
  observe_vercel_production_alias: exempt(),
  observe_vercel_production_ready: exempt(),
  probe_anonymous_protected_access: exempt(),
  validate_monthly_story: exempt(),

  // ── Licensed ─────────────────────────────────────────────────────────────
  proof_governed_effect: {
    mode: 'licensed',
    minimumLevel: 'L3',
    requiresLicence: true,
    // L3 (Execute Internally), §18.14 — not L5. Its FINANCIAL ActionClass
    // exists to exercise the strictest governance policy in the runtime, and
    // reading that class as "so it needs L5" would be the ActionClass →
    // AutonomyLevel mapping this table exists to prevent. The effect is
    // deterministic and internal: no provider, no network, no real spend.
    levelBasis: '§18.14 Execute Internally — deterministic internal effect, no provider and no spend',
  },

  // ── Unsupported ──────────────────────────────────────────────────────────
  generate_monthly_story: {
    mode: 'unsupported',
    unsupportedReason: 'v1_scope_incomplete',
    // V1 licences persist: project, workflow instance, bound definition,
    // licensed level, and an ActionKind set. They do NOT persist provider,
    // model, tool/channel or financial-amount scope. This effect needs those
    // dimensions, so no level can make it admissible — see the anti-compensation
    // test. NOT assigned L2 or L5 to make the table total: a high-level licence
    // must never overcome a missing scope dimension (§18.55/§18.60 spirit).
    detail:
      'V1 Autonomy License scope cannot represent the provider, model and financial amount '
      + 'dimensions this real paid-provider effect requires',
  },
  apply_release_gate_migration: {
    mode: 'unsupported',
    unsupportedReason: 'not_executable',
    detail: 'No executor exists for this kind; executor enablement is not autonomy authority',
  },
  generate_page_audio: {
    mode: 'unsupported',
    unsupportedReason: 'not_executable',
    detail: 'No executor exists for this kind; executor enablement is not autonomy authority',
  },
  send_release_newsletter: {
    mode: 'unsupported',
    unsupportedReason: 'not_executable',
    detail: 'No executor exists for this kind; executor enablement is not autonomy authority',
  },
  upload_protected_artifacts: {
    mode: 'unsupported',
    unsupportedReason: 'not_executable',
    detail: 'No executor exists for this kind; executor enablement is not autonomy authority',
  },
}

/**
 * The policy for a kind, or `null` when the kind is not in the canonical
 * registry at all.
 *
 * Returns null rather than a default for the same reason `lookupAction` does:
 * an unknown action has no policy, and inventing one — least of all an exempt
 * one — is how an unreviewed action acquires authority.
 */
export function autonomyPolicyFor(kind: string): AutonomyRuntimePolicy | null {
  return Object.prototype.hasOwnProperty.call(AUTONOMY_RUNTIME_POLICY, kind)
    ? AUTONOMY_RUNTIME_POLICY[kind as ActionKind]
    : null
}

/** The canonical registry metadata a policy entry must agree with. */
export function registryMetadataFor(kind: string): {
  actionClass: string
  executorFamily: string
} | null {
  const meta = Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, kind)
    ? ACTION_REGISTRY[kind as ActionKind]
    : null
  return meta ? { actionClass: meta.action_class, executorFamily: meta.executor_family } : null
}
