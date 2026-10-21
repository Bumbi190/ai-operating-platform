import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const file=name=>readFileSync(resolve(import.meta.dirname,
 '../../../apps/web/supabase/migrations/'+name),'utf8');
const operator='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const firstProject='00000000-0000-4000-8000-000000000011';
const secondProject='00000000-0000-4000-8000-000000000012';
const first='00000000-0000-4000-8000-000000000090';
const second='00000000-0000-4000-8000-000000000091';
const third='00000000-0000-4000-8000-000000000092';
const h=c=>c.repeat(64);
const proofHash=id=>id===first?h('b'):id===second?h('f'):h('0');
const p18='select public.atlas_creative_enrollment_record_review_p18($1,$2,$3,$4,$5,$6::uuid[],$7,$8) as accepted';
const payload=(id=first,actor=operator,projects=[firstProject],
  nonce=h('1'),action='approve_registration_only')=>[
 id,actor,action,h('a'),proofHash(id),projects,nonce,'operator_verified_test'
];
async function call(args,role='service_role') {
 await db.exec('set role '+role);
 try {
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  return (await db.query(p18,args)).rows[0].accepted;
 } finally {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role','',false)");
 }
}
before(async()=>{
 await db.exec('create role service_role nologin;create role authenticated nologin;create role anon nologin;');
 await db.exec('create table public.projects(id uuid primary key,owner_id uuid not null);');
 await db.exec(file('20261020235500_atlas_creative_worker_identity_p10.sql'));
 await db.exec(file('20261021080000_atlas_creative_worker_enrollment_staging_p13.sql'));
 await db.exec(file('20261021100000_atlas_creative_enrollment_review_p15.sql'));
 await db.exec(file('20261021120000_atlas_creative_review_owner_guard_p18.sql'));
 for(const [p,owner] of [[firstProject,operator],[secondProject,foreign]]) {
  await db.query('insert into public.projects(id,owner_id) values($1,$2)',[p,owner]);
 }
 for (const [id,projects] of [
  [first,[firstProject]], [second,[firstProject,secondProject]],
  [third,[secondProject]]
 ]) {
  await db.query('insert into public.atlas_creative_enrollment_staging '+
   '(enrollment_id,worker_id,requested_by,project_ids,challenge_sha256,'+
   'expires_at,state,key_id,public_key_spki_pem,public_key_sha256,'+
   'canonical_proof_sha256,proof_verified_at) '+
   "values($1,'HultgrenCreative01',$2,$3::uuid[],$4,clock_timestamp()+interval '2 minutes',"+
   "'pending_review','creativeKey001',$5,$6,$7,clock_timestamp())",
   [id,operator,projects,h(id===first?'c':id===second?'d':'e'),
    'K'.repeat(120),h('a'),proofHash(id)]);
 }
});
after(async()=>db.close());
test('P18 revokes old P15 service_role grant and does not allow browser invocation',async()=>{
 const r=(await db.query("select "+
   "has_function_privilege('service_role','public.atlas_creative_enrollment_record_review_p15(uuid,uuid,text,text,text,uuid[],text,text)','EXECUTE') as old_grant,"+
   "has_function_privilege('service_role','public.atlas_creative_enrollment_record_review_p18(uuid,uuid,text,text,text,uuid[],text,text)','EXECUTE') as new_grant,"+
   "has_function_privilege('authenticated','public.atlas_creative_enrollment_record_review_p18(uuid,uuid,text,text,text,uuid[],text,text)','EXECUTE') as user_grant")).rows[0];
 assert.deepEqual(r,{old_grant:false,new_grant:true,user_grant:false});
});
test('cannot review a foreign project, even when actor is a platform operator elsewhere',async()=>{
 assert.equal(await call(payload(third,operator,[secondProject],h('2'))),false);
 assert.equal(await call(payload(second,operator,[firstProject,secondProject],h('3'))),false);
 assert.equal((await db.query('select count(*)::int as n from public.atlas_creative_enrollment_review_decisions')).rows[0].n,0);
});
test('exact owner may record only one immutable decision for owned project',async()=>{
 assert.equal(await call(payload(first,operator,[firstProject],h('4'))),true);
 assert.equal(await call(payload(first,operator,[firstProject],h('4'))),false);
 assert.equal(await call(payload(first,operator,[firstProject],h('5'),'reject_registration')),false);
 assert.equal((await db.query('select count(*)::int as n from public.atlas_creative_enrollment_review_decisions')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from public.atlas_creative_worker_identities')).rows[0].n,0);
});
test('ownership change denies a stale actor at the moment of SQL decision',async()=>{
 await db.query('update public.projects set owner_id=$1 where id=$2',[foreign,firstProject]);
 try {
  assert.equal(await call(payload(second,operator,[firstProject,secondProject],h('6'))),false);
 } finally {
  await db.query('update public.projects set owner_id=$1 where id=$2',[operator,firstProject]);
 }
});
test('browser role cannot spoof service_role JWT setting',async()=>{
 await assert.rejects(call(payload(second,operator,[firstProject,secondProject],h('7')),'authenticated'),
  /permission denied/i);
});
