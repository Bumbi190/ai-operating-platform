import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 CREATIVE_REVIEW_ROUTE_ENABLED,
 handleDormantCreativeReviewRoute,
} from '../../apps/web/lib/media/creative-queue/review-route-gate.mjs';

const path='https://omnira.invalid/api/atlas/creative/enrollments/review';
function req(method,extra={}) {
 return new Request(path,{method,headers:extra,
  ...(method==='POST'?{body:'{"decision":"approve_registration_only"}'}:{})});
}
test('production-facing creative review route is compiled OFF',()=>{
 assert.equal(CREATIVE_REVIEW_ROUTE_ENABLED,false);
});
test('GET never queries the database while the review route is OFF',async()=>{
 let called=0;
 const res=await handleDormantCreativeReviewRoute(req('GET'),
  async()=>{called++;return()=>new Response('secret');});
 assert.equal(res.status,503);
 assert.equal(called,0);
 const json=await res.json();
 assert.equal(json.status,'creative_review_unavailable');
 assert.equal(json.executionAuthorized,false);
 assert.equal(json.workerIdentityActivated,false);
 assert.equal(json.publishAuthorized,false);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.equal(res.headers.get('x-content-type-options'),'nosniff');
});
test('POST cannot enable access through headers, cookies or request body',async()=>{
 for(const headers of [
   {origin:'https://omnira.invalid'},
   {'x-omnira-creative-review':'review.v1'},
   {'x-omnira-creative-review':'enable', 'x-admin':'true'},
   {cookie:'session=fake; role=operator'},
   {authorization:'Bearer arbitrary-service-key'},
 ]) {
   let count=0;
   const res=await handleDormantCreativeReviewRoute(req('POST',headers),
     async()=>{count++;return()=>new Response('approved',{status:200});});
   assert.equal(res.status,503);
   assert.equal(count,0);
 }
});
test('request method, null request and malformed input also fail shut',async()=>{
 for(const request of [null,req('HEAD'),req('DELETE')]){
  let count=0;
  const result=await handleDormantCreativeReviewRoute(request,
    async()=>{count++;return()=>new Response('open');});
  assert.equal(result.status,503);
  assert.equal(count,0);
 }
});
test('real Next host exposes only inert methods and no privileged imports',()=>{
 const src=readFileSync(resolve(import.meta.dirname,
  '../../apps/web/app/api/atlas/creative/enrollments/review/route.ts'),'utf8');
 assert.match(src,/export async function GET/);
 assert.match(src,/export async function POST/);
 assert.match(src,/force-dynamic/);
 assert.match(src,/handleDormantCreativeReviewRoute/);
 assert.doesNotMatch(src,/createAdminClient|SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(src,/createDormantCreativeReviewHttpHandler/);
 assert.doesNotMatch(src,/\bapproveBroker\b|worker-provision/);
});
test('P17 UI approve and reject remain disabled with no event handlers',()=>{
 const src=readFileSync(resolve(import.meta.dirname,
  '../../apps/web/components/creative/CreativeEnrollmentReviewPreview.tsx'),'utf8');
 assert.equal((src.match(/disabled aria-disabled="true"/g)||[]).length,2);
 assert.doesNotMatch(src,/\bonClick\s*=|\bfetch\s*\(|\bonSubmit\s*=/);
});
