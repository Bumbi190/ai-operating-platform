import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

// Execute the REAL inspector body against a disposable schema projection.
// This is not full Supabase/RLS or live provider verification.
let f:ReturnType<typeof initializeCalendarDb>;
const post=randomUUID(),revision=randomUUID(),publication=randomUUID(),binding=randomUUID();
const q=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const j=(v:unknown)=>q(JSON.stringify(v))+'::jsonb';
const read=(name:string)=>readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8');
const manualStepSql=()=>{
 const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20261018071209_social_schedule_batches.sql'),'utf8');
 const start=sql.indexOf('create or replace function public.social_publication_step(');
 if(start<0)throw Error('Canonical manual step missing');
 const end=sql.indexOf('end $fn$;',start);
 if(end<0)throw Error('Canonical manual step terminator missing');
 return sql.slice(start,end+'end $fn$;'.length);
};
const source=()=>f.sql('select revision from calendar_source_revision_probe where project_id='+q(PROJECT_A));
const count=()=>f.sql('select count(*) from social_publication_reconciliation_proofs');
const candidate=()=>({id:'12345_67890',providerId:'12345_67890',accountId:'12345',
 createdAt:new Date().toISOString(),text:'Reviewed text',
 permalink:'https://www.facebook.com/12345/posts/67890',photoId:'888',
 imageUrl:'https://scontent.fna.fbcdn.net/fixture.jpg',candidateHash:'b'.repeat(64)});
function inspect(candidates:unknown[]){
 return JSON.parse(f.sql('set local role service_role;select public.social_publication_reconciliation_inspect('+
 j({userId:USER_A,allowedProjectIds:[PROJECT_A]})+','+
 j({projectId:PROJECT_A,postId:post,publicationId:publication,candidates})+');'));
}
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const name of ['source-revision-probe.sql','social-review-source-fixture.sql',
 'social-worker-step-recovery-fixture.sql','social-reconcile-source-fixture.sql']){
  f.sql(read(name));
 }
 f.sql(`alter table social_content_revisions add column draft jsonb,add column media jsonb,
 add column binding jsonb,add column sequence integer,add column plan_revision_id uuid,
 add column created_at timestamptz default now();
 create table social_account_bindings(binding_id uuid,project_id uuid,platform text,
 external_account_id text,superseded_at timestamptz,blocked_at timestamptz);
 grant select on social_account_bindings to service_role;`);
 f.sql(read('direct-write-gate-probe.sql'));
 f.sql(read('direct-write-gate-proof-trigger-probe.sql'));
 f.sql(read('direct-write-gate-proof-inspect-hardened-candidate.sql'));
 f.sql(read('direct-write-gate-proof-permission-candidate.sql'));
 // Load the exact manual step function into the reduced SQL fixture. Only
 // its completion branch runs here; provider and application code are absent.
 f.sql(manualStepSql()+
  'revoke all on function public.social_publication_step(jsonb,jsonb) from public,anon,authenticated;'+
  'grant execute on function public.social_publication_step(jsonb,jsonb) to service_role;');
},60000);
beforeEach(()=>{
 // Owner-only seeding in the uniquely named disposable database.
 f.sql('alter table social_publications disable trigger user;'+
 'alter table social_publication_reconciliation_proofs disable trigger user;'+
 'delete from social_publication_reconciliation_proofs;delete from social_publications;'+
 'delete from social_content_revisions;delete from social_account_bindings;'+
 'delete from calendar_source_revision_probe;'+
 'insert into calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
 q(USER_A)+','+q(PROJECT_A)+',1);'+
 'insert into social_content_revisions(id,post_id,project_id,sha256,draft,media,binding,sequence) values('+
 [revision,post,PROJECT_A,'a'.repeat(64)].map(q).join(',')+','+
 j({format:'image',text:'Reviewed text'})+','+j([{sha256:'c'.repeat(64)}])+',\'{}\',1);'+
 'insert into social_account_bindings(binding_id,project_id,platform,external_account_id) values('+
 [binding,PROJECT_A,'facebook','12345'].map(q).join(',')+');'+
 'insert into social_publications(id,project_id,post_id,revision_id,sha256,binding_id,channel,account_id,state) values('+
 [publication,PROJECT_A,post,revision,'a'.repeat(64),binding,'facebook','12345','uncertain'].map(q).join(',')+');'+
 'alter table social_publications enable trigger user;'+
 'alter table social_publication_reconciliation_proofs enable trigger user;');
},60000);
afterAll(()=>f?.close(),60000);

describe('real inspector candidate validation with signed source gate',()=>{
 it('denies direct service-role proof INSERT while the inspector retains its writer path',()=>{
  expect(()=>f.sql('set local role service_role; insert into public.social_publication_reconciliation_proofs default values'))
   .toThrow(/permission denied/i);
  expect(count()).toBe('0');expect(source()).toBe('1');
  expect(inspect([candidate()]).proofs).toHaveLength(1);
  expect(source()).toBe('2');
 });
 it('shows that the source gate and proof INSERT revoke do not prevent direct publication UPDATE',()=>{
  // The source token enforces lock order and revision consistency. The shared
  // service role can mint it, then still write a forged published row in this
  // reduced schema. The original migration's receipt constraint is tested separately.
  f.sql('set local role service_role;select public.calendar_source_gate_begin_probe('+q(PROJECT_A)+');'+
   'update public.social_publications set state='+q('published')+
   ',provider_id='+q('12345_99999')+',permalink='+q('https://www.facebook.com/12345/posts/99999')+
   ',confirmation='+q('provider_id')+',version=version+1 where id='+q(publication));
  expect(f.sql('select state||\'|\'||provider_id from social_publications where id='+q(publication)))
   .toBe('published|12345_99999');
  expect(count()).toBe('0');expect(source()).toBe('2');
 });
 it('shows manual step accepts a fabricated provider receipt under the shared role',()=>{
  // Fixture seeding represents an already claimed provider write. No Meta
  // client exists in this test. The canonical SQL completion branch accepts
  // only the caller's providerId and version, even after proof INSERT revoke.
  f.sql('alter table social_publications disable trigger user;'+
   'update social_publications set state='+q('publishing')+' where id='+q(publication)+';'+
   'alter table social_publications enable trigger user;');
  const input={projectId:PROJECT_A,postId:post,publicationId:publication,
   expectedVersion:1,action:'complete',providerId:'12345_99999',
   permalink:'https://www.facebook.com/12345/posts/99999'};
  const result=JSON.parse(f.sql('set local role service_role;'+
   'select public.calendar_source_gate_begin_probe('+q(PROJECT_A)+');'+
   'select public.social_publication_step('+j({userId:USER_A,allowedProjectIds:[PROJECT_A]})+','+j(input)+');').split('\n').pop()!);
  expect(result.changed).toBe(true);
  expect(result.record.state).toBe('published');
  expect(result.record.providerId).toBe('12345_99999');
  expect(count()).toBe('0');
 });
 it('isolates a manual publisher role and rolls the candidate back',()=>{
  f.sql('alter table social_publications disable trigger user;'+
   'update social_publications set state='+q('publishing')+' where id='+q(publication)+';'+
   'alter table social_publications enable trigger user;');
  const input={projectId:PROJECT_A,postId:post,publicationId:publication,
   expectedVersion:1,action:'complete',providerId:'12345_99999'};
  const denied='do $probe$ begin '+
   'perform public.social_publication_step('+j({userId:USER_A,allowedProjectIds:[PROJECT_A]})+','+j(input)+');'+
   "raise exception 'UNEXPECTED_STEP_ALLOWED';"+
   'exception when insufficient_privilege then null; end $probe$;';
  const out=f.sql('savepoint role_probe;'+
   read('direct-write-gate-manual-publisher-role-candidate.sql')+
   "select has_table_privilege('service_role','public.social_publications','INSERT')::text||"+
   "has_table_privilege('service_role','public.social_publications','UPDATE')::text||"+
   "has_function_privilege('service_role','public.social_publication_step(jsonb,jsonb)','EXECUTE')::text;"+
   'set local role service_role;'+denied+
   'set local role social_publisher_fixture;'+
   'select public.calendar_source_gate_begin_probe('+q(PROJECT_A)+');'+
   'select public.social_publication_step('+j({userId:USER_A,allowedProjectIds:[PROJECT_A]})+','+j(input)+');'+
   'rollback to savepoint role_probe;').split('\n');
  expect(out[0]).toBe('falsefalsefalse');
  const receipt=JSON.parse(out.at(-1)!);
  expect(receipt.record.state).toBe('published');
  expect(receipt.record.providerId).toBe('12345_99999');
  expect(f.sql('select state from social_publications where id='+q(publication))).toBe('publishing');
  expect(source()).toBe('1');
  expect(f.sql("select to_regrole('social_publisher_fixture') is null")).toBe('t');
 });
 it('documents that a shaped but unverified provider candidate is accepted',()=>{
  // No provider reader is called by this SQL fixture. This input is invented by
  // the caller and demonstrates the boundary the database cannot authenticate.
  const fabricated={...candidate(),providerId:'12345_99999',
   permalink:'https://www.facebook.com/12345/posts/99999',
   candidateHash:'e'.repeat(64)};
  const proof=inspect([fabricated]).proofs[0];
  expect(proof.providerId).toBe(fabricated.providerId);
  expect(proof.candidateHash).toBe(fabricated.candidateHash);
  expect(count()).toBe('1');
  expect(source()).toBe('2');
 });
 it('inserts a valid candidate once and keeps replay source-stable',()=>{
  const c=candidate();
  expect(inspect([c]).proofs).toHaveLength(1);
  expect(source()).toBe('2');
  expect(inspect([c]).proofs).toHaveLength(1);
  expect(source()).toBe('2');
 });
 it.each(['providerId','createdAt'])('rejects JSON null in %s before inserting any proof',(field)=>{
  expect(()=>inspect([{...candidate(),[field]:null}])).toThrow(/SOCIAL_PUBLICATION_INVALID_BODY/);
  expect(count()).toBe('0');expect(source()).toBe('1');
 });
 it('rolls back an earlier valid candidate when a later candidate has a null provider ID',()=>{
  expect(()=>inspect([candidate(),{...candidate(),providerId:null,candidateHash:'d'.repeat(64)}]))
   .toThrow(/SOCIAL_PUBLICATION_INVALID_BODY/);
  expect(count()).toBe('0');expect(source()).toBe('1');
 });
 it('refuses a blocked account without inserting or bumping',()=>{
  f.sql('update social_account_bindings set blocked_at=now()');
  expect(()=>inspect([candidate()])).toThrow(/SOCIAL_PUBLICATION_REVIEW_REQUIRED/);
  expect(count()).toBe('0');expect(source()).toBe('1');
 });
});

describe('real inspector existing provider and media guards',()=>{
 it.each([
  ['accountId','99999'],['providerId','12345_bad'],['text','Unreviewed text'],
  ['createdAt','2000-01-01T00:00:00.000Z'],['photoId','invalid'],
  ['permalink','https://example.com/post'],['imageUrl','https://example.com/photo'],
  ['candidateHash','invalid'],['providerId',12345],['createdAt',true]
 ])('rejects invalid %s (%s) without a source change',(field,value)=>{
  expect(()=>inspect([{...candidate(),[field]:value}])).toThrow(/SOCIAL_PUBLICATION_INVALID_BODY/);
  expect(count()).toBe('0');expect(source()).toBe('1');
 });
 it('refuses a superseded account binding',()=>{
  f.sql('update social_account_bindings set superseded_at=now()');
  expect(()=>inspect([candidate()])).toThrow(/SOCIAL_PUBLICATION_REVIEW_REQUIRED/);
  expect(count()).toBe('0');expect(source()).toBe('1');
 });
 it('refuses a revision with multiple media assets',()=>{
  f.sql('update social_content_revisions set media='+j([{sha256:'c'.repeat(64)},{sha256:'d'.repeat(64)}]));
  expect(()=>inspect([candidate()])).toThrow(/SOCIAL_PUBLICATION_REVIEW_REQUIRED/);
  expect(count()).toBe('0');expect(source()).toBe('1');
 });
 it('retains the exact source-first inspector apart from the two scalar type checks',()=>{
  const guard="   or jsonb_typeof(v->'providerId') is distinct from 'string' or jsonb_typeof(v->'createdAt') is distinct from 'string'\n";
  const normalize=(sql:string)=>sql.replaceAll('\r\n','\n').split('\n').filter(line=>!line.startsWith('-- REVIEW CANDIDATE ONLY:')).join('\n');
  expect(normalize(read('direct-write-gate-proof-inspect-hardened-candidate.sql')).replace(guard,''))
   .toBe(normalize(read('direct-write-gate-proof-inspect-candidate.sql')));
 });
});
