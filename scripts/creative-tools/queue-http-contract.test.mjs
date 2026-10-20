import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonicalCreativeQueueClaims,CREATIVE_QUEUE_SCHEMA} from './signed-queue.mjs';
import {handleCreativeQueueClaim,CREATIVE_HTTP_PRODUCTION_ENABLED} from './queue-http-contract.mjs';

const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const now=new Date('2026-10-20T19:00:00.000Z');
const claims={
 schema:CREATIVE_QUEUE_SCHEMA,workId:'work123',workerId:'HultgrenCreative01',
 projectId:'familje-stunden',sourceAssetId:'00000000-0000-4000-8000-000000000001',
 sourceSha256:'a'.repeat(64),operation:'photocraft.convert-webp',
 binarySha256:'b'.repeat(64),approvalReceiptSha256:'c'.repeat(64),
 outputMaxBytes:2000000,issuedAt:'2026-10-20T18:58:00.000Z',
 expiresAt:'2026-10-20T19:02:00.000Z',claimNonce:'abc0123456789abc0123456789abcdef',
};
const expected=Object.fromEntries([
 'workId','workerId','projectId','sourceAssetId','sourceSha256',
 'operation','binarySha256','approvalReceiptSha256','outputMaxBytes'
].map(k=>[k,claims[k]]));
const ticket={claims,signature:sign('sha256',canonicalCreativeQueueClaims(claims),
 {key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};
const req=(body=JSON.stringify({workId:'work123'}),options={})=>new Request(
 'https://omnira.invalid/api/atlas/creative/worker/claim',{
 method:'POST',headers:{'content-type':'application/json',...(options.headers||{})},
 body,});
const principal={authenticated:true,creativeCapability:true,
 workerId:'HultgrenCreative01',allowedProjectIds:['familje-stunden']};
function deps(p=principal) {
 const state={claimed:false,attempts:0};
 const services={pilot:true,now:()=>now,trustedServerKey:pair.publicKey,
  authenticateWorker:async()=>p,
  claimAtomic:async ({workId,workerId,allowedProjectIds})=>{
   state.attempts++;
   if(state.claimed || workId!=='work123' || workerId!==expected.workerId ||
     !allowedProjectIds.includes(expected.projectId)) return null;
   state.claimed=true;
   return {ticket,expected,trustedServerKey:pair.publicKey};
  }};
 return {state,services};
}
test('HTTP boundary is not active in production by default',()=>{
 assert.equal(CREATIVE_HTTP_PRODUCTION_ENABLED,false);
});
test('no trusted adapter, non-POST and wrong content types are denied',async()=>{
 assert.equal((await handleCreativeQueueClaim(req(),null)).status,503);
 assert.equal((await handleCreativeQueueClaim(new Request('https://omnira.invalid',{method:'GET'}),deps().services)).status,405);
 assert.equal((await handleCreativeQueueClaim(req('{}',{headers:{'content-type':'text/plain'}}),deps().services)).status,400);
});
test('rejects oversized/malformed payload before querying the queue',async()=>{
 const {state,services}=deps();
 const tooLarge='x'.repeat(800);
 assert.equal((await handleCreativeQueueClaim(req(tooLarge),services)).status,413);
 assert.equal((await handleCreativeQueueClaim(req('oops'),services)).status,400);
 assert.equal((await handleCreativeQueueClaim(req('{"workId":"../bad"}'),services)).status,400);
 assert.equal((await handleCreativeQueueClaim(req('{"workId":"work123","shell":"powershell"}'),services)).status,400);
 assert.equal(state.attempts,0);
});
test('unauthenticated and cross-capability principals cannot claim',async()=>{
 for(const p of [null,{...principal,authenticated:false},{...principal,creativeCapability:false}]){
  const {state,services}=deps(p);
  assert.equal((await handleCreativeQueueClaim(req(),services)).status,401);
  assert.equal(state.attempts,0);
 }
});
test('valid scoped claim returns signed ticket but NEVER execution authority',async()=>{
 const {services}=deps();
 const first=await handleCreativeQueueClaim(req(),services);
 assert.equal(first.status,200);
 assert.equal(first.headers.get('cache-control'),'no-store');
 const json=await first.json();
 assert.equal(json.status,'claimed-no-execution');
 assert.equal(json.executionAuthorized,false);
 assert.equal(json.publishAuthorized,false);
 assert.equal(json.ticket.claims.workerId,principal.workerId);
 const second=await handleCreativeQueueClaim(req(),services);
 assert.equal(second.status,404);
});
test('cross-project and cross-worker claims rejected',async()=>{
 const changed={
  ...deps().services,
  claimAtomic:async()=>({ticket,expected:{...expected,projectId:'handlarborsen'},trustedServerKey:pair.publicKey}),
 };
 assert.equal((await handleCreativeQueueClaim(req(),changed)).status,403);
 const wrongWorker={...deps().services,
  authenticateWorker:async()=>({...principal,workerId:'AnotherMediaWorker'})};
 assert.equal((await handleCreativeQueueClaim(req(),wrongWorker)).status,404);
});
test('signature or pinned scope mutation is refused',async()=>{
 const corrupted={...ticket,signature:'A'+ticket.signature.slice(1)};
 const services={...deps().services,
  claimAtomic:async()=>({ticket:corrupted,expected,trustedServerKey:pair.publicKey})};
 assert.equal((await handleCreativeQueueClaim(req(),services)).status,409);
});

test('server public key cannot be supplied by a claimed job',async()=>{
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const services={...deps().services,trustedServerKey:other.publicKey};
 const denied=await handleCreativeQueueClaim(req(),services);
 assert.equal(denied.status,409);
});
test('a returned signed ticket for another worker is rejected',async()=>{
 const services={...deps().services,
  claimAtomic:async()=>({ticket,expected:{...expected,workerId:'DifferentWorker02'}})};
 assert.equal((await handleCreativeQueueClaim(req(),services)).status,403);
});
