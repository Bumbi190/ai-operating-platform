/**
 * Phase 1A — pure types for translating a canonical `WorkPackage` (Chapter 21,
 * `lib/atlas/workpackage/types.ts`, itself descended from a `MissionRecord`
 * via a `DelegationEnvelope`) into SDF-1A's `CodeWorkAdmissionV1`.
 *
 * This module carries no I/O, no clocks, no registries and no validation
 * logic. It exists only so `translate.ts` and its tests share one vocabulary.
 *
 * STORED CONTRACT vs. LIVE USABILITY — read this before treating a
 * `WorkPackage`'s own fields as proof of anything. A `WorkPackage`'s
 * `authority`/`allowedActions`/`forbiddenActions`/`tools`/`dataScope` are
 * CONTRACT DATA: terms written down when the package was cut from its
 * Delegation Envelope. They do not, by themselves, prove the package is
 * still usable right now — the Delegation behind it may since have been
 * revoked, the Mission behind that may have ended, or the assigned role may
 * no longer resolve. `lib/atlas/workpackage/principal-read.ts`'s
 * `resolveWorkPackage()` is the only thing that re-asks that live chain, and
 * it is `server-only` and does real reads — this translator must never
 * import or call it. Instead, `translateWorkPackageToAdmission` takes the
 * already-resolved `WorkPackageEvaluation` its caller obtained from
 * `resolveWorkPackage()` (the exact same object
 * `control-plane/principal-write.ts`'s `proposeCodeWork` already requires
 * `.usable === true` on before it will derive anything), and refuses to
 * translate an evaluation that isn't usable — synchronously, from a field
 * already on the object it was handed, adding no I/O of its own.
 *

 * WHY THIS BINDINGS SHAPE DIFFERS FROM docs/autonomy/MISSION-CONTRACT.md §5:
 * that document proposed a `bindings.mission`/`bindings.delegation` pair
 * (mission id/version/hash, delegation envelopeId/hash) supplied separately
 * from the WorkPackage. Reading `control-plane/work-package.ts`'s own
 * `validateCodeWorkPackageAttenuation` shows this is unnecessary and would be
 * actively wrong: it already requires
 * `workPackage.missionId === admission.governance.mission.id` (and the
 * matching checks for `missionVersion`, `missionBoundHash`, `envelopeId`,
 * `delegationBoundHash`, `workPackageId`, `packageHash`, `projectId`) — the
 * WorkPackage record already carries every governance pin, put there when it
 * was cut from its Delegation Envelope. A separate `bindings.mission`/
 * `bindings.delegation` would either duplicate those fields (a second place
 * for them to drift out of sync) or be redundant busywork for every caller.
 * `translate.ts` therefore derives `governance.{mission,delegation,workPackage}`
 * and `projectId` directly from the `WorkPackage` argument, never from
 * `CodeWorkMissionBindings`.
 *
 * What genuinely cannot come from the WorkPackage or from SDF-1A's own static
 * registries — and so must arrive as an already-resolved, caller-supplied
 * binding — is exactly:
 *   - `workId`: SDF-1A's own control-plane run identity. Distinct from
 *     `workPackage.workPackageId` on purpose (a single Work Package could
 *     plausibly need more than one code-work admission across separate
 *     attempts), so it is never derived here. It must also be UUID-shaped:
 *     SDF-1A's own `validateCodeWorkAdmission` treats `workId` as an opaque,
 *     persistence-agnostic string (`requireText` only checks non-empty/
 *     trimmed/no-NUL — see `policy.ts`), but the real SDF-1B control plane's
 *     `atlas_code_work_runs.work_id` column, and every RPC's `p_work_id`
 *     parameter, are Postgres `uuid` (`supabase/migrations/
 *     20260918095827_sdf1b1_code_work_control_plane.sql`). SDF-1A's contract
 *     layer is deliberately persistence-agnostic and should not gain a
 *     database-shape opinion; this translator's whole purpose is bridging
 *     toward that real persistence path, so it is the correct, minimal place
 *     to add the one check SDF-1A cannot: `translate.ts`'s `isUuidShaped`.
 *   - `repository` / `worktree.branchPrefix`: which trusted repository, at
 *     which pinned live commit, this particular admission targets. This
 *     translator does not call `repository-registry.ts` itself — passing a
 *     caller-supplied value through, unchecked, and then handing everything
 *     to the existing `validateCodeWorkAdmission` still reaches the exact
 *     same `repository_not_trusted` / `remote_identity_mismatch` /
 *     `base_ref_not_approved` / `branch_prefix_not_approved` violations that
 *     module would itself raise. Deferring instead of re-checking keeps this
 *     module from becoming a second place that could disagree with the
 *     registry.
 *   - `files`: which specific paths, inside whatever the WorkPackage's own
 *     `dataScope` already authorizes, this admission will read/write. SDF-1A's
 *     `CodeWorkFilePolicy` type is reused directly, unchanged.
 *   - `requiredCommandIds`: which SDF-1A command ids this admission approves.
 *     Always ids, never shell text — see `translate.ts` and
 *     `docs/autonomy/EVALUATION-GATES.md` §1a.
 *   - `worker` (optional): a hint that may override the one registered
 *     worker's fields. Deliberately typed as plain strings/numbers, not the
 *     admission's own literal-narrowed `worker` shape, because a hint is
 *     allowed to be wrong at runtime — that is what the
 *     "worker hint that cannot resolve to a registered worker" rejection
 *     path (MODEL-ROUTING.md) exercises. Left unset, it resolves to
 *     `CLAUDE_PATCH_V1`'s exact fields.
 */

import type {
  CodeWorkAdmissionV1,
  CodeWorkFilePolicy,
  CodeWorkPolicyViolation,
  CodeWorkRepositoryBinding,
} from '../types'
import type { WorkPackageUnusableReason } from '@/lib/atlas/workpackage/types'

// ── Mission Risk Level — a THIRD, independent scale. Never compare or merge
// with Chapter 18's Autonomy Licensing L0-L6, or with MissionRecord.risks'
// low/medium/high severity. See docs/autonomy/RISK-AND-AUTHORITY.md §0. ──────

export type MissionRiskLevel = 0 | 1 | 2 | 3

/**
 * The minimum shape this translator actually consumes. The illustrative
 * interface in docs/autonomy/RISK-AND-AUTHORITY.md §2 also sketches
 * `requiredChecks` and `mayAutoMerge` fields; neither is needed by pure
 * translation (required checks are a caller-supplied binding, see above, and
 * nothing in this slice may enable auto-merge), so they are deliberately not
 * reproduced here.
 */
export interface RiskLevelPolicy {
  readonly level: MissionRiskLevel
  readonly label: 'mechanical' | 'normal_development' | 'sensitive_implementation' | 'human_authority'
  readonly independentReviewRequired: boolean
  /** Additive on top of a Work Package's required `authority` — never a substitute for it. */
  readonly humanApprovalRequired: boolean
}

export const MISSION_RISK_LEVEL_POLICIES: Readonly<Record<MissionRiskLevel, RiskLevelPolicy>> = Object.freeze({
  0: Object.freeze({ level: 0, label: 'mechanical', independentReviewRequired: false, humanApprovalRequired: false }),
  1: Object.freeze({ level: 1, label: 'normal_development', independentReviewRequired: true, humanApprovalRequired: false }),
  2: Object.freeze({ level: 2, label: 'sensitive_implementation', independentReviewRequired: true, humanApprovalRequired: true }),
  3: Object.freeze({ level: 3, label: 'human_authority', independentReviewRequired: true, humanApprovalRequired: true }),
})

/** A hint, not a binding pin (docs/autonomy/MODEL-ROUTING.md). May be wrong at runtime. */
export interface CodeWorkWorkerHint {
  provider?: string
  modelId?: string
  adapterId?: string
  adapterVersion?: number
  outputProtocol?: string
  /**
   * Optional capability override. There is exactly one registered capability
   * today (`CODE_WORK_CAPABILITY_ID`/`CODE_WORK_CAPABILITY_VERSION`); this
   * exists so a caller requesting anything else is rejected by the real
   * `lookupCodeWorkCapability` check, rather than this translator having no
   * way to exercise "capability broader than SDF permits" at all.
   */
  capabilityId?: string
  capabilityVersion?: number
}

/**
 * Everything this translator needs that is not already carried by the
 * WorkPackage itself and not a static SDF-1A registry constant. See this
 * file's header comment for why each field is here and why several fields
 * the Phase 0 docs sketched (mission/delegation pins) are absent.
 */
export interface CodeWorkMissionBindings {
  workId: string
  repository: CodeWorkRepositoryBinding
  worktree: { branchPrefix: string }
  files: CodeWorkFilePolicy
  requiredCommandIds: string[]
  worker?: CodeWorkWorkerHint | null
}

/**
 * The candidate this module builds before handing it to the real validators.
 * Identical to `CodeWorkAdmissionV1` except `worker.provider`/`worker.modelId`
 * are widened from their literal types to `string`, because a caller-supplied
 * `CodeWorkWorkerHint` is allowed to name an unregistered worker — that is
 * exactly what `validateCodeWorkAdmission`'s `worker_not_registered` violation
 * exists to catch. Never exported as trustworthy; only
 * `validateCodeWorkAdmission`'s returned `{ ok: true, value }` is.
 */
export type CodeWorkAdmissionCandidate = Omit<CodeWorkAdmissionV1, 'worker'> & {
  worker: {
    capabilityId: string
    capabilityVersion: number
    adapterId: string
    adapterVersion: number
    provider: string
    modelId: string
    outputProtocol: string
  }
}

/**
 * Every rejection this pure translator can produce. `admission_invalid` and
 * `attenuation_failed` carry violations from the EXISTING SDF-1A validators
 * (`policy.ts`, `control-plane/work-package.ts`) verbatim — this module adds
 * no rejection vocabulary of its own for anything those already check.
 * Three cases are genuinely new, because nothing downstream of this module
 * could ever catch them:
 *   - `risk_policy_undefined` — SDF-1A's contract has no concept of Mission
 *     Risk Level at all.
 *   - `work_package_not_usable` — carries the real `WorkPackageUnusableReason`
 *     `resolveWorkPackage()` already computed; this module invents no second
 *     liveness vocabulary of its own.
 *   - `work_id_not_persistable` — SDF-1A's own validator does not, and should
 *     not, know about SDF-1B's Postgres `uuid` column type.
 */
export type MissionTranslationRejection =
  | { kind: 'risk_policy_undefined'; level: unknown }
  | { kind: 'work_package_not_usable'; reason: WorkPackageUnusableReason }
  | { kind: 'work_id_not_persistable'; workId: string }
  | { kind: 'admission_invalid'; violations: CodeWorkPolicyViolation[] }
  | { kind: 'attenuation_failed'; violations: CodeWorkPolicyViolation[] }

export type MissionTranslationResult =
  | { ok: true; admission: CodeWorkAdmissionV1; riskPolicy: RiskLevelPolicy }
  | { ok: false; rejection: MissionTranslationRejection }

export function lookupMissionRiskLevelPolicy(level: unknown): RiskLevelPolicy | null {
  return typeof level === 'number' && Object.prototype.hasOwnProperty.call(MISSION_RISK_LEVEL_POLICIES, level)
    ? MISSION_RISK_LEVEL_POLICIES[level as MissionRiskLevel]
    : null
}
