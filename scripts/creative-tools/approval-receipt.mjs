/**
 * Locally testable, non-executing approval receipt boundary.
 *
 * Trusted services MUST source both operator registry and exact job scope
 * from their authenticated database (not from a model/user-submitted payload).
 * This module does not establish that its caller is trusted. Never use its
 * returned receipt as an execution capability.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalCreativeApproval, verifyCreativeApproval } from './approval-proof.mjs';

const VALID_ID = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const VALID_NONCE = /^[A-Za-z0-9_-]{20,64}$/;
const REQUIRED_SCOPE=[
  'approverId','workId','projectId','sourceAssetId','sourceSha256',
  'operation','binarySha256','outputMaxBytes',
];

/**
 * Proof of authorizer's cryptographic identity + pre-staging replay control.
 * This is deliberately NOT an authorization grant for subprocess execution.
 */
export function stageVerifiedCreativeApproval({proof, registry, expectedJob, receiptsDir, now=new Date()}) {
  if (!registry || typeof registry !== 'object' ||
      registry.status !== 'active' || registry.allowCreativeApproval !== true ||
      !VALID_ID.test(registry.operatorId) || !registry.publicKey ||
      !Array.isArray(registry.projectIds) ||
      !registry.projectIds.includes(expectedJob?.projectId)) {
    throw new Error('operator not trusted for project');
  }
  if (!expectedJob || typeof expectedJob !== 'object' ||
      REQUIRED_SCOPE.some(key=>expectedJob[key] === undefined)) {
    throw new Error('missing canonical server-side job scope');
  }
  if (expectedJob.approverId !== registry.operatorId) {
    throw new Error('operator identity mismatch');
  }
  const proofStatus=verifyCreativeApproval(proof,registry.publicKey,expectedJob,now);
  if (!proofStatus.signatureValid || proofStatus.executionAuthorized) {
    throw new Error('unsafe approval verification');
  }
  if (!VALID_NONCE.test(proofStatus.approvalNonce)) {
    throw new Error('invalid approval nonce');
  }
  if (!existsSync(receiptsDir) || lstatSync(receiptsDir).isSymbolicLink() ||
      !lstatSync(receiptsDir).isDirectory()) {
    throw new Error('approval receipt directory must exist and be safe');
  }
  const fingerprint=createHash('sha256')
    .update(canonicalCreativeApproval(proof.claims)).digest('hex');
  const nonceHash=createHash('sha256')
    .update('omnira.creative.nonce.v1\n'+proofStatus.approvalNonce).digest('hex');
  const receipt={
    schema:'omnira.creative.approval-receipt.v1',
    workId:expectedJob.workId,
    projectId:expectedJob.projectId,
    approverId:registry.operatorId,
    nonceHash,
    claimsHash:fingerprint,
    status:'verified-for-staging-only',
    executionAuthorized:false,
    publishAuthorized:false,
    operatorAuthoritySource:'trusted-caller-required',
    at:now.toISOString(),
  };
  // A stable nonce hash and atomic create reject replay between workers.
  // The FS MUST be write-protected from untrusted users in the future host.
  const file=join(receiptsDir,nonceHash+'.json');
  writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return Object.freeze(receipt);
}
