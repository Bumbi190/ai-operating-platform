import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {
  CREATIVE_CLAIM_PATH,canonicalCreativeWorkerRequest,
  readCreativeWorkerHeaders,makeCreativeWorkerAuthenticator
} from './worker-request-auth.mjs';
import {handleCreativeQueueClaim} from './queue-http-contract.mjs';
import {CREATIVE_QUEUE_SCHEMA,canonicalCreativeQueueClaims} from './signed-queue.mjs';

const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const server=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const foreign=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const now=new Date('2026-10-20T20:00:00.000Z');
const workerId='HultgrenCreative01',keyId='creativeKey001';
const projectId='00000000-0000-4000-8000-000000000010';
const wrongProjectId='00000000-0000-4000-8000-000000000020';
const assetId='00000000-0000-4000-8000-000000000021';
const sha=x=>createHash('sha256').update(x).digest('hex');
const b64='abcdefghijklmnopqrstuvwx';
const defaults={
 workerId,keyId,counter:1,nonce:b64,
 timestamp:now.toISOString(),method:'POST',path:CREATIVE_CLAIM_PATH
};
const body=JSON.stringify({workId:'creativeWork01'});
const ticketClaims={
 schema:CREATIVE_QUEUE_SCHEMA,workId:'creativeWork01',workerId,projectId,
 sourceAssetId:assetId,sourceSha256:'a'.repeat(64),
 operation:'photocraft.convert-webp',binarySha256:'b'.repeat(64),
 approvalReceiptSha256:'c'.repeat(64),outputMaxBytes:100000,
 issuedAt:'2026-10-20T19:59:00.000Z',
 expiresAt:'2026-10-20T20:02:00.000Z',
 claimNonce:'creativeNonce0123456789abcdef',
};
const ticket={
 claims:ticketClaims,
 signature:sign('sha256',canonicalCreativeQueueClaims(ticketClaims),
  {key:server.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
};
const expected=Object.fromEntries(
 ['workId','workerId','projectId','sourceAssetId','sourceSha256',
  'operation','binarySha256','approvalReceiptSha256','outputMaxBytes']
 .map(x=>[x,ticketClaims[x]])
);
function signedRequest(text=body,props={},privateKey=pair.privateKey,overridePath=CREATIVE_CLAIM_PATH) {
 const proof={...defaults,...props,path:overridePath,bodySha256:sha(text)};
 const signature=sign('sha256',Buffer.from(canonicalCreativeWorkerRequest(
  {...proof,path:CREATIVE_CLAIM_PATH})),
  {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return new Request('https://omnira.invalid'+overridePath,{
   method:'POST',body:text,headers:{
     'content-type':'application/json',
     'x-omnira-creative-worker-id':proof.workerId,
     'x-omnira-creative-key-id':proof.keyId,
     'x-omnira-creative-counter':String(proof.counter),
     'x-omnira-creative-nonce':proof.nonce,
     'x-omnira-creative-timestamp':proof.timestamp,
     'x-omnira-creative-signature':signature,
   }
 });
}
function trusted(authOverrides={}) {
 let lookupCount=0,consumeCount=0,lastCounter=0;
 const seen=new Set();
 let state='active';
 const identity={
  workerId,keyId,state:'active',creativeClaimEnabled:true,
  projectIds:[projectId],
  publicKey:pair.publicKey.export({type:'spki',format:'pem'}),
  ...authOverrides
 };
 const registry={getWorker:async id=>{lookupCount++;return id===workerId?{...identity,state}:null}};
 const store={consumeVerifiedProof:async p=>{
   consumeCount++;
   if(state!=='active'||p.workerId!==workerId||p.keyId!==keyId||
     p.requiredCapability!=='creative.queue.claim'||
     p.counter<=lastCounter||seen.has(p.nonceHash)) return false;
   seen.add(p.nonceHash);lastCounter=p.counter;
   return true;
 }};
 const auth=makeCreativeWorkerAuthenticator({registry,store,now:()=>now});
 return {
  auth,store,registry,revoke:()=>{state='revoked'},
  counts:()=>({lookupCount,consumeCount})
 };
}
test('signature over exact raw body, route, counter, nonce and scope is accepted',async()=>{
 const x=trusted();
 const result=await x.auth(signedRequest(),body);
 assert.equal(result?.authenticated,true);
 assert.equal(result?.creativeCapability,true);
 assert.deepEqual(result?.allowedProjectIds,[projectId]);
 assert.deepEqual(x.counts(),{lookupCount:1,consumeCount:1});
});
test('modified body is rejected before any nonce consumption',async()=>{
 const x=trusted();
 assert.equal(await x.auth(signedRequest(),body+' '),null);
 assert.equal(x.counts().consumeCount,0);
});
test('wrong key, revoked identity or disabled creative capability refuses',async()=>{
 const key=trusted();
 assert.equal(await key.auth(signedRequest(body,{},foreign.privateKey),body),null);
 assert.equal(key.counts().consumeCount,0);
 const rev=trusted();rev.revoke();
 assert.equal(await rev.auth(signedRequest(),body),null);
 const disabled=trusted({creativeClaimEnabled:false});
 assert.equal(await disabled.auth(signedRequest(),body),null);
});
test('signed request cannot be replayed; counter must increase and nonce must differ',async()=>{
 const x=trusted();
 assert.ok(await x.auth(signedRequest(),body));
 assert.equal(await x.auth(signedRequest(),body),null);
 assert.equal(await x.auth(signedRequest(body,{counter:2}),body),null);
 assert.equal(await x.auth(signedRequest(body,{counter:1,nonce:'anotherNonce012345678901'}),body),null);
 assert.ok(await x.auth(signedRequest(body,{counter:2,nonce:'anotherNonce012345678901'}),body));
});
test('stale, future-issued and malformed timestamp proofs refuse',async()=>{
 const x=trusted();
 assert.equal(await x.auth(signedRequest(body,{timestamp:'2026-10-20T19:58:00.000Z'}),body),null);
 assert.equal(await x.auth(signedRequest(body,{timestamp:'2026-10-20T20:01:00.000Z'}),body),null);
 assert.equal(x.counts().lookupCount,0);
});
test('alternate route, query parameters, uncanonical ID, or non-POST are rejected',async()=>{
 const x=trusted();
 assert.equal(readCreativeWorkerHeaders(signedRequest(),body)?.workerId,workerId);
 assert.equal(readCreativeWorkerHeaders(
  new Request('https://omnira.invalid'+CREATIVE_CLAIM_PATH+'?bypass=1',{
   method:'POST',body,headers:signedRequest().headers
  }),body),null);
 assert.equal(readCreativeWorkerHeaders(
  new Request('https://omnira.invalid'+CREATIVE_CLAIM_PATH,{
   method:'GET',headers:signedRequest().headers
  }),body),null);
 const changed=signedRequest();
 changed.headers.set('x-omnira-creative-worker-id','../Other');
 assert.equal(await x.auth(changed,body),null);
});
test('wrong/noncanonical project scopes are rejected',async()=>{
 for(const projects of [
  [wrongProjectId,'bad/slug'],['familje-stunden'],[],
  [projectId,projectId],Array(33).fill(projectId)
 ]) {
  const x=trusted({projectIds:projects});
  assert.equal(await x.auth(signedRequest(),body),null);
 }
});
test('fail closed without trusted registry + durable replay store',()=>{
 assert.throws(()=>makeCreativeWorkerAuthenticator({registry:{getWorker:async()=>null}}),
  /dependencies missing/);
 assert.throws(()=>makeCreativeWorkerAuthenticator({store:{consumeVerifiedProof:async()=>true}}),
  /dependencies missing/);
});
test('actual creative HTTP contract accepts trusted signature once without execution rights',async()=>{
 const x=trusted();
 let claimCount=0;
 const deps={
   pilot:true,now:()=>now,trustedServerKey:server.publicKey,
   authenticateWorker:x.auth,
   claimAtomic:async({workId,workerId:who,allowedProjectIds})=>{
    claimCount++;
    if(workId!==ticketClaims.workId || who!==workerId ||
      !allowedProjectIds.includes(projectId)) return null;
    return {ticket,expected};
   }
 };
 const first=await handleCreativeQueueClaim(signedRequest(),deps);
 assert.equal(first.status,200);
 const value=await first.json();
 assert.equal(value.executionAuthorized,false);
 assert.equal(value.publishAuthorized,false);
 assert.equal(value.status,'claimed-no-execution');
 const second=await handleCreativeQueueClaim(signedRequest(),deps);
 assert.equal(second.status,401);
 assert.equal(claimCount,1);
});

test('canonical UUID project IDs work; malformed IDs refuse at ticket boundary',()=>{
 assert.match(canonicalCreativeQueueClaims(ticketClaims).toString('utf8'),
  /projectId:00000000-0000-4000-8000-000000000010/);
 assert.throws(()=>canonicalCreativeQueueClaims({
  ...ticketClaims,projectId:'../some-other-project'
 }),/invalid creative ticket scope/);
});
test('invalid UTF-8 HTTP bytes never become trusted signed JSON',async()=>{
 const request=new Request('https://omnira.invalid'+CREATIVE_CLAIM_PATH,{
  method:'POST',headers:{'content-type':'application/json'},
  body:Uint8Array.from([0xff,0xfe,0x7b,0x7d])
 });
 assert.equal((await handleCreativeQueueClaim(request,null)).status,400);
});
