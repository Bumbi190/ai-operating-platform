/**
 * SYNTHETIC OFFLINE TRUST-REGISTRY REVIEW ONLY.
 *
 * A separately pinned PUBLIC governance root signs a revisioned, short-lived
 * issuer keyring. In memory, a newer snapshot can revoke/replace old issuer
 * keys. This does NOT create a KMS key, root authority or Windows enrollment.
 *
 * SECURITY: pinnedRoot and acceptRevision MUST be independent, trusted server
 * dependencies in any future live implementation. They MUST NEVER be taken
 * from a client/browser/model payload. The callback in tests is only a stub.
 * Regardless of signature validity, outputs do NOT authorize TPM signing,
 * enrollment, Code Broker activation, model routing or spend.
 */
import { createHash, createPublicKey, verify } from 'node:crypto'
import type { OfflineTrustedIssuer } from './windows-owner-consent'

export const OWNER_ISSUER_KEYRING_VERSION =
  'omnira.windows.owner-issuer-keyring.offline.v1' as const
export const OWNER_ISSUER_KEYRING_DOMAIN =
  'omnira.code_broker.owner_issuer_keyring.offline_review.v1' as const

const MAX_BUNDLE_LIFETIME_MS = 120_000
const MAX_TIME_SKEW_MS = 5_000
const MAX_ISSUERS = 4
const KEY_ID = /^[a-zA-Z0-9._-]{3,64}$/
const STATUS = ['active','retired','revoked'] as const
const JWK_KEYS=['kty','crv','x','y'] as const

type P256Jwk=Readonly<{kty:'EC';crv:'P-256';x:string;y:string}>
export type OfflineKeyState=(typeof STATUS)[number]

export type OfflineIssuerRecord=Readonly<{
  keyId:string
  publicJwk:P256Jwk
  keyThumbprint:string
  state:OfflineKeyState
  activatedAtMs:number
  disabledAtMs:number|null
}>
export type OfflineIssuerKeyring=Readonly<{
  version:typeof OWNER_ISSUER_KEYRING_VERSION
  domain:typeof OWNER_ISSUER_KEYRING_DOMAIN
  revision:number
  governanceRootId:string
  issuedAtMs:number
  expiresAtMs:number
  activeIssuerKeyId:string
  issuers:readonly OfflineIssuerRecord[]
  signature:string
}>
export type OfflinePinnedGovernanceRoot=Readonly<{
  rootId:string
  publicJwk:P256Jwk
  thumbprint:string
  status:'trusted_for_offline_review'
}>
export type OfflineAcceptKeyringRevision=(args:Readonly<{
  rootId:string
  revision:number
  canonicalSha256:string
}>)=>Promise<boolean>

export type OfflineIssuerKeyringDecision=Readonly<{
  status:'verified_synthetic_registry_only'|'blocked'
  reason:string
  acceptedRevision:number|null
  activeIssuer:OfflineTrustedIssuer|null
  revokedKeyIds:readonly string[]
  signatureVerified:boolean
  revisionAccepted:boolean
  trustedProductionRoot:false
  humanApprovalVerified:false
  signingAllowed:false
  serverEnrollmentAllowed:false
  codeDispatchAuthorized:false
}>

const record=(x:unknown):Record<string,unknown>|null=>
  x!==null && typeof x==='object' && !Array.isArray(x)
    ? x as Record<string,unknown> : null
const exact=(r:Record<string,unknown>,keys:readonly string[]) =>
  Object.keys(r).sort().join('|')===[...keys].sort().join('|')
const safeTime=(x:unknown):x is number=>
  typeof x==='number' && Number.isSafeInteger(x) && x>0
const sha256=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex')
const b64=(s:unknown,n:number):s is string=>{
  if(typeof s!=='string' || !/^[A-Za-z0-9_-]+$/.test(s)) return false
  const b=Buffer.from(s,'base64url')
  return b.length===n && b.toString('base64url')===s
}
const thumbprint=(j:P256Jwk)=>
  createHash('sha256').update(JSON.stringify({
    crv:j.crv,kty:j.kty,x:j.x,y:j.y,
  })).digest('base64url')

function validPublicJwk(v:unknown):v is P256Jwk {
  const j=record(v)
  if(!j || !exact(j,JWK_KEYS) || j.kty!=='EC' ||
     j.crv!=='P-256' || !b64(j.x,32) || !b64(j.y,32)) return false
  try {
    createPublicKey({key:j as import('node:crypto').JsonWebKey,format:'jwk'})
    return true
  } catch {return false}
}

function validRoot(v:unknown):v is OfflinePinnedGovernanceRoot {
  const root=record(v)
  return !!root && exact(root,['rootId','publicJwk','thumbprint','status']) &&
    typeof root.rootId==='string' && KEY_ID.test(root.rootId) &&
    root.status==='trusted_for_offline_review' &&
    validPublicJwk(root.publicJwk) &&
    b64(root.thumbprint,32) &&
    thumbprint(root.publicJwk)===root.thumbprint
}

function validIssuer(v:unknown,issuedAtMs:number):v is OfflineIssuerRecord {
  const e=record(v)
  if(!e || !exact(e,[
    'keyId','publicJwk','keyThumbprint','state',
    'activatedAtMs','disabledAtMs',
  ]) || typeof e.keyId!=='string' || !KEY_ID.test(e.keyId) ||
     !validPublicJwk(e.publicJwk) ||
     !b64(e.keyThumbprint,32) ||
     thumbprint(e.publicJwk)!==e.keyThumbprint ||
     !STATUS.includes(e.state as OfflineKeyState) ||
     !safeTime(e.activatedAtMs) ||
     e.activatedAtMs>issuedAtMs) return false
  if(e.state==='active') return e.disabledAtMs===null
  return safeTime(e.disabledAtMs) &&
    e.disabledAtMs >= e.activatedAtMs &&
    e.disabledAtMs<=issuedAtMs
}

function parsed(input:unknown):OfflineIssuerKeyring|null {
  const r=record(input)
  if(!r || !exact(r,[
    'version','domain','revision','governanceRootId','issuedAtMs',
    'expiresAtMs','activeIssuerKeyId','issuers','signature',
  ]) || r.version!==OWNER_ISSUER_KEYRING_VERSION ||
     r.domain!==OWNER_ISSUER_KEYRING_DOMAIN ||
     typeof r.revision!=='number' ||
     !Number.isSafeInteger(r.revision) || r.revision<1 ||
     typeof r.governanceRootId!=='string' ||
     !KEY_ID.test(r.governanceRootId) ||
     !safeTime(r.issuedAtMs) || !safeTime(r.expiresAtMs) ||
     r.expiresAtMs<=r.issuedAtMs ||
     r.expiresAtMs-r.issuedAtMs>MAX_BUNDLE_LIFETIME_MS ||
     typeof r.activeIssuerKeyId!=='string' ||
     !KEY_ID.test(r.activeIssuerKeyId) ||
     !Array.isArray(r.issuers) || r.issuers.length===0 ||
     r.issuers.length>MAX_ISSUERS ||
     typeof r.signature!=='string' ||
     !/^[A-Za-z0-9_-]{8,120}$/.test(r.signature)) return null

  const keys=new Set<string>()
  const fingerprints=new Set<string>()
  let activeCount=0
  for(const entry of r.issuers){
    if(!validIssuer(entry,r.issuedAtMs)) return null
    if(keys.has(entry.keyId) || fingerprints.has(entry.keyThumbprint)) return null
    keys.add(entry.keyId)
    fingerprints.add(entry.keyThumbprint)
    if(entry.state==='active'){
      activeCount++
      if(entry.keyId!==r.activeIssuerKeyId) return null
    }
  }
  if(activeCount!==1) return null
  // The signed file must have one unambiguous canonical issuer ordering.
  const orderedIssuers=r.issuers
  if(orderedIssuers.some((e,i)=>i>0 && orderedIssuers[i-1].keyId>=e.keyId))
    return null
  return r as unknown as OfflineIssuerKeyring
}

/**
 * Canonical bytes for OFFLINE tests only: fixed field order and a stable,
 * server-authored JWK layout. This is NOT a production trust policy.
 */
export function canonicalOfflineIssuerKeyring(
  input:Omit<OfflineIssuerKeyring,'signature'>,
):string {
  return [
    OWNER_ISSUER_KEYRING_DOMAIN,
    'version:'+input.version,
    'root_id:'+input.governanceRootId,
    'revision:'+input.revision,
    'issued_at_ms:'+input.issuedAtMs,
    'expires_at_ms:'+input.expiresAtMs,
    'active_issuer_key_id:'+input.activeIssuerKeyId,
    'issuer_count:'+input.issuers.length,
    ...input.issuers.flatMap(i=>[
      'key_id:'+i.keyId,
      'key_state:'+i.state,
      'activated_at_ms:'+i.activatedAtMs,
      'disabled_at_ms:'+(i.disabledAtMs===null?'none':i.disabledAtMs),
      'public_jwk:'+JSON.stringify({
        crv:i.publicJwk.crv,kty:i.publicJwk.kty,
        x:i.publicJwk.x,y:i.publicJwk.y,
      }),
      'key_thumbprint:'+i.keyThumbprint,
    ]),
  ].join('\n')
}

export async function reviewOfflineIssuerKeyring(input:Readonly<{
  registry:unknown
  pinnedRoot:unknown
  observedNowMs:number
  acceptRevision:OfflineAcceptKeyringRevision|null|undefined
}>):Promise<OfflineIssuerKeyringDecision> {
  const deny=(reason:string):OfflineIssuerKeyringDecision=>({
    status:'blocked',reason,acceptedRevision:null,
    activeIssuer:null,revokedKeyIds:[],signatureVerified:false,
    revisionAccepted:false,trustedProductionRoot:false,
    humanApprovalVerified:false,signingAllowed:false,
    serverEnrollmentAllowed:false,codeDispatchAuthorized:false,
  })
  const {registry,pinnedRoot,observedNowMs,acceptRevision}=input
  const r=parsed(registry)
  if(!r || !safeTime(observedNowMs) ||
     typeof acceptRevision!=='function') return deny('invalid_registry_or_revision_store')
  if(!validRoot(pinnedRoot) ||
     r.governanceRootId!==pinnedRoot.rootId)
    return deny('governance_root_untrusted')
  if(observedNowMs<r.issuedAtMs-MAX_TIME_SKEW_MS ||
     observedNowMs>=r.expiresAtMs ||
     r.issuedAtMs>observedNowMs+MAX_TIME_SKEW_MS)
    return deny('registry_expired_or_future')

  const {signature,...unsigned}=r
  const signedBytes=canonicalOfflineIssuerKeyring(unsigned)
  try {
    const raw=Buffer.from(signature,'base64url')
    if(raw.length<68 || raw.length>80 ||
       raw.toString('base64url')!==signature)
      return deny('signature_encoding_invalid')
    const pub=createPublicKey({
      key:pinnedRoot.publicJwk as import('node:crypto').JsonWebKey,
      format:'jwk',
    })
    if(!verify('sha256',Buffer.from(signedBytes,'utf8'),
      {key:pub,dsaEncoding:'der'},raw)) return deny('signature_invalid')
  } catch {return deny('signature_invalid')}

  // A real rollback boundary must atomically compare-and-increment the
  // revision for this root under a lock. A caller callback is NOT
  // production-grade authority; we only test its required behavior.
  try {
    const ok=await acceptRevision({
      rootId:r.governanceRootId,
      revision:r.revision,
      canonicalSha256:sha256(signedBytes),
    })
    if(ok!==true) return deny('registry_replay_or_store_unavailable')
  } catch {return deny('registry_replay_or_store_unavailable')}

  const active=r.issuers.find(x=>x.state==='active')!
  return {
    status:'verified_synthetic_registry_only',
    reason:'root_signature_valid_but_no_real_trust_authority',
    acceptedRevision:r.revision,
    activeIssuer:{
      issuerKeyId:active.keyId,
      issuerJwk:active.publicJwk,
      issuerKeyThumbprint:active.keyThumbprint,
      status:'active',
    },
    revokedKeyIds:r.issuers.filter(x=>x.state==='revoked')
      .map(x=>x.keyId),
    signatureVerified:true,revisionAccepted:true,
    trustedProductionRoot:false,humanApprovalVerified:false,
    signingAllowed:false,serverEnrollmentAllowed:false,
    codeDispatchAuthorized:false,
  }
}
