/**
 * P21 actual localhost TCP/HTTP request testing for the REAL Next route file
 * and the P20 UNMOUNTED private GET adapter. This is NOT Next.js runtime.
 * The test server binds only to 127.0.0.1:0 and is always shut down.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { makeCreativeReviewReadHttpBoundary } from
 '../../apps/web/lib/media/creative-queue/review-read-http.mjs';
const nextRoute=await import(
 '../../apps/web/app/api/atlas/creative/enrollments/review/route.ts'
);

const PATH='/api/atlas/creative/enrollments/review';
const enrollment='00000000-0000-4000-8000-000000000090';
const operatorId='00000000-0000-4000-8000-000000000001';
const otherId='00000000-0000-4000-8000-000000000002';
const p1='00000000-0000-4000-8000-000000000011';
const p2='00000000-0000-4000-8000-000000000012';

async function withLocalHttpServer(mode,run,options={}) {
 let handler;
 const reads={operators:0,enrollments:0,projects:0};
 const server=createServer(async (req,res)=>{
  try {
   const bound=server.address();
   if (!bound || typeof bound==='string') throw new Error('invalid bind');
   const base='http://127.0.0.1:'+bound.port;
   // Never take the socket authority from request's untrusted Host header.
   const target=new URL(req.url??'/',base);
   if(target.origin!==base)throw new Error('nonlocal target');
   let body;
   if(req.method==='POST') {
    const chunks=[];let size=0;
    for await(const chunk of req) {
     size+=chunk.byteLength;
     if(size>8192){res.writeHead(413);res.end();return}
     chunks.push(chunk);
    }
    body=Buffer.concat(chunks);
   }
   const optionsReq={method:req.method,headers:req.headers};
   if(body && body.length)optionsReq.body=body;
   const request=new Request(target,optionsReq);
   let result;
   if(mode==='next'){
    const action=req.method==='POST'?nextRoute.POST:nextRoute.GET;
    result=await action(request);
   } else {
    result=await handler(request);
   }
   res.writeHead(result.status,Object.fromEntries(result.headers));
   res.end(Buffer.from(await result.arrayBuffer()));
  }catch{
   res.writeHead(503,{'cache-control':'no-store'});
   res.end();
  }
 });
 try {
  server.listen({port:0,host:'127.0.0.1',exclusive:true});
  await once(server,'listening');
  const local=server.address();
  assert.equal(local.address,'127.0.0.1');
  const origin='http://127.0.0.1:'+local.port;
  if(mode==='preview'){
   handler=makeCreativeReviewReadHttpBoundary({
    canonicalOrigin:origin,
    operator:async()=>{
     reads.operators++;
     return options.operator??{ok:true,userId:operatorId};
    },
    lookup:async ()=>{
     reads.enrollments++;
     return options.record??{
      enrollmentId:enrollment,workerId:'HultgrenCreative01',
      requestedBy:operatorId,state:'pending_review',
      projectIds:[p1,p2],keySha256:'a'.repeat(64),
      proofSha256:'b'.repeat(64),
      publicKeyPem:'SECRET_SIGNING_KEY_MUST_NOT_LEAK',
      bearerToken:'SECRET_BEARER_TOKEN_MUST_NOT_LEAK',
     };
    },
    projectOwners:async()=>{
     reads.projects++;
     return options.owners??[
      {id:p1,ownerId:operatorId},{id:p2,ownerId:operatorId}
     ];
    }
   });
  }
  await run({origin,reads});
 } finally {
  server.closeAllConnections?.();
  if(server.listening) await new Promise((resolve,reject)=>
   server.close(err=>err?reject(err):resolve()));
 }
}
function headers(extra={}){
 return {'sec-fetch-site':'same-origin',...extra};
}
test('loopback test listener binds only to 127.0.0.1; actual route GET always returns 503',async()=>{
 await withLocalHttpServer('next',async({origin})=>{
  const response=await fetch(origin+PATH+'?enrollmentId='+enrollment,{
   headers:headers({'cookie':'fake_operator=true','origin':origin}),
  });
  assert.equal(response.status,503);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(await response.json(),{
   status:'creative_review_unavailable',
   workerIdentityActivated:false,executionAuthorized:false,publishAuthorized:false
  });
 });
});
test('actual route POST refuses fake approval and operator impersonation over TCP HTTP',async()=>{
 await withLocalHttpServer('next',async({origin})=>{
  const response=await fetch(origin+PATH,{
   method:'POST',
   headers:headers({
    'content-type':'application/json',
    'origin':origin,
    'x-omnira-creative-review':'review.v1',
    'authorization':'Bearer forged',
    'cookie':'role=platform_operator',
   }),
   body:JSON.stringify({
    decision:'approve_registration_only',
    operatorId,projectIds:[p1,p2],
    executionAuthorized:true
   })
  });
  assert.equal(response.status,503);
  const json=await response.json();
  assert.equal(json.executionAuthorized,false);
  assert.equal(json.publishAuthorized,false);
  assert.equal(json.workerIdentityActivated,false);
 });
});
test('candidate read-only GET over local TCP requires operator and all project owners',async()=>{
 await withLocalHttpServer('preview',async({origin,reads})=>{
  const response=await fetch(origin+PATH+'?enrollmentId='+enrollment,{
   headers:headers({origin})
  });
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.status,'ok');
  assert.deepEqual(payload.review.projectIds,[p1,p2]);
  assert.equal(payload.review.reviewSubmissionAvailable,false);
  assert.equal(payload.review.executionAuthorized,false);
  assert.equal(payload.review.publishAuthorized,false);
  assert.deepEqual(reads,{operators:1,enrollments:1,projects:1});
  assert.doesNotMatch(JSON.stringify(payload),/SECRET_SIGNING_KEY|SECRET_BEARER_TOKEN/);
  assert.match(response.headers.get('cache-control'),/private.*no-store/);
 },{});
});
test('candidate rejects cross-site and wrong-origin requests before lookup',async()=>{
 await withLocalHttpServer('preview',async({origin,reads})=>{
  const requests=[
   {headers:headers({'origin':'http://malicious.invalid'})},
   {headers:headers({'sec-fetch-site':'cross-site'})},
   {headers:{origin}},
   {headers:headers({'cookie':'role=operator'}),url:'?enrollmentId='+enrollment+'&admin=true'},
  ];
  for(const opts of requests) {
   const r=await fetch(origin+PATH+(opts.url??'?enrollmentId='+enrollment),{
    headers:opts.headers
   });
   assert.equal(r.status,403);
  }
  assert.deepEqual(reads,{operators:0,enrollments:0,projects:0});
 });
});
test('candidate refuses foreign project owner and never leaks enrollment existence',async()=>{
 await withLocalHttpServer('preview',async({origin,reads})=>{
  const response=await fetch(origin+PATH+'?enrollmentId='+enrollment,{
   headers:headers({origin})
  });
  assert.equal(response.status,404);
  assert.deepEqual(await response.json(),{status:'not_available'});
  assert.deepEqual(reads,{operators:1,enrollments:1,projects:1});
 },{owners:[{id:p1,ownerId:operatorId},{id:p2,ownerId:otherId}]});
});
test('candidate denies absent operator without reading or revealing any enrollment',async()=>{
 await withLocalHttpServer('preview',async({origin,reads})=>{
  const r=await fetch(origin+PATH+'?enrollmentId='+enrollment,{
   headers:headers({origin})
  });
  assert.equal(r.status,401);
  assert.deepEqual(reads,{operators:1,enrollments:0,projects:0});
 },{operator:{ok:false,reason:'unauthenticated'}});
});
