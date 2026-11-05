/**
 * SERVER-SIDE DESIGN SPIKE. A fully synthetic issuer for unit tests ONLY.
 *
 * NOT an API, production issuer, authenticated approval endpoint, or bridge
 * to the Windows TPM. It is disabled unless NODE_ENV === 'test'.
 * It has no env/configured private key and cannot run outside tests.
 *
 * A future, independently audited server implementation MUST derive the
 * owner from resolvePlatformOperator(), source a reviewed affirmative
 * per-signature action from a trusted UI/session path, fetch the actual
 * enrollment from the DB, use KMS and atomically reserve an action + ticket.
 * NONE of that production authority exists in this module.
 */
import 'server-only'
import { createHash, createPublicKey, verify } from 'node:crypto'
import type { StoredBrokerEnrollment } from '../code-broker/types'
import { brokerEnrollmentSecretHash } from '../code-broker/protocol'
import { inspectWindowsBrokerEnrollmentPackage } from './windows-broker-issued-package'
import {
  canonicalOfflineOwnerConsent,
  WINDOWS_CONSENT_DOMAIN,
  WINDOWS_CONSENT_VERSION,
  type OfflineOwnerConsentTicket,
  type OfflineTrustedPolicy,
} from './windows-owner-consent'

const UUID_V4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const HEX64=/^[a-f0-9]{64}$/
const ACTION='review_exact_enrollment_signature_offline' as const
const REPOSITORY='github.com/bumbi190/ai-operating-platform' as const
const TTL_MS=60_000
const APPROVAL_MAX_AGE_MS=60_000

// Evidence is deliberately *not* a production approval source.
export interface SyntheticOwnerAction {
  readonly source:'in_memory_test_only'
  readonly affirmative:true
  readonly approvalActionId:string
  readonly ownerUserId:string
  readonly enrollmentId:string
  readonly hostId:string
  readonly challengeHash:string
  readonly pairingHash:string
  readonly publicKeyThumbprint:string
  readonly declaredBuildSha256:string
  readonly recordedAtMs:number
}

/**
 * Test-local shape of the existing verified session result, deliberately
 * not imported from the live Auth module and NOT itself an auth credential.
 */
export type SyntheticOperatorResult =
  | Readonly<{ok:true;userId:string;email:string;actor:string}>
  | Readonly<{ok:false;reason:string}>

export interface SyntheticIssuerDependencies {
  readonly operator:()=>Promise<SyntheticOperatorResult>
  readonly action:()=>Promise<unknown>
  readonly enrollmentById:(id:string)=>Promise<StoredBrokerEnrollment|null>
  readonly reserveOnce:(input:Readonly<{
    approvalActionId:string
    ticketId:string
    ownerUserId:string
    enrollmentId:string
    hostId:string
    issuerKeyId:string
    nonceSha256:string
    expiresAtMs:number
  }>)=>Promise<boolean>
  readonly signCanonical:(canonical:string)=>Promise<string>
  readonly trustedPolicy:OfflineTrustedPolicy
  readonly allowedBuildHashes:ReadonlySet<string>
  readonly nowMs:()=>number
  readonly freshUUID:()=>string
  readonly freshNonce32:()=>Buffer
}

export type SyntheticIssueOutcome = Readonly<{
  status:'synthetic_receipt_signed'|'blocked'
  reason:string
  receipt:OfflineOwnerConsentTicket|null
  serverOperatorAuthenticated:false
  actualHumanConsentVerified:false
  realServerIssuerProvisioned:false
  realEnrollmentIssued:false
  signingAllowed:false
  brokerActivationAllowed:false
  dispatchAuthorized:false
}>

const record=(x:unknown):Record<string,unknown>|null=>
  x!==null && typeof x==='object' && !Array.isArray(x)
    ? x as Record<string,unknown> : null
const keys=(x:Record<string,unknown>, names:readonly string[])=>
  Object.keys(x).sort().join('|')===[...names].sort().join('|')
const sha=(data:string)=>
  createHash('sha256').update(data,'utf8').digest('hex')
const isSafeTime=(x:unknown):x is number=>
  typeof x==='number' && Number.isSafeInteger(x) && x>0

function actionOf(x:unknown):SyntheticOwnerAction|null {
  const v=record(x)
  if(!v || !keys(v,[
    'source','affirmative','approvalActionId','ownerUserId',
    'enrollmentId','hostId','challengeHash','pairingHash',
    'publicKeyThumbprint','declaredBuildSha256','recordedAtMs',
  ]) || v.source!=='in_memory_test_only' || v.affirmative!==true ||
    typeof v.approvalActionId!=='string' || !UUID_V4.test(v.approvalActionId) ||
    typeof v.ownerUserId!=='string' ||
    typeof v.enrollmentId!=='string' || !UUID_V4.test(v.enrollmentId) ||
    typeof v.hostId!=='string' || !UUID_V4.test(v.hostId) ||
    typeof v.challengeHash!=='string' || !HEX64.test(v.challengeHash) ||
    typeof v.pairingHash!=='string' || !HEX64.test(v.pairingHash) ||
    typeof v.publicKeyThumbprint!=='string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(v.publicKeyThumbprint) ||
    typeof v.declaredBuildSha256!=='string' ||
    !HEX64.test(v.declaredBuildSha256) ||
    !isSafeTime(v.recordedAtMs)) return null
  return v as unknown as SyntheticOwnerAction
}

export async function issueOfflineSyntheticOwnerConsent(input:Readonly<{
  serverPackage:unknown
  deps:SyntheticIssuerDependencies
}>):Promise<SyntheticIssueOutcome> {
  const denied=(reason:string):SyntheticIssueOutcome=>({
    status:'blocked',reason,receipt:null,
    serverOperatorAuthenticated:false,actualHumanConsentVerified:false,
    realServerIssuerProvisioned:false,realEnrollmentIssued:false,
    signingAllowed:false,brokerActivationAllowed:false,
    dispatchAuthorized:false,
  })

  // A deployment MUST NOT be able to start a signer by passing dependencies.
  if(process.env.NODE_ENV!=='test') return denied('disabled_outside_test')
  const {deps,serverPackage}=input
  if(!deps || typeof deps.operator!=='function' ||
    typeof deps.action!=='function' ||
    typeof deps.enrollmentById!=='function' ||
    typeof deps.reserveOnce!=='function' ||
    typeof deps.signCanonical!=='function' ||
    typeof deps.nowMs!=='function' ||
    typeof deps.freshUUID!=='function' ||
    typeof deps.freshNonce32!=='function') return denied('invalid_synthetic_dependencies')

  try {
    const now=deps.nowMs()
    if(!isSafeTime(now)) return denied('invalid_clock')
    const operator=await deps.operator()
    if(!operator.ok || !UUID_V4.test(operator.userId) ||
       operator.actor!== 'user:'+operator.userId)
      return denied('synthetic_operator_rejected')
    const action=actionOf(await deps.action())
    if(!action || action.ownerUserId!==operator.userId ||
      action.recordedAtMs>now || now-action.recordedAtMs>APPROVAL_MAX_AGE_MS)
      return denied('synthetic_affirmative_action_missing')

    const packageStatus=inspectWindowsBrokerEnrollmentPackage(serverPackage,now)
    const pkg=record(serverPackage)
    if(packageStatus.status!=='shape_valid_untrusted' || !pkg ||
      pkg.enrollmentId!==action.enrollmentId ||
      pkg.hostId!==action.hostId ||
      typeof pkg.challenge!=='string' ||
      typeof pkg.pairingCode!=='string' ||
      pkg.allowedRepositoryIds===undefined)
      return denied('issued_package_shape_or_action_mismatch')

    const chash=brokerEnrollmentSecretHash(
      'challenge',action.enrollmentId,pkg.challenge)
    const phash=brokerEnrollmentSecretHash(
      'pairing',action.enrollmentId,pkg.pairingCode)
    if(chash!==action.challengeHash || phash!==action.pairingHash)
      return denied('synthetic_approval_binding_mismatch')

    const stored=await deps.enrollmentById(action.enrollmentId)
    if(!stored || stored.state!=='issued' || stored.consumedAt!==null ||
      stored.approvedAt!==null ||
      stored.requestedBy!==operator.userId ||
      stored.hostId!==action.hostId ||
      stored.challengeHash!==chash || stored.pairingCodeHash!==phash ||
      stored.allowedRepositoryIds.length!==1 ||
      stored.allowedRepositoryIds[0]!==REPOSITORY ||
      Date.parse(stored.expiresAt)<=now ||
      !Number.isFinite(Date.parse(stored.expiresAt)))
      return denied('no_matching_unconsumed_owner_enrollment')

    const policy=deps.trustedPolicy
    if(!policy || policy.expectedOwnerUserId!==operator.userId ||
       action.publicKeyThumbprint!==policy.expectedTpmPublicThumbprint ||
       action.declaredBuildSha256!==policy.expectedDeclaredBuildSha256 ||
       !deps.allowedBuildHashes.has(action.declaredBuildSha256) ||
       policy.issuer.status!=='active' ||
       !/^[a-zA-Z0-9._-]{3,64}$/.test(policy.issuer.issuerKeyId))
      return denied('issuer_owner_key_or_build_not_pinned')

    // Validate the *pinned public* issuer before committing an irreversible
    // one-time approval reservation. A fake/rotated JWK must not burn a ticket.
    const issuerJwk=record(policy.issuer.issuerJwk)
    if(!issuerJwk || !keys(issuerJwk,['kty','crv','x','y']) ||
       issuerJwk.kty!=='EC' || issuerJwk.crv!=='P-256' ||
       typeof issuerJwk.x!=='string' ||
       typeof issuerJwk.y!=='string') return denied('issuer_public_key_not_pinned')
    const issuerKey=createPublicKey({
      key:issuerJwk as import('node:crypto').JsonWebKey,format:'jwk',
    })
    const issuerThumbprint=createHash('sha256').update(JSON.stringify({
      crv:'P-256',kty:'EC',x:issuerJwk.x,y:issuerJwk.y,
    })).digest('base64url')
    if(issuerThumbprint!==policy.issuer.issuerKeyThumbprint)
      return denied('issuer_public_key_not_pinned')

    const endsAt=Math.min(now+TTL_MS,
      Date.parse(stored.expiresAt),
      Date.parse(pkg.expiresAt as string))
    if(endsAt<=now) return denied('consent_expiry_exceeded')
    const ticketId=deps.freshUUID()
    const nonce=deps.freshNonce32()
    if(!UUID_V4.test(ticketId) || !Buffer.isBuffer(nonce) ||
       nonce.length!==32) return denied('randomness_invalid')
    const nonceString=nonce.toString('base64url')

    // The unique approval action + unique ticket are durably reserved
    // BEFORE signing in a hypothetical production sequence. If signing fails,
    // the reservation stays spent. This is fail-closed and retry-safe.
    const reserved=await deps.reserveOnce({
      approvalActionId:action.approvalActionId,ticketId,
      ownerUserId:operator.userId,enrollmentId:action.enrollmentId,
      hostId:action.hostId,issuerKeyId:policy.issuer.issuerKeyId,
      nonceSha256:sha(nonceString),expiresAtMs:endsAt,
    })
    if(reserved!==true) return denied('already_reserved_or_store_unavailable')

    const unsigned:Omit<OfflineOwnerConsentTicket,'signature'>={
      version:WINDOWS_CONSENT_VERSION,domain:WINDOWS_CONSENT_DOMAIN,
      ticketId,issuerKeyId:policy.issuer.issuerKeyId,
      ownerUserId:operator.userId,enrollmentId:action.enrollmentId,
      hostId:action.hostId,challengeHash:chash,pairingHash:phash,
      publicKeyThumbprint:action.publicKeyThumbprint,
      declaredBuildSha256:action.declaredBuildSha256,
      repositoryId:REPOSITORY,action:ACTION,
      issuedAtMs:now,expiresAtMs:endsAt,nonce:nonceString,
    }
    const canonical=canonicalOfflineOwnerConsent(unsigned)
    const signature=await deps.signCanonical(canonical)
    if(typeof signature!=='string') return denied('signer_failed')
    const raw=Buffer.from(signature,'base64url')
    if(raw.length<68 || raw.length>80 ||
       raw.toString('base64url')!==signature)
      return denied('noncanonical_signature')
    if(!verify('sha256',Buffer.from(canonical,'utf8'),
      {key:issuerKey,dsaEncoding:'der'},raw))
      return denied('issuer_signature_failed_verification')

    const receipt={...unsigned,signature}
    return {
      status:'synthetic_receipt_signed',
      reason:'offline_fixture_only_not_a_real_owner_approval',
      receipt,
      serverOperatorAuthenticated:false,actualHumanConsentVerified:false,
      realServerIssuerProvisioned:false,realEnrollmentIssued:false,
      signingAllowed:false,brokerActivationAllowed:false,
      dispatchAuthorized:false,
    }
  } catch {
    // Never include raw enrollment challenge, pairing, key data or exception
    // text in user-visible error/analytics.
    return denied('synthetic_server_dependency_failed')
  }
}
