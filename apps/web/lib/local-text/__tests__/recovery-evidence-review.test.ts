import { describe, expect, it } from 'vitest'
import { assessHistoricalLocalTextEvidence } from '../recovery-evidence-review'

const uuid=(n:number)=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`
const canonical={
  projectId:uuid(1),jobId:uuid(2),deviceId:uuid(3),attemptId:uuid(4),
  claimId:uuid(5),selectionId:uuid(6),fence:7,
  inputHash:'a'.repeat(64),modelDigest:'sha256:'+'b'.repeat(64),
  state:'reconciling' as const,
}
const candidate={
  projectId:canonical.projectId,jobId:canonical.jobId,deviceId:canonical.deviceId,
  attemptId:canonical.attemptId,claimId:canonical.claimId,selectionId:canonical.selectionId,
  fence:canonical.fence,inputHash:canonical.inputHash,modelDigest:canonical.modelDigest,
  outcome:'completed' as const,signedReceiptHash:'c'.repeat(64),claimedSigner:'local-worker',
}
const assess=(a:unknown=canonical,b:unknown=candidate)=>assessHistoricalLocalTextEvidence(a,b)

describe('pure local inference reconciliation evidence: no recovery authority',()=>{
  it('refuses when the original canonical job/attempt was removed by retention',()=>{
    expect(assess(null,candidate)).toMatchObject({
      finding:'CANONICAL_ATTEMPT_NOT_RETAINED',
      mayRetry:false,mayResume:false,mayEnroll:false,
      historicalIncidentResolved:false,cryptographicSignatureVerified:false,
    })
    expect(assessHistoricalLocalTextEvidence(undefined,candidate).candidateStructurallyMatches).toBe(false)
  })
  it('flags malformed or incomplete old canonical bindings',()=>{
    for(const input of [
      {},'not a record',{...canonical,state:'completed'},
      {...canonical,fence:0},{...canonical,attemptId:'invalid'},
      {...canonical,inputHash:'unsafe'},
    ]){
      expect(assess(input,candidate).finding).toBe('INVALID_CANONICAL_RECORD')
    }
  })
  it('requires an independently obtained signed-receipt candidate',()=>{
    expect(assess(canonical,null).finding).toBe('CANDIDATE_RECEIPT_MISSING')
    for(const input of [
      {},[],{...candidate,outcome:'dispatch_unknown'},
      {...candidate,signedReceiptHash:'bad'},
      {...candidate,claimedSigner:''},
      {...candidate,claimedSigner:'x'.repeat(129)},
      {...candidate,claimId:'undefined'},
    ]){
      expect(assess(canonical,input).finding).toBe('INVALID_CANDIDATE_RECEIPT')
    }
  })
  it('detects each forged or different worker/project/claim binding',()=>{
    for(const key of ['projectId','jobId','deviceId','attemptId','claimId','selectionId'] as const){
      const changed={...candidate,[key]:uuid(99)}
      expect(assess(canonical,changed)).toMatchObject({
        finding:'BOUND_IDENTITY_MISMATCH',candidateStructurallyMatches:false,
      })
    }
    expect(assess(canonical,{...candidate,fence:8}).finding).toBe('BOUND_IDENTITY_MISMATCH')
    expect(assess(canonical,{...candidate,inputHash:'d'.repeat(64)}).finding).toBe('BOUND_IDENTITY_MISMATCH')
    expect(assess(canonical,{...candidate,modelDigest:'sha256:'+'e'.repeat(64)}).finding).toBe('BOUND_IDENTITY_MISMATCH')
  })
  it.each(['completed','known_failed','not_dispatched'] as const)(
    'even structurally bound %s receipts cannot resolve or resume',
    outcome=>{
      const decision=assess(canonical,{...candidate,outcome})
      expect(decision).toEqual({
        finding:'INDEPENDENT_VERIFICATION_REQUIRED',
        candidateStructurallyMatches:true,
        cryptographicSignatureVerified:false,
        independentHumanReviewRequired:true,
        historicalIncidentResolved:false,mayRetry:false,mayResume:false,mayEnroll:false,
      })
      expect(Object.isFrozen(decision)).toBe(true)
    },
  )
  it('ignores attacker assertions of verification, approval or authorization',()=>{
    const forged={...candidate,verified:true,independentReviewerApproved:true,resumePermitted:true}
    const decision=assess(canonical,forged)
    expect(decision.cryptographicSignatureVerified).toBe(false)
    expect(decision.mayResume).toBe(false)
    expect(decision.mayRetry).toBe(false)
    expect(decision.historicalIncidentResolved).toBe(false)
    expect('verified' in decision).toBe(false)
  })
  it('returns no caller-provided identifiers, hashes, raw texts or secrets',()=>{
    const decision=assess(canonical,candidate)
    const text=JSON.stringify(decision)
    for(const value of [...Object.values(canonical).filter(v=>typeof v==='string'),
      candidate.claimedSigner,candidate.signedReceiptHash]){
      expect(text).not.toContain(value)
    }
  })
})
