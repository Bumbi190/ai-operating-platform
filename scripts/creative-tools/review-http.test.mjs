import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreativeReviewHttpBoundary,CREATIVE_REVIEW_HTTP_LIVE,CREATIVE_REVIEW_POST_PATH} from
 '../../apps/web/lib/media/creative-queue/review-http.mjs';

const origin='https://omnira.example';
const id='00000000-0000-4000-8000-000000000090';
const operator='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const p1='00000000-0000-4000-8000-000000000011';
const p2='00000000-0000-4000-8000-000000000012';
const body={
 enrollmentId:id,decision:'approve_registration_only',
 expectedKeySha256:'a'.repeat(64),expectedProofSha256:'b'.repeat(64),
 projectIds:[p1,p2],reviewNonceSha256:'c'.repeat(64),
 reasonCode:'operator_verified_test',
 confirmation:'GODKÄNN ENDAST REGISTRERING'
};
function request(payload=body,extras={}) {
 const url=origin+(extras.path??CREATIVE_REVIEW_POST_PATH);
 const headers={
   'origin':origin,'content-type':'application/json',
   'x-omnira-creative-review':'review.v1',
   'sec-fetch-site':'same-origin',...extras.headers
 };
 return new Request(url,{method:extras.method??'POST',headers,
   ...(extras.method==='GET'?{}:{body:typeof payload==='string'?payload:JSON.stringify(payload)})});
}
function boundary(options={}) {
 const pending={
   enrollmentId:id,state:'pending_review',keySha256:'a'.repeat(64),
   proofSha256:'b'.repeat(64),projectIds:[p1,p2]
 };
 const calls={auth:0,owner:0,pending:0,write:0,saved:[]};
 const store={
   async getPendingEnrollment(){calls.pending++;return options.pending??pending},
   async recordDecision(value) {
     calls.write++;
     if(options.storeRefuses || calls.saved.length)return false;
     calls.saved.push(value);return true;
   }
 };
 const handler=makeCreativeReviewHttpBoundary({
   expectedOrigin:options.expectedOrigin??origin,
   operator:async()=>{calls.auth++;return options.operator??{ok:true,userId:operator}},
   projectOwners:async()=>{calls.owner++;return options.owners??[
     {id:p1,ownerId:operator},{id:p2,ownerId:operator}
   ]},
   store
 });
 return {calls,handler};
}
test('P18 has no registered production approval endpoint',()=>{
 assert.equal(CREATIVE_REVIEW_HTTP_LIVE,false);
});
test('correct session operator, same-origin, all project owners and evidence save one decision only',async()=>{
 const x=boundary();
 const first=await x.handler(request());
 assert.equal(first.status,200);
 assert.deepEqual(await first.json(),{
  status:'recorded_for_separate_activation_review',
  workerIdentityActivated:false,executionAuthorized:false,publishAuthorized:false
 });
 assert.equal(x.calls.write,1);
 assert.equal(x.calls.saved[0].reviewerUserId,operator);
 assert.equal(x.calls.saved[0].decision,'approve_registration_only');
 assert.equal('confirmation' in x.calls.saved[0],false);
 assert.equal('modelApproval' in x.calls.saved[0],false);
 const replay=await x.handler(request());
 assert.equal(replay.status,409);
 assert.equal(x.calls.write,2);
});
test('cross-site, missing origin, bad route, query string, fake forwarded host never reach operator or store',async()=>{
 for(const req of [
  request(body,{headers:{origin:'https://attacker.example'}}),
  request(body,{headers:{origin:''}}),
  request(body,{headers:{'sec-fetch-site':'cross-site'}}),
  request(body,{headers:{'x-omnira-creative-review':''}}),
  request(body,{headers:{'x-forwarded-host':'evil.example',origin:'https://attacker.example'}}),
  request(body,{path:CREATIVE_REVIEW_POST_PATH+'?admin=1'}),
  request(body,{path:'/api/atlas/code-work/claim'})
 ]) {
  const x=boundary(),r=await x.handler(req);
  assert.notEqual(r.status,200);
  assert.equal(x.calls.auth,0);
  assert.equal(x.calls.write,0);
 }
});
test('operator session is required; foreign or partially owned project list fails before SQL',async()=>{
 const missing=boundary({operator:{ok:false,reason:'unauthenticated'}});
 assert.equal((await missing.handler(request())).status,401);
 assert.equal(missing.calls.owner,0);
 const foreignOwner=boundary({owners:[{id:p1,ownerId:operator},{id:p2,ownerId:foreign}]});
 assert.equal((await foreignOwner.handler(request())).status,404);
 assert.equal(foreignOwner.calls.pending,0);
 const absent=boundary({owners:[{id:p1,ownerId:operator}]});
 assert.equal((await absent.handler(request())).status,404);
 const duplicate=boundary({owners:[{id:p1,ownerId:operator},{id:p1,ownerId:operator}]});
 assert.equal((await duplicate.handler(request())).status,404);
});
test('request allowlist excludes userId, role flags, mutation handlers, clock and unrelated commands',async()=>{
 for(const extra of [
  {userId:operator},{principalId:operator},{modelApproval:true},
  {store:'supabase'},{now:'2099-01-01'}, {operation:'filmcraft.demo-export-mp4'},
  {executionAuthorized:true},
 ]) {
  const x=boundary();
  assert.equal((await x.handler(request({...body,...extra}))).status,400);
  assert.equal(x.calls.write,0);
 }
});
test('requires exact confirmation phrase for each decision',async()=>{
 for(const payload of [
  {...body,confirmation:'GODKÄNN REGISTRERING'},
  {...body,confirmation:''},
  {...body,decision:'reject_registration',confirmation:'GODKÄNN ENDAST REGISTRERING'},
  {...body,decision:'enable_windows_account'},
 ]) {
  const x=boundary();
  assert.equal((await x.handler(request(payload))).status,400);
  assert.equal(x.calls.write,0);
 }
 const deny=boundary();
 const req=request({...body,decision:'reject_registration',
  confirmation:'NEKA REGISTRERING'});
 assert.equal((await deny.handler(req)).status,200);
 assert.equal(deny.calls.saved[0].decision,'reject_registration');
});
test('body too large, unsupported content type, malformed JSON, illegal UTF-8 fail without writes',async()=>{
 const junk='a'.repeat(2300);
 const badType=request(body,{headers:{'content-type':'text/plain'}});
 const invalid=request('{this-is-not-json');
 const invalidBytes=new Request(origin+CREATIVE_REVIEW_POST_PATH,{
  method:'POST',headers:{
   origin,'content-type':'application/json',
   'x-omnira-creative-review':'review.v1'
  },body:Uint8Array.from([0xff,0xfe])
 });
 for(const req of [request(junk),badType,invalid,invalidBytes]) {
  const x=boundary(),res=await x.handler(req);
  assert.notEqual(res.status,200);
  assert.equal(x.calls.write,0);
 }
});
test('wrong evidence, stale pending status or changed project list cannot record',async()=>{
 for(const pending of [
  {enrollmentId:id,state:'issued',keySha256:'a'.repeat(64),
   proofSha256:'b'.repeat(64),projectIds:[p1,p2]},
  {enrollmentId:id,state:'pending_review',keySha256:'x'.repeat(64),
   proofSha256:'b'.repeat(64),projectIds:[p1,p2]},
  {enrollmentId:id,state:'pending_review',keySha256:'a'.repeat(64),
   proofSha256:'b'.repeat(64),projectIds:[p1]},
 ]) {
  const x=boundary({pending});
  assert.equal((await x.handler(request())).status,409);
  assert.equal(x.calls.write,0);
 }
});
test('fail closed without a trusted operator, owner lookup and store',()=>{
 assert.throws(()=>makeCreativeReviewHttpBoundary({}),/dependencies missing/);
});
