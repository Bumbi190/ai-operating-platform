import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {canonicalCreativeApproval,verifyCreativeApproval} from './approval-proof.mjs';
import {AUTONOMOUS_CREATIVE_EXECUTION_ENABLED} from './local-broker.mjs';
import {CREATIVE_HTTP_PRODUCTION_ENABLED} from './queue-http-contract.mjs';
import {CREATIVE_REVIEW_ROUTE_ENABLED} from '../../apps/web/lib/media/creative-queue/review-route-gate.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const ps=read('./worker-stage-binaries.ps1');
const project='00000000-0000-4000-8000-000000000011';
const operator='00000000-0000-4000-8000-000000000001';
const asset='00000000-0000-4000-8000-000000000021';
const now=new Date('2026-10-21T07:02:00.000Z');
const sha=s=>createHash('sha256').update(s).digest('hex');
test('P0 privileged script/source protection precedes any user-controlled lockfile read',()=>{
 const apply=ps.indexOf('if ($Apply) {');
 const control=ps.indexOf('function Assert-ProtectedCreativeSource');
 const lock=ps.indexOf('Get-Content -LiteralPath $repoRoot -Raw');
 assert.ok(apply>=0&&control>apply&&lock>control);
 assert.match(ps,/protected control handoff required/i);
 for(const marker of ['AreAccessRulesProtected','S-1-5-18','S-1-5-32-544',
  'worker-archive-audit.ps1','archiveAudit.allVerified','targetInspection','trustedImports']){
  assert.ok(ps.includes(marker),marker);
 }
 assert.doesNotMatch(ps,/^(<<<<<<<|=======|>>>>>>>)/m);
});
test('P23 canonical UUID human approval still verifies but never authorizes execution',()=>{
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const claims={
  schema:'omnira.creative.approval.v1',approverId:operator,
  workId:'creativeP24Test',projectId:project,sourceAssetId:asset,
  sourceSha256:sha('synthetic-source'),operation:'photocraft.convert-webp',
  binarySha256:sha('synthetic-binary'),outputMaxBytes:5000000,
  issuedAt:'2026-10-21T07:00:00.000Z',expiresAt:'2026-10-21T07:04:00.000Z',
  nonce:'safeP24Nonce012345678901234567890',
 };
 const proof={claims,signature:sign('sha256',canonicalCreativeApproval(claims),
  {key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};
 const expected=Object.fromEntries(['approverId','workId','projectId','sourceAssetId',
  'sourceSha256','operation','binarySha256','outputMaxBytes'].map(k=>[k,claims[k]]));
 const checked=verifyCreativeApproval(proof,keys.publicKey,expected,now);
 assert.equal(checked.signatureValid,true);
 assert.equal(checked.executionAuthorized,false);
 assert.equal(checked.operatorAuthorityVerified,false);
 assert.equal(checked.publishAuthorized,false);
});
test('all creative execution and route gates remain disabled',()=>{
 assert.equal(AUTONOMOUS_CREATIVE_EXECUTION_ENABLED,false);
 assert.equal(CREATIVE_HTTP_PRODUCTION_ENABLED,false);
 assert.equal(CREATIVE_REVIEW_ROUTE_ENABLED,false);
});
test('new P0 worker reviewer + audit code survives integration',()=>{
 assert.match(read('./worker-handoff-verify.mjs'),/worker/i);
 assert.match(read('./worker-handoff-reviewer-registry.mjs'),/reviewer/i);
 assert.match(read('./worker-approval-ledger-acl-policy.ps1'),/S-1-5-18|SYSTEM/);
});
