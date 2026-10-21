import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {makeCreativeEnrollmentStore} from
 '../../../apps/web/lib/media/creative-queue/enrollment-store.mjs';
import {makeCreativeEnrollmentService,canonicalCreativeEnrollment,
 ENROLLMENT_DOMAIN} from '../../../apps/web/lib/media/creative-queue/enrollment-core.mjs';

const db=new PGlite();
const migration=name=>readFileSync(resolve(import.meta.dirname,
 '../../../apps/web/supabase/creative-drafts/'+name),'utf8');
const operatorId='00000000-0000-4000-8000-000000000001';
const projectId='00000000-0000-4000-8000-000000000011';
const worker='HultgrenCreative01';
const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const challenge='qwertyuiopasdfghjklzxcvbnm1234567890ABCDE12';
const enrollId='00000000-0000-4000-8000-000000000077';
const now=new Date();
function trustedDb(){
 return {
  from(name){
   assert.equal(name,'atlas_creative_enrollment_staging');
   return {select(columns){
    assert.match(columns,/challenge_sha256/);
    return {eq(col,id){
     assert.equal(col,'enrollment_id');
     return {async maybeSingle(){
      try{
       const {rows}=await db.query('select enrollment_id,worker_id,project_ids,challenge_sha256,'+
        "to_char(expires_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as expires_at,"+
        'requested_by,state from public.atlas_creative_enrollment_staging where enrollment_id=$1',[id]);
       return {data:rows[0]??null,error:null};
      }catch(e){return {data:null,error:{message:String(e)}}}
     }};
    }};
   }};
  },
  async rpc(name,params){
   const columns=Object.values(params);
   const args=columns.map((_,i)=>'$'+(i+1)).join(',');
   const sql='select public.'+name+'('+args+') as accepted';
   await db.exec('set role service_role');
   try{
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const {rows}=await db.query(sql,columns);
    return {data:rows[0].accepted,error:null};
   } catch(e){return {data:null,error:{message:String(e)}}}
   finally{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.role','',false)");
   }
  }
 };
}
function makeService(operator=true){
 return makeCreativeEnrollmentService({
  store:makeCreativeEnrollmentStore(trustedDb()),
  operator:async()=>operator?{ok:true,userId:operatorId}:{ok:false,reason:'unauthenticated'},
  now:()=>now,
  createId:()=>enrollId,
  createChallenge:()=>challenge
 });
}
function signed(enrollment,opts={}){
 const proof={
  schema:ENROLLMENT_DOMAIN,enrollmentId:enrollId,workerId:worker,
  keyId:'creativeKey001',challenge:enrollment.challenge,
  projectIds:[projectId],expiresAt:enrollment.expiresAt,
  publicKeyPem:key.publicKey.export({type:'spki',format:'pem'}),
  ...opts
 };
 return {...proof,signature:sign('sha256',canonicalCreativeEnrollment(proof),
  {key:key.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};
}
before(async()=>{
 await db.exec('create role service_role nologin;create role anon nologin;create role authenticated nologin;');
 await db.exec(migration('20261020235500_atlas_creative_worker_identity_p10.sql'));
 await db.exec(migration('20261021080000_atlas_creative_worker_enrollment_staging_p13.sql'));
});
after(async()=>db.close());
test('no authentic operator: no challenge or database insert',async()=>{
 assert.equal((await makeService(false).begin({workerId:worker,projectIds:[projectId]})).status,
  'operator_required');
 assert.equal((await db.query('select count(*)::int as n from public.atlas_creative_enrollment_staging')).rows[0].n,0);
});
test('operator challenge -> signed proof -> durable pending review, no active worker',async()=>{
 const service=makeService();
 const begun=await service.begin({workerId:worker,projectIds:[projectId]});
 assert.equal(begun.status,'ok');
 assert.equal(begun.enrollment.executionAuthorized,false);
 const approved=await makeService().stage(signed(begun.enrollment));
 assert.equal(approved.status,'pending_review');
 assert.equal(approved.operatorApprovalVerified,false);
 assert.equal(approved.executionAuthorized,false);
 assert.equal(approved.publishAuthorized,false);
 const {rows}=await db.query("select state,key_id from public.atlas_creative_enrollment_staging where enrollment_id=$1",[enrollId]);
 assert.equal(rows[0].state,'pending_review');
 assert.equal(rows[0].key_id,'creativeKey001');
 assert.equal((await db.query('select count(*)::int as n from public.atlas_creative_worker_identities')).rows[0].n,0);
});
test('new service instance refuses the signed enrollment proof replay',async()=>{
 const {rows}=await db.query("select to_char(expires_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as expires_at from public.atlas_creative_enrollment_staging where enrollment_id=$1",[enrollId]);
 const proof=signed({challenge,expiresAt:rows[0].expires_at});
 assert.equal((await makeService().stage(proof)).status,'rejected');
});
test('two operator requests cannot silently recreate an already reviewed challenge',async()=>{
 const response=await makeService().begin({workerId:worker,projectIds:[projectId]});
 assert.equal(response.status,'conflict');
});
