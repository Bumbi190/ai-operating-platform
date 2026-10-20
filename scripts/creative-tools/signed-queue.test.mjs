import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalCreativeQueueClaims,validateCreativeQueueClaims,
  verifySignedCreativeTicket,stageSignedCreativeTicket,claimStagedCreativeTicket,
  CREATIVE_QUEUE_SCHEMA } from './signed-queue.mjs';

const keyPair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const otherKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const now=new Date('2026-10-20T19:00:00.000Z');
const claims={
  schema:CREATIVE_QUEUE_SCHEMA,workId:'mediajob001',workerId:'HultgrenCreative01',projectId:'familje-stunden',
  sourceAssetId:'00000000-0000-4000-8000-000000000001',
  sourceSha256:'a'.repeat(64),operation:'photocraft.convert-webp',
  binarySha256:'b'.repeat(64),approvalReceiptSha256:'c'.repeat(64),
  outputMaxBytes:2200000,issuedAt:'2026-10-20T18:58:00.000Z',
  expiresAt:'2026-10-20T19:02:00.000Z',
  claimNonce:'0123456789abcdefghij0123456789',
};
const expected=Object.fromEntries([
 'workId','workerId','projectId','sourceAssetId','sourceSha256','operation',
 'binarySha256','approvalReceiptSha256','outputMaxBytes',
].map(key=>[key,claims[key]]));
const ticketFor=c=>({
  claims:c,signature:sign('sha256',canonicalCreativeQueueClaims(c),
    {key:keyPair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
});
function tmpQueue(run) {
 const dir=mkdtempSync(join(tmpdir(),'atlas-creative-queue-'));
 const queueDir=join(dir,'queue'),claimDir=join(dir,'claims');
 mkdirSync(queueDir);mkdirSync(claimDir);
 try{return run({queueDir,claimDir});} finally {rmSync(dir,{recursive:true,force:true});}
}
const stage=(dirs,ticket=ticketFor(claims),extra={})=>stageSignedCreativeTicket({
  ...dirs,ticket,trustedServerKey:keyPair.publicKey,expected,now,...extra,
});
const claim=(dirs,extra={})=>claimStagedCreativeTicket({
  ...dirs,workId:claims.workId,trustedServerKey:keyPair.publicKey,expected,now,...extra,
});

test('verifies exact signed scope without granting worker authority',()=>{
 const status=verifySignedCreativeTicket(ticketFor(claims),keyPair.publicKey,expected,now);
 assert.equal(status.signatureVerified,true);
 assert.equal(status.operatorApprovalVerified,false);
 assert.equal(status.executionAuthorized,false);
 assert.equal(status.publishAuthorized,false);
});
test('staging and one-use claim are non-executing and reject duplicate IDs',()=>{
 tmpQueue(dirs=>{
  assert.equal(stage(dirs).status,'signed-for-staging-only');
  assert.throws(()=>stage(dirs),/EEXIST/);
  const status=claim(dirs);
  assert.equal(status.status,'claimed-no-execution');
  assert.equal(status.executionAuthorized,false);
  assert.throws(()=>claim(dirs),/EEXIST/);
 });
});
test('refuses forged tickets, wrong key, changed approval scope, expired ticket',()=>{
 const t=ticketFor(claims);
 assert.throws(()=>verifySignedCreativeTicket(t,otherKey.publicKey,expected,now),/signature rejected/);
 assert.throws(()=>verifySignedCreativeTicket(t,keyPair.publicKey,
   {...expected,projectId:'handlarborsen'},now),/scope mismatch/);
 assert.throws(()=>verifySignedCreativeTicket(t,keyPair.publicKey,
   {...expected,approvalReceiptSha256:'d'.repeat(64)},now),/scope mismatch/);
 assert.throws(()=>verifySignedCreativeTicket(t,keyPair.publicKey,expected,
   new Date('2026-10-20T19:03:00.000Z')),/expired/);
 assert.throws(()=>verifySignedCreativeTicket({...t,claims:{...claims,binarySha256:'e'.repeat(64)}},
   keyPair.publicKey,expected,now),/scope mismatch/);
 assert.throws(()=>validateCreativeQueueClaims({...claims,cmd:'powershell'}),/invalid ticket fields/);
});
test('claim re-verifies signed source, rejects stored ticket tampering',()=>{
 tmpQueue(dirs=>{
  stage(dirs);
  const path=join(dirs.queueDir,claims.workId+'.ticket.json');
  const record=JSON.parse(readFileSync(path,'utf8'));
  record.ticket.claims.sourceSha256='f'.repeat(64);
  writeFileSync(path,JSON.stringify(record));
  assert.throws(()=>claim(dirs),/scope mismatch/);
 });
});
test('rejects traversal-shaped work IDs and unsupported arbitrary commands',()=>{
 for(const bad of ['../file','c:\\bad','bad/foo','?oops']) {
  assert.throws(()=>validateCreativeQueueClaims({...claims,workId:bad}));
 }
 assert.throws(()=>validateCreativeQueueClaims({...claims,operation:'filmcraft.shell'}));
});
