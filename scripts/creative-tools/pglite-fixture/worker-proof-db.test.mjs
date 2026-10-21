import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=readFileSync(resolve(import.meta.dirname,
 '../../../apps/web/supabase/migrations/20261020235500_atlas_creative_worker_identity_p10.sql'),'utf8');
const project='00000000-0000-4000-8000-000000000011';
const other='00000000-0000-4000-8000-000000000012';
const worker='HultgrenCreative01';
const sha=c=>c.repeat(64);
const rpc='select public.atlas_creative_consume_worker_proof_p10($1,$2,$3,$4,$5::uuid[]) as accepted';
const inputs=(counter,nonce,key='creativeKey001',projects=[project])=>[
 worker,key,counter,nonce,projects
];
async function consume(data,role='service_role',claimRole=role) {
 await db.exec('set role '+role);
 try {
  await db.query("select set_config('request.jwt.claim.role',$1,false)",[claimRole]);
  const r=await db.query(rpc,data);
  return r.rows[0].accepted;
 } finally {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role','',false)");
 }
}
before(async()=>{
 await db.exec('create role service_role nologin;create role authenticated nologin;create role anon nologin;');
 await db.exec(migration);
 await db.query('insert into public.atlas_creative_worker_identities '+
  '(worker_id,key_id,public_key_spki_pem,state,creative_claim_enabled,project_ids) '+
  'values($1,$2,$3,$4,$5,$6::uuid[])',
  [worker,'creativeKey001','K'.repeat(120),'active',true,[project]]);
});
after(async()=>db.close());
test('P10 creates private worker registry and no browser EXECUTE privilege',async()=>{
 const table=(await db.query("select relrowsecurity from pg_class where oid='public.atlas_creative_worker_identities'::regclass")).rows[0];
 assert.equal(table.relrowsecurity,true);
 const priv=(await db.query("select "+
   "has_table_privilege('service_role','public.atlas_creative_worker_identities','SELECT') as read, "+
   "has_table_privilege('service_role','public.atlas_creative_worker_identities','UPDATE') as write, "+
   "has_function_privilege('authenticated','public.atlas_creative_consume_worker_proof_p10(text,text,bigint,text,uuid[])','EXECUTE') as anonymous_call")).rows[0];
 assert.deepEqual(priv,{read:true,write:false,anonymous_call:false});
});
test('valid proof atomically advances worker counter',async()=>{
 assert.equal(await consume(inputs(1,sha('a'))),true);
 const r=(await db.query('select last_counter from public.atlas_creative_worker_identities where worker_id=$1',[worker])).rows[0];
 assert.equal(Number(r.last_counter),1);
});
test('nonce replay and stagnant counter both fail',async()=>{
 assert.equal(await consume(inputs(2,sha('a'))),false);
 assert.equal(await consume(inputs(1,sha('b'))),false);
 assert.equal(await consume(inputs(2,sha('b'))),true);
 const rows=await db.query('select count(*)::int as count from public.atlas_creative_worker_nonces');
 assert.equal(rows.rows[0].count,2);
});
test('revoked key, wrong key and changed project scope fail closed',async()=>{
 assert.equal(await consume(inputs(3,sha('c'),'OtherKey002')),false);
 assert.equal(await consume(inputs(3,sha('c'),'creativeKey001',[other])),false);
 await db.query("update public.atlas_creative_worker_identities set state='revoked' where worker_id=$1",[worker]);
 try { assert.equal(await consume(inputs(3,sha('c'))),false); }
 finally {await db.query("update public.atlas_creative_worker_identities set state='active' where worker_id=$1",[worker]);}
});
test('null proof fields and fake browser role cannot consume',async()=>{
 assert.equal(await consume(inputs(3,null)),false);
 assert.equal(await consume(inputs(3,sha('c'), 'creativeKey001', [])),false);
 await assert.rejects(consume(inputs(3,sha('c')),'authenticated','service_role'),/permission denied/i);
});
test('counter cannot be recycled after key rotation',async()=>{
 assert.equal(await consume(inputs(3,sha('c'))),true);
 await db.query("update public.atlas_creative_worker_identities set key_id='rotatedKey002' where worker_id=$1",[worker]);
 assert.equal(await consume(inputs(4,sha('d'),'creativeKey001')),false);
 assert.equal(await consume(inputs(3,sha('d'),'rotatedKey002')),false);
 assert.equal(await consume(inputs(4,sha('d'),'rotatedKey002')),true);
});
