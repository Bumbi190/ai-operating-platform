/**
 * Pure structure checks for independent investigation of an old local-model
 * DISPATCH_UNKNOWN. NOT a signature verifier, authority, or recovery executor.
 *
 * The original canonical attempt is evidence supplied by a trusted server-side
 * retrieval only. A client/model cannot construct a real authoritative source.
 * Even a structurally matching candidate NEVER clears the historical fence.
 */
export interface CanonicalAttemptEvidence {
  projectId: string
  jobId: string
  deviceId: string
  attemptId: string
  claimId: string
  selectionId: string
  fence: number
  inputHash: string
  modelDigest: string
  state: 'reconciling'
}
export interface CandidateWorkerReceipt {
  projectId: string
  jobId: string
  deviceId: string
  attemptId: string
  claimId: string
  selectionId: string
  fence: number
  inputHash: string
  modelDigest: string
  outcome: 'completed' | 'known_failed' | 'not_dispatched'
  signedReceiptHash: string
  /** This is only an untrusted descriptor; real signature verification is separate. */
  claimedSigner: string
}
export type StructuralFinding =
  | 'CANONICAL_ATTEMPT_NOT_RETAINED'
  | 'INVALID_CANONICAL_RECORD'
  | 'CANDIDATE_RECEIPT_MISSING'
  | 'INVALID_CANDIDATE_RECEIPT'
  | 'BOUND_IDENTITY_MISMATCH'
  | 'INDEPENDENT_VERIFICATION_REQUIRED'

export interface ReadOnlyProofAssessment {
  readonly finding: StructuralFinding
  readonly candidateStructurallyMatches: boolean
  readonly cryptographicSignatureVerified: false
  readonly independentHumanReviewRequired: true
  readonly historicalIncidentResolved: false
  readonly mayRetry: false
  readonly mayResume: false
  readonly mayEnroll: false
}

const uuid = (s:unknown):s is string => typeof s === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const sameUuid=(a:unknown,b:unknown):boolean => uuid(a)&&uuid(b)&&a.toLowerCase()===b.toLowerCase()
const sha = (s:unknown):s is string => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)
const model = (s:unknown):s is string => typeof s === 'string' && /^sha256:[a-f0-9]{64}$/.test(s)
const obj=(x:unknown):x is Record<string,unknown> => x!==null&&typeof x==='object'&&!Array.isArray(x)
const boundFields = ['projectId','jobId','deviceId','attemptId','claimId','selectionId'] as const
const validBindings=(x:Record<string,unknown>):boolean =>
  boundFields.every(k=>uuid(x[k])) && Number.isSafeInteger(x.fence) && Number(x.fence)>0
  && sha(x.inputHash) && model(x.modelDigest)

const finding=(kind:StructuralFinding,match=false):ReadOnlyProofAssessment => Object.freeze({
  finding:kind, candidateStructurallyMatches:match, cryptographicSignatureVerified:false as const,
  independentHumanReviewRequired:true as const, historicalIncidentResolved:false as const,
  mayRetry:false as const, mayResume:false as const, mayEnroll:false as const,
})

/**
 * Check only STRUCTURAL binding; never trust claimedSigner to mean proof.
 * If the old canonical row has expired, an unverified signed receipt alone
 * CANNOT reconstruct authority or permit replacing the old job.
 */
export function assessHistoricalLocalTextEvidence(
  canonical:unknown, candidate:unknown,
):ReadOnlyProofAssessment {
  if(canonical===null || canonical===undefined) return finding('CANONICAL_ATTEMPT_NOT_RETAINED')
  if(!obj(canonical) || !validBindings(canonical) || canonical.state!=='reconciling') {
    return finding('INVALID_CANONICAL_RECORD')
  }
  if(candidate===null || candidate===undefined) return finding('CANDIDATE_RECEIPT_MISSING')
  if(!obj(candidate) || !validBindings(candidate) ||
     typeof candidate.outcome!=='string' ||
     !['completed','known_failed','not_dispatched'].includes(candidate.outcome) ||
     !sha(candidate.signedReceiptHash) ||
     typeof candidate.claimedSigner!=='string' ||
     candidate.claimedSigner.length<1 || candidate.claimedSigner.length>128) {
    return finding('INVALID_CANDIDATE_RECEIPT')
  }
  // Compare UUID identity only; preserve original receipt bytes for verification.
  for(const field of boundFields) {
    if(!sameUuid(candidate[field],canonical[field])) return finding('BOUND_IDENTITY_MISMATCH')
  }
  for(const field of ['fence','inputHash','modelDigest'] as const) {
    if(candidate[field]!==canonical[field]) return finding('BOUND_IDENTITY_MISMATCH')
  }
  // A matching digest or self-asserted signature is not an independently
  // verified signature, not a canonical outcome, and not a permission to rerun.
  return finding('INDEPENDENT_VERIFICATION_REQUIRED',true)
}
