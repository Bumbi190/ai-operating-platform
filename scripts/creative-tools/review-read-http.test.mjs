import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CREATIVE_REVIEW_READ_DEPLOYED,
 makeCreativeReviewReadHttpBoundary,
 CREATIVE_REVIEW_READ_PATH,
} from '../../apps/web/lib/media/creative-queue/review-read-http.mjs';

const origin='https://omnira.invalid';
const id='00000000-0000-4000-8000-000000000090';
const operator='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const p1='00000000-0000-4000-8000-000000000011';
const p2='00000000-0000-4000-8000-000000000012';

function req(search='?enrollmentId='+id,opts={}){
 return new Request((opts.origin??origin)+CREATIVE_REVIEW_READ_PATH+search,{
  method:opts.method??'GET',
  headers:{'sec-fetch-site':'same-origin',...(opts.headers??{})}
 });
}
function fixture(opts={}){
 const calls={operator:0,lookup:0,owners:0};
 const pending={
  enrollmentId:id,workerId:'HultgrenCreative01',requestedBy:operator,
  state:'pending_review',projectIds:[p1,p2],
  keySha256:'a'.repeat(64),proofSha256:'b'.repeat(64),
  publicKeyPem:'SENSITIVE_PEM_NEVER_LEAK',
 };
 const owners=[{id:p1,ownerId:operator},{id:p2,ownerId:operator}];
 const handler=makeCreativeReviewReadHttpBoundary({
  canonicalOrigin:opts.canonicalOrigin??origin,
  operator:async()=>{calls.operator++;return opts.operator??{ok:true,userId:operator}},
  lookup:async()=>{calls.lookup++;return opts.pending??pending},
  projectOwners:async()=>{calls.owners++;return opts.owners??owners},
 });
 return {calls,handler};
}
test('P20 private reader is NOT deployed or enabled in Next host',()=>{
 assert.equal(CREATIVE_REVIEW_READ_DEPLOYED,false);
});
test('authenticated operator + all project ownership -> read-only, no-store projection',async()=>{
 const f=fixture();
 const r=await f.handler(req());
 assert.equal(r.status,200);
 const json=await r.json();
 assert.deepEqual(json,{
  status:'ok',review:{
   enrollmentId:id,workerId:'HultgrenCreative01',
   projectIds:[p1,p2],
   keySha256:'a'.repeat(64),proofSha256:'b'.repeat(64),
   status:'pending_review',reviewSubmissionAvailable:false,
   workerIdentityActivated:false,executionAuthorized:false,publishAuthorized:false,
  }
 });
 assert.deepEqual(f.calls,{operator:1,lookup:1,owners:1});
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 assert.equal(r.headers.get('x-frame-options'),'DENY');
 assert.doesNotMatch(JSON.stringify(json),/SENSITIVE_PEM/);
});
test('cross-origin, cross-site, missing fetch metadata or malformed origin refuse before auth',async()=>{
 for(const query of [
  req('?enrollmentId='+id,{origin:'https://other.invalid'}),
  req('?enrollmentId='+id,{headers:{'sec-fetch-site':'cross-site'}}),
  req('?enrollmentId='+id,{headers:{'sec-fetch-site':''}}),
  req('?enrollmentId='+id,{headers:{origin:'https://attacker.invalid'}}),
 ]) {
  const f=fixture();
  assert.equal((await f.handler(query)).status,403);
  assert.equal(f.calls.operator,0);
 }
});
test('uncanonical query, duplicate ID, body-smuggled fields and wrong HTTP method are refused',async()=>{
 for(const search of [
  '', '?enrollmentId=bad', '?enrollmentId='+id+'&operator=true',
  '?operator=true&enrollmentId='+id,
  '?enrollmentId='+id+'&enrollmentId='+id,
  '?enrollmentId=%30'+id.slice(1),
 ]) {
  const f=fixture(),r=await f.handler(req(search));
  assert.equal(r.status,403,search);
  assert.equal(f.calls.operator,0);
 }
 const f=fixture();
 const post=new Request(origin+CREATIVE_REVIEW_READ_PATH+'?enrollmentId='+id,{
  method:'POST',headers:{'sec-fetch-site':'same-origin'},body:'{"approve":true}'
 });
 assert.equal((await f.handler(post)).status,405);
 assert.equal(f.calls.operator,0);
});
test('missing operator refuses without looking at pending enrollments',async()=>{
 const f=fixture({operator:{ok:false,reason:'unauthenticated'}});
 const r=await f.handler(req());
 assert.equal(r.status,401);
 assert.deepEqual(f.calls,{operator:1,lookup:0,owners:0});
});
test('partial or different project owners result in indistinguishable 404',async()=>{
 for(const owners of [
  [{id:p1,ownerId:operator}],
  [{id:p1,ownerId:operator},{id:p2,ownerId:other}],
  [{id:p1,ownerId:operator},{id:p1,ownerId:operator}],
 ]) {
  const f=fixture({owners});
  const r=await f.handler(req());
  assert.equal(r.status,404);
  assert.deepEqual(await r.json(),{status:'not_available'});
 }
});
test('stale pending enrollment and forged evidence cannot be shown',async()=>{
 const f=fixture({pending:{
  enrollmentId:id,workerId:'HultgrenCreative01',requestedBy:operator,
  state:'approved',projectIds:[p1,p2],
  keySha256:'a'.repeat(64),proofSha256:'b'.repeat(64)
 }});
 assert.equal((await f.handler(req())).status,404);
});
test('missing dependencies fail closed at construction',()=>{
 assert.throws(()=>makeCreativeReviewReadHttpBoundary({}),/dependencies missing/);
});
test('actual Next route.ts GET and POST both return 503 with no database reads',async()=>{
 // We are importing the real Next handler using Node 22 type stripping and
 // relative ESM imports, NOT a reimplemented mock.
 const route=await import('../../apps/web/app/api/atlas/creative/enrollments/review/route.ts');
 assert.equal(route.dynamic,'force-dynamic');
 assert.equal(route.revalidate,0);
 const get=await route.GET(req());
 assert.equal(get.status,503);
 assert.equal((await get.json()).status,'creative_review_unavailable');
 const post=await route.POST(new Request(origin+CREATIVE_REVIEW_READ_PATH,{
  method:'POST',headers:{'sec-fetch-site':'same-origin'},body:'{}'
 }));
 assert.equal(post.status,503);
 const body=await post.json();
 assert.equal(body.executionAuthorized,false);
 assert.equal(body.workerIdentityActivated,false);
 assert.equal(body.publishAuthorized,false);
});
