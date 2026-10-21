import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  makeCreativeReviewPreviewReader,CREATIVE_REVIEW_UI_LIVE
} from '../../apps/web/lib/media/creative-queue/review-preview.mjs';

const user='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const enrollment='00000000-0000-4000-8000-000000000090';
const p1='00000000-0000-4000-8000-000000000011';
const p2='00000000-0000-4000-8000-000000000012';
const candidate={
 enrollmentId:enrollment,workerId:'HultgrenCreative01',
 state:'pending_review',requestedBy:user,projectIds:[p1,p2],
 keySha256:'a'.repeat(64),proofSha256:'b'.repeat(64)
};
function fixtures({auth={ok:true,userId:user},record=candidate,
 ownerRows=[{id:p1,ownerId:user},{id:p2,ownerId:user}]}={}) {
 const counters={operator:0,lookup:0,owners:0};
 const service=makeCreativeReviewPreviewReader({
  operator:async()=>{counters.operator++;return auth},
  lookup:async()=>{counters.lookup++;return record},
  projectOwners:async()=>{counters.owners++;return ownerRows}
 });
 return {service,counters};
}
test('operator only: unauthenticated user never gets project/record lookups',async()=>{
 const f=fixtures({auth:{ok:false,reason:'unauthenticated'}});
 assert.equal((await f.service.read(enrollment)).status,'operator_required');
 assert.deepEqual(f.counters,{operator:1,lookup:0,owners:0});
});
test('valid pending review shows only canonical, non-executable projection',async()=>{
 const f=fixtures();
 const result=await f.service.read(enrollment);
 assert.equal(result.status,'ok');
 assert.deepEqual(result.preview.projectIds,[p1,p2]);
 assert.equal(result.preview.reviewSubmissionAvailable,false);
 assert.equal(result.preview.executionAuthorized,false);
 assert.equal(result.preview.publishAuthorized,false);
 assert.equal(result.preview.workerIdentityActivated,false);
 assert.equal('publicKeyPem' in result.preview,false);
 assert.equal('requestedBy' in result.preview,false);
});
test('one owned project never grants review of a second unowned project',async()=>{
 for(const rows of [
  [{id:p1,ownerId:user},{id:p2,ownerId:foreign}],
  [{id:p1,ownerId:user}],
  [{id:p1,ownerId:user},{id:p1,ownerId:user}],
  [{id:p1,ownerId:user},{id:p2,ownerId:user},{id:p2,ownerId:user}],
 ]) {
  assert.equal((await fixtures({ownerRows:rows}).service.read(enrollment)).status,
   'not_permitted');
 }
});
test('wrong project order, duplicate IDs, changed proof, stale status fail closed',async()=>{
 for(const record of [
  {...candidate,state:'issued'},
  {...candidate,projectIds:[p2,p1]},
  {...candidate,projectIds:[p1,p1]},
  {...candidate,keySha256:'invalid'},
  {...candidate,proofSha256:'invalid'},
  {...candidate,workerId:'../other'}
 ]) assert.equal((await fixtures({record}).service.read(enrollment)).status,
    'not_available');
});
test('invalid path ID refused before even testing operator authority',async()=>{
 const f=fixtures();
 assert.equal((await f.service.read('bad-id')).status,'invalid_request');
 assert.deepEqual(f.counters,{operator:0,lookup:0,owners:0});
});
test('no trusted server stores: cannot construct projection',()=>{
 assert.throws(()=>makeCreativeReviewPreviewReader({}),/dependencies missing/);
});
test('review component is deliberately inert and unavailable as live UI',()=>{
 assert.equal(CREATIVE_REVIEW_UI_LIVE,false);
 const file=readFileSync(resolve(import.meta.dirname,
  '../../apps/web/components/creative/CreativeEnrollmentReviewPreview.tsx'),'utf8');
 assert.match(file,/disabled aria-disabled="true"/);
 assert.doesNotMatch(file,/\bonClick\s*=/);
 assert.doesNotMatch(file,/fetch\s*\(/);
 assert.doesNotMatch(file,/\buseActionState\b|\buseTransition\b/);
 assert.match(file,/Väntar på granskning/);
});
