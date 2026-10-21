import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const pubA='50000000-0000-4000-8000-000000000001';
const pubB='50000000-0000-4000-8000-000000000002';
const jobA='60000000-0000-4000-8000-000000000001';
const jobB='60000000-0000-4000-8000-000000000002';
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const asService=(sql:string)=>f.sql('set local role service_role;'+sql);
const begin=(project=PROJECT_A)=>'select public.calendar_source_gate_begin_probe('+q(project)+');';
const rev=(owner=USER_A,project=PROJECT_A)=>f.sql(
 'select revision from public.calendar_source_revision_probe where owner_user_id='+
 q(owner)+' and project_id='+q(project));
const pub=(id=pubA)=>f.sql('select state from public.social_publications where id='+q(id));
const job=(id=jobA)=>f.sql('select state from public.social_schedule_jobs where id='+q(id));
const publicationUpdate=(id=pubA,state='published')=>
 'update public.social_publications set state='+q(state)+' where id='+q(id)+';';
const jobUpdate=(id=jobA,state='claimed')=>
 'update public.social_schedule_jobs set state='+q(state)+' where id='+q(id)+';';

beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql('create table public.social_publications ('+
  'id uuid primary key,project_id uuid not null references public.projects(id),'+
  "state text not null default 'requested',version integer not null default 1);"+
  'create table public.social_schedule_jobs ('+
  'id uuid primary key,project_id uuid not null references public.projects(id),'+
  "state text not null default 'queued',version integer not null default 1);"+
  'revoke all on public.social_publications,public.social_schedule_jobs '+
  'from public,anon,authenticated,service_role;'+
  'grant select,insert,update on public.social_publications,public.social_schedule_jobs to service_role;');
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/direct-write-gate-probe.sql'),'utf8'));
},60000);
beforeEach(()=>{
 // Disposable fixture setup is done by PostgreSQL owner only. It disables
 // the TEST triggers while seeding, then reenables both BEFORE and AFTER.
 // service_role has no TRUNCATE, ALTER or trigger-control privilege.
 const tables=['social_publications','social_schedule_jobs'];
 const toggles=(mode:'disable'|'enable')=>tables.map(t=>
  'alter table public.'+t+' '+mode+' trigger user;').join('');
 f.sql(toggles('disable')+
  'truncate public.social_publications,public.social_schedule_jobs;'+
  'delete from public.calendar_source_revision_probe;'+
  'insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [q(USER_A),q(PROJECT_A),'1'].join(',')+'),('+
  [q(USER_B),q(PROJECT_B),'7'].join(',')+');'+
  'insert into public.social_publications(id,project_id,state) values('+
  [q(pubA),q(PROJECT_A),q('requested')].join(',')+'),('+
  [q(pubB),q(PROJECT_B),q('requested')].join(',')+');'+
  'insert into public.social_schedule_jobs(id,project_id,state) values('+
  [q(jobA),q(PROJECT_A),q('queued')].join(',')+'),('+
  [q(jobB),q(PROJECT_B),q('queued')].join(',')+');'+toggles('enable'));
},60000);
afterAll(()=>f?.close(),60000);

describe('signed transaction-scoped database gate for direct social DML',()=>{
 it('preserves service_role DML access but REJECTS unguarded direct updates',()=>{
  expect(f.sql("select has_table_privilege('service_role','public.social_publications','UPDATE')")).toBe('t');
  expect(f.sql("select has_table_privilege('service_role','public.social_schedule_jobs','UPDATE')")).toBe('t');
  expect(f.sql("select has_table_privilege('service_role','public.social_publications','TRUNCATE')")).toBe('f');
  expect(()=>asService(publicationUpdate())).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(()=>asService(jobUpdate())).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(pub()).toBe('requested');expect(job()).toBe('queued');expect(rev()).toBe('1');
 });
 it('locks the source before writing and increments its version automatically',()=>{
  expect(asService(begin()+publicationUpdate())).toContain('1');
  expect(pub()).toBe('published');expect(rev()).toBe('2');
  expect(asService(begin()+jobUpdate())).toContain('2');
  expect(job()).toBe('claimed');expect(rev()).toBe('3');
 });
 it('rejects a forged token and hides the private signing secret',()=>{
  expect(()=>asService('select key from calendar_gate_private_probe.secret;'))
   .toThrow(/permission denied/);
  expect(()=>asService("select set_config('omnira.calendar_gate_probe_v1','deadbeef',true);"+
    publicationUpdate())).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(pub()).toBe('requested');expect(rev()).toBe('1');
 });
 it('does not let a token for another project authorize cross-tenant writes',()=>{
  expect(()=>asService(begin(PROJECT_B)+publicationUpdate(pubA))).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(pub()).toBe('requested');
  expect(rev()).toBe('1');expect(rev(USER_B,PROJECT_B)).toBe('7');
 });
 it('does not permit signed token replay in a later transaction',()=>{
  const marker=asService(begin()+"select current_setting('omnira.calendar_gate_probe_v1');")
   .split(/\r?\n/).find(s=>/^[a-f0-9]{64}$/.test(s));
  expect(marker).toMatch(/^[a-f0-9]{64}$/);
  expect(()=>asService("select set_config('omnira.calendar_gate_probe_v1',"+q(marker!)+",true);"+
   publicationUpdate())).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(rev()).toBe('1');expect(pub()).toBe('requested');
 });
 it('avoids a bump on a row-level UPDATE which changes no data',()=>{
  asService(begin()+publicationUpdate(pubA,'requested'));
  expect(rev()).toBe('1');
  asService(begin()+publicationUpdate(pubA,'published'));
  expect(rev()).toBe('2');
  asService(begin()+publicationUpdate(pubA,'published'));
  expect(rev()).toBe('2');
 });
 it('isolates revisions between projects with different owners',()=>{
  asService(begin(PROJECT_B)+publicationUpdate(pubB));
  expect(pub(pubB)).toBe('published');
  expect(pub(pubA)).toBe('requested');
  expect(rev()).toBe('1');expect(rev(USER_B,PROJECT_B)).toBe('8');
 });
 it('rejects an INSERT with no source lock; guarded INSERT bumps revision',()=>{
  const id=randomUUID();
  const insert='insert into public.social_publications(id,project_id,state) values('+
    q(id)+','+q(PROJECT_A)+','+q('requested')+');';
  expect(()=>asService(insert)).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  asService(begin()+insert);
  expect(f.sql('select count(*) from public.social_publications where id='+q(id))).toBe('1');
  expect(rev()).toBe('2');
 });
 it('covers both social tables, with one version increment per changed row',()=>{
  asService(begin()+publicationUpdate()+jobUpdate());
  expect(pub()).toBe('published');expect(job()).toBe('claimed');
  expect(rev()).toBe('3');
 });
 it('rolls back both rows and the revision when a late SQL statement fails',()=>{
  expect(()=>asService(begin()+publicationUpdate()+jobUpdate()+'select 1/0;')).toThrow();
  expect(pub()).toBe('requested');expect(job()).toBe('queued');expect(rev()).toBe('1');
 });
 it('rejects missing source revision before any privileged write',()=>{
  f.sql('delete from public.calendar_source_revision_probe where project_id='+q(PROJECT_A));
  expect(()=>asService(begin()+publicationUpdate())).toThrow(/MISSING_SOURCE_REVISION/);
  expect(()=>asService(publicationUpdate())).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(pub()).toBe('requested');
 });
 it('authenticated end users cannot mint a write token or access the secret',()=>{
  expect(()=>f.sql(begin(),USER_A)).toThrow(/permission denied/);
  expect(()=>f.sql('select key from calendar_gate_private_probe.secret',USER_A))
   .toThrow(/permission denied/);
 });
});
