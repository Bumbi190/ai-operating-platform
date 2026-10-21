import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreativeEnrollmentStore} from
 '../../apps/web/lib/media/creative-queue/enrollment-store.mjs';

const id='00000000-0000-4000-8000-000000000077';
const project='00000000-0000-4000-8000-000000000011';
const operator='00000000-0000-4000-8000-000000000001';
const makeDb=(expires_at)=>{
 let rpcCalls=0;
 const db={
  rpc:async()=>{rpcCalls++;return {data:true,error:null}},
  from(name){
   assert.equal(name,'atlas_creative_enrollment_staging');
   return {select(){return {eq(col,val){
    assert.equal(col,'enrollment_id');assert.equal(val,id);
    return {maybeSingle:async()=>({data:{
     enrollment_id:id,worker_id:'HultgrenCreative01',
     project_ids:[project],challenge_sha256:'a'.repeat(64),
     expires_at,requested_by:operator,state:'issued'
    },error:null})};
   }}}}
  }
 };
 return {db,count:()=>rpcCalls};
};
test('PostgREST timestamp offsets normalize to exactly signed UTC ISO milliseconds',async()=>{
 const store=makeCreativeEnrollmentStore(makeDb('2026-10-21T07:05:00+00:00').db);
 const record=await store.challengeById(id);
 assert.equal(record?.expiresAt,'2026-10-21T07:05:00.000Z');
 const offset=makeCreativeEnrollmentStore(makeDb('2026-10-21T09:05:00+02:00').db);
 assert.equal((await offset.challengeById(id)).expiresAt,'2026-10-21T07:05:00.000Z');
});
test('server timestamp without explicit timezone refuses',async()=>{
 const store=makeCreativeEnrollmentStore(makeDb('2026-10-21T07:05:00').db);
 assert.equal(await store.challengeById(id),null);
});
test('malformed trusted DB input and missing dependencies fail closed',async()=>{
 assert.throws(()=>makeCreativeEnrollmentStore(null),/DB missing/);
 const store=makeCreativeEnrollmentStore(makeDb('garbage').db);
 assert.equal(await store.challengeById(id),null);
 assert.equal(await store.challengeById('../etc'),null);
});
test('server stage only accepts reviewed, scoped canonical fields',async()=>{
 const fake=makeDb('2026-10-21T07:05:00+00:00');
 const store=makeCreativeEnrollmentStore(fake.db);
 const ok={
  enrollmentId:id,workerId:'HultgrenCreative01',requestedBy:operator,
  keyId:'creativeKey001',projectIds:[project],
  challengeHash:'a'.repeat(64),publicKeyPem:'P'.repeat(120),
  publicKeySha256:'b'.repeat(64),canonicalProofHash:'c'.repeat(64),
  expiresAt:'2026-10-21T07:05:00.000Z',
  at:'2026-10-21T07:02:00.000Z'
 };
 assert.equal(await store.stageVerifiedProof({...ok,projectIds:['familje-stunden']}),false);
 assert.equal(fake.count(),0);
 assert.equal(await store.stageVerifiedProof(ok),true);
 assert.equal(fake.count(),1);
});
