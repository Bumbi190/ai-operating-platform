import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const fixture=(file)=>readFileSync(resolve(import.meta.dirname,
 '../../../apps/web/supabase/creative-drafts/'+file),'utf8');
const enrollment='00000000-0000-4000-8000-000000000090';
const user='00000000-0000-4000-8000-000000000001';
const project='00000000-0000-4000-8000-000000000011';
const sha=(ch)=>ch.repeat(64);
const args=(decision='approve_registration_only',nonce=sha('c'),
  reviewer=user,proof=sha('b'))=>[
 enrollment,reviewer,decision,sha('a'),proof,[project],nonce,'operator_verified_test'
];
const review='select public.atlas_creative_enrollment_record_review_p15('+
 '$1,$2,$3,$4,$5,$6::uuid[],$7,$8) as approved';
async function asService(p) {
 await db.exec('set role service_role');
 try {
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  const {rows}=await db.query(review,p);return rows[0].approved;
 } finally {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role','',false)");
 }
}
before(async()=>{
 await db.exec('create role service_role nologin;create role anon nologin;create role authenticated nologin;');
 await db.exec(fixture('20261020235500_atlas_creative_worker_identity_p10.sql'));
 await db.exec(fixture('20261021080000_atlas_creative_worker_enrollment_staging_p13.sql'));
 await db.exec(fixture('20261021100000_atlas_creative_enrollment_review_p15.sql'));
 await db.query(
  'insert into public.atlas_creative_enrollment_staging '+
  '(enrollment_id,worker_id,requested_by,project_ids,challenge_sha256,expires_at,state,key_id,'+
  'public_key_spki_pem,public_key_sha256,canonical_proof_sha256,proof_verified_at) '+
  'values($1,$2,$3,$4::uuid[],$5,clock_timestamp()+interval \'2 minutes\',\'pending_review\',$6,$7,$8,$9,clock_timestamp())',
  [enrollment,'HultgrenCreative01',user,[project],sha('d'),
   'creativeKey001','K'.repeat(120),sha('a'),sha('b')]
 );
});
after(async()=>db.close());
test('P15 migration creates private ledger with no direct client writes',async()=>{
 const {rows}=await db.query("select "+
  "has_function_privilege('authenticated','public.atlas_creative_enrollment_record_review_p15(uuid,uuid,text,text,text,uuid[],text,text)','EXECUTE') as user_fn,"+
  "has_table_privilege('service_role','public.atlas_creative_enrollment_review_decisions','UPDATE') as service_update,"+
  "has_table_privilege('service_role','public.atlas_creative_enrollment_review_decisions','SELECT') as service_read");
 assert.deepEqual(rows[0],{user_fn:false,service_update:false,service_read:true});
});
test('wrong proof or forged operator scope does not match immutable pending review',async()=>{
 assert.equal(await asService(args('approve_registration_only',sha('3'),user,sha('e'))),false);
 assert.equal(await asService([
  enrollment,user,'approve_registration_only',sha('a'),sha('b'),
  ['00000000-0000-4000-8000-000000000012'],sha('4'),'operator_verified_test'
 ]),false);
});
test('valid operator review records decision exactly once, no identity activation',async()=>{
 assert.equal(await asService(args()),true);
 assert.equal(await asService(args()),false);
 assert.equal(await asService(args('reject_registration',sha('e'))),false);
 const {rows}=await db.query('select decision,reviewer_user_id from public.atlas_creative_enrollment_review_decisions');
 assert.equal(rows.length,1);
 assert.equal(rows[0].decision,'approve_registration_only');
 assert.equal(rows[0].reviewer_user_id,user);
 const identity=await db.query('select count(*)::int as n from public.atlas_creative_worker_identities');
 assert.equal(identity.rows[0].n,0);
});
test('browser role cannot spoof service role and append a decision',async()=>{
 await db.exec('set role authenticated');
 try {
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  await assert.rejects(db.query(review,args('reject_registration',sha('f'))),/permission denied/i);
 } finally {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role','',false)");
 }
});
