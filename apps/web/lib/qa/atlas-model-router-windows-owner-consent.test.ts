import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { brokerEnrollmentSecretHash } from '@/lib/atlas/code-broker/protocol'
import {
  canonicalOfflineOwnerConsent,
  reviewOfflineOwnerConsent, WINDOWS_CONSENT_DOMAIN, WINDOWS_CONSENT_VERSION,
  type OfflineOwnerConsentTicket,
  type OfflineTrustedPolicy,
} from '@/lib/atlas/model-router/windows-owner-consent'

const NOW=Date.parse('2026-10-29T15:30:00Z')
const OWNER='10000000-0000-4000-8000-000000000001'
const BUILD='a'.repeat(64)
const REPO='github.com/bumbi190/ai-operating-platform'

function trial() {
  const server = generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const j=server.publicKey.export({format:'jwk'}) as JsonWebKey
  const publicJwk={
    kty:'EC' as const,crv:'P-256' as const,x:j.x!,y:j.y!,
  }
  const pinnedThumbprint=createHash('sha256').update(JSON.stringify({
    crv:'P-256',kty:'EC',x:j.x,y:j.y,
  })).digest('base64url')

  // In-memory synthetic issuer key for tests only. NO issuer in Omnira
  // production is created or enrolled by this test.
  const policy:OfflineTrustedPolicy={
    expectedOwnerUserId:OWNER,
    expectedTpmPublicThumbprint:randomBytes(32).toString('base64url'),
    expectedDeclaredBuildSha256:BUILD,
    issuer:{
      issuerKeyId:'offline-ephemeral-issuer-v1',
      issuerJwk:publicJwk,
      issuerKeyThumbprint:pinnedThumbprint,
      status:'active',
    },
  }
  const pkg={
    domain:'omnira.code_broker.enrollment.v1',
    enrollmentId:randomUUID(),
    hostId:randomUUID(),
    challenge:randomBytes(32).toString('base64url'),
    pairingCode:randomBytes(8).toString('hex').toUpperCase(),
    expiresAt:new Date(NOW+120000).toISOString(),
    protocolVersion:1,
    algorithm:'ES256',
    allowedRepositoryIds:[REPO],
  }
  const unsigned:Omit<OfflineOwnerConsentTicket,'signature'>={
    version:WINDOWS_CONSENT_VERSION,
    domain:WINDOWS_CONSENT_DOMAIN,
    ticketId:randomUUID(),
    issuerKeyId:policy.issuer.issuerKeyId,
    ownerUserId:OWNER,
    enrollmentId:pkg.enrollmentId,
    hostId:pkg.hostId,
    challengeHash:brokerEnrollmentSecretHash('challenge',pkg.enrollmentId,pkg.challenge),
    pairingHash:brokerEnrollmentSecretHash('pairing',pkg.enrollmentId,pkg.pairingCode),
    publicKeyThumbprint:policy.expectedTpmPublicThumbprint,
    declaredBuildSha256:BUILD,
    repositoryId:REPO,
    action:'review_exact_enrollment_signature_offline',
    issuedAtMs:NOW-1000,
    expiresAtMs:NOW+30000,
    nonce:randomBytes(32).toString('base64url'),
  }
  const signed=(u:Omit<OfflineOwnerConsentTicket,'signature'>=unsigned,otherKey=server.privateKey):OfflineOwnerConsentTicket=>({
    ...u,
    signature:sign('sha256',Buffer.from(canonicalOfflineOwnerConsent(u)),{
      key:otherKey,dsaEncoding:'der',
    }).toString('base64url'),
  })
  const consumed=new Set<string>()
  let calls=0
  const consume=async (x:{ticketId:string;nonceSha256:string})=>{
    calls++
    // The durable server contract must unique-lock ticketId even if a new
    // signed nonce arrives with the same ID.
    const key=x.ticketId
    if(consumed.has(key)) return false
    consumed.add(key)
    return true
  }
  const check=(ticket:unknown=signed(),options:Record<string,unknown>={})=>
    reviewOfflineOwnerConsent({
      ticket,serverPackage:pkg,pinnedPolicy:policy,
      observedNowMs:NOW,consume,...options,
    })
  return {policy,pkg,unsigned,signed,consume,check,
    getCalls:()=>calls,
  }
}

describe('One-time synthetic consent proof is NOT permission to sign real enrollment',()=>{
  it('checks an ephemeral issuer and exact challenge/key/build binding, but never authorizes signing',async()=>{
    const f=trial()
    const result=await f.check()
    expect(result).toMatchObject({
      status:'verified_synthetic_consent_only',
      issuerSignatureVerified:true,packageBindingVerified:true,
      syntheticReplayConsumed:true,
      serverOriginAuthenticated:false,humanApprovalVerified:false,
      signingAllowed:false,enrollmentAllowed:false,dispatchAuthorized:false,
    })
    expect(f.getCalls()).toBe(1)
    expect(JSON.stringify(result)).not.toContain(f.pkg.challenge)
    expect(JSON.stringify(result)).not.toContain(f.pkg.pairingCode)
  })
  it('uses a different signing domain from broker enrollment and authenticated request',()=>{
    const f=trial()
    const canonical=canonicalOfflineOwnerConsent(f.unsigned)
    expect(canonical.startsWith(WINDOWS_CONSENT_DOMAIN+'\n')).toBe(true)
    expect(canonical).not.toContain('omnira.code_broker.request.v1')
    expect(canonical).toContain('ticket_id:'+f.unsigned.ticketId)
    expect(canonical).toContain('public_key_thumbprint:'+f.policy.expectedTpmPublicThumbprint)
    expect(canonical).toContain('challenge_hash:'+f.unsigned.challengeHash)
    expect(canonical).not.toContain(f.pkg.challenge)
    expect(canonical).not.toContain(f.pkg.pairingCode)
  })
  it('rejects replays even if the approval signature is cryptographically valid',async()=>{
    const f=trial()
    const t=f.signed()
    expect((await f.check(t)).status).toBe('verified_synthetic_consent_only')
    const replay=await f.check(t)
    expect(replay.status).toBe('blocked')
    expect(replay.reason).toBe('replay_or_consumption_unavailable')
    expect(replay.signingAllowed).toBe(false)
    expect(f.getCalls()).toBe(2)
  })
  it('rejects a missing, failing or throwing replay-consumption store',async()=>{
    const f=trial()
    const ticket=f.signed()
    for(const consume of [
      null,
      async()=>false,
      async()=>{throw new Error('offline ledger unavailable')},
    ]) {
      const x=await f.check(ticket,{consume})
      expect(x.status).toBe('blocked')
      expect(x.dispatchAuthorized).toBe(false)
    }
  })
  it('cannot reuse the ticket ID with a newly server-signed nonce',async()=>{
    const f=trial()
    const initial=f.signed()
    const freshNonce=f.signed({...f.unsigned,
      nonce:randomBytes(32).toString('base64url'),
    })
    expect((await f.check(initial)).status).toBe('verified_synthetic_consent_only')
    const second=await f.check(freshNonce)
    expect(second.status).toBe('blocked')
    expect(second.reason).toBe('replay_or_consumption_unavailable')
  })
  it('simulates two concurrent review requests but authorizes no actual signing',async()=>{
    const f=trial()
    const t=f.signed()
    const results=await Promise.all([f.check(t),f.check(t)])
    expect(results.filter(x=>x.status==='verified_synthetic_consent_only')).toHaveLength(1)
    expect(results.filter(x=>x.status==='blocked')).toHaveLength(1)
    expect(results.every(x=>x.signingAllowed===false)).toBe(true)
    // This only validates an in-memory single-use stub, not a real database race.
  })
  it('does not grant signing even when given a trivially accepting fake consumption callback',async()=>{
    const f=trial()
    const result=await f.check(f.signed(),{consume:async()=>true})
    expect(result.status).toBe('verified_synthetic_consent_only')
    expect(result.serverOriginAuthenticated).toBe(false)
    expect(result.humanApprovalVerified).toBe(false)
    expect(result.signingAllowed).toBe(false)
    expect(result.enrollmentAllowed).toBe(false)
    expect(result.dispatchAuthorized).toBe(false)
  })
  it('does not consume an invalid signature or body tampered after signing',async()=>{
    const f=trial()
    const t=f.signed()
    for(const wrong of [
      {...t,ownerUserId:randomUUID()},
      {...t,declaredBuildSha256:'b'.repeat(64)},
      {...t,challengeHash:'c'.repeat(64)},
      {...t,expiresAtMs:t.expiresAtMs-1},
      {...t,nonce:randomBytes(32).toString('base64url')},
      {...t,signature:'corrupted'},
    ]) {
      expect((await f.check(wrong)).status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('refuses a different cryptographic issuer, key-ID confusion and inactive issuer',async()=>{
    const f=trial()
    const t=f.signed()
    const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
    const imposter=f.signed(f.unsigned,other.privateKey)
    expect((await f.check(imposter)).status).toBe('blocked')
    expect((await f.check(t,{pinnedPolicy:{
      ...f.policy,issuer:{...f.policy.issuer,status:'revoked'},
    }})).status).toBe('blocked')
    expect((await f.check(t,{pinnedPolicy:{
      ...f.policy,issuer:{...f.policy.issuer,issuerKeyId:'different-issuer'},
    }})).status).toBe('blocked')
    expect((await f.check(t,{pinnedPolicy:{
      ...f.policy,issuer:{...f.policy.issuer,issuerKeyThumbprint:
        randomBytes(32).toString('base64url')},
    }})).status).toBe('blocked')
    expect(f.getCalls()).toBe(0)
  })
  it('binds approval to the exact current server challenge and pairing',async()=>{
    const f=trial()
    const t=f.signed()
    for(const update of [
      {challenge:randomBytes(32).toString('base64url')},
      {pairingCode:randomBytes(8).toString('hex').toUpperCase()},
      {hostId:randomUUID()},
      {enrollmentId:randomUUID()},
      {allowedRepositoryIds:['github.com/example/other']},
      {expiresAt:new Date(NOW-1).toISOString()},
    ]){
      const r=await f.check(t,{serverPackage:{...f.pkg,...update}})
      expect(r.status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('refuses wrong operator ID, TPM public key and declared build even if signed',async()=>{
    const f=trial()
    const signed=f.signed()
    for(const policy of [
      {...f.policy,expectedOwnerUserId:randomUUID()},
      {...f.policy,expectedTpmPublicThumbprint:randomBytes(32).toString('base64url')},
      {...f.policy,expectedDeclaredBuildSha256:'f'.repeat(64)},
    ]){
      expect((await f.check(signed,{pinnedPolicy:policy})).status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('rejects expired, future or unreasonable approval windows',async()=>{
    const f=trial()
    const t=f.signed()
    const cases=[
      f.signed({...f.unsigned,expiresAtMs:NOW}),
      f.signed({...f.unsigned,expiresAtMs:NOW+60_001}),
      f.signed({...f.unsigned,issuedAtMs:NOW+6_000,expiresAtMs:NOW+35_000}),
    ]
    for(const x of cases) expect((await f.check(x)).status).toBe('blocked')
    expect((await f.check(t,{observedNowMs:NOW+31_000})).status).toBe('blocked')
    expect((await f.check(t,{observedNowMs:NOW-7_000})).status).toBe('blocked')
    expect(f.getCalls()).toBe(0)
  })
  it('refuses receipt expiry extending beyond server challenge expiry',async()=>{
    const f=trial()
    const t=f.signed()
    const pkg={...f.pkg,expiresAt:new Date(NOW+20_000).toISOString()}
    expect((await f.check(t,{serverPackage:pkg})).status).toBe('blocked')
  })
  it('rejects any injected role, arbitrary action, private key or permission field',async()=>{
    const f=trial()
    const t=f.signed()
    for(const wrong of [
      {...t,role:'admin'},
      {...t,signingAllowed:true},
      {...t,privateKey:'secret'},
      {...t,action:'execute_model'},
      {...t,purpose:'code_execution'},
      {...t,version:'omnira.code_broker.request.v1'},
    ]){
      const r=await f.check(wrong)
      expect(r.status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('rejects invalid receipt shape, unsigned material, missing trust or clock',async()=>{
    const f=trial()
    for(const input of [null,{},[],false,'text',23,f.unsigned]){
      expect((await f.check(input)).status).toBe('blocked')
    }
    for(const changes of [
      {pinnedPolicy:null},
      {pinnedPolicy:{}},
      {observedNowMs:0},
      {observedNowMs:NaN},
      {consume:undefined},
    ]) expect((await f.check(f.signed(),changes)).status).toBe('blocked')
    expect(f.getCalls()).toBe(0)
  })
  it('rejects malformed issuer public JWK including private material',async()=>{
    const f=trial()
    const ticket=f.signed()
    for(const issuerJwk of [
      {...f.policy.issuer.issuerJwk,d:'not-private-material'},
      {...f.policy.issuer.issuerJwk,x:'x'},
      {kty:'RSA',crv:'P-256',x:'x',y:'y'},
    ]){
      const bad={
        ...f.policy,issuer:{...f.policy.issuer,issuerJwk},
      }
      expect((await f.check(ticket,{pinnedPolicy:bad})).status).toBe('blocked')
    }
  })
})
