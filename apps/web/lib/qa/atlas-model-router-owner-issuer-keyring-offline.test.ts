import {
  createHash, generateKeyPairSync, randomBytes, randomUUID, sign,
} from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  canonicalOfflineIssuerKeyring, reviewOfflineIssuerKeyring,
  OWNER_ISSUER_KEYRING_DOMAIN, OWNER_ISSUER_KEYRING_VERSION,
  type OfflineIssuerKeyring, type OfflineIssuerRecord,
} from '@/lib/atlas/model-router/windows-owner-issuer-keyring-offline'
import {
  canonicalOfflineOwnerConsent, reviewOfflineOwnerConsent,
  WINDOWS_CONSENT_VERSION, WINDOWS_CONSENT_DOMAIN,
  type OfflineOwnerConsentTicket,
} from '@/lib/atlas/model-router/windows-owner-consent'
import { brokerEnrollmentSecretHash } from '@/lib/atlas/code-broker/protocol'

const NOW=Date.parse('2026-10-29T17:15:00Z')
const ROOT='test-governance-root-v1'
const OWNER='10000000-0000-4000-8000-000000000001'
const BUILD='a'.repeat(64)
const REPO='github.com/bumbi190/ai-operating-platform'
function fixture() {
  const root=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const a=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const b=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const key=(pair:typeof root,keyId:string,state:'active'|'revoked'|'retired',
    activatedAtMs:number,disabledAtMs:number|null):OfflineIssuerRecord=>{
    const jwk=pair.publicKey.export({format:'jwk'}) as JsonWebKey
    const point={kty:'EC' as const,crv:'P-256' as const,
      x:jwk.x!,y:jwk.y!}
    const keyThumbprint=createHash('sha256').update(JSON.stringify({
      crv:'P-256',kty:'EC',x:jwk.x,y:jwk.y,
    })).digest('base64url')
    return {keyId,publicJwk:point,keyThumbprint,state,activatedAtMs,disabledAtMs}
  }
  const pinnedRoot={
    rootId:ROOT,
    publicJwk:key(root,'root-key','active',NOW-2000,null).publicJwk,
    thumbprint:key(root,'root-key','active',NOW-2000,null).keyThumbprint,
    status:'trusted_for_offline_review' as const,
  }
  const first=key(a,'issuer-a','active',NOW-2000,null)
  const old=key(a,'issuer-a','revoked',NOW-2000,NOW+500)
  const next=key(b,'issuer-b','active',NOW+1000,null)
  const unsigned=(revision:number,issuers:readonly OfflineIssuerRecord[],
    activeIssuerKeyId:string,issuedAtMs=NOW):Omit<OfflineIssuerKeyring,'signature'>=>({
    version:OWNER_ISSUER_KEYRING_VERSION,
    domain:OWNER_ISSUER_KEYRING_DOMAIN,
    revision,governanceRootId:ROOT,
    issuedAtMs,expiresAtMs:issuedAtMs+60_000,
    activeIssuerKeyId,issuers,
  })
  const signed=(u:Omit<OfflineIssuerKeyring,'signature'>,
    rootPrivate=root.privateKey):OfflineIssuerKeyring=>({
    ...u,
    signature:sign('sha256',Buffer.from(canonicalOfflineIssuerKeyring(u)),{
      key:rootPrivate,dsaEncoding:'der',
    }).toString('base64url'),
  })
  const v1=signed(unsigned(1,[first],'issuer-a'))
  const v2=signed(unsigned(2,[old,next],'issuer-b',NOW+1000))
  const latest=new Map<string,number>()
  let calls=0
  const acceptRevision=async (x:{rootId:string;revision:number})=>{
    calls++
    const last=latest.get(x.rootId)??0
    if(x.revision<=last) return false
    latest.set(x.rootId,x.revision)
    return true
  }
  const verify=(registry:unknown=v1,other:Record<string,unknown>={})=>
    reviewOfflineIssuerKeyring({
      registry,pinnedRoot,observedNowMs:NOW+2500,
      acceptRevision,...other,
    })
  return {root,a,b,pinnedRoot,first,old,next,unsigned,signed,v1,v2,
    verify,acceptRevision,getCalls:()=>calls,
  }
}

describe('Revision-bound signed offline issuer keyring cannot grant real signing',()=>{
  it('verifies one pinned root-signed version, selects one active issuer, never grants authority',async()=>{
    const f=fixture()
    const got=await f.verify()
    expect(got).toMatchObject({
      status:'verified_synthetic_registry_only',
      acceptedRevision:1,signatureVerified:true,
      revisionAccepted:true,trustedProductionRoot:false,
      humanApprovalVerified:false,signingAllowed:false,
      serverEnrollmentAllowed:false,codeDispatchAuthorized:false,
    })
    expect(got.activeIssuer?.issuerKeyId).toBe('issuer-a')
    expect(got.activeIssuer?.status).toBe('active')
    expect(f.getCalls()).toBe(1)
  })
  it('rotation replaces the active issuer and blocks signed rollback to old revision',async()=>{
    const f=fixture()
    expect((await f.verify(f.v1)).status).toBe('verified_synthetic_registry_only')
    const rotated=await f.verify(f.v2)
    expect(rotated.status).toBe('verified_synthetic_registry_only')
    expect(rotated.activeIssuer?.issuerKeyId).toBe('issuer-b')
    expect(rotated.revokedKeyIds).toEqual(['issuer-a'])
    const old=await f.verify(f.v1)
    expect(old.status).toBe('blocked')
    expect(old.reason).toBe('registry_replay_or_store_unavailable')
    expect(old.signingAllowed).toBe(false)
  })
  it('a receipt signed by the revoked old issuer cannot verify under new active issuer',async()=>{
    const f=fixture()
    const initial=await f.verify(f.v1)
    const latest=await f.verify(f.v2)
    expect(initial.activeIssuer).not.toBeNull()
    expect(latest.activeIssuer).not.toBeNull()
    const pkg={
      domain:'omnira.code_broker.enrollment.v1',
      enrollmentId:randomUUID(),hostId:randomUUID(),
      challenge:randomBytes(32).toString('base64url'),
      pairingCode:randomBytes(8).toString('hex').toUpperCase(),
      expiresAt:new Date(NOW+80_000).toISOString(),
      protocolVersion:1,algorithm:'ES256',
      allowedRepositoryIds:[REPO],
    }
    const thumbprint=randomBytes(32).toString('base64url')
    const unsigned:Omit<OfflineOwnerConsentTicket,'signature'>={
      version:WINDOWS_CONSENT_VERSION,domain:WINDOWS_CONSENT_DOMAIN,
      ticketId:randomUUID(),issuerKeyId:'issuer-a',
      ownerUserId:OWNER,enrollmentId:pkg.enrollmentId,hostId:pkg.hostId,
      challengeHash:brokerEnrollmentSecretHash('challenge',pkg.enrollmentId,pkg.challenge),
      pairingHash:brokerEnrollmentSecretHash('pairing',pkg.enrollmentId,pkg.pairingCode),
      publicKeyThumbprint:thumbprint,declaredBuildSha256:BUILD,
      repositoryId:REPO,action:'review_exact_enrollment_signature_offline',
      issuedAtMs:NOW,expiresAtMs:NOW+30_000,
      nonce:randomBytes(32).toString('base64url'),
    }
    const signature=sign('sha256',Buffer.from(canonicalOfflineOwnerConsent(unsigned)),{
      key:f.a.privateKey,dsaEncoding:'der',
    }).toString('base64url')
    const ticket={...unsigned,signature}
    const before=await reviewOfflineOwnerConsent({
      ticket,serverPackage:pkg,observedNowMs:NOW+2500,
      pinnedPolicy:{
        expectedOwnerUserId:OWNER,expectedTpmPublicThumbprint:thumbprint,
        expectedDeclaredBuildSha256:BUILD,issuer:initial.activeIssuer!,
      },
      consume:async()=>true,
    })
    expect(before.status).toBe('verified_synthetic_consent_only')
    expect(before.signingAllowed).toBe(false)

    const after=await reviewOfflineOwnerConsent({
      ticket,serverPackage:pkg,observedNowMs:NOW+2500,
      pinnedPolicy:{
        expectedOwnerUserId:OWNER,expectedTpmPublicThumbprint:thumbprint,
        expectedDeclaredBuildSha256:BUILD,issuer:latest.activeIssuer!,
      },
      consume:async()=>true,
    })
    expect(after.status).toBe('blocked')
    expect(after.issuerSignatureVerified).toBe(false)
    expect(after.signingAllowed).toBe(false)
  })
  it('refuses an unsigned/tampered root-signed registry before revision is consumed',async()=>{
    const f=fixture()
    for(const wrong of [
      {...f.v1,activeIssuerKeyId:'issuer-b'},
      {...f.v1,expiresAtMs:f.v1.expiresAtMs-1000},
      {...f.v1,issuers:[{...f.first,activatedAtMs:f.first.activatedAtMs-100}]},
      {...f.v1,signature:'invalid'},
    ]){
      expect((await f.verify(wrong)).status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('rejects registry signatures from an unpinned signing root',async()=>{
    const f=fixture()
    const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
    const fake=f.signed(f.unsigned(1,[f.first],'issuer-a'),other.privateKey)
    const denied=await f.verify(fake)
    expect(denied.reason).toBe('signature_invalid')
    expect(denied.trustedProductionRoot).toBe(false)
    expect(f.getCalls()).toBe(0)
  })
  it('rejects an absent, malformed or inactive governance root',async()=>{
    const f=fixture()
    for(const pinnedRoot of [
      null,{}, {...f.pinnedRoot,status:'revoked'},
      {...f.pinnedRoot,thumbprint:randomBytes(32).toString('base64url')},
      {...f.pinnedRoot,rootId:'other-root'},
      {...f.pinnedRoot,publicJwk:{...f.pinnedRoot.publicJwk,d:'private'}},
    ]){
      const got=await f.verify(f.v1,{pinnedRoot})
      expect(got.status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('rejects multiple active issuers and a wrong active alias',async()=>{
    const f=fixture()
    const both=f.signed(f.unsigned(2,[
      f.first,{...f.next,activatedAtMs:NOW-1000},
    ],'issuer-b'))
    expect((await f.verify(both)).status).toBe('blocked')
    const wrongAlias=f.signed(f.unsigned(2,[
      f.first,{...f.next,state:'retired',activatedAtMs:NOW-1500,
        disabledAtMs:NOW-500},
    ],'issuer-b'))
    expect((await f.verify(wrongAlias)).status).toBe('blocked')
  })
  it('rejects duplicate key ID, duplicated key material and unsorted issuers',async()=>{
    const f=fixture()
    for(const list of [
      [f.first,{...f.next,keyId:'issuer-a',activatedAtMs:NOW-1000}],
      [f.first,{...f.next,publicJwk:f.first.publicJwk,
        keyThumbprint:f.first.keyThumbprint,activatedAtMs:NOW-1000}],
      [{...f.next,activatedAtMs:NOW-1000},f.old],
    ]){
      const wrong=f.signed(f.unsigned(2,list,'issuer-b'))
      expect((await f.verify(wrong)).status).toBe('blocked')
    }
  })
  it('rejects private JWK claims, wrong thumbprints, impossible key lifetimes',async()=>{
    const f=fixture()
    for(const entry of [
      {...f.first,publicJwk:{...f.first.publicJwk,d:'secret'}},
      {...f.first,keyThumbprint:randomBytes(32).toString('base64url')},
      {...f.first,activatedAtMs:NOW+7000},
      {...f.first,disabledAtMs:NOW},
      {...f.first,state:'revoked',disabledAtMs:null},
      {...f.first,state:'retired',disabledAtMs:NOW+1000},
    ]){
      const wrong=f.signed(f.unsigned(1,[entry as OfflineIssuerRecord],'issuer-a'))
      expect((await f.verify(wrong)).status).toBe('blocked')
    }
    expect(f.getCalls()).toBe(0)
  })
  it('refuses expired, future, too-long or invalid revision claims',async()=>{
    const f=fixture()
    for(const input of [
      f.signed(f.unsigned(0,[f.first],'issuer-a')),
      f.signed(f.unsigned(1,[f.first],'issuer-a',NOW+9000)),
      f.signed({...f.unsigned(1,[f.first],'issuer-a'),expiresAtMs:NOW+240_000}),
      f.signed({...f.unsigned(1,[f.first],'issuer-a'),expiresAtMs:NOW-1}),
    ]){
      expect((await f.verify(input)).status).toBe('blocked')
    }
    const expired=await f.verify(f.v1,{observedNowMs:NOW+61_000})
    expect(expired.status).toBe('blocked')
    expect(expired.reason).toBe('registry_expired_or_future')
  })
  it('a replay store is mandatory: missing, rejecting and throwing callbacks fail closed',async()=>{
    const f=fixture()
    for(const acceptRevision of [
      null,async()=>false,async()=>{throw new Error('ledger unavailable')},
    ]){
      expect((await f.verify(f.v1,{acceptRevision})).status).toBe('blocked')
    }
  })
  it('refuses rollback even with newly root-signed copies of the same revision',async()=>{
    const f=fixture()
    expect((await f.verify(f.v1)).status).toBe('verified_synthetic_registry_only')
    const reSigned=f.signed(f.unsigned(1,[f.first],'issuer-a'))
    const result=await f.verify(reSigned)
    expect(result.status).toBe('blocked')
    expect(result.reason).toBe('registry_replay_or_store_unavailable')
  })
  it('synthetic double-consume only accepts one revision; neither result authorizes signing',async()=>{
    const f=fixture()
    const both=await Promise.all([f.verify(f.v1),f.verify(f.v1)])
    expect(both.filter(x=>x.status==='verified_synthetic_registry_only')).toHaveLength(1)
    expect(both.filter(x=>x.status==='blocked')).toHaveLength(1)
    expect(both.every(x=>x.signingAllowed===false)).toBe(true)
    expect(both.every(x=>x.codeDispatchAuthorized===false)).toBe(true)
  })
  it('a forged “success” replay callback never turns offline trust into server authority',async()=>{
    const f=fixture()
    const got=await f.verify(f.v1,{acceptRevision:async()=>true})
    expect(got.status).toBe('verified_synthetic_registry_only')
    expect(got.trustedProductionRoot).toBe(false)
    expect(got.humanApprovalVerified).toBe(false)
    expect(got.signingAllowed).toBe(false)
    expect(got.serverEnrollmentAllowed).toBe(false)
  })
  it('unknown attributes and altered protocol domains always fail closed',async()=>{
    const f=fixture()
    for(const input of [
      null,{},[],true,
      {...f.v1,privateKey:'secret'},
      {...f.v1,ownerApproved:true},
      {...f.v1,domain:'omnira.code_broker.enrollment.v1'},
      {...f.v1,issuers:[{...f.first,allowSigning:true}]},
    ]) expect((await f.verify(input)).status).toBe('blocked')
  })
})
