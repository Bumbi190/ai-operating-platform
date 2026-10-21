import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {
 ENROLLMENT_DOMAIN,canonicalCreativeEnrollment,makeCreativeEnrollmentService
} from '../../apps/web/lib/media/creative-queue/enrollment-core.mjs';

const operatorId='00000000-0000-4000-8000-000000000001';
const project='00000000-0000-4000-8000-000000000011';
const another='00000000-0000-4000-8000-000000000012';
const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const wrongKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const workerId='HultgrenCreative01', keyId='creativeKey001';
const challenge='qwertyuiopasdfghjklzxcvbnm1234567890ABCDE12';
const start=new Date('2026-10-21T07:00:00.000Z');
function harness({allow=true,operatorResult={ok:true,userId:operatorId},at=start}={}){
 const challenges=new Map(),pending=new Map();
 let createCalls=0, stageCalls=0;
 const store={
   async createChallenge(record){
     createCalls++;
     if(!allow||[...challenges.values()].some(x=>x.workerId===record.workerId&&x.state==='issued'))
       return false;
     challenges.set(record.enrollmentId,{...record});
     return true;
   },
   async challengeById(id){return challenges.get(id)??null},
   async stageVerifiedProof(value){
     stageCalls++;
     const record=challenges.get(value.enrollmentId);
     if(!record||record.state!=='issued'||record.workerId!==value.workerId||
       record.challengeHash!==value.challengeHash||
       record.expiresAt!==value.expiresAt||
       Date.parse(record.expiresAt)<=Date.parse(value.at))return false;
     record.state='pending_review';
     pending.set(value.enrollmentId,{...value,state:'pending_review'});
     return true;
   }
 };
 let instant=at;
 const service=makeCreativeEnrollmentService({
   store,operator:async()=>operatorResult,now:()=>instant,
   createId:()=> '00000000-0000-4000-8000-000000000077',
   createChallenge:()=>challenge
 });
 return {service,store,challenges,pending,setNow:t=>instant=t,
   counts:()=>({createCalls,stageCalls})};
}
async function issued(h){
 const start=await h.service.begin({workerId,projectIds:[project]});
 assert.equal(start.status,'ok');
 return start.enrollment;
}
function signed(e,overrides={},privateKey=key.privateKey){
 const candidate={
   schema:ENROLLMENT_DOMAIN,enrollmentId:e.enrollmentId,
   workerId:e.workerId,keyId,challenge:e.challenge,expiresAt:e.expiresAt,
   projectIds:e.projectIds,publicKeyPem:key.publicKey.export({format:'pem',type:'spki'}),
   ...overrides
 };
 const signature=sign('sha256',canonicalCreativeEnrollment(candidate),
   {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return {...candidate,signature};
}
test('operator may request a challenge but cannot enable media worker',async()=>{
 const h=harness();
 const enrollment=await issued(h);
 assert.equal(enrollment.approvalStatus,'not_approved');
 assert.equal(enrollment.executionAuthorized,false);
 assert.equal(enrollment.publishAuthorized,false);
 assert.equal(h.pending.size,0);
});
test('valid signed proof of possession stages pending review only',async()=>{
 const h=harness(); const enrollment=await issued(h);
 const result=await h.service.stage(signed(enrollment));
 assert.equal(result.status,'pending_review');
 assert.equal(result.operatorApprovalVerified,false);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.publishAuthorized,false);
 assert.equal(h.pending.size,1);
 assert.equal(h.pending.values().next().value.state,'pending_review');
});
test('same proof cannot be staged twice',async()=>{
 const h=harness(),enrollment=await issued(h);
 const proof=signed(enrollment);
 assert.equal((await h.service.stage(proof)).status,'pending_review');
 assert.equal((await h.service.stage(proof)).status,'rejected');
});
test('untrusted principal cannot request challenge',async()=>{
 for(const value of [null,{ok:false,reason:'unauthenticated'},
   {ok:true,userId:'forged'}]){
   const h=harness({operatorResult:value});
   assert.equal((await h.service.begin({workerId,projectIds:[project]})).status,
     'operator_required');
   assert.equal(h.counts().createCalls,0);
 }
});
test('canonical project scope rejects slugs, duplicates, unsorted input and extras',async()=>{
 for(const values of [[another,project],[project,project],['familje-stunden'],[],
   [project,'../etc']]){
   const h=harness();
   assert.equal((await h.service.begin({workerId,projectIds:values})).status,
     'invalid_request');
 }
 const h=harness(),enrollment=await issued(h);
 const proof=signed(enrollment);
 assert.equal((await h.service.stage({...proof,shell:'cmd'})).status,'rejected');
});
test('forged signatures, wrong key, mutated project and challenge are refused',async()=>{
 const h=harness(),enrollment=await issued(h);
 const proof=signed(enrollment);
 const mutated={...proof,workerId:'AnotherWorker01'};
 assert.equal((await h.service.stage(mutated)).status,'rejected');
 assert.equal((await h.service.stage({...proof,challenge:'x'+proof.challenge.slice(1)})).status,'rejected');
 assert.equal((await h.service.stage({...proof,projectIds:[another]})).status,'rejected');
 assert.equal((await h.service.stage(signed(enrollment,{},wrongKey.privateKey))).status,'rejected');
 assert.equal(h.counts().stageCalls,0);
});
test('expired challenge and nonexistent enrollment ID refuse without staging',async()=>{
 const h=harness(),enrollment=await issued(h);
 h.setNow(new Date(Date.parse(enrollment.expiresAt)+1000));
 assert.equal((await h.service.stage(signed(enrollment))).status,'expired');
 assert.equal(h.counts().stageCalls,0);
 const anotherHarness=harness();
 const proof=signed(enrollment,{enrollmentId:randomUUID()});
 assert.equal((await anotherHarness.service.stage(proof)).status,'rejected');
});
test('missing trusted store/operator implementation causes fail-closed construction',()=>{
 assert.throws(()=>makeCreativeEnrollmentService({}),/dependencies missing/);
 assert.throws(()=>makeCreativeEnrollmentService({operator:async()=>({ok:true})}),
  /dependencies missing/);
});
