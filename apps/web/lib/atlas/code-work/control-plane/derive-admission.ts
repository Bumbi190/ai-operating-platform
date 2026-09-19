/** Pure proposal derivation: validate, attenuate, then bind every persisted hash. */

import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import { codeWorkAdmissionBoundProjection, codeWorkAdmissionHash } from '../binding'
import { validateCodeWorkAdmission } from '../policy'
import type { CodeWorkAdmissionV1, CodeWorkValidation } from '../types'
import type { DerivedCodeWorkProposal } from './types'
import { validateCodeWorkPackageAttenuation } from './work-package'

export interface DeriveCodeWorkProposalInput {
  admission: unknown
  workPackage: WorkPackage
  requestedBy: string
  idempotencyKey: string
}

export function deriveCodeWorkProposal(
  input: DeriveCodeWorkProposalInput,
): CodeWorkValidation<DerivedCodeWorkProposal> {
  const validated = validateCodeWorkAdmission(input.admission)
  if (!validated.ok) return validated
  if (!input.requestedBy || !input.idempotencyKey || input.idempotencyKey.length > 200) {
    return { ok: false, violations: [{
      path: 'proposal', code: 'proposal_identity_required',
      detail: 'server-derived requester and bounded idempotency key are required',
    }] }
  }
  const attenuated = validateCodeWorkPackageAttenuation(input.workPackage, validated.value)
  if (!attenuated.ok) return attenuated

  // Store the same normalized projection that is hashed. This removes duplicate
  // or reordered set-like members before the immutable JSON reaches Postgres.
  const admission = codeWorkAdmissionBoundProjection(validated.value) as unknown as CodeWorkAdmissionV1
  const admissionHash = codeWorkAdmissionHash(admission)
  const proposalKeyHash = canonicalTargetVersionHash({
    schema: 'atlas.code_work.proposal_key', version: 1,
    projectId: admission.projectId, requestedBy: input.requestedBy,
    idempotencyKey: input.idempotencyKey,
  })
  const proposalFingerprintHash = canonicalTargetVersionHash({
    schema: 'atlas.code_work.proposal_fingerprint', version: 1,
    proposalKeyHash, admissionHash,
    workPackageHash: admission.governance.workPackage.hash,
  })
  return {
    ok: true,
    value: { admission, admissionHash, proposalKeyHash, proposalFingerprintHash, requestedBy: input.requestedBy },
  }
}
