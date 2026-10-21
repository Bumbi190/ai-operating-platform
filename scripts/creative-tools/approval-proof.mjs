/**
 * Signature verifier for future one-job Creative approvals.
 * This does NOT create user approvals, persist nonce consumption, or authorize
 * execution. Operator public key must be obtained from trusted configuration.
 */
import { createPublicKey, verify } from 'node:crypto';

const SCHEMA='omnira.creative.approval.v1';
const FIELDS=[
  'schema','approverId','workId','projectId','sourceAssetId','sourceSha256',
  'operation','binarySha256','outputMaxBytes','issuedAt','expiresAt','nonce',
];
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Existing P0 pilot signatures bind to slugs. Production Supabase actor and
// project identities are UUIDs. Both validate without altering signed bytes.
const CANONICAL_OR_PILOT_ID=(value)=>typeof value==='string' &&
  (UUID.test(value) || ID.test(value));
const SHA=/^[0-9a-f]{64}$/;
const NONCE=/^[A-Za-z0-9_-]{20,64}$/;
const OPERATIONS=new Set(['photocraft.convert-webp','filmcraft.demo-export-mp4']);
const maxMediaBytes=40*1024*1024;

function requireFields(claims) {
  if(!claims || typeof claims!=='object' || Array.isArray(claims)) throw new Error('invalid claims');
  const keys=Object.keys(claims);
  if(keys.length!==FIELDS.length || keys.some(k=>!FIELDS.includes(k))) throw new Error('unexpected approval fields');
  if(claims.schema!==SCHEMA || !CANONICAL_OR_PILOT_ID(claims.approverId) ||
     !ID.test(claims.workId) || !CANONICAL_OR_PILOT_ID(claims.projectId) ||
     !UUID.test(claims.sourceAssetId) || !SHA.test(claims.sourceSha256) ||
     !OPERATIONS.has(claims.operation) || !SHA.test(claims.binarySha256) ||
     !Number.isSafeInteger(claims.outputMaxBytes) ||
     claims.outputMaxBytes<100 || claims.outputMaxBytes>maxMediaBytes ||
     !NONCE.test(claims.nonce)) throw new Error('invalid scoped creative claims');
  for(const time of [claims.issuedAt,claims.expiresAt]) {
    if(typeof time!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) ||
       !Number.isFinite(Date.parse(time))) throw new Error('invalid approval timestamp');
  }
  return claims;
}
export function canonicalCreativeApproval(claims) {
  requireFields(claims);
  // fixed order and explicit domain; never trust caller object insertion order.
  return Buffer.from(FIELDS.map(k=>k+':'+String(claims[k])).join('\n'),'utf8');
}

/** Verifies a signature AND strict job scope, but does not consume its nonce.
 *  A trusted server must independently check actual operator authority and
 *  durable single-use consumption before granting execution.
 */
export function verifyCreativeApproval(proof, publicKey, expected, now=new Date()) {
  if(!proof || typeof proof!=='object' ||
    Object.keys(proof).length!==2 || !('claims' in proof) || !('signature' in proof)) {
    throw new Error('invalid creative approval proof');
  }
  const claims=requireFields(proof.claims);
  if(!expected || typeof expected!=='object') throw new Error('missing expected approved scope');
  for(const field of [
    'approverId','workId','projectId','sourceAssetId','sourceSha256','operation','binarySha256',
  ]) {
    if(claims[field]!==expected[field]) throw new Error('approval scope mismatch: '+field);
  }
  if(typeof expected.outputMaxBytes!=='number' || claims.outputMaxBytes!==expected.outputMaxBytes) {
    throw new Error('approval output limit mismatch');
  }
  const issued=Date.parse(claims.issuedAt),expires=Date.parse(claims.expiresAt),current=now.getTime();
  if(issued>current+30000 || expires<=current || expires-issued>5*60*1000 || expires<=issued) {
    throw new Error('approval expired, not yet valid or excessively long');
  }
  if(typeof proof.signature!=='string' || !/^[A-Za-z0-9_-]{86}$/.test(proof.signature)) {
    throw new Error('invalid approval signature encoding');
  }
  const key=(publicKey?.type==='public' && publicKey?.asymmetricKeyType)
    ? publicKey : createPublicKey(publicKey);
  if(key.asymmetricKeyType!=='ec' || key.asymmetricKeyDetails?.namedCurve!=='prime256v1') {
    throw new Error('approval key must be P-256');
  }
  const valid=verify('sha256',canonicalCreativeApproval(claims),{
    key,dsaEncoding:'ieee-p1363'
  },Buffer.from(proof.signature,'base64url'));
  if(!valid) throw new Error('creative approval signature rejected');
  return Object.freeze({
    signatureValid:true,
    operatorAuthorityVerified:false,
    nonceConsumed:false,
    executionAuthorized:false,
    publishAuthorized:false,
    approvalNonce:claims.nonce,
    workId:claims.workId,
  });
}
