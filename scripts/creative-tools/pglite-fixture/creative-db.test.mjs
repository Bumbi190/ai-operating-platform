import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const db = new PGlite();
const migration = readFileSync(resolve(import.meta.dirname,
  '../../../apps/web/supabase/migrations/20261020230500_atlas_creative_queue_staging_p7.sql'), 'utf8');
const project='00000000-0000-4000-8000-000000000011';
const foreignProject='00000000-0000-4000-8000-000000000012';
const image='00000000-0000-4000-8000-000000000021';
const video='00000000-0000-4000-8000-000000000022';
const otherImage='00000000-0000-4000-8000-000000000023';
const worker='HultgrenCreative01';
const hash=c=>c.repeat(64);
const ticket=hash('a'), approval=hash('b'), nonce=hash('c'), imgHash=hash('d');
const claimSql='select * from public.atlas_creative_claim_staging_p7($1,$2,$3,$4,$5)';
const params=(name,w=worker,t=ticket,n=nonce,a=approval)=>[name,w,t,n,a];

before(async()=>{
  await db.exec(`
    create role service_role nologin;
    create role authenticated nologin;
    create role anon nologin;
    create table public.projects(id uuid primary key);
    create table public.assets(
      id uuid primary key, project_id uuid not null references public.projects(id),
      checksum_sha256 text not null, kind text not null, status text not null
    );
  `);
  await db.exec(migration);
  await db.query('insert into public.projects(id) values($1),($2)',[project,foreignProject]);
  for(const [id,p,kind,sha] of [
    [image,project,'image',imgHash],
    [video,project,'video',hash('e')],
    [otherImage,foreignProject,'image',hash('f')],
  ]) await db.query(
    'insert into public.assets(id,project_id,kind,checksum_sha256,status) values($1,$2,$3,$4,\'active\')',
    [id,p,kind,sha]);
});
after(async()=>{ await db.close(); });

async function stage(name,opts={}) {
  const row={
    workId:name,projectId:project,sourceId:image,sourceHash:imgHash,
    workerId:worker,operation:'photocraft.convert-webp',
    issued:new Date(Date.now()-30_000).toISOString(),
    expires:new Date(Date.now()+120_000).toISOString(),
    ...opts,
  };
  // All identifiers are fixed test fixtures. No real production data.
  await db.query(`insert into public.atlas_creative_queue_staging
    (work_id,project_id,source_asset_id,source_sha256,worker_id,operation_id,
     binary_sha256,approval_receipt_sha256,signed_ticket_sha256,claim_nonce_sha256,
     output_max_bytes,ticket_issued_at,ticket_expires_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[
      row.workId,row.projectId,row.sourceId,row.sourceHash,row.workerId,
      row.operation,hash('9'),hash('b'),row.ticketHash??hash('a'),
      row.nonceHash??hash('c'),500000,row.issued,row.expires,
    ]);
}
async function sqlClaim(values,role='service_role',jwt=role) {
  await db.exec('set role '+role);
  await db.query('select set_config($1,$2,false)', ['request.jwt.claim.role',jwt]);
  try { return await db.query(claimSql,values); }
  finally {
    await db.exec('reset role');
    await db.query('select set_config($1,$2,false)', ['request.jwt.claim.role','']);
  }
}
test('migration really creates a private table and claim function in PostgreSQL',async()=>{
 const {rows}=await db.query(`select c.relrowsecurity as rls,
  c.relforcerowsecurity as forced from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='atlas_creative_queue_staging'`);
 assert.equal(rows.length,1);
 assert.equal(rows[0].rls,true);
 const r=await db.query(`select has_function_privilege('authenticated',
  'public.atlas_creative_claim_staging_p7(text,text,text,text,text)','EXECUTE') as allowed`);
 assert.equal(r.rows[0].allowed,false);
});
test('valid claim is atomic one-use and only preview-authorized',async()=>{
 await stage('workGood101');
 const response=await sqlClaim(params('workGood101'));
 assert.equal(response.rows.length,1);
 assert.equal(response.rows[0].claimed_work_id,'workGood101');
 assert.equal(response.rows[0].claimed_fence,1);
 assert.equal(response.rows[0].claimed_state,'claimed_preview_only');
 await assert.rejects(sqlClaim(params('workGood101')), /creative job unavailable/);
 const result=await db.query('select status,claim_fence from public.atlas_creative_queue_staging where work_id=$1',['workGood101']);
 assert.equal(result.rows[0].claim_fence,1);
 assert.equal(result.rows[0].status,'claimed_preview_only');
});
test('authenticated and anon roles cannot invoke the definer function even with spoofed JWT role',async()=>{
 await stage('workRole102',{ticketHash:hash('1'),nonceHash:hash('2')});
 for(const role of ['authenticated','anon']) {
  await assert.rejects(sqlClaim(
    params('workRole102',worker,hash('1'),hash('2')),role,'service_role'),
    /permission denied/);
 }
});
test('service role without a verified JWT claim is still rejected',async()=>{
 await stage('workJwt103',{ticketHash:hash('3'),nonceHash:hash('4')});
 await assert.rejects(sqlClaim(params('workJwt103',worker,hash('3'),hash('4')),
   'service_role','authenticated'),/creative queue caller rejected/);
});
test('wrong worker, wrong ticket or NULL approval digest cannot claim',async()=>{
 await stage('workScope104',{ticketHash:hash('5'),nonceHash:hash('6')});
 await assert.rejects(sqlClaim(params('workScope104','OtherCreative02',hash('5'),hash('6'))), /creative job unavailable/);
 await assert.rejects(sqlClaim(params('workScope104',worker,hash('7'),hash('6'))), /creative job unavailable/);
 await assert.rejects(sqlClaim(params('workScope104',worker,hash('5'),hash('6'),null)), /creative claim invalid/);
});
test('expired or future-issued work never claims',async()=>{
 await stage('workExpired105',{ticketHash:hash('7'),nonceHash:hash('8'),
  issued:new Date(Date.now()-300000).toISOString(),expires:new Date(Date.now()-60000).toISOString()});
 await assert.rejects(sqlClaim(params('workExpired105',worker,hash('7'),hash('8'))), /creative job unavailable/);
 await stage('workFuture106',{ticketHash:hash('8'),nonceHash:hash('9'),
  issued:new Date(Date.now()+60000).toISOString(),expires:new Date(Date.now()+120000).toISOString()});
 await assert.rejects(sqlClaim(params('workFuture106',worker,hash('8'),hash('9'))), /creative job unavailable/);
});
test('cross-project assets and mismatched asset hash cannot claim',async()=>{
 await stage('workCross107',{sourceId:otherImage,sourceHash:hash('f'),
  ticketHash:hash('c'),nonceHash:hash('d')});
 await assert.rejects(sqlClaim(params('workCross107',worker,hash('c'),hash('d'))), /creative source invalid/);
 await stage('workHash108',{sourceHash:hash('f'),ticketHash:hash('d'),nonceHash:hash('e')});
 await assert.rejects(sqlClaim(params('workHash108',worker,hash('d'),hash('e'))), /creative source invalid/);
});
test('PhotoCraft cannot claim a video, FilmCraft cannot claim an image',async()=>{
 await stage('workVideo109',{sourceId:video,sourceHash:hash('e'),
  ticketHash:hash('e'),nonceHash:hash('f')});
 await assert.rejects(sqlClaim(params('workVideo109',worker,hash('e'),hash('f'))), /creative source invalid/);
 await stage('workImage110',{operation:'filmcraft.demo-export-mp4',
  ticketHash:hash('f'),nonceHash:hash('0')});
 await assert.rejects(sqlClaim(params('workImage110',worker,hash('f'),hash('0'))), /creative source invalid/);
});

test('table privilege grants remain least-privilege in real PostgreSQL',async()=>{
 const q=await db.query(`select
    has_table_privilege('service_role','public.atlas_creative_queue_staging','SELECT') as service_select,
    has_table_privilege('service_role','public.atlas_creative_queue_staging','INSERT') as service_insert,
    has_table_privilege('service_role','public.atlas_creative_queue_staging','UPDATE') as service_update,
    has_table_privilege('authenticated','public.atlas_creative_queue_staging','SELECT') as user_select,
    has_table_privilege('anon','public.atlas_creative_queue_staging','INSERT') as anon_insert`);
 const r=q.rows[0];
 assert.equal(r.service_select,true);
 assert.equal(r.service_insert,true);
 assert.equal(r.service_update,false);
 assert.equal(r.user_select,false);
 assert.equal(r.anon_insert,false);
});
test('database prevents repeated approval nonce or signed ticket hash',async()=>{
 await stage('workUnique111',{ticketHash:hash('0'),nonceHash:hash('a')});
 await assert.rejects(stage('workDupTicket112',{ticketHash:hash('0'),nonceHash:hash('b')}),/duplicate key/);
 await assert.rejects(stage('workDupNonce113',{ticketHash:hash('6'),nonceHash:hash('a')}),/duplicate key/);
});
test('archive of an approved source before claim makes the job unclaimable',async()=>{
 await stage('workArchived114',{ticketHash:hash('2'),nonceHash:hash('7')});
 await db.query("update public.assets set status='archived' where id=$1",[image]);
 try {
   await assert.rejects(sqlClaim(params('workArchived114',worker,hash('2'),hash('7'))),/creative source invalid/);
 } finally {
   await db.query("update public.assets set status='active' where id=$1",[image]);
 }
});
