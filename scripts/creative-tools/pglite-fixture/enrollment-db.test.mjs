import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const sql=readFileSync(resolve(import.meta.dirname,
 '../../../apps/web/supabase/migrations/20261021080000_atlas_creative_worker_enrollment_staging_p13.sql'),'utf8');
const operatorId='00000000-0000-4000-8000-000000000001';
const projectId='00000000-0000-4000-8000-000000000011';
const worker='HultgrenCreative01';
const key='creativeKey001';
const digest=c=>c.repeat(64);
const PEM='K'.repeat(120);
const expires=()=>new Date(Date.now()+110000).toISOString();
const issueParams=(id,hash=digest('a'))=>[
 id,worker,operatorId,[projectId],hash,expires()
];
async function rpc(name,args) {
 await db.exec('set role service_role');
 try{
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
  const r=await db.query('select public.'+name+'('+placeholders+') as ok',args);
  return r.rows[0].ok;
 }finally{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role','',false)");
 }
}
const issue='atlas_creative_enrollment_issue_p13';
const stage='atlas_creative_enrollment_stage_p13';
async function create(id,hash=digest('a')){
 const args=issueParams(id,hash);
 assert.equal(await rpc(issue,args),true);
 const {rows}=await db.query(
  'select * from public.atlas_creative_enrollment_staging where enrollment_id=$1',[id]);
 return rows[0];
}
function stageArgs(row,overrides={}){
 return [
  row.enrollment_id,row.worker_id,row.requested_by,row.project_ids,
  row.challenge_sha256,row.expires_at,key,PEM,digest('b'),digest('c')
 ].map((v,i)=>Object.prototype.hasOwnProperty.call(overrides,i)?overrides[i]:v);
}
before(async()=>{
 await db.exec('create role service_role nologin;create role anon nologin;create role authenticated nologin;');
 const p10=readFileSync(resolve(import.meta.dirname,
  '../../../apps/web/supabase/migrations/20261020235500_atlas_creative_worker_identity_p10.sql'),'utf8');
 await db.exec(p10);
 await db.exec(sql);
});
after(async()=>db.close());

test('migration creates private staging; no worker enabled',async()=>{
 const {rows}=await db.query("select relrowsecurity from pg_class where oid='public.atlas_creative_enrollment_staging'::regclass");
 assert.equal(rows[0].relrowsecurity,true);
 const priv=await db.query("select "+
  "has_function_privilege('anon','public.atlas_creative_enrollment_issue_p13(uuid,text,uuid,uuid[],text,timestamptz)','EXECUTE') as anon_issue,"+
  "has_function_privilege('authenticated','public.atlas_creative_enrollment_stage_p13(uuid,text,uuid,uuid[],text,timestamptz,text,text,text,text)','EXECUTE') as user_stage,"+
  "has_table_privilege('service_role','public.atlas_creative_enrollment_staging','UPDATE') as service_update");
 assert.deepEqual(priv.rows[0],{anon_issue:false,user_stage:false,service_update:false});
});
test('operator-issued challenge is created only as issued',async()=>{
 const row=await create('00000000-0000-4000-8000-000000000020');
 assert.equal(row.state,'issued');
 assert.equal(row.key_id,null);
 assert.equal(row.proof_verified_at,null);
});
test('valid verified proof only becomes pending_review once',async()=>{
 const {rows}=await db.query("select * from public.atlas_creative_enrollment_staging where enrollment_id='00000000-0000-4000-8000-000000000020'");
 const args=stageArgs(rows[0]);
 assert.equal(await rpc(stage,args),true);
 assert.equal(await rpc(stage,args),false);
 const next=(await db.query("select state,key_id,public_key_sha256 from public.atlas_creative_enrollment_staging where enrollment_id='00000000-0000-4000-8000-000000000020'")).rows[0];
 assert.equal(next.state,'pending_review');
 assert.equal(next.key_id,key);
 assert.equal(next.public_key_sha256,digest('b'));
});
test('same worker cannot hold two issued challenges simultaneously',async()=>{
 const a='00000000-0000-4000-8000-000000000021';
 await create(a,digest('d'));
 assert.equal(await rpc(issue,issueParams('00000000-0000-4000-8000-000000000022',digest('e'))),false);
});
test('wrong operator, challenge or scope cannot stage',async()=>{
 const row=(await db.query("select * from public.atlas_creative_enrollment_staging where enrollment_id='00000000-0000-4000-8000-000000000021'")).rows[0];
 for(const changes of [
  {2:'00000000-0000-4000-8000-000000000002'},
  {4:digest('f')},
  {3:['00000000-0000-4000-8000-000000000012']}
 ]) assert.equal(await rpc(stage,stageArgs(row,changes)),false);
});
test('stage refuses incomplete SHA or proof and never creates an active identity',async()=>{
 const row=(await db.query("select * from public.atlas_creative_enrollment_staging where enrollment_id='00000000-0000-4000-8000-000000000021'")).rows[0];
 assert.equal(await rpc(stage,stageArgs(row,{9:null})),false);
 assert.equal(await rpc(stage,stageArgs(row,{7:'short'})),false);
 const count=(await db.query("select count(*)::int as n from public.atlas_creative_worker_identities")).rows[0].n;
 assert.equal(count,0);
});
test('browser role with spoofed JWT claim cannot stage',async()=>{
 const row=(await db.query("select * from public.atlas_creative_enrollment_staging where enrollment_id='00000000-0000-4000-8000-000000000021'")).rows[0];
 await db.exec('set role authenticated');
 try{
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  await assert.rejects(db.query(
   "select public.atlas_creative_enrollment_stage_p13($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",stageArgs(row)),
   /permission denied/i);
 }finally{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role','',false)");
 }
});
