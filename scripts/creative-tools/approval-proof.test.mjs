import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonicalCreativeApproval,verifyCreativeApproval} from './approval-proof.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const issued='2026-10-20T18:00:00.000Z',expires='2026-10-20T18:04:00.000Z';
const now=new Date('2026-10-20T18:02:00.000Z');
const claims={
  schema:'omnira.creative.approval.v1',approverId:'operator001',
  workId:'creative123',projectId:'familje-stunden',
  sourceAssetId:'00000000-0000-4000-8000-000000000001',
  sourceSha256:'a'.repeat(64),operation:'photocraft.convert-webp',
  binarySha256:'b'.repeat(64),outputMaxBytes:2500000,
  issuedAt:issued,expiresAt:expires,nonce:'0123456789abcdef0123456789abcdef',
};
function proof(c) {
  return {claims:c,signature:sign('sha256',canonicalCreativeApproval(c),{
    key:privateKey,dsaEncoding:'ieee-p1363',
  }).toString('base64url')};
}
const scope={approverId:claims.approverId,workId:claims.workId,projectId:claims.projectId,
  sourceAssetId:claims.sourceAssetId,sourceSha256:claims.sourceSha256,
  operation:claims.operation,binarySha256:claims.binarySha256,
  outputMaxBytes:claims.outputMaxBytes};

test('verifies correct P-256 proof, without authorizing execution',()=>{
  const verified=verifyCreativeApproval(proof(claims),publicKey,scope,now);
  assert.equal(verified.signatureValid,true);
  assert.equal(verified.executionAuthorized,false);
  assert.equal(verified.operatorAuthorityVerified,false);
  assert.equal(verified.nonceConsumed,false);
  assert.equal(verified.publishAuthorized,false);
});

test('rejects forged scope, changed work ID or unauthorized operation',()=>{
  const valid=proof(claims);
  assert.throws(()=>verifyCreativeApproval(valid,publicKey,{...scope,projectId:'handlarborsen'},now),/scope mismatch/);
  assert.throws(()=>verifyCreativeApproval({...valid,claims:{...claims,workId:'forged001'}},
    publicKey,scope,now),/scope mismatch/);
  assert.throws(()=>canonicalCreativeApproval({...claims,operation:'shell.run'}),/invalid scoped/);
  assert.throws(()=>canonicalCreativeApproval({...claims,extra:'untrusted'}),/unexpected approval fields/);
});

test('rejects expired/overlong decisions and tampered signature',()=>{
  const valid=proof(claims);
  assert.throws(()=>verifyCreativeApproval(valid,publicKey,scope,new Date('2026-10-20T18:05:00Z')),/expired/);
  const tooLong={...claims,expiresAt:'2026-10-20T18:10:00.000Z'};
  assert.throws(()=>verifyCreativeApproval(proof(tooLong),publicKey,scope,now),/excessively long/);
  const forged={...valid,signature:'A'+valid.signature.slice(1)};
  assert.throws(()=>verifyCreativeApproval(forged,publicKey,scope,now),/signature rejected/);
});

test('requires out-of-band trusted P-256 public key',()=>{
  const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  assert.throws(()=>verifyCreativeApproval(proof(claims),other.publicKey,scope,now),/signature rejected/);
});
