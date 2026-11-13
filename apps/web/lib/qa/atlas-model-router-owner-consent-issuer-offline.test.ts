import {
  createHash, generateKeyPairSync, randomBytes, randomUUID, sign,
} from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { brokerEnrollmentSecretHash } from '@/lib/atlas/code-broker/protocol'
import {
  issueOfflineSyntheticOwnerConsent, type SyntheticIssuerDependencies,
} from '@/lib/atlas/model-router/windows-owner-consent-issuer-offline'
import { reviewOfflineOwnerConsent } from '@/lib/atlas/model-router/windows-owner-consent'
import type { StoredBrokerEnrollment } from '@/lib/atlas/code-broker/types'

const NOW=Date.parse('2026-10-29T14:00:00Z')
const OWNER='10000000-0000-4000-8000-000000000001'
const BUILD='a'.repeat(64)
const REPO='github.com/bumbi190/ai-operating-platform'

function fixture() {
  const issuer=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const pub=issuer.publicKey.export({format:'jwk'}) as JsonWebKey
  const jwk={kty:'EC' as const,crv:'P-256' as const,x:pub.x!,y:pub.y!}
  const pinnedThumbprint=createHash('sha256').update(JSON.stringify({
    crv:'P-256',kty:'EC',x:pub.x,y:pub.y,
  })).digest('base64url')
  const pkg={
    domain:'omnira.code_broker.enrollment.v1',
    enrollmentId:randomUUID(),hostId:randomUUID(),
    challenge:randomBytes(32).toString('base64url'),
    pairingCode:randomBytes(8).toString('hex').toUpperCase(),
    expiresAt:new Date(NOW+120_000).toISOString(),
    protocolVersion:1,algorithm:'ES256',
    allowedRepositoryIds:[REPO],
  }
  const ch=brokerEnrollmentSecretHash('challenge',pkg.enrollmentId,pkg.challenge)
  const ph=brokerEnrollmentSecretHash('pairing',pkg.enrollmentId,pkg.pairingCode)
  const enrollment:StoredBrokerEnrollment={
    enrollmentId:pkg.enrollmentId,requestedBy:OWNER,hostId:pkg.hostId,
    challengeHash:ch,pairingCodeHash:ph,
    allowedRepositoryIds:[REPO],state:'issued',
    consumedAt:null,brokerId:null,proposedHostLabel:null,
    proposedLocalUidHash:null,proposedOsVersion:null,
    proposedProtocolVersion:null,proposedBrokerVersion:null,
    proposedBuildSha256:null,approvedAt:null,approvedBy:null,
    createdAt:new Date(NOW-60_000).toISOString(),
    expiresAt:new Date(NOW+100_000).toISOString(),
  }
  const action={
    source:'in_memory_test_only' as const,affirmative:true as const,
    approvalActionId:randomUUID(),ownerUserId:OWNER,
    enrollmentId:pkg.enrollmentId,hostId:pkg.hostId,
    challengeHash:ch,pairingHash:ph,
    publicKeyThumbprint:randomBytes(32).toString('base64url'),
    declaredBuildSha256:BUILD,recordedAtMs:NOW-1000,
  }
  const policy={
    expectedOwnerUserId:OWNER,
    expectedTpmPublicThumbprint:action.publicKeyThumbprint,
    expectedDeclaredBuildSha256:BUILD,
    issuer:{
      issuerKeyId:'synthetic-issuer-v1',issuerJwk:jwk,
      issuerKeyThumbprint:pinnedThumbprint,status:'active' as const,
    },
  }
  const reservations=new Set<string>()
  const tickets=new Set<string>()
  let signCount=0, reserveCount=0
  const dependencies:SyntheticIssuerDependencies={
    operator:async()=>({ok:true,userId:OWNER,email:'offline@synthetic.test',actor:'user:'+OWNER}),
    action:async()=>action,
    enrollmentById:async id=>id===pkg.enrollmentId?enrollment:null,
    reserveOnce:async x=>{
      reserveCount++
      if(reservations.has(x.approvalActionId) || tickets.has(x.ticketId)) return false
      reservations.add(x.approvalActionId)
      tickets.add(x.ticketId)
      return true
    },
    signCanonical:async value=>{
      signCount++
      return sign('sha256',Buffer.from(value),{
        key:issuer.privateKey,dsaEncoding:'der',
      }).toString('base64url')
    },
    trustedPolicy:policy,allowedBuildHashes:new Set([BUILD]),
    nowMs:()=>NOW,freshUUID:()=>randomUUID(),freshNonce32:()=>randomBytes(32),
  }
  const issue=(changes:Partial<SyntheticIssuerDependencies>={},
    serverPackage:unknown=pkg)=>
    issueOfflineSyntheticOwnerConsent({
      serverPackage,deps:{...dependencies,...changes},
    })
  return {issuer,pkg,enrollment,action,policy,dependencies,issue,
    getSignCount:()=>signCount,getReserveCount:()=>reserveCount,
  }
}
const isDenied=(x:{status:string;signingAllowed:boolean;dispatchAuthorized:boolean})=>{
  expect(x.status).toBe('blocked')
  expect(x.signingAllowed).toBe(false)
  expect(x.dispatchAuthorized).toBe(false)
}

describe('Offline-only server owner-consent issuance design',()=>{
  it('checks synthetic operator/action/store and signs one correctly bound fixture, never authorizing work',async()=>{
    const f=fixture()
    const result=await f.issue()
    expect(result.status).toBe('synthetic_receipt_signed')
    expect(result.realServerIssuerProvisioned).toBe(false)
    expect(result.serverOperatorAuthenticated).toBe(false)
    expect(result.actualHumanConsentVerified).toBe(false)
    expect(result.realEnrollmentIssued).toBe(false)
    expect(result.signingAllowed).toBe(false)
    expect(result.brokerActivationAllowed).toBe(false)
    expect(result.dispatchAuthorized).toBe(false)
    expect(result.receipt).toBeTruthy()
    expect(result.receipt?.ownerUserId).toBe(OWNER)
    expect(result.receipt?.enrollmentId).toBe(f.pkg.enrollmentId)
    expect(result.receipt?.hostId).toBe(f.pkg.hostId)
    expect(result.receipt?.publicKeyThumbprint).toBe(f.action.publicKeyThumbprint)
    expect(result.receipt?.expiresAtMs).toBe(NOW+60_000)
    expect(f.getReserveCount()).toBe(1)
    expect(f.getSignCount()).toBe(1)
    const serialized=JSON.stringify(result)
    expect(serialized).not.toContain(f.pkg.challenge)
    expect(serialized).not.toContain(f.pkg.pairingCode)
  })
  it('generated offline ticket can be verified by the separate pure verifier without granting signing',async()=>{
    const f=fixture()
    const issued=await f.issue()
    expect(issued.receipt).not.toBeNull()
    const seen=new Set<string>()
    const checked=await reviewOfflineOwnerConsent({
      ticket:issued.receipt,serverPackage:f.pkg,
      pinnedPolicy:f.policy,observedNowMs:NOW+1000,
      consume:async x=>{
        if(seen.has(x.ticketId)) return false
        seen.add(x.ticketId)
        return true
      },
    })
    expect(checked.status).toBe('verified_synthetic_consent_only')
    expect(checked.issuerSignatureVerified).toBe(true)
    expect(checked.packageBindingVerified).toBe(true)
    expect(checked.syntheticReplayConsumed).toBe(true)
    expect(checked.signingAllowed).toBe(false)
    expect(checked.humanApprovalVerified).toBe(false)
  })
  it('the same synthetic affirmative action cannot generate two tickets',async()=>{
    const f=fixture()
    const first=await f.issue()
    const repeat=await f.issue()
    expect(first.status).toBe('synthetic_receipt_signed')
    isDenied(repeat)
    expect(repeat.reason).toBe('already_reserved_or_store_unavailable')
    expect(f.getSignCount()).toBe(1)
  })
  it('only one of two simultaneous requests can reserve the exact same synthetic action',async()=>{
    const f=fixture()
    const both=await Promise.all([f.issue(),f.issue()])
    expect(both.filter(x=>x.status==='synthetic_receipt_signed')).toHaveLength(1)
    expect(both.filter(x=>x.status==='blocked')).toHaveLength(1)
    expect(both.every(x=>!x.signingAllowed)).toBe(true)
  })
  it('fails permanently closed if the synthetic signer fails after the approval is reserved',async()=>{
    const f=fixture()
    const broken=await f.issue({signCanonical:async()=>{throw new Error('test issuer inaccessible')}})
    isDenied(broken)
    expect(broken.reason).toBe('synthetic_server_dependency_failed')
    const retry=await f.issue()
    isDenied(retry)
    expect(retry.reason).toBe('already_reserved_or_store_unavailable')
    expect(f.getSignCount()).toBe(0)
  })
  it('rejects spoofed session operator without signing or reserving',async()=>{
    const f=fixture()
    const cases=[
      {ok:false as const,reason:'unauthenticated' as const},
      {ok:false as const,reason:'not_platform_operator' as const},
      {ok:true as const,userId:randomUUID(),actor:'user:'+randomUUID(),email:'wrong@synthetic.test'},
      {ok:true as const,userId:OWNER,actor:'attacker:'+OWNER,email:'wrong@synthetic.test'},
    ]
    for(const value of cases){
      isDenied(await f.issue({operator:async()=>value}))
    }
    expect(f.getReserveCount()).toBe(0)
  })
  it('rejects unapproved, stale, wrong-owner, foreign-host or extra-field synthetic actions',async()=>{
    const f=fixture()
    const cases=[
      {...f.action,affirmative:false},
      {...f.action,source:'client_approved'},
      {...f.action,recordedAtMs:NOW-61_000},
      {...f.action,recordedAtMs:NOW+1000},
      {...f.action,ownerUserId:randomUUID()},
      {...f.action,hostId:randomUUID()},
      {...f.action,publicKeyThumbprint:randomBytes(32).toString('base64url')},
      {...f.action,declaredBuildSha256:'c'.repeat(64)},
      {...f.action,challengeHash:'f'.repeat(64)},
      {...f.action,pairingHash:'f'.repeat(64)},
      {...f.action,permissionToSign:true},
    ]
    for(const value of cases) isDenied(await f.issue({action:async()=>value}))
    expect(f.getReserveCount()).toBe(0)
  })
  it('refuses a missing, expired, consumed, foreign or wrong-secret enrollment record',async()=>{
    const f=fixture()
    const candidates=[
      null,{...f.enrollment,state:'proof_verified' as const},
      {...f.enrollment,consumedAt:new Date(NOW).toISOString()},
      {...f.enrollment,requestedBy:randomUUID()},
      {...f.enrollment,hostId:randomUUID()},
      {...f.enrollment,challengeHash:'f'.repeat(64)},
      {...f.enrollment,pairingCodeHash:'f'.repeat(64)},
      {...f.enrollment,allowedRepositoryIds:['github.com/elsewhere/foo']},
      {...f.enrollment,expiresAt:new Date(NOW).toISOString()},
      {...f.enrollment,approvedAt:new Date(NOW).toISOString()},
    ]
    for(const enrollment of candidates){
      isDenied(await f.issue({enrollmentById:async()=>enrollment}))
    }
    expect(f.getSignCount()).toBe(0)
  })
  it('refuses a changed package: pairing, challenge, host, repo or expiry',async()=>{
    const f=fixture()
    for(const update of [
      {pairingCode:randomBytes(8).toString('hex').toUpperCase()},
      {challenge:randomBytes(32).toString('base64url')},
      {hostId:randomUUID()},
      {enrollmentId:randomUUID()},
      {allowedRepositoryIds:['github.com/attacker/other']},
      {expiresAt:new Date(NOW-1).toISOString()},
    ]) isDenied(await f.issue({}, {...f.pkg,...update}))
    expect(f.getReserveCount()).toBe(0)
  })
  it('requires explicit synthetic build allowlist and pinned issuer/owner/key policy',async()=>{
    const f=fixture()
    isDenied(await f.issue({allowedBuildHashes:new Set()}))
    isDenied(await f.issue({trustedPolicy:{
      ...f.policy,expectedOwnerUserId:randomUUID(),
    }}))
    isDenied(await f.issue({trustedPolicy:{
      ...f.policy,expectedTpmPublicThumbprint:randomBytes(32).toString('base64url'),
    }}))
    isDenied(await f.issue({trustedPolicy:{
      ...f.policy,expectedDeclaredBuildSha256:'f'.repeat(64),
    }}))
    isDenied(await f.issue({trustedPolicy:{
      ...f.policy,issuer:{...f.policy.issuer,status:'revoked' as never},
    }}))
    expect(f.getReserveCount()).toBe(0)
  })
  it('denies bad randomness, clocks or failed durable reservation',async()=>{
    const f=fixture()
    for(const bad of [
      {freshUUID:()=> 'wrong'},
      {freshNonce32:()=> Buffer.alloc(31)},
      {freshNonce32:()=> Buffer.alloc(0)},
      {nowMs:()=> NaN},
      {nowMs:()=> NOW+120_000},
      {reserveOnce:async()=>false},
      {reserveOnce:async()=>{throw new Error('DB unavailable')}},
    ]) isDenied(await f.issue(bad as Partial<SyntheticIssuerDependencies>))
  })
  it('denies bad signature output even after a successful reservation',async()=>{
    const f=fixture()
    const bad=await f.issue({signCanonical:async()=> 'wrong-signature'})
    isDenied(bad)
    expect(f.getReserveCount()).toBe(1)
    expect(f.getSignCount()).toBe(0)
  })
  it('rejects wrong or private issuer JWK before irreversible reservation',async()=>{
    const f=fixture()
    const badThumbprint=await f.issue({trustedPolicy:{
      ...f.policy,issuer:{
        ...f.policy.issuer,
        issuerKeyThumbprint:randomBytes(32).toString('base64url'),
      },
    }})
    isDenied(badThumbprint)
    // Deliberately keep the extra private-key field at runtime. Creating a
    // separate value avoids a TypeScript excess-property error while the
    // issuer must still reject the malformed public JWK before reservation.
    const issuerJwkWithPrivateField={
      ...f.policy.issuer.issuerJwk,d:'not-a-real-private-key',
    }
    const privateClaim=await f.issue({trustedPolicy:{
      ...f.policy,issuer:{
        ...f.policy.issuer,issuerJwk:issuerJwkWithPrivateField,
      },
    }})
    isDenied(privateClaim)
    expect(f.getReserveCount()).toBe(0)
    expect(f.getSignCount()).toBe(0)
  })
  it('rejects a signature from an unpinned issuer even after reservation',async()=>{
    const f=fixture()
    const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
    const result=await f.issue({signCanonical:async value=>
      sign('sha256',Buffer.from(value),{
        key:other.privateKey,dsaEncoding:'der',
      }).toString('base64url'),
    })
    isDenied(result)
    expect(result.reason).toBe('issuer_signature_failed_verification')
    expect(f.getReserveCount()).toBe(1)
  })
  it('never enables issuance when running in production mode',async()=>{
    const f=fixture()
    vi.stubEnv('NODE_ENV','production')
    try {
      const result=await f.issue()
      isDenied(result)
      expect(result.reason).toBe('disabled_outside_test')
      expect(f.getReserveCount()).toBe(0)
    } finally {vi.unstubAllEnvs()}
  })
  it('never takes a caller-provided signature, private key or approval claim as authority',async()=>{
    const f=fixture()
    isDenied(await f.issue({action:async()=>({
      ...f.action,privateKey:'nope',
    })}))
    isDenied(await f.issue({action:async()=>({
      ...f.action,isAdmin:true,
    })}))
    expect(f.getReserveCount()).toBe(0)
  })
})
