/**
 * OFFLINE / NON-AUTHORITATIVE review of a potential server enrollment package.
 *
 * Valid syntax is NOT proof the package was issued by Atlas. The real broker
 * client must receive it from an authenticated owner-controlled channel and
 * obtain explicit approval before using the hardware key. This module never
 * signs, sends, saves or returns the challenge or pairing code.
 */
import {
  BROKER_PROTOCOL_VERSION, OMNIRA_REPOSITORY_ID,
} from '../code-broker/types'

export const ENROLLMENT_PACKAGE_REVIEW_VERSION =
  'atlas.windows-enrollment-package.review.v1' as const
const DOMAIN='omnira.code_broker.enrollment.v1'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TEN_MINUTES=600_000

export type WindowsEnrollmentPackageReview = Readonly<{
  version:typeof ENROLLMENT_PACKAGE_REVIEW_VERSION
  status:'shape_valid_untrusted' | 'blocked'
  enrollmentId:string|null
  hostId:string|null
  expiresAt:string|null
  repositoryId:typeof OMNIRA_REPOSITORY_ID
  challengeLengthBytes:32|null
  pairingCodeLengthBytes:8|null
  authenticatedOriginVerified:false
  ownerApprovedForSigning:false
  permissionToSign:false
  serverEnrollmentAttempted:false
  modelExecutionAuthorized:false
  reason:string
}>

const isRecord=(x:unknown):x is Record<string,unknown> =>
  !!x && typeof x==='object' && !Array.isArray(x)

function canonicalB64(value:unknown,bytes:number):value is string {
  if (typeof value!=='string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false
  const raw=Buffer.from(value,'base64url')
  return raw.length===bytes && raw.toString('base64url')===value
}

export function inspectWindowsBrokerEnrollmentPackage(
  packageFromUnknownOrigin:unknown,
  nowMs:number,
):WindowsEnrollmentPackageReview {
  const fail=(reason:string):WindowsEnrollmentPackageReview=>({
    version:ENROLLMENT_PACKAGE_REVIEW_VERSION,
    status:'blocked',enrollmentId:null,hostId:null,expiresAt:null,
    repositoryId:OMNIRA_REPOSITORY_ID,
    challengeLengthBytes:null,pairingCodeLengthBytes:null,
    authenticatedOriginVerified:false,ownerApprovedForSigning:false,
    permissionToSign:false,serverEnrollmentAttempted:false,
    modelExecutionAuthorized:false,reason,
  })
  if (!Number.isSafeInteger(nowMs) || nowMs<=0) return fail('invalid_clock')
  const p=isRecord(packageFromUnknownOrigin)?packageFromUnknownOrigin:null
  if (!p || Object.keys(p).sort().join(',') !== [
    'domain','enrollmentId','hostId','challenge','pairingCode','expiresAt',
    'protocolVersion','algorithm','allowedRepositoryIds',
  ].sort().join(',') ||
      p.domain!==DOMAIN ||
      typeof p.enrollmentId!=='string' || !UUID_V4.test(p.enrollmentId) ||
      typeof p.hostId!=='string' || !UUID_V4.test(p.hostId) ||
      p.hostId===p.enrollmentId ||
      !canonicalB64(p.challenge,32) ||
      typeof p.pairingCode!=='string' ||
      !/^[0-9A-F]{16}$/.test(p.pairingCode) ||
      p.protocolVersion!==BROKER_PROTOCOL_VERSION ||
      p.algorithm!=='ES256' ||
      !Array.isArray(p.allowedRepositoryIds) ||
      p.allowedRepositoryIds.length!==1 ||
      p.allowedRepositoryIds[0]!==OMNIRA_REPOSITORY_ID ||
      typeof p.expiresAt!=='string' ||
      !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.expiresAt)
  ) return fail('invalid_enrollment_shape')

  const until=Date.parse(p.expiresAt)
  if(!Number.isFinite(until) || new Date(until).toISOString()!==p.expiresAt ||
      until<=nowMs || until>nowMs+TEN_MINUTES) return fail('expired_or_unreasonable_ttl')

  // Return only a redacted summary; pairing and challenge must not be copied
  // into logs, chat, dashboards, analytics, or a project worktree.
  return {
    version:ENROLLMENT_PACKAGE_REVIEW_VERSION,
    status:'shape_valid_untrusted',
    enrollmentId:p.enrollmentId,hostId:p.hostId,expiresAt:p.expiresAt,
    repositoryId:OMNIRA_REPOSITORY_ID,
    challengeLengthBytes:32,pairingCodeLengthBytes:8,
    authenticatedOriginVerified:false,ownerApprovedForSigning:false,
    permissionToSign:false,serverEnrollmentAttempted:false,
    modelExecutionAuthorized:false,
    reason:'Syntax and expiry checked. Owner-authenticated origin and build allowlist unverified.',
  }
}
