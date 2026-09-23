/**
 * Phase 1A — the smallest pure, execution-free bridge from a canonical, live
 * `WorkPackageEvaluation` (Chapter 21) into SDF-1A's `CodeWorkAdmissionV1`.
 *
 * This is NOT a dispatcher. It invokes no model, no shell, no Git mutation,
 * no filesystem mutation, no network call, no database write and no
 * deployment. It builds a candidate admission object in memory and hands it
 * to SDF-1A's own, already-reviewed validators — it never decides for itself
 * that a candidate is acceptable.
 *
 * Takes a `WorkPackageEvaluation`, not a raw `WorkPackage`, and refuses to
 * translate one that isn't `usable`. A `WorkPackage`'s own
 * `authority`/`allowedActions`/`tools` are contract data written down when it
 * was cut from its Delegation Envelope — they do not prove the package is
 * still usable this second. Only `lib/atlas/workpackage/principal-read.ts`'s
 * `resolveWorkPackage()` re-asks that live chain (delegation usability,
 * mission pins, containment, role validity), and it is `server-only` with
 * real reads, so this module never imports or calls it. The caller is
 * expected to have already called it — exactly as
 * `control-plane/principal-write.ts`'s `proposeCodeWork` already does before
 * it will derive anything — and to pass the resulting `WorkPackageEvaluation`
 * straight through. Checking `evaluation.usable` here adds no I/O: it reads
 * one boolean off an object the caller already produced.
 *
 * Every governance pin (`mission`, `delegation`, `workPackage`, `projectId`)
 * is read directly off `evaluation.workPackage`, never off the caller's
 * `CodeWorkMissionBindings` — see `types.ts`'s header comment for why a
 * separate mission/delegation binding would be redundant and unsafe (a
 * second place those pins could drift out of sync with the WorkPackage they
 * actually came from).
 */

import type { WorkPackageEvaluation } from '@/lib/atlas/workpackage/types'
import {
  CODE_WORK_ADMISSION_SCHEMA,
  CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_BASELINE_RECEIPT_CLASSES,
  CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION,
  CODE_WORK_STOP_CONDITIONS,
  CODE_WORK_WORKTREE_POLICY_ID,
  SDF1_LIMITS,
} from '../types'
import { codeWorkCommandRegistryHash, COMMAND_REGISTRY_VERSION } from '../command-registry'
import { validateCodeWorkAdmission } from '../policy'
import { validateCodeWorkPackageAttenuation } from '../control-plane/work-package'
import { CLAUDE_PATCH_V1 } from '../worker-registry'
import {
  lookupMissionRiskLevelPolicy,
  type CodeWorkAdmissionCandidate,
  type CodeWorkMissionBindings,
  type MissionRiskLevel,
  type MissionTranslationResult,
} from './types'

/**
 * The one registered worker's real identity, read from `worker-registry.ts`
 * rather than re-declared here. `CLAUDE_PATCH_V1` also carries
 * `capability`/`toolAccess`/`shellAccess`/etc. fields this admission shape
 * does not use; only the five fields `CodeWorkAdmissionV1['worker']` actually
 * needs are lifted out. `capabilityId`/`capabilityVersion` are not part of
 * `CLAUDE_PATCH_V1` (capability and worker are separate registries in
 * SDF-1A), so those two still come from `CODE_WORK_CAPABILITY_ID`/
 * `CODE_WORK_CAPABILITY_VERSION` — the canonical constants for the one
 * registered capability.
 */
const DEFAULT_WORKER = Object.freeze({
  capabilityId: CODE_WORK_CAPABILITY_ID as string,
  capabilityVersion: CODE_WORK_CAPABILITY_VERSION as number,
  adapterId: CLAUDE_PATCH_V1.adapterId as string,
  adapterVersion: CLAUDE_PATCH_V1.adapterVersion as number,
  provider: CLAUDE_PATCH_V1.provider as string,
  modelId: CLAUDE_PATCH_V1.modelId as string,
  outputProtocol: CLAUDE_PATCH_V1.outputProtocol as string,
})

/**
 * Postgres `uuid` shape, lowercase-only — matching the strictness SDF-1A's
 * own `SHA256`/`GIT_SHA` patterns already use in `policy.ts` (lowercase hex
 * only, no uppercase accepted). `crypto.randomUUID()` always produces
 * lowercase, so a caller using the platform's own generator never trips this.
 * SDF-1A's `validateCodeWorkAdmission` cannot check this itself — `workId` is
 * an opaque `string` at the SDF-1A contract layer, deliberately unaware of
 * SDF-1B's Postgres schema (`work_id uuid primary key`; see
 * `supabase/migrations/20260918095827_sdf1b1_code_work_control_plane.sql`).
 * Mixing that persistence-shape knowledge into SDF-1A's own validator would
 * blur a boundary SDF-1A keeps deliberately clean, so this translator — whose
 * entire purpose is bridging toward that real persistence path — adds the one
 * check SDF-1A cannot.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function isUuidShaped(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * Assemble the in-memory candidate. Pure: every value is either a fixed
 * SDF-1A constant, a pure computed hash (`codeWorkCommandRegistryHash`, over
 * the static command registry — no I/O), a field copied verbatim off
 * `workPackage`, or a field copied verbatim off `bindings`. Nothing here
 * decides whether the candidate is actually admissible — that is
 * `validateCodeWorkAdmission`'s and `validateCodeWorkPackageAttenuation`'s
 * job, called by `translateWorkPackageToAdmission` below.
 */
function buildCandidate(
  workPackage: WorkPackageEvaluation['workPackage'],
  bindings: CodeWorkMissionBindings,
): CodeWorkAdmissionCandidate {
  const hint = bindings.worker
  return {
    schema: CODE_WORK_ADMISSION_SCHEMA,
    version: CODE_WORK_ADMISSION_VERSION,
    workId: bindings.workId,
    projectId: workPackage.projectId,

    governance: {
      mission: {
        id: workPackage.missionId,
        version: workPackage.missionVersion,
        hash: workPackage.missionBoundHash,
      },
      authorizationTarget: {
        targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE,
        targetId: bindings.workId,
        actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND,
      },
      delegation: {
        envelopeId: workPackage.envelopeId,
        hash: workPackage.delegationBoundHash,
      },
      workPackage: {
        id: workPackage.workPackageId,
        hash: workPackage.packageHash,
      },
    },

    repository: bindings.repository,
    worktree: {
      branchPrefix: bindings.worktree.branchPrefix,
      policyId: CODE_WORK_WORKTREE_POLICY_ID,
    },

    worker: {
      capabilityId: hint?.capabilityId ?? DEFAULT_WORKER.capabilityId,
      capabilityVersion: hint?.capabilityVersion ?? DEFAULT_WORKER.capabilityVersion,
      adapterId: hint?.adapterId ?? DEFAULT_WORKER.adapterId,
      adapterVersion: hint?.adapterVersion ?? DEFAULT_WORKER.adapterVersion,
      provider: hint?.provider ?? DEFAULT_WORKER.provider,
      modelId: hint?.modelId ?? DEFAULT_WORKER.modelId,
      outputProtocol: hint?.outputProtocol ?? DEFAULT_WORKER.outputProtocol,
    },

    files: bindings.files,
    commands: {
      approvedCommandIds: [...bindings.requiredCommandIds],
      registryVersion: COMMAND_REGISTRY_VERSION,
      registryHash: codeWorkCommandRegistryHash(),
    },

    limits: { ...SDF1_LIMITS },
    isolation: { network: 'denied', secrets: 'none' },
    evidence: { requiredReceiptClasses: [...CODE_WORK_BASELINE_RECEIPT_CLASSES] },
    stopConditions: [...CODE_WORK_STOP_CONDITIONS],
  }
}

/**
 * Translate a live-resolved Work Package evaluation into an admitted
 * `CodeWorkAdmissionV1`, or a structured rejection. Deterministic: the same
 * `evaluation`, `riskLevel` and `bindings` always produce the same result,
 * because nothing here reads a clock, a random source, the filesystem, the
 * network or a database — `evaluation.usable` is read, not computed.
 *
 * Fail-closed by construction, not by convention: every check that could
 * possibly widen scope to make translation succeed belongs to
 * `evaluation.usable` itself, `validateCodeWorkAdmission`, or
 * `validateCodeWorkPackageAttenuation` — this function calls them unmodified.
 * There is no code path here that can accept a candidate any of them rejects.
 */
export function translateWorkPackageToAdmission(
  evaluation: WorkPackageEvaluation,
  riskLevel: MissionRiskLevel,
  bindings: CodeWorkMissionBindings,
): MissionTranslationResult {
  if (!evaluation.usable) {
    return { ok: false, rejection: { kind: 'work_package_not_usable', reason: evaluation.reason } }
  }

  if (!isUuidShaped(bindings.workId)) {
    return { ok: false, rejection: { kind: 'work_id_not_persistable', workId: bindings.workId } }
  }

  const riskPolicy = lookupMissionRiskLevelPolicy(riskLevel)
  if (!riskPolicy) {
    return { ok: false, rejection: { kind: 'risk_policy_undefined', level: riskLevel } }
  }

  const workPackage = evaluation.workPackage
  const candidate = buildCandidate(workPackage, bindings)

  const admissionResult = validateCodeWorkAdmission(candidate)
  if (!admissionResult.ok) {
    return { ok: false, rejection: { kind: 'admission_invalid', violations: admissionResult.violations } }
  }

  const attenuationResult = validateCodeWorkPackageAttenuation(workPackage, admissionResult.value)
  if (!attenuationResult.ok) {
    return { ok: false, rejection: { kind: 'attenuation_failed', violations: attenuationResult.violations } }
  }

  return { ok: true, admission: attenuationResult.value, riskPolicy }
}
