import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalCreativeApproval} from './approval-proof.mjs';
import {stageVerifiedCreativeApproval} from './approval-receipt.mjs';

const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const operator='operator777';
const claims={
 schema:'omnira.creative.approval.v1',approverId:operator,
 workId:'creative001',projectId:'familje-stunden',
 sourceAssetId:'00000000-0000-4000-8000-000000000001',
 sourceSha256:'a'.repeat(64),operation:'photocraft.convert-webp',
 binarySha256:'b'.repeat(64),outputMaxBytes:5000000,
 issuedAt:'2026-10-20T18:00:00.000Z',expiresAt:'2026-10-20T18:04:00.000Z',
 nonce:'replaynonce00111111111111111111111',
};
const proofOf=c=>({
 claims:c,
 signature:sign('sha256',canonicalCreativeApproval(c),{
  key:keys.privateKey,dsaEncoding:'ieee-p1363',
 }).toString('base64url')
});
const scope=Object.fromEntries([
 'approverId','workId','projectId','sourceAssetId','sourceSha256',
 'operation','binarySha256','outputMaxBytes',
].map(k=>[k,claims[k]]));
const registry={
 operatorId:operator,status:'active',allowCreativeApproval:true,
 projectIds:['familje-stunden'],publicKey:keys.publicKey,
};
const now=new Date('2026-10-20T18:02:00.000Z');

function withFolder(fn) {
 const dir=mkdtempSync(join(tmpdir(),'atlas-approval-receipt-'));
 try{return fn(dir);} finally{rmSync(dir,{recursive:true,force:true});}
}
const attempt=(dir,patch={})=>stageVerifiedCreativeApproval({
 proof:proofOf(claims),registry,expectedJob:scope,receiptsDir:dir,now,...patch,
});

test('valid signature stages a non-executable and non-public approval receipt',()=>{
 withFolder(dir=>{
  const result=attempt(dir);
  assert.equal(result.status,'verified-for-staging-only');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.publishAuthorized,false);
  assert.equal(result.projectId,claims.projectId);
  assert.equal(readdirSync(dir).length,1);
 });
});
test('same signed nonce is never accepted twice',()=>{
 withFolder(dir=>{
  attempt(dir);
  assert.throws(()=>attempt(dir),/EEXIST/);
  assert.equal(readdirSync(dir).length,1);
 });
});
test('unauthorized, revoked, cross-project or forged requests create no receipt',()=>{
 withFolder(dir=>{
  for(const patch of [
   {registry:{...registry,status:'revoked'}},
   {registry:{...registry,allowCreativeApproval:false}},
   {registry:{...registry,projectIds:['handlarborsen']}},
   {registry:{...registry,operatorId:'differentoperator'}},
   {expectedJob:{...scope,sourceSha256:'c'.repeat(64)}},
   {expectedJob:{...scope,outputMaxBytes:1000}},
   {proof:{...proofOf(claims),claims:{...claims,workId:'different001'}}},
  ]) assert.throws(()=>attempt(dir,patch));
  assert.equal(readdirSync(dir).length,0);
 });
});
test('expired proof or wrong registry key cannot stage',()=>{
 withFolder(dir=>{
  const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  assert.throws(()=>attempt(dir,{registry:{...registry,publicKey:other.publicKey}}),/signature rejected/);
  assert.throws(()=>attempt(dir,{now:new Date('2026-10-20T18:06:00.000Z')}),/expired/);
  assert.equal(readdirSync(dir).length,0);
 });
});
