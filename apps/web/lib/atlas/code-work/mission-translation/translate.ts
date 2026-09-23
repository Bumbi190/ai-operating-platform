/**
 * Phase 1A — the smallest pure, execution-free bridge from a canonical
 * `WorkPackage` (Chapter 21) into SDF-1A's `CodeWorkAdmissionV1`.
 *
 * This is NOT a dispatcher. It invokes no model, no shell, no Git mutation,
 * no filesystem mutation, no network call, no database write and no
 * deployment. It builds a candidate admission object in memory and hands it
 * to SDF-1A's own, already-reviewed validators — it never decides for itself
 * that a candidate is acceptable.
 *
 * Every governance pin (`mission`, `delegation`, `workPackage`, `projectId`)
 * is read directly off the `WorkPackage` argument, never off the caller's
 * `CodeWorkMissionBindings` — see `types.ts`'s header comment for why a
 * separate mission/delegation binding would be redundant and unsafe (a
 * second place those pins could drift out of sync with the WorkPackage they
 * actually came from).
 */

import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import {
  CODE_WORK_ADMISSION_SCHEMA,
  CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_BASELINE_RECEIPT_CLASSES,
  CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION,
  CODE_WORK_OUTPUT_PROTOCOL,
  CODE_WORK_STOP_CONDITIONS,
  CODE_WORK_WORKER_ADAPTER_ID,
  CODE_WORK_WORKER_ADAPTER_VERSION,
  CODE_WORK_WORKTREE_POLICY_ID,
  SDF1_LIMITS,
} from '../types'
import { codeWorkCommandRegistryHash, COMMAND_REGISTRY_VERSION } from '../command-registry'
import { validateCodeWorkAdmission } from '../policy'
import { validateCodeWorkPackageAttenuation } from '../control-plane/work-package'
import {
  lookupMissionRiskLevelPolicy,
  type CodeWorkAdmissionCandidate,
  type CodeWorkMissionBindings,
  type MissionRiskLevel,
  type MissionTranslationResult,
} from './types'

const DEFAULT_WORKER = Object.freeze({
  capabilityId: CODE_WORK_CAPABILITY_ID as string,
  capabilityVersion: CODE_WORK_CAPABILITY_VERSION as number,
  adapterId: CODE_WORK_WORKER_ADAPTER_ID as string,
  adapterVersion: CODE_WORK_WORKER_ADAPTER_VERSION as number,
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-6',
  outputProtocol: CODE_WORK_OUTPUT_PROTOCOL as string,
})

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
  workPackage: WorkPackage,
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
 * Translate a Work Package into an admitted `CodeWorkAdmissionV1`, or a
 * structured rejection. Deterministic: the same `workPackage`, `riskLevel`
 * and `bindings` always produce the same result, because nothing here reads
 * a clock, a random source, the filesystem, the network or a database.
 *
 * Fail-closed by construction, not by convention: every check that could
 * possibly widen scope to make translation succeed belongs to
 * `validateCodeWorkAdmission` or `validateCodeWorkPackageAttenuation`, and
 * this function calls them unmodified. There is no code path here that can
 * accept a candidate either of them rejects.
 */
export function translateWorkPackageToAdmission(
  workPackage: WorkPackage,
  riskLevel: MissionRiskLevel,
  bindings: CodeWorkMissionBindings,
): MissionTranslationResult {
  const riskPolicy = lookupMissionRiskLevelPolicy(riskLevel)
  if (!riskPolicy) {
    return { ok: false, rejection: { kind: 'risk_policy_undefined', level: riskLevel } }
  }

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
