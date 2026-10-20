import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalCreativeApproval } from './approval-proof.mjs';
import { stageVerifiedCreativeApproval } from './approval-receipt.mjs';
import { canonicalCreativeQueueClaims,stageSignedCreativeTicket,
  claimStagedCreativeTicket,CREATIVE_QUEUE_SCHEMA } from './signed-queue.mjs';

const signBytes=(key,message)=>sign('sha256',message,
  {key,dsaEncoding:'ieee-p1363'}).toString('base64url');
const sha=b=>createHash('sha256').update(b).digest('hex');
const issuedAt='2026-10-20T18:00:00.000Z',expiresAt='2026-10-20T18:04:00.000Z';
const now=new Date('2026-10-20T18:02:00.000Z');
const asset='00000000-0000-4000-8000-000000000001';
const sourceHash='a'.repeat(64),binaryHash='b'.repeat(64);
const scope={approverId:'operator001',workId:'mediajob001',
  projectId:'familje-stunden',sourceAssetId:asset,
  sourceSha256:sourceHash,operation:'photocraft.convert-webp',
  binarySha256:binaryHash,outputMaxBytes:5000000};

test('offline signed approval -> signed queue ticket -> one-use non-executing claim',()=>{
  const dir=mkdtempSync(join(tmpdir(),'omnira-creative-e2e-'));
  const approvals=join(dir,'approvals'),queueDir=join(dir,'queue'),claimDir=join(dir,'claims');
  for(const x of [approvals,queueDir,claimDir]) mkdirSync(x);
  try {
    const operator=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const host=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const approvalClaims={
      schema:'omnira.creative.approval.v1',...scope,
      issuedAt,expiresAt,nonce:randomBytes(24).toString('base64url'),
    };
    const signedApproval={
      claims:approvalClaims,
      signature:signBytes(operator.privateKey,canonicalCreativeApproval(approvalClaims)),
    };
    const receipt=stageVerifiedCreativeApproval({
      proof:signedApproval,
      registry:{operatorId:scope.approverId,status:'active',allowCreativeApproval:true,
        projectIds:[scope.projectId],publicKey:operator.publicKey},
      expectedJob:scope,receiptsDir:approvals,now,
    });
    assert.equal(receipt.executionAuthorized,false);
    const receiptPath=join(approvals,receipt.nonceHash+'.json');
    const ticketClaims={
      schema:CREATIVE_QUEUE_SCHEMA,...Object.fromEntries(
        Object.entries(scope).filter(([k])=>k!=='approverId')),
      approvalReceiptSha256:sha(readFileSync(receiptPath)),
      issuedAt,expiresAt,claimNonce:randomBytes(24).toString('base64url'),
    };
    const ticket={
      claims:ticketClaims,
      signature:signBytes(host.privateKey,canonicalCreativeQueueClaims(ticketClaims)),
    };
    const expected={...Object.fromEntries(Object.entries(ticketClaims)
      .filter(([key])=>!['schema','issuedAt','expiresAt','claimNonce'].includes(key)))};
    const args={queueDir,claimDir,trustedServerKey:host.publicKey,expected,now};
    assert.equal(stageSignedCreativeTicket({
      ticket,trustedServerKey:host.publicKey,expected,queueDir,now,
    }).status,'signed-for-staging-only');
    const claim=claimStagedCreativeTicket({workId:scope.workId,...args});
    assert.equal(claim.status,'claimed-no-execution');
    assert.equal(claim.executionAuthorized,false);
    assert.equal(claim.publishAuthorized,false);
    assert.throws(()=>claimStagedCreativeTicket({workId:scope.workId,...args}),/EEXIST/);
    assert.throws(()=>stageVerifiedCreativeApproval({
      proof:signedApproval,
      registry:{operatorId:scope.approverId,status:'active',allowCreativeApproval:true,
        projectIds:[scope.projectId],publicKey:operator.publicKey},
      expectedJob:scope,receiptsDir:approvals,now,
    }),/EEXIST/);
    assert.throws(()=>claimStagedCreativeTicket({
      workId:scope.workId,...args,
      expected:{...expected,approvalReceiptSha256:'f'.repeat(64)},
    }),/scope mismatch/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
