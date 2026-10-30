import { describe, expect, it } from 'vitest'
import {
  DESKTOP_PROOF_DOMAIN, DESKTOP_PROOF_VERSION,
  canonicalDesktopProof, verifySignedDesktopEvidence,
} from '@/lib/atlas/model-router/signed-desktop-evidence'

const NOW=Date.parse('2026-10-29T07:45:00Z')
const brokerId='aab10000-1111-4111-8111-111111111111'
const hostId='aab20000-2222-4222-8222-222222222222'
const challengeId='aab30000-3333-4333-8333-333333333333'
const nonce=Buffer.alloc(32,1).toString('base64url')
const challenge=()=>({
  version:DESKTOP_PROOF_VERSION,challengeId,nonce,brokerId,hostId,
  issuedAtMs:NOW-1000,expiresAtMs:NOW+10000,
  purpose:'read_only_desktop_diagnostic',
})
const proof=()=>({
  version:DESKTOP_PROOF_VERSION,challengeId,nonce,brokerId,hostId,
  buildSha256:'a'.repeat(64),counter:12,signedAtMs:NOW,
  snapshotJson:'{}',signature:'not-a-valid-signature',
})
const check=(envelope:unknown, extra:Record<string,unknown>={})=>
  verifySignedDesktopEvidence({
    envelope,challenge:challenge(),trustedIdentity:null,
    observedNowMs:NOW+50,consume:async()=>true,...extra,
  })

describe('untrusted signed diagnostic evidence is fail closed',()=>{
  it('rejects a missing envelope and unauthenticated broker identity',async()=>{
    expect((await check(null)).reason).toBe('invalid_proof')
    const response=await check(proof())
    expect(response.reason).toBe('identity_unverified')
    expect(response.signerVerified).toBe(false)
    expect(response.dispatchAuthorized).toBe(false)
    expect(response.trustedForRouting).toBe(false)
    expect(response.hardwareAttested).toBe(false)
  })
  it('requires atomic replay gate even to evaluate the evidence',async()=>{
    expect((await check(proof(),{consume:null})).reason).toBe('invalid_proof')
  })
  it('rejects unknown fields and invalid counters before attempting key lookup',async()=>{
    expect((await check({...proof(),allowCommands:true})).reason).toBe('invalid_proof')
    expect((await check({...proof(),counter:0})).reason).toBe('invalid_proof')
    expect((await check({...proof(),counter:1.5})).reason).toBe('invalid_proof')
  })
  it('rejects invalid nonce encoding, challenge purpose and elapsed challenge lifetime',async()=>{
    expect((await check({...proof(),nonce:'not canonical==='})).reason).toBe('invalid_proof')
    expect((await check(proof(),{
      challenge:{...challenge(),purpose:'execute_code'},
    })).reason).toBe('invalid_proof')
    expect((await check(proof(),{
      challenge:{...challenge(),expiresAtMs:NOW+500000},
    })).reason).toBe('invalid_proof')
  })
  it('rejects future and malformed timestamps',async()=>{
    expect((await check({...proof(),signedAtMs:'tomorrow'})).reason).toBe('invalid_proof')
    expect((await check(proof(),{observedNowMs:NaN})).reason).toBe('invalid_proof')
  })
  it('canonical bytes have their own domain and the content hash, never raw JSON',()=>{
    const {signature:_ignored,...unsigned}=proof()
    const canonical=canonicalDesktopProof(unsigned)
    expect(canonical.split('\n')[0]).toBe(DESKTOP_PROOF_DOMAIN)
    expect(canonical).toMatch(/snapshot_sha256:[a-f0-9]{64}$/)
    expect(canonical).not.toContain('snapshotJson')
    expect(canonical).toContain('counter:12')
  })
})
