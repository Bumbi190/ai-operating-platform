/**
 * P23: production-shape UUID operator and project IDs across offline creative
 * approval, staging ticket and SQL claim adapter. NO media execution.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalCreativeApproval} from './approval-proof.mjs';
import {stageVerifiedCreativeApproval} from './approval-receipt.mjs';
import {canonicalCreativeQueueClaims,stageSignedCreativeTicket,
 claimStagedCreativeTicket,CREATIVE_QUEUE_SCHEMA} from './signed-queue.mjs';
import {deriveCreativeSqlClaim,claimCreativePreviewOnly} from
 '../../apps/web/lib/media/creative-queue/sql-claim.ts';
import {AUTONOMOUS_CREATIVE_EXECUTION_ENABLED} from './local-broker.mjs';
import {CREATIVE_HTTP_PRODUCTION_ENABLED} from './queue-http-contract.mjs';
import {CREATIVE_REVIEW_ROUTE_ENABLED} from
 '../../apps/web/lib/media/creative-queue/review-route-gate.mjs';

const project='00000000-0000-4000-8000-000000000011';
const operator='00000000-0000-4000-8000-000000000001';
const asset='00000000-0000-4000-8000-000000000021';
const claim='00000000-0000-4000-8000-000000000031';
const worker='HultgrenCreative01';
const workId='creativeP23Job001';
const sha=b=>createHash('sha256').update(b).digest('hex');
const signText=(privateKey,data)=>sign('sha256',data,
 {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
const issued='2026-10-21T08:00:00.000Z',expires='2026-10-21T08:04:00.000Z';
const now=new Date('2026-10-21T08:02:00.000Z');
const scope={
 approverId:operator,workId,projectId:project,sourceAssetId:asset,
 sourceSha256:'a'.repeat(64),operation:'photocraft.convert-webp',
 binarySha256:'b'.repeat(64),outputMaxBytes:5000000,
};
const nonce='qwertyuiop123456789abcdefghijk';
function offlineFixture() {
 const root=mkdtempSync(join(tmpdir(),'omnira-creative-p23-'));
 const approvals=join(root,'approvals'),queue=join(root,'queue'),claims=join(root,'claims');
 for(const x of [approvals,queue,claims])mkdirSync(x);
 return {root,approvals,queue,claims,dispose:()=>rmSync(root,{recursive:true,force:true})};
}
test('P23 UUID human operator + project passes old P0 proof without execution',async()=>{
 const dir=offlineFixture();
 try{
  const signer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const c={
   schema:'omnira.creative.approval.v1',...scope,issuedAt:issued,
   expiresAt:expires,nonce,
  };
  const proof={claims:c,signature:signText(signer.privateKey,canonicalCreativeApproval(c))};
  const receipt=stageVerifiedCreativeApproval({
   proof,registry:{operatorId:operator,status:'active',
    allowCreativeApproval:true,projectIds:[project],publicKey:signer.publicKey},
   expectedJob:scope,receiptsDir:dir.approvals,now,
  });
  assert.equal(receipt.projectId,project);
  assert.equal(receipt.approverId,operator);
  assert.equal(receipt.status,'verified-for-staging-only');
  assert.equal(receipt.executionAuthorized,false);
  assert.equal(receipt.publishAuthorized,false);
  const host=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const receiptData=readFileSync(join(dir.approvals,receipt.nonceHash+'.json'));
  const ticketClaims={
   schema:CREATIVE_QUEUE_SCHEMA,workId,workerId:worker,projectId:project,
   sourceAssetId:asset,sourceSha256:scope.sourceSha256,
   operation:scope.operation,binarySha256:scope.binarySha256,
   approvalReceiptSha256:sha(receiptData),
   outputMaxBytes:scope.outputMaxBytes,issuedAt:issued,expiresAt:expires,
   claimNonce:randomBytes(24).toString('base64url')
  };
  const ticket={
   claims:ticketClaims,
   signature:signText(host.privateKey,canonicalCreativeQueueClaims(ticketClaims))
  };
  const expected={
   workId,workerId:worker,projectId:project,sourceAssetId:asset,
   sourceSha256:scope.sourceSha256,operation:scope.operation,
   binarySha256:scope.binarySha256,approvalReceiptSha256:sha(receiptData),
   outputMaxBytes:scope.outputMaxBytes
  };
  const stage=stageSignedCreativeTicket({
   ticket,trustedServerKey:host.publicKey,expected,queueDir:dir.queue,now,
  });
  assert.equal(stage.status,'signed-for-staging-only');
  const claimed=claimStagedCreativeTicket({
   workId,queueDir:dir.queue,claimDir:dir.claims,
   trustedServerKey:host.publicKey,expected,now,
  });
  assert.equal(claimed.status,'claimed-no-execution');
  const previewWorker={
   workerId:worker,authenticatedCreativeWorker:true,
   permittedProjectIds:[project]
  };
  const dbJob={
   workId,projectId:project,sourceAssetId:asset,sourceSha256:scope.sourceSha256,
   workerId:worker,
   signedTicketSha256:claimed.ticketHash,
   approvalReceiptSha256:sha(receiptData),
   claimNonceSha256:claimed.claimNonceHash,
  };
  const params=deriveCreativeSqlClaim(previewWorker,dbJob);
  assert.equal(params.p_work_id,workId);
  assert.equal(params.p_approval_receipt_sha256,sha(receiptData));
  assert.equal(params.p_claim_nonce_sha256,claimed.claimNonceHash);
  let sqlCalls=0;
  const admission=await claimCreativePreviewOnly(previewWorker,dbJob,{
   async claim(args){
    sqlCalls++;
    assert.deepEqual(args,params);
    return {
     claimed_work_id:workId,claimed_id:claim,
     claimed_fence:1,claimed_state:'claimed_preview_only'
    };
   },
  });
  assert.equal(sqlCalls,1);
  assert.equal(admission.state,'claimed_preview_only');
  assert.equal(admission.executionAuthorized,false);
  assert.equal(admission.publishAuthorized,false);
  assert.equal(AUTONOMOUS_CREATIVE_EXECUTION_ENABLED,false);
  assert.equal(CREATIVE_HTTP_PRODUCTION_ENABLED,false);
  assert.equal(CREATIVE_REVIEW_ROUTE_ENABLED,false);
  assert.throws(()=>claimStagedCreativeTicket({
   workId,queueDir:dir.queue,claimDir:dir.claims,
   trustedServerKey:host.publicKey,expected,now
  }),/EEXIST/);
  assert.throws(()=>stageVerifiedCreativeApproval({
   proof,registry:{operatorId:operator,status:'active',
    allowCreativeApproval:true,projectIds:[project],publicKey:signer.publicKey},
   expectedJob:scope,receiptsDir:dir.approvals,now
  }),/EEXIST/);
 }finally{dir.dispose()}
});
test('wrong UUID project, wrong operator, wrong source or forged key never stage a UUID approval',()=>{
 const dir=offlineFixture();
 try {
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const claims={
   schema:'omnira.creative.approval.v1',...scope,
   issuedAt:issued,expiresAt:expires,nonce
  };
  const proof={claims,signature:signText(keys.privateKey,
   canonicalCreativeApproval(claims))};
  const registry={
   operatorId:operator,status:'active',allowCreativeApproval:true,
   projectIds:[project],publicKey:keys.publicKey
  };
  const foreignProject='00000000-0000-4000-8000-000000000012';
  const foreignOperator='00000000-0000-4000-8000-000000000002';
  const forgedKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  for (const patch of [
   {registry:{...registry,projectIds:[foreignProject]}},
   {registry:{...registry,operatorId:foreignOperator}},
   {registry:{...registry,publicKey:forgedKey.publicKey}},
   {expectedJob:{...scope,projectId:foreignProject}},
   {expectedJob:{...scope,sourceSha256:'c'.repeat(64)}}
  ]) {
   assert.throws(()=>stageVerifiedCreativeApproval({
    proof,registry,expectedJob:scope,receiptsDir:dir.approvals,
    now,...patch
   }));
  }
  assert.deepEqual(readdirSync(dir.approvals),[]);
 }finally{dir.dispose()}
});
test('UUID-shaped project scope is not a licence for arbitrary or malformed IDs',()=>{
 const claims={
  schema:'omnira.creative.approval.v1',...scope,
  issuedAt:issued,expiresAt:expires,nonce,
 };
 assert.doesNotThrow(()=>canonicalCreativeApproval(claims));
 for(const bad of [
  {...claims,projectId:'00000000-0000-4000-8000-00000000001Z'},
  {...claims,projectId:'../work'},
  {...claims,approverId:'00000000-0000-4000-8000-00000000001Z'},
  {...claims,approverId:'bearer fake operator'},
 ]) assert.throws(()=>canonicalCreativeApproval(bad));
});
test('legacy pilot slug approvals remain byte-for-byte canonical and valid',()=>{
 const claims={
  schema:'omnira.creative.approval.v1',
  approverId:'operator001',workId,projectId:'familje-stunden',
  sourceAssetId:asset,sourceSha256:scope.sourceSha256,
  operation:scope.operation,binarySha256:scope.binarySha256,
  outputMaxBytes:scope.outputMaxBytes,issuedAt:issued,expiresAt:expires,
  nonce
 };
 const actual=canonicalCreativeApproval(claims);
 assert.equal(actual.toString('utf8').split('\n')[3],
  'projectId:familje-stunden');
 assert.deepEqual(actual,Buffer.from(Object.keys(claims).length>0?
  ['schema','approverId','workId','projectId','sourceAssetId','sourceSha256',
   'operation','binarySha256','outputMaxBytes','issuedAt','expiresAt','nonce'
  ].map(k=>k+':'+claims[k]).join('\n'):''));
 assert.throws(()=>deriveCreativeSqlClaim({
  workerId:worker,authenticatedCreativeWorker:true,permittedProjectIds:['familje-stunden']
 },{workId,projectId:'familje-stunden',sourceAssetId:asset,sourceSha256:scope.sourceSha256,
   workerId:worker,signedTicketSha256:'a'.repeat(64),
   approvalReceiptSha256:'b'.repeat(64),claimNonceSha256:'c'.repeat(64)
 }),/canonical creative job scope invalid/);
});
