/**
 * Creative queue proposal: offline, signed-ticket admission and one-use claim.
 * It starts NO worker, server, network listener, editor or autonomous execution.
 * A future trusted server must supply the canonical job and trusted public key.
 */
import { createPublicKey, verify, createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CREATIVE_QUEUE_SCHEMA='omnira.creative.queue-ticket.v1';
const FIELDS=[
  'schema','workId','workerId','projectId','sourceAssetId','sourceSha256',
  'operation','binarySha256','approvalReceiptSha256','outputMaxBytes',
  'issuedAt','expiresAt','claimNonce',
];
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const NONCE=/^[A-Za-z0-9_-]{20,64}$/;
const OPS=new Set(['photocraft.convert-webp','filmcraft.demo-export-mp4']);
const TTL_MS=5*60*1000;
function validUtcTime(s) {
  return typeof s==='string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
    Number.isFinite(Date.parse(s)) && new Date(s).toISOString()===s;
}
export function validateCreativeQueueClaims(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw) ||
     Object.keys(raw).length!==FIELDS.length ||
     Object.keys(raw).some(k=>!FIELDS.includes(k))) throw new Error('invalid ticket fields');
  if(raw.schema!==CREATIVE_QUEUE_SCHEMA ||
     !ID.test(raw.workId) || !ID.test(raw.workerId) || !ID.test(raw.projectId) ||
     !UUID.test(raw.sourceAssetId) || !HASH.test(raw.sourceSha256) ||
     !OPS.has(raw.operation) || !HASH.test(raw.binarySha256) ||
     !HASH.test(raw.approvalReceiptSha256) || !NONCE.test(raw.claimNonce) ||
     !Number.isSafeInteger(raw.outputMaxBytes) ||
     raw.outputMaxBytes<100 || raw.outputMaxBytes>40*1024*1024 ||
     !validUtcTime(raw.issuedAt) || !validUtcTime(raw.expiresAt)) {
    throw new Error('invalid creative ticket scope');
  }
  return Object.freeze({...raw});
}
export function canonicalCreativeQueueClaims(raw) {
  const c=validateCreativeQueueClaims(raw);
  return Buffer.from(FIELDS.map(k=>k+':'+String(c[k])).join('\n'),'utf8');
}
const MATCH=[
  'workId','workerId','projectId','sourceAssetId','sourceSha256','operation',
  'binarySha256','approvalReceiptSha256','outputMaxBytes',
];
export function verifySignedCreativeTicket(ticket,trustedServerKey,expected,now=new Date()) {
  if(!ticket || typeof ticket!=='object' || Array.isArray(ticket) ||
     Object.keys(ticket).length!==2 || !('claims' in ticket) ||
     !('signature' in ticket)) throw new Error('invalid signed queue ticket');
  const claims=validateCreativeQueueClaims(ticket.claims);
  if(!expected || typeof expected!=='object' ||
    MATCH.some(field=>claims[field]!==expected[field])) throw new Error('ticket scope mismatch');
  const issued=Date.parse(claims.issuedAt), expires=Date.parse(claims.expiresAt), ms=now.getTime();
  if(expires-issued>TTL_MS || expires<=issued || expires<=ms || issued>ms+30000) {
    throw new Error('ticket expired or invalid clock window');
  }
  if(typeof ticket.signature!=='string' || !/^[A-Za-z0-9_-]{86}$/.test(ticket.signature)) {
    throw new Error('invalid ticket signature representation');
  }
  if(!trustedServerKey) throw new Error('trusted server key not configured');
  const key=trustedServerKey?.type==='public' && trustedServerKey?.asymmetricKeyType
    ? trustedServerKey : createPublicKey(trustedServerKey);
  if(key.asymmetricKeyType!=='ec' || key.asymmetricKeyDetails?.namedCurve!=='prime256v1') {
    throw new Error('ticket signer must use P-256');
  }
  if(!verify('sha256',canonicalCreativeQueueClaims(claims),
    {key,dsaEncoding:'ieee-p1363'},Buffer.from(ticket.signature,'base64url'))) {
    throw new Error('queue ticket signature rejected');
  }
  return Object.freeze({
    workId:claims.workId,projectId:claims.projectId,claimNonce:claims.claimNonce,
    ticketHash:createHash('sha256').update(canonicalCreativeQueueClaims(claims)).digest('hex'),
    signatureVerified:true,operatorApprovalVerified:false,
    executionAuthorized:false,publishAuthorized:false,
  });
}
function requireSafeDir(dir) {
  if(!existsSync(dir) || !lstatSync(dir).isDirectory() ||
     lstatSync(dir).isSymbolicLink()) throw new Error('unsafe queue directory');
}
function saveOnce(file,record) {
  const serialized=JSON.stringify(record,null,2)+'\n';
  if(Buffer.byteLength(serialized)>8192) throw new Error('queue receipt too large');
  writeFileSync(file,serialized,{flag:'wx',mode:0o600});
}
export function stageSignedCreativeTicket({ticket,trustedServerKey,expected,queueDir,now=new Date()}) {
  requireSafeDir(queueDir);
  const proof=verifySignedCreativeTicket(ticket,trustedServerKey,expected,now);
  const record={
    schema:'omnira.creative.queue-stage.v1',status:'signed-for-staging-only',
    workId:proof.workId,projectId:proof.projectId,ticketHash:proof.ticketHash,
    ticket,executionAuthorized:false,publishAuthorized:false,
  };
  saveOnce(join(queueDir,proof.workId+'.ticket.json'),record);
  return Object.freeze({workId:proof.workId,status:record.status,executionAuthorized:false});
}
/** Read back and verify signed bytes before a one-use NON-EXECUTING claim. */
export function claimStagedCreativeTicket({workId,queueDir,claimDir,trustedServerKey,expected,now=new Date()}) {
  if(typeof workId!=='string' || !ID.test(workId)) throw new Error('invalid creative claim ID');
  requireSafeDir(queueDir);
  requireSafeDir(claimDir);
  const path=join(queueDir,workId+'.ticket.json');
  if(!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() ||
     lstatSync(path).size>8192) throw new Error('invalid staged ticket file');
  const staged=JSON.parse(readFileSync(path,'utf8'));
  if(staged?.schema!=='omnira.creative.queue-stage.v1' ||
     staged.status!=='signed-for-staging-only' ||
     staged.workId!==workId || staged.executionAuthorized!==false ||
     staged.publishAuthorized!==false) throw new Error('invalid staged queue state');
  const proof=verifySignedCreativeTicket(staged.ticket,trustedServerKey,expected,now);
  if(proof.workId!==workId || staged.ticketHash!==proof.ticketHash ||
     staged.projectId!==proof.projectId) throw new Error('staged ticket tampered');
  const record={
    schema:'omnira.creative.queue-claim.v1',workId,projectId:proof.projectId,
    ticketHash:proof.ticketHash,claimNonceHash:createHash('sha256')
      .update('omnira.creative.claim.v1\n'+proof.claimNonce).digest('hex'),
    status:'claimed-no-execution',executionAuthorized:false,publishAuthorized:false,
  };
  saveOnce(join(claimDir,workId+'.claim.json'),record);
  return Object.freeze(record);
}
