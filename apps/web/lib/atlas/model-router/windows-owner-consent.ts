/**
 * OFFLINE PROTOCOL REVIEW: server-signed, one-time owner-consent receipt.
 *
 * No real issuer key, server endpoint or signed consent exists in Omnira.
 * Trusted keys, owner identity, build policy and atomic replay authority
 * MUST originate from a separately reviewed server; do not accept them
 * from a browser, model response, desktop JSON or a request body.
 *
 * This prototype verifies SYNTHETIC consent only. The successful output
 * ALWAYS has signingAllowed:false, enrollmentAllowed:false and
 * dispatchAuthorized:false. Never wire this module to CNG/TPM signing.
 *
 * The human-operator authentication claim is not proven by a signature
 * alone. A real issuer must establish the operator's verified session and
 * log the exact affirmative action before it signs an approval.
 */
import { createHash, createPublicKey, verify } from 'node:crypto'
import { brokerEnrollmentSecretHash } from '../code-broker/protocol'
import { inspectWindowsBrokerEnrollmentPackage } from './windows-broker-issued-package'

export const WINDOWS_CONSENT_VERSION = 'omnira.windows-broker.owner-consent.review.v1' as const
export const WINDOWS_CONSENT_DOMAIN = 'omnira.code_broker.owner_consent.offline_review.v1' as const

const UUID_V4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const HEX64=/^[a-f0-9]{64}$/
const MAX_TICKET_MS=60_000
const CLOCK_SKEW_MS=5_000
const EXPECTED_REPOSITORY='github.com/bumbi190/ai-operating-platform' as const
const ACTION='review_exact_enrollment_signature_offline' as const
const EXACT_FIELDS=[
  'version','domain','ticketId','issuerKeyId','ownerUserId','enrollmentId',
  'hostId','challengeHash','pairingHash','publicKeyThumbprint',
  'declaredBuildSha256','repositoryId','action','issuedAtMs','expiresAtMs',
  'nonce','signature',
] as const

type P256Jwk = Readonly<{ kty:'EC'; crv:'P-256'; x:string; y:string }>
export type OfflineOwnerConsentTicket = Readonly<{
  version:typeof WINDOWS_CONSENT_VERSION
  domain:typeof WINDOWS_CONSENT_DOMAIN
  ticketId:string
  issuerKeyId:string
  ownerUserId:string
  enrollmentId:string
  hostId:string
  challengeHash:string
  pairingHash:string
  publicKeyThumbprint:string
  declaredBuildSha256:string
  repositoryId:typeof EXPECTED_REPOSITORY
  action:typeof ACTION
  issuedAtMs:number
  expiresAtMs:number
  nonce:string
  signature:string
}>

export interface OfflineTrustedIssuer {
  readonly issuerKeyId:string
  readonly issuerJwk:P256Jwk
  readonly issuerKeyThumbprint:string
  readonly status:'active'
}
export interface OfflineTrustedPolicy {
  readonly expectedOwnerUserId:string
  readonly expectedTpmPublicThumbprint:string
  readonly expectedDeclaredBuildSha256:string
  readonly issuer:OfflineTrustedIssuer
}

/**
 * This callback is ONLY a local synthetic stand-in. Real consumption would
 * have to be one server-owned durable transaction scoped to the owner,
 * enrollment, issuer key, id and nonce, before any signing authorization.
 * An injected "return true" can prove nothing in production.
 */
export type OfflineConsumeConsent=(data:Readonly<{
  ticketId:string
  ownerUserId:string
  enrollmentId:string
  issuerKeyId:string
  nonceSha256:string
}>)=>Promise<boolean>

export interface OfflineOwnerConsentDecision {
  readonly status:'verified_synthetic_consent_only'|'blocked'
  readonly reason:string
  readonly ticketId:string|null
  readonly issuerSignatureVerified:boolean
  readonly packageBindingVerified:boolean
  readonly syntheticReplayConsumed:boolean
  readonly serverOriginAuthenticated:false
  readonly humanApprovalVerified:false
  readonly signingAllowed:false
  readonly enrollmentAllowed:false
  readonly dispatchAuthorized:false
}

const record=(v:unknown):Record<string,unknown>|null =>
  v!==null && typeof v==='object' && !Array.isArray(v)
    ? v as Record<string,unknown>:null
const exact=(value:Record<string,unknown>,fields:readonly string[]) =>
  Object.keys(value).sort().join('|')===[...fields].sort().join('|')
const safeTime=(v:unknown):v is number=>
  typeof v==='number' && Number.isSafeInteger(v) && v>0
const b64=(v:unknown,bytes:number):v is string=>{
  if(typeof v!=='string' || !/^[A-Za-z0-9_-]+$/.test(v)) return false
  const buf=Buffer.from(v,'base64url')
  return buf.length===bytes && buf.toString('base64url')===v
}
const sha256=(s:string)=>
  createHash('sha256').update(s,'utf8').digest('hex')
function jwkThumbprint(jwk:P256Jwk) {
  return createHash('sha256').update(JSON.stringify({
    crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y,
  })).digest('base64url')
}
function trusted(policy:unknown):policy is OfflineTrustedPolicy {
  const p=record(policy)
  if(!p || !exact(p,[
    'expectedOwnerUserId','expectedTpmPublicThumbprint',
    'expectedDeclaredBuildSha256','issuer',
  ]) || typeof p.expectedOwnerUserId!=='string' ||
    !UUID.test(p.expectedOwnerUserId) ||
    !b64(p.expectedTpmPublicThumbprint,32) ||
    typeof p.expectedDeclaredBuildSha256!=='string' ||
    !HEX64.test(p.expectedDeclaredBuildSha256)) return false
  const issuer=record(p.issuer)
  if(!issuer || !exact(issuer,[
    'issuerKeyId','issuerJwk','issuerKeyThumbprint','status',
  ]) || issuer.status!=='active' ||
    typeof issuer.issuerKeyId!=='string' ||
    !/^[a-zA-Z0-9._-]{3,64}$/.test(issuer.issuerKeyId) ||
    !b64(issuer.issuerKeyThumbprint,32)) return false
  const jwk=record(issuer.issuerJwk)
  if(!jwk || !exact(jwk,['kty','crv','x','y']) ||
    jwk.kty!=='EC' || jwk.crv!=='P-256' ||
    !b64(jwk.x,32) || !b64(jwk.y,32)) return false
  try {
    createPublicKey({key:jwk as import('node:crypto').JsonWebKey,format:'jwk'})
    return jwkThumbprint(jwk as P256Jwk)===issuer.issuerKeyThumbprint
  } catch { return false }
}
function parsed(input:unknown):OfflineOwnerConsentTicket|null {
  const t=record(input)
  if(!t || !exact(t,EXACT_FIELDS) ||
    t.version!==WINDOWS_CONSENT_VERSION ||
    t.domain!==WINDOWS_CONSENT_DOMAIN ||
    typeof t.ticketId!=='string' || !UUID_V4.test(t.ticketId) ||
    typeof t.issuerKeyId!=='string' ||
    !/^[a-zA-Z0-9._-]{3,64}$/.test(t.issuerKeyId) ||
    typeof t.ownerUserId!=='string' || !UUID.test(t.ownerUserId) ||
    typeof t.enrollmentId!=='string' || !UUID_V4.test(t.enrollmentId) ||
    typeof t.hostId!=='string' || !UUID_V4.test(t.hostId) ||
    t.hostId===t.enrollmentId ||
    typeof t.challengeHash!=='string' || !HEX64.test(t.challengeHash) ||
    typeof t.pairingHash!=='string' || !HEX64.test(t.pairingHash) ||
    !b64(t.publicKeyThumbprint,32) ||
    typeof t.declaredBuildSha256!=='string' ||
    !HEX64.test(t.declaredBuildSha256) ||
    t.repositoryId!==EXPECTED_REPOSITORY || t.action!==ACTION ||
    !safeTime(t.issuedAtMs) || !safeTime(t.expiresAtMs) ||
    t.expiresAtMs<=t.issuedAtMs ||
    t.expiresAtMs-t.issuedAtMs>MAX_TICKET_MS ||
    !b64(t.nonce,32) ||
    typeof t.signature!=='string' || !/^[A-Za-z0-9_-]{8,120}$/.test(t.signature))
    return null
  return t as unknown as OfflineOwnerConsentTicket
}

/** Stable, domain-separated, line-ordered bytes. NEVER put raw pairing codes here. */
export function canonicalOfflineOwnerConsent(
  ticket:Omit<OfflineOwnerConsentTicket,'signature'>,
):string {
  return [
    WINDOWS_CONSENT_DOMAIN,
    'version:'+ticket.version,
    'ticket_id:'+ticket.ticketId,
    'issuer_key_id:'+ticket.issuerKeyId,
    'owner_user_id:'+ticket.ownerUserId,
    'enrollment_id:'+ticket.enrollmentId,
    'host_id:'+ticket.hostId,
    'challenge_hash:'+ticket.challengeHash,
    'pairing_hash:'+ticket.pairingHash,
    'public_key_thumbprint:'+ticket.publicKeyThumbprint,
    'declared_build_sha256:'+ticket.declaredBuildSha256,
    'repository_id:'+ticket.repositoryId,
    'action:'+ticket.action,
    'issued_at_ms:'+ticket.issuedAtMs,
    'expires_at_ms:'+ticket.expiresAtMs,
    'nonce:'+ticket.nonce,
  ].join('\n')
}

/** PUBLIC contract only; never returns secrets or authorizes real signing. */
export async function reviewOfflineOwnerConsent(input:Readonly<{
  ticket:unknown
  serverPackage:unknown
  pinnedPolicy:unknown
  observedNowMs:number
  consume:OfflineConsumeConsent|null|undefined
}>):Promise<OfflineOwnerConsentDecision> {
  const block=(reason:string):OfflineOwnerConsentDecision=>({
    status:'blocked',reason,ticketId:null,
    issuerSignatureVerified:false,packageBindingVerified:false,
    syntheticReplayConsumed:false,serverOriginAuthenticated:false,
    humanApprovalVerified:false,signingAllowed:false,
    enrollmentAllowed:false,dispatchAuthorized:false,
  })
  const {ticket,serverPackage,pinnedPolicy,observedNowMs,consume}=input
  const t=parsed(ticket)
  if(!t || !safeTime(observedNowMs) || typeof consume!=='function')
    return block('invalid_receipt_or_replay_store')
  if(!trusted(pinnedPolicy))
    return block('issuer_not_pinned_or_policy_invalid')
  if(t.issuerKeyId!==pinnedPolicy.issuer.issuerKeyId ||
     t.ownerUserId!==pinnedPolicy.expectedOwnerUserId ||
     t.publicKeyThumbprint!==pinnedPolicy.expectedTpmPublicThumbprint ||
     t.declaredBuildSha256!==pinnedPolicy.expectedDeclaredBuildSha256)
    return block('receipt_not_bound_to_expected_owner_key_or_build')

  if(observedNowMs<t.issuedAtMs-CLOCK_SKEW_MS ||
     observedNowMs>=t.expiresAtMs ||
     t.issuedAtMs>observedNowMs+CLOCK_SKEW_MS)
    return block('receipt_expired_or_future')

  const packageView=inspectWindowsBrokerEnrollmentPackage(serverPackage,observedNowMs)
  const source=record(serverPackage)
  if(packageView.status!=='shape_valid_untrusted' || !source ||
      packageView.enrollmentId!==t.enrollmentId ||
      packageView.hostId!==t.hostId ||
      typeof source.challenge!=='string' || typeof source.pairingCode!=='string' ||
      packageView.expiresAt===null ||
      t.expiresAtMs>Date.parse(packageView.expiresAt))
    return block('challenge_shape_or_binding_invalid')

  // The operator ticket binds to hashes of the CURRENT server challenge and
  // pairing, not any raw secret text included in the certificate.
  if(t.challengeHash!==brokerEnrollmentSecretHash('challenge',t.enrollmentId,source.challenge) ||
     t.pairingHash!==brokerEnrollmentSecretHash('pairing',t.enrollmentId,source.pairingCode))
    return block('challenge_or_pairing_mismatch')

  try {
    const signature=Buffer.from(t.signature,'base64url')
    if(signature.length<68 || signature.length>80 ||
       signature.toString('base64url')!==t.signature) return block('signature_format_invalid')
    const key=createPublicKey({
      key:pinnedPolicy.issuer.issuerJwk as import('node:crypto').JsonWebKey,
      format:'jwk',
    })
    const {signature:_sig,...unsigned}=t
    if(!verify('sha256',Buffer.from(canonicalOfflineOwnerConsent(unsigned),'utf8'),
      {key,dsaEncoding:'der'},signature)) return block('issuer_signature_invalid')
  } catch { return block('issuer_signature_invalid') }

  // Single-use is always after full crypto verification. This memory test
  // interface is NOT the production database atomicity implementation.
  try {
    const done=await consume({
      ticketId:t.ticketId,ownerUserId:t.ownerUserId,
      enrollmentId:t.enrollmentId,issuerKeyId:t.issuerKeyId,
      nonceSha256:sha256(t.nonce),
    })
    if(done!==true) return block('replay_or_consumption_unavailable')
  } catch { return block('replay_or_consumption_unavailable') }

  return {
    status:'verified_synthetic_consent_only',
    reason:'signature_and_replay_checked_but_no_real_server_authority',
    ticketId:t.ticketId,
    issuerSignatureVerified:true,
    packageBindingVerified:true,
    syntheticReplayConsumed:true,
    serverOriginAuthenticated:false,
    humanApprovalVerified:false,
    signingAllowed:false,
    enrollmentAllowed:false,
    dispatchAuthorized:false,
  }
}
